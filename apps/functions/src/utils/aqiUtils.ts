export type AqiCategory =
  | 'Good'
  | 'Moderate'
  | 'Unhealthy for Sensitive Groups'
  | 'Unhealthy'
  | 'Very Unhealthy'
  | 'Hazardous'

interface AqiBreakpoint {
  cLo: number
  cHi: number
  iLo: number
  iHi: number
}

const PM25_BREAKPOINTS: AqiBreakpoint[] = [
  { cLo: 0.0, cHi: 12.0, iLo: 0, iHi: 50 },
  { cLo: 12.1, cHi: 35.4, iLo: 51, iHi: 100 },
  { cLo: 35.5, cHi: 55.4, iLo: 101, iHi: 150 },
  { cLo: 55.5, cHi: 150.4, iLo: 151, iHi: 200 },
  { cLo: 150.5, cHi: 250.4, iLo: 201, iHi: 300 },
  { cLo: 250.5, cHi: 500.4, iLo: 301, iHi: 500 },
]

export function pm25ToAqi(pm25: number): number {
  const c = Math.round(pm25 * 10) / 10 // truncate to 1 decimal per EPA spec
  const bp = PM25_BREAKPOINTS.find(b => c >= b.cLo && c <= b.cHi)
  if (!bp) return pm25 > 500 ? 500 : 0
  const aqi = ((bp.iHi - bp.iLo) / (bp.cHi - bp.cLo)) * (c - bp.cLo) + bp.iLo
  return Math.round(aqi)
}

export function aqiToCategory(aqi: number): AqiCategory {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

export function findClosestHourlyIndex(times: string[], target: Date): number {
  const targetMs = target.getTime()
  let best = -1
  let bestDelta = Number.POSITIVE_INFINITY
  for (let i = 0; i < times.length; i++) {
    const ts = Date.parse(times[i])
    if (Number.isNaN(ts)) continue
    const delta = Math.abs(ts - targetMs)
    if (delta < bestDelta) {
      bestDelta = delta
      best = i
    }
  }
  return best
}
