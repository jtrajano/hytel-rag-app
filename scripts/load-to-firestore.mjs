#!/usr/bin/env node

/**
 * Load OpenAQ historical data from GCS/local JSON files into Firestore.
 *
 * Reads all JSON files under gs://{GCS_BUCKET}/raw/openaq/history/
 * Pivots one-row-per-parameter into one-row-per-location/timestamp
 * Computes AQI from PM2.5 using EPA breakpoints
 * Upserts into Firestore by deterministic document id: measurement_id
 *
 * Usage:
 *   GCS_BUCKET=aircare-sea-data FIRESTORE_PROJECT=aircare-sea node scripts/load-to-firestore.mjs
 *   LOCAL_DATA_DIR=tmp/openaq FIRESTORE_PROJECT=aircare-sea node scripts/load-to-firestore.mjs
 *
 * Env vars:
 *   GCS_BUCKET             - GCS bucket name (required unless LOCAL_DATA_DIR is set)
 *   LOCAL_DATA_DIR         - Local directory of JSON files (skips gsutil)
 *   FIRESTORE_PROJECT      - GCP project ID (default: aircare-sea)
 *   FIRESTORE_COLLECTION   - Firestore collection name (default: aqi_measurements)
 *
 * Requirements:
 *   - gcloud SDK (gsutil) authenticated when reading from GCS
 *   - Node package @google-cloud/firestore available
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const LOCAL_DIR = process.env.LOCAL_DATA_DIR ?? null
const BUCKET = process.env.GCS_BUCKET ?? null

if (!LOCAL_DIR && !BUCKET) {
  console.error('Set either GCS_BUCKET or LOCAL_DATA_DIR')
  process.exit(1)
}

const PROJECT = process.env.FIRESTORE_PROJECT ?? 'aircare-sea'
const COLLECTION = process.env.FIRESTORE_COLLECTION ?? 'aqi_measurements'
const GCS_PREFIX = 'raw/openaq/history/'
const PARAMETERS = ['pm25', 'pm10', 'no2', 'o3', 'co']

const PM25_BREAKPOINTS = [
  { cLo: 0.0, cHi: 12.0, iLo: 0, iHi: 50, category: 'Good' },
  { cLo: 12.1, cHi: 35.4, iLo: 51, iHi: 100, category: 'Moderate' },
  { cLo: 35.5, cHi: 55.4, iLo: 101, iHi: 150, category: 'Unhealthy for Sensitive Groups' },
  { cLo: 55.5, cHi: 150.4, iLo: 151, iHi: 200, category: 'Unhealthy' },
  { cLo: 150.5, cHi: 250.4, iLo: 201, iHi: 300, category: 'Very Unhealthy' },
  { cLo: 250.5, cHi: 500.4, iLo: 301, iHi: 500, category: 'Hazardous' },
]

function computeAqi(pm25) {
  if (pm25 === null || pm25 === undefined) return { aqiValue: null, aqiCategory: null }
  for (const { cLo, cHi, iLo, iHi, category } of PM25_BREAKPOINTS) {
    if (pm25 >= cLo && pm25 <= cHi) {
      const aqi = Math.round(((iHi - iLo) / (cHi - cLo)) * (pm25 - cLo) + iLo)
      return { aqiValue: aqi, aqiCategory: category }
    }
  }
  if (pm25 > 500.4) return { aqiValue: 500, aqiCategory: 'Hazardous' }
  return { aqiValue: null, aqiCategory: null }
}

function groupMeasurementId(city, latitude, longitude, timestamp) {
  return createHash('sha256')
    .update(`${city}|${latitude}|${longitude}|${timestamp ?? ''}`)
    .digest('hex')
    .slice(0, 16)
}

function pivotRows(rawRows) {
  const groups = new Map()

  for (const row of rawRows) {
    if (!row.city || !row.country || row.latitude == null || row.longitude == null || !row.datetimeUtc) {
      continue
    }

    const key = `${row.city}|${row.latitude}|${row.longitude}|${row.datetimeUtc}`
    if (!groups.has(key)) {
      groups.set(key, {
        city: row.city,
        country: row.country,
        latitude: row.latitude,
        longitude: row.longitude,
        timestamp: row.datetimeUtc,
        pm25: null,
        pm10: null,
        no2: null,
        o3: null,
        co: null,
      })
    }

    const group = groups.get(key)
    if (PARAMETERS.includes(row.parameter)) {
      group[row.parameter] = row.value ?? null
    }
  }

  const result = []
  for (const group of groups.values()) {
    const { aqiValue, aqiCategory } = computeAqi(group.pm25)
    result.push({
      measurement_id: groupMeasurementId(group.city, group.latitude, group.longitude, group.timestamp),
      city: group.city,
      country: group.country,
      latitude: group.latitude,
      longitude: group.longitude,
      timestamp: group.timestamp,
      pm25: group.pm25,
      pm10: group.pm10,
      no2: group.no2,
      o3: group.o3,
      co: group.co,
      aqi_value: aqiValue,
      aqi_category: aqiCategory,
      source: 'openaq',
      ingestion_time: new Date().toISOString(),
    })
  }

  return result
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    ...opts,
  })

  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim() ?? ''
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}\n${stderr}`)
  }

  return result.stdout?.toString() ?? ''
}

function listGcsJsonFiles(bucket, prefix) {
  let output
  try {
    output = run('gsutil', ['ls', '-r', `gs://${bucket}/${prefix}`])
  } catch {
    return []
  }
  return output
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.json'))
}

function downloadGcsFile(gcsUri) {
  const tmpPath = join(tmpdir(), `gcs-download-${Date.now()}.json`)
  try {
    run('gsutil', ['cp', gcsUri, tmpPath])
    return readFileSync(tmpPath, 'utf8')
  } finally {
    try {
      unlinkSync(tmpPath)
    } catch {
      // Temp cleanup is best-effort; ignore failures.
    }
  }
}

function listLocalJsonFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(entry.path, entry.name))
}

async function upsertToFirestore(project, collectionName, rows) {
  let FirestoreCtor
  try {
    ;({ Firestore: FirestoreCtor } = await import('@google-cloud/firestore'))
  } catch {
    throw new Error(
      'Missing dependency: @google-cloud/firestore. Install with `pnpm add -w @google-cloud/firestore`.',
    )
  }

  const db = new FirestoreCtor({ projectId: project })
  let batch = db.batch()
  let pending = 0
  let written = 0

  for (const row of rows) {
    const docRef = db.collection(collectionName).doc(row.measurement_id)
    batch.set(docRef, row, { merge: true })
    pending += 1

    if (pending === 500) {
      await batch.commit()
      written += pending
      pending = 0
      batch = db.batch()
      console.log(`  committed ${written}/${rows.length}`)
    }
  }

  if (pending > 0) {
    await batch.commit()
    written += pending
  }

  return written
}

async function main() {
  const sourceLabel = LOCAL_DIR ? `local:${LOCAL_DIR}` : `gs://${BUCKET}/${GCS_PREFIX}`
  console.log(`Source      : ${sourceLabel}`)
  console.log(`Target      : Firestore ${PROJECT}/${COLLECTION}`)
  console.log(`Mode        : UPSERT (doc id = measurement_id)`)
  console.log()

  let files
  let readSourceFile
  if (LOCAL_DIR) {
    files = listLocalJsonFiles(LOCAL_DIR)
    readSourceFile = (path) => readFileSync(path, 'utf8')
  } else {
    files = listGcsJsonFiles(BUCKET, GCS_PREFIX)
    readSourceFile = downloadGcsFile
  }

  console.log(`Found ${files.length} JSON file(s)`)
  if (files.length === 0) {
    console.log('No files to process. Exiting.')
    return
  }

  const allRows = []
  for (const file of files) {
    console.log(`  Processing: ${file}`)
    const content = readSourceFile(file)
    const rawRows = JSON.parse(content)
    const pivoted = pivotRows(rawRows)
    allRows.push(...pivoted)
    console.log(`    ${rawRows.length} raw -> ${pivoted.length} pivoted rows`)
  }

  console.log(`\nTotal rows to upsert: ${allRows.length}`)
  if (allRows.length === 0) {
    console.log('No rows after transformation. Exiting.')
    return
  }

  console.log('\nUpserting to Firestore...')
  const written = await upsertToFirestore(PROJECT, COLLECTION, allRows)
  console.log(`Successfully upserted ${written} rows into Firestore ${PROJECT}/${COLLECTION}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
