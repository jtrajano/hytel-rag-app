import { Clock, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AQI_SCALE_SEGMENTS } from '@/sections/search/searchConstants'
import { getAqiBadgeClass, getAqiScaleIndex, getAqiTextColor } from '@/sections/search/searchUtils'

interface CurrentAqi {
  city: string
  aqi: number
  quality: string
  updatedAt: string
}

interface AQIOverviewSectionProps {
  currentAqi?: CurrentAqi
  isLoading?: boolean
  isError?: boolean
}

const AQIOverviewSection = ({ currentAqi, isLoading, isError }: AQIOverviewSectionProps) => {
  const aqi = currentAqi?.aqi ?? 0
  const quality = currentAqi?.quality ?? 'Unavailable'
  const aqiTextColor = getAqiTextColor(aqi)
  const aqiBadgeClass = getAqiBadgeClass(aqi)
  const activeSegment = getAqiScaleIndex(aqi)
  const updatedLabel = currentAqi?.updatedAt
    ? new Date(currentAqi.updatedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <Card className="border-border shadow-sm overflow-hidden">
      <div className="bg-background border-b border-border px-5 pt-5 pb-4">
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
              ? 'Unable to load air quality data right now.'
              : `Last updated: ${updatedLabel ?? '--'}`}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export default AQIOverviewSection
