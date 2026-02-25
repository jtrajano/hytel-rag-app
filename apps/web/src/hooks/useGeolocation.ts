import { useState, useCallback } from 'react'

interface Coordinates {
  latitude: number
  longitude: number
}

export const useGeolocation = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getLocation = useCallback(async (): Promise<Coordinates | null> => {
    setLoading(true)
    setError(null)

    if (!navigator.geolocation) {
      setError('Geolocation not supported by your browser')
      setLoading(false)
      return null
    }

    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        position => {
          setLoading(false)
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
        },
        err => {
          setError(err.message)
          setLoading(false)
          resolve(null)
        }
      )
    })
  }, [])

  return { getLocation, loading, error }
}
