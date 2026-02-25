import { z } from 'zod'
import { router, protectedProcedure } from '../trpc.js'
import { CreateUserSchema, UserSchema } from '@repo/shared/schemas'

export const userRouter = router({
  create: protectedProcedure
    .input(CreateUserSchema)
    .output(UserSchema)
    .mutation(({ input }) => ({
      id: 'dummy-id',
      email: input.email,
      name: input.name,
    })),

  getById: protectedProcedure
    .input(z.string())
    .output(UserSchema)
    .query(({ input }) => ({
      id: input,
      email: 'test@example.com',
      name: 'Test User',
    })),

  list: protectedProcedure.output(z.array(UserSchema)).query(() => [
    { id: 'user-1', email: 'user1@example.com', name: 'User One' },
    { id: 'user-2', email: 'user2@example.com', name: 'User Two' },
  ]),
})
