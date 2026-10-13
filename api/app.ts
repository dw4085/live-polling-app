import { randomInt } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { requireStaff, requireUser } from './_lib/auth.js';
import { db } from './_lib/db.js';
import { isCronRequest, type HubEvent } from './_lib/hub.js';
import { HttpError, json, readBody, routePath, text, uuid } from './_lib/http.js';
import { flushSoon, outbox } from './_lib/outbox.js';
import { appOrigin, finalAnswersEvents, studentAnswersEvent } from './_lib/pollEvents.js';

// All PollAnywhere data access goes through this function (the browser never
// talks to the database). vercel.json rewrites /api/:path* here.
//
// Identity comes only from the class hub's session cookie (see _lib/auth.ts): voting needs a
// signed-in student, and the hub's instructors and TAs run every poll. The live poll state and
// cross-tab data stay public and anonymous (aggregate counts only) so the CDN can serve a full
// classroom polling every second.

type Params = Record<string, string>;
type Handler = (ctx: { request: Request; url: URL; params: Params }) => Promise<Response>;

const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];

function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' + path.replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)'; }) + '$'
  );
  routes.push({ method, pattern, keys, handler });
}

const CHART_TYPES = ['horizontal_bar', 'vertical_bar', 'pie', 'donut'];
const POLL_STATES = ['draft', 'open', 'closed', 'archived'];
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

function optionalBool(value: unknown, field: string): boolean | null {
  if (value === undefined) return null;
  if (typeof value !== 'boolean') throw new HttpError(400, `Invalid ${field}`);
  return value;
}

function optionalEnum(value: unknown, allowed: string[], field: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !allowed.includes(value)) throw new HttpError(400, `Invalid ${field}`);
  return value;
}

// Shared poll state is cached for a second at the Vercel CDN so a full class
// polling every second costs about one function invocation per second.
const LIVE_CACHE = { 'cache-control': 'public, max-age=0, must-revalidate', 'vercel-cdn-cache-control': 'max-age=1' };

// ---------- Shared queries ----------

function questionsQuery(pollId: string) {
  return db()`
    SELECT q.*,
      COALESCE(
        json_agg(ao ORDER BY ao.option_order, ao.created_at) FILTER (WHERE ao.id IS NOT NULL),
        '[]'
      ) AS answer_options
    FROM questions q
    LEFT JOIN answer_options ao ON ao.question_id = q.id
    WHERE q.poll_id = ${pollId}
    GROUP BY q.id
    ORDER BY q.question_order, q.created_at`;
}

async function pollByCode(code: string) {
  const [poll] = await db()`
    SELECT id, title, slug, access_code, state, results_revealed, created_at, updated_at, closed_at
    FROM polls
    WHERE (slug = ${code} OR access_code = ${code}) AND state <> 'archived'
    ORDER BY (slug IS NOT DISTINCT FROM ${code}) DESC
    LIMIT 1`;
  if (!poll) throw new HttpError(404, 'Poll not found');
  return poll;
}

async function managedPoll(pollId: string) {
  const [poll] = await db()`SELECT * FROM polls WHERE id = ${pollId}`;
  if (!poll) throw new HttpError(404, 'Poll not found');
  return poll;
}

async function managedQuestion(questionId: string) {
  const [row] = await db()`SELECT id, poll_id FROM questions WHERE id = ${questionId}`;
  if (!row) throw new HttpError(404, 'Question not found');
  return row;
}

async function managedOption(optionId: string) {
  const [row] = await db()`SELECT id FROM answer_options WHERE id = ${optionId}`;
  if (!row) throw new HttpError(404, 'Option not found');
  return row;
}

// Hold activity reports for the class hub and send them after responding. Reporting never holds
// up or fails a vote or a poll change: the answers are saved either way.
async function report(build: () => Promise<HubEvent[]>) {
  try {
    await outbox().enqueue(...(await build()));
    waitUntil(flushSoon());
  } catch (error) {
    console.error('[hub] could not hold activity report', error);
  }
}

// ---------- Public: participants and projector ----------

// Poll, questions and (revealed) counts for a voting/results page
route('GET', 'live/:code', async ({ params }) => {
  const poll = await pollByCode(params.code);
  if (poll.state !== 'open' && poll.state !== 'closed') {
    return json({ poll, questions: [], counts: [] }, 200, LIVE_CACHE);
  }
  const [questions, counts] = await db().transaction([
    questionsQuery(poll.id),
    db()`
      SELECT rc.question_id, rc.answer_option_id, rc.option_text, rc.option_order, rc.color, rc.response_count
      FROM response_counts rc
      JOIN questions q ON q.id = rc.question_id
      WHERE rc.poll_id = ${poll.id} AND (${poll.results_revealed}::boolean OR q.is_revealed)`,
  ]);
  return json({ poll, questions, counts }, 200, LIVE_CACHE);
});

