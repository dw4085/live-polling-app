import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getMe, passwordLogin, passwordLogout, requestAdminAccess } from '../services/api';
import { authClient, signInWithGoogle } from '../services/auth';
import type { Admin, AdminSignupInput } from '../types';

interface AuthResult {
  success: boolean;
  error?: string;
}

interface AdminContextType {
  isAuthenticated: boolean;
  loading: boolean;
  admin: Admin | null;
  // Email of the signed-in Google account (may have no admin record yet)
  signedInEmail: string | null;
  isSuperadmin: boolean;
  isPending: boolean;
  loginWithPassword: (password: string) => Promise<AuthResult>;
  loginWithGoogle: (returnPath?: string) => Promise<AuthResult>;
  signup: (input: Omit<AdminSignupInput, 'email'>) => Promise<AuthResult>;
  refresh: () => Promise<Admin | null>;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const isAuthenticated = admin !== null;
  const isSuperadmin = admin?.role === 'superadmin';
  const isPending = admin?.status === 'pending';

  // Ask the server who we are (superadmin password cookie or Google session)
  const refresh = useCallback(async (): Promise<Admin | null> => {
    try {
      // Completes a Google sign-in redirect (exchanges ?neon_auth_session_verifier)
      if (new URLSearchParams(window.location.search).has('neon_auth_session_verifier')) {
        await authClient.getSession();
      }
      const me = await getMe();
      setAdmin(me.admin);
      setSignedInEmail(me.email);
      return me.admin;
    } catch (error) {
      console.error('Auth check failed:', error);
      setAdmin(null);
      setSignedInEmail(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Superadmin password login (checked server-side)
  const loginWithPassword = useCallback(async (password: string): Promise<AuthResult> => {
    try {
      const { admin: superadmin } = await passwordLogin(password);
      setAdmin(superadmin);
      setSignedInEmail(superadmin.email);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }, []);

  // Google sign-in via Neon Auth; redirects away and back to returnPath
  const loginWithGoogle = useCallback(async (returnPath = '/admin/auth/callback'): Promise<AuthResult> => {
    const error = await signInWithGoogle(returnPath);
    return error ? { success: false, error } : { success: true };
  }, []);

  // Request admin access for the signed-in Google account
  const signup = useCallback(async (input: Omit<AdminSignupInput, 'email'>): Promise<AuthResult> => {
    try {
      const { admin: created } = await requestAdminAccess(input);
      setAdmin(created);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }, []);

  const logout = useCallback(async () => {
    await Promise.allSettled([passwordLogout(), authClient.signOut()]);
    setAdmin(null);
    setSignedInEmail(null);
  }, []);

  return (
    <AdminContext.Provider value={{
      isAuthenticated,
      loading,
      admin,
      signedInEmail,
      isSuperadmin,
      isPending,
      loginWithPassword,
      loginWithGoogle,
      signup,
      refresh,
      logout
    }}>
      {children}
    </AdminContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}
