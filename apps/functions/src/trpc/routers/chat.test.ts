import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '../router'
import { createCallerFactory } from '../trpc'
import type { RagAnswer } from '../../services/ragService'

// ── Hoist mock fn so it is available inside vi.mock factory ───────────────────
const mockAsk = vi.hoisted(() => vi.fn<() => Promise<RagAnswer>>())

// ── Stub RAGService — avoids hitting Firestore / BigQuery / Vertex AI ─────────
vi.mock('../../services/ragService', () => ({
  RAGService: vi.fn(() => ({ ask: mockAsk })),
}))

// ── Caller (bypasses HTTP entirely — no GET/POST involved) ────────────────────
const createCaller = createCallerFactory(appRouter)
const caller = createCaller({
  user: {
    uid: 'test-user',
    email: 'test@example.com',
  },
})

// ── Default stub response ──────────────────────────────────────────────────────
const STUB_ANSWER: RagAnswer = {
  answer: 'Manila air quality is moderate with PM2.5 at 23 µg/m³.',
  sources: [{ label: 'WHO Guidelines', url: 'https://who.int/air-quality' }],
}

describe('chatRouter.ask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAsk.mockResolvedValue(STUB_ANSWER)
  })

  // ── Procedure type ─────────────────────────────────────────────────────────
  // This is the root cause of the "Unsupported GET-request to mutation procedure"
  // error. tRPC v11 httpBatchLink sends batch requests as HTTP GET by default.
  // The server correctly rejects GET on a mutation with 405 METHOD_NOT_SUPPORTED.
  // Fix: switch client to httpBatchStreamLink (always POST).
  it('is registered as a mutation in the router (not a query)', () => {
    const proc = (
      appRouter._def.procedures as unknown as Record<string, { _def: { type: string } }>
    )['chat.ask']
    expect(proc).toBeDefined()
    expect(proc._def.type).toBe('mutation')
  })

  // ── Happy path ─────────────────────────────────────────────────────────────
  it('returns answer and sources for a full input', async () => {
    const result = await caller.chat.ask({
      question: 'What is the air quality in Manila today?',
      city: 'manila',
      country: 'Philippines',
    })

    expect(result.answer).toBe(STUB_ANSWER.answer)
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].label).toBe('WHO Guidelines')
  })

  it('works with question only — city and country are optional', async () => {
    const result = await caller.chat.ask({ question: 'What is PM2.5?' })

    expect(result.answer).toBeDefined()
    expect(Array.isArray(result.sources)).toBe(true)
  })

  // ── RAGService delegation ──────────────────────────────────────────────────
  it('passes question and city through to RAGService.ask', async () => {
    await caller.chat.ask({
      question: 'How bad is air pollution?',
      city: 'bangkok',
      country: 'Thailand',
    })

    expect(mockAsk).toHaveBeenCalledOnce()
    expect(mockAsk).toHaveBeenCalledWith('How bad is air pollution?', 'bangkok')
  })

  it('passes undefined for city when omitted', async () => {
    await caller.chat.ask({ question: 'What is AQI?' })

    expect(mockAsk).toHaveBeenCalledWith('What is AQI?', undefined)
  })

  // ── Input validation ───────────────────────────────────────────────────────
  it('rejects an empty question', async () => {
    await expect(caller.chat.ask({ question: '' })).rejects.toThrow()
  })

  it('rejects a question longer than 500 characters', async () => {
    await expect(caller.chat.ask({ question: 'x'.repeat(501) })).rejects.toThrow()
  })

  it('accepts a question at exactly 500 characters', async () => {
    await expect(caller.chat.ask({ question: 'x'.repeat(500) })).resolves.toBeDefined()
  })

  // ── Error propagation ──────────────────────────────────────────────────────
  it('propagates errors thrown by RAGService', async () => {
    mockAsk.mockRejectedValueOnce(new Error('Vertex AI unavailable'))

    await expect(caller.chat.ask({ question: 'What is PM2.5?' })).rejects.toThrow(
      'Vertex AI unavailable'
    )
  })
})
