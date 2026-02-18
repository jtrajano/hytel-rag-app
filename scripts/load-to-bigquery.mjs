#!/usr/bin/env node

/**
 * Load OpenAQ historical data from GCS into BigQuery using upsert (MERGE).
 *
 * Reads all JSON files under gs://{GCS_BUCKET}/raw/openaq/history/
 * Pivots one-row-per-parameter into one-row-per-location/timestamp
 * Computes AQI from PM2.5 using EPA breakpoints
 * Upserts into BigQuery via staging table + MERGE on measurement_id
 *
 * Usage:
 *   GCS_BUCKET=aircare-sea-data BQ_PROJECT=aircare-sea node scripts/load-to-bigquery.mjs
 *
 * Env vars:
 *   GCS_BUCKET      - GCS bucket name (required unless LOCAL_DATA_DIR is set)
 *   LOCAL_DATA_DIR  - Read JSON files from a local directory instead of GCS
 *                     e.g. LOCAL_DATA_DIR=tmp/openaq (skips gsutil entirely)
 *   BQ_PROJECT      - GCP project ID (default: aircare-sea)
 *   BQ_DATASET      - BigQuery dataset (default: aircare_sea)
 *   BQ_TABLE        - BigQuery table   (default: aqi_measurements)
 *
 * Requirements: gcloud SDK (gsutil + bq CLI) authenticated
 */

import { createHash } from 'node:crypto'
import { writeFileSync, readFileSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LOCAL_DIR = process.env.LOCAL_DATA_DIR ?? null
const BUCKET = process.env.GCS_BUCKET ?? null

if (!LOCAL_DIR && !BUCKET) {
  console.error('Set either GCS_BUCKET or LOCAL_DATA_DIR')
  process.exit(1)
}

const PROJECT = process.env.BQ_PROJECT ?? 'aircare-sea'
const DATASET = process.env.BQ_DATASET ?? 'aircare_sea'
const TABLE = process.env.BQ_TABLE ?? 'aqi_measurements'
const STAGING = `${TABLE}_staging`
const GCS_PREFIX = 'raw/openaq/history/'
const PARAMETERS = ['pm25', 'pm10', 'no2', 'o3', 'co']

// ---------------------------------------------------------------------------
// AQI computation (EPA PM2.5 breakpoints)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Data transformation
// ---------------------------------------------------------------------------

function groupMeasurementId(city, latitude, longitude, timestamp) {
  return createHash('sha256')
    .update(`${city}|${latitude}|${longitude}|${timestamp ?? ''}`)
    .digest('hex')
    .slice(0, 16)
}

/**
 * Pivot raw rows (one per parameter) into one row per location+timestamp.
 * Skips rows missing required fields (city, country, lat, lon, timestamp).
 */
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
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

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

/**
 * Download a GCS file to a local temp path and read it.
 * Uses `gsutil cp` instead of `gsutil cat` to avoid spawnSync stdout
 * buffer overflow on large files.
 */
function downloadGcsFile(gcsUri) {
  const tmpPath = join(tmpdir(), `gcs-download-${Date.now()}.json`)
  try {
    run('gsutil', ['cp', gcsUri, tmpPath])
    return readFileSync(tmpPath, 'utf8')
  } finally {
    try { unlinkSync(tmpPath) } catch { /* already gone */ }
  }
}

/** Recursively list all .json files under a local directory. */
function listLocalJsonFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => join(e.path, e.name))
}

// ---------------------------------------------------------------------------
// BigQuery helpers
// ---------------------------------------------------------------------------

function bqLoad(project, dataset, table, ndjsonFile) {
  run('bq', [
    'load',
    `--project_id=${project}`,
    '--source_format=NEWLINE_DELIMITED_JSON',
    '--autodetect',
    '--replace', // always replace staging — it's a scratch table
    `${project}:${dataset}.${table}`,
    ndjsonFile,
  ])
}

