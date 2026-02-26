import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AQIOverviewSection from './AQIOverviewSection'

describe('AQIOverviewSection', () => {
  it('renders the AQI value and quality when data is provided', () => {
    render(
      <AQIOverviewSection
        currentAqi={{
          city: 'Manila',
          aqi: 55,
          quality: 'Moderate',
          updatedAt: new Date().toISOString(),
        }}
        isLoading={false}
        isError={false}
      />
    )

    expect(screen.getByText('55')).toBeDefined()
    expect(screen.getByText('Moderate')).toBeDefined()
  })

  it('shows -- when loading', () => {
    render(<AQIOverviewSection isLoading={true} isError={false} />)

    expect(screen.getByText('--')).toBeDefined()
  })

  it('shows Unavailable when no data is provided', () => {
    render(<AQIOverviewSection isLoading={false} isError={false} />)

    expect(screen.getByText('Unavailable')).toBeDefined()
  })

  it('shows error message when isError is true', () => {
    render(<AQIOverviewSection isLoading={false} isError={true} />)

    expect(screen.getByText(/unable to load air quality/i)).toBeDefined()
  })
})
