import { useState } from 'react';

interface PasswordModalProps {
  onSubmit: (password: string) => Promise<boolean>;
  onCancel: () => void;
}

export function PasswordModal({ onSubmit, onCancel }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const success = await onSubmit(password);
    if (!success) {
      setError('Incorrect password');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-navy mb-4">Password Required</h2>
        <p className="text-gray-600 mb-6">This poll is password protected. Please enter the password to continue.</p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy mb-4"
            autoFocus
          />

          {error && (
            <p className="text-red-500 text-sm mb-4">{error}</p>
          )}

          <div className="flex gap-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="flex-1 px-4 py-3 bg-navy text-white rounded-lg hover:bg-navy-light transition-colors disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
