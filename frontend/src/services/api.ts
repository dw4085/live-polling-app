import type { Admin, AdminSignupInput, AnswerOption, Poll, Question, Response, ResponseCount, Session } from '../types';

// Browser-side wrappers for the PollAnywhere API (api/app.ts). The browser never
// talks to the database directly.

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data as T;
}

const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

// ---------- Participants & projector ----------

export interface LiveState {
  poll: Poll;
  questions: Question[];
  counts: ResponseCount[];
}

export function getLiveState(code: string): Promise<LiveState> {
  return request<LiveState>(`live/${encodeURIComponent(code)}`);
}

export async function getCrossTabResponses(code: string, q1: string, q2: string): Promise<Response[]> {
  const params = new URLSearchParams({ q1, q2 });
  const { responses } = await request<{ responses: Response[] }>(`live/${encodeURIComponent(code)}/crosstab?${params}`);
  return responses;
}

export async function createSession(pollId: string): Promise<Session> {
  const { session } = await post<{ session: Session }>('sessions', { poll_id: pollId });
  return session;
}

export function getSession(token: string): Promise<{ session: Session; responses: Pick<Response, 'question_id' | 'answer_option_id'>[] }> {
  return request(`sessions/${encodeURIComponent(token)}`);
}

export async function submitAnswers(sessionToken: string, questionId: string, answerOptionIds: string[]): Promise<void> {
  await post('responses', { session_token: sessionToken, question_id: questionId, answer_option_ids: answerOptionIds });
}

// ---------- Admin identity ----------

export interface Me {
  admin: Admin | null;
  email: string | null;
  signedIn: boolean;
}

export const getMe = () => request<Me>('admin/me');
export const passwordLogin = (password: string) => post<{ admin: Admin }>('admin/login', { password });
export const passwordLogout = () => post('admin/logout');
export const requestAdminAccess = (input: Omit<AdminSignupInput, 'email'>) => post<{ admin: Admin }>('admin/signup', input);

// ---------- Admin: polls, questions, options ----------

export async function listPolls(): Promise<Poll[]> {
  return (await request<{ polls: Poll[] }>('admin/polls')).polls;
}

export async function createPoll(title: string): Promise<Poll> {
  return (await post<{ poll: Poll }>('admin/polls', { title })).poll;
}

export function getPollForEditing(pollId: string) {
  return request<{ poll: Poll; questions: Question[]; participant_count: number }>(`admin/polls/${pollId}`);
}

export async function updatePoll(pollId: string, updates: Partial<Pick<Poll, 'title' | 'state' | 'results_revealed'>>): Promise<Poll> {
  return (await patch<{ poll: Poll }>(`admin/polls/${pollId}`, updates)).poll;
}

export const deletePoll = (pollId: string) => del(`admin/polls/${pollId}`);
export const resetPollResponses = (pollId: string) => post(`admin/polls/${pollId}/reset`);
export const setAllQuestionsVisible = (pollId: string, visible: boolean) => post(`admin/polls/${pollId}/visibility`, { visible });

export async function getParticipantCount(pollId: string): Promise<number> {
  return (await request<{ participant_count: number }>(`admin/polls/${pollId}/participants`)).participant_count;
}

export async function addQuestion(pollId: string): Promise<Question[]> {
  return (await post<{ questions: Question[] }>(`admin/polls/${pollId}/questions`)).questions;
}

export type QuestionUpdate = Partial<Pick<Question, 'question_text' | 'chart_type' | 'allow_multiple' | 'is_revealed' | 'is_visible'>>;

export const updateQuestion = (questionId: string, updates: QuestionUpdate) => patch(`admin/questions/${questionId}`, updates);
export const deleteQuestion = (questionId: string) => del(`admin/questions/${questionId}`);

export async function addOption(questionId: string, optionText: string): Promise<AnswerOption> {
  return (await post<{ option: AnswerOption }>(`admin/questions/${questionId}/options`, { option_text: optionText })).option;
}

export const updateOption = (optionId: string, optionText: string) => patch(`admin/options/${optionId}`, { option_text: optionText });
export const deleteOption = (optionId: string) => del(`admin/options/${optionId}`);

// ---------- Superadmin ----------

export interface PollWithQuestionCount extends Poll {
  question_count: number;
}

export interface AdminWithPolls extends Admin {
  polls: PollWithQuestionCount[];
}

export async function listAdmins(): Promise<AdminWithPolls[]> {
  return (await request<{ admins: AdminWithPolls[] }>('admin/admins')).admins;
}

export async function setAdminStatus(adminId: string, status: 'approved' | 'rejected'): Promise<Admin> {
  return (await patch<{ admin: Admin }>(`admin/admins/${adminId}`, { status })).admin;
}

export const deleteAdmin = (adminId: string) => del(`admin/admins/${adminId}`);
