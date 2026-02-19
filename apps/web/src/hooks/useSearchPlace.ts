import { trpc } from '@/lib/trpc'

export function useSearchPlace(query: string) {
  return trpc.search.byCity.useQuery(
    { query: query.trim() },
    {
      enabled: query.trim().length > 0,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    }
  )
}
