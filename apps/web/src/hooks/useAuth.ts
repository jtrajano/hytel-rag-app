import { useAuthContext } from '@/providers/AuthProvider'

export function useAuth() {
  return useAuthContext()
}
