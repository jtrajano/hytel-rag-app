export function getAqiTextColor(aqi: number): string {
  if (aqi <= 50) return 'text-green-500'
  if (aqi <= 100) return 'text-yellow-500'
  if (aqi <= 150) return 'text-orange-400'
  if (aqi <= 200) return 'text-orange-600'
  if (aqi <= 300) return 'text-red-600'
  return 'text-rose-900'
}

export function getAqiBadgeClass(aqi: number): string {
  if (aqi <= 50) return 'bg-green-500 hover:bg-green-500 text-white border-0'
  if (aqi <= 100) return 'bg-yellow-500 hover:bg-yellow-500 text-white border-0'
  if (aqi <= 150) return 'bg-orange-400 hover:bg-orange-400 text-white border-0'
  if (aqi <= 200) return 'bg-orange-600 hover:bg-orange-600 text-white border-0'
  if (aqi <= 300) return 'bg-red-600 hover:bg-red-600 text-white border-0'
  return 'bg-rose-900 hover:bg-rose-900 text-white border-0'
}

export function getAqiScaleIndex(aqi: number): number {
  if (aqi <= 50) return 0
  if (aqi <= 100) return 1
  if (aqi <= 150) return 2
  if (aqi <= 200) return 3
  if (aqi <= 300) return 4
  return 5
}
