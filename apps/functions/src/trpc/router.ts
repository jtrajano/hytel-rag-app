import { router } from './trpc.js'
import { userRouter } from './routers/user.js'
import { chatRouter } from './routers/chat.js'
import { searchRouter } from './routers/search.js'

export const appRouter = router({
  user: userRouter,
  chat: chatRouter,
  search: searchRouter,
})

export type AppRouter = typeof appRouter
