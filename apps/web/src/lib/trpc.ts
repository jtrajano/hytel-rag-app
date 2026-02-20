import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink, httpBatchStreamLink, splitLink } from '@trpc/client'
import type { AppRouter } from '@repo/functions/router'
import { auth } from './firebase'

export const trpc = createTRPCReact<AppRouter>()

const url = import.meta.env.VITE_API_URL || 'http://localhost:5001/trpc'

async function getAuthHeaders() {
  const user = auth.currentUser
  if (!user) return {}

  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}` }
}

export const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: op => op.type === 'query',
      true: httpBatchStreamLink({
        url,
        headers: getAuthHeaders,
      }),
      false: httpBatchLink({
        url,
        headers: getAuthHeaders,
      }),
    }),
  ],
})
