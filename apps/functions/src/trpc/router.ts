import { router } from './trpc'
import { userRouter } from './routers/user'
import { chatRouter } from './routers/chat'
import { searchRouter } from './routers/search'

export const appRouter = router({
  user: userRouter,
  chat: chatRouter,
  search: searchRouter,
})

export type AppRouter = typeof appRouter
