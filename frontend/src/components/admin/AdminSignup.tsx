import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdmin } from '../../contexts/AdminContext';
import { Loading } from '../common/Loading';

export function AdminSignup() {
  const [name, setName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { admin, loading, signedInEmail, signup, loginWithGoogle, logout } = useAdmin();
  const navigate = useNavigate();

  // Accounts that already exist go to their status page
  useEffect(() => {
    if (!loading && admin) {
      navigate(admin.status === 'approved' ? '/admin/dashboard' : '/admin/pending');
    }
  }, [loading, admin, navigate]);

  const handleGoogle = async () => {
    setError('');
    setSubmitting(true);
    // Come back to this page signed in, then fill in the request form
    const result = await loginWithGoogle('/admin/signup');
    if (!result.success) {
      setError(result.error || 'Google sign-in failed');
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setSubmitting(true);
    const result = await signup({
      name: name.trim(),
      affiliation: affiliation.trim() || undefined
    });

    if (result.success) {
      navigate('/admin/pending');
    } else {
      setError(result.error || 'Failed to submit request');
    }
    setSubmitting(false);
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy to-navy-dark">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-navy mb-2">PollAnywhere</h1>
          <p className="text-gray-500 text-sm">Technology Strategy at Columbia Business School</p>
          <p className="text-gray-400 text-sm mt-4">Request Admin Access</p>
        </div>

        {!signedInEmail ? (
          <div>
            <p className="text-sm text-gray-600 mb-6">
              First, sign in with the Google account you'll use to run polls. A superadmin then reviews your request.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogle}
              disabled={submitting}
              className="w-full py-3 bg-navy text-white rounded-lg font-medium hover:bg-navy-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Redirecting...' : 'Continue with Google'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <div className="w-full px-4 py-3 border border-gray-200 bg-gray-50 rounded-lg text-gray-700">
                {signedInEmail}
              </div>
              <button
                type="button"
                onClick={logout}
                className="text-xs text-gray-400 hover:text-gray-600 mt-2"
              >
                Use a different Google account
              </button>
            </div>

            <div className="mb-4">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                required
                autoFocus
              />
            </div>

            <div className="mb-6">
              <label htmlFor="affiliation" className="block text-sm font-medium text-gray-700 mb-2">
                Affiliation
              </label>
              <input
                id="affiliation"
                type="text"
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
                placeholder="Columbia Business School"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="w-full py-3 bg-navy text-white rounded-lg font-medium hover:bg-navy-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Request Access'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/admin" className="text-navy hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
