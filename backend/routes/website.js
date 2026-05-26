/**
 * Misty Visuals Public Website Routes
 * All website CMS + public API endpoints
 */
const path = require('path')
const fs   = require('fs')
const { pipeline } = require('stream/promises')
const { processStoryPhoto, processHeroImage, processFilmThumbnail, WEBSITE_MEDIA_DIR } = require('../utils/website-images')
const { optimizeBackgroundVideo } = require('../utils/website-hls')

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
      pool.query(`SELECT id,slug,title,subtitle,location,date,category,grid_image_url,cover_image_url,cover_image_mobile_url,cover_blur_data_url,display_order FROM website_stories WHERE is_published=true AND is_featured=true ORDER BY display_order ASC, id DESC LIMIT 5`),
      pool.query(`SELECT id,title,subtitle,location,year,thumbnail_url,thumbnail_blur,youtube_url,youtube_video_id,display_order FROM website_films WHERE is_published=true AND is_featured=true ORDER BY display_order ASC, id DESC LIMIT 6`),
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
      `SELECT id,slug,title,subtitle,location,date,category,grid_image_url,cover_image_url,cover_image_mobile_url,cover_blur_data_url,is_featured,display_order FROM website_stories WHERE is_published=true ORDER BY is_featured DESC, display_order ASC, id DESC`
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
    const [photosRes, filmsRes, reelsRes] = await Promise.all([
      pool.query(
        `SELECT id,file_url,file_url_mobile,file_url_thumb,blur_data_url,is_cover,display_order,tab_name FROM website_story_photos WHERE story_id=$1 ORDER BY display_order ASC, id ASC`,
        [story.id]
      ),
      pool.query(
        `SELECT id,title,subtitle,location,year,category,thumbnail_url,thumbnail_blur,youtube_url,youtube_video_id,is_featured,display_order FROM website_films WHERE story_id=$1 AND is_published=true ORDER BY display_order ASC, id DESC`,
        [story.id]
      ),
      pool.query(
        `SELECT id,title,youtube_video_id,thumbnail_url,thumbnail_blur,display_order FROM website_reels WHERE story_id=$1 AND is_published=true ORDER BY display_order ASC, id DESC`,
        [story.id]
      )
    ])
    reply.send({ ...story, photos: photosRes.rows, films: filmsRes.rows, reels: reelsRes.rows })
  })

  // GET /api/website/films — all published films
  fastify.get('/api/website/films', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id,title,subtitle,location,year,category,thumbnail_url,thumbnail_blur,youtube_url,youtube_video_id,is_featured,display_order FROM website_films WHERE is_published=true ORDER BY is_featured DESC, display_order ASC, id DESC`
    )
    reply.send(rows)
  })

  /* ─── ADMIN: HERO ─── */

  fastify.post('/api/website/hero', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Multipart required' })

    let mediaType = 'image'
    let headline = null, subline = null
    let savedFilePath = null
    let savedMimetype = null

    const ts  = Date.now()
    const dir = path.join(WEBSITE_MEDIA_DIR, 'homepage', 'hero')
    ensureDir(dir)

    const parts = req.parts({ limits: { fileSize: 2 * 1024 * 1024 * 1024 } }) // 2GB
    for await (const part of parts) {
      if (part.type === 'file') {
        savedMimetype = part.mimetype || ''
        if (savedMimetype.startsWith('video/')) {
          // Stream video directly to disk — avoids loading into RAM
          const ext = savedMimetype.includes('webm') ? 'webm' : 'mp4'
          savedFilePath = path.join(dir, `${ts}-raw.${ext}`)
          await pipeline(part.file, fs.createWriteStream(savedFilePath))
          mediaType = 'video'
        } else {
          // Image — buffer is fine after client-side compression
          const buf = await part.toBuffer()
          savedFilePath = buf // store buffer directly for image processing
          mediaType = 'image'
        }
      } else {
        if (part.fieldname === 'headline') headline = part.value
        if (part.fieldname === 'subline')  subline  = part.value
        if (part.fieldname === 'mediaType') mediaType = part.value
      }
    }
    if (!savedFilePath) return reply.code(400).send({ error: 'No file received' })

    let mediaUrl, mobileUrl, blurDataUrl, posterUrl
    if (mediaType === 'image') {
      const result = await processHeroImage(savedFilePath) // savedFilePath is a Buffer here
      mediaUrl = result.mediaUrl
      mobileUrl = result.mobileUrl
      blurDataUrl = result.blurDataUrl
    } else {
      // savedFilePath is the raw video path on disk
      const ext = (savedMimetype || '').includes('webm') ? 'webm' : 'mp4'
      const bgPath = path.join(dir, `${ts}-bg.${ext}`)
      mediaUrl  = `/media/website/homepage/hero/${ts}-bg.${ext}`
      mobileUrl = mediaUrl
      // Optimize in background (non-blocking)
      optimizeBackgroundVideo(savedFilePath, bgPath)
        .then(() => fs.promises.unlink(savedFilePath).catch(() => null))
        .catch(e => {
          // If ffmpeg fails, just use raw file as-is
          console.warn('[hero-video] ffmpeg failed, using raw:', e.message)
          fs.promises.rename(savedFilePath, bgPath).catch(() => null)
        })
    }

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
    const [photosRes, filmsRes, reelsRes] = await Promise.all([
      pool.query(
        `SELECT * FROM website_story_photos WHERE story_id=$1 ORDER BY display_order ASC, id ASC`, [story.id]
      ),
      pool.query(
        `SELECT id,title,category FROM website_films WHERE story_id=$1 ORDER BY display_order ASC`, [story.id]
      ),
      pool.query(
        `SELECT id,title FROM website_reels WHERE story_id=$1 ORDER BY display_order ASC`, [story.id]
      )
    ])
    reply.send({ ...story, photos: photosRes.rows, films: filmsRes.rows, reels: reelsRes.rows })
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
    const { title, subtitle, location, date, category, is_published, is_featured, display_order, slug, tabs, film_ids, reel_ids } = req.body || {}
    
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      
      const { rows: [story] } = await client.query(
        `UPDATE website_stories SET
           title=COALESCE($1,title), subtitle=COALESCE($2,subtitle),
           location=COALESCE($3,location), date=COALESCE($4,date),
           category=COALESCE($5,category),
           is_published=COALESCE($6,is_published), is_featured=COALESCE($7,is_featured),
           display_order=COALESCE($8,display_order), slug=COALESCE($9,slug),
           tabs=COALESCE($10,tabs),
           updated_at=NOW()
         WHERE id=$11 RETURNING *`,
        [title,subtitle,location,date,category,is_published,is_featured,display_order,slug, tabs ? JSON.stringify(tabs) : null, id]
      )
      
      if (!story) {
        await client.query('ROLLBACK')
        return reply.code(404).send({ error: 'Not found' })
      }

      if (film_ids !== undefined) {
        await client.query(`UPDATE website_films SET story_id = NULL WHERE story_id = $1`, [id])
        if (Array.isArray(film_ids) && film_ids.length > 0) {
          await client.query(`UPDATE website_films SET story_id = $1 WHERE id = ANY($2::int[])`, [id, film_ids])
        }
      }

      if (reel_ids !== undefined) {
        await client.query(`UPDATE website_reels SET story_id = NULL WHERE story_id = $1`, [id])
        if (Array.isArray(reel_ids) && reel_ids.length > 0) {
          await client.query(`UPDATE website_reels SET story_id = $1 WHERE id = ANY($2::int[])`, [id, reel_ids])
        }
      }
      
      await client.query('COMMIT')
      reply.send(story)
    } catch (err) {
      await client.query('ROLLBACK')
      reply.code(500).send({ error: err.message })
    } finally {
      client.release()
    }
  })

  fastify.patch('/api/website/stories/:id/tabs/rename', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { id } = req.params
    const { oldName, newName } = req.body || {}
    if (!oldName || !newName) return reply.code(400).send({ error: 'oldName and newName required' })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // 1. Update the tab name in the JSON array of tabs inside website_stories
      const { rows: [story] } = await client.query(`SELECT tabs FROM website_stories WHERE id=$1`, [id])
      if (!story) throw new Error('Story not found')

      let tabs = story.tabs || []
      tabs = tabs.map(t => t === oldName ? newName : t)

      await client.query(
        `UPDATE website_stories SET tabs=$1, updated_at=NOW() WHERE id=$2`,
        [JSON.stringify(tabs), id]
      )

      // 2. Update photos
      await client.query(
        `UPDATE website_story_photos SET tab_name=$1 WHERE story_id=$2 AND tab_name=$3`,
        [newName, id, oldName]
      )

      await client.query('COMMIT')
      reply.send({ success: true, tabs })
    } catch (err) {
      await client.query('ROLLBACK')
      reply.code(500).send({ error: err.message })
    } finally {
      client.release()
    }
  })

  fastify.delete('/api/website/stories/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { rows: [story] } = await pool.query(`SELECT slug FROM website_stories WHERE id=$1`, [req.params.id])
    if (!story) return reply.code(404).send({ error: 'Not found' })
    await pool.query(`DELETE FROM website_stories WHERE id=$1`, [req.params.id])
    reply.send({ success: true })
  })

  /* ─── ADMIN: STORY COVERS ─── */

  fastify.post('/api/website/stories/:id/covers', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const storyId = parseInt(req.params.id)
    const { rows: [story] } = await pool.query(`SELECT slug FROM website_stories WHERE id=$1`, [storyId])
    if (!story) return reply.code(404).send({ error: 'Story not found' })
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Multipart required' })

    let fileBuffer = null
    let coverType = 'grid' // 'grid', 'desktop', 'mobile'

    const parts = req.parts({ limits: { fileSize: 50 * 1024 * 1024 } })
    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer()
      } else if (part.fieldname === 'coverType') {
        coverType = part.value
      }
    }
    if (!fileBuffer) return reply.code(400).send({ error: 'No file received' })
    if (!['grid', 'desktop', 'mobile'].includes(coverType)) return reply.code(400).send({ error: 'Invalid coverType' })

    const safeSlug = story.slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
    const ts = Date.now()
    const dir = path.join(WEBSITE_MEDIA_DIR, 'stories', safeSlug, 'covers')
    ensureDir(dir)
    const filename = `${ts}-${coverType}.webp`
    const absPath  = path.join(dir, filename)
    const sharp    = require('sharp')

    let width = 1920
    if (coverType === 'mobile') width = 800
    if (coverType === 'grid') width = 1080

    await sharp(fileBuffer)
      .resize(width, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(absPath)

    const photoUrl = `/media/website/stories/${safeSlug}/covers/${filename}`

    let column = 'grid_image_url'
    if (coverType === 'desktop') column = 'cover_image_url'
    if (coverType === 'mobile') column = 'cover_image_mobile_url'

    const { rows: [updatedStory] } = await pool.query(
      `UPDATE website_stories SET ${column}=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [photoUrl, storyId]
    )

    reply.send({ url: photoUrl, coverType, story: updatedStory })
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
        const tabName = req.query.tab || null;
        const { rows: [photo] } = await pool.query(
          `INSERT INTO website_story_photos (story_id,file_url,file_url_mobile,file_url_thumb,blur_data_url,original_filename,display_order,tab_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [storyId, result.fileUrl, result.fileUrlMobile, result.fileUrlThumb, result.blurDataUrl,
           part.filename||'', (max_order||0)+1, tabName]
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
    const { rows } = await pool.query(`SELECT * FROM website_films ORDER BY is_featured DESC, display_order ASC, id DESC`)
    reply.send(rows)
  })

  fastify.get('/api/website/films/:id', async (req, reply) => {
    const { rows: [film] } = await pool.query(`SELECT * FROM website_films WHERE id=$1`, [req.params.id])
    if (!film) return reply.code(404).send({ error: 'Not found' })
    reply.send(film)
  })

  fastify.post('/api/website/films', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { title, subtitle, location, year, youtube_url, youtube_video_id, is_published, is_featured } = req.body || {}
    if (!title) return reply.code(400).send({ error: 'Title required' })
    const { rows: [film] } = await pool.query(
      `INSERT INTO website_films (title,subtitle,location,year,youtube_url,youtube_video_id,is_published,is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, subtitle||null, location||null, year||null, youtube_url||null, youtube_video_id||null, is_published||false, is_featured||false]
    )
    reply.send(film)
  })

  fastify.patch('/api/website/films/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { id } = req.params
    const { title,subtitle,location,year,category,youtube_url,youtube_video_id,is_published,is_featured,display_order } = req.body||{}
    const { rows: [film] } = await pool.query(
      `UPDATE website_films SET
         title=COALESCE($1,title), subtitle=COALESCE($2,subtitle),
         location=COALESCE($3,location), year=COALESCE($4,year),
         category=COALESCE($5,category), youtube_url=COALESCE($6,youtube_url), 
         youtube_video_id=COALESCE($7,youtube_video_id),
         is_published=COALESCE($8,is_published), is_featured=COALESCE($9,is_featured),
         display_order=COALESCE($10,display_order), updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [title,subtitle,location,year,category,youtube_url,youtube_video_id,is_published,is_featured,display_order, id]
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


  /* ─── ADMIN: FULL BLEED VIDEO UPLOAD ─── */

  fastify.post('/api/website/sections/full_bleed_video/upload', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Multipart required' })

    const ts  = Date.now()
    const dir = path.join(WEBSITE_MEDIA_DIR, 'homepage', 'fullbleed')
    ensureDir(dir)

    let savedFilePath = null
    let isVideo = false
    let ext = 'webp'

    const parts = req.parts({ limits: { fileSize: 2 * 1024 * 1024 * 1024 } }) // 2GB
    for await (const part of parts) {
      if (part.type === 'file') {
        const mime = part.mimetype || ''
        isVideo = mime.startsWith('video/')
        if (isVideo) {
          ext = mime.includes('webm') ? 'webm' : 'mp4'
          savedFilePath = path.join(dir, `${ts}-fullbleed.${ext}`)
          await pipeline(part.file, fs.createWriteStream(savedFilePath))
        } else {
          ext = 'webp'
          const fileBuffer = await part.toBuffer()
          savedFilePath = path.join(dir, `${ts}-fullbleed.webp`)
          const sharp = require('sharp')
          await sharp(fileBuffer)
            .resize(2560, null, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 85 })
            .toFile(savedFilePath)
        }
      }
    }
    if (!savedFilePath) return reply.code(400).send({ error: 'No file received' })

    const mediaUrl = `/media/website/homepage/fullbleed/${ts}-fullbleed.${ext}`
    const mediaType = isVideo ? 'video' : 'image'

    // Save into sections content
    const { rows: [existing] } = await pool.query(
      `SELECT content FROM website_sections WHERE key='full_bleed_video'`
    )
    const sectionContent = existing?.content || {}
    sectionContent.videoUrl   = mediaUrl
    sectionContent.mediaType  = mediaType

    if (existing) {
      await pool.query(
        `UPDATE website_sections SET content=$1 WHERE key='full_bleed_video'`,
        [JSON.stringify(sectionContent)]
      )
    } else {
      await pool.query(
        `INSERT INTO website_sections (key, label, is_visible, display_order, content) VALUES ('full_bleed_video', 'Full Bleed Video', true, 4, $1)`,
        [JSON.stringify(sectionContent)]
      )
    }

    reply.send({ url: mediaUrl, type: mediaType, content: sectionContent })
  })

  /* ─── ADMIN: FILMS SECTION BACKGROUND ─── */

  fastify.post('/api/website/sections/films/bg', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Multipart required' })

    const ts  = Date.now()
    const dir = path.join(WEBSITE_MEDIA_DIR, 'homepage', 'films')
    ensureDir(dir)

    let savedFilePath = null
    let isVideo = false
    let ext = 'webp'

    const parts = req.parts({ limits: { fileSize: 2 * 1024 * 1024 * 1024 } }) // 2GB
    for await (const part of parts) {
      if (part.type === 'file') {
        const mime = part.mimetype || ''
        isVideo = mime.startsWith('video/')
        if (isVideo) {
          ext = mime.includes('webm') ? 'webm' : 'mp4'
          savedFilePath = path.join(dir, `${ts}-bg.${ext}`)
          // Stream directly to disk
          await pipeline(part.file, fs.createWriteStream(savedFilePath))
        } else {
          ext = 'webp'
          const fileBuffer = await part.toBuffer()
          savedFilePath = path.join(dir, `${ts}-bg.webp`)
          const sharp = require('sharp')
          await sharp(fileBuffer)
            .resize(2560, null, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 85 })
            .toFile(savedFilePath)
        }
      }
    }
    if (!savedFilePath) return reply.code(400).send({ error: 'No file received' })

    const bgUrl  = `/media/website/homepage/films/${ts}-bg.${ext}`
    const bgType = isVideo ? 'video' : 'image'

    const { rows: [existing] } = await pool.query(
      `SELECT content FROM website_sections WHERE key='films'`
    )
    const sectionContent = existing?.content || {}
    sectionContent.bgImage = bgUrl
    sectionContent.bgType  = bgType

    if (existing) {
      await pool.query(
        `UPDATE website_sections SET content=$1 WHERE key='films'`,
        [JSON.stringify(sectionContent)]
      )
    } else {
      await pool.query(
        `INSERT INTO website_sections (key, label, is_visible, display_order, content) VALUES ('films', 'Films', true, 5, $1)`,
        [JSON.stringify(sectionContent)]
      )
    }

    reply.send({ url: bgUrl, type: bgType, content: sectionContent })
  })

  /* ─── ADMIN: STORIES SECTION BACKGROUND ─── */

  fastify.post('/api/website/sections/stories/bg', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Multipart required' })

    const ts  = Date.now()
    const dir = path.join(WEBSITE_MEDIA_DIR, 'homepage', 'stories')
    ensureDir(dir)

    let savedFilePath = null
    let isVideo = false
    let ext = 'webp'

    const parts = req.parts({ limits: { fileSize: 2 * 1024 * 1024 * 1024 } }) // 2GB
    for await (const part of parts) {
      if (part.type === 'file') {
        const mime = part.mimetype || ''
        isVideo = mime.startsWith('video/')
        if (isVideo) {
          ext = mime.includes('webm') ? 'webm' : 'mp4'
          savedFilePath = path.join(dir, `${ts}-bg.${ext}`)
          await pipeline(part.file, fs.createWriteStream(savedFilePath))
        } else {
          ext = 'webp'
          const fileBuffer = await part.toBuffer()
          savedFilePath = path.join(dir, `${ts}-bg.webp`)
          const sharp = require('sharp')
          await sharp(fileBuffer)
            .resize(2560, null, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 85 })
            .toFile(savedFilePath)
        }
      }
    }
    if (!savedFilePath) return reply.code(400).send({ error: 'No file received' })

    const bgUrl  = `/media/website/homepage/stories/${ts}-bg.${ext}`
    const bgType = isVideo ? 'video' : 'image'

    const { rows: [existing] } = await pool.query(
      `SELECT content FROM website_sections WHERE key='stories'`
    )
    const sectionContent = existing?.content || {}
    sectionContent.bgImage = bgUrl
    sectionContent.bgType  = bgType

    if (existing) {
      await pool.query(
        `UPDATE website_sections SET content=$1 WHERE key='stories'`,
        [JSON.stringify(sectionContent)]
      )
    } else {
      await pool.query(
        `INSERT INTO website_sections (key, label, is_visible, display_order, content) VALUES ('stories', 'Stories', true, 2, $1)`,
        [JSON.stringify(sectionContent)]
      )
    }

    reply.send({ url: bgUrl, type: bgType, content: sectionContent })
  })

  /* ─── ADMIN: INQUIRY SECTION BACKGROUND ─── */

  fastify.post('/api/website/sections/inquiry/bg', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Multipart required' })

    // ?page=home|stories|films|contact  (default: home)
    const page = req.query?.page || 'home'
    const allowedPages = ['home', 'stories', 'films', 'contact']
    if (!allowedPages.includes(page)) return reply.code(400).send({ error: 'Invalid page param' })

    let fileBuffer = null
    const parts = req.parts({ limits: { fileSize: 100 * 1024 * 1024 } })
    for await (const part of parts) {
      if (part.type === 'file') { fileBuffer = await part.toBuffer() }
    }
    if (!fileBuffer) return reply.code(400).send({ error: 'No file received' })

    const ts  = Date.now()
    const dir = path.join(WEBSITE_MEDIA_DIR, 'homepage', 'inquiry')
    ensureDir(dir)
    const filename = `${ts}-${page}-bg.webp`
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
    const fieldMap = { home: 'bgHome', stories: 'bgStories', films: 'bgFilms', contact: 'bgContact' }
    content[fieldMap[page]] = photoUrl
    // Keep legacy bgImage in sync for home page
    if (page === 'home') content.bgImage = photoUrl

    await pool.query(
      `UPDATE website_sections SET content=$1 WHERE key='inquiry'`,
      [JSON.stringify(content)]
    )

    reply.send({ url: photoUrl, page, content })
  })

  /* ─── ADMIN: REELS ─── */

  fastify.get('/api/website/admin/reels', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { rows } = await pool.query(`SELECT * FROM website_reels ORDER BY display_order ASC, id DESC`)
    reply.send(rows)
  })

  fastify.get('/api/website/reels/:id', async (req, reply) => {
    const { rows: [reel] } = await pool.query(`SELECT * FROM website_reels WHERE id=$1`, [req.params.id])
    if (!reel) return reply.code(404).send({ error: 'Not found' })
    reply.send(reel)
  })

  fastify.post('/api/website/reels', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { title, youtube_video_id, is_published } = req.body || {}
    if (!title) return reply.code(400).send({ error: 'Title required' })
    const { rows: [reel] } = await pool.query(
      `INSERT INTO website_reels (title, youtube_video_id, is_published)
       VALUES ($1, $2, $3) RETURNING *`,
      [title, youtube_video_id||'', is_published||false]
    )
    reply.send(reel)
  })

  fastify.patch('/api/website/reels/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { id } = req.params
    const { title, youtube_video_id, is_published, display_order } = req.body || {}
    const { rows: [reel] } = await pool.query(
      `UPDATE website_reels SET
         title=COALESCE($1,title), youtube_video_id=COALESCE($2,youtube_video_id),
         is_published=COALESCE($3,is_published), display_order=COALESCE($4,display_order),
         updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [title, youtube_video_id, is_published, display_order, id]
    )
    if (!reel) return reply.code(404).send({ error: 'Not found' })
    reply.send(reel)
  })

  fastify.delete('/api/website/reels/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    await pool.query(`DELETE FROM website_reels WHERE id=$1`, [req.params.id])
    reply.send({ success: true })
  })

  fastify.post('/api/website/reels/:id/thumbnail', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    if (!req.isMultipart()) return reply.code(400).send({ error: 'Multipart required' })
    const reelId = req.params.id
    const parts = req.parts({ limits: { fileSize: 20 * 1024 * 1024 } })
    let fileBuffer = null
    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer()
        break
      }
    }
    if (!fileBuffer) return reply.code(400).send({ error: 'No file received' })

    const dir = path.join(WEBSITE_MEDIA_DIR, 'reels', String(reelId), 'thumb')
    ensureDir(dir)
    const ts = Date.now()
    const sharp = require('sharp')
    
    // Check orientation and physical aspect ratio to prevent double-rotation or rotating already-portrait files sideways
    const metadata = await sharp(fileBuffer).metadata()
    const isSideways = [5, 6, 7, 8].includes(metadata.orientation)
    const skipRotation = isSideways && (metadata.width < metadata.height)

    // Process and crop to a crisp, high-resolution portrait 720x1280 (9:16)
    let mainPipeline = sharp(fileBuffer)
    if (!skipRotation) {
      mainPipeline = mainPipeline.rotate()
    }
    await mainPipeline
      .resize(720, 1280, { fit: 'cover', position: 'center' })
      .webp({ quality: 82 })
      .toFile(path.join(dir, `${ts}.webp`))

    // Generate blur placeholder respecting orientation as well
    let tinyPipeline = sharp(fileBuffer)
    if (!skipRotation) {
      tinyPipeline = tinyPipeline.rotate()
    }
    const tinyBuf = await tinyPipeline
      .resize(16, null, { fit: 'inside' })
      .webp({ quality: 20 })
      .toBuffer()
    const blurDataUrl = `data:image/webp;base64,${tinyBuf.toString('base64')}`

    const thumbnailUrl = `/media/website/reels/${reelId}/thumb/${ts}.webp`
    const { rows: [reel] } = await pool.query(
      `UPDATE website_reels SET thumbnail_url=$1, thumbnail_blur=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [thumbnailUrl, blurDataUrl, reelId]
    )
    reply.send(reel)
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
