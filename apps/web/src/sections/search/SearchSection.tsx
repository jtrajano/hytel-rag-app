import { useState } from 'react'
import { Search, ShieldAlert, Leaf, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useSearchPlace } from '@/hooks/useSearchPlace'
import { PlaceSearchResult } from '@/lib/schema/pollutionSchema'

// ── AQI helpers — mirror AQIOverviewSection and ForecastSection conventions ──

function getAqiTextColor(aqi: number): string {
  if (aqi <= 50) return 'text-green-500'
  if (aqi <= 100) return 'text-yellow-500'
  if (aqi <= 150) return 'text-orange-400'
  if (aqi <= 200) return 'text-orange-600'
  if (aqi <= 300) return 'text-red-600'
  return 'text-rose-900'
}

function getAqiBadgeClass(aqi: number): string {
  if (aqi <= 50) return 'bg-green-500 hover:bg-green-500 text-white border-0'
  if (aqi <= 100) return 'bg-yellow-500 hover:bg-yellow-500 text-white border-0'
  if (aqi <= 150) return 'bg-orange-400 hover:bg-orange-400 text-white border-0'
  if (aqi <= 200) return 'bg-orange-600 hover:bg-orange-600 text-white border-0'
  if (aqi <= 300) return 'bg-red-600 hover:bg-red-600 text-white border-0'
  return 'bg-rose-900 hover:bg-rose-900 text-white border-0'
}

function getAqiScaleIndex(aqi: number): number {
  if (aqi <= 50) return 0
  if (aqi <= 100) return 1
  if (aqi <= 150) return 2
  if (aqi <= 200) return 3
  if (aqi <= 300) return 4
  return 5
}

// Explicit ring classes required for Tailwind JIT — never use string interpolation
const AQI_SCALE_SEGMENTS = [
  { bg: 'bg-green-400', ringClass: 'ring-green-400', title: 'Good (0–50)' },
  { bg: 'bg-yellow-400', ringClass: 'ring-yellow-400', title: 'Moderate (51–100)' },
  {
    bg: 'bg-orange-300',
    ringClass: 'ring-orange-300',
    title: 'Unhealthy for Sensitive Groups (101–150)',
  },
  { bg: 'bg-orange-600', ringClass: 'ring-orange-600', title: 'Unhealthy (151–200)' },
  { bg: 'bg-red-700', ringClass: 'ring-red-700', title: 'Very Unhealthy (201–300)' },
  { bg: 'bg-rose-950', ringClass: 'ring-rose-950', title: 'Hazardous (301+)' },
]

const POPULAR_SEARCHES = [
  'Manila',
  'Jakarta',
  'Bangkok',
  'Singapore',
  'Kuala Lumpur',
  'Ho Chi Minh City',
  'Delhi',
  'Tokyo',
]

// ── SearchResults sub-component — declared here, not exported ─────────────────

