import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginSection from './LoginSection'
import { useAuth } from '@/hooks/useAuth'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('LoginSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits credentials through signInWithEmail', async () => {
    const signInWithEmail = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({ signInWithEmail, signInWithGoogle: vi.fn() } as never)

    const { container, getByRole } = render(
      <MemoryRouter>
        <LoginSection />
      </MemoryRouter>
    )

    const email = container.querySelector('input[type="email"]') as HTMLInputElement
    const password = container.querySelector('input[type="password"]') as HTMLInputElement
    fireEvent.change(email, { target: { value: 'jane@example.com' } })
    fireEvent.change(password, { target: { value: 'secret123' } })
    fireEvent.click(getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(signInWithEmail).toHaveBeenCalledWith('jane@example.com', 'secret123')
    })
  })

  it('maps invalid credential errors to user-friendly message', async () => {
    const signInWithEmail = vi.fn().mockRejectedValue({ code: 'auth/invalid-credential' })
    vi.mocked(useAuth).mockReturnValue({ signInWithEmail, signInWithGoogle: vi.fn() } as never)

    const { container, getByRole, findByText } = render(
      <MemoryRouter>
        <LoginSection />
      </MemoryRouter>
    )

    fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: 'jane@example.com' },
    })
    fireEvent.change(container.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: 'wrong' },
    })
    fireEvent.click(getByRole('button', { name: 'Sign In' }))

    expect(await findByText('Invalid email or password.')).toBeInTheDocument()
  })
})
