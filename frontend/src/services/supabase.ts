import { createClient } from '@supabase/supabase-js';
import type { Poll, Question, Session, Response, ResponseCount } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not set. Using placeholder values for development.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// Poll operations
export async function getPollByCode(code: string): Promise<Poll | null> {
  // Try slug first, then access_code
  const { data: bySlug } = await supabase
    .from('polls')
    .select('*')
    .eq('slug', code)
    .single();

  if (bySlug) return bySlug;

  const { data: byCode } = await supabase
    .from('polls')
    .select('*')
    .eq('access_code', code)
    .single();

  return byCode;
}

export async function getQuestionsForPoll(pollId: string): Promise<Question[]> {
  const { data } = await supabase
    .from('questions')
    .select(`
      *,
      answer_options (*)
    `)
    .eq('poll_id', pollId)
    .order('question_order');

  // Sort answer_options by option_order for each question
  if (data) {
    data.forEach(q => {
      if (q.answer_options) {
        q.answer_options.sort((a: any, b: any) => a.option_order - b.option_order);
      }
    });
  }

  return data || [];
}

// Session operations
export async function createSession(pollId: string, sessionToken: string): Promise<Session | null> {
  const { data } = await supabase
    .from('sessions')
    .insert({
      poll_id: pollId,
      session_token: sessionToken
    })
    .select()
    .single();

  return data;
}

export async function getSessionByToken(token: string): Promise<Session | null> {
  const { data } = await supabase
    .from('sessions')
    .select('*')
    .eq('session_token', token)
    .single();

  return data;
}

// Response operations
export async function submitResponse(
  sessionId: string,
  questionId: string,
  answerOptionId: string
): Promise<Response | null> {
  // Check for existing response
  const { data: existing } = await supabase
    .from('responses')
    .select('id')
    .eq('session_id', sessionId)
    .eq('question_id', questionId)
    .single();

  if (existing) {
    // Update existing
    const { data } = await supabase
      .from('responses')
      .update({ answer_option_id: answerOptionId })
      .eq('id', existing.id)
      .select()
      .single();
    return data;
  } else {
    // Insert new
    const { data } = await supabase
      .from('responses')
      .insert({
        session_id: sessionId,
        question_id: questionId,
        answer_option_id: answerOptionId
      })
      .select()
      .single();
    return data;
  }
}

export async function getSessionResponses(sessionId: string): Promise<Response[]> {
  const { data } = await supabase
    .from('responses')
    .select('*')
    .eq('session_id', sessionId);

  return data || [];
}

// Aggregation operations
export async function getResponseCounts(pollId: string): Promise<ResponseCount[]> {
  const { data } = await supabase
    .from('response_counts')
    .select('*')
    .eq('poll_id', pollId);

  return data || [];
}

export async function getParticipantCount(pollId: string): Promise<number> {
  const { data } = await supabase
    .from('active_participants')
    .select('participant_count')
    .eq('poll_id', pollId)
    .single();

  return data?.participant_count || 0;
}

// Real-time subscriptions
export function subscribeToQuestions(
  pollId: string,
  callback: (question: Question) => void
) {
  return supabase
    .channel(`questions-${pollId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'questions',
      filter: `poll_id=eq.${pollId}`
    }, (payload) => {
      callback(payload.new as Question);
    })
    .subscribe();
}

export function subscribeToResponses(
  pollId: string,
  callback: (response: Response) => void
) {
  return supabase
    .channel(`responses-${pollId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'responses'
    }, (payload) => {
      callback(payload.new as Response);
    })
    .subscribe();
}

export function subscribeToPollState(
  pollId: string,
  callback: (poll: Poll) => void
) {
  return supabase
    .channel(`poll-state-${pollId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'polls',
      filter: `id=eq.${pollId}`
    }, (payload) => {
      callback(payload.new as Poll);
    })
    .subscribe();
}
