import { Clock, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc'
import { AQI_SCALE_SEGMENTS } from '@/sections/search/searchConstants'
import { getAqiBadgeClass, getAqiScaleIndex, getAqiTextColor } from '@/sections/search/searchUtils'
import { useAuth } from '@/hooks/useAuth'

const TEN_MINUTES_MS = 10 * 60 * 1000

interface AQIOverviewSectionProps {
  homeCity?: string | null
}

const AQIOverviewSection = ({ homeCity }: AQIOverviewSectionProps) => {
  const city = homeCity ?? 'Manila'
  const { user, loading } = useAuth()
  const { data, isLoading, isError } = trpc.chat.currentAqi.useQuery(
    { city },
    {
      enabled: !loading && !!user,
      staleTime: TEN_MINUTES_MS,
      gcTime: TEN_MINUTES_MS,
      refetchInterval: TEN_MINUTES_MS,
    }
  )

  const aqi = data?.aqi ?? 0
  const quality = data?.quality ?? 'Unavailable'
  const aqiTextColor = getAqiTextColor(aqi)
  const aqiBadgeClass = getAqiBadgeClass(aqi)
  const activeSegment = getAqiScaleIndex(aqi)
  const updatedLabel = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <Card className="border-border shadow-sm overflow-hidden">
      <div className="bg-orange-50 border-b border-orange-100 px-5 pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Current Air Quality
            </h2>
            <div className="flex items-end gap-3">
              <span className={cn('text-7xl font-black leading-none', aqiTextColor)}>
                {isLoading ? '--' : aqi}
              </span>
              <div className="mb-1.5 flex flex-col gap-1">
                <Badge
                  className={cn(
                    'text-sm px-2.5 py-0.5 w-fit',
                    quality === 'Unavailable'
                      ? 'bg-muted hover:bg-muted text-muted-foreground border'
                      : aqiBadgeClass
                  )}
                >
                  {quality}
                </Badge>
                <span className="text-xs text-muted-foreground">AQI</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="p-5">
        <div className="mb-4">
          <div className="flex h-2 rounded-full overflow-hidden">
            {AQI_SCALE_SEGMENTS.map((seg, i) => (
              <div
                key={seg.title}
                title={seg.title}
                className={cn(
                  'flex-1',
                  seg.bg,
                  i === activeSegment && quality !== 'Unavailable' && 'ring-2 ring-offset-1',
                  i === activeSegment && quality !== 'Unavailable' && seg.ringClass
                )}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-muted-foreground">0</span>
            <span className="text-xs text-muted-foreground">500</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
          <span>
            {isError
              ? 'Unable to load OpenAQ data right now.'
              : `Last updated: ${updatedLabel ?? '--'}`}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export default AQIOverviewSection
