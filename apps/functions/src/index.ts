import express from 'express'
import cors from 'cors'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './trpc/router'

export { appRouter, type AppRouter } from './trpc/router'

const app = express()

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  })
)

app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext: () => ({}),
  })
)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

const port = Number(process.env.PORT ?? 5001)
app.listen(port, () => {
  console.log(`AirCare SEA API running at http://localhost:${port}/api/trpc`)
})
