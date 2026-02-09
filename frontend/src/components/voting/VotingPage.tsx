import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext';
import { getPollByCode, getQuestionsForPoll, getResponseCounts, subscribeToQuestions, subscribeToPollState } from '../../services/supabase';
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
  const { initSession, responses, loading: sessionLoading, refreshResponses } = useSession();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [responseCounts, setResponseCounts] = useState<ResponseCount[]>([]);
  const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({});

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

    // Poll for changes every second (more reliable than subscriptions)
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

      // Refetch questions to get visibility changes
      const questionsData = await getQuestionsForPoll(poll.id);
      setQuestions(questionsData);

      // Refresh responses to detect if admin reset them
      await refreshResponses();
    }, 1000);

    return () => {
      clearInterval(interval);
      questionsSub.unsubscribe();
      pollSub.unsubscribe();
    };
  }, [poll?.id, code, refreshResponses]);

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

  const toggleResultsExpand = (questionId: string) => {
    setExpandedResults(prev => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  // Filter to only show visible questions
  const visibleQuestions = questions.filter(q => q.is_visible);

  // Count answered among visible questions only
  const answeredCount = visibleQuestions.filter(q => responses[q.id]).length;
  const totalQuestions = visibleQuestions.length;
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-columbia-blue text-sm font-medium">PollAnywhere</span>
              <span className="text-gray-400">|</span>
              <h1 className="text-lg font-semibold truncate">{poll?.title}</h1>
            </div>
          </div>
          <ProgressIndicator answered={answeredCount} total={totalQuestions} />
        </div>
      </header>

      {/* Questions */}
      <main className="max-w-2xl mx-auto p-4 pb-24">
        {visibleQuestions.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4 animate-pulse">⏳</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Waiting for Questions</h2>
            <p className="text-gray-500">
              The administrator will reveal questions shortly.
              <br />
              Please keep this page open.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {visibleQuestions.map((question, index) => (
              <div key={question.id} className="space-y-4">
                <QuestionCard
                  question={question}
                  questionNumber={index + 1}
                  selectedAnswer={responses[question.id]}
                />
                {/* Show collapsible chart below question when results are revealed */}
                {poll?.results_revealed && (
                  <div className="animate-fade-in">
                    <button
                      onClick={() => toggleResultsExpand(question.id)}
                      className="w-full text-sm text-gray-500 flex items-center gap-2 hover:text-gray-700 transition-colors py-2"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${expandedResults[question.id] ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span>📊</span>
                      <span>Live results from all participants</span>
                      <span className="text-xs text-gray-400">
                        ({expandedResults[question.id] ? 'click to collapse' : 'click to expand'})
                      </span>
                    </button>
                    {expandedResults[question.id] && (
                      <SingleQuestionChart
                        question={question}
                        results={getResultsForQuestion(question.id)}
                      />
                    )}
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
