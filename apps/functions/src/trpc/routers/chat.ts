import { z } from 'zod'
import { router, publicProcedure } from '../trpc'

const PYTHON_API = process.env.PYTHON_API_URL ?? 'http://localhost:8000'

const SourceSchema = z.object({
  label: z.string(),
  url: z.string().nullable().optional(),
  chunk_index: z.number().nullable().optional(),
})

const ChatResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(SourceSchema),
})

export const chatRouter = router({
  ask: publicProcedure
    .input(
      z.object({
        question: z.string().min(1).max(1000),
        healthProfile: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      let res: Response
      try {
        res = await fetch(`${PYTHON_API}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: input.question,
            health_profile: input.healthProfile ?? null,
          }),
        })
      } catch (err) {
        throw new Error(
          'Could not reach the RAG service. Make sure the Python backend is running on port 8000.'
        )
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`RAG service error ${res.status}: ${text}`)
      }

      const json = await res.json()
      return ChatResponseSchema.parse(json)
    }),
})
