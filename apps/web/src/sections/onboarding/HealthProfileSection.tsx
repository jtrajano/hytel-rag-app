import { useState } from 'react'
import { Link } from 'react-router-dom'
import { User, Wind, Heart, Activity, Smile } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ProfileCard, ProfileId } from '@/interface'

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

const HealthProfileSection = () => {
  const [selectedProfile, setSelectedProfile] = useState<ProfileId | null>(null)

  return (
    <div className="min-h-screen flex flex-col px-4 py-8 max-w-lg mx-auto">
      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        <div className="flex gap-1.5">
          <div className="w-6 h-1.5 rounded-full bg-primary" />
          <div className="w-6 h-1.5 rounded-full bg-muted" />
        </div>
        <span className="text-xs text-muted-foreground font-medium">Step 1 of 2</span>
      </div>

      {/* Heading */}
      <h1 className="text-2xl font-bold text-foreground mb-2">Tell us about your health profile</h1>
      <p className="text-sm text-muted-foreground mb-8">
        We'll personalize air quality recommendations based on your needs
      </p>

      {/* Profile Cards Grid */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {PROFILE_CARDS.map(profile => {
          const Icon = profile.icon
          const isSelected = selectedProfile === profile.id

          return (
            <Card
              key={profile.id}
              onClick={() => setSelectedProfile(profile.id)}
              className={cn(
                'cursor-pointer transition-all duration-200 hover:shadow-md',
                isSelected
                  ? 'border-primary ring-2 ring-primary ring-offset-1 bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
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

      {/* Continue Button */}
      <Button asChild size="lg" className="w-full rounded-lg">
        <Link to="/onboarding/city">Continue</Link>
      </Button>
    </div>
  )
}

export default HealthProfileSection
