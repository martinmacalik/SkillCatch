import { Route, Routes } from 'react-router-dom'

import LandingPage from '@/pages/LandingPage.tsx'
import SignInPage from './pages/SignInPage'
import AuthCallback from './pages/AuthCallback.tsx'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardLayout } from './components/layout/DashboardLayout'
import DashboardPage from './pages/DashboardPage'
import ChatsPage from './pages/ChatsPage'
import SkillsPage from './pages/SkillsPage'
import LearnPage from './pages/LearnPage'
import DiscoverPage from './pages/DiscoverPage'
import HelpPage from './pages/HelpPage'
import SkillFeedbackPage from './pages/SkillFeedbackPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="chats" element={<ChatsPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="learn" element={<LearnPage />} />
        <Route path="discover" element={<DiscoverPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="skill-feedback" element={<SkillFeedbackPage />} />
      </Route>
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="*"
        element={
          <div className="page-container">
            <h1 className="text-2xl font-semibold tracking-tight">404</h1>
            <p className="mt-2 text-zinc-400">Tahle stránka neexistuje.</p>
          </div>
        }
      />
    </Routes>
  )
}
