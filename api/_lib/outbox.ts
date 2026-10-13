import { db } from './db.js';
import { hubOutbox, type HubSql } from './hub.js';

// Activity reports for the class hub go through the outbox: held in this app's database and
// resent until the hub has them.
export const outbox = () => hubOutbox(db() as unknown as HubSql);

// A whole class answers within seconds, and every answer adds a report. Rather than one flush per
// answer (dozens at once, each resending the same waiting rows), an instance runs one flush at a
// time: answers that arrive while it waits or sends are picked up by the next round. Call it from
// waitUntil() after responding. Anything left over goes out with the next report, the daily
// sweep, or "Send now" on the admin page.
let running: Promise<void> | null = null;
let again = false;

export function flushSoon(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      await new Promise((resolve) => setTimeout(resolve, 750));
      again = false;
      await outbox().flush();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}
