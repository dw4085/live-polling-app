import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { Loading } from '../common/Loading';

export function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      // Get the session from the URL hash
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      if (!session?.user) {
        setError('No session found. Please try logging in again.');
        return;
      }

      // Link auth user to admin record if not already linked
      const { data: adminData, error: fetchError } = await supabase
        .from('admins')
        .select('*')
        .eq('email', session.user.email)
        .single();

      if (fetchError || !adminData) {
        setError('No admin account found for this email.');
        return;
      }

      // Update auth_user_id if not set
      if (!adminData.auth_user_id) {
        await supabase
          .from('admins')
          .update({ auth_user_id: session.user.id })
          .eq('id', adminData.id);
      }

      // Redirect based on admin status
      if (adminData.status === 'pending') {
        navigate('/admin/pending');
      } else if (adminData.status === 'approved') {
        navigate('/admin/dashboard');
      } else {
        setError('Your account request was not approved.');
      }
    }

    handleCallback();
  }, [navigate]);

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
