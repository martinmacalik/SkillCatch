import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminShell } from './components/layout/AdminShell';
import { LoginPage } from './pages/LoginPage';
import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { RequestsPage } from './pages/RequestsPage';
import { MessagesPage } from './pages/MessagesPage';
import { AuditPage } from './pages/AuditPage';
import { SuggestionsPage } from './pages/SuggestionsPage';
import { LearningPage } from './pages/LearningPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/access-denied" element={<AccessDeniedPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/requests" replace />} />
            <Route path="requests" element={<RequestsPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="suggestions" element={<SuggestionsPage />} />
            <Route path="learning" element={<LearningPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/requests" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
