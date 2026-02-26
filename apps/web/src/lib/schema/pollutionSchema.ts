import { z } from 'zod'

export const PollutionDataSchema = z.object({
  aqi: z.number().int().nonnegative(),
  category: z.enum([
    'Good',
    'Moderate',
    'Unhealthy for Sensitive Groups',
    'Unhealthy',
    'Very Unhealthy',
    'Hazardous',
  ]),
  pm25: z.number().nonnegative(),
  pm10: z.number().nonnegative(),
  o3: z.number().nonnegative(),
  no2: z.number().nonnegative(),
  updatedAt: z.string(),
})

export const PlaceSearchResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string(),
  flagEmoji: z.string(),
  pollution: PollutionDataSchema,
  visitorGuidelines: z.array(z.object({ id: z.string(), text: z.string() })),
  preventionTips: z.array(z.object({ id: z.string(), text: z.string() })),
  improvementActions: z.array(z.object({ id: z.string(), text: z.string() })),
})
