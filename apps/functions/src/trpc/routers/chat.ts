import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { RAGService } from '../../services/ragService'

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? 'aircare-sea'

export const chatRouter = router({
  ask: publicProcedure
    .input(
      z.object({
        question: z.string().min(1).max(500),
        city: z.string().optional(),
        country: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const rag = new RAGService(PROJECT_ID)
      return await rag.ask(input.question, input.city, input.country)
    }),
})
