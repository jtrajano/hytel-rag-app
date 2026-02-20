import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink, httpBatchStreamLink, splitLink } from '@trpc/client'
import type { AppRouter } from '@repo/functions/router'

export const trpc = createTRPCReact<AppRouter>()

const url = import.meta.env.VITE_API_URL || 'http://localhost:5001/trpc'

export const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: op => op.type === 'query',
      true: httpBatchStreamLink({ url }),
      false: httpBatchLink({ url }),
    }),
  ],
})
