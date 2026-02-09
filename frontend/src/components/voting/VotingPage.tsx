import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext';
import { getPollByCode, getQuestionsForPoll, getResponseCounts, subscribeToQuestions, subscribeToPollState, subscribeToResponses } from '../../services/supabase';
import { verifyPollPassword } from '../../services/api';
import { Loading } from '../common/Loading';
import { PasswordModal } from '../common/PasswordModal';
import { QuestionCard } from './QuestionCard';
import { ProgressIndicator } from './ProgressIndicator';
import { SingleQuestionChart } from '../results/SingleQuestionChart';
import type { Poll, Question, ResponseCount } from '../../types';

export function VotingPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { initSession, responses, loading: sessionLoading } = useSession();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [responseCounts, setResponseCounts] = useState<ResponseCount[]>([]);

  // Load poll data
  useEffect(() => {
    async function loadPoll() {
      if (!code) return;

      const pollData = await getPollByCode(code);
      if (!pollData) {
        setError('Poll not found');
        setLoading(false);
        return;
      }

      if (pollData.state !== 'open') {
        setError(pollData.state === 'closed' ? 'This poll has ended' : 'This poll is not available');
        setLoading(false);
        return;
      }

      setPoll(pollData);

      // Check if password required
      if (pollData.password_hash && !passwordVerified) {
        setShowPasswordModal(true);
        setLoading(false);
        return;
      }

      // Load questions
      const questionsData = await getQuestionsForPoll(pollData.id);
      setQuestions(questionsData);

      // Initialize session
      await initSession(pollData.id);

      setLoading(false);
    }

    loadPoll();
  }, [code, passwordVerified, initSession]);

  // Subscribe to real-time updates and poll for changes
  useEffect(() => {
    if (!poll) return;

    const questionsSub = subscribeToQuestions(poll.id, (updatedQuestion) => {
      setQuestions(prev => {
        const index = prev.findIndex(q => q.id === updatedQuestion.id);
        if (index >= 0) {
          const newQuestions = [...prev];
          newQuestions[index] = { ...newQuestions[index], ...updatedQuestion };
          return newQuestions;
        }
        return prev;
      });
    });

    const pollSub = subscribeToPollState(poll.id, async (updatedPoll) => {
      setPoll(updatedPoll);
      if (updatedPoll.state === 'closed') {
        setError('This poll has ended');
      }
    });

    // Poll for poll state and response counts every second (more reliable than subscriptions)
    const interval = setInterval(async () => {
      // Refetch poll to check for results_revealed changes
      const pollData = await getPollByCode(code!);
      if (pollData) {
        setPoll(pollData);
        if (pollData.state === 'closed') {
          setError('This poll has ended');
        }
        // Fetch response counts if results are revealed
        if (pollData.results_revealed) {
          const counts = await getResponseCounts(pollData.id);
          setResponseCounts(counts);
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      questionsSub.unsubscribe();
      pollSub.unsubscribe();
    };
  }, [poll?.id, code]);

  const handlePasswordSubmit = useCallback(async (password: string): Promise<boolean> => {
    if (!poll) return false;
    const result = await verifyPollPassword(poll.id, password);
    if (result.data?.valid) {
      setPasswordVerified(true);
      setShowPasswordModal(false);
      return true;
    }
    return false;
  }, [poll]);

  const answeredCount = Object.keys(responses).length;
  const totalQuestions = questions.length;
  const allAnswered = answeredCount === totalQuestions && totalQuestions > 0;

  // Helper to get response counts for a specific question
  const getResultsForQuestion = useCallback((questionId: string) => {
    return responseCounts.filter(rc => rc.question_id === questionId);
  }, [responseCounts]);

  if (loading || sessionLoading) {
    return <Loading message="Loading poll..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-navy mb-4">{error}</h1>
          <p className="text-gray-600">Please check the link and try again.</p>
        </div>
      </div>
    );
  }

  if (showPasswordModal) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PasswordModal
          onSubmit={handlePasswordSubmit}
          onCancel={() => navigate('/')}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-navy text-white py-4 px-6 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold truncate">{poll?.title}</h1>
          <ProgressIndicator answered={answeredCount} total={totalQuestions} />
        </div>
      </header>

      {/* Questions */}
      <main className="max-w-2xl mx-auto p-4 pb-24">
        {questions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No questions yet. Please wait for the administrator.
          </div>
        ) : (
          <div className="space-y-6">
            {questions.map((question, index) => (
              <div key={question.id} className="space-y-4">
                <QuestionCard
                  question={question}
                  questionNumber={index + 1}
                  selectedAnswer={responses[question.id]}
                />
                {/* Show chart below question when results are revealed */}
                {poll?.results_revealed && (
                  <div className="animate-fade-in">
                    <div className="text-sm text-gray-500 mb-2 flex items-center gap-1">
                      <span>📊</span>
                      <span>Live results from all participants</span>
                    </div>
                    <SingleQuestionChart
                      question={question}
                      results={getResultsForQuestion(question.id)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Completion message */}
        {allAnswered && (
          <div className="mt-8 p-6 bg-columbia-blue/30 rounded-xl text-center animate-fade-in">
            <div className="text-4xl mb-2">{poll?.results_revealed ? '📊' : '✓'}</div>
            <h2 className="text-xl font-semibold text-navy mb-2">Thanks!</h2>
            <p className="text-gray-600">
              {poll?.results_revealed
                ? 'Results are now visible above. You can still change your answers.'
                : 'Waiting for results...'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
