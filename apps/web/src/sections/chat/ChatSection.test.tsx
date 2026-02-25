import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import ChatSection from './ChatSection'
import { useParams, useNavigate } from 'react-router-dom'

const { mockMutate, mockUseListSessions, mockUseSessionMessages, mockUseAskMutation, mockUseAuth } =
  vi.hoisted(() => ({
    mockMutate: vi.fn(),
    mockUseListSessions: vi.fn(),
    mockUseSessionMessages: vi.fn(),
    mockUseAskMutation: vi.fn(),
    mockUseAuth: vi.fn(),
  }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
    useParams: vi.fn(),
    useNavigate: vi.fn(),
  }
})

vi.mock('@/hooks/useAuth', () => ({
  useAuth: mockUseAuth,
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    chat: {
      listSessions: {
        useQuery: mockUseListSessions,
      },
      getSessionMessages: {
        useQuery: mockUseSessionMessages,
      },
      ask: {
        useMutation: mockUseAskMutation,
      },
    },
  },
}))

describe('ChatSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    vi.mocked(useParams).mockReturnValue({})
    vi.mocked(useNavigate).mockReturnValue(vi.fn())
    mockUseAuth.mockReturnValue({ user: { displayName: 'Jane Doe' } })
    mockUseListSessions.mockReturnValue({
      data: [],
      refetch: vi.fn(),
      isLoading: false,
      error: null,
    })
    mockUseSessionMessages.mockReturnValue({
      data: undefined,
      isLoading: false,
    })
    mockUseAskMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    })
  })

  it('sends trimmed message with city match', async () => {
    const { getByPlaceholderText } = render(<ChatSection />)
    const input = getByPlaceholderText('Ask about air quality...') as HTMLInputElement

    fireEvent.change(input, { target: { value: '  What is AQI in Manila today?  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        question: 'What is AQI in Manila today?',
        sessionId: undefined,
        city: 'manila',
      })
    })
    expect(input.value).toBe('')
  })

  it('does not send empty input', () => {
    const { getByPlaceholderText } = render(<ChatSection />)
    const input = getByPlaceholderText('Ask about air quality...')

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('does not send while mutation is pending', () => {
    mockUseAskMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    })

    const { getByPlaceholderText } = render(<ChatSection />)
    const input = getByPlaceholderText('Ask about air quality...')

    fireEvent.change(input, { target: { value: 'Bangkok AQI' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockMutate).not.toHaveBeenCalled()
  })
})
