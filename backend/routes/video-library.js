module.exports = async function(fastify, opts) {
  const {
    requireAdmin,
    requireAuth,
    sanitizeTags,
    ensureDirectory,
    crypto,
    fastify,
    VIDEO_UPLOAD_DIR,
    fs,
    multipart,
    path,
    pool,
  } = opts;

/* ===================== VIDEO LIBRARY ===================== */
const VIDEO_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'videos')
fastify.get('/api/videos', async (req, reply) => {
  const auth = requireAuth(req, reply)
  if (!auth) return
  const { rows } = await pool.query(
    `SELECT id, file_url as url, tags, file_hash, created_at FROM video_library ORDER BY created_at DESC`
  )
  reply.send(rows)
})

fastify.get('/api/videos/file/:filename', async (req, reply) => {
  const filename = path.basename(req.params.filename || '')
  if (!filename) return reply.code(404).send({ error: 'Not found' })
  const filePath = path.join(VIDEO_UPLOAD_DIR, filename)
  try {
    await fs.promises.stat(filePath)
  } catch (err) {
    return reply.code(404).send({ error: 'Not found' })
  }
  
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.mp4') reply.type('video/mp4')
  else if (ext === '.webm') reply.type('video/webm')
  else if (ext === '.mov') reply.type('video/quicktime')
  else reply.type('application/octet-stream')

  return reply.send(fs.createReadStream(filePath))
})

fastify.post('/api/videos', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  ensureDirectory(VIDEO_UPLOAD_DIR)

  // Prefer multipart streaming for large files
  if (req.isMultipart()) {
    let savedFile = null
    let tags = []
    let contentHash = null
    let fileTooLarge = false

    try {
      const parts = req.parts({ limits: { fileSize: 524288000 } }) // 500MB
      for await (const part of parts) {
        if (part.type === 'file') {
          const originalName = part.filename || 'video'
          const ext = path.extname(originalName).toLowerCase() || '.webm'
          const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`
          const filePath = path.join(VIDEO_UPLOAD_DIR, filename)

          part.file.on('limit', () => {
            fileTooLarge = true
          })

          try {
            await pipeline(part.file, fs.createWriteStream(filePath, { highWaterMark: 1024 * 1024 }))
          } catch (err) {
            if (fileTooLarge || err?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
              try { await fs.promises.unlink(filePath) } catch {}
            }
            throw err
          }

          savedFile = { filename, filePath }
        } else if (part.fieldname === 'tags') {
          try { tags = JSON.parse(part.value) } catch { tags = [] }
        } else if (part.fieldname === 'contentHash') {
          contentHash = part.value || null
        }
      }

      if (!savedFile) return reply.code(400).send({ error: 'No video file received.' })
      if (fileTooLarge) {
        try { await fs.promises.unlink(savedFile.filePath) } catch {}
        return reply.code(413).send({ error: 'Video file is too large (max 500MB).' })
      }

      if (contentHash) {
        const { rows: existing } = await pool.query(`SELECT id FROM video_library WHERE file_hash = $1`, [contentHash])
        if (existing.length > 0) {
          try { await fs.promises.unlink(savedFile.filePath) } catch {}
          return reply.code(409).send({ error: 'This video already exists in the library.', duplicateId: existing[0].id })
        }
      }

      const fileUrl = `/api/videos/file/${savedFile.filename}`
      const cleanTags = sanitizeTags(tags)
      const { rows } = await pool.query(
        `INSERT INTO video_library (file_name, file_url, tags, file_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, file_url as url, tags, file_hash, created_at`,
        [savedFile.filename, fileUrl, cleanTags, contentHash || null]
      )
      return reply.send(rows[0])
    } catch (err) {
      if (err?.code === 'FST_RET_ERR_FILE_TOO_LARGE') {
        return reply.code(413).send({ error: 'Video file is too large (max 500MB).' })
      }
      if (err?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        return reply.code(400).send({ error: 'Upload was interrupted. Please try again.' })
      }
      console.error('❌ CRITICAL: Video upload failed:', err)
      return reply.code(500).send({
        error: 'Technical upload failure.',
        details: err?.message || 'Server error during stream processing'
      })
    }
  }

  // Legacy base64 fallback
  const { dataUrl, filename: originalName, tags: legacyTags, contentHash: legacyHash } = req.body || {}
  if (!dataUrl || typeof dataUrl !== 'string') {
    return reply.code(400).send({ error: 'File data is required.' })
  }
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/)
  if (!match || !match[1].startsWith('video/')) {
    return reply.code(400).send({ error: 'Invalid video file data.' })
  }
  const [, mimeType, base64Data] = match
  const extFromMime = mimeType === 'video/mp4' ? '.mp4'
    : mimeType === 'video/webm' ? '.webm'
      : mimeType === 'video/quicktime' ? '.mov'
        : '.webm'
  const ext = path.extname(originalName || '').toLowerCase()
  const safeExt = extFromMime || (ext && ext.length <= 8 ? ext : '.webm')
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`
  const filePath = path.join(VIDEO_UPLOAD_DIR, filename)
  const buffer = Buffer.from(base64Data, 'base64')
  await fs.promises.writeFile(filePath, buffer)

  const fileUrl = `/api/videos/file/${filename}`
  const cleanTags = sanitizeTags(legacyTags)
  const { rows } = await pool.query(
    `INSERT INTO video_library (file_name, file_url, tags, file_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, file_url as url, tags, file_hash, created_at`,
    [filename, fileUrl, cleanTags, legacyHash || null]
  )
  return reply.send(rows[0])
})

fastify.patch('/api/videos/:id', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { id } = req.params
  const tags = sanitizeTags(req.body?.tags)
  const { rows } = await pool.query(
    `UPDATE video_library SET tags = $1, updated_at = NOW() WHERE id = $2 RETURNING id, file_url as url, tags, created_at`,
    [tags, id]
  )
  if (!rows.length) return reply.code(404).send({ error: 'Video not found.' })
  reply.send(rows[0])
})

fastify.delete('/api/videos/:id', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { id } = req.params
  const { rows } = await pool.query(`SELECT file_name FROM video_library WHERE id = $1`, [id])
  if (!rows.length) return reply.code(404).send({ error: 'Video not found.' })
  await pool.query(`DELETE FROM video_library WHERE id = $1`, [id])
  const filePath = path.join(VIDEO_UPLOAD_DIR, rows[0].file_name)
  fs.promises.unlink(filePath).catch(() => null)
  reply.send({ success: true })
})


}
