import { TRPCError, initTRPC } from '@trpc/server'

export interface TrpcContext {
  user: {
    uid: string
    email: string | null
  } | null
}

const t = initTRPC.context<TrpcContext>().create()

const requireAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required.',
    })
  }

  return next({
    ctx: {
      user: ctx.user,
    },
  })
})

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(requireAuth)
export const createCallerFactory = t.createCallerFactory
