import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../../contexts/AdminContext';

export function AdminSignup() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { signup } = useAdmin();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    // Basic validation
    if (!email.trim() || !name.trim()) {
      setError('Email and name are required');
      setSubmitting(false);
      return;
    }

    const result = await signup({
      email: email.trim(),
      name: name.trim(),
      affiliation: affiliation.trim() || undefined
    });

    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error || 'Failed to submit request');
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy to-navy-dark">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
          <div className="text-6xl mb-4">📧</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Check Your Email</h1>
          <p className="text-gray-600 mb-6">
            We've sent a confirmation link to <strong>{email}</strong>.
            <br /><br />
            Click the link in the email to complete your signup. Your account will be pending approval until a superadmin approves your request.
          </p>
          <Link
            to="/admin"
            className="text-navy hover:underline"
          >
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy to-navy-dark">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-navy mb-2">PollAnywhere</h1>
          <p className="text-gray-500 text-sm">Technology Strategy at Columbia Business School</p>
          <p className="text-gray-400 text-sm mt-4">Request Admin Access</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
              required
              autoFocus
            />
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
            disabled={submitting || !email.trim() || !name.trim()}
            className="w-full py-3 bg-navy text-white rounded-lg font-medium hover:bg-navy-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Request Access'}
          </button>
        </form>

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
