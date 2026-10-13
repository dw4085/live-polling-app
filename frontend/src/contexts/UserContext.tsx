import { createContext, useContext, type ReactNode } from 'react';
import type { HubUser } from '../lib/hub';

// The signed-in person, from the class hub (main.tsx waits for it before rendering the app).
// The hub's instructors and TAs run polls; the server checks this on every admin request.
interface UserContextType {
  user: HubUser;
  isStaff: boolean;
  firstName: string;
}

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ user, children }: { user: HubUser; children: ReactNode }) {
  const isStaff = user.role === 'admin' || user.role === 'ta';
  const firstName = user.name.trim().split(/\s+/)[0] || user.email;
  return <UserContext.Provider value={{ user, isStaff, firstName }}>{children}</UserContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
