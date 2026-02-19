import express from 'express'
import cors from 'cors'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './trpc/router'

const PORT = Number(process.env.PORT ?? 5001)

const app = express()

app.use(
  cors({
    origin: [
      'http://localhost:5173', // Vite dev
      'http://localhost:4173', // Vite preview
    ],
  })
)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext: () => ({}),
  })
)

app.listen(PORT, () => {
  console.log(`tRPC server → http://localhost:${PORT}/api/trpc`)
})
