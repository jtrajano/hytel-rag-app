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

const QUICK_CITIES = [
  'Manila',
  'Jakarta',
  'Bangkok',
  'Ho Chi Minh City',
  'Kuala Lumpur',
  'Singapore',
]

const HomeCitySection = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [cityInput, setCityInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleCompleteSetup = async () => {
    const city = cityInput.trim()
    if (!city || !user) return
    setIsSaving(true)
    try {
      await setDoc(doc(db, 'users', user.uid), { homeCity: city }, { merge: true })
      navigate('/dashboard')
    } finally {
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
      <Button size="lg" className="w-full rounded-lg mb-6 gap-2" variant="outline">
        <MapPin className="w-4 h-4" />
        Use My Location
      </Button>

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
          placeholder="Type your city..."
          className="pl-9"
          value={cityInput}
          onChange={e => setCityInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleCompleteSetup()
          }}
        />
      </div>

      {/* Quick select cities */}
      <div className="mb-10">
        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
          Popular cities
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_CITIES.map(city => (
            <Badge
              key={city}
              variant="outline"
              onClick={() => setCityInput(city)}
              className={
                cityInput === city
                  ? 'cursor-pointer px-3 py-1.5 text-sm font-normal bg-primary text-primary-foreground border-primary'
                  : 'cursor-pointer px-3 py-1.5 text-sm font-normal hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors'
              }
            >
              {city}
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
