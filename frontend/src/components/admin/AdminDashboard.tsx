import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useUser } from '../../contexts/UserContext';
import { hubHomeUrl } from '../../lib/hubLinks';
import { createPoll, deletePoll, listPolls } from '../../services/api';
import { Loading } from '../common/Loading';
import { HubOutboxPanel } from './HubOutboxPanel';
import type { Poll } from '../../types';

export function AdminDashboard() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPollTitle, setNewPollTitle] = useState('');
  const [creating, setCreating] = useState(false);

  // Load polls (instructors and TAs share every poll)
  useEffect(() => {
    listPolls()
      .then(setPolls)
      .catch((error) => console.error('Failed to load polls:', error))
      .finally(() => setLoading(false));
  }, []);

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPollTitle.trim()) return;

    setCreating(true);
    try {
      const poll = await createPoll(newPollTitle.trim());
      navigate(`/admin/poll/${poll.id}`);
    } catch (error) {
      console.error('Failed to create poll:', error);
      alert('Failed to create poll. Please try again.');
    }
    setCreating(false);
  };

  const handleDeletePoll = async (pollId: string) => {
    if (!confirm('Are you sure you want to delete this poll?')) return;

    try {
      await deletePoll(pollId);
      setPolls(polls.filter(p => p.id !== pollId));
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const getStateColor = (state: Poll['state']) => {
    switch (state) {
      case 'draft': return 'bg-gray-100 text-gray-600';
      case 'open': return 'bg-green-100 text-green-700';
      case 'closed': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-navy text-white py-4 px-6 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">PollAnywhere</h1>
            <p className="text-columbia-blue text-xs">Technology Strategy, Columbia Business School</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <div className="text-white">{user.name || user.email}</div>
              <div className="text-columbia-blue text-xs">
                {user.role === 'admin' ? 'Instructor' : 'TA'}
              </div>
            </div>
            <a
              href={hubHomeUrl()}
              className="text-columbia-blue hover:text-white transition-colors"
            >
              Class hub
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto p-6">
        <HubOutboxPanel />

        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            Polls
          </h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-navy text-white rounded-lg hover:bg-navy-light transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Poll
          </button>
        </div>

        {polls.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No polls yet</h3>
            <p className="text-gray-500 mb-6">Create your first poll to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-navy text-white rounded-lg hover:bg-navy-light transition-colors"
            >
              Create Poll
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {polls.map((poll) => (
              <div
                key={poll.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{poll.title}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStateColor(poll.state)}`}>
                        {poll.state}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>Code: <code className="bg-gray-100 px-2 py-0.5 rounded">{poll.access_code}</code></span>
                      {poll.slug && <span>Slug: <code className="bg-gray-100 px-2 py-0.5 rounded">{poll.slug}</code></span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/admin/poll/${poll.id}`}
                      className="px-4 py-2 bg-columbia-blue text-navy rounded-lg hover:bg-columbia-blue-dark transition-colors"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDeletePoll(poll.id)}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-navy mb-6">Create New Poll</h2>
            <form onSubmit={handleCreatePoll}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Poll Title
                </label>
                <input
                  type="text"
                  value={newPollTitle}
                  onChange={(e) => setNewPollTitle(e.target.value)}
                  placeholder="e.g., Netflix Case Study Survey"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
                  autoFocus
                />
              </div>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewPollTitle('');
                  }}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newPollTitle.trim()}
                  className="flex-1 px-4 py-3 bg-navy text-white rounded-lg hover:bg-navy-light transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
