import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { PollutionMapSection } from './PollutionMapSection'

const { mockCountryHook, mockCityHook, mockMap } = vi.hoisted(() => ({
  mockCountryHook: vi.fn(),
  mockCityHook: vi.fn(),
  mockMap: vi.fn(() => null),
}))

vi.mock('@/hooks/useCountryAQI', () => ({
  useCountryAQI: mockCountryHook,
}))

vi.mock('@/hooks/useCityAQI', () => ({
  useCityAQI: mockCityHook,
}))

vi.mock('@/components/map/AQIMap', () => ({
  AQIMap: mockMap,
}))

describe('PollutionMapSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCountryHook.mockReturnValue({
      data: new Map([['thailand', { id: 'th', name: 'Thailand', aqi: 60, category: 'Moderate' }]]),
      isLoading: false,
      isError: false,
    })
    mockCityHook.mockReturnValue({
      data: [{ id: 'bangkok', name: 'Bangkok', aqi: 70, category: 'Moderate' }],
      isLoading: false,
      isError: false,
    })
  })

  it('uses country level by default and switches to city level', () => {
    const { getByRole } = render(<PollutionMapSection />)

    expect(mockMap).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'country' }),
      expect.anything()
    )

    fireEvent.click(getByRole('button', { name: 'City' }))
    expect(mockMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ level: 'city' }),
      expect.anything()
    )
  })

  it('shows loading/error state from active level only', () => {
    mockCountryHook.mockReturnValue({
      data: new Map(),
      isLoading: true,
      isError: false,
    })
    mockCityHook.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
    })

    const { getByText, queryByText, getByRole } = render(<PollutionMapSection />)
    expect(getByText(/Loading air quality data/i)).toBeInTheDocument()
    expect(queryByText(/Could not load air quality data/i)).not.toBeInTheDocument()

    fireEvent.click(getByRole('button', { name: 'City' }))
    expect(getByText(/Could not load air quality data/i)).toBeInTheDocument()
  })
})
