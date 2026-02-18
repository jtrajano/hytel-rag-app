import { describe, it, expect } from 'vitest'
import { UserSchema, CreateUserSchema } from './user'

describe('UserSchema', () => {
  it('validates correct user data', () => {
    const result = UserSchema.safeParse({
      id: '123',
      email: 'test@example.com',
      name: 'Test User',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing id', () => {
    const result = UserSchema.safeParse({
      email: 'test@example.com',
      name: 'Test User',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid email', () => {
    const result = UserSchema.safeParse({
      id: '123',
      email: 'invalid-email',
      name: 'Test User',
    })
    expect(result.success).toBe(false)
  })

  it('allows optional name', () => {
    const result = UserSchema.safeParse({
      id: '123',
      email: 'test@example.com',
    })
    expect(result.success).toBe(true)
  })
})

describe('CreateUserSchema', () => {
  it('validates user creation input', () => {
    const result = CreateUserSchema.safeParse({
      email: 'new@example.com',
      name: 'New User',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email on creation', () => {
    const result = CreateUserSchema.safeParse({
      email: 'bad-email',
      name: 'New User',
    })
    expect(result.success).toBe(false)
  })

  it('requires email', () => {
    const result = CreateUserSchema.safeParse({
      name: 'New User',
    })
    expect(result.success).toBe(false)
  })
})
