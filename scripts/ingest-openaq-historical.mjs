#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const DEFAULT_CITIES = ['Manila', 'Jakarta', 'Bangkok', 'Ho Chi Minh City', 'Kuala Lumpur']
const TARGET_PARAMETERS = new Set(['pm25', 'pm10', 'no2', 'o3', 'co'])
const CITY_COORDINATES = {
  Manila: { latitude: 14.5995, longitude: 120.9842 },
  Jakarta: { latitude: -6.2088, longitude: 106.8456 },
  Bangkok: { latitude: 13.7563, longitude: 100.5018 },
  'Ho Chi Minh City': { latitude: 10.8231, longitude: 106.6297 },
  'Kuala Lumpur': { latitude: 3.139, longitude: 101.6869 },
}

const apiKey = process.env.OPENAQ_API_KEY
if (!apiKey) {
  console.error('Missing OPENAQ_API_KEY')
  process.exit(1)
}

const bucket = process.env.GCS_BUCKET
if (!bucket) {
  console.error('Missing GCS_BUCKET')
  process.exit(1)
}

const daysBack = Number(process.env.DAYS_BACK ?? '90')
const outputDir = process.env.OUTPUT_DIR ?? 'tmp/openaq'
const debug = process.env.DEBUG === '1'
const cities = (process.env.CITIES ?? DEFAULT_CITIES.join(','))
  .split(',')
  .map((city) => city.trim())
  .filter(Boolean)

const now = new Date()
const from = new Date(now)
from.setUTCDate(from.getUTCDate() - daysBack)

const dateTo = now.toISOString()
const dateFrom = from.toISOString()
const runStamp = now.toISOString().replaceAll(':', '-')

const sanitizeName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const csvEscape = (value) => {
  if (value === undefined || value === null) return ''
  const text = String(value)
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

async function request(path, params = {}) {
  const url = new URL(`https://api.openaq.org/v3${path}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value))
    }
  })

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-API-Key': apiKey,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAQ request failed (${response.status}): ${errorText}`)
  }

  return response.json()
}

async function getLocation(city) {
  const payload = await request('/locations', { city, limit: 1 })
  return payload.results?.[0] ?? null
}

async function getCandidateLocations(city) {
  const coords = CITY_COORDINATES[city]

  if (coords) {
    const byCoords = await request('/locations', {
      coordinates: `${coords.latitude},${coords.longitude}`,
      radius: 25000,
      limit: 50,
    })

    const locations = byCoords.results ?? []
    if (locations.length > 0) {
      return locations
    }
  }

  const fallback = await getLocation(city)
  return fallback ? [fallback] : []
}

async function getLocationSensors(locationId) {
  const payload = await request(`/locations/${locationId}/sensors`, { limit: 100 })
  return payload.results ?? []
}

async function getSensorMeasurements(sensorId, parameter) {
  const rows = []
  let page = 1
  let pages = 1

  while (page <= pages) {
    const payload = await request(`/sensors/${sensorId}/measurements`, {
      date_from: dateFrom,
      date_to: dateTo,
      limit: 1000,
      page,
    })

    const results = payload.results ?? []
    for (const item of results) {
      rows.push({
        sensorId,
        parameter,
        value: item.value ?? null,
        unit: item.unit ?? null,
        datetimeUtc: item.datetime?.utc ?? null,
        datetimeLocal: item.datetime?.local ?? null,
      })
    }

    pages = payload.meta?.pages ?? 1
    page += 1
  }

  return rows
}

function writeFiles(city, rows) {
  const citySlug = sanitizeName(city)
  const dir = join(outputDir, runStamp)
  mkdirSync(dir, { recursive: true })

  const jsonPath = join(dir, `${citySlug}.json`)
  const csvPath = join(dir, `${citySlug}.csv`)

  writeFileSync(jsonPath, JSON.stringify(rows, null, 2), 'utf8')

  const headers = [
    'city',
    'country',
    'locationId',
    'locationName',
    'sensorId',
    'parameter',
    'value',
    'unit',
    'datetimeUtc',
    'datetimeLocal',
    'latitude',
    'longitude',
  ]

  const csvLines = [headers.join(',')]
  for (const row of rows) {
    csvLines.push(headers.map((header) => csvEscape(row[header])).join(','))
  }
  writeFileSync(csvPath, `${csvLines.join('\n')}\n`, 'utf8')

  return { jsonPath, csvPath }
}

function uploadToGcs(localFile, destination) {
  const result = spawnSync('gsutil', ['cp', localFile, destination], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    throw new Error(`gsutil upload failed for ${localFile}`)
  }
}

async function run() {
  console.log(`OpenAQ historical ingestion started for ${cities.length} city/cities`)
  console.log(`Window: ${dateFrom} -> ${dateTo}`)

  for (const city of cities) {
    console.log(`\nCity: ${city}`)
    const candidateLocations = await getCandidateLocations(city)
    if (candidateLocations.length === 0) {
      console.warn(`No location found for city: ${city}`)
      continue
    }

    let rows = []

    for (const location of candidateLocations) {
      if (debug) {
        console.log(
          `Trying location ${location.id} (${location.name ?? 'unknown'}) in ${location.country?.code ?? 'n/a'}`
        )
      }

      const sensors = await getLocationSensors(location.id)
      const filteredSensors = sensors.filter((sensor) => TARGET_PARAMETERS.has(sensor.parameter?.name))

      if (filteredSensors.length === 0) {
        if (debug) {
          console.log(`Location ${location.id} has no target sensors`)
        }
        continue
      }

      const locationRows = []
      for (const sensor of filteredSensors) {
        const parameter = sensor.parameter?.name ?? 'unknown'
        const measurements = await getSensorMeasurements(sensor.id, parameter)
        if (debug) {
          console.log(`Sensor ${sensor.id} (${parameter}) -> ${measurements.length} row(s)`)
        }
        for (const measurement of measurements) {
          locationRows.push({
            city,
            country: location.country?.code ?? null,
            locationId: location.id,
            locationName: location.name ?? null,
            sensorId: measurement.sensorId,
            parameter: measurement.parameter,
            value: measurement.value,
            unit: measurement.unit,
            datetimeUtc: measurement.datetimeUtc,
            datetimeLocal: measurement.datetimeLocal,
            latitude: location.coordinates?.latitude ?? null,
            longitude: location.coordinates?.longitude ?? null,
          })
        }
      }

      if (locationRows.length > 0) {
        rows = locationRows
        break
      }
    }

    if (rows.length === 0) {
      console.warn(`No measurements found for city: ${city}`)
      continue
    }

    const { jsonPath, csvPath } = writeFiles(city, rows)
    console.log(`Saved ${rows.length} rows to ${jsonPath} and ${csvPath}`)

    const citySlug = sanitizeName(city)
    const gcsBase = `gs://${bucket}/raw/openaq/history/${runStamp}/${citySlug}`
    uploadToGcs(jsonPath, `${gcsBase}.json`)
    uploadToGcs(csvPath, `${gcsBase}.csv`)
    console.log(`Uploaded to ${gcsBase}.json and ${gcsBase}.csv`)
  }

  console.log('\nOpenAQ historical ingestion complete')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
