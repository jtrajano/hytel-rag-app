import { AlertTriangle, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const AQIOverviewSection = () => {
  return (
    <Card className="border-border shadow-sm overflow-hidden">
      {/* Orange tint header band */}
      <div className="bg-orange-50 border-b border-orange-100 px-5 pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Current Air Quality
            </h2>
            {/* Large AQI number */}
            <div className="flex items-end gap-3">
              <span className="text-7xl font-black leading-none text-orange-600">158</span>
              <div className="mb-1.5 flex flex-col gap-1">
                <Badge className="bg-orange-500 hover:bg-orange-500 text-white border-0 text-sm px-2.5 py-0.5 w-fit">
                  Unhealthy
                </Badge>
                <span className="text-xs text-muted-foreground">US AQI</span>
              </div>
            </div>
          </div>

          {/* Alert icon */}
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
          </div>
        </div>
      </div>

      <CardContent className="p-5">
        {/* Health Recommendation */}
        <p className="text-sm text-foreground leading-relaxed mb-4">
          Members of sensitive groups may experience health effects. The general public is less
          likely to be affected. Avoid prolonged outdoor exertion and wear an N95 mask if going
          outside.
        </p>

        {/* Color scale bar */}
        <div className="mb-4">
          <div className="flex h-2 rounded-full overflow-hidden">
            <div className="flex-1 bg-green-400" title="Good (0–50)" />
            <div className="flex-1 bg-yellow-400" title="Moderate (51–100)" />
            <div
              className="flex-1 bg-orange-300"
              title="Unhealthy for Sensitive Groups (101–150)"
            />
            <div
              className="flex-1 bg-orange-600 ring-2 ring-orange-600 ring-offset-1"
              title="Unhealthy (151–200) — Current"
            />
            <div className="flex-1 bg-red-700" title="Very Unhealthy (201–300)" />
            <div className="flex-1 bg-rose-950" title="Hazardous (301+)" />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-muted-foreground">0</span>
            <span className="text-xs text-muted-foreground">500</span>
          </div>
        </div>

        {/* Last Updated */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>Last updated: Today at 6:42 AM · Data from OpenAQ</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default AQIOverviewSection
