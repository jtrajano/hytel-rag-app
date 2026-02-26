import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from './DashboardPage'
import { useAuth } from '@/hooks/useAuth'

const { morningMock, aqiMock, forecastMock, mockUseQuery } = vi.hoisted(() => ({
  morningMock: vi.fn(() => null),
  aqiMock: vi.fn(() => null),
  forecastMock: vi.fn(() => null),
  mockUseQuery: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    chat: {
      currentAqi: {
        useQuery: mockUseQuery,
      },
    },
  },
}))

vi.mock('@/sections/dashboard/MorningSummarySection', () => ({
  default: morningMock,
}))

vi.mock('@/sections/dashboard/AQIOverviewSection', () => ({
  default: aqiMock,
}))

vi.mock('@/sections/dashboard/ForecastSection', () => ({
  default: forecastMock,
}))

const mockAqi = {
  city: 'Manila',
  aqi: 55,
  quality: 'Moderate',
  updatedAt: new Date().toISOString(),
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseQuery.mockReturnValue({ data: mockAqi, isLoading: false, isError: false })
  })

  it('passes currentAqi into dashboard sections and handles sign out', () => {
    const signOut = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      user: { displayName: 'Jane Doe' },
      loading: false,
      signOut,
      homeCity: 'Manila',
    } as never)

    const { getByLabelText } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    )

    expect(morningMock).toHaveBeenCalledWith(
      expect.objectContaining({ homeCity: 'Manila', currentAqi: mockAqi }),
      {}
    )
    expect(aqiMock).toHaveBeenCalledWith(
      expect.objectContaining({ currentAqi: mockAqi, isLoading: false, isError: false }),
      {}
    )
    expect(forecastMock).toHaveBeenCalledWith(expect.objectContaining({ homeCity: 'Manila' }), {})

    fireEvent.click(getByLabelText('Sign out'))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('maps Philippines homeCity to Manila for the AQI query', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { displayName: 'Jane Doe' },
      loading: false,
      signOut: vi.fn(),
      homeCity: 'Philippines',
    } as never)

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    )

    expect(mockUseQuery).toHaveBeenCalledWith({ city: 'Manila' }, expect.anything())
  })
})
