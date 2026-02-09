import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { createSession, getSessionByToken, getSessionResponses, submitResponse } from '../services/supabase';

interface SessionContextType {
  sessionId: string | null;
  sessionToken: string | null;
  responses: Record<string, string>; // questionId -> answerOptionId
  loading: boolean;
  initSession: (pollId: string) => Promise<void>;
  saveResponse: (questionId: string, answerOptionId: string) => Promise<void>;
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextType | null>(null);

function generateSessionToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Load existing session from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('session_token');
    if (storedToken) {
      setSessionToken(storedToken);
    }
  }, []);

  const initSession = useCallback(async (pollId: string) => {
    setLoading(true);
    try {
      // Check for existing session in localStorage
      const storedToken = localStorage.getItem('session_token');
      const storedPollId = localStorage.getItem('session_poll_id');

      if (storedToken && storedPollId === pollId) {
        // Try to restore existing session
        const existingSession = await getSessionByToken(storedToken);
        if (existingSession && existingSession.poll_id === pollId) {
          setSessionId(existingSession.id);
          setSessionToken(storedToken);

          // Load existing responses
          const existingResponses = await getSessionResponses(existingSession.id);
          const responseMap: Record<string, string> = {};
          existingResponses.forEach((r) => {
            responseMap[r.question_id] = r.answer_option_id;
          });
          setResponses(responseMap);
          return;
        }
      }

      // Create new session
      const newToken = generateSessionToken();
      const session = await createSession(pollId, newToken);

      if (session) {
        setSessionId(session.id);
        setSessionToken(newToken);
        localStorage.setItem('session_token', newToken);
        localStorage.setItem('session_poll_id', pollId);
        setResponses({});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const saveResponse = useCallback(async (questionId: string, answerOptionId: string) => {
    if (!sessionId) return;

    // Optimistically update UI
    setResponses(prev => ({
      ...prev,
      [questionId]: answerOptionId
    }));

    // Persist to database
    await submitResponse(sessionId, questionId, answerOptionId);
  }, [sessionId]);

  const clearSession = useCallback(() => {
    setSessionId(null);
    setSessionToken(null);
    setResponses({});
    localStorage.removeItem('session_token');
    localStorage.removeItem('session_poll_id');
  }, []);

  return (
    <SessionContext.Provider value={{
      sessionId,
      sessionToken,
      responses,
      loading,
      initSession,
      saveResponse,
      clearSession
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
