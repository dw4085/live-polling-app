// Class hub kit for browser-only apps (no server of their own, e.g. Vite calculators).
// Copy into the app (e.g. src/lib/hub.ts). No dependencies. Call initHub() once at startup.
//
// Build-time config (Vite): VITE_HUB_URL (e.g. https://preview.cbs-tech-strategy.com) and
// VITE_HUB_APP_SLUG. The app must be served under the hub's cookie domain
// (e.g. twitch.preview.cbs-tech-strategy.com) so the browser sends the hub its session cookie.
//
// Reports are held in this browser (localStorage) until the hub has them: they are resent on the
// next report, on the student's next visit, and when the page is hidden. Each carries an event_key,
// so the hub records it once however often it is sent.

export type HubRole = 'admin' | 'ta' | 'student' | 'guest';

export interface HubUser {
  id: string;
  email: string;
  name: string;
  role: HubRole;
  section: string | null;
  term: string;
  scope: string[] | null;
}

export interface HubEvent {
  type: string;            // e.g. run.completed
  title: string;           // one line a student would recognise
  snapshot?: unknown;      // their work at that moment (JSON, ≤ 64 KB)
  runId?: string;          // groups events from one attempt (defaults to this page visit)
  link?: string;           // https link back to this work
}

interface Config {
  hubUrl: string;
  appSlug: string;
}

let cfg: Config | null = null;
const visitId = crypto.randomUUID();
const BATCH = 50;

function config(): Config {
  if (!cfg) throw new Error('Call initHub() first');
  return cfg;
}

const storeKey = () => `hub_outbox:${config().appSlug}`;

function readOutbox(): Record<string, unknown>[] {
  try {
    return JSON.parse(localStorage.getItem(storeKey()) || '[]');
  } catch {
    return [];
  }
}

function writeOutbox(items: Record<string, unknown>[]) {
  try {
    localStorage.setItem(storeKey(), JSON.stringify(items.slice(-200)));
  } catch {
    // storage full or blocked: reports are sent but not held
  }
}

export function initHub(options: { hubUrl?: string; appSlug?: string } = {}) {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const hubUrl = (options.hubUrl ?? env.VITE_HUB_URL ?? '').replace(/\/$/, '');
  const appSlug = options.appSlug ?? env.VITE_HUB_APP_SLUG ?? '';
  if (!hubUrl || !appSlug) throw new Error('Set VITE_HUB_URL and VITE_HUB_APP_SLUG');
  cfg = { hubUrl, appSlug };
  // Leaving the page: queue any pending idle snapshot without starting a normal send (which the
  // browser would cancel), then send everything with keepalive so it survives the unload.
  const sendPending = () => {
    flushIdle(false);
    void flush(true);
  };
  window.addEventListener('pagehide', sendPending);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendPending();
  });
  void flush();
}

// The signed-in person, or null when signed out. Throws if the hub can't be reached.
export async function getMe(): Promise<HubUser | null> {
  const res = await fetch(`${config().hubUrl}/api/me`, { credentials: 'include', cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`hub /api/me ${res.status}`);
  return res.json();
}

export function signIn(): void {
  window.location.replace(`${config().hubUrl}/renew?next=${encodeURIComponent(window.location.href)}`);
}

// Resolves with the signed-in person. Otherwise sends the browser to the hub's sign-in (which
// returns here signed in) and never resolves. Guests whose pass doesn't include this app go to
// the app's page in the hub.
export async function requireUser(): Promise<HubUser> {
  const me = await getMe();
  if (!me) {
    signIn();
    return new Promise(() => {});
  }
  if (me.role === 'guest' && me.scope && !me.scope.includes(config().appSlug)) {
    window.location.replace(`${config().hubUrl}/apps/${config().appSlug}`);
    return new Promise(() => {});
  }
  return me;
}

// Report an event (held until the hub has it).
export function logEvent(e: HubEvent): void {
  enqueue(e);
  void flush();
}

function enqueue(e: HubEvent): void {
  const items = readOutbox();
  items.push({
    app_slug: config().appSlug,
    type: e.type,
    title: e.title,
    snapshot: e.snapshot ?? null,
    run_id: e.runId ?? visitId,
    link: e.link ?? null,
    occurred_at: new Date().toISOString(),
    event_key: crypto.randomUUID(),
  });
  writeOutbox(items);
}

let flushing: Promise<void> | null = null;

// Send everything held, oldest first. Never throws.
export function flush(keepalive = false): Promise<void> {
  // A keepalive send (page unloading) doesn't wait for one in flight, which the browser may cancel;
  // anything sent twice is recorded once (event_key).
  if (flushing && !keepalive) return flushing;
  const run = (async () => {
    {
      for (let round = 0; round < 5; round++) {
        const items = readOutbox();
        if (!items.length) return;
        const batch = items.slice(0, BATCH);
        let res: Response;
        try {
          res = await fetch(`${config().hubUrl}/api/events`, {
            method: 'POST',
            credentials: 'include',
            keepalive: keepalive && JSON.stringify(batch).length < 60_000,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events: batch }),
          });
        } catch {
          return; // offline or hub unreachable: keep for later
        }
        const sent = new Set(batch.map((b) => b.event_key));
        if (res.ok || res.status === 400) {
          if (res.status === 400) console.error('[hub] report rejected:', await res.text().catch(() => ''));
          writeOutbox(readOutbox().filter((b) => !sent.has(b.event_key)));
        } else {
          return; // 401 (signed out), 403, 5xx: keep for later
        }
        if (batch.length < BATCH) return;
      }
    }
  })();
  // Cleared in a .finally() (which always runs later), not inside the async function: when there
  // is nothing to send it returns synchronously, before `flushing` would have been assigned.
  flushing = run.finally(() => {
    flushing = null;
  });
  return flushing;
}

// For calculators: report the current state once the student has stopped adjusting for a while
// (default 20 s), or when they leave the page. Call it on every change; identical consecutive
// snapshots are reported once. All reports from one visit share a run id, so the hub shows the
// visit as one entry with its latest state.
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let idleBuild: (() => HubEvent) | null = null;
let lastIdleSnapshot = '';

export function logWhenIdle(build: () => HubEvent, delayMs = 20_000): void {
  idleBuild = build;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => flushIdle(), delayMs);
}

function flushIdle(send = true) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (!idleBuild) return;
  const event = idleBuild();
  idleBuild = null;
  const key = JSON.stringify([event.type, event.title, event.snapshot]);
  if (key === lastIdleSnapshot) return;
  lastIdleSnapshot = key;
  if (send) logEvent(event);
  else enqueue(event);
}
