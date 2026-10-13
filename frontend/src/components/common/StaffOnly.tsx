import type { ReactNode } from 'react';
import { useUser } from '../../contexts/UserContext';

// Admin pages are for the class hub's instructors and TAs (the API checks this too).
export function StaffOnly({ children }: { children: ReactNode }) {
  const { isStaff } = useUser();
  if (isStaff) return <>{children}</>;
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold text-navy mb-4">Instructors only</h1>
        <p className="text-gray-600">To answer a poll, open the link your instructor shares.</p>
      </div>
    </div>
  );
}
