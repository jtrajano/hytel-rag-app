import express from 'express'
import cors from 'cors'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './trpc/router.js'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import type { TrpcContext } from './trpc/trpc.js'

const app = express()

if (getApps().length === 0) {
  initializeApp({ projectId: 'aircare-sea' })
}

function getBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) return null
  const m = headerValue.match(/^Bearer\s+(.+)$/i)
  return m?.[1] ?? null
}

async function createContext(opts: { req: express.Request }): Promise<TrpcContext> {
  const authz = opts.req.header('authorization')
  const token = getBearerToken(authz ?? undefined)
  if (!token) {
    console.warn('Auth missing/invalid', {
      hasAuthorizationHeader: !!authz,
      authPrefix: authz?.slice(0, 20) ?? null, // do not log full token
    })
    return { user: null }
  }

  try {
    const decoded = await getAuth().verifyIdToken(token)
    return {
      user: {
        uid: decoded.uid,
        email: decoded.email ?? null,
      },
    }
  } catch (err) {
    console.error('verifyIdToken failed:', err)
    return { user: null }
  }
}

app.use(cors({ origin: true }))
app.use('/trpc', createExpressMiddleware({ router: appRouter, createContext }))
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

export default app
