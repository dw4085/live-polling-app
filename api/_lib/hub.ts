// Class hub kit: one sign-in (the hub's session cookie) and activity reporting for a class app.
// Copy this file into the app (e.g. lib/hub.ts); it needs only `jose`. Server-side only.
//
// Environment (server-only):
//   HUB_URL              the hub, e.g. https://preview.cbs-tech-strategy.com
//   HUB_JWT_PUBLIC_KEY   the hub's public key (base64 of the PEM, or the PEM itself)
//   HUB_COOKIE_NAME      the session cookie's name, e.g. cts_preview_session
//   HUB_APP_SLUG         this app's slug in the hub, e.g. gig-worker-for-a-day
//   HUB_APP_KEY          this app's key (hub admin → App keys), used to report activity
//   HUB_PROTECTION_BYPASS  optional: the hub project's Vercel "Protection Bypass for Automation"
//                          secret, needed while the hub's deployment sits behind Vercel Authentication
//                          (preview), or the hub never receives the reports
//
// The app must be served under the hub's cookie domain (e.g. gig.preview.cbs-tech-strategy.com)
// so the browser sends it the cookie. See kit/README.md.

import { importSPKI, jwtVerify } from 'jose';

export type HubRole = 'admin' | 'ta' | 'student' | 'guest';

export interface HubUser {
  id: string;              // hub person id; use it as this app's user id
  email: string;
  name: string;
  role: HubRole;
  section: string | null;
  term: string;
  scope: string[] | null;  // guests: the app slugs they may use (null = all)
}

export interface HubEvent {
  actorId: string;         // the person who acted (HubUser.id)
  subjectIds?: string[];   // teammates who should also see it (team apps)
  type: string;            // e.g. run.started, run.completed, run.submitted
  title: string;           // one line a student would recognise
  snapshot?: unknown;      // their work at that moment (JSON, ≤ 64 KB)
  runId?: string;          // groups events from one attempt
  link?: string;           // https link back to this work in the app
}

const ISSUER = 'cbs-tech-strategy-hub';
let keyPromise: ReturnType<typeof importSPKI> | null = null;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function publicKey() {
  const raw = env('HUB_JWT_PUBLIC_KEY');
  const pem = raw.includes('BEGIN') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return (keyPromise ??= importSPKI(pem, 'ES256'));
}

export const hubCookieName = () => process.env.HUB_COOKIE_NAME || 'cts_session';

// The signed-in person from the session cookie's value, or null (missing, expired or forged).
export async function verifyHubToken(token: string | undefined | null): Promise<HubUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await publicKey(), { issuer: ISSUER, algorithms: ['ES256'] });
    return {
      id: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name ?? ''),
      role: payload.role as HubRole,
      section: (payload.section as string | null) ?? null,
      term: String(payload.term),
      scope: (payload.scope as string[] | null) ?? null,
    };
  } catch {
    return null;
  }
}

// Guests may be limited to some apps.
export function canUseThisApp(user: HubUser): boolean {
  return user.role !== 'guest' || user.scope === null || user.scope.includes(env('HUB_APP_SLUG'));
}

export function isStaff(user: HubUser | null): boolean {
  return user?.role === 'admin' || user?.role === 'ta';
}

export function hubUrl(path = '/'): string {
  return new URL(path, env('HUB_URL')).toString();
}

// Where to send a visitor without a valid session: the hub re-issues the cookie silently when
// they are still signed in to Google, then returns them to `returnTo`.
export function signInUrl(returnTo: string): string {
  return hubUrl(`/renew?next=${encodeURIComponent(returnTo)}`);
}

// Where to send a guest whose pass doesn't include this app.
export function notAllowedUrl(): string {
  return hubUrl(`/apps/${env('HUB_APP_SLUG')}`);
}

type Wire = Record<string, unknown>;

function toWire(e: HubEvent, eventKey?: string): Wire {
  return {
    actor_id: e.actorId,
    subject_ids: e.subjectIds ?? [],
    type: e.type,
    title: e.title,
    snapshot: e.snapshot ?? null,
    run_id: e.runId ?? null,
    link: e.link ?? null,
    occurred_at: new Date().toISOString(),
    ...(eventKey ? { event_key: eventKey } : {}),
  };
}

