/**
 * Misty Visuals Public Website Routes
 * All website CMS + public API endpoints
 */
const path = require('path')
const fs   = require('fs')
const { pipeline } = require('stream/promises')
const { processStoryPhoto, processHeroImage, processFilmThumbnail, WEBSITE_MEDIA_DIR } = require('../utils/website-images')
const { transcodeFilmAsync, optimizeBackgroundVideo, isFfmpegAvailable } = require('../utils/website-hls')

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }) }
function slugify(str) {
  return String(str).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

module.exports = async function websiteRoutes(fastify, opts) {
  const { pool, requireAdmin, crypto } = opts

  /* ─── PUBLIC PATHS (add to server.js allowlist) ─── */

  // GET /api/website/home — all homepage data in one request
  fastify.get('/api/website/home', async (req, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    reply.header('Pragma', 'no-cache')
    reply.header('Expires', '0')
    const [heroRes, storiesRes, filmsRes, testimonialsRes, sectionsRes] = await Promise.all([
      pool.query(`SELECT * FROM website_hero WHERE is_active = true ORDER BY id DESC LIMIT 1`),
      pool.query(`SELECT id,slug,title,subtitle,location,date,category,cover_image_url,cover_image_mobile_url,cover_blur_data_url,display_order FROM website_stories WHERE is_published=true AND is_featured=true ORDER BY display_order ASC, id DESC LIMIT 5`),
      pool.query(`SELECT id,title,subtitle,location,year,thumbnail_url,thumbnail_blur,hls_url,transcode_status,display_order FROM website_films WHERE is_published=true AND is_featured=true ORDER BY display_order ASC, id DESC LIMIT 6`),
      pool.query(`SELECT id,quote,client_name,location,year FROM website_testimonials WHERE is_active=true ORDER BY display_order ASC, id ASC`),
      pool.query(`SELECT key,label,is_visible,display_order,content FROM website_sections ORDER BY display_order ASC`),
    ])
    reply.send({
      hero: heroRes.rows[0] || null,
      stories: storiesRes.rows,
      films: filmsRes.rows,
      testimonials: testimonialsRes.rows,
      sections: sectionsRes.rows,
    })
  })

  // GET /api/website/stories — all published stories
  fastify.get('/api/website/stories', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id,slug,title,subtitle,location,date,category,cover_image_url,cover_image_mobile_url,cover_blur_data_url,is_featured,display_order FROM website_stories WHERE is_published=true ORDER BY is_featured DESC, display_order ASC, id DESC`
    )
    reply.send(rows)
  })

  // GET /api/website/stories/:slug — single story with photos
  fastify.get('/api/website/stories/:slug', async (req, reply) => {
    const { slug } = req.params
    const { rows: [story] } = await pool.query(
      `SELECT * FROM website_stories WHERE slug=$1 AND is_published=true`, [slug]
    )
    if (!story) return reply.code(404).send({ error: 'Story not found' })
    const { rows: photos } = await pool.query(
      `SELECT id,file_url,file_url_mobile,file_url_thumb,blur_data_url,is_cover,display_order FROM website_story_photos WHERE story_id=$1 ORDER BY display_order ASC, id ASC`,
      [story.id]
    )
    reply.send({ ...story, photos })
  })

  // GET /api/website/films — all published films
  fastify.get('/api/website/films', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id,title,subtitle,location,year,thumbnail_url,thumbnail_blur,hls_url,transcode_status,is_featured,display_order FROM website_films WHERE is_published=true ORDER BY display_order ASC, id DESC`
    )
    reply.send(rows)
  })

  /* ─── ADMIN: HERO ─── */

  fastify.post('/api/website/hero', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Multipart required' })

    let fileBuffer = null
    let mediaType = 'image'
    let headline = null, subline = null

    const parts = req.parts({ limits: { fileSize: 500 * 1024 * 1024 } })
    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer()
        if (part.mimetype?.startsWith('video/')) mediaType = 'video'
      } else {
        if (part.fieldname === 'headline') headline = part.value
        if (part.fieldname === 'subline')  subline  = part.value
        if (part.fieldname === 'mediaType') mediaType = part.value
      }
    }
    if (!fileBuffer) return reply.code(400).send({ error: 'No file received' })

    let mediaUrl, mobileUrl, blurDataUrl, posterUrl
    if (mediaType === 'image') {
      const result = await processHeroImage(fileBuffer)
      mediaUrl = result.mediaUrl
      mobileUrl = result.mobileUrl
      blurDataUrl = result.blurDataUrl
    } else {
      // Save raw video for hero background, optimize async
      const ts  = Date.now()
      const dir = path.join(WEBSITE_MEDIA_DIR, 'homepage', 'hero')
      ensureDir(dir)
      const rawPath = path.join(dir, `${ts}-raw.mp4`)
      const bgPath  = path.join(dir, `${ts}-bg.mp4`)
      await fs.promises.writeFile(rawPath, fileBuffer)
      mediaUrl  = `/media/website/homepage/hero/${ts}-bg.mp4`
      mobileUrl = mediaUrl
      // Optimize in background
      optimizeBackgroundVideo(rawPath, bgPath)
        .then(() => fs.promises.unlink(rawPath).catch(() => null))
        .catch(e => console.warn('[hero-video]', e.message))
    }

    // Deactivate old hero
    await pool.query(`UPDATE website_hero SET is_active=false`)
    const { rows: [hero] } = await pool.query(
      `INSERT INTO website_hero (media_type,media_url,mobile_url,poster_url,headline,subline,is_active)
       VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *`,
      [mediaType, mediaUrl, mobileUrl || null, posterUrl || null, headline, subline]
    )
    reply.send(hero)
  })

  /* ─── ADMIN: STORIES ─── */

  fastify.get('/api/website/admin/stories', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { rows } = await pool.query(
      `SELECT s.*,
        (SELECT COUNT(*) FROM website_story_photos WHERE story_id=s.id)::int AS photo_count
       FROM website_stories s ORDER BY s.display_order ASC, s.id DESC`
    )
    reply.send(rows)
  })

  fastify.get('/api/website/admin/stories/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { rows: [story] } = await pool.query(`SELECT * FROM website_stories WHERE id=$1`, [req.params.id])
    if (!story) return reply.code(404).send({ error: 'Not found' })
    const { rows: photos } = await pool.query(
      `SELECT * FROM website_story_photos WHERE story_id=$1 ORDER BY display_order ASC, id ASC`, [story.id]
    )
    reply.send({ ...story, photos })
  })

  // PATCH /api/website/admin/stories/reorder
  fastify.patch('/api/website/admin/stories/reorder', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { order } = req.body // array of { id, display_order }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const item of order) {
        await client.query(`UPDATE website_stories SET display_order = $1 WHERE id = $2`, [item.display_order, item.id])
      }
      await client.query('COMMIT')
      reply.send({ success: true })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })

  fastify.post('/api/website/stories', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { title, subtitle, location, date, category, is_published, is_featured } = req.body || {}
    if (!title) return reply.code(400).send({ error: 'Title is required' })
    const slug = slugify(title) + '-' + Date.now().toString(36)
    const { rows: [story] } = await pool.query(
      `INSERT INTO website_stories (slug,title,subtitle,location,date,category,is_published,is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [slug, title, subtitle||null, location||null, date||null, category||null,
       is_published||false, is_featured||false]
    )
    reply.send(story)
  })

  fastify.patch('/api/website/stories/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { id } = req.params
    const { title, subtitle, location, date, category, is_published, is_featured, display_order, slug } = req.body || {}
    const { rows: [story] } = await pool.query(
      `UPDATE website_stories SET
         title=COALESCE($1,title), subtitle=COALESCE($2,subtitle),
         location=COALESCE($3,location), date=COALESCE($4,date),
         category=COALESCE($5,category),
         is_published=COALESCE($6,is_published), is_featured=COALESCE($7,is_featured),
         display_order=COALESCE($8,display_order), slug=COALESCE($9,slug),
         updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [title,subtitle,location,date,category,is_published,is_featured,display_order,slug, id]
    )
    if (!story) return reply.code(404).send({ error: 'Not found' })
    reply.send(story)
  })

  fastify.delete('/api/website/stories/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { rows: [story] } = await pool.query(`SELECT slug FROM website_stories WHERE id=$1`, [req.params.id])
    if (!story) return reply.code(404).send({ error: 'Not found' })
    await pool.query(`DELETE FROM website_stories WHERE id=$1`, [req.params.id])
    reply.send({ success: true })
  })

  /* ─── ADMIN: STORY PHOTOS ─── */

  fastify.post('/api/website/stories/:id/photos', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const storyId = parseInt(req.params.id)
    const { rows: [story] } = await pool.query(`SELECT slug FROM website_stories WHERE id=$1`, [storyId])
    if (!story) return reply.code(404).send({ error: 'Story not found' })
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Multipart required' })

    const savedPhotos = []
    const parts = req.parts({ limits: { fileSize: 50 * 1024 * 1024 } })
    for await (const part of parts) {
      if (part.type !== 'file') continue
      try {
        const buf = await part.toBuffer()
        const result = await processStoryPhoto(buf, story.slug, part.filename)
        // Get next display order
        const { rows: [{ max_order }] } = await pool.query(
          `SELECT COALESCE(MAX(display_order),0) as max_order FROM website_story_photos WHERE story_id=$1`, [storyId]
        )
        const { rows: [photo] } = await pool.query(
          `INSERT INTO website_story_photos (story_id,file_url,file_url_mobile,file_url_thumb,blur_data_url,original_filename,display_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [storyId, result.fileUrl, result.fileUrlMobile, result.fileUrlThumb, result.blurDataUrl,
           part.filename||'', (max_order||0)+1]
        )
        // Auto-set cover if first photo
        const { rows: [{ cnt }] } = await pool.query(
          `SELECT COUNT(*)::int as cnt FROM website_story_photos WHERE story_id=$1 AND is_cover=true`, [storyId]
        )
        if (cnt === 0) {
          await pool.query(`UPDATE website_story_photos SET is_cover=true WHERE id=$1`, [photo.id])
          await pool.query(
            `UPDATE website_stories SET cover_image_url=$1, cover_image_mobile_url=$2, cover_blur_data_url=$3, updated_at=NOW() WHERE id=$4`,
            [result.fileUrl, result.fileUrlMobile, result.blurDataUrl, storyId]
          )
          photo.is_cover = true
        }
        savedPhotos.push(photo)
      } catch (e) {
        console.error('[story-photo] upload error:', e.message)
      }
    }
    reply.send(savedPhotos)
  })

  fastify.patch('/api/website/stories/:id/photos/reorder', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { order } = req.body || {} // [{id, display_order}]
    if (!Array.isArray(order)) return reply.code(400).send({ error: 'order[] required' })
    for (const { id, display_order } of order) {
      await pool.query(`UPDATE website_story_photos SET display_order=$1 WHERE id=$2`, [display_order, id])
    }
    reply.send({ success: true })
  })

  fastify.patch('/api/website/story-photos/:photoId/cover', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { photoId } = req.params
    const { rows: [photo] } = await pool.query(`SELECT * FROM website_story_photos WHERE id=$1`, [photoId])
    if (!photo) return reply.code(404).send({ error: 'Not found' })
    // Unset current cover, set new cover
    await pool.query(`UPDATE website_story_photos SET is_cover=false WHERE story_id=$1`, [photo.story_id])
    await pool.query(`UPDATE website_story_photos SET is_cover=true WHERE id=$1`, [photoId])
    await pool.query(
      `UPDATE website_stories SET cover_image_url=$1, cover_image_mobile_url=$2, cover_blur_data_url=$3, updated_at=NOW() WHERE id=$4`,
      [photo.file_url, photo.file_url_mobile, photo.blur_data_url, photo.story_id]
    )
    reply.send({ success: true })
  })

  fastify.delete('/api/website/story-photos/:photoId', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { rows: [photo] } = await pool.query(`SELECT * FROM website_story_photos WHERE id=$1`, [req.params.photoId])
    if (!photo) return reply.code(404).send({ error: 'Not found' })
    await pool.query(`DELETE FROM website_story_photos WHERE id=$1`, [req.params.photoId])
    reply.send({ success: true })
  })

  /* ─── ADMIN: FILMS ─── */

  fastify.get('/api/website/admin/films', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { rows } = await pool.query(`SELECT * FROM website_films ORDER BY display_order ASC, id DESC`)
    reply.send(rows)
  })

  fastify.get('/api/website/films/:id', async (req, reply) => {
    const { rows: [film] } = await pool.query(`SELECT * FROM website_films WHERE id=$1`, [req.params.id])
    if (!film) return reply.code(404).send({ error: 'Not found' })
    reply.send(film)
  })

  fastify.post('/api/website/films', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { title, subtitle, location, year, is_published, is_featured } = req.body || {}
    if (!title) return reply.code(400).send({ error: 'Title required' })
    const { rows: [film] } = await pool.query(
      `INSERT INTO website_films (title,subtitle,location,year,is_published,is_featured)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, subtitle||null, location||null, year||null, is_published||false, is_featured||false]
    )
    reply.send(film)
  })

  fastify.patch('/api/website/films/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { id } = req.params
    const { title,subtitle,location,year,is_published,is_featured,display_order } = req.body||{}
    const { rows: [film] } = await pool.query(
      `UPDATE website_films SET
         title=COALESCE($1,title), subtitle=COALESCE($2,subtitle),
         location=COALESCE($3,location), year=COALESCE($4,year),
         is_published=COALESCE($5,is_published), is_featured=COALESCE($6,is_featured),
         display_order=COALESCE($7,display_order), updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [title,subtitle,location,year,is_published,is_featured,display_order, id]
    )
    if (!film) return reply.code(404).send({ error: 'Not found' })
    reply.send(film)
  })

  fastify.delete('/api/website/films/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    await pool.query(`DELETE FROM website_films WHERE id=$1`, [req.params.id])
    reply.send({ success: true })
  })

  fastify.post('/api/website/films/:id/thumbnail', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Multipart required' })
    const filmId = req.params.id
    const parts = req.parts({ limits: { fileSize: 20 * 1024 * 1024 } })
    let result = null
    for await (const part of parts) {
      if (part.type === 'file') {
        const buf = await part.toBuffer()
        result = await processFilmThumbnail(buf, filmId)
        break
      }
    }
    if (!result) return reply.code(400).send({ error: 'No file received' })
    const { rows: [film] } = await pool.query(
      `UPDATE website_films SET thumbnail_url=$1, thumbnail_blur=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [result.thumbnailUrl, result.thumbnailBlur, filmId]
    )
    reply.send(film)
  })

  fastify.post('/api/website/films/:id/video', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Multipart required' })
    const filmId = parseInt(req.params.id)
    const rawDir = path.join(WEBSITE_MEDIA_DIR, 'films', String(filmId), 'raw')
    ensureDir(rawDir)
    const rawPath = path.join(rawDir, `original-${Date.now()}.mp4`)

    const parts = req.parts({ limits: { fileSize: 30 * 1024 * 1024 * 1024 } }) // 30GB max
    let received = false
    for await (const part of parts) {
      if (part.type === 'file') {
        await pipeline(part.file, fs.createWriteStream(rawPath))
        received = true
        break
      }
    }
    if (!received) return reply.code(400).send({ error: 'No video received' })

    // Mark as processing immediately
    await pool.query(
      `UPDATE website_films SET transcode_status='processing', transcode_error=NULL, updated_at=NOW() WHERE id=$1`,
      [filmId]
    )

    // Fire async transcode — does NOT block response
    transcodeFilmAsync({ filmId, rawPath, pool })

    reply.send({ success: true, status: 'processing', message: 'Video uploaded. Transcoding in background.' })
  })

  /* ─── ADMIN: TESTIMONIALS ─── */

  fastify.get('/api/website/admin/testimonials', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { rows } = await pool.query(`SELECT * FROM website_testimonials ORDER BY display_order ASC, id ASC`)
    reply.send(rows)
  })

  fastify.post('/api/website/testimonials', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { quote, client_name, location, year } = req.body || {}
    if (!quote || !client_name) return reply.code(400).send({ error: 'quote and client_name required' })
    const { rows: [t] } = await pool.query(
      `INSERT INTO website_testimonials (quote,client_name,location,year) VALUES ($1,$2,$3,$4) RETURNING *`,
      [quote, client_name, location||null, year||null]
    )
    reply.send(t)
  })

  fastify.patch('/api/website/testimonials/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { quote, client_name, location, year, is_active, display_order } = req.body || {}
    const { rows: [t] } = await pool.query(
      `UPDATE website_testimonials SET
         quote=COALESCE($1,quote), client_name=COALESCE($2,client_name),
         location=COALESCE($3,location), year=COALESCE($4,year),
         is_active=COALESCE($5,is_active), display_order=COALESCE($6,display_order)
       WHERE id=$7 RETURNING *`,
      [quote, client_name, location, year, is_active, display_order, req.params.id]
    )
    if (!t) return reply.code(404).send({ error: 'Not found' })
    reply.send(t)
  })

  fastify.delete('/api/website/testimonials/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    await pool.query(`DELETE FROM website_testimonials WHERE id=$1`, [req.params.id])
    reply.send({ success: true })
  })

  /* ─── ADMIN: SECTIONS ─── */

  fastify.get('/api/website/sections', async (req, reply) => {
    const { rows } = await pool.query(`SELECT * FROM website_sections ORDER BY display_order ASC`)
    reply.send(rows)
  })

  fastify.patch('/api/website/sections', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { sections } = req.body || {} // [{key, is_visible, display_order, content}]
    if (!Array.isArray(sections)) return reply.code(400).send({ error: 'sections[] required' })
    for (const s of sections) {
      await pool.query(
        `UPDATE website_sections SET
           is_visible=COALESCE($1,is_visible),
           display_order=COALESCE($2,display_order),
           content=COALESCE($3,content)
         WHERE key=$4`,
        [s.is_visible, s.display_order, s.content ? JSON.stringify(s.content) : null, s.key]
      )
    }
    const { rows } = await pool.query(`SELECT * FROM website_sections ORDER BY display_order ASC`)
    reply.send(rows)
  })

  /* ─── ADMIN: PHILOSOPHY SECTION PHOTOS ─── */

  fastify.post('/api/website/sections/philosophy/photos', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Multipart required' })

    let fileBuffer = null
    let slot = '1' // '1' = small left photo, '2' = large right photo

    const parts = req.parts({ limits: { fileSize: 100 * 1024 * 1024 } })
    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer()
      } else if (part.fieldname === 'slot') {
        slot = part.value
      }
    }
    if (!fileBuffer) return reply.code(400).send({ error: 'No file received' })

    // Save optimised WebP to media folder
    const ts = Date.now()
    const dir = path.join(WEBSITE_MEDIA_DIR, 'homepage', 'philosophy')
    ensureDir(dir)
    const filename = `${ts}-slot${slot}.webp`
    const absPath  = path.join(dir, filename)
    const sharp    = require('sharp')
    await sharp(fileBuffer)
      .resize(1600, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(absPath)

    const photoUrl = `/media/website/homepage/philosophy/${filename}`

    // Upsert into the philosophy section content JSON
    const { rows: [existing] } = await pool.query(
      `SELECT content FROM website_sections WHERE key='philosophy'`
    )
    const content = existing?.content || {}
    content[`photo${slot}`] = photoUrl

    await pool.query(
      `UPDATE website_sections SET content=$1 WHERE key='philosophy'`,
      [JSON.stringify(content)]
    )

    reply.send({ url: photoUrl, slot, content })
  })

  /* ─── ADMIN: INQUIRY SECTION BACKGROUND ─── */

  fastify.post('/api/website/sections/inquiry/bg', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Multipart required' })

    let fileBuffer = null
    const parts = req.parts({ limits: { fileSize: 100 * 1024 * 1024 } })
    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer()
      }
    }
    if (!fileBuffer) return reply.code(400).send({ error: 'No file received' })

    const ts = Date.now()
    const dir = path.join(WEBSITE_MEDIA_DIR, 'homepage', 'inquiry')
    ensureDir(dir)
    const filename = `${ts}-bg.webp`
    const absPath  = path.join(dir, filename)
    const sharp    = require('sharp')
    await sharp(fileBuffer)
      .resize(2560, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(absPath)

    const photoUrl = `/media/website/homepage/inquiry/${filename}`

    const { rows: [existing] } = await pool.query(
      `SELECT content FROM website_sections WHERE key='inquiry'`
    )
    const content = existing?.content || {}
    content.bgImage = photoUrl

    await pool.query(
      `UPDATE website_sections SET content=$1 WHERE key='inquiry'`,
      [JSON.stringify(content)]
    )

    reply.send({ url: photoUrl, content })
  })

  /* ─── MEDIA FILE SERVING ─── */

  fastify.get('/media/website/*', async (req, reply) => {
    const relPath = req.params['*']
    // Block direct access to originals and raw film sources
    if (relPath.includes('/originals/') || relPath.includes('/raw/')) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    const absPath = path.join(WEBSITE_MEDIA_DIR, relPath)
    let stat
    try {
      stat = await fs.promises.stat(absPath)
    } catch {
      return reply.code(404).send({ error: 'Not found' })
    }
    const ext = path.extname(absPath).toLowerCase()
    const mimeTypes = {
      '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.mp4': 'video/mp4', '.m3u8': 'application/vnd.apple.mpegurl',
      '.ts': 'video/mp2t',
    }
    const mime = mimeTypes[ext] || 'application/octet-stream'
    // Cache aggressively for immutable assets (images/segments), short TTL for playlists
    const cacheHeader = ext === '.m3u8'
      ? 'no-cache'
      : 'public, max-age=31536000, immutable'

    // Read the entire file into a Buffer and send it — avoids Fastify stream bugs
    const fileBuffer = await fs.promises.readFile(absPath)
    reply
      .header('Content-Type', mime)
      .header('Content-Length', stat.size)
      .header('Cache-Control', cacheHeader)
      .send(fileBuffer)
  })
}
