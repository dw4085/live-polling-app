import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  getPollByCode,
  getQuestionsForPoll,
  getResponseCounts,
  subscribeToPollState,
  subscribeToQuestions
} from '../../services/supabase';
import { Loading } from '../common/Loading';
import { SingleQuestionChart } from './SingleQuestionChart';
import { CrossTabChart } from './CrossTabChart';
import type { Poll, Question, ResponseCount } from '../../types';

export function ResultsPage() {
  const { code } = useParams<{ code: string }>();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responseCounts, setResponseCounts] = useState<ResponseCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState(false);
  const [crossTabQuestions, setCrossTabQuestions] = useState<[string, string] | null>(null);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      if (!code) return;

      const pollData = await getPollByCode(code);
      if (!pollData) {
        setError('Poll not found');
        setLoading(false);
        return;
      }

      setPoll(pollData);

      const questionsData = await getQuestionsForPoll(pollData.id);
      setQuestions(questionsData);

      const counts = await getResponseCounts(pollData.id);
      setResponseCounts(counts);

      setLoading(false);
    }

    loadData();
  }, [code]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!poll) return;

    // Refresh counts periodically for real-time effect
    const interval = setInterval(async () => {
      const counts = await getResponseCounts(poll.id);
      setResponseCounts(counts);
    }, 1000);

    const pollSub = subscribeToPollState(poll.id, (updatedPoll) => {
      setPoll(updatedPoll);
    });

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

    return () => {
      clearInterval(interval);
      pollSub.unsubscribe();
      questionsSub.unsubscribe();
    };
  }, [poll?.id]);

  // Filter to only show revealed questions
  const revealedQuestions = useMemo(() => {
    if (!poll) return [];
    if (poll.results_revealed) return questions;
    return questions.filter(q => q.is_revealed);
  }, [poll, questions]);

  // Group response counts by question
  const countsByQuestion = useMemo(() => {
    const grouped: Record<string, ResponseCount[]> = {};
    responseCounts.forEach(rc => {
      if (!grouped[rc.question_id]) {
        grouped[rc.question_id] = [];
      }
      grouped[rc.question_id].push(rc);
    });
    return grouped;
  }, [responseCounts]);

  // Calculate total responses
  const totalResponses = useMemo(() => {
    if (responseCounts.length === 0) return 0;
    const firstQuestionCounts = countsByQuestion[questions[0]?.id] || [];
    return firstQuestionCounts.reduce((sum, rc) => sum + rc.response_count, 0);
  }, [countsByQuestion, questions]);

  if (loading) {
    return <Loading message="Loading results..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-navy mb-4">{error}</h1>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-50 ${presentationMode ? 'presentation-mode' : ''}`}>
      {/* Header */}
      <header className={`bg-navy text-white py-4 px-6 ${presentationMode ? 'py-6' : ''}`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-columbia-blue font-medium ${presentationMode ? 'text-xl' : 'text-sm'}`}>PollAnywhere</span>
              <span className="text-gray-400">|</span>
              <h1 className={`font-semibold ${presentationMode ? 'text-3xl' : 'text-xl'}`}>
                {poll?.title}
              </h1>
            </div>
            <p className="text-columbia-blue text-sm">
              {totalResponses} response{totalResponses !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setPresentationMode(!presentationMode)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                presentationMode
                  ? 'bg-white text-navy'
                  : 'bg-columbia-blue/20 text-columbia-blue hover:bg-columbia-blue/30'
              }`}
            >
              {presentationMode ? 'Exit Presentation' : 'Presentation Mode'}
            </button>
          </div>
        </div>
      </header>

      {/* Results */}
      <main className={`max-w-6xl mx-auto p-6 ${presentationMode ? 'p-12' : ''}`}>
        {revealedQuestions.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <div className="text-6xl mb-4">🔒</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Results not yet revealed</h2>
            <p className="text-gray-500">Waiting for the administrator to reveal results...</p>
          </div>
        ) : (
          <>
            {/* Cross-tab selector */}
            {questions.length >= 2 && (
              <div className="mb-6 p-4 bg-white rounded-xl border border-gray-200">
                <h3 className="text-sm font-medium text-gray-600 mb-2">Cross-Tabulation</h3>
                <div className="flex flex-wrap items-center gap-4">
                  <select
                    value={crossTabQuestions?.[0] || ''}
                    onChange={(e) => {
                      if (e.target.value && crossTabQuestions?.[1]) {
                        setCrossTabQuestions([e.target.value, crossTabQuestions[1]]);
                      } else if (e.target.value) {
                        setCrossTabQuestions([e.target.value, '']);
                      } else {
                        setCrossTabQuestions(null);
                      }
                    }}
                    className="px-3 py-2 border border-gray-200 rounded-lg"
                  >
                    <option value="">Select Question 1</option>
                    {questions.map(q => (
                      <option key={q.id} value={q.id} disabled={q.id === crossTabQuestions?.[1]}>
                        {q.question_text.substring(0, 50)}...
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-400">×</span>
                  <select
                    value={crossTabQuestions?.[1] || ''}
                    onChange={(e) => {
                      if (crossTabQuestions?.[0] && e.target.value) {
                        setCrossTabQuestions([crossTabQuestions[0], e.target.value]);
                      }
                    }}
                    className="px-3 py-2 border border-gray-200 rounded-lg"
                    disabled={!crossTabQuestions?.[0]}
                  >
                    <option value="">Select Question 2</option>
                    {questions.map(q => (
                      <option key={q.id} value={q.id} disabled={q.id === crossTabQuestions?.[0]}>
                        {q.question_text.substring(0, 50)}...
                      </option>
                    ))}
                  </select>
                  {crossTabQuestions?.[0] && crossTabQuestions?.[1] && (
                    <button
                      onClick={() => setCrossTabQuestions(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Cross-tab chart */}
            {crossTabQuestions?.[0] && crossTabQuestions?.[1] && (
              <div className="mb-8">
                <CrossTabChart
                  question1={questions.find(q => q.id === crossTabQuestions[0])!}
                  question2={questions.find(q => q.id === crossTabQuestions[1])!}
                  pollId={poll!.id}
                  presentationMode={presentationMode}
                />
              </div>
            )}

            {/* Individual question charts */}
            <div className={`grid gap-6 ${presentationMode ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
              {revealedQuestions
                .sort((a, b) => a.question_order - b.question_order)
                .map((question) => (
                  <SingleQuestionChart
                    key={question.id}
                    question={question}
                    results={countsByQuestion[question.id] || []}
                    presentationMode={presentationMode}
                  />
                ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
