import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from './DashboardPage'
import { useAuth } from '@/hooks/useAuth'

const { morningMock, aqiMock, forecastMock } = vi.hoisted(() => ({
  morningMock: vi.fn(() => null),
  aqiMock: vi.fn(() => null),
  forecastMock: vi.fn(() => null),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
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

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes homeCity into dashboard sections and handles sign out', () => {
    const signOut = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      user: { displayName: 'Jane Doe' },
      signOut,
      homeCity: 'Manila',
    } as never)

    const { getByLabelText } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    )

    expect(morningMock).toHaveBeenCalledWith(expect.objectContaining({ homeCity: 'Manila' }), {})
    expect(aqiMock).toHaveBeenCalledWith(expect.objectContaining({ homeCity: 'Manila' }), {})
    expect(forecastMock).toHaveBeenCalledWith(expect.objectContaining({ homeCity: 'Manila' }), {})

    fireEvent.click(getByLabelText('Sign out'))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
