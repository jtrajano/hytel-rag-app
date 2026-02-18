import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useUsers, useUser, useCreateUser } from './useUsers'

// Mock the trpc client
vi.mock('../lib/trpc', () => ({
  trpc: {
    user: {
      list: {
        useQuery: vi.fn(() => ({
          data: [
            { id: 'user-1', email: 'user1@example.com', name: 'User One' },
            { id: 'user-2', email: 'user2@example.com', name: 'User Two' },
          ],
          isLoading: false,
          error: null,
        })),
      },
      getById: {
        useQuery: vi.fn(() => ({
          data: { id: 'user-1', email: 'user1@example.com', name: 'User One' },
          isLoading: false,
          error: null,
        })),
      },
      create: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
          mutateAsync: vi.fn().mockResolvedValue({
            id: 'new-user',
            email: 'new@example.com',
            name: 'New User',
          }),
          isLoading: false,
          error: null,
        })),
      },
    },
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useUsers', () => {
  it('returns user list data', () => {
    const { result } = renderHook(() => useUsers(), {
      wrapper: createWrapper(),
    })
    expect(result.current.data).toBeDefined()
    expect(result.current.data?.length).toBe(2)
  })

  it('returns loading state', () => {
    const { result } = renderHook(() => useUsers(), {
      wrapper: createWrapper(),
    })
    expect(result.current.isLoading).toBeDefined()
  })
})

describe('useUser', () => {
  it('returns single user by id', () => {
    const { result } = renderHook(() => useUser('user-1'), {
      wrapper: createWrapper(),
    })
    expect(result.current.data).toBeDefined()
    expect(result.current.data?.id).toBe('user-1')
  })
})

describe('useCreateUser', () => {
  it('returns mutation function', () => {
    const { result } = renderHook(() => useCreateUser(), {
      wrapper: createWrapper(),
    })
    expect(result.current.mutateAsync).toBeDefined()
    expect(typeof result.current.mutateAsync).toBe('function')
  })
})
