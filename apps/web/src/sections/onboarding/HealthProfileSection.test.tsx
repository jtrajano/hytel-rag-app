import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import HealthProfileSection from './HealthProfileSection'
import { useAuth } from '@/hooks/useAuth'

const { mockSetDoc, mockDoc } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockDoc: vi.fn((_db, collection: string, uid: string) => `${collection}/${uid}`),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
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

describe('HealthProfileSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' } } as never)
    mockSetDoc.mockResolvedValue(undefined)
    vi.mocked(useNavigate).mockReturnValue(vi.fn())
  })

  it('limits selected profiles to three', () => {
    const { getByText, queryAllByText } = render(
      <MemoryRouter>
        <HealthProfileSection />
      </MemoryRouter>
    )

    fireEvent.click(getByText('Healthy Adult'))
    fireEvent.click(getByText('Asthma'))
    fireEvent.click(getByText('Pregnant'))
    fireEvent.click(getByText('Elderly'))

    expect(
      queryAllByText((_, el) => Boolean(el?.textContent?.includes('3 selected'))).length
    ).toBeGreaterThan(0)
    expect(getByText('Continue')).toBeEnabled()
  })

  it('saves selected profiles and navigates to city onboarding', async () => {
    const navigate = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(navigate)

    const { getByText } = render(
      <MemoryRouter>
        <HealthProfileSection />
      </MemoryRouter>
    )

    fireEvent.click(getByText('Healthy Adult'))
    fireEvent.click(getByText('Asthma'))
    fireEvent.click(getByText('Continue'))

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        'users/user-1',
        { healthProfile: ['healthy', 'asthma'] },
        { merge: true }
      )
      expect(navigate).toHaveBeenCalledWith('/onboarding/city')
    })
  })
})
