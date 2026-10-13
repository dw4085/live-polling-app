import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext';
import { useUser } from '../../contexts/UserContext';
import { getLiveState } from '../../services/api';
import { Loading } from '../common/Loading';
import { QuestionCard } from './QuestionCard';
import { ProgressIndicator } from './ProgressIndicator';
import { SingleQuestionChart } from '../results/SingleQuestionChart';
import type { Poll, Question, ResponseCount } from '../../types';

export function VotingPage() {
  const { code } = useParams<{ code: string }>();
  const { initSession, responses, loading: sessionLoading, refreshResponses } = useSession();
  const { firstName } = useUser();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responseCounts, setResponseCounts] = useState<ResponseCount[]>([]);
  const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({});

  // Last seen poll.updated_at; a change (e.g. an admin reset) triggers reloading our answers
  const pollVersion = useRef<string | null>(null);

  // Load poll data
  useEffect(() => {
    async function loadPoll() {
      if (!code) return;

      let live;
      try {
        live = await getLiveState(code);
      } catch {
        setError('Poll not found');
        setLoading(false);
        return;
      }

      if (live.poll.state !== 'open') {
        setError(live.poll.state === 'closed' ? 'This poll has ended' : 'This poll is not available');
        setLoading(false);
        return;
      }

      pollVersion.current = live.poll.updated_at;
      setPoll(live.poll);
      setQuestions(live.questions);
      setResponseCounts(live.counts);

      // Initialize session
      await initSession(live.poll.id);

      setLoading(false);
    }

    loadPoll();
  }, [code, initSession]);

  // Poll for changes every second (question visibility, reveals, state, resets)
  useEffect(() => {
    if (!poll?.id || !code) return;

    const interval = setInterval(async () => {
      let live;
      try {
        live = await getLiveState(code);
      } catch {
        return; // transient failure; try again next tick
      }

      setPoll(live.poll);
      if (live.poll.state === 'closed') {
        setError('This poll has ended');
      }
      setQuestions(live.questions);
      if (live.poll.results_revealed) {
        setResponseCounts(live.counts);
      }

      // Refresh responses to detect if admin reset them
      if (live.poll.updated_at !== pollVersion.current) {
        pollVersion.current = live.poll.updated_at;
        await refreshResponses();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [poll?.id, code, refreshResponses]);

  const toggleResultsExpand = (questionId: string) => {
    setExpandedResults(prev => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  // Filter to only show visible questions
  const visibleQuestions = questions.filter(q => q.is_visible);

  // Count answered among visible questions only (multi-select with empty array = unanswered)
  const answeredCount = visibleQuestions.filter(q => {
    const r = responses[q.id];
    if (Array.isArray(r)) return r.length > 0;
    return !!r;
  }).length;
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
        <p className="text-xs text-gray-500 mb-4">
          Answering as {firstName}. Your instructor can see your answers; shared results show only totals.
        </p>
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
