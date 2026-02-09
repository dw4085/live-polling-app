import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAdmin } from '../../contexts/AdminContext';
import { supabase } from '../../services/supabase';
import { Loading } from '../common/Loading';
import { ManageAdmins } from './ManageAdmins';
import type { Poll } from '../../types';

type Tab = 'polls' | 'admins';

// Generate random access code
function generateAccessCode(length = 8): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function AdminDashboard() {
  const { isAuthenticated, loading: authLoading, admin, isSuperadmin, isPending, logout } = useAdmin();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('polls');
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPollTitle, setNewPollTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [pendingAdminCount, setPendingAdminCount] = useState(0);

  // Redirect if not authenticated or pending
  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        navigate('/admin');
      } else if (isPending) {
        navigate('/admin/pending');
      }
    }
  }, [isAuthenticated, authLoading, isPending, navigate]);

  // Load polls
  useEffect(() => {
    async function loadPolls() {
      if (!admin) return;

      let query = supabase
        .from('polls')
        .select('*')
        .neq('state', 'archived')
        .order('created_at', { ascending: false });

      // Filter by admin_id unless superadmin
      if (!isSuperadmin) {
        query = query.eq('admin_id', admin.id);
      }

      const { data } = await query;
      setPolls(data || []);
      setLoading(false);
    }

    if (isAuthenticated && admin) {
      loadPolls();
    }
  }, [isAuthenticated, admin, isSuperadmin]);

  // Load pending admin count for superadmin
  useEffect(() => {
    async function loadPendingCount() {
      if (!isSuperadmin) return;

      const { count } = await supabase
        .from('admins')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      setPendingAdminCount(count || 0);
    }

    if (isSuperadmin) {
      loadPendingCount();
    }
  }, [isSuperadmin]);

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPollTitle.trim() || !admin) return;

    setCreating(true);

    // Create poll directly with Supabase
    const { data, error } = await supabase
      .from('polls')
      .insert({
        title: newPollTitle.trim(),
        access_code: generateAccessCode(),
        state: 'draft',
        admin_id: admin.id
      })
      .select()
      .single();

    if (data && !error) {
      navigate(`/admin/poll/${data.id}`);
    } else {
      console.error('Failed to create poll:', error);
      alert('Failed to create poll. Please try again.');
    }
    setCreating(false);
  };

  const handleDeletePoll = async (pollId: string) => {
    if (!confirm('Are you sure you want to delete this poll?')) return;

    const { error } = await supabase
      .from('polls')
      .delete()
      .eq('id', pollId);

    if (!error) {
      setPolls(polls.filter(p => p.id !== pollId));
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

  if (authLoading || loading) {
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
              <div className="text-white">{admin?.name}</div>
              <div className="text-columbia-blue text-xs">
                {isSuperadmin ? 'Superadmin' : 'Admin'}
              </div>
            </div>
            <button
              onClick={logout}
              className="text-columbia-blue hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto p-6">
        {/* Tabs (only show if superadmin) */}
        {isSuperadmin && (
          <div className="flex mb-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('polls')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'polls'
                  ? 'border-navy text-navy'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Your Polls
            </button>
            <button
              onClick={() => setActiveTab('admins')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'admins'
                  ? 'border-navy text-navy'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Manage Admins
              {pendingAdminCount > 0 && (
                <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">
                  {pendingAdminCount}
                </span>
              )}
            </button>
          </div>
        )}

        {activeTab === 'polls' ? (
          <>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-900">
                {isSuperadmin ? 'All Polls' : 'Your Polls'}
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
          </>
        ) : (
          <ManageAdmins />
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
