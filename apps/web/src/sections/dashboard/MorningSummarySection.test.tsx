import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import MorningSummarySection from './MorningSummarySection'
import { useAuth } from '@/hooks/useAuth'
import { trpc } from '@/lib/trpc'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    chat: {
      askBriefing: {
        useQuery: mockUseQuery,
      },
    },
  },
}))

describe('MorningSummarySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'user-1' }, loading: false } as never)
    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
    })
  })

  it('disables briefing query when valid cache exists for city', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    localStorage.setItem(
      'morning_briefing:Manila',
      JSON.stringify({
        answer: 'cached summary',
        cachedAt: 1_000_000 - 30 * 60 * 1000,
        city: 'Manila',
      })
    )

    render(<MorningSummarySection homeCity="Manila" />)

    await waitFor(() => {
      expect(trpc.chat.askBriefing.useQuery).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Manila' }),
        expect.objectContaining({ enabled: false })
      )
    })
  })

  it('enables briefing query when no cache is present', async () => {
    render(<MorningSummarySection homeCity="Bangkok" />)

    await waitFor(() => {
      expect(trpc.chat.askBriefing.useQuery).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Bangkok' }),
        expect.objectContaining({ enabled: true, retry: 1, refetchOnWindowFocus: false })
      )
    })
  })

  it('persists fetched answer into cache', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_000_000)
    mockUseQuery.mockReturnValue({
      data: { answer: 'fresh summary' },
      isPending: false,
      isError: false,
    })

    render(<MorningSummarySection homeCity="Singapore" />)

    await waitFor(() => {
      const raw = localStorage.getItem('morning_briefing:Singapore')
      expect(raw).toBeTruthy()
      expect(JSON.parse(raw as string)).toEqual({
        answer: 'fresh summary',
        cachedAt: 2_000_000,
        city: 'Singapore',
      })
    })
  })
})
