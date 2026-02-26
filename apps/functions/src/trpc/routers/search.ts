import { z } from 'zod'
import { router, protectedProcedure } from '../trpc.js'
import { SearchService } from '../../services/searchService.js'

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? 'aircare-sea'

// utilizes module level instance to avoid repeated construction overhead.
const svc = new SearchService(PROJECT_ID)

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
    .input(
      z.object({ query: z.string().min(1).max(100), skipAi: z.boolean().optional().default(false) })
    )
    .output(CitySearchResultSchema)
    .query(async ({ input }) => {
      return await svc.lookupCity(input.query, input.skipAi)
    }),

  guidelines: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        country: z.string(),
        type: z.enum(['city', 'country']),
        aqi: z.number(),
        category: AqiCategorySchema,
        pm25: z.number(),
        pm10: z.number(),
        no2: z.number(),
      })
    )
    .output(
      z.object({
        visitorGuidelines: z.array(GuidelineItemSchema),
        preventionTips: z.array(GuidelineItemSchema),
        improvementActions: z.array(GuidelineItemSchema),
      })
    )
    .mutation(async ({ input }) => {
      return await svc.generateGuidelines(
        input.name,
        input.country,
        input.type,
        input.aqi,
        input.category,
        input.pm25,
        input.pm10,
        input.no2
      )
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

      const results = await Promise.all(
        input.map(async city => {
          try {
            const res = await svc.lookupCity(city.name, true) // run with skipAi = true
            if (!res) return null

            return {
              id: city.id,
              name: city.name, // Keep requested region name
              aqi: res.pollution.aqi,
              category: res.pollution.category,
            }
          } catch (error) {
            console.error(`Failed to lookup city ${city.name} during batch map load:`, error)
            return null
          }
        })
      )

      return results.filter(res => res !== null) as z.infer<typeof RegionAQIDataSchema>[]
    }),

  reverseGeocode: protectedProcedure
    .input(z.object({ lat: z.number(), lon: z.number() }))
    .output(z.object({ city: z.string().nullable(), country: z.string().nullable() }))
    .mutation(async ({ input }) => {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${input.lat}&lon=${input.lon}&zoom=10&email=fernando.ordiales@hytel.io`
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
        if (!res.ok) return { city: null, country: null }

        const data = await res.json()
        const addr = data.address
        if (!addr) return { city: null, country: null }

        const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? null
        const country = addr.country ?? null

        return { city, country }
      } catch (error) {
        console.error('Reverse geocode error:', error)
        return { city: null, country: null }
      }
    }),
})
