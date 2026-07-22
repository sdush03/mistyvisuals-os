/**
 * backfill_photo_dimensions.js
 *
 * Reads width + height from existing website_story_photos that have no
 * dimension data yet. Fetches each photo's mobile URL, measures it with
 * sharp, and writes back to the DB.
 *
 * Run once after the migration:
 *   node backend/scripts/backfill_photo_dimensions.js
 */

'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const { Pool } = require('pg')
const https    = require('https')
const http     = require('http')

let sharp
try {
  sharp = require('sharp')
} catch {
  console.error('sharp is not installed. Run: npm install sharp')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// Fetch a URL and return a Buffer
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    lib.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function run() {
  // Fetch all photos missing dimensions
  const { rows: photos } = await pool.query(`
    SELECT id, file_url_mobile, file_url_thumb, file_url
    FROM website_story_photos
    WHERE width IS NULL OR height IS NULL
    ORDER BY id ASC
  `)

  console.log(`Found ${photos.length} photos needing backfill.`)
  if (photos.length === 0) {
    console.log('Nothing to do.')
    await pool.end()
    return
  }

  let done = 0
  let failed = 0
  const BATCH = 10

  for (let i = 0; i < photos.length; i += BATCH) {
    const batch = photos.slice(i, i + BATCH)

    await Promise.all(batch.map(async (photo) => {
      // Prefer mobile (800px) — smaller download, same aspect ratio
      const url = photo.file_url_mobile || photo.file_url_thumb || photo.file_url
      if (!url) {
        console.warn(`  [${photo.id}] No URL — skipping`)
        failed++
        return
      }

      // Handle relative URLs (local dev)
      const fullUrl = url.startsWith('http') ? url : `http://localhost:${process.env.PORT || 3001}${url}`

      try {
        const buf = await fetchBuffer(fullUrl)
        const meta = await sharp(buf).metadata()

        // Account for EXIF rotation
        const sideways = [5, 6, 7, 8].includes(meta.orientation || 0)
        const w = sideways ? meta.height : meta.width
        const h = sideways ? meta.width  : meta.height

        await pool.query(
          `UPDATE website_story_photos SET width=$1, height=$2 WHERE id=$3`,
          [w, h, photo.id]
        )

        const orient = w > h ? 'landscape' : (h > w ? 'portrait' : 'square')
        console.log(`  [${photo.id}] ✓  ${w}×${h}  (${orient})`)
        done++
      } catch (err) {
        console.warn(`  [${photo.id}] ✗  ${err.message}`)
        failed++
      }
    }))

    // Small pause between batches to be kind to Cloudflare R2
    if (i + BATCH < photos.length) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  console.log(`\nDone: ${done} updated, ${failed} failed out of ${photos.length} total.`)
  await pool.end()
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
