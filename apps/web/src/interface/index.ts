export type ProfileId = 'healthy' | 'asthma' | 'pregnant' | 'elderly' | 'child'

export interface ProfileCard {
  id: ProfileId
  icon: React.ElementType
  title: string
  description: string
}
