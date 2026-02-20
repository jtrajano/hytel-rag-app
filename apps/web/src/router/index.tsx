import { type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/router/ProtectedRoute'
// import SplashPage from '@/pages/onboarding/SplashPage'
import HealthProfilePage from '@/pages/onboarding/HealthProfilePage'
import HomeCityPage from '@/pages/onboarding/HomeCityPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import SearchPage from '@/pages/search/SearchPage'
import LoginPage from '@/pages/auth/LoginPage'
import ChatPage from '@/pages/chat/ChatPage'

// Redirects authenticated users based on signInRedirect (new user → onboarding, returning → dashboard)
function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading, signInRedirect } = useAuth()
  if (loading) return null
  if (user) return <Navigate to={signInRedirect ?? '/dashboard'} replace />
  return <>{children}</>
}

export const AppRouter = () => {
  return (
    <Routes>
      {/* Public routes — redirect to /dashboard when already signed in */}
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

      {/* Protected routes — redirect to /login when not signed in */}
      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding/profile" element={<HealthProfilePage />} />
        <Route path="/onboarding/city" element={<HomeCityPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/chat" element={<ChatPage />} />
      </Route>
    </Routes>
  )
}
