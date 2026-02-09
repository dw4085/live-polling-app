import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider } from './contexts/SessionContext';
import { AdminProvider } from './contexts/AdminContext';

// Pages
import { VotingPage } from './components/voting/VotingPage';
import { ResultsPage } from './components/results/ResultsPage';
import { AdminLogin } from './components/admin/AdminLogin';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { PollEditor } from './components/admin/PollEditor';
import { NotFound } from './components/common/NotFound';

function App() {
  return (
    <BrowserRouter>
      <AdminProvider>
        <SessionProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/vote/:code" element={<VotingPage />} />
            <Route path="/results/:code" element={<ResultsPage />} />

            {/* Admin routes */}
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/poll/:pollId" element={<PollEditor />} />

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionProvider>
      </AdminProvider>
    </BrowserRouter>
  );
}

export default App;
