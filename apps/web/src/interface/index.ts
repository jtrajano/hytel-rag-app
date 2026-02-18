export type ProfileId = 'healthy' | 'asthma' | 'pregnant' | 'elderly' | 'child'

export interface ProfileCard {
  id: ProfileId
  icon: React.ElementType
  title: string
  description: string
}

export interface ForecastDay {
  label: string
  aqi: number
  category: string
  aqiColor: string
  badgeClass: string
  WeatherIcon: React.ElementType
  iconColor: string
}
