import { router } from './trpc'
import { userRouter } from './routers/user'
import { chatRouter } from './routers/chat'

export const appRouter = router({
  user: userRouter,
  chat: chatRouter,
})

export type AppRouter = typeof appRouter
