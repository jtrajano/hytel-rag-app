import { z } from 'zod'
import { router, protectedProcedure } from '../trpc.js'
import { SearchService } from '../../services/searchService.js'
import { OpenMeteoClient } from '../../services/openMeteoClient.js'
import { pm25ToAqi, aqiToCategory } from '../../utils/aqiUtils.js'

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? 'aircare-sea'

const AqiCategorySchema = z.enum([
  'Good',
  'Moderate',
  'Unhealthy for Sensitive Groups',
  'Unhealthy',
  'Very Unhealthy',
  'Hazardous',
])

const GuidelineItemSchema = z.object({
  id: z.string(),
  text: z.string(),
})

const RegionAQIDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  aqi: z.number(),
  category: AqiCategorySchema,
})

const CitySearchResultSchema = z
  .object({
    type: z.enum(['city', 'country']),
    id: z.string(),
    name: z.string(),
    country: z.string(),
    flagEmoji: z.string(),
    pollution: z.object({
      aqi: z.number(),
      category: AqiCategorySchema,
      pm25: z.number(),
      pm10: z.number(),
      o3: z.number(),
      no2: z.number(),
      updatedAt: z.string(),
    }),
    visitorGuidelines: z.array(GuidelineItemSchema),
    preventionTips: z.array(GuidelineItemSchema),
    improvementActions: z.array(GuidelineItemSchema),
  })
  .nullable()

export const searchRouter = router({
  byCity: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .output(CitySearchResultSchema)
    .query(async ({ input }) => {
      const svc = new SearchService(PROJECT_ID)
      return await svc.lookupCity(input.query)
    }),

  batchCities: protectedProcedure
    .input(
      z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          latitude: z.number(),
          longitude: z.number(),
        })
      )
    )
    .output(z.array(RegionAQIDataSchema))
    .query(async ({ input }) => {
      if (input.length === 0) return []
      const client = new OpenMeteoClient()
      const results = await client.getAirQualityBatch(input)

      return results.map((res, i) => {
        const pm25Values = res.hourly?.pm2_5 ?? []
        const currentPm25 = pm25Values.find(v => v !== null) ?? 0
        const aqi = pm25ToAqi(currentPm25)
        const category = aqiToCategory(aqi)

        return {
          id: input[i].id,
          name: input[i].name,
          aqi,
          category,
        }
      })
    }),
})
