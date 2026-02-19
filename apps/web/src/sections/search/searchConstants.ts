// Explicit ring classes required for Tailwind JIT — never use string interpolation
export const AQI_SCALE_SEGMENTS = [
  { bg: 'bg-green-400', ringClass: 'ring-green-400', title: 'Good (0–50)' },
  { bg: 'bg-yellow-400', ringClass: 'ring-yellow-400', title: 'Moderate (51–100)' },
  {
    bg: 'bg-orange-300',
    ringClass: 'ring-orange-300',
    title: 'Unhealthy for Sensitive Groups (101–150)',
  },
  { bg: 'bg-orange-600', ringClass: 'ring-orange-600', title: 'Unhealthy (151–200)' },
  { bg: 'bg-red-700', ringClass: 'ring-red-700', title: 'Very Unhealthy (201–300)' },
  { bg: 'bg-rose-950', ringClass: 'ring-rose-950', title: 'Hazardous (301+)' },
]

export const POPULAR_SEARCHES = [
  'Lahore',
  'Delhi',
  'Beijing',
  'New York',
  'London',
  'Dhaka',
  'Sao Paulo',
  'Jakarta',
]
