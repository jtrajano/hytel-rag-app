import { Link } from 'react-router-dom'
import { ChevronLeft, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PollutionMapSection } from '@/sections/map/PollutionMapSection'

/**
 * PollutionMapPage
 *
 * Thin page shell — header + back navigation + section.
 * All data and map logic lives in PollutionMapSection.
 */
const PollutionMapPage = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1 text-muted-foreground hover:text-foreground"
          >
            <Link to="/dashboard">
              <ChevronLeft className="w-4 h-4" />
              Back
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold text-foreground leading-tight">
                Air Quality Map
              </h1>
              <p className="text-sm text-muted-foreground capitalize">
                Live AQI levels across Southeast Asia
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <PollutionMapSection />
      </main>
    </div>
  )
}

export default PollutionMapPage