function SearchResults({ result }: { result: PlaceSearchResult }) {
  const { pollution } = result
  const aqiTextColor = getAqiTextColor(pollution.aqi)
  const aqiBadgeClass = getAqiBadgeClass(pollution.aqi)
  const activeSegment = getAqiScaleIndex(pollution.aqi)
  const showVisitorGuidelines = pollution.aqi > 100

  return (
    <div className="space-y-4">
      {/* Place header card */}
      <Card className="border-border shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl" role="img" aria-label={result.country}>
                {result.flagEmoji}
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">{result.name}</h2>
                <p className="text-sm text-muted-foreground">{result.country}</p>
              </div>
            </div>
            <Badge className={cn('text-sm px-3 py-1', aqiBadgeClass)}>{pollution.category}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Pollution overview card */}
      <Card className="border-border shadow-sm overflow-hidden">
        <div className="bg-muted/30 border-b border-border px-5 pt-5 pb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Pollution Overview
          </h3>
          <div className="flex items-end gap-3">
            <span className={cn('text-7xl font-black leading-none', aqiTextColor)}>
              {pollution.aqi}
            </span>
            <div className="mb-1.5 flex flex-col gap-1">
              <Badge className={cn('text-sm px-2.5 py-0.5 w-fit', aqiBadgeClass)}>
                {pollution.category}
              </Badge>
              <span className="text-xs text-muted-foreground">US AQI</span>
            </div>
          </div>
        </div>

        <CardContent className="p-5 space-y-4">
          {/* AQI scale bar — mirrors AQIOverviewSection */}
          <div>
            <div className="flex h-2 rounded-full overflow-hidden">
              {AQI_SCALE_SEGMENTS.map((seg, i) => (
                <div
                  key={seg.title}
                  title={seg.title}
                  className={cn(
                    'flex-1',
                    seg.bg,
                    i === activeSegment && 'ring-2 ring-offset-1',
                    i === activeSegment && seg.ringClass
                  )}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-muted-foreground">0</span>
              <span className="text-xs text-muted-foreground">500+</span>
            </div>
          </div>

          <Separator />

          {/* Pollutant grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'PM2.5', value: pollution.pm25, unit: 'µg/m³' },
              { label: 'PM10', value: pollution.pm10, unit: 'µg/m³' },
              { label: 'O₃', value: pollution.o3, unit: 'ppb' },
              { label: 'NO₂', value: pollution.no2, unit: 'ppb' },
            ].map(p => (
              <div key={p.label} className="bg-muted/40 rounded-xl p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  {p.label}
                </p>
                <p className="text-xl font-bold text-foreground leading-none">
                  {p.value.toFixed(1)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{p.unit}</p>
              </div>
            ))}
          </div>

          {/* Timestamp */}
          <p className="text-xs text-muted-foreground">
            Last updated:{' '}
            {new Date(pollution.updatedAt).toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </CardContent>
      </Card>

      {/* Visitor guidelines card — shown only when AQI > 100 */}
      {showVisitorGuidelines && (
        <Card className="border-border shadow-sm">
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="w-5 h-5 text-orange-600" />
              </div>
              <CardTitle className="text-base font-semibold text-foreground">
                Visitor Guidelines
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <ul className="space-y-3">
              {result.visitorGuidelines.map(g => (
                <li key={g.id} className="flex items-start gap-2.5">
                  <span className="mt-1 w-4 h-4 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  </span>
                  <p className="text-sm text-foreground leading-relaxed">{g.text}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Prevention & improvement card — always shown */}
      <Card className="border-border shadow-sm">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <Leaf className="w-5 h-5 text-green-600" />
              </div>
              <CardTitle className="text-base font-semibold text-foreground">
                Prevention & Improvement
              </CardTitle>
            </div>
            {/* "Powered by Vertex AI" badge — matches ForecastSection pattern */}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex-shrink-0" />
              <span className="text-xs text-muted-foreground">Powered by Vertex AI</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">
          {result.preventionTips.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                What you can do now
              </p>
              <ul className="space-y-2">
                {result.preventionTips.map(tip => (
                  <li key={tip.id} className="flex items-start gap-2.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    <p className="text-sm text-foreground leading-relaxed">{tip.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.preventionTips.length > 0 && result.improvementActions.length > 0 && (
            <Separator />
          )}

          {result.improvementActions.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Long-term improvements
              </p>
              <ul className="space-y-2">
                {result.improvementActions.map(action => (
                  <li key={action.id} className="flex items-start gap-2.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    <p className="text-sm text-foreground leading-relaxed">{action.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main section ──────────────────────────────────────────────────────────────

const SearchSection = () => {
  const [inputQuery, setInputQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')

  const { data, isLoading, isError } = useSearchPlace(submittedQuery)

  const handleSearch = () => {
    setSubmittedQuery(inputQuery)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handlePopularSearch = (city: string) => {
    setInputQuery(city)
    setSubmittedQuery(city)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-lg font-semibold text-foreground">Search Air Quality</h1>
          <p className="text-sm text-muted-foreground">
            Look up pollution levels for any city or country
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Search bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search city or country..."
              className="pl-9"
              value={inputQuery}
              onChange={e => setInputQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <Button onClick={handleSearch} className="px-5">
            Search
          </Button>
        </div>

        {/* Popular searches */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            Popular searches
          </p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_SEARCHES.map(city => (
              <Badge
                key={city}
                variant="outline"
                className="cursor-pointer px-3 py-1.5 text-sm font-normal hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                onClick={() => handlePopularSearch(city)}
              >
                {city}
              </Badge>
            ))}
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {isError && (
          <Card className="border-destructive/30">
            <CardContent className="p-5 text-sm text-destructive">
              Something went wrong while searching. Please try again.
            </CardContent>
          </Card>
        )}

        {/* No results state */}
        {!isLoading && !isError && submittedQuery.length > 0 && data === null && (
          <Card className="border-border">
            <CardContent className="p-5 text-center">
              <p className="text-sm text-muted-foreground">
                No results found for{' '}
                <span className="font-medium text-foreground">"{submittedQuery}"</span>.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Try searching for a city name or country listed in popular searches.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Results state */}
        {!isLoading && !isError && data && <SearchResults result={data} />}
      </main>
    </div>
  )
}

export default SearchSection
