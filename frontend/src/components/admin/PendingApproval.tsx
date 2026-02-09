import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../../contexts/AdminContext';
import { Loading } from '../common/Loading';

export function PendingApproval() {
  const { admin, loading, isPending, isAuthenticated, logout } = useAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        navigate('/admin');
      } else if (!isPending) {
        // Admin has been approved
        navigate('/admin/dashboard');
      }
    }
  }, [loading, isAuthenticated, isPending, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/admin');
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy to-navy-dark">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
        <div className="text-6xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Pending Approval</h1>
        <p className="text-gray-600 mb-2">
          Hello, <strong>{admin?.name}</strong>!
        </p>
        <p className="text-gray-600 mb-6">
          Your admin access request is pending approval. You'll receive an email once a superadmin reviews your request.
        </p>
        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left text-sm">
          <div className="mb-2">
            <span className="text-gray-500">Email:</span>{' '}
            <span className="text-gray-900">{admin?.email}</span>
          </div>
          {admin?.affiliation && (
            <div>
              <span className="text-gray-500">Affiliation:</span>{' '}
              <span className="text-gray-900">{admin.affiliation}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-columbia-blue text-navy rounded-lg hover:bg-columbia-blue-dark transition-colors"
          >
            Check Status
          </button>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
