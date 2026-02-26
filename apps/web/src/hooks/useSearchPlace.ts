import { trpc } from '@/lib/trpc'
import { useAuth } from '@/hooks/useAuth'

export function useSearchPlace(query: string) {
  const { user, loading } = useAuth()

  return trpc.search.byCity.useQuery(
    { query: query.trim(), skipAi: true },
    {
      enabled: !loading && !!user && query.trim().length > 0,
      staleTime: 5 * 60 * 1000,
      retry: false,
    }
  )
}