// Raw (anonymous) answers to two revealed questions, for cross-tabulation
route('GET', 'live/:code/crosstab', async ({ params, url }) => {
  const poll = await pollByCode(params.code);
  const q1 = uuid(url.searchParams.get('q1'), 'q1');
  const q2 = uuid(url.searchParams.get('q2'), 'q2');
  const responses = await db()`
    SELECT r.session_id, r.question_id, r.answer_option_id
    FROM responses r
    JOIN questions q ON q.id = r.question_id
    WHERE q.poll_id = ${poll.id}
      AND q.id IN (${q1}, ${q2})
      AND ${poll.state === 'open' || poll.state === 'closed'}::boolean
      AND (${poll.results_revealed}::boolean OR q.is_revealed)`;
  return json({ responses }, 200, LIVE_CACHE);
});

// A participant session's answers
function answersOf(sessionId: string) {
  return db()`
    SELECT question_id, answer_option_id FROM responses WHERE session_id = ${sessionId}
    ORDER BY submitted_at`;
}

// Join an open poll as the signed-in student (one session per student per poll); returns your answers so far
route('POST', 'sessions', async ({ request }) => {
  const user = await requireUser(request);
  const body = await readBody(request);
  const pollId = uuid(body.poll_id, 'poll_id');
  const [session] = await db()`
    INSERT INTO sessions (poll_id, student_id)
    SELECT id, ${user.id} FROM polls WHERE id = ${pollId} AND state = 'open'
    ON CONFLICT (poll_id, student_id) DO UPDATE SET last_activity_at = NOW()
    RETURNING id, poll_id, created_at, last_activity_at`;
  if (!session) throw new HttpError(409, 'Poll is not open');
  return json({ session, responses: await answersOf(session.id) });
});

// The signed-in student's answers to a poll (e.g. reloaded after the admin resets it)
route('GET', 'sessions/mine', async ({ request, url }) => {
  const user = await requireUser(request);
  const pollId = uuid(url.searchParams.get('poll_id'), 'poll_id');
  const [session] = await db()`
    SELECT id, poll_id, created_at, last_activity_at FROM sessions
    WHERE poll_id = ${pollId} AND student_id = ${user.id}`;
  if (!session) throw new HttpError(404, 'Session not found');
  return json({ session, responses: await answersOf(session.id) });
});

