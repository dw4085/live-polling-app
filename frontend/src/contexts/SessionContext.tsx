import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { getMyAnswers, joinPoll, submitAnswers } from '../services/api';
import type { Response } from '../types';

// The signed-in student's participation in the poll on screen. The server knows who they are
// from the class hub's session cookie; this just holds their answers.
interface SessionContextType {
  pollId: string | null;
  responses: Record<string, string | string[]>; // questionId -> answerOptionId or answerOptionIds[]
  loading: boolean;
  initSession: (pollId: string) => Promise<void>;
  saveResponse: (questionId: string, answerOptionId: string) => Promise<void>;
  saveMultiResponse: (questionId: string, answerOptionIds: string[]) => Promise<void>;
  refreshResponses: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | null>(null);

// Group answers per question (multiple answers per question become an array)
function toResponseMap(rows: Pick<Response, 'question_id' | 'answer_option_id'>[]) {
  const responseMap: Record<string, string | string[]> = {};
  rows.forEach((r) => {
    const existing = responseMap[r.question_id];
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(r.answer_option_id);
      } else {
        responseMap[r.question_id] = [existing, r.answer_option_id];
      }
    } else {
      responseMap[r.question_id] = r.answer_option_id;
    }
  });
  return responseMap;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [pollId, setPollId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(false);

  // Join the poll (one session per student per poll) and restore any earlier answers
  const initSession = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const mine = await joinPoll(id);
      setPollId(id);
      setResponses(toResponseMap(mine.responses));
    } catch (error) {
      console.error('Failed to join poll:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload this student's answers (e.g. after the admin resets the poll)
  const refreshResponses = useCallback(async () => {
    if (!pollId) return;
    try {
      setResponses(toResponseMap((await getMyAnswers(pollId)).responses));
    } catch {
      // Keep current answers on a transient failure
    }
  }, [pollId]);

  // Save to the server; if it's rejected (e.g. the poll just closed), resync from the server
  const persist = useCallback(async (questionId: string, answerOptionIds: string[]) => {
    try {
      await submitAnswers(questionId, answerOptionIds);
    } catch (error) {
      console.error('Failed to save answer:', error);
      await refreshResponses();
    }
  }, [refreshResponses]);

  const saveResponse = useCallback(async (questionId: string, answerOptionId: string) => {
    if (!pollId) return;

    // Optimistically update UI
    setResponses(prev => ({
      ...prev,
      [questionId]: answerOptionId
    }));

    await persist(questionId, [answerOptionId]);
  }, [pollId, persist]);

  const saveMultiResponse = useCallback(async (questionId: string, answerOptionIds: string[]) => {
    if (!pollId) return;

    // Optimistically update UI
    setResponses(prev => ({
      ...prev,
      [questionId]: answerOptionIds.length === 1 ? answerOptionIds[0] : answerOptionIds
    }));

    await persist(questionId, answerOptionIds);
  }, [pollId, persist]);

  return (
    <SessionContext.Provider value={{
      pollId,
      responses,
      loading,
      initSession,
      saveResponse,
      saveMultiResponse,
      refreshResponses
    }}>
      {children}
    </SessionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