function bqMerge(project, dataset, target, staging) {
  // MERGE upserts on measurement_id.
  // UPDATE: refreshes all pollutant values (handles corrected sensor data).
  // INSERT: adds genuinely new measurements.
  // ingestion_time is only set on INSERT (first seen), never overwritten.
  const sql = `
MERGE \`${project}.${dataset}.${target}\` T
USING \`${project}.${dataset}.${staging}\` S
ON T.measurement_id = S.measurement_id
WHEN MATCHED THEN UPDATE SET
  city           = S.city,
  country        = S.country,
  latitude       = S.latitude,
  longitude      = S.longitude,
  timestamp      = S.timestamp,
  pm25           = S.pm25,
  pm10           = S.pm10,
  no2            = S.no2,
  o3             = S.o3,
  co             = S.co,
  aqi_value      = S.aqi_value,
  aqi_category   = S.aqi_category,
  source         = S.source
WHEN NOT MATCHED THEN INSERT
  (measurement_id, city, country, latitude, longitude, timestamp,
   pm25, pm10, no2, o3, co, aqi_value, aqi_category, source, ingestion_time)
VALUES
  (S.measurement_id, S.city, S.country, S.latitude, S.longitude, S.timestamp,
   S.pm25, S.pm10, S.no2, S.o3, S.co, S.aqi_value, S.aqi_category, S.source,
   CURRENT_TIMESTAMP())
`.trim()

  run('bq', ['query', `--project_id=${project}`, '--use_legacy_sql=false', '--nouse_cache', sql])
}

function bqDropTable(project, dataset, table) {
  try {
    run('bq', ['rm', '-f', '-t', `${project}:${dataset}.${table}`])
  } catch {
    // Non-fatal — staging table may already be gone
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const sourceLabel = LOCAL_DIR ? `local:${LOCAL_DIR}` : `gs://${BUCKET}/${GCS_PREFIX}`
  console.log(`Source  : ${sourceLabel}`)
  console.log(`Target  : ${PROJECT}.${DATASET}.${TABLE}`)
  console.log(`Staging : ${PROJECT}.${DATASET}.${STAGING}`)
  console.log(`Mode    : UPSERT (MERGE on measurement_id)`)
  console.log()

  // Collect file paths and a reader function based on source
  let files
  let readFile
  if (LOCAL_DIR) {
    files = listLocalJsonFiles(LOCAL_DIR)
    readFile = (path) => readFileSync(path, 'utf8')
  } else {
    files = listGcsJsonFiles(BUCKET, GCS_PREFIX)
    readFile = downloadGcsFile
  }

  console.log(`Found ${files.length} JSON file(s)`)

  if (files.length === 0) {
    console.log('No files to process. Exiting.')
    return
  }

  const allRows = []
  for (const file of files) {
    console.log(`  Processing: ${file}`)
    const content = readFile(file)
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

  const tmpFile = join(tmpdir(), `bq-staging-${Date.now()}.ndjson`)
  const ndjson = allRows.map((row) => JSON.stringify(row)).join('\n')
  writeFileSync(tmpFile, ndjson, 'utf8')

  try {
    // Step 1: load into scratch staging table
    console.log(`\n[1/3] Loading ${allRows.length} rows into staging table...`)
    bqLoad(PROJECT, DATASET, STAGING, tmpFile)
    console.log('      Done.')

    // Step 2: MERGE staging -> target
    console.log(`[2/3] Running MERGE into ${TABLE}...`)
    bqMerge(PROJECT, DATASET, TABLE, STAGING)
    console.log('      Done.')

    console.log(`\nSuccessfully upserted ${allRows.length} rows into ${PROJECT}.${DATASET}.${TABLE}`)
  } finally {
    // Step 3: always clean up staging + temp file
    console.log(`[3/3] Cleaning up staging table and temp file...`)
    bqDropTable(PROJECT, DATASET, STAGING)
    unlinkSync(tmpFile)
    console.log('      Done.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