// Replace the signed-in student's answer(s) to one question
route('POST', 'responses', async ({ request }) => {
  const user = await requireUser(request);
  const body = await readBody(request);
  const questionId = uuid(body.question_id, 'question_id');
  if (!Array.isArray(body.answer_option_ids)) throw new HttpError(400, 'answer_option_ids must be an array');
  const optionIds = [...new Set(body.answer_option_ids.map((id) => uuid(id, 'answer_option_id').toLowerCase()))];

  const sql = db();
  const [ctx] = await sql`
    SELECT p.id AS poll_id, p.state, q.is_visible, q.allow_multiple, s.id AS session_id,
      ARRAY(
        SELECT r.answer_option_id::text FROM responses r
        WHERE r.session_id = s.id AND r.question_id = q.id
      ) AS previous
    FROM questions q
    JOIN polls p ON p.id = q.poll_id
    LEFT JOIN sessions s ON s.poll_id = p.id AND s.student_id = ${user.id}
    WHERE q.id = ${questionId}`;
  if (!ctx) throw new HttpError(404, 'Question not found');
  if (ctx.state !== 'open') throw new HttpError(409, 'Poll is not open');
  if (!ctx.is_visible) throw new HttpError(409, 'Question is not open for answers');
  if (!ctx.allow_multiple && optionIds.length > 1) throw new HttpError(400, 'Only one answer allowed');

  if (optionIds.length > 0) {
    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM answer_options
      WHERE question_id = ${questionId} AND id = ANY(${optionIds}::uuid[])`;
    if (count !== optionIds.length) throw new HttpError(400, 'Unknown answer option');
  }

  // The same answer as before: nothing to save or report
  const previous = new Set(ctx.previous as string[]);
  if (ctx.session_id && previous.size === optionIds.length && optionIds.every((id) => previous.has(id))) {
    return json({ ok: true });
  }

  let sessionId = ctx.session_id as string | null;
  if (!sessionId) {
    const [session] = await sql`
      INSERT INTO sessions (poll_id, student_id) VALUES (${ctx.poll_id}, ${user.id})
      ON CONFLICT (poll_id, student_id) DO UPDATE SET last_activity_at = NOW()
      RETURNING id`;
    sessionId = session.id as string;
  }

  await sql.transaction([
    sql`DELETE FROM responses WHERE session_id = ${sessionId} AND question_id = ${questionId}`,
    sql`
      INSERT INTO responses (session_id, question_id, answer_option_id)
      SELECT ${sessionId}, ${questionId}, unnest(${optionIds}::uuid[])`,
  ]);

  // Re-report the student's whole set of answers to this poll (one hub entry per student per poll)
  await report(async () => [await studentAnswersEvent(ctx.poll_id, user.id, appOrigin(request))]);
  return json({ ok: true });
});

// ---------- Admin: polls ----------

// The hub's instructors and TAs share every poll
route('GET', 'admin/polls', async ({ request }) => {
  await requireStaff(request);
  const polls = await db()`
    SELECT * FROM polls
    WHERE state <> 'archived'
    ORDER BY created_at DESC`;
  return json({ polls });
});

route('POST', 'admin/polls', async ({ request }) => {
  const user = await requireStaff(request);
  const body = await readBody(request);
  const title = text(body.title, 'Title', 255);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 8 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    const [poll] = await db()`
      INSERT INTO polls (title, access_code, state, created_by)
      VALUES (${title}, ${code}, 'draft', ${user.id})
      ON CONFLICT (access_code) DO NOTHING
      RETURNING *`;
    if (poll) return json({ poll });
  }
  throw new HttpError(500, 'Could not allocate an access code');
});

route('GET', 'admin/polls/:id', async ({ request, params }) => {
  await requireStaff(request);
  const poll = await managedPoll(uuid(params.id));
  const [questions, participants] = await db().transaction([
    questionsQuery(poll.id),
    db()`SELECT participant_count FROM active_participants WHERE poll_id = ${poll.id}`,
  ]);
  return json({ poll, questions, participant_count: participants[0]?.participant_count ?? 0 });
});

route('PATCH', 'admin/polls/:id', async ({ request, params }) => {
  await requireStaff(request);
  const poll = await managedPoll(uuid(params.id));
  const body = await readBody(request);
  const title = body.title === undefined ? null : text(body.title, 'Title', 255);
  const state = optionalEnum(body.state, POLL_STATES, 'state');
  const revealed = optionalBool(body.results_revealed, 'results_revealed');
  const [updated] = await db()`
    UPDATE polls SET
      title = COALESCE(${title}, title),
      state = COALESCE(${state}, state),
      results_revealed = COALESCE(${revealed}::boolean, results_revealed)
    WHERE id = ${poll.id}
    RETURNING *`;
  // Closing the poll makes everyone's answers final: re-report each student's entry, marked final
  if (updated.state === 'closed' && poll.state !== 'closed') {
    await report(() => finalAnswersEvents(poll.id, appOrigin(request)));
  }
  return json({ poll: updated });
});

route('DELETE', 'admin/polls/:id', async ({ request, params }) => {
  await requireStaff(request);
  const poll = await managedPoll(uuid(params.id));
  await db()`DELETE FROM polls WHERE id = ${poll.id}`;
  return json({ ok: true });
});

route('GET', 'admin/polls/:id/participants', async ({ request, params }) => {
  await requireStaff(request);
  const poll = await managedPoll(uuid(params.id));
  const [row] = await db()`SELECT participant_count FROM active_participants WHERE poll_id = ${poll.id}`;
  return json({ participant_count: row?.participant_count ?? 0 });
});

// Clear every answer to this poll. Bumping updated_at tells open voting pages to reload their answers.
route('POST', 'admin/polls/:id/reset', async ({ request, params }) => {
  await requireStaff(request);
  const poll = await managedPoll(uuid(params.id));
  const sql = db();
  await sql.transaction([
    sql`DELETE FROM responses WHERE question_id IN (SELECT id FROM questions WHERE poll_id = ${poll.id})`,
    sql`UPDATE polls SET updated_at = NOW() WHERE id = ${poll.id}`,
  ]);
  return json({ ok: true });
});

// Show or hide every question to participants
route('POST', 'admin/polls/:id/visibility', async ({ request, params }) => {
  await requireStaff(request);
  const poll = await managedPoll(uuid(params.id));
  const body = await readBody(request);
  const visible = optionalBool(body.visible, 'visible');
  if (visible === null) throw new HttpError(400, 'visible is required');
  await db()`UPDATE questions SET is_visible = ${visible} WHERE poll_id = ${poll.id}`;
  return json({ ok: true });
});

// Add a question (with two starter options); returns the updated question list
route('POST', 'admin/polls/:id/questions', async ({ request, params }) => {
  await requireStaff(request);
  const poll = await managedPoll(uuid(params.id));
  await db()`
    WITH q AS (
      INSERT INTO questions (poll_id, question_text, question_order, chart_type)
      SELECT ${poll.id}, 'New Question', COALESCE(MAX(question_order) + 1, 0), 'horizontal_bar'
      FROM questions WHERE poll_id = ${poll.id}
      RETURNING id
    )
    INSERT INTO answer_options (question_id, option_text, option_order)
    SELECT q.id, o.option_text, o.option_order
    FROM q, (VALUES ('Option 1', 0), ('Option 2', 1)) AS o(option_text, option_order)`;
  const questions = await questionsQuery(poll.id);
  return json({ questions });
});

// ---------- Admin: questions and options ----------

route('PATCH', 'admin/questions/:id', async ({ request, params }) => {
  await requireStaff(request);
  const question = await managedQuestion(uuid(params.id));
  const body = await readBody(request);
  const questionText = body.question_text === undefined ? null : text(body.question_text, 'Question text', 5000);
  const chartType = optionalEnum(body.chart_type, CHART_TYPES, 'chart_type');
  const allowMultiple = optionalBool(body.allow_multiple, 'allow_multiple');
  const isRevealed = optionalBool(body.is_revealed, 'is_revealed');
  const isVisible = optionalBool(body.is_visible, 'is_visible');
  const [updated] = await db()`
    UPDATE questions SET
      question_text = COALESCE(${questionText}, question_text),
      chart_type = COALESCE(${chartType}, chart_type),
      allow_multiple = COALESCE(${allowMultiple}::boolean, allow_multiple),
      is_revealed = COALESCE(${isRevealed}::boolean, is_revealed),
      is_visible = COALESCE(${isVisible}::boolean, is_visible)
    WHERE id = ${question.id}
    RETURNING *`;
  return json({ question: updated });
});

route('DELETE', 'admin/questions/:id', async ({ request, params }) => {
  await requireStaff(request);
  const question = await managedQuestion(uuid(params.id));
  await db()`DELETE FROM questions WHERE id = ${question.id}`;
  return json({ ok: true });
});

route('POST', 'admin/questions/:id/options', async ({ request, params }) => {
  await requireStaff(request);
  const question = await managedQuestion(uuid(params.id));
  const body = await readBody(request);
  const optionText = text(body.option_text, 'Option text', 500);
  const [option] = await db()`
    INSERT INTO answer_options (question_id, option_text, option_order)
    SELECT ${question.id}, ${optionText}, COALESCE(MAX(option_order) + 1, 0)
    FROM answer_options WHERE question_id = ${question.id}
    RETURNING *`;
  return json({ option });
});

route('PATCH', 'admin/options/:id', async ({ request, params }) => {
  await requireStaff(request);
  const option = await managedOption(uuid(params.id));
  const body = await readBody(request);
  const optionText = text(body.option_text, 'Option text', 500);
  const [updated] = await db()`
    UPDATE answer_options SET option_text = ${optionText} WHERE id = ${option.id} RETURNING *`;
  return json({ option: updated });
});

route('DELETE', 'admin/options/:id', async ({ request, params }) => {
  await requireStaff(request);
  const option = await managedOption(uuid(params.id));
  await db()`DELETE FROM answer_options WHERE id = ${option.id}`;
  return json({ ok: true });
});

// ---------- Class hub activity reports ----------

// Reports the class hub hasn't received yet (admin page)
route('GET', 'admin/hub/outbox', async ({ request }) => {
  await requireStaff(request);
  return json(await outbox().status());
});

// "Send now": deliver everything waiting, then report what's left
route('POST', 'admin/hub/outbox', async ({ request }) => {
  await requireStaff(request);
  const result = await outbox().flush();
  return json({ ...result, status: await outbox().status() });
});

// Daily sweep (Vercel Cron, see vercel.json): resend reports the hub hasn't received
route('GET', 'hub/sweep', async ({ request }) => {
  if (!isCronRequest(request.headers.get('authorization'))) throw new HttpError(401, 'Unauthorized');
  return json(await outbox().flush());
});

// ---------- Dispatch ----------

async function handle(request: Request): Promise<Response> {
  const { path, url } = routePath(request, '');
  let pathMatched = false;
  for (const r of routes) {
    const match = r.pattern.exec(path);
    if (!match) continue;
    pathMatched = true;
    if (r.method !== request.method) continue;
    const params: Params = {};
    r.keys.forEach((key, i) => { params[key] = decodeURIComponent(match[i + 1]); });
    try {
      return await r.handler({ request, url, params });
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if ((error as { code?: string }).code === '23505') return json({ error: 'Already exists' }, 409);
      console.error(`${request.method} /api/${path} failed`, error);
      return json({ error: 'Server error' }, 500);
    }
  }
  return json({ error: pathMatched ? 'Method not allowed' : 'Not found' }, pathMatched ? 405 : 404);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
