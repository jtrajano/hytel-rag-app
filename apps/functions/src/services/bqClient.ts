import { BigQuery } from '@google-cloud/bigquery'
import { env } from '../config/env.js'

export interface GlobalAqiReading {
  city: string
  country: string
  timestamp: string
  pm25: number | null
  pm10: number | null
  no2: number | null
  so2: number | null
  co: number | null
  ozone: number | null
  aerosolOpticalDepth: number | null
  aqiClass: string | null
}

export interface AdpcForecast {
  country: string
  initDate: string
  avgPm25: number | null
  maxPm25: number | null
  nearestForecast: string | null
}

export class BQClient {
  projectId: string
  bq: BigQuery
  dataset: string
  globalAqiTable: string
  adpcRegionsTable: string

  constructor(projectId: string) {
    this.projectId = projectId
    this.bq = new BigQuery({ projectId })
    this.dataset = env.bigquery.dataset
    this.globalAqiTable = env.bigquery.globalAqiTable
    this.adpcRegionsTable = env.bigquery.adpcRegionsTable
  }

  async getGlobalAqiForCity(city: string): Promise<GlobalAqiReading | null> {
    const query = `
        SELECT
          city, country,
          CAST(timestamp AS STRING) AS timestamp,
          pm25, pm10, no2, so2, co, ozone,
          aerosol_optical_depth,
          aqi_class
        FROM \`${this.projectId}.${this.dataset}.${this.globalAqiTable}\`
        WHERE LOWER(TRIM(city)) = LOWER(TRIM(@city))
        ORDER BY timestamp DESC
        LIMIT 1
      `
    try {
      const [rows] = await this.bq.query({ query, params: { city } })
      if (!rows.length) return null
      const r = rows[0] as {
        city: string
        country: string
        timestamp: string
        pm25: number
        pm10: number
        no2: number
        so2: number
        co: number
        ozone: number
        aerosol_optical_depth: number
        aqi_class: string
      }
      return {
        city: r.city,
        country: r.country,
        timestamp: r.timestamp,
        pm25: r.pm25 ?? null,
        pm10: r.pm10 ?? null,
        no2: r.no2 ?? null,
        so2: r.so2 ?? null,
        co: r.co ?? null,
        ozone: r.ozone ?? null,
        aerosolOpticalDepth: r.aerosol_optical_depth ?? null,
        aqiClass: r.aqi_class ?? null,
      }
    } catch {
      return null
    }
  }

  // ── Step 3.5: Fetch aggregated country data from global_aqi_reference ─────────

  async getCountryAggregatedData(country: string): Promise<GlobalAqiReading | null> {
    const query = `
        SELECT
          country,
          CAST(MAX(timestamp) AS STRING) AS timestamp,
          AVG(pm25) as pm25,
          AVG(pm10) as pm10,
          AVG(no2) as no2,
          AVG(so2) as so2,
          AVG(co) as co,
          AVG(ozone) as ozone,
          AVG(aerosol_optical_depth) as aerosol_optical_depth
        FROM \`${this.projectId}.${this.dataset}.${this.globalAqiTable}\`
        WHERE LOWER(TRIM(country)) LIKE CONCAT('%', LOWER(TRIM(@country)), '%')
        GROUP BY country
        ORDER BY MAX(timestamp) DESC
        LIMIT 1
      `
    try {
      const [rows] = await this.bq.query({ query, params: { country } })
      if (!rows.length) return null
      const r = rows[0] as {
        country: string
        timestamp: string
        pm25: number
        pm10: number
        no2: number
        so2: number
        co: number
        ozone: number
        aerosol_optical_depth: number
      }
      return {
        city: `${r.country} (National Avg)`, // Placeholder for prompt context
        country: r.country,
        timestamp: r.timestamp,
        pm25: r.pm25 ?? null,
        pm10: r.pm10 ?? null,
        no2: r.no2 ?? null,
        so2: r.so2 ?? null,
        co: r.co ?? null,
        ozone: r.ozone ?? null,
        aerosolOpticalDepth: r.aerosol_optical_depth ?? null,
        aqiClass: null, // Aggregates don't have a single class
      }
    } catch {
      return null
    }
  }

  // ── Step 4: Fetch ADPC satellite forecast from BigQuery ───────────────────────

  async getAdpcForecastForCountry(country: string): Promise<AdpcForecast | null> {
    const query = `
        SELECT
          country,
          CAST(init_date AS STRING)              AS init_date,
          ROUND(AVG(pm25_avg), 2)               AS avg_pm25,
          ROUND(MAX(pm25_max), 2)               AS max_pm25,
          CAST(MIN(forecast_datetime) AS STRING) AS nearest_forecast
        FROM \`${this.projectId}.${this.dataset}.${this.adpcRegionsTable}\`
        WHERE LOWER(TRIM(country)) = LOWER(TRIM(@country))
          AND init_date = (
            SELECT MAX(init_date)
            FROM \`${this.projectId}.${this.dataset}.${this.adpcRegionsTable}\`
            WHERE LOWER(TRIM(country)) = LOWER(TRIM(@country))
          )
        GROUP BY country, init_date
        LIMIT 1
      `
    try {
      const [rows] = await this.bq.query({ query, params: { country } })
      if (!rows.length) return null
      const r = rows[0] as {
        country: string
        init_date: string
        avg_pm25: number
        max_pm25: number
        nearest_forecast: string
      }
      return {
        country: r.country,
        initDate: r.init_date,
        avgPm25: r.avg_pm25 ?? null,
        maxPm25: r.max_pm25 ?? null,
        nearestForecast: r.nearest_forecast ?? null,
      }
    } catch {
      return null
    }
  }
}
