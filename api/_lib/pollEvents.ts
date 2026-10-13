import { db } from './db.js';
import type { HubEvent } from './hub.js';

// What PollAnywhere reports to the class hub's activity log: one entry per student per poll
// (runId = poll id + student). It is re-reported with the student's full set of answers each time
// they change an answer, and once more when the poll closes, marked final. The hub shows the
// latest report for each entry, so students and instructors see the current (then final) answers.

interface PollInfo {
  id: string;
  title: string;
  slug: string | null;
  access_code: string;
}

interface QuestionInfo {
  id: string;
  question_text: string;
  is_visible: boolean;
}

type Chosen = Map<string, string[]>; // question id -> chosen option texts

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export function appOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

export const runIdFor = (pollId: string, studentId: string) => `${pollId}:${studentId}`;

function answersEvent(
  poll: PollInfo,
  questions: QuestionInfo[],
  chosen: Chosen,
  studentId: string,
  origin: string,
  final: boolean,
): HubEvent {
  // Questions the student could see or did answer, in poll order (hidden, unanswered ones are left out).
  const shown = questions.filter((q) => q.is_visible || chosen.has(q.id));
  const answers = shown.map((q, i) => ({
    question: clip(`${i + 1}. ${q.question_text}`, 500),
    answer: chosen.has(q.id) ? clip(chosen.get(q.id)!.join('; '), 500) : 'No answer',
  }));
  const answered = shown.filter((q) => chosen.has(q.id)).length;
  const progress = `${answered} of ${shown.length} question${shown.length === 1 ? '' : 's'}`;
  const pollTitle = clip(poll.title, 120);
  const only = answers.length === 1 && answered === 1 ? clip(answers[0].answer, 120) : null;

  return {
    actorId: studentId,
    type: 'poll.answered',
    title: `${final ? 'Final answers to' : 'Answered'} "${pollTitle}": ${only ?? progress}`,
    // Field order is the order shown in the class activity log.
    snapshot: {
      poll: poll.title,
      status: final ? 'Final: the poll is closed' : 'Poll open: answers can still change',
      answered: progress,
      answers,
    },
    runId: runIdFor(poll.id, studentId),
    link: `${origin}/vote/${encodeURIComponent(poll.slug || poll.access_code)}`,
  };
}

async function pollAndQuestions(pollId: string) {
  const [[poll], questions] = await db().transaction([
    db()`SELECT id, title, slug, access_code FROM polls WHERE id = ${pollId}`,
    db()`
      SELECT id, question_text, is_visible FROM questions
      WHERE poll_id = ${pollId} ORDER BY question_order, created_at`,
  ]);
  return { poll: poll as PollInfo, questions: questions as QuestionInfo[] };
}

// One student's current answers to a poll.
export async function studentAnswersEvent(pollId: string, studentId: string, origin: string): Promise<HubEvent> {
  const { poll, questions } = await pollAndQuestions(pollId);
  const rows = await db()`
    SELECT r.question_id, array_agg(ao.option_text ORDER BY ao.option_order, ao.created_at) AS chosen
    FROM sessions s
    JOIN responses r ON r.session_id = s.id
    JOIN answer_options ao ON ao.id = r.answer_option_id
    WHERE s.poll_id = ${pollId} AND s.student_id = ${studentId}
    GROUP BY r.question_id`;
  const chosen: Chosen = new Map(rows.map((r) => [String(r.question_id), r.chosen as string[]]));
  return answersEvent(poll, questions, chosen, studentId, origin, false);
}

// Every student's final answers when the poll closes (students who answered nothing are skipped).
export async function finalAnswersEvents(pollId: string, origin: string): Promise<HubEvent[]> {
  const { poll, questions } = await pollAndQuestions(pollId);
  const rows = await db()`
    SELECT s.student_id, r.question_id, array_agg(ao.option_text ORDER BY ao.option_order, ao.created_at) AS chosen
    FROM sessions s
    JOIN responses r ON r.session_id = s.id
    JOIN answer_options ao ON ao.id = r.answer_option_id
    WHERE s.poll_id = ${pollId} AND s.student_id IS NOT NULL
    GROUP BY s.student_id, r.question_id`;
  const byStudent = new Map<string, Chosen>();
  for (const r of rows) {
    const id = String(r.student_id);
    if (!byStudent.has(id)) byStudent.set(id, new Map());
    byStudent.get(id)!.set(String(r.question_id), r.chosen as string[]);
  }
  return [...byStudent.entries()].map(([studentId, chosen]) =>
    answersEvent(poll, questions, chosen, studentId, origin, true));
}
