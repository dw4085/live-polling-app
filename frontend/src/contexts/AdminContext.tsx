import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { adminLogin, verifyAdminToken } from '../services/api';

// Development mode password (when API isn't available)
const DEV_PASSWORD = 'Spotify4085!';

interface AdminContextType {
  isAuthenticated: boolean;
  loading: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    async function checkAuth() {
      const token = localStorage.getItem('admin_token');
      if (token) {
        // In dev mode, just check if token exists
        if (token === 'dev-token') {
          setIsAuthenticated(true);
          setLoading(false);
          return;
        }
        const result = await verifyAdminToken();
        if (result.data?.valid) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('admin_token');
        }
      }
      setLoading(false);
    }
    checkAuth();
  }, []);

  const login = useCallback(async (password: string): Promise<boolean> => {
    // Try API first
    const result = await adminLogin(password);
    if (result.data?.token) {
      localStorage.setItem('admin_token', result.data.token);
      setIsAuthenticated(true);
      return true;
    }

    // Fallback: dev mode password check (when API not available)
    if (password === DEV_PASSWORD) {
      localStorage.setItem('admin_token', 'dev-token');
      setIsAuthenticated(true);
      return true;
    }

    return false;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('admin_token');
    setIsAuthenticated(false);
  }, []);

  return (
    <AdminContext.Provider value={{
      isAuthenticated,
      loading,
      login,
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
