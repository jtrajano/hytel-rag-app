import { Link } from 'react-router-dom'
import { Search, MessageSquare, LogOut, MapPin } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import MorningSummarySection from '@/sections/dashboard/MorningSummarySection'
import AQIOverviewSection from '@/sections/dashboard/AQIOverviewSection'
import ForecastSection from '@/sections/dashboard/ForecastSection'
import { useAuth } from '@/hooks/useAuth'
import { trpc } from '@/lib/trpc'

const TEN_MINUTES_MS = 10 * 60 * 1000

const DashboardPage = () => {
  const { user, loading: authLoading, signOut, homeCity } = useAuth()

  const {
    data: currentAqi,
    isLoading: aqiLoading,
    isError: aqiError,
  } = trpc.chat.currentAqi.useQuery(
    { city: homeCity ?? '' },
    {
      enabled: !authLoading && !!user && !!homeCity,
      staleTime: TEN_MINUTES_MS,
      gcTime: TEN_MINUTES_MS,
      refetchInterval: TEN_MINUTES_MS,
    }
  )

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const displayName = user?.displayName ?? 'there'
  const firstName = displayName.split(' ')[0]
  const initial = firstName.charAt(0).toUpperCase()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm text-muted-foreground capitalize">
              {homeCity ?? 'Set your location'} · {today}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              aria-label="Sign out"
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4" />
            </Button>
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                {initial}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <nav className="bg-background border-b border-border">
        <div className="max-w-2xl mx-auto px-4 flex gap-1 py-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Link to="/search">
              <Search className="w-4 h-4" />
              Search
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Link to="/chat">
              <MessageSquare className="w-4 h-4" />
              Ask AI
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Link to="/map">
              <MapPin className="w-4 h-4" />
              Map
            </Link>
          </Button>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <MorningSummarySection homeCity={homeCity} currentAqi={currentAqi} />
        <AQIOverviewSection currentAqi={currentAqi} isLoading={aqiLoading} isError={aqiError} />
        <ForecastSection homeCity={homeCity} />
      </main>
    </div>
  )
}

export default DashboardPage
