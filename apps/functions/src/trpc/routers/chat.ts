import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { Firestore, Timestamp } from '@google-cloud/firestore'
import type { Content } from '@google-cloud/vertexai'
import { router, protectedProcedure, publicProcedure } from '../trpc.js'
import { RAGService } from '../../services/ragService.js'
import { SearchService } from '../../services/searchService.js'
import { OpenMeteoClient } from '../../services/openMeteoClient.js'
import { pm25ToAqi, aqiToCategory, findClosestHourlyIndex } from '../../utils/aqiUtils.js'

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? 'aircare-sea'
const db = new Firestore({ projectId: PROJECT_ID })
const rag = new RAGService(PROJECT_ID)
const searchService = new SearchService(PROJECT_ID)
const openMeteo = new OpenMeteoClient()

export const chatRouter = router({
  currentAqi: publicProcedure
    .input(
      z.object({
        city: z.string().min(1).max(100).default('Manila'),
      })
    )
    .query(async ({ input }) => {
      const result = await searchService.lookupCity(input.city, true)

      if (result) {
        return {
          city: result.name,
          aqi: result.pollution.aqi,
          quality: result.pollution.category,
          updatedAt: result.pollution.updatedAt,
        }
      }

      // uses open meteo forecast if searchservice misses data.
      const forecast = await openMeteo.get3DayForecast(input.city)
      const pm25Values = forecast?.hourly?.pm2_5 ?? []
      const firstIndex = pm25Values.findIndex(v => v !== null)

      if (forecast && firstIndex !== -1) {
        const pm25 = pm25Values[firstIndex]!
        const aqi = pm25ToAqi(pm25)
        const quality = aqiToCategory(aqi)
        const updatedAt = forecast.hourly?.time[firstIndex] ?? new Date().toISOString()

        return {
          city: input.city,
          aqi,
          quality,
          updatedAt,
        }
      }

      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `No air quality data found for ${input.city}.`,
      })
    }),

  listSessions: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.uid
    const snapshot = await db.collection('chat_sessions').where('userId', '==', userId).get()

    const sessions = snapshot.docs.map(doc => ({
      id: doc.id,
      title: doc.data().title || 'Untitled Chat',
      updatedAt: (doc.data().updatedAt as Timestamp).toDate().toISOString(),
    }))

    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }),

  getSessionMessages: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { sessionId } = input
      const userId = ctx.user.uid

      const sessDoc = await db.collection('chat_sessions').doc(sessionId).get()
      if (!sessDoc.exists || sessDoc.data()?.userId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Chat session not found' })
      }

      const snapshot = await db
        .collection('chat_sessions')
        .doc(sessionId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .get()

      return snapshot.docs.map(doc => ({
        id: doc.id,
        role: doc.data().role,
        content: doc.data().content,
        sources: doc.data().sources,
        timestamp: (doc.data().timestamp as Timestamp).toDate().toISOString(),
      }))
    }),

  ask: protectedProcedure
    .input(
      z.object({
        question: z.string().min(1).max(500),
        sessionId: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.uid
      let sessionId = input.sessionId

      if (!sessionId) {
        const sessRef = await db.collection('chat_sessions').add({
          userId,
          title: input.question.slice(0, 40) + (input.question.length > 40 ? '...' : ''),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
        sessionId = sessRef.id
      } else {
        const sessDoc = await db.collection('chat_sessions').doc(sessionId).get()
        if (!sessDoc.exists || sessDoc.data()?.userId !== userId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Chat session not found' })
        }
      }

      const msgSnapshot = await db
        .collection('chat_sessions')
        .doc(sessionId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .get()

      const history: Content[] = msgSnapshot.docs.map(doc => {
        const data = doc.data()
        return {
          role: data.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: data.content }],
        }
      })

      const data = await rag.ask(input.question, history, input.city)

      const sessionRef = db.collection('chat_sessions').doc(sessionId)
      await Promise.all([
        sessionRef.collection('messages').add({
          role: 'user',
          content: input.question,
          timestamp: Timestamp.now(),
        }),
        sessionRef.collection('messages').add({
          role: 'assistant',
          content: data.answer,
          sources: data.sources,
          timestamp: Timestamp.now(),
        }),
        sessionRef.update({ updatedAt: Timestamp.now() }),
      ])

      return {
        ...data,
        sessionId,
      }
    }),

  // provides a query mirror for clients using get requests.
  askBriefing: publicProcedure
    .input(
      z.object({
        question: z.string().min(1).max(500),
        city: z.string().optional(),
        country: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      let question = input.question

      if (input.city) {
        try {
          const forecast = await openMeteo.get3DayForecast(input.city)
          const times = forecast?.hourly?.time ?? []
          const idx = findClosestHourlyIndex(times, new Date())

          if (forecast && idx !== -1) {
            const pm25 = forecast.hourly?.pm2_5?.[idx] ?? null
            const pm10 = forecast.hourly?.pm10?.[idx] ?? null
            const no2 = forecast.hourly?.nitrogen_dioxide?.[idx] ?? null
            const o3 = forecast.hourly?.ozone?.[idx] ?? null
            const co = forecast.hourly?.carbon_monoxide?.[idx] ?? null
            const sampleTime = times[idx]
            const aqi = pm25 != null ? pm25ToAqi(pm25) : null
            const category = aqi != null ? aqiToCategory(aqi) : null

            question = `${question}

Open-Meteo nearest hourly air-quality sample for ${input.city}:
- Time (closest to now): ${sampleTime}
- PM2.5: ${pm25 ?? 'n/a'} µg/m³
- PM10: ${pm10 ?? 'n/a'} µg/m³
- NO2: ${no2 ?? 'n/a'} µg/m³
- O3: ${o3 ?? 'n/a'} µg/m³
- CO: ${co ?? 'n/a'} µg/m³
- Estimated AQI from PM2.5: ${aqi ?? 'n/a'}${category ? ` (${category})` : ''}`
          }
        } catch {
          // ignore parsing error
        }
      }

      return await rag.ask(question, [], input.city)
    }),
})
