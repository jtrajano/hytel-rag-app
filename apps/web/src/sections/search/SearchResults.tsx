import { useState } from 'react'
import { ShieldAlert, Leaf, Globe, Sparkles, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc'
import { getAqiTextColor, getAqiBadgeClass, getAqiScaleIndex } from './searchUtils'
import { AQI_SCALE_SEGMENTS } from './searchConstants'

interface GuidelineItem {
  id: string
  text: string
}

interface SearchPollution {
  aqi: number
  category: string
  pm25: number
  pm10: number
  o3: number
  no2: number
  updatedAt: string
}

interface SearchResult {
  type: 'city' | 'country'
  id: string
  name: string
  country: string
  flagEmoji: string
  pollution: SearchPollution
  visitorGuidelines: GuidelineItem[]
  preventionTips: GuidelineItem[]
  improvementActions: GuidelineItem[]
}

export function SearchResults({ result }: { result: SearchResult }) {
  const { pollution } = result
  const isCountry = result.type === 'country'
  const aqiTextColor = getAqiTextColor(pollution.aqi)
  const aqiBadgeClass = getAqiBadgeClass(pollution.aqi)
  const activeSegment = getAqiScaleIndex(pollution.aqi)
  const showVisitorGuidelines = pollution.aqi > 100

  const guidelinesMutation = trpc.search.guidelines.useMutation()
  const [triggered, setTriggered] = useState(false)

  const handleGenerate = () => {
    setTriggered(true)
    guidelinesMutation.mutate({
      name: result.name,
      country: result.country,
      type: result.type,
      aqi: pollution.aqi,
      category: pollution.category as
        | 'Good'
        | 'Moderate'
        | 'Unhealthy for Sensitive Groups'
        | 'Unhealthy'
        | 'Very Unhealthy'
        | 'Hazardous',
      pm25: pollution.pm25,
      pm10: pollution.pm10,
      no2: pollution.no2,
    })
  }

  return (
    <div className="space-y-4">
      <Card className="border-border shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl" role="img" aria-label={result.country}>
                {result.flagEmoji}
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">{result.name}</h2>
                {isCountry ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Globe className="w-3 h-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">National Overview</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{result.country}</p>
                )}
              </div>
            </div>
            <Badge className={cn('text-sm px-3 py-1', aqiBadgeClass)}>{pollution.category}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm overflow-hidden">
        <div className="bg-muted/30 border-b border-border px-5 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pollution Overview
            </h3>
            {isCountry && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                National average
              </span>
            )}
          </div>
          <div className="flex items-end gap-3">
            <span className={cn('text-7xl font-black leading-none', aqiTextColor)}>
              {pollution.aqi}
            </span>
            <div className="mb-1.5 flex flex-col gap-1">
              <Badge className={cn('text-sm px-2.5 py-0.5 w-fit', aqiBadgeClass)}>
                {pollution.category}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {isCountry ? 'Avg. AQI' : 'AQI'}
              </span>
            </div>
          </div>
        </div>

        <CardContent className="p-5 space-y-4">
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
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isCountry ? `avg. ${p.unit}` : p.unit}
                </p>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            {isCountry ? 'Data as of' : 'Last updated'}:{' '}
            {new Date(pollution.updatedAt).toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {isCountry && <span className="ml-1">(most recent city reading)</span>}
          </p>
        </CardContent>
      </Card>

      {/* not yet triggered: prompt card with generate button */}
      {!triggered && (
        <Card className="border-border shadow-sm">
          <CardContent className="p-5 flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">AI-Powered Recommendations</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Get personalised health guidelines and improvement actions based on current air
                quality.
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleGenerate}>
              <Sparkles className="w-4 h-4" />
              Generate Recommendations
            </Button>
          </CardContent>
        </Card>
      )}

      {/* loading state */}
      {triggered && guidelinesMutation.isPending && (
        <Card className="border-border shadow-sm">
          <CardContent className="p-5 flex items-center justify-center gap-3 py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Generating AI recommendations…</p>
          </CardContent>
        </Card>
      )}

      {/* error state */}
      {triggered && guidelinesMutation.isError && (
        <Card className="border-destructive/30">
          <CardContent className="p-5 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-destructive">
              Could not generate recommendations. Please try again.
            </p>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleGenerate}>
              <Sparkles className="w-4 h-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* success: visitor guidelines (only when aqi > 100) */}
      {guidelinesMutation.data &&
        showVisitorGuidelines &&
        guidelinesMutation.data.visitorGuidelines.length > 0 && (
          <Card className="border-border shadow-sm">
            <CardHeader className="px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="w-5 h-5 text-orange-600" />
                </div>
                <CardTitle className="text-base font-semibold text-foreground">
                  {isCountry ? `Visitor Guidelines — ${result.name}` : 'Visitor Guidelines'}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {isCountry && (
                <p className="text-xs text-muted-foreground mb-3">
                  Based on the national average — conditions may vary by city.
                </p>
              )}
              <ul className="space-y-3">
                {guidelinesMutation.data.visitorGuidelines.map(g => (
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

      {/* success: prevention & improvement */}
      {guidelinesMutation.data && (
        <Card className="border-border shadow-sm">
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <Leaf className="w-5 h-5 text-green-600" />
              </div>
              <CardTitle className="text-base font-semibold text-foreground">
                Prevention & Improvement
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-4">
            {guidelinesMutation.data.preventionTips.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  What you can do now
                </p>
                <ul className="space-y-2">
                  {guidelinesMutation.data.preventionTips.map(tip => (
                    <li key={tip.id} className="flex items-start gap-2.5">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                      <p className="text-sm text-foreground leading-relaxed">{tip.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {guidelinesMutation.data.preventionTips.length > 0 &&
              guidelinesMutation.data.improvementActions.length > 0 && <Separator />}

            {guidelinesMutation.data.improvementActions.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Long-term improvements
                </p>
                <ul className="space-y-2">
                  {guidelinesMutation.data.improvementActions.map(action => (
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
      )}
    </div>
  )
}
