import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './style.css'

import { httpBatchLink } from '@trpc/client'
import { trpc } from './lib/trpc'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './providers/AuthProvider'

function Root() {
  // 1. Create the trpc client instance
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          // IMPORTANT: Make sure this URL matches your backend server URL
          url: 'http://localhost:5001/api/trpc',

          // Optional: If you need to pass your auth token to the backend
          async headers() {
            return {
              // authorization: getAuthCookie(),
            }
          },
        }),
      ],
    })
  )

  return (
    <StrictMode>
      {/* 2. Wrap the app in trpc.Provider */}
      {/* Note: It must wrap QueryClientProvider and use the SAME queryClient */}
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </trpc.Provider>
    </StrictMode>
  )
}

createRoot(document.getElementById('app')!).render(<Root />)