// One POST to the hub. `retry` is false only when the hub rejected the events as malformed (400),
// which sending again won't fix.
async function post(events: Wire[]): Promise<{ ok: boolean; retry: boolean; error?: string }> {
  try {
    const res = await fetch(hubUrl('/api/events'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env('HUB_APP_KEY')}`,
        ...(process.env.HUB_PROTECTION_BYPASS ? { 'x-vercel-protection-bypass': process.env.HUB_PROTECTION_BYPASS } : {}),
      },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true, retry: false };
    const text = (await res.text().catch(() => '')).slice(0, 300);
    return { ok: false, retry: res.status !== 400, error: `${res.status} ${text}`.trim() };
  } catch (err) {
    return { ok: false, retry: true, error: err instanceof Error ? err.message : String(err) };
  }
}

// Sends events straight to the hub, once. Never throws. For apps without a database; apps with one
// should use hubOutbox(), which holds reports the hub didn't receive and resends them.
export async function logEvent(...events: HubEvent[]): Promise<void> {
  if (!events.length) return;
  const result = await post(events.map((e) => toWire(e)));
  if (!result.ok) console.error('[hub] logEvent failed', result.error);
}

// ---------------------------------------------------------------------------------------------
// Outbox: hold reports until the hub has them.
//
// Each report is written to the app's own hub_outbox table first, then sent. If the hub can't be
// reached (outage, deploy, network, setup mistake) the report stays and is resent by the next
// flush() — after the app's next report, the daily sweep, or "Send now" in the app's admin. Each
// report carries its row id as event_key, so the hub records it once however often it is sent.
// The report keeps the time the student acted. Create the table with OUTBOX_TABLE_SQL.

export const OUTBOX_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS hub_outbox (
  id               UUID PRIMARY KEY,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  event            JSON NOT NULL,          -- the report as sent (JSON keeps the snapshot's field order)
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_attempt_at  TIMESTAMPTZ,
  last_error       TEXT,
  delivered_at     TIMESTAMPTZ,
  failed_at        TIMESTAMPTZ             -- rejected by the hub as malformed; not retried
);
CREATE INDEX IF NOT EXISTS hub_outbox_pending ON hub_outbox (created_at) WHERE delivered_at IS NULL AND failed_at IS NULL;`;

// A tagged-template SQL client, e.g. neon(DATABASE_URL).
export type HubSql = (strings: TemplateStringsArray, ...values: any[]) => PromiseLike<Record<string, any>[]>;

export interface OutboxStatus {
  waiting: number;               // not yet received by the hub
  failed: number;                // rejected by the hub as malformed
  oldestWaitingAt: string | null;
  lastError: string | null;
  lastDeliveredAt: string | null;
}

const BATCH = 50;

export function hubOutbox(sql: HubSql) {
  // Hold reports. Await this where the app saves the student's work, then call flush() after
  // responding (Next.js: `after(() => outbox.flush())`).
  async function enqueue(...events: HubEvent[]): Promise<void> {
    for (const e of events) {
      const id = crypto.randomUUID();
      await sql`INSERT INTO hub_outbox (id, event) VALUES (${id}, ${JSON.stringify(toWire(e, id))}::json)`;
    }
  }

  async function mark(ids: string[], result: { ok: boolean; retry: boolean; error?: string }) {
    if (result.ok) {
      await sql`UPDATE hub_outbox SET delivered_at = now(), attempts = attempts + 1, last_attempt_at = now(), last_error = NULL WHERE id = ANY(${ids}::uuid[])`;
    } else if (!result.retry) {
      await sql`UPDATE hub_outbox SET failed_at = now(), attempts = attempts + 1, last_attempt_at = now(), last_error = ${result.error ?? null} WHERE id = ANY(${ids}::uuid[])`;
    } else {
      await sql`UPDATE hub_outbox SET attempts = attempts + 1, last_attempt_at = now(), last_error = ${result.error ?? null} WHERE id = ANY(${ids}::uuid[])`;
    }
  }

  // Send everything waiting, oldest first. Never throws. Returns how many reports were delivered
  // and how many are still waiting.
  async function flush(): Promise<{ delivered: number; waiting: number }> {
    let delivered = 0;
    try {
      for (let round = 0; round < 10; round++) {
        const rows = await sql`
          SELECT id, event FROM hub_outbox WHERE delivered_at IS NULL AND failed_at IS NULL
          ORDER BY created_at LIMIT ${BATCH}`;
        if (!rows.length) break;
        const events = rows.map((r) => (typeof r.event === 'string' ? JSON.parse(r.event) : r.event) as Wire);
        const result = await post(events);
        if (result.ok || result.retry || rows.length === 1) {
          await mark(rows.map((r) => String(r.id)), result);
          if (!result.ok) {
            if (result.retry) console.error('[hub] activity reports held for resend:', result.error);
            break;
          }
          delivered += rows.length;
        } else {
          // The hub rejected the batch: send one at a time so only the malformed reports fail.
          for (let i = 0; i < rows.length; i++) {
            const one = await post([events[i]]);
            await mark([String(rows[i].id)], one);
            if (one.ok) delivered++;
            else console.error('[hub] activity report', one.retry ? 'held for resend:' : 'rejected:', one.error);
          }
        }
        if (rows.length < BATCH) break;
      }
      await sql`DELETE FROM hub_outbox WHERE delivered_at < now() - interval '30 days'`;
    } catch (err) {
      console.error('[hub] outbox flush failed', err);
    }
    const [{ waiting }] = await Promise.resolve(
      sql`SELECT COUNT(*)::int AS waiting FROM hub_outbox WHERE delivered_at IS NULL AND failed_at IS NULL`,
    ).catch(() => [{ waiting: -1 }]);
    return { delivered, waiting };
  }

  // For the app's admin page: what hasn't reached the hub yet.
  async function status(): Promise<OutboxStatus> {
    const [r] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE delivered_at IS NULL AND failed_at IS NULL)::int AS waiting,
        COUNT(*) FILTER (WHERE failed_at IS NOT NULL)::int AS failed,
        MIN(created_at) FILTER (WHERE delivered_at IS NULL AND failed_at IS NULL) AS oldest,
        MAX(delivered_at) AS last_delivered,
        (SELECT last_error FROM hub_outbox WHERE delivered_at IS NULL AND last_error IS NOT NULL
          ORDER BY last_attempt_at DESC LIMIT 1) AS last_error
      FROM hub_outbox`;
    const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
    return {
      waiting: r.waiting,
      failed: r.failed,
      oldestWaitingAt: iso(r.oldest),
      lastError: r.last_error ?? null,
      lastDeliveredAt: iso(r.last_delivered),
    };
  }

  return { enqueue, flush, status };
}

// For the daily sweep: Vercel Cron calls the app with `Authorization: Bearer $CRON_SECRET`.
export function isCronRequest(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && authorization === `Bearer ${secret}`;
}
