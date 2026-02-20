import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { useGeolocation } from '@/hooks/useGeolocation'
import { reverseGeocode } from '@/lib/reverseGeocode'
import { trpc } from '@/lib/trpc'

import { POPULAR_SEARCHES } from '../search/searchConstants'

const HomeCitySection = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [cityInput, setCityInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const utils = trpc.useUtils()

  const { getLocation, loading: locating, error: locationError } = useGeolocation()

  const handleCompleteSetup = async () => {
    const city = cityInput.trim()
    if (!city || !user) return

    setValidationError(null)
    setIsSaving(true)

    try {
      // Validate that the location exists in our data sources
      const result = await utils.search.byCity.fetch({ query: city })

      if (!result) {
        setValidationError(
          'Location not found. Please check spelling or try a different city/country.'
        )
        setIsSaving(false)
        return
      }

      await setDoc(doc(db, 'users', user.uid), { homeCity: city }, { merge: true })
      navigate('/dashboard')
    } catch (error) {
      console.error('Error validating location:', error)
      setValidationError('Unable to validate location. Please try again.')
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col px-4 py-8 max-w-lg mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        <div className="flex gap-1.5">
          <div className="w-6 h-1.5 rounded-full bg-primary/40" />
          <div className="w-6 h-1.5 rounded-full bg-primary" />
        </div>
        <span className="text-xs text-muted-foreground font-medium">Step 2 of 2</span>
      </div>

      {/* Heading */}
      <h1 className="text-2xl font-bold text-foreground mb-2">Where are you based?</h1>
      <p className="text-sm text-muted-foreground mb-8">
        We'll automatically detect your location for real-time air quality updates
      </p>

      {/* Use My Location button */}
      <Button
        size="lg"
        className="w-full rounded-lg mb-2 gap-2"
        variant="outline"
        onClick={async () => {
          const coords = await getLocation()
          if (coords) {
            const location = await reverseGeocode(coords.latitude, coords.longitude)
            if (location && (location.country || location.city)) {
              setCityInput(location.country || location.city || '')
            }
          }
        }}
        disabled={locating}
      >
        <MapPin className="w-4 h-4" />
        {locating ? 'Locating...' : 'Use My Location'}
      </Button>
      {locationError && (
        <p className="text-xs text-destructive mb-4 text-center">{locationError}</p>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3 mb-6">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or search manually</span>
        <Separator className="flex-1" />
      </div>

      {/* City search input */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Type your country..."
          className="pl-9"
          value={cityInput}
          onChange={e => setCityInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleCompleteSetup()
          }}
        />
      </div>

      {validationError && (
        <p className="text-xs text-destructive mb-6 -mt-4 pl-1">{validationError}</p>
      )}

      {/* Quick select cities */}
      <div className="mb-10">
        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
          Southeast Asia Countries
        </p>
        <div className="flex flex-wrap gap-2">
          {POPULAR_SEARCHES.map(country => (
            <Badge
              key={country}
              variant="outline"
              onClick={() => setCityInput(country)}
              className={
                cityInput === country
                  ? 'cursor-pointer px-3 py-1.5 text-sm font-normal bg-primary text-primary-foreground border-primary'
                  : 'cursor-pointer px-3 py-1.5 text-sm font-normal hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors'
              }
            >
              {country}
            </Badge>
          ))}
        </div>
      </div>

      {/* Complete Setup */}
      <Button
        size="lg"
        className="w-full rounded-lg"
        disabled={cityInput.trim().length === 0 || isSaving}
        onClick={handleCompleteSetup}
      >
        {isSaving ? 'Saving…' : 'Complete Setup'}
      </Button>
    </div>
  )
}

export default HomeCitySection
