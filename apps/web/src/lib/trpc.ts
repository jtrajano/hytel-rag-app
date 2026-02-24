import { createTRPCReact } from '@trpc/react-query'
import { httpBatchStreamLink } from '@trpc/client'
import { onAuthStateChanged, type User } from 'firebase/auth'
import type { AppRouter } from '@repo/functions/router'
import { auth } from './firebase'

export const trpc = createTRPCReact<AppRouter>()

const url = import.meta.env.VITE_API_URL || 'http://localhost:5001/trpc'

async function getCurrentUser(timeoutMs = 1500): Promise<User | null> {
  if (auth.currentUser) return auth.currentUser

  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady()
    if (auth.currentUser) return auth.currentUser
  }

  return await new Promise(resolve => {
    const timeout = setTimeout(() => {
      unsubscribe()
      resolve(auth.currentUser)
    }, timeoutMs)

    const unsubscribe = onAuthStateChanged(auth, user => {
      clearTimeout(timeout)
      unsubscribe()
      resolve(user)
    })
  })
}

async function getAuthHeaders() {
  const user = await getCurrentUser()
  if (!user) return {}

  try {
    const token = await user.getIdToken()
    return {
      authorization: `Bearer ${token}`,
      'x-authorization': `Bearer ${token}`,
    }
  } catch (err) {
    console.error('Failed to fetch Firebase ID token for tRPC headers', err)
    return {}
  }
}

export const trpcClient = trpc.createClient({
  links: [
    // Stream link always uses POST, preventing GET-on-mutation transport issues.
    httpBatchStreamLink({
      url,
      headers: getAuthHeaders,
    }),
  ],
})
