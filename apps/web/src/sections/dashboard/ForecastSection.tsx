import { Cloud, CloudRain, Sun } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ForecastDay } from '@/interface'

const FORECAST_DAYS: ForecastDay[] = [
  {
    label: 'Today',
    aqi: 158,
    category: 'Unhealthy',
    aqiColor: 'text-orange-600',
    badgeClass: 'bg-orange-500 hover:bg-orange-500 text-white border-0',
    WeatherIcon: Cloud,
    iconColor: 'text-slate-400',
  },
  {
    label: 'Tomorrow',
    aqi: 112,
    category: 'Unhealthy SG',
    aqiColor: 'text-orange-400',
    badgeClass: 'bg-orange-300 hover:bg-orange-300 text-orange-900 border-0',
    WeatherIcon: CloudRain,
    iconColor: 'text-blue-400',
  },
  {
    label: 'Day 3',
    aqi: 64,
    category: 'Moderate',
    aqiColor: 'text-yellow-600',
    badgeClass: 'bg-yellow-300 hover:bg-yellow-300 text-yellow-900 border-0',
    WeatherIcon: Sun,
    iconColor: 'text-amber-400',
  },
]

const ForecastSection = () => {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-foreground">
            72-Hour Forecast
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex-shrink-0" />
            <span className="text-xs text-muted-foreground">Powered by Vertex AI</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5">
        <div className="grid grid-cols-3 gap-3">
          {FORECAST_DAYS.map(day => {
            const { WeatherIcon } = day
            return (
              <div
                key={day.label}
                className="flex flex-col items-center gap-2 bg-muted/40 rounded-xl p-3 text-center"
              >
                {/* Day Label */}
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {day.label}
                </span>

                {/* Weather Icon */}
                <WeatherIcon className={`w-6 h-6 ${day.iconColor}`} />

                {/* AQI Number */}
                <span className={`text-2xl font-black leading-none ${day.aqiColor}`}>
                  {day.aqi}
                </span>

                {/* Category Badge */}
                <Badge className={`text-xs px-2 py-0.5 ${day.badgeClass} whitespace-nowrap`}>
                  {day.category}
                </Badge>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export default ForecastSection
