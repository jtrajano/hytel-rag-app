import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Search, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { useGeolocation } from '@/hooks/useGeolocation'
import { trpc } from '@/lib/trpc'

const SEA_COUNTRIES = [
  { name: 'Thailand', capital: 'Bangkok', flag: '🇹🇭' },
  { name: 'Vietnam', capital: 'Hanoi', flag: '🇻🇳' },
  { name: 'Cambodia', capital: 'Phnom Penh', flag: '🇰🇭' },
  { name: 'Laos', capital: 'Vientiane', flag: '🇱🇦' },
  { name: 'Myanmar', capital: 'Naypyidaw', flag: '🇲🇲' },
  { name: 'Malaysia', capital: 'Kuala Lumpur', flag: '🇲🇾' },
  { name: 'Indonesia', capital: 'Jakarta', flag: '🇮🇩' },
  { name: 'Philippines', capital: 'Manila', flag: '🇵🇭' },
  { name: 'Singapore', capital: 'Singapore', flag: '🇸🇬' },
  { name: 'Brunei', capital: 'Bandar Seri Begawan', flag: '🇧🇳' },
  { name: 'Timor-Leste', capital: 'Dili', flag: '🇹🇱' },
] as const

const SEA_COUNTRY_NAMES = SEA_COUNTRIES.map(c => c.name)

const HomeCitySection = () => {
  const { user, setHomeCity } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<'country' | 'city'>('country')
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [cityInput, setCityInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const utils = trpc.useUtils()
  const { getLocation, loading: locating, error: locationError } = useGeolocation()

  const currentCountry = SEA_COUNTRIES.find(c => c.name === selectedCountry)

  const handleUseLocation = async () => {
    const coords = await getLocation()
    if (!coords) return

    try {
      const location = await utils.client.search.reverseGeocode.mutate({
        lat: coords.latitude,
        lon: coords.longitude,
      })

      if (!location) return

      if (step === 'country') {
        const detectedCountry = SEA_COUNTRY_NAMES.find(
          n => n.toLowerCase() === (location.country ?? '').toLowerCase()
        )
        if (detectedCountry) {
          setSelectedCountry(detectedCountry)
          setCityInput(location.city ?? '')
          setStep('city')
        } else {
          setValidationError('Your detected location is outside Southeast Asia.')
        }
      } else {
        // already on city step — just pre-fill city
        if (location.city) setCityInput(location.city)
      }
    } catch (error) {
      console.error('Failed to resolve location:', error)
    }
  }

  const handleCompleteSetup = async () => {
    const city = cityInput.trim()
    if (!city || !user || !selectedCountry) return

    setValidationError(null)
    setIsSaving(true)

    try {
      const result = await utils.search.byCity.fetch({ query: city, skipAi: true })

      if (!result) {
        setValidationError('City not found. Please check the spelling or try another city.')
        setIsSaving(false)
        return
      }

      // Singapore is a city-state: backend may return type 'country' for it.
      const isSingaporeException =
        selectedCountry === 'Singapore' && result.name.toLowerCase() === 'singapore'

      if (!isSingaporeException) {
        const resultCountry = result.type === 'country' ? result.name : result.country
        if (resultCountry.toLowerCase() !== selectedCountry.toLowerCase()) {
          setValidationError(
            `"${city}" does not appear to be a city in ${selectedCountry}. Please try again.`
          )
          setIsSaving(false)
          return
        }
      }

      await setDoc(doc(db, 'users', user.uid), { homeCity: city }, { merge: true })
      setHomeCity(city)
      navigate('/dashboard')
    } catch (error) {
      console.error('Error validating city:', error)
      setValidationError('Unable to validate city. Please try again.')
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col px-4 py-8 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-8">
        <div className="flex gap-1.5">
          <div className="w-6 h-1.5 rounded-full bg-primary/40" />
          <div className="w-6 h-1.5 rounded-full bg-primary" />
        </div>
        <span className="text-xs text-muted-foreground font-medium">Step 2 of 2</span>
      </div>

      {step === 'country' ? (
        <>
          <h1 className="text-2xl font-bold text-foreground mb-2">Where are you based?</h1>
          <p className="text-sm text-muted-foreground mb-6">Select your country to get started</p>

          <Button
            size="lg"
            className="w-full rounded-lg mb-2 gap-2"
            variant="outline"
            onClick={handleUseLocation}
            disabled={locating}
          >
            <MapPin className="w-4 h-4" />
            {locating ? 'Locating...' : 'Use My Location'}
          </Button>
          {locationError && (
            <p className="text-xs text-destructive mb-2 text-center">{locationError}</p>
          )}
          {validationError && (
            <p className="text-xs text-destructive mb-2 text-center">{validationError}</p>
          )}

          <div className="flex items-center gap-3 my-6">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or choose your country</span>
            <Separator className="flex-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {SEA_COUNTRIES.map((country, index) => (
              <Card
                key={country.name}
                onClick={() => {
                  setSelectedCountry(country.name)
                  setValidationError(null)
                  setStep('city')
                }}
                className={cn(
                  'cursor-pointer transition-all duration-200 border-border hover:border-primary/50 hover:shadow-sm',
                  index === SEA_COUNTRIES.length - 1 && 'col-span-2'
                )}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="text-2xl">{country.flag}</span>
                  <p className="text-sm font-semibold text-foreground">{country.name}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          <button
            onClick={() => {
              setStep('country')
              setSelectedCountry(null)
              setCityInput('')
              setValidationError(null)
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 -mt-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {currentCountry && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{currentCountry.flag}</span>
              <span className="text-sm font-medium text-foreground">{currentCountry.name}</span>
            </div>
          )}

          <h1 className="text-2xl font-bold text-foreground mb-2">Choose your city</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Search for a city in {selectedCountry}
          </p>

          <Button
            size="lg"
            className="w-full rounded-lg mb-2 gap-2"
            variant="outline"
            onClick={handleUseLocation}
            disabled={locating}
          >
            <MapPin className="w-4 h-4" />
            {locating ? 'Locating...' : 'Use My Location'}
          </Button>
          {locationError && (
            <p className="text-xs text-destructive mb-2 text-center">{locationError}</p>
          )}

          <div className="flex items-center gap-3 my-6">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or search manually</span>
            <Separator className="flex-1" />
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search for a city..."
              className="pl-9"
              value={cityInput}
              onChange={e => setCityInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCompleteSetup()
              }}
              autoFocus
            />
          </div>

          {validationError && (
            <p className="text-xs text-destructive mb-4 pl-1">{validationError}</p>
          )}

          {currentCountry && (
            <div className="mb-10">
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                Suggested
              </p>
              <Badge
                variant="outline"
                onClick={() => setCityInput(currentCountry.capital)}
                className={cn(
                  'cursor-pointer px-3 py-1.5 text-sm font-normal transition-colors',
                  cityInput === currentCountry.capital
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-primary hover:text-primary-foreground hover:border-primary'
                )}
              >
                {currentCountry.capital} (capital)
              </Badge>
            </div>
          )}

          <Button
            size="lg"
            className="w-full rounded-lg"
            disabled={cityInput.trim().length === 0 || isSaving}
            onClick={handleCompleteSetup}
          >
            {isSaving ? 'Saving…' : 'Complete Setup'}
          </Button>
        </>
      )}
    </div>
  )
}

export default HomeCitySection
