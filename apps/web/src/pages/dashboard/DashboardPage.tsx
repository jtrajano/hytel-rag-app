import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import MorningSummarySection from '@/sections/dashboard/MorningSummarySection'
import AQIOverviewSection from '@/sections/dashboard/AQIOverviewSection'
import ForecastSection from '@/sections/dashboard/ForecastSection'

const DashboardPage = () => {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header Bar */}
      <header className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Good morning, Alex</h1>
            <p className="text-sm text-muted-foreground">Manila, Philippines · {today}</p>
          </div>
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
              A
            </AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <MorningSummarySection />
        <AQIOverviewSection />
        <ForecastSection />
      </main>
    </div>
  )
}

export default DashboardPage
