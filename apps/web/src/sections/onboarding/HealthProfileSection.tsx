import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Wind, Heart, Activity, Smile, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { type ProfileCard, type ProfileId } from '@/interface'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'

const PROFILE_CARDS: ProfileCard[] = [
  {
    id: 'healthy',
    icon: User,
    title: 'Healthy Adult',
    description: 'No known respiratory conditions',
  },
  {
    id: 'asthma',
    icon: Wind,
    title: 'Asthma',
    description: 'Sensitive to air pollution triggers',
  },
  {
    id: 'pregnant',
    icon: Heart,
    title: 'Pregnant',
    description: 'Extra protection during pregnancy',
  },
  {
    id: 'elderly',
    icon: Activity,
    title: 'Elderly',
    description: 'Higher sensitivity to pollution',
  },
  {
    id: 'child',
    icon: Smile,
    title: 'Child',
    description: 'Developing lungs need extra care',
  },
]

const MAX_SELECTIONS = 3

const HealthProfileSection = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [selectedProfiles, setSelectedProfiles] = useState<ProfileId[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const toggleProfile = (id: ProfileId) => {
    setSelectedProfiles(prev => {
      if (prev.includes(id)) return prev.filter(p => p !== id)
      if (prev.length >= MAX_SELECTIONS) return prev // caps selections to max limit.
      return [...prev, id]
    })
  }

  const handleContinue = async () => {
    if (selectedProfiles.length === 0 || !user) return
    setIsSaving(true)
    try {
      await setDoc(doc(db, 'users', user.uid), { healthProfile: selectedProfiles }, { merge: true })
      navigate('/onboarding/city')
    } finally {
      setIsSaving(false)
    }
  }

  const count = selectedProfiles.length

  return (
    <div className="min-h-screen flex flex-col px-4 py-8 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-8">
        <div className="flex gap-1.5">
          <div className="w-6 h-1.5 rounded-full bg-primary" />
          <div className="w-6 h-1.5 rounded-full bg-muted" />
        </div>
        <span className="text-xs text-muted-foreground font-medium">Step 1 of 2</span>
      </div>

      <h1 className="text-2xl font-bold text-foreground mb-2">Tell us about your health profile</h1>
      <p className="text-sm text-muted-foreground mb-1">
        We'll personalize air quality recommendations based on your needs
      </p>

      <p
        className={cn(
          'text-xs font-medium mb-8',
          count === MAX_SELECTIONS ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        Select up to {MAX_SELECTIONS} &middot;{' '}
        <span className={cn(count > 0 && 'font-semibold text-foreground')}>{count}</span> selected
      </p>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {PROFILE_CARDS.map(profile => {
          const Icon = profile.icon
          const isSelected = selectedProfiles.includes(profile.id)
          const isDisabled = !isSelected && count >= MAX_SELECTIONS

          return (
            <Card
              key={profile.id}
              onClick={() => !isDisabled && toggleProfile(profile.id)}
              className={cn(
                'relative cursor-pointer transition-all duration-200',
                isSelected
                  ? 'border-primary ring-2 ring-primary ring-offset-1 bg-primary/5'
                  : isDisabled
                    ? 'border-border opacity-40 cursor-not-allowed'
                    : 'border-border hover:border-primary/50 hover:shadow-sm'
              )}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}

              <CardContent className="p-4 flex flex-col gap-2">
                <div
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      isSelected ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    {profile.title}
                  </p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {profile.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Button
        size="lg"
        className="w-full rounded-lg"
        disabled={count === 0 || isSaving}
        onClick={handleContinue}
      >
        {isSaving ? 'Saving…' : 'Continue'}
      </Button>
    </div>
  )
}

export default HealthProfileSection
