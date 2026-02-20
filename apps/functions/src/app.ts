import express from 'express'
import cors from 'cors'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './trpc/router.js'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import type { TrpcContext } from './trpc/trpc.js'

const app = express()

if (getApps().length === 0) {
  initializeApp()
}

function getBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) return null
  const [scheme, token] = headerValue.split(' ')
  if (scheme !== 'Bearer' || !token) return null
  return token
}

async function createContext(opts: { req: express.Request }): Promise<TrpcContext> {
  const token = getBearerToken(opts.req.header('authorization'))
  if (!token) {
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
  } catch {
    return { user: null }
  }
}

app.use(cors({ origin: true }))
app.use('/trpc', createExpressMiddleware({ router: appRouter, createContext }))
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

export default app
