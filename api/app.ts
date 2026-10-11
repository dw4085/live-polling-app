import { randomBytes, randomInt } from 'node:crypto';
import {
  checkSuperadminPassword,
  clearSuperadminCookie,
  getIdentity,
  requireApprovedAdmin,
  requireSuperadmin,
  superadminCookie,
  type Admin,
} from './_lib/auth.js';
import { db } from './_lib/db.js';
import { HttpError, json, readBody, routePath, text, uuid } from './_lib/http.js';

// All PollAnywhere data access goes through this function (the browser never
// talks to the database). vercel.json rewrites /api/:path* here, except /api/auth/*.

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

function canManage(admin: Admin, poll: { admin_id: string | null }) {
  return admin.role === 'superadmin' || poll.admin_id === admin.id;
}

async function managedPoll(admin: Admin, pollId: string) {
  const [poll] = await db()`SELECT * FROM polls WHERE id = ${pollId}`;
  if (!poll) throw new HttpError(404, 'Poll not found');
  if (!canManage(admin, poll as { admin_id: string | null })) throw new HttpError(403, 'Not your poll');
  return poll;
}

async function managedQuestion(admin: Admin, questionId: string) {
  const [row] = await db()`
    SELECT q.id, q.poll_id, p.admin_id FROM questions q JOIN polls p ON p.id = q.poll_id
    WHERE q.id = ${questionId}`;
  if (!row) throw new HttpError(404, 'Question not found');
  if (!canManage(admin, row as { admin_id: string | null })) throw new HttpError(403, 'Not your poll');
  return row;
}

