import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import HomeCitySection from './HomeCitySection'
import { useAuth } from '@/hooks/useAuth'
import { useGeolocation } from '@/hooks/useGeolocation'

const { mockSetDoc, mockDoc, mockByCityFetch, mockReverseGeocodeMutate, mockUseUtils } = vi.hoisted(
  () => ({
    mockSetDoc: vi.fn(),
    mockDoc: vi.fn((_db, collection: string, uid: string) => `${collection}/${uid}`),
    mockByCityFetch: vi.fn(),
    mockReverseGeocodeMutate: vi.fn(),
    mockUseUtils: vi.fn(),
  })
)

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/hooks/useGeolocation', () => ({
  useGeolocation: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  setDoc: mockSetDoc,
}))

vi.mock('@/lib/firebase', () => ({
  db: {},
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: mockUseUtils,
  },
}))

describe('HomeCitySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' }, setHomeCity: vi.fn() } as never)
    vi.mocked(useGeolocation).mockReturnValue({
      getLocation: vi.fn(),
      loading: false,
      error: null,
    })
    mockSetDoc.mockResolvedValue(undefined)
    mockByCityFetch.mockResolvedValue({
      type: 'country',
      name: 'Philippines',
      country: 'Philippines',
    })
    mockReverseGeocodeMutate.mockResolvedValue({ city: 'Manila', country: 'Philippines' })
    mockUseUtils.mockReturnValue({
      search: { byCity: { fetch: mockByCityFetch } },
      client: { search: { reverseGeocode: { mutate: mockReverseGeocodeMutate } } },
    })
    vi.mocked(useNavigate).mockReturnValue(vi.fn())
  })

  it('uses reverse geocode when "Use My Location" succeeds', async () => {
    vi.mocked(useGeolocation).mockReturnValue({
      getLocation: vi.fn().mockResolvedValue({ latitude: 14.6, longitude: 121.0 }),
      loading: false,
      error: null,
    })

    const { getByRole, getByDisplayValue } = render(
      <MemoryRouter>
        <HomeCitySection />
      </MemoryRouter>
    )

    fireEvent.click(getByRole('button', { name: /Use My Location/i }))

    await waitFor(() => {
      expect(mockReverseGeocodeMutate).toHaveBeenCalledWith({ lat: 14.6, lon: 121.0 })
      expect(getByDisplayValue('Manila')).toBeInTheDocument()
    })
  })

  it('validates and saves supported location on complete setup', async () => {
    const navigate = vi.fn()
    const setHomeCity = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(navigate)
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' }, setHomeCity } as never)

    const { getByPlaceholderText, getByRole } = render(
      <MemoryRouter>
        <HomeCitySection />
      </MemoryRouter>
    )

    fireEvent.change(getByPlaceholderText('Type your country...'), {
      target: { value: 'Philippines' },
    })
    fireEvent.click(getByRole('button', { name: 'Complete Setup' }))

    await waitFor(() => {
      expect(mockByCityFetch).toHaveBeenCalledWith({ query: 'Philippines', skipAi: true })
      expect(mockSetDoc).toHaveBeenCalledWith(
        'users/user-1',
        { homeCity: 'Philippines' },
        { merge: true }
      )
      expect(setHomeCity).toHaveBeenCalledWith('Philippines')
      expect(navigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('shows validation error for unsupported countries', async () => {
    mockByCityFetch.mockResolvedValue({ type: 'country', name: 'Japan', country: 'Japan' })

    const { getByPlaceholderText, getByRole, findByText } = render(
      <MemoryRouter>
        <HomeCitySection />
      </MemoryRouter>
    )

    fireEvent.change(getByPlaceholderText('Type your country...'), {
      target: { value: 'Japan' },
    })
    fireEvent.click(getByRole('button', { name: 'Complete Setup' }))

    expect(
      await findByText('This application only supports Southeast Asian countries.')
    ).toBeInTheDocument()
  })
})
