import { z } from 'zod'

const toNumber = (fallback: number) =>
  z.preprocess(value => {
    if (typeof value !== 'string' || value.trim() === '') return fallback
    const parsed = Number(value)
    return Number.isNaN(parsed) ? fallback : parsed
  }, z.number())

const envSchema = z.object({
  GOOGLE_CLOUD_PROJECT: z.string().default('aircare-sea'),
  DEFAULT_LOCATION: z.string().default('asia-southeast1'),
  VERTEX_LOCATION: z.string().default('us-central1'),
  VERTEX_EMBEDDING_MODEL: z.string().default('text-embedding-004'),
  VERTEX_GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  BQ_DATASET: z.string().default('aircare_sea'),
  BQ_GLOBAL_AQI_TABLE: z.string().default('global_aqi_reference'),
  BQ_ADPC_REGIONS_TABLE: z.string().default('adpc_pm25_regions'),
  RAG_COLLECTION: z.string().default('rag_chunks'),
  RAG_TOP_K: toNumber(5),
  RAG_DISTANCE_THRESHOLD: toNumber(0.4),
})

const parsed = envSchema.parse(process.env)

export const env = {
  projectId: parsed.GOOGLE_CLOUD_PROJECT,
  location: parsed.DEFAULT_LOCATION,
  vertex: {
    embeddingModel: parsed.VERTEX_EMBEDDING_MODEL,
    geminiModel: parsed.VERTEX_GEMINI_MODEL,
    location: parsed.VERTEX_LOCATION,
  },
  bigquery: {
    dataset: parsed.BQ_DATASET,
    globalAqiTable: parsed.BQ_GLOBAL_AQI_TABLE,
    adpcRegionsTable: parsed.BQ_ADPC_REGIONS_TABLE,
  },
  rag: {
    collection: parsed.RAG_COLLECTION,
    topK: parsed.RAG_TOP_K,
    distanceThreshold: parsed.RAG_DISTANCE_THRESHOLD,
  },
} as const
