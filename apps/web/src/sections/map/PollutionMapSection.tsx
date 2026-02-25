import { useState } from 'react'
import { Loader2, Map, Building2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useCountryAQI } from '@/hooks/useCountryAQI'
import { useCityAQI } from '@/hooks/useCityAQI'
import { AQIMap } from '@/components/map/AQIMap'
import type { MapLevel } from '@/utils/mapTypes'
import { cn } from '@/lib/utils'

/**
 * Level tabs for the map view switcher.
 */
const LEVEL_TABS: { label: string; level: MapLevel; disabled?: boolean; hint?: string }[] = [
  { label: 'Country', level: 'country' },
  {
    label: 'City',
    level: 'city',
  },
]

/**
 * PollutionMapSection
 *
 * Orchestrates data fetching and map rendering. Keeps AQIMap presentation-only
 * by owning all data concerns here.
 */
export function PollutionMapSection() {
  const [level, setLevel] = useState<MapLevel>('country')
  const { data: countryData, isLoading: countryLoading, isError: countryError } = useCountryAQI()

  const { data: cityData, isLoading: cityLoading, isError: cityError } = useCityAQI()

  const isLoading = level === 'country' ? countryLoading : cityLoading
  const isError = level === 'country' ? countryError : cityError

  return (
    <div className="space-y-4">
      {/* Level switcher */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {LEVEL_TABS.map(tab => (
          <button
            key={tab.level}
            onClick={() => !tab.disabled && setLevel(tab.level)}
            disabled={tab.disabled}
            title={tab.hint}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
              level === tab.level && !tab.disabled
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground',
              tab.disabled
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:text-foreground cursor-pointer'
            )}
          >
            {tab.level === 'country' ? (
              <Map className="w-3.5 h-3.5" />
            ) : (
              <Building2 className="w-3.5 h-3.5" />
            )}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Status banners */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-4 py-2.5">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>Loading air quality data for Southeast Asia…</span>
        </div>
      )}

      {isError && !isLoading && (
        <Card className="border-destructive/30">
          <CardContent className="p-4 text-sm text-destructive">
            Could not load air quality data. Please check your connection and try again.
          </CardContent>
        </Card>
      )}

      {/* Map canvas — renders even while loading so the base tiles appear immediately */}
      <div
        className="relative rounded-xl overflow-hidden border border-border"
        style={{ height: '520px' }}
      >
        <AQIMap level={level} countryData={countryData} cityData={cityData} />

        {/* Subtle data source attribution */}
        <div className="absolute bottom-2 left-2 z-[400] text-[10px] text-white/40 pointer-events-none select-none">
          AQI data: OpenAQ, Open-Meteo · Boundaries: Natural Earth
        </div>
      </div>
    </div>
  )
}
