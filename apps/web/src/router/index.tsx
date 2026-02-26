import { type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/router/ProtectedRoute'
import HealthProfilePage from '@/pages/onboarding/HealthProfilePage'
import HomeCityPage from '@/pages/onboarding/HomeCityPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import SearchPage from '@/pages/search/SearchPage'
import LoginPage from '@/pages/auth/LoginPage'
import SignupPage from '@/pages/auth/SignupPage'
import ChatPage from '@/pages/chat/ChatPage'
import PollutionMapPage from '@/pages/map/PollutionMapPage'

// redirects users based on signin context.
function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading, signInRedirect } = useAuth()
  if (loading) return null
  if (user) return <Navigate to={signInRedirect ?? '/dashboard'} replace />
  return <>{children}</>
}

export const AppRouter = () => {
  return (
    <Routes>
      {/* redirects public routes to dashboard if authenticated. */}
      <Route
        path="/"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnlyRoute>
            <SignupPage />
          </PublicOnlyRoute>
        }
      />

      {/* redirects protected routes to login if unauthenticated. */}
      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding/profile" element={<HealthProfilePage />} />
        <Route path="/onboarding/city" element={<HomeCityPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:sessionId" element={<ChatPage />} />
        <Route path="/map" element={<PollutionMapPage />} />
      </Route>
    </Routes>
  )
}
