import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAdmin } from '../../contexts/AdminContext';
import { supabase, getQuestionsForPoll, getParticipantCount } from '../../services/supabase';
import { Loading } from '../common/Loading';
import { QuestionEditor } from './QuestionEditor';
import type { Poll, Question } from '../../types';

export function PollEditor() {
  const { pollId } = useParams<{ pollId: string }>();
  const { isAuthenticated, loading: authLoading } = useAdmin();
  const navigate = useNavigate();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [participantCount, setParticipantCount] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/admin');
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Load poll data
  useEffect(() => {
    async function loadPoll() {
      if (!pollId) return;

      const { data: pollData } = await supabase
        .from('polls')
        .select('*')
        .eq('id', pollId)
        .single();

      if (!pollData) {
        navigate('/admin/dashboard');
        return;
      }

      setPoll(pollData);
      setTitleInput(pollData.title);

      const questionsData = await getQuestionsForPoll(pollId);
      setQuestions(questionsData);

      const count = await getParticipantCount(pollId);
      setParticipantCount(count);

      setLoading(false);
    }

    if (isAuthenticated) {
      loadPoll();
    }
  }, [pollId, isAuthenticated, navigate]);

  // Subscribe to response updates for participant count
  useEffect(() => {
    if (!pollId) return;

    const interval = setInterval(async () => {
      const count = await getParticipantCount(pollId);
      setParticipantCount(count);
    }, 5000);

    return () => clearInterval(interval);
  }, [pollId]);

  const handleStateChange = async (newState: Poll['state']) => {
    if (!poll) return;
    const { data, error } = await supabase
      .from('polls')
      .update({ state: newState })
      .eq('id', poll.id)
      .select()
      .single();

    if (data && !error) {
      setPoll(data);
    }
  };

  const handleReset = async () => {
    if (!poll) return;
    if (!confirm('Are you sure you want to clear all responses? This cannot be undone.')) return;

    // Delete all responses for this poll's questions
    const questionIds = questions.map(q => q.id);
    if (questionIds.length > 0) {
      await supabase
        .from('responses')
        .delete()
        .in('question_id', questionIds);
    }
    alert('All responses have been cleared.');
  };

  const handleTitleSave = async () => {
    if (!poll || !titleInput.trim()) return;
    const { data, error } = await supabase
      .from('polls')
      .update({ title: titleInput.trim() })
      .eq('id', poll.id)
      .select()
      .single();

    if (data && !error) {
      setPoll(data);
    }
    setEditingTitle(false);
  };

  const handleAddQuestion = async () => {
    if (!poll) return;

    // Get next question order
    const nextOrder = questions.length;

    // Create question
    const { data: questionData, error: questionError } = await supabase
      .from('questions')
      .insert({
        poll_id: poll.id,
        question_text: 'New Question',
        question_order: nextOrder,
        chart_type: 'horizontal_bar'
      })
      .select()
      .single();

    if (questionData && !questionError) {
      // Create default answer options
      await supabase
        .from('answer_options')
        .insert([
          { question_id: questionData.id, option_text: 'Option 1', option_order: 0 },
          { question_id: questionData.id, option_text: 'Option 2', option_order: 1 }
        ]);

      // Reload questions
      const questionsData = await getQuestionsForPoll(poll.id);
      setQuestions(questionsData);
    }
  };

  const handleQuestionUpdate = async (questionId: string, updates: Partial<Question>) => {
    await supabase
      .from('questions')
      .update(updates)
      .eq('id', questionId);

    setQuestions(prev =>
      prev.map(q => q.id === questionId ? { ...q, ...updates } : q)
    );
  };

  const handleQuestionDelete = async (questionId: string) => {
    if (!confirm('Delete this question?')) return;

    await supabase
      .from('questions')
      .delete()
      .eq('id', questionId);

    setQuestions(prev => prev.filter(q => q.id !== questionId));
  };

  const handleRevealQuestion = async (questionId: string, isRevealed: boolean) => {
    await supabase
      .from('questions')
      .update({ is_revealed: isRevealed })
      .eq('id', questionId);

    setQuestions(prev =>
      prev.map(q => q.id === questionId ? { ...q, is_revealed: isRevealed } : q)
    );
  };

  const handleToggleVisibility = async (questionId: string, isVisible: boolean) => {
    await supabase
      .from('questions')
      .update({ is_visible: isVisible })
      .eq('id', questionId);

    setQuestions(prev =>
      prev.map(q => q.id === questionId ? { ...q, is_visible: isVisible } : q)
    );
  };

  const handleRevealAll = async (reveal: boolean) => {
    if (!poll) return;
    const { data, error } = await supabase
      .from('polls')
      .update({ results_revealed: reveal })
      .eq('id', poll.id)
      .select()
      .single();

    if (data && !error) {
      setPoll(data);
    }
  };

  const handleShowAllQuestions = async (visible: boolean) => {
    if (!poll) return;
    const questionIds = questions.map(q => q.id);
    if (questionIds.length === 0) return;

    await supabase
      .from('questions')
      .update({ is_visible: visible })
      .in('id', questionIds);

    setQuestions(prev =>
      prev.map(q => ({ ...q, is_visible: visible }))
    );
  };

  const votingUrl = poll ? `${window.location.origin}/vote/${poll.slug || poll.access_code}` : '';
  const resultsUrl = poll ? `${window.location.origin}/results/${poll.slug || poll.access_code}` : '';

  if (authLoading || loading) {
    return <Loading />;
  }

  if (!poll) {
    return <Loading message="Poll not found" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-navy text-white py-4 px-6 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin/dashboard" className="text-columbia-blue hover:text-white flex items-center gap-2">
              <span>←</span>
              <span className="font-medium">PollAnywhere</span>
            </Link>
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="px-3 py-1 rounded bg-white text-navy"
                  autoFocus
                />
                <button onClick={handleTitleSave} className="text-green-400 hover:text-green-300">Save</button>
                <button onClick={() => setEditingTitle(false)} className="text-gray-400 hover:text-gray-300">Cancel</button>
              </div>
            ) : (
              <h1 className="text-xl font-semibold cursor-pointer hover:text-columbia-blue" onClick={() => setEditingTitle(true)}>
                {poll.title} ✎
              </h1>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-columbia-blue">
              👥 {participantCount} active
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {/* Poll Controls */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* State Controls */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600">Status:</span>
              <div className="flex gap-2">
                {(['draft', 'open', 'closed'] as const).map((state) => (
                  <button
                    key={state}
                    onClick={() => handleStateChange(state)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      poll.state === state
                        ? 'bg-navy text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {state.charAt(0).toUpperCase() + state.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleShowAllQuestions(true)}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors"
              >
                Show All
              </button>
              <button
                onClick={() => handleShowAllQuestions(false)}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Hide All
              </button>
              <button
                onClick={() => handleRevealAll(!poll.results_revealed)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  poll.results_revealed
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {poll.results_revealed ? '✓ Results Revealed' : 'Reveal All Results'}
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-red-100 text-red-600 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
              >
                Reset Responses
              </button>
            </div>
          </div>

          {/* Links */}
          <div className="mt-6 pt-6 border-t border-gray-100 grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Voting Link</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={votingUrl}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(votingUrl)}
                  className="px-3 py-2 bg-columbia-blue text-navy rounded-lg hover:bg-columbia-blue-dark transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Results Link</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={resultsUrl}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(resultsUrl)}
                  className="px-3 py-2 bg-columbia-blue text-navy rounded-lg hover:bg-columbia-blue-dark transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Questions</h2>
          <button
            onClick={handleAddQuestion}
            className="px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-light transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Question
          </button>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500 mb-4">No questions yet</p>
            <button
              onClick={handleAddQuestion}
              className="px-6 py-3 bg-navy text-white rounded-lg hover:bg-navy-light transition-colors"
            >
              Add Your First Question
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {questions
              .sort((a, b) => a.question_order - b.question_order)
              .map((question, index) => (
                <QuestionEditor
                  key={question.id}
                  question={question}
                  questionNumber={index + 1}
                  onUpdate={(updates) => handleQuestionUpdate(question.id, updates)}
                  onDelete={() => handleQuestionDelete(question.id)}
                  onReveal={(reveal) => handleRevealQuestion(question.id, reveal)}
                  onToggleVisibility={(visible) => handleToggleVisibility(question.id, visible)}
                />
              ))}
          </div>
        )}
      </main>
    </div>
  );
}
