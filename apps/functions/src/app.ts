import express from 'express'
import cors from 'cors'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './trpc/router.js'

const app = express()
app.use(cors({ origin: true }))
app.use('/trpc', createExpressMiddleware({ router: appRouter, createContext: () => ({}) }))
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

export default app
