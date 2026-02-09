import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { useAdmin } from '../../contexts/AdminContext';
import type { Admin, Poll } from '../../types';

interface PollWithQuestionCount extends Poll {
  question_count: number;
}

interface AdminWithPolls extends Admin {
  polls: PollWithQuestionCount[];
}

export function ManageAdmins() {
  const { admin: currentAdmin, isSuperadmin } = useAdmin();
  const [admins, setAdmins] = useState<AdminWithPolls[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminWithPolls | null>(null);

  const loadAdmins = useCallback(async () => {
    // Fetch admins
    const { data: adminsData, error: adminsError } = await supabase
      .from('admins')
      .select('*')
      .order('created_at', { ascending: false });

    if (adminsError || !adminsData) {
      setLoading(false);
      return;
    }

    // Fetch all polls with question counts
    const { data: pollsData } = await supabase
      .from('polls')
      .select(`
        *,
        questions:questions(count)
      `)
      .neq('state', 'archived');

    // Group polls by admin_id
    const pollsByAdmin: Record<string, PollWithQuestionCount[]> = {};
    if (pollsData) {
      pollsData.forEach((poll: any) => {
        const adminId = poll.admin_id;
        if (!adminId) return;

        const pollWithCount: PollWithQuestionCount = {
          ...poll,
          question_count: poll.questions?.[0]?.count || 0
        };
        delete (pollWithCount as any).questions;

        if (!pollsByAdmin[adminId]) {
          pollsByAdmin[adminId] = [];
        }
        pollsByAdmin[adminId].push(pollWithCount);
      });
    }

    // Combine admins with their polls
    const adminsWithPolls: AdminWithPolls[] = adminsData.map(admin => ({
      ...admin as Admin,
      polls: pollsByAdmin[admin.id] || []
    }));

    setAdmins(adminsWithPolls);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  async function approveAdmin(adminId: string) {
    if (!currentAdmin) return;
    setActionLoading(adminId);

    const { error } = await supabase
      .from('admins')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: currentAdmin.id
      })
      .eq('id', adminId);

    if (!error) {
      setAdmins(admins.map(a =>
        a.id === adminId
          ? { ...a, status: 'approved' as const, approved_at: new Date().toISOString(), approved_by: currentAdmin.id }
          : a
      ));
    }
    setActionLoading(null);
  }

  async function rejectAdmin(adminId: string) {
    if (!confirm('Are you sure you want to reject this admin request?')) return;
    setActionLoading(adminId);

    const { error } = await supabase
      .from('admins')
      .update({ status: 'rejected' })
      .eq('id', adminId);

    if (!error) {
      setAdmins(admins.map(a =>
        a.id === adminId ? { ...a, status: 'rejected' as const } : a
      ));
    }
    setActionLoading(null);
  }

  async function deleteAdmin(adminId: string) {
    if (!confirm('Are you sure you want to delete this admin? This cannot be undone.')) return;
    setActionLoading(adminId);

    const { error } = await supabase
      .from('admins')
      .delete()
      .eq('id', adminId);

    if (!error) {
      setAdmins(admins.filter(a => a.id !== adminId));
    }
    setActionLoading(null);
  }

  const getStatusBadge = (status: Admin['status']) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>;
      case 'approved':
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Approved</span>;
      case 'rejected':
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Rejected</span>;
    }
  };

  const getRoleBadge = (role: Admin['role']) => {
    if (role === 'superadmin') {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Superadmin</span>;
    }
    return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Admin</span>;
  };

  const getStateColor = (state: Poll['state']) => {
    switch (state) {
      case 'draft': return 'bg-gray-100 text-gray-600';
      case 'open': return 'bg-green-100 text-green-700';
      case 'closed': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const pendingCount = admins.filter(a => a.status === 'pending').length;

  if (!isSuperadmin) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">🔒</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h3>
        <p className="text-gray-500">Only superadmins can manage admin accounts.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy mx-auto"></div>
        <p className="text-gray-500 mt-4">Loading admins...</p>
      </div>
    );
  }

  return (
    <div>
      {pendingCount > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600 text-lg">⚠️</span>
            <span className="text-yellow-800 font-medium">
              {pendingCount} admin request{pendingCount > 1 ? 's' : ''} pending approval
            </span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Admin</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Affiliation</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Polls</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {admins.map((admin) => (
              <tr key={admin.id} className={admin.status === 'pending' ? 'bg-yellow-50' : ''}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{admin.name}</div>
                    <div className="text-sm text-gray-500">{admin.email}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {admin.affiliation || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getRoleBadge(admin.role)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(admin.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {admin.polls.length > 0 ? (
                    <button
                      onClick={() => setSelectedAdmin(admin)}
                      className="px-3 py-1 bg-columbia-blue text-navy rounded-lg hover:bg-columbia-blue-dark transition-colors text-sm font-medium"
                    >
                      {admin.polls.length} poll{admin.polls.length !== 1 ? 's' : ''}
                    </button>
                  ) : (
                    <span className="text-sm text-gray-400">0 polls</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(admin.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                  {admin.id !== currentAdmin?.id && (
                    <div className="flex items-center justify-end gap-2">
                      {admin.status === 'pending' && (
                        <>
                          <button
                            onClick={() => approveAdmin(admin.id)}
                            disabled={actionLoading === admin.id}
                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {actionLoading === admin.id ? '...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => rejectAdmin(admin.id)}
                            disabled={actionLoading === admin.id}
                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {admin.role !== 'superadmin' && (
                        <button
                          onClick={() => deleteAdmin(admin.id)}
                          disabled={actionLoading === admin.id}
                          className="px-3 py-1 text-red-600 hover:bg-red-50 rounded"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                  {admin.id === currentAdmin?.id && (
                    <span className="text-gray-400 text-xs">You</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Polls Modal */}
      {selectedAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-navy">{selectedAdmin.name}'s Polls</h2>
                <p className="text-sm text-gray-500">{selectedAdmin.email}</p>
              </div>
              <button
                onClick={() => setSelectedAdmin(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {selectedAdmin.polls.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No polls created yet.</p>
              ) : (
                <div className="space-y-3">
                  {selectedAdmin.polls.map((poll) => (
                    <div
                      key={poll.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900">{poll.title}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStateColor(poll.state)}`}>
                              {poll.state}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                            <span>Code: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{poll.access_code}</code></span>
                            <span>{poll.question_count} question{poll.question_count !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <div className="text-sm text-gray-400">
                          {new Date(poll.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() => setSelectedAdmin(null)}
                className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
