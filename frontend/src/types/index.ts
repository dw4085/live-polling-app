// Poll Types
export type PollState = 'draft' | 'open' | 'closed' | 'archived';

export type ChartType = 'horizontal_bar' | 'vertical_bar' | 'pie' | 'donut';

export interface Poll {
  id: string;
  title: string;
  slug: string | null;
  access_code: string;
  password_hash: string | null;
  state: PollState;
  results_revealed: boolean;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  auto_delete_at: string | null;
}

export interface Question {
  id: string;
  poll_id: string;
  question_text: string;
  question_order: number;
  chart_type: ChartType;
  is_revealed: boolean;
  created_at: string;
  updated_at: string;
  answer_options?: AnswerOption[];
}

export interface AnswerOption {
  id: string;
  question_id: string;
  option_text: string;
  option_order: number;
  color: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  poll_id: string;
  session_token: string;
  created_at: string;
  last_activity_at: string;
}

export interface Response {
  id: string;
  session_id: string;
  question_id: string;
  answer_option_id: string;
  submitted_at: string;
  updated_at: string;
}

export interface CrossTabConfig {
  id: string;
  poll_id: string;
  question_1_id: string;
  question_2_id: string;
  created_at: string;
}

// Aggregated Results
export interface ResponseCount {
  question_id: string;
  answer_option_id: string;
  option_text: string;
  option_order: number;
  color: string | null;
  response_count: number;
}

export interface CrossTabResult {
  q1_option_id: string;
  q1_option_text: string;
  q2_option_id: string;
  q2_option_text: string;
  count: number;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface PollWithQuestions extends Poll {
  questions: Question[];
}

// Form Types
export interface CreatePollInput {
  title: string;
  slug?: string;
  password?: string;
}

export interface CreateQuestionInput {
  poll_id: string;
  question_text: string;
  chart_type?: ChartType;
  answer_options: { option_text: string }[];
}

export interface SubmitResponseInput {
  session_token: string;
  question_id: string;
  answer_option_id: string;
}
