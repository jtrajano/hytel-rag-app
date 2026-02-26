import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SignupSection from './SignupSection'
import { useAuth } from '@/hooks/useAuth'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('SignupSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits signup payload to signUpWithEmail', async () => {
    const signUpWithEmail = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({ signUpWithEmail, signInWithGoogle: vi.fn() } as never)

    const { container, getByRole } = render(
      <MemoryRouter>
        <SignupSection />
      </MemoryRouter>
    )

    const inputs = container.querySelectorAll('input')
    fireEvent.change(inputs[0], { target: { value: 'Jane Doe' } })
    fireEvent.change(inputs[1], { target: { value: 'jane@example.com' } })
    fireEvent.change(inputs[2], { target: { value: 'secret123' } })
    fireEvent.change(inputs[3], { target: { value: 'secret123' } })
    fireEvent.click(getByRole('button', { name: 'Create Account' }))

    await waitFor(() => {
      expect(signUpWithEmail).toHaveBeenCalledWith('jane@example.com', 'secret123', 'Jane Doe')
    })
  })

  it('maps duplicate-email errors to user-friendly message', async () => {
    const signUpWithEmail = vi.fn().mockRejectedValue({ code: 'auth/email-already-in-use' })
    vi.mocked(useAuth).mockReturnValue({ signUpWithEmail, signInWithGoogle: vi.fn() } as never)

    const { container, getByRole, findByText } = render(
      <MemoryRouter>
        <SignupSection />
      </MemoryRouter>
    )

    const inputs = container.querySelectorAll('input')
    fireEvent.change(inputs[0], { target: { value: 'Jane Doe' } })
    fireEvent.change(inputs[1], { target: { value: 'jane@example.com' } })
    fireEvent.change(inputs[2], { target: { value: 'secret123' } })
    fireEvent.change(inputs[3], { target: { value: 'secret123' } })
    fireEvent.click(getByRole('button', { name: 'Create Account' }))

    expect(await findByText('An account with this email already exists.')).toBeInTheDocument()
  })
})
