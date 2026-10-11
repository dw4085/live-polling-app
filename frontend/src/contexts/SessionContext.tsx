import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { createSession, getSession, submitAnswers } from '../services/api';
import type { Response } from '../types';

interface SessionContextType {
  sessionId: string | null;
  sessionToken: string | null;
  responses: Record<string, string | string[]>; // questionId -> answerOptionId or answerOptionIds[]
  loading: boolean;
  initSession: (pollId: string) => Promise<void>;
  saveResponse: (questionId: string, answerOptionId: string) => Promise<void>;
  saveMultiResponse: (questionId: string, answerOptionIds: string[]) => Promise<void>;
  clearSession: () => void;
  clearResponses: () => void;
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(() => localStorage.getItem('session_token'));
  const [responses, setResponses] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(false);

  const initSession = useCallback(async (pollId: string) => {
    setLoading(true);
    try {
      // Check for existing session in localStorage
      const storedToken = localStorage.getItem('session_token');
      const storedPollId = localStorage.getItem('session_poll_id');

      if (storedToken && storedPollId === pollId) {
        // Try to restore existing session
        try {
          const existing = await getSession(storedToken);
          if (existing.session.poll_id === pollId) {
            setSessionId(existing.session.id);
            setSessionToken(storedToken);
            setResponses(toResponseMap(existing.responses));
            return;
          }
        } catch {
          // Session expired or was removed; start a new one
        }
      }

      // Create new session (the server issues the token)
      const session = await createSession(pollId);
      setSessionId(session.id);
      setSessionToken(session.session_token);
      localStorage.setItem('session_token', session.session_token);
      localStorage.setItem('session_poll_id', pollId);
      setResponses({});
    } catch (error) {
      console.error('Failed to start session:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Save to the server; if it's rejected (e.g. the poll just closed), resync from the server
  const persist = useCallback(async (questionId: string, answerOptionIds: string[]) => {
    if (!sessionToken) return;
    try {
      await submitAnswers(sessionToken, questionId, answerOptionIds);
    } catch (error) {
      console.error('Failed to save answer:', error);
      try {
        setResponses(toResponseMap((await getSession(sessionToken)).responses));
      } catch {
        // Leave the optimistic state; the next refresh will correct it
      }
    }
  }, [sessionToken]);

  const saveResponse = useCallback(async (questionId: string, answerOptionId: string) => {
    if (!sessionToken) return;

    // Optimistically update UI
    setResponses(prev => ({
      ...prev,
      [questionId]: answerOptionId
    }));

    await persist(questionId, [answerOptionId]);
  }, [sessionToken, persist]);

  const saveMultiResponse = useCallback(async (questionId: string, answerOptionIds: string[]) => {
    if (!sessionToken) return;

    // Optimistically update UI
    setResponses(prev => ({
      ...prev,
      [questionId]: answerOptionIds.length === 1 ? answerOptionIds[0] : answerOptionIds
    }));

    await persist(questionId, answerOptionIds);
  }, [sessionToken, persist]);

  const clearSession = useCallback(() => {
    setSessionId(null);
    setSessionToken(null);
    setResponses({});
    localStorage.removeItem('session_token');
    localStorage.removeItem('session_poll_id');
  }, []);

  const clearResponses = useCallback(() => {
    setResponses({});
  }, []);

  // Reload this participant's answers (e.g. after the admin resets the poll)
  const refreshResponses = useCallback(async () => {
    if (!sessionToken || !sessionId) return;
    try {
      const existing = await getSession(sessionToken);
      setResponses(toResponseMap(existing.responses));
    } catch {
      // Keep current answers on a transient failure
    }
  }, [sessionToken, sessionId]);

  return (
    <SessionContext.Provider value={{
      sessionId,
      sessionToken,
      responses,
      loading,
      initSession,
      saveResponse,
      saveMultiResponse,
      clearSession,
      clearResponses,
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
