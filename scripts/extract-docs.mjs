#!/usr/bin/env node

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const bucket = process.env.GCS_BUCKET
if (!bucket) {
  console.error('Missing GCS_BUCKET')
  process.exit(1)
}

const inputDir = process.env.INPUT_DIR ?? 'tmp/docs'
const outputDir = process.env.OUTPUT_DIR ?? 'tmp/docs/clean'

function cleanText(raw) {
  return (
    raw
      // normalize line endings
      .replace(/\r\n/g, '\n')
      // remove lone page numbers (a line that is just a number, optionally surrounded by whitespace)
      .replace(/^\s*\d+\s*$/gm, '')
      // collapse 3+ consecutive blank lines into 2
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
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

async function extractPdf(filePath) {
  const buffer = readFileSync(filePath)
  const data = await pdfParse(buffer)
  return data.text
}

async function run() {
  mkdirSync(outputDir, { recursive: true })

  const files = readdirSync(inputDir).filter((f) => extname(f).toLowerCase() === '.pdf')

  if (files.length === 0) {
    console.warn(`No PDF files found in ${inputDir}`)
    process.exit(0)
  }

  console.log(`Found ${files.length} PDF(s) in ${inputDir}`)

  for (const file of files) {
    const filePath = join(inputDir, file)
    const slug = basename(file, extname(file))
    const outPath = join(outputDir, `${slug}.txt`)

    console.log(`\nExtracting: ${file}`)

    try {
      const rawText = await extractPdf(filePath)
      const cleanedText = cleanText(rawText)
      writeFileSync(outPath, cleanedText, 'utf8')
      console.log(`  Saved ${cleanedText.length} chars -> ${outPath}`)

      const gcsDestination = `gs://${bucket}/docs/clean/${slug}.txt`
      uploadToGcs(outPath, gcsDestination)
      console.log(`  Uploaded -> ${gcsDestination}`)
    } catch (err) {
      console.error(`  Failed to process ${file}: ${err.message}`)
    }
  }

  console.log('\nExtraction complete')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
