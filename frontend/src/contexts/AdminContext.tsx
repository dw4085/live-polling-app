import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../services/supabase';
import type { Admin, AdminSignupInput } from '../types';

// Superadmin email for master password access
const SUPERADMIN_EMAIL = 'djw2104@columbia.edu';

// Master password for superadmin (fallback when Supabase Auth not available)
const MASTER_PASSWORD = 'Spotify4085!';

interface AuthResult {
  success: boolean;
  error?: string;
}

interface AdminContextType {
  isAuthenticated: boolean;
  loading: boolean;
  admin: Admin | null;
  isSuperadmin: boolean;
  isPending: boolean;
  loginWithPassword: (password: string) => Promise<AuthResult>;
  loginWithMagicLink: (email: string) => Promise<AuthResult>;
  signup: (input: AdminSignupInput) => Promise<AuthResult>;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState<Admin | null>(null);

  const isSuperadmin = admin?.role === 'superadmin';
  const isPending = admin?.status === 'pending';

  // Fetch admin record by auth user ID
  const fetchAdminByAuthId = useCallback(async (authUserId: string): Promise<Admin | null> => {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('auth_user_id', authUserId)
      .single();

    if (error || !data) return null;
    return data as Admin;
  }, []);

  // Fetch admin record by email
  const fetchAdminByEmail = useCallback(async (email: string): Promise<Admin | null> => {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) return null;
    return data as Admin;
  }, []);

  // Check authentication state on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        // Check for dev-mode token first
        const devToken = localStorage.getItem('admin_token');
        if (devToken === 'dev-superadmin-token') {
          // Fetch superadmin record
          const superadmin = await fetchAdminByEmail(SUPERADMIN_EMAIL);
          if (superadmin) {
            setAdmin(superadmin);
            setIsAuthenticated(true);
          }
          setLoading(false);
          return;
        }

        // Check Supabase Auth session
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          const adminRecord = await fetchAdminByAuthId(session.user.id);
          if (adminRecord) {
            setAdmin(adminRecord);
            setIsAuthenticated(true);
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const adminRecord = await fetchAdminByAuthId(session.user.id);
        if (adminRecord) {
          setAdmin(adminRecord);
          setIsAuthenticated(true);
        }
      } else if (event === 'SIGNED_OUT') {
        setAdmin(null);
        setIsAuthenticated(false);
        localStorage.removeItem('admin_token');
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchAdminByAuthId, fetchAdminByEmail]);

  // Login with master password (superadmin only)
  const loginWithPassword = useCallback(async (password: string): Promise<AuthResult> => {
    if (password !== MASTER_PASSWORD) {
      return { success: false, error: 'Incorrect password' };
    }

    // Password is correct - set up superadmin session
    // Store dev token for session persistence
    localStorage.setItem('admin_token', 'dev-superadmin-token');

    // Fetch superadmin record
    const superadmin = await fetchAdminByEmail(SUPERADMIN_EMAIL);
    if (superadmin) {
      setAdmin(superadmin);
      setIsAuthenticated(true);
      return { success: true };
    }

    return { success: false, error: 'Superadmin record not found' };
  }, [fetchAdminByEmail]);

  // Login with magic link
  const loginWithMagicLink = useCallback(async (email: string): Promise<AuthResult> => {
    // Check if admin exists and is approved
    const existingAdmin = await fetchAdminByEmail(email);

    if (!existingAdmin) {
      return { success: false, error: 'No account found with this email. Please request access first.' };
    }

    if (existingAdmin.status === 'pending') {
      return { success: false, error: 'Your account is pending approval.' };
    }

    if (existingAdmin.status === 'rejected') {
      return { success: false, error: 'Your account request was not approved.' };
    }

    // Send magic link
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/admin/auth/callback`
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  }, [fetchAdminByEmail]);

  // Sign up new admin
  const signup = useCallback(async (input: AdminSignupInput): Promise<AuthResult> => {
    // Check if admin already exists
    const existing = await fetchAdminByEmail(input.email);
    if (existing) {
      if (existing.status === 'pending') {
        return { success: false, error: 'An account with this email is already pending approval.' };
      }
      return { success: false, error: 'An account with this email already exists.' };
    }

    // Send magic link for signup
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: input.email,
      options: {
        emailRedirectTo: `${window.location.origin}/admin/auth/callback`,
        data: {
          name: input.name,
          affiliation: input.affiliation || null
        }
      }
    });

    if (authError) {
      return { success: false, error: authError.message };
    }

    // Create pending admin record (without auth_user_id for now - will be linked on callback)
    const { error: insertError } = await supabase
      .from('admins')
      .insert({
        email: input.email,
        name: input.name,
        affiliation: input.affiliation || null,
        role: 'admin',
        status: 'pending'
      });

    if (insertError) {
      // Check if it's a unique constraint violation
      if (insertError.code === '23505') {
        return { success: false, error: 'An account with this email already exists.' };
      }
      return { success: false, error: insertError.message };
    }

    return { success: true };
  }, [fetchAdminByEmail]);

  // Logout
  const logout = useCallback(async () => {
    localStorage.removeItem('admin_token');
    await supabase.auth.signOut();
    setAdmin(null);
    setIsAuthenticated(false);
  }, []);

  return (
    <AdminContext.Provider value={{
      isAuthenticated,
      loading,
      admin,
      isSuperadmin,
      isPending,
      loginWithPassword,
      loginWithMagicLink,
      signup,
      logout
    }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}

// Hook to refresh admin data (e.g., after approval)
export function useRefreshAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useRefreshAdmin must be used within an AdminProvider');
  }

  return async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data } = await supabase
        .from('admins')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .single();

      if (data) {
        // Force context update by triggering auth state change
        window.location.reload();
      }
    }
  };
}
