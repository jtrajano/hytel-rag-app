import { Cloud, CloudRain, Sun, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { trpc } from '@/lib/trpc'
import { getAqiBadgeClass, getAqiTextColor } from '@/sections/search/searchUtils'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

interface ForecastSectionProps {
  homeCity?: string | null
}

const ForecastSection = ({ homeCity }: ForecastSectionProps) => {
  const city = homeCity ?? ''
  const { user, loading } = useAuth()
  const { data, isLoading, isError } = trpc.forecast.byCity.useQuery(
    { city },
    {
      enabled: !loading && !!user && !!homeCity,
      staleTime: 60 * 60 * 1000, // 1 hour
      gcTime: 60 * 60 * 1000,
      refetchInterval: 60 * 60 * 1000,
    }
  )

  const forecastDays = data?.days ?? []

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-foreground">
            72-Hour Forecast
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5">
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError || !forecastDays.length ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            Unable to load forecast data.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {forecastDays.map((day, idx) => {
              // Select an icon cycle based on the index to provide some visual variety
              const WeatherIcon = idx === 0 ? Cloud : idx === 1 ? CloudRain : Sun
              const iconColor =
                idx === 0 ? 'text-slate-400' : idx === 1 ? 'text-blue-400' : 'text-amber-400'
              const aqiTextColor = getAqiTextColor(day.aqi)
              const badgeClass = getAqiBadgeClass(day.aqi)

              return (
                <div
                  key={day.label}
                  className="flex flex-col items-center gap-2 bg-muted/40 rounded-xl p-3 text-center"
                >
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {day.label}
                  </span>

                  <WeatherIcon className={cn('w-6 h-6', iconColor)} />

                  <span className={cn('text-2xl font-black leading-none', aqiTextColor)}>
                    {day.aqi}
                  </span>

                  <Badge className={cn('text-xs px-2 py-0.5 whitespace-nowrap', badgeClass)}>
                    {day.category}
                  </Badge>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default ForecastSection
