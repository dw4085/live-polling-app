import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { useAdmin } from '../../contexts/AdminContext';
import type { Admin } from '../../types';

export function ManageAdmins() {
  const { admin: currentAdmin, isSuperadmin } = useAdmin();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAdmins(data as Admin[]);
    }
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
    </div>
  );
}
