import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider } from './contexts/SessionContext';
import { UserProvider } from './contexts/UserContext';
import type { HubUser } from './lib/hub';

// Pages
import { VotingPage } from './components/voting/VotingPage';
import { ResultsPage } from './components/results/ResultsPage';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { PollEditor } from './components/admin/PollEditor';
import { NotFound } from './components/common/NotFound';
import { StaffOnly } from './components/common/StaffOnly';

function App({ user }: { user: HubUser }) {
  return (
    <BrowserRouter>
      <UserProvider user={user}>
        <SessionProvider>
          <Routes>
            {/* Signed-in students */}
            <Route path="/vote/:code" element={<VotingPage />} />
            <Route path="/results/:code" element={<ResultsPage />} />

            {/* Instructors and TAs */}
            <Route path="/admin" element={<StaffOnly><AdminDashboard /></StaffOnly>} />
            <Route path="/admin/poll/:pollId" element={<StaffOnly><PollEditor /></StaffOnly>} />

            {/* Redirects */}
            <Route path="/admin/dashboard" element={<Navigate to="/admin" replace />} />
            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionProvider>
      </UserProvider>
    </BrowserRouter>
  );
}

export default App;
