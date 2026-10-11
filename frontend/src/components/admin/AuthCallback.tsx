import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../../contexts/AdminContext';
import { Loading } from '../common/Loading';

// Google sign-in returns here; AdminProvider completes the session exchange on load
export function AuthCallback() {
  const navigate = useNavigate();
  const { admin, loading, signedInEmail } = useAdmin();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (admin?.status === 'approved') {
      navigate('/admin/dashboard', { replace: true });
    } else if (admin?.status === 'pending') {
      navigate('/admin/pending', { replace: true });
    } else if (admin) {
      setError('Your account request was not approved.');
    } else if (signedInEmail) {
      setError(`No admin account found for ${signedInEmail}. Request access first.`);
    } else {
      setError('Sign-in did not complete. Please try again.');
    }
  }, [loading, admin, signedInEmail, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy to-navy-dark">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Authentication Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/admin')}
            className="px-6 py-3 bg-navy text-white rounded-lg hover:bg-navy-light transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy to-navy-dark">
      <div className="text-center">
        <Loading />
        <p className="text-white mt-4">Completing sign in...</p>
      </div>
    </div>
  );
}
