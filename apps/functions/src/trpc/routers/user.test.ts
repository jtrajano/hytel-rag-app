import { describe, it, expect } from 'vitest'
import { appRouter } from '../router'
import { createCallerFactory } from '../trpc'

const createCaller = createCallerFactory(appRouter)
const caller = createCaller({})

describe('userRouter', () => {
  describe('create', () => {
    it('creates a user with valid data', async () => {
      const result = await caller.user.create({
        email: 'test@example.com',
        name: 'Test User',
      })
      expect(result.id).toBeDefined()
      expect(result.email).toBe('test@example.com')
      expect(result.name).toBe('Test User')
    })

    it('returns a dummy id', async () => {
      const result = await caller.user.create({
        email: 'another@example.com',
      })
      expect(result.id).toBe('dummy-id')
    })
  })

  describe('getById', () => {
    it('returns a user by id', async () => {
      const result = await caller.user.getById('user-123')
      expect(result.id).toBe('user-123')
      expect(result.email).toBeDefined()
    })

    it('returns dummy data', async () => {
      const result = await caller.user.getById('any-id')
      expect(result.email).toBe('test@example.com')
      expect(result.name).toBe('Test User')
    })
  })

  describe('list', () => {
    it('returns a list of users', async () => {
      const result = await caller.user.list()
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
