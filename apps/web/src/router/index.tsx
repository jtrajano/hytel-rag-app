import { Routes, Route } from 'react-router-dom'
import SplashPage from '@/pages/onboarding/SplashPage'
import HealthProfilePage from '@/pages/onboarding/HealthProfilePage'
import HomeCityPage from '@/pages/onboarding/HomeCityPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import SearchPage from '@/pages/search/SearchPage'

export const AppRouter = () => {
  return (
    <Routes>
      <Route path="/" element={<SplashPage />} />
      <Route path="/onboarding/profile" element={<HealthProfilePage />} />
      <Route path="/onboarding/city" element={<HomeCityPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/search" element={<SearchPage />} />
    </Routes>
  )
}
