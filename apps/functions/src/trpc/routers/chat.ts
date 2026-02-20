import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc.js'
import { RAGService } from '../../services/ragService.js'
import { SearchService } from '../../services/searchService.js'

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? 'aircare-sea'

export const chatRouter = router({
  currentAqi: protectedProcedure
    .input(
      z.object({
        city: z.string().min(1).max(100).default('Manila'),
      })
    )
    .query(async ({ input }) => {
      const svc = new SearchService(PROJECT_ID)
      const result = await svc.lookupCity(input.city)

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No air quality data found for ${input.city}.`,
        })
      }

      return {
        city: result.name,
        aqi: result.pollution.aqi,
        quality: result.pollution.category,
        updatedAt: result.pollution.updatedAt,
      }
    }),
  ask: protectedProcedure
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
