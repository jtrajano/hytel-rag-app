import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import SearchSection from './SearchSection'
import { useGeolocation } from '@/hooks/useGeolocation'

const {
  mockUseSearchPlace,
  mockGetLocation,
  mockReverseGeocodeMutate,
  mockUseUtils,
  mockSearchResults,
} = vi.hoisted(() => ({
  mockUseSearchPlace: vi.fn(),
  mockGetLocation: vi.fn(),
  mockReverseGeocodeMutate: vi.fn(),
  mockUseUtils: vi.fn(),
  mockSearchResults: vi.fn(() => null),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  }
})

vi.mock('@/hooks/useSearchPlace', () => ({
  useSearchPlace: mockUseSearchPlace,
}))

vi.mock('@/hooks/useGeolocation', () => ({
  useGeolocation: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: mockUseUtils,
  },
}))

vi.mock('./SearchResults', () => ({
  SearchResults: mockSearchResults,
}))

describe('SearchSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSearchPlace.mockReturnValue({ data: null, isLoading: false, isError: false })
    vi.mocked(useGeolocation).mockReturnValue({
      getLocation: mockGetLocation,
      loading: false,
      error: null,
    })
    mockUseUtils.mockReturnValue({
      client: { search: { reverseGeocode: { mutate: mockReverseGeocodeMutate } } },
    })
  })

  it('submits manual search query on Enter key', async () => {
    const { getByPlaceholderText } = render(<SearchSection />)
    const input = getByPlaceholderText('Search city or country...')

    fireEvent.change(input, { target: { value: 'Manila' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockUseSearchPlace).toHaveBeenLastCalledWith('Manila')
    })
  })

  it('sets query from detected location', async () => {
    mockGetLocation.mockResolvedValue({ latitude: 14.6, longitude: 121.0 })
    mockReverseGeocodeMutate.mockResolvedValue({ city: 'Quezon City', country: 'Philippines' })

    const { getByLabelText } = render(<SearchSection />)
    fireEvent.click(getByLabelText('Detect my location'))

    await waitFor(() => {
      expect(mockReverseGeocodeMutate).toHaveBeenCalledWith({ lat: 14.6, lon: 121.0 })
      expect(mockUseSearchPlace).toHaveBeenLastCalledWith('Quezon City')
    })
  })

  it('shows location error when geolocation returns no coordinates', async () => {
    mockGetLocation.mockResolvedValue(null)

    const { getByLabelText, findByText } = render(<SearchSection />)
    fireEvent.click(getByLabelText('Detect my location'))

    expect(
      await findByText(
        'Could not access your location. Please allow location access and try again.'
      )
    ).toBeInTheDocument()
  })

  it('passes result to SearchResults when data exists', () => {
    const resultData = {
      type: 'city',
      id: 'mnl',
      name: 'Manila',
      country: 'Philippines',
      flagEmoji: '🇵🇭',
      pollution: {
        aqi: 50,
        category: 'Good',
        pm25: 12,
        pm10: 20,
        o3: 6,
        no2: 3,
        updatedAt: new Date().toISOString(),
      },
      visitorGuidelines: [],
      preventionTips: [],
      improvementActions: [],
    }
    mockUseSearchPlace.mockReturnValue({ data: resultData, isLoading: false, isError: false })

    render(<SearchSection />)

    expect(mockSearchResults).toHaveBeenCalledWith(
      expect.objectContaining({ result: resultData }),
      expect.anything()
    )
  })
})
