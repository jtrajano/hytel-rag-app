#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cheerio = require('cheerio')
const pdfParse = require('pdf-parse')

const bucket = process.env.GCS_BUCKET
if (!bucket) {
  console.error('Missing GCS_BUCKET')
  process.exit(1)
}

const sourcesFile = process.env.SOURCES_FILE ?? 'scripts/docs-sources.json'
const outputDir = process.env.OUTPUT_DIR ?? 'tmp/docs/clean'
const stateFile = 'scripts/docs-extracted.json'

function loadState() {
  if (!existsSync(stateFile)) return { extractedIds: [], seenUrls: [] }
  return JSON.parse(readFileSync(stateFile, 'utf8'))
}

function saveState(state) {
  writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8')
}

const REMOVED_TAGS = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'iframe']
const CONTENT_SELECTORS = ['article', 'main', '.content', '#content', '.entry-content', 'body']

function cleanPdfText(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/^\s*\d+\s*$/gm, '')  // remove lone page numbers
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractText(html) {
  const $ = cheerio.load(html)

  // remove noise elements
  REMOVED_TAGS.forEach((tag) => $(tag).remove())
  $('[role="navigation"]').remove()
  $('[role="banner"]').remove()
  $('[role="complementary"]').remove()

  // try to find the main content block
  let contentEl = null
  for (const selector of CONTENT_SELECTORS) {
    if ($(selector).length) {
      contentEl = $(selector).first()
      break
    }
  }

  const rawText = contentEl ? contentEl.text() : $.root().text()

  return rawText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')           // collapse inline whitespace
    .replace(/^ +| +$/gm, '')          // trim each line
    .replace(/\n{3,}/g, '\n\n')        // collapse excessive blank lines
    .trim()
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

async function fetchSource(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'AirCare-SEA-RAG-Ingestion/1.0',
      Accept: 'text/html,application/xhtml+xml,application/pdf',
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  const isPdf =
    contentType.includes('application/pdf') ||
    contentType.includes('application/octet-stream') ||
    new URL(url).pathname.toLowerCase().endsWith('.pdf')

  if (isPdf) {
    const buffer = Buffer.from(await response.arrayBuffer())
    const data = await pdfParse(buffer)
    return { type: 'pdf', content: data.text }
  }

  return { type: 'html', content: await response.text() }
}

async function run() {
  mkdirSync(outputDir, { recursive: true })

  const state = loadState()
  const extractedIds = new Set(state.extractedIds)
  const seenUrls = new Set(state.seenUrls)

  const allSources = JSON.parse(readFileSync(sourcesFile, 'utf8'))
  const filterById = process.env.SOURCE_ID ?? null

  // deduplicate by URL and filter placeholders
  const sources = []
  for (const source of (filterById ? allSources.filter((s) => s.id === filterById) : allSources)) {
    if (!source.url || source.url === 'FILL_IN') {
      console.warn(`Skipping [${source.id}] — placeholder URL`)
      continue
    }
    if (seenUrls.has(source.url)) {
      console.warn(`Skipping [${source.id}] — duplicate URL already seen: ${source.url}`)
      continue
    }
    if (extractedIds.has(source.id)) {
      console.log(`Already extracted [${source.id}] — skipping`)
      seenUrls.add(source.url)
      continue
    }
    seenUrls.add(source.url)
    sources.push(source)
  }

  if (sources.length === 0) {
    console.log('Nothing new to fetch.')
    process.exit(0)
  }

  console.log(`\nFetching ${sources.length} new source(s)...\n`)

  for (const source of sources) {
    console.log(`[${source.id}] ${source.label}`)
    console.log(`  URL: ${source.url}`)

    try {
      const { type, content } = await fetchSource(source.url)
      console.log(`  Type: ${type}`)
      const cleanText = type === 'pdf' ? cleanPdfText(content) : extractText(content)
      const outPath = join(outputDir, `${source.id}.txt`)

      writeFileSync(outPath, cleanText, 'utf8')
      console.log(`  Saved ${cleanText.length} chars -> ${outPath}`)

      const gcsDestination = `gs://${bucket}/docs/clean/${source.id}.txt`
      uploadToGcs(outPath, gcsDestination)
      console.log(`  Uploaded -> ${gcsDestination}`)

      // mark as done and persist immediately so partial runs are saved
      extractedIds.add(source.id)
      saveState({ extractedIds: [...extractedIds], seenUrls: [...seenUrls] })
    } catch (err) {
      console.error(`  Failed: ${err.message}`)
    }

    console.log()
  }

  console.log('Fetch complete')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