async function managedOption(admin: Admin, optionId: string) {
  const [row] = await db()`
    SELECT ao.id, p.admin_id FROM answer_options ao
    JOIN questions q ON q.id = ao.question_id
    JOIN polls p ON p.id = q.poll_id
    WHERE ao.id = ${optionId}`;
  if (!row) throw new HttpError(404, 'Option not found');
  if (!canManage(admin, row as { admin_id: string | null })) throw new HttpError(403, 'Not your poll');
  return row;
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

// Start an anonymous participant session for an open poll
route('POST', 'sessions', async ({ request }) => {
  const body = await readBody(request);
  const pollId = uuid(body.poll_id, 'poll_id');
  const token = randomBytes(24).toString('base64url');
  const [session] = await db()`
    INSERT INTO sessions (poll_id, session_token)
    SELECT id, ${token} FROM polls WHERE id = ${pollId} AND state = 'open'
    RETURNING *`;
  if (!session) throw new HttpError(409, 'Poll is not open');
  return json({ session });
});

// Restore a participant session and its answers
route('GET', 'sessions/:token', async ({ params }) => {
  const [session] = await db()`SELECT * FROM sessions WHERE session_token = ${params.token}`;
  if (!session) throw new HttpError(404, 'Session not found');
  const responses = await db()`
    SELECT question_id, answer_option_id FROM responses WHERE session_id = ${session.id}
    ORDER BY submitted_at`;
  return json({ session, responses });
});

// Replace a participant's answer(s) to one question
route('POST', 'responses', async ({ request }) => {
  const body = await readBody(request);
  if (typeof body.session_token !== 'string' || !body.session_token) throw new HttpError(400, 'Invalid session_token');
  const questionId = uuid(body.question_id, 'question_id');
  if (!Array.isArray(body.answer_option_ids)) throw new HttpError(400, 'answer_option_ids must be an array');
  const optionIds = [...new Set(body.answer_option_ids.map((id) => uuid(id, 'answer_option_id')))];

  const sql = db();
  const [ctx] = await sql`
    SELECT s.id AS session_id, p.state, q.is_visible, q.allow_multiple
    FROM sessions s
    JOIN polls p ON p.id = s.poll_id
    JOIN questions q ON q.poll_id = p.id AND q.id = ${questionId}
    WHERE s.session_token = ${body.session_token}`;
  if (!ctx) throw new HttpError(404, 'Session or question not found');
  if (ctx.state !== 'open') throw new HttpError(409, 'Poll is not open');
  if (!ctx.is_visible) throw new HttpError(409, 'Question is not open for answers');
  if (!ctx.allow_multiple && optionIds.length > 1) throw new HttpError(400, 'Only one answer allowed');

  if (optionIds.length > 0) {
    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM answer_options
      WHERE question_id = ${questionId} AND id = ANY(${optionIds}::uuid[])`;
    if (count !== optionIds.length) throw new HttpError(400, 'Unknown answer option');
  }

  await sql.transaction([
    sql`DELETE FROM responses WHERE session_id = ${ctx.session_id} AND question_id = ${questionId}`,
    sql`
      INSERT INTO responses (session_id, question_id, answer_option_id)
      SELECT ${ctx.session_id}, ${questionId}, unnest(${optionIds}::uuid[])`,
  ]);
  return json({ ok: true });
});

// ---------- Admin identity ----------

route('GET', 'admin/me', async ({ request }) => {
  const { authUser, admin } = await getIdentity(request);
  return json({ admin, email: authUser?.email ?? admin?.email ?? null, signedIn: Boolean(authUser || admin) });
});

route('POST', 'admin/login', async ({ request, url }) => {
  const body = await readBody(request);
  if (typeof body.password !== 'string' || !checkSuperadminPassword(body.password)) {
    throw new HttpError(401, 'Incorrect password');
  }
  const [admin] = await db()`SELECT * FROM admins WHERE role = 'superadmin' ORDER BY created_at LIMIT 1`;
  if (!admin) throw new HttpError(500, 'Superadmin record not found');
  return json({ admin }, 200, { 'set-cookie': superadminCookie(url.protocol === 'https:') });
});

route('POST', 'admin/logout', async ({ url }) => {
  return json({ ok: true }, 200, { 'set-cookie': clearSuperadminCookie(url.protocol === 'https:') });
});

// Request admin access for the signed-in (Google) account
route('POST', 'admin/signup', async ({ request }) => {
  const { authUser, admin } = await getIdentity(request);
  if (!authUser) throw new HttpError(401, 'Sign in with Google first');
  if (admin) {
    throw new HttpError(409, admin.status === 'pending'
      ? 'An account with this email is already pending approval.'
      : 'An account with this email already exists.');
  }
  const body = await readBody(request);
  const name = text(body.name, 'Name', 255);
  const affiliation = typeof body.affiliation === 'string' && body.affiliation.trim()
    ? text(body.affiliation, 'Affiliation', 500) : null;
  const [created] = await db()`
    INSERT INTO admins (auth_user_id, email, name, affiliation, role, status)
    VALUES (${authUser.id}, ${authUser.email}, ${name}, ${affiliation}, 'admin', 'pending')
    RETURNING *`;
  return json({ admin: created });
});

// ---------- Admin: polls ----------

route('GET', 'admin/polls', async ({ request }) => {
  const admin = await requireApprovedAdmin(request);
  const superadmin = admin.role === 'superadmin';
  const polls = await db()`
    SELECT * FROM polls
    WHERE state <> 'archived' AND (${superadmin}::boolean OR admin_id = ${admin.id})
    ORDER BY created_at DESC`;
  return json({ polls });
});

route('POST', 'admin/polls', async ({ request }) => {
  const admin = await requireApprovedAdmin(request);
  const body = await readBody(request);
  const title = text(body.title, 'Title', 255);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 8 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    const [poll] = await db()`
      INSERT INTO polls (title, access_code, state, admin_id)
      VALUES (${title}, ${code}, 'draft', ${admin.id})
      ON CONFLICT (access_code) DO NOTHING
      RETURNING *`;
    if (poll) return json({ poll });
  }
  throw new HttpError(500, 'Could not allocate an access code');
});

route('GET', 'admin/polls/:id', async ({ request, params }) => {
  const admin = await requireApprovedAdmin(request);
  const poll = await managedPoll(admin, uuid(params.id));
  const [questions, participants] = await db().transaction([
    questionsQuery(poll.id),
    db()`SELECT participant_count FROM active_participants WHERE poll_id = ${poll.id}`,
  ]);
  return json({ poll, questions, participant_count: participants[0]?.participant_count ?? 0 });
});

route('PATCH', 'admin/polls/:id', async ({ request, params }) => {
  const admin = await requireApprovedAdmin(request);
  const poll = await managedPoll(admin, uuid(params.id));
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
  return json({ poll: updated });
});

route('DELETE', 'admin/polls/:id', async ({ request, params }) => {
  const admin = await requireApprovedAdmin(request);
  const poll = await managedPoll(admin, uuid(params.id));
  await db()`DELETE FROM polls WHERE id = ${poll.id}`;
  return json({ ok: true });
});

route('GET', 'admin/polls/:id/participants', async ({ request, params }) => {
  const admin = await requireApprovedAdmin(request);
  const poll = await managedPoll(admin, uuid(params.id));
  const [row] = await db()`SELECT participant_count FROM active_participants WHERE poll_id = ${poll.id}`;
  return json({ participant_count: row?.participant_count ?? 0 });
});

// Clear every answer to this poll. Bumping updated_at tells open voting pages to reload their answers.
route('POST', 'admin/polls/:id/reset', async ({ request, params }) => {
  const admin = await requireApprovedAdmin(request);
  const poll = await managedPoll(admin, uuid(params.id));
  const sql = db();
  await sql.transaction([
    sql`DELETE FROM responses WHERE question_id IN (SELECT id FROM questions WHERE poll_id = ${poll.id})`,
    sql`UPDATE polls SET updated_at = NOW() WHERE id = ${poll.id}`,
  ]);
  return json({ ok: true });
});

// Show or hide every question to participants
route('POST', 'admin/polls/:id/visibility', async ({ request, params }) => {
  const admin = await requireApprovedAdmin(request);
  const poll = await managedPoll(admin, uuid(params.id));
  const body = await readBody(request);
  const visible = optionalBool(body.visible, 'visible');
  if (visible === null) throw new HttpError(400, 'visible is required');
  await db()`UPDATE questions SET is_visible = ${visible} WHERE poll_id = ${poll.id}`;
  return json({ ok: true });
});

// Add a question (with two starter options); returns the updated question list
route('POST', 'admin/polls/:id/questions', async ({ request, params }) => {
  const admin = await requireApprovedAdmin(request);
  const poll = await managedPoll(admin, uuid(params.id));
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
  const admin = await requireApprovedAdmin(request);
  const question = await managedQuestion(admin, uuid(params.id));
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
  const admin = await requireApprovedAdmin(request);
  const question = await managedQuestion(admin, uuid(params.id));
  await db()`DELETE FROM questions WHERE id = ${question.id}`;
  return json({ ok: true });
});

route('POST', 'admin/questions/:id/options', async ({ request, params }) => {
  const admin = await requireApprovedAdmin(request);
  const question = await managedQuestion(admin, uuid(params.id));
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
  const admin = await requireApprovedAdmin(request);
  const option = await managedOption(admin, uuid(params.id));
  const body = await readBody(request);
  const optionText = text(body.option_text, 'Option text', 500);
  const [updated] = await db()`
    UPDATE answer_options SET option_text = ${optionText} WHERE id = ${option.id} RETURNING *`;
  return json({ option: updated });
});

route('DELETE', 'admin/options/:id', async ({ request, params }) => {
  const admin = await requireApprovedAdmin(request);
  const option = await managedOption(admin, uuid(params.id));
  await db()`DELETE FROM answer_options WHERE id = ${option.id}`;
  return json({ ok: true });
});

// ---------- Superadmin: admin accounts ----------

route('GET', 'admin/admins', async ({ request }) => {
  await requireSuperadmin(request);
  const [admins, polls] = await db().transaction([
    db()`SELECT * FROM admins ORDER BY created_at DESC`,
    db()`
      SELECT p.*, (SELECT COUNT(*)::int FROM questions q WHERE q.poll_id = p.id) AS question_count
      FROM polls p
      WHERE p.state <> 'archived' AND p.admin_id IS NOT NULL
      ORDER BY p.created_at DESC`,
  ]);
  const byAdmin: Record<string, unknown[]> = {};
  for (const poll of polls) (byAdmin[poll.admin_id] ??= []).push(poll);
  return json({ admins: admins.map((a) => ({ ...a, polls: byAdmin[a.id] ?? [] })) });
});

route('PATCH', 'admin/admins/:id', async ({ request, params }) => {
  const me = await requireSuperadmin(request);
  const id = uuid(params.id);
  if (id === me.id) throw new HttpError(400, 'You cannot change your own account');
  const body = await readBody(request);
  const status = optionalEnum(body.status, ['approved', 'rejected'], 'status');
  if (!status) throw new HttpError(400, 'status is required');
  const [updated] = await db()`
    UPDATE admins SET
      status = ${status},
      approved_at = CASE WHEN ${status} = 'approved' THEN NOW() ELSE approved_at END,
      approved_by = CASE WHEN ${status} = 'approved' THEN ${me.id}::uuid ELSE approved_by END
    WHERE id = ${id} AND role <> 'superadmin'
    RETURNING *`;
  if (!updated) throw new HttpError(404, 'Admin not found');
  return json({ admin: updated });
});

route('DELETE', 'admin/admins/:id', async ({ request, params }) => {
  const me = await requireSuperadmin(request);
  const id = uuid(params.id);
  if (id === me.id) throw new HttpError(400, 'You cannot delete your own account');
  const [deleted] = await db()`DELETE FROM admins WHERE id = ${id} AND role <> 'superadmin' RETURNING id`;
  if (!deleted) throw new HttpError(404, 'Admin not found');
  return json({ ok: true });
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
