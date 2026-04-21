module.exports = async function(fastify, opts) {
  const {
    getImageContentType,
    requireAdmin,
    requireAuth,
    sanitizeTags,
    ensureDirectory,
    crypto,
    fs,
    path,
    PHOTO_UPLOAD_DIR,
    pool,
  } = opts;

/* ===================== PHOTO LIBRARY ===================== */

fastify.get('/api/photos', async (req, reply) => {
  const auth = requireAuth(req, reply)
  if (!auth) return
  const { rows } = await pool.query(
    `SELECT id, file_url as url, tags, content_hash, created_at FROM photo_library ORDER BY created_at DESC`
  )
  reply.send(rows)
})

fastify.post('/api/photos/auto-curate', async (req, reply) => {
   const { structuredEvents: rawStructured = [], leadEvents: rawLeadEvents, location = '', isDestination = false, requiredCount = 8, excludeUrls = [], notesContext = '', coverageScope = 'Both Sides' } = req.body || {}
   
   // Accept both structuredEvents (objects) and leadEvents (flat strings) — auto-convert if needed
   let structuredEvents = rawStructured
   if ((!structuredEvents || structuredEvents.length === 0) && Array.isArray(rawLeadEvents) && rawLeadEvents.length > 0) {
      structuredEvents = rawLeadEvents.map(name => ({ name: String(name), slot: '', location: '' }))
   }

   const cleanLoc = String(location || '').toLowerCase().trim()
   const notesText = String(notesContext || '').toLowerCase()
   const scopeText = String(coverageScope || '').toLowerCase()
   const isBrideOnly = scopeText.includes('bride') && !scopeText.includes('both')
   const isGroomOnly = scopeText.includes('groom') && !scopeText.includes('both')
 
   const knownEventTags = ['haldi', 'mehendi', 'wedding', 'sangeet', 'reception', 'engagement', 'pre wedding']
   const dayTimeTags = ['day', 'morning', 'daylight', 'outdoor', 'sunlight', 'sunset']
   const nightTimeTags = ['evening', 'night', 'dusk', 'golden hour']

   const targetEventWords = [...new Set(structuredEvents.map(ev => {
      const evName = (ev.name || ev).toString().toLowerCase()
      const baseWordRaw = evName.replace(/^[^']+'\s*/i, '').replace(/\s*\([^)]*\)/i, '').trim()
      return knownEventTags.find(t => baseWordRaw.includes(t)) || baseWordRaw
   }))]
 
   const { rows } = await pool.query(`SELECT id, file_url as url, tags FROM photo_library`)
   
   const scored = rows.map(photo => {
      let score = 0
      const pTags = Array.isArray(photo.tags) ? photo.tags.map(t => String(t).toLowerCase()) : []
      
      let maxEventScore = 0
      let hasEventMatch = false
 
      for (const ev of structuredEvents) {
         const evName = ev.name.toLowerCase()
         const baseWordRaw = evName.replace(/^[^']+'\s*/i, '').replace(/\s*\([^)]*\)/i, '').trim()
         const baseEventWord = knownEventTags.find(t => baseWordRaw.includes(t)) || baseWordRaw
         
         if (!pTags.includes(baseEventWord)) continue
         hasEventMatch = true
         let currentEventScore = 10
 
         // Location context for event (e.g., Pre Wedding in Agra)
         const evLoc = ev.location.toLowerCase().trim()
         if (evLoc && evLoc !== 'local' && pTags.some(t => t.includes(evLoc))) {
            currentEventScore += 15 // MASSIVE EXACT LOCATION+EVENT MATCH
         }
 
         // Time of day logic
         const slot = ev.slot.toLowerCase()
         if (slot.includes('morning') || slot.includes('day')) {
            if (pTags.some(t => dayTimeTags.includes(t))) currentEventScore += 5
            if (pTags.some(t => nightTimeTags.includes(t))) currentEventScore -= 15
         } else if (slot.includes('evening') || slot.includes('night')) {
            if (pTags.some(t => nightTimeTags.includes(t))) currentEventScore += 5
         }
 
         if (currentEventScore > maxEventScore) maxEventScore = currentEventScore
      }
 
      score += maxEventScore

      // Explicit Event Exclusion: Penalize heavily if the photo belongs to an event NOT requested.
      const photoKnownEvents = pTags.filter(t => knownEventTags.includes(t))
      if (photoKnownEvents.length > 0) {
          const matchesRequested = photoKnownEvents.some(t => targetEventWords.includes(t))
          if (!matchesRequested) {
              score -= 9999
          }
      }
 
      // Baseline Location Matches (General)
      if (isDestination && pTags.some(t => t.includes('destination') || t.includes('palace') || t.includes('resort'))) score += 4
      if (!isDestination && pTags.some(t => t.includes('local') || t.includes('home'))) score += 3
      if (cleanLoc && cleanLoc !== 'local' && pTags.some(t => t.includes(cleanLoc))) {
          score += hasEventMatch ? 5 : 10 // highly reward exact city if it's a general shot without event tags
      }
 
      // Styling tags
      for(const t of pTags) {
         if(notesText.includes(t) && t.length > 3 && !knownEventTags.includes(t)) score += 3
      }
      if (notesText.includes('colour') && pTags.includes('color')) score += 3
      if (notesText.includes('color') && pTags.includes('colour')) score += 3
      
      // Base Subjects
      const coreSubjects = ['bride', 'groom', 'couple', 'portrait', 'family', 'details']
      if (pTags.some(t => coreSubjects.includes(t))) score += 2
 
      // Scope validation
      if (isBrideOnly && pTags.includes('groom') && !pTags.includes('bride')) score -= 20
      if (isGroomOnly && pTags.includes('bride') && !pTags.includes('groom')) score -= 20
      
      // Minor padding so equal photos have different scores
      score += Math.random() * 0.5
      
      return { ...photo, score, pTags }
   })
  
  scored.sort((a,b) => b.score - a.score)
  
  // Filter out negative-scoring (wrong event) photos and excluded URLs
  const eligiblePool = scored.filter(p => p.score > -100 && !excludeUrls.includes(p.url))

  // === EVENT-FIRST ALLOCATION ENGINE ===
  // Allocate slots per event, then pick best-scoring photos within each event with subject diversity
  const portraitTags = ['portrait', 'couple', 'bride', 'groom']
  const candidTags = ['candid', 'family', 'guests', 'dance', 'mom', 'dad', 'friends']
  const detailTags = ['decor', 'details', 'ritual', 'ring', 'shoes', 'lehenga', 'flowers', 'venue']

  const hasWeddingEvent = targetEventWords.includes('wedding')
  const numEvents = targetEventWords.length

  // Calculate slots per event: wedding gets +2 extra if present
  const eventSlots = {}
  if (numEvents > 0) {
     const weddingBonus = hasWeddingEvent ? 2 : 0
     const remaining = requiredCount - weddingBonus
     const basePerEvent = Math.floor(remaining / numEvents)
     let leftover = remaining - (basePerEvent * numEvents)
     for (const ew of targetEventWords) {
        eventSlots[ew] = basePerEvent + (ew === 'wedding' ? weddingBonus : 0)
        if (leftover > 0) { eventSlots[ew]++; leftover-- }
     }
  }

  let finalSelection = []
  const usedUrls = new Set()

  // For each event, pick photos with subject diversity
  for (const eventWord of targetEventWords) {
     const slots = eventSlots[eventWord] || 0
     if (slots === 0) continue

     // Get all eligible photos for this event, sorted by score
     const eventPhotos = eligiblePool.filter(p => p.pTags.includes(eventWord) && !usedUrls.has(p.url))

     // Mini-category targets within this event
     const pTarget = Math.max(1, Math.round(slots * 0.30))  // ~30% portraits
     const cTarget = Math.max(1, Math.round(slots * 0.30))  // ~30% candid/family
     const dTarget = Math.max(1, Math.round(slots * 0.15))  // ~15% detail/ritual
     const bestTarget = Math.max(0, slots - pTarget - cTarget - dTarget) // ~25% best remaining

     const picked = []
     const pickUsed = new Set()

     // Fill portraits for this event
     const pCandidates = eventPhotos.filter(p => p.pTags.some(t => portraitTags.includes(t)))
     for (const p of pCandidates) {
        if (picked.filter(x => x._cat === 'portrait').length >= pTarget) break
        if (!pickUsed.has(p.url)) { picked.push({ ...p, _cat: 'portrait' }); pickUsed.add(p.url) }
     }

     // Fill candids for this event
     const cCandidates = eventPhotos.filter(p => p.pTags.some(t => candidTags.includes(t)))
     for (const p of cCandidates) {
        if (picked.filter(x => x._cat === 'candid').length >= cTarget) break
        if (!pickUsed.has(p.url)) { picked.push({ ...p, _cat: 'candid' }); pickUsed.add(p.url) }
     }

     // Fill details for this event
     const dCandidates = eventPhotos.filter(p => p.pTags.some(t => detailTags.includes(t)))
     for (const p of dCandidates) {
        if (picked.filter(x => x._cat === 'detail').length >= dTarget) break
        if (!pickUsed.has(p.url)) { picked.push({ ...p, _cat: 'detail' }); pickUsed.add(p.url) }
     }

     // Fill best remaining (highest score, any subject)
     for (const p of eventPhotos) {
        if (picked.length >= slots) break
        if (!pickUsed.has(p.url)) { picked.push({ ...p, _cat: 'best' }); pickUsed.add(p.url) }
     }

     // Sort within event by score
     picked.sort((a, b) => b.score - a.score)
     picked.forEach(p => usedUrls.add(p.url))
     finalSelection.push(...picked)
  }

  // If still short (e.g. generic photos with no event tag), fill from top of eligible pool
  if (finalSelection.length < requiredCount) {
     const filler = eligiblePool.filter(p => !usedUrls.has(p.url))
     for (const p of filler) {
        if (finalSelection.length >= requiredCount) break
        finalSelection.push(p)
        usedUrls.add(p.url)
     }
  }

  const formatted = finalSelection.map(p => ({ url: p.url, score: Math.round(p.score * 10) / 10, tags: p.pTags }))
  reply.send(formatted)
})

fastify.post('/api/photos/auto-curate-portraits', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return

  const {
    structuredEvents: rawStructured = [],
    leadEvents: rawLeadEvents,
    location = '',
    isDestination = false,
    excludeUrls = [],      // moodboard URLs + previously picked portraits
    notesContext = '',
    hasWedding = false,
    existingPortraitCount = 0, // portraits already in moodboard
    coverageScope = 'Both Sides'
  } = req.body || {}

  // Accept both formats
  let structuredEvents = rawStructured
  if ((!structuredEvents || structuredEvents.length === 0) && Array.isArray(rawLeadEvents) && rawLeadEvents.length > 0) {
     structuredEvents = rawLeadEvents.map(name => ({ name: String(name), slot: '', location: '' }))
  }

  const scopeText = String(coverageScope || '').toLowerCase()
  const isBrideOnly = scopeText.includes('bride') && !scopeText.includes('both')
  const isGroomOnly = scopeText.includes('groom') && !scopeText.includes('both')

  const TARGET_TOTAL_PORTRAITS = 8
  const requiredCount = Math.max(4, Math.min(6, TARGET_TOTAL_PORTRAITS - existingPortraitCount))

  const cleanLoc = String(location || '').toLowerCase().trim()
  const notesText = String(notesContext || '').toLowerCase()

  const knownEventTags = ['haldi', 'mehendi', 'wedding', 'sangeet', 'reception', 'engagement', 'pre wedding']
  const dayTimeTags = ['day', 'morning', 'daylight', 'outdoor', 'sunlight', 'sunset']
  const nightTimeTags = ['evening', 'night', 'dusk', 'golden hour']
  const portraitSubjects = ['portrait', 'bride', 'groom', 'couple']

  const targetEventWords = [...new Set(structuredEvents.map(ev => {
     const evName = ev.name.toLowerCase()
     const baseWordRaw = evName.replace(/^[^']+'\s*/i, '').replace(/\s*\([^)]*\)/i, '').trim()
     return knownEventTags.find(t => baseWordRaw.includes(t)) || baseWordRaw
  }))]

  const { rows } = await pool.query(`SELECT id, file_url as url, tags FROM photo_library`)

  // Only consider photos that have at least one portrait subject tag
  const portraitPool = rows.filter(photo => {
    const pTags = Array.isArray(photo.tags) ? photo.tags.map(t => String(t).toLowerCase()) : []
    return pTags.some(t => portraitSubjects.includes(t))
  })

  // Match logic for portraits
  const scored = portraitPool.map(photo => {
    let score = 0
    const pTags = Array.isArray(photo.tags) ? photo.tags.map(t => String(t).toLowerCase()) : []

    // Portrait subject bonus (primary scoring differentiator)
    if (pTags.includes('couple')) score += 4
    if (pTags.includes('bride')) score += 3
    if (pTags.includes('groom')) score += 3
    if (pTags.includes('portrait')) score += 4

    let maxEventScore = 0
    let hasEventMatch = false

    for (const ev of structuredEvents) {
       const evName = ev.name.toLowerCase()
       const baseWordRaw = evName.replace(/^[^']+'\s*/i, '').replace(/\s*\([^)]*\)/i, '').trim()
       const baseEventWord = knownEventTags.find(t => baseWordRaw.includes(t)) || baseWordRaw
       
       if (!pTags.includes(baseEventWord)) continue
       hasEventMatch = true
       let currentEventScore = 10

       // Location context for event (e.g., Pre Wedding in Agra)
       const evLoc = ev.location.toLowerCase().trim()
       if (evLoc && evLoc !== 'local' && pTags.some(t => t.includes(evLoc))) {
          currentEventScore += 15
       }

       // Time of day logic
       const slot = ev.slot.toLowerCase()
       if (slot.includes('morning') || slot.includes('day')) {
          if (pTags.some(t => dayTimeTags.includes(t))) currentEventScore += 5
          if (pTags.some(t => nightTimeTags.includes(t))) currentEventScore -= 15
       } else if (slot.includes('evening') || slot.includes('night')) {
          if (pTags.some(t => nightTimeTags.includes(t))) currentEventScore += 5
       }

       if (currentEventScore > maxEventScore) maxEventScore = currentEventScore
    }
    score += maxEventScore

    // Explicit Event Exclusion: Penalize heavily if the photo belongs to an event NOT requested.
    const photoKnownEvents = pTags.filter(t => knownEventTags.includes(t))
    if (photoKnownEvents.length > 0) {
        const matchesRequested = photoKnownEvents.some(t => targetEventWords.includes(t))
        if (!matchesRequested) {
            score -= 9999
        }
    }

    // Location match
    if (isDestination && pTags.some(t => t.includes('destination') || t.includes('palace') || t.includes('resort'))) score += 4
    if (!isDestination && pTags.some(t => t.includes('local') || t.includes('home'))) score += 3
    if (cleanLoc && cleanLoc !== 'local' && pTags.some(t => t.includes(cleanLoc))) {
       score += hasEventMatch ? 5 : 10
    }

    // Notes match
    for (const t of pTags) {
      if (notesText.includes(t) && t.length > 3 && !knownEventTags.includes(t)) {
         score += 3
      }
    }
    
    // Scope validation
    if (isBrideOnly && pTags.includes('groom') && !pTags.includes('bride')) score -= 20
    if (isGroomOnly && pTags.includes('bride') && !pTags.includes('groom')) score -= 20

    // Organic variety salt
    score += Math.random() * 0.5

    return { ...photo, score, pTags }
  })

  scored.sort((a, b) => b.score - a.score)

  // Remove already-used photos (moodboard + previously picked portraits) and unrequested event junk
  let pool_ = scored.filter(p => p.score > -100 && !excludeUrls.includes(p.url))

  // Score-first selection, no random shuffle
  const topPool = pool_.slice(0, 30)

  // Hard guarantee: if lead has wedding event, slot 1 must be a wedding portrait
  const weddingPortraits = topPool.filter(p =>
    p.pTags.includes('wedding') && p.pTags.some(t => portraitSubjects.includes(t))
  )

  let finalSelection = []

  if (hasWedding && weddingPortraits.length > 0) {
    const guaranteed = weddingPortraits[0]
    finalSelection.push(guaranteed)
    const remaining = topPool.filter(p => p.url !== guaranteed.url)
    finalSelection = [...finalSelection, ...remaining.slice(0, requiredCount - 1)]
  } else {
    finalSelection = topPool.slice(0, requiredCount)
  }

  // If still short, pull from full pool
  if (finalSelection.length < requiredCount) {
    const used = new Set(finalSelection.map(p => p.url))
    const extras = pool_.filter(p => !used.has(p.url))
    finalSelection = [...finalSelection, ...extras.slice(0, requiredCount - finalSelection.length)]
  }

  // Final sort by score for display
  finalSelection.sort((a, b) => b.score - a.score)

  const formatted = finalSelection.map(p => ({ url: p.url, score: Math.round(p.score * 10) / 10, tags: p.pTags }))
  reply.send(formatted)
})


fastify.get('/api/photos/file/:filename', async (req, reply) => {
  const filename = path.basename(req.params.filename || '')
  if (!filename) return reply.code(404).send({ error: 'Not found' })
  const filePath = path.join(PHOTO_UPLOAD_DIR, filename)
  try {
    await fs.promises.stat(filePath)
  } catch (err) {
    return reply.code(404).send({ error: 'Not found' })
  }
  reply.type(getImageContentType(filename))
  return reply.send(fs.createReadStream(filePath))
})

fastify.post('/api/photos', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  ensureDirectory(PHOTO_UPLOAD_DIR)
  const { dataUrl, filename: originalName, tags, contentHash } = req.body || {}
  if (!dataUrl || typeof dataUrl !== 'string') {
    return reply.code(400).send({ error: 'File data is required.' })
  }
  if (!contentHash) {
    return reply.code(400).send({ error: 'Content hash is required for deduplication.' })
  }
  const match = dataUrl.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/)
  if (!match) {
    return reply.code(400).send({ error: 'Invalid file data.' })
  }
  const [, mimeType, base64Data] = match
  const extFromMime = mimeType === 'image/jpeg' ? '.jpg'
    : mimeType === 'image/png' ? '.png'
      : mimeType === 'image/webp' ? '.webp'
        : mimeType === 'image/gif' ? '.gif'
          : ''
  const ext = path.extname(originalName || '').toLowerCase()
  const safeExt = extFromMime || (ext && ext.length <= 8 ? ext : '')
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`
  const filePath = path.join(PHOTO_UPLOAD_DIR, filename)

  try {
    const buffer = Buffer.from(base64Data, 'base64')
    
    // Hash the file to prevent duplicates using the strictly deterministic original file hash provided by frontend
    const { rows: existing } = await pool.query(`SELECT id FROM photo_library WHERE content_hash = $1`, [contentHash])
    if (existing.length > 0) {
      return reply.code(409).send({ error: 'This photo already exists in the library.', duplicateId: existing[0].id })
    }

    await fs.promises.writeFile(filePath, buffer)
    
    const fileUrl = `/api/photos/file/${filename}`
    const cleanTags = sanitizeTags(tags)

    const { rows } = await pool.query(
      `INSERT INTO photo_library (file_name, file_url, tags, content_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, file_url as url, tags, content_hash, created_at`,
      [filename, fileUrl, cleanTags, contentHash]
    )

    reply.send(rows[0])
  } catch (err) {
    console.warn('Photo upload failed:', err?.message || err)
    return reply.code(500).send({ error: 'Failed to upload photo.' })
  }
})

fastify.patch('/api/photos/:id', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { id } = req.params
  const tags = sanitizeTags(req.body?.tags)
  const { rows } = await pool.query(
    `UPDATE photo_library
     SET tags = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, file_url as url, tags, created_at`,
    [tags, id]
  )
  if (!rows.length) {
    return reply.code(404).send({ error: 'Photo not found.' })
  }
  reply.send(rows[0])
})

fastify.delete('/api/photos/:id', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { id } = req.params
  const { rows } = await pool.query(
    `SELECT file_name FROM photo_library WHERE id = $1`,
    [id]
  )
  if (!rows.length) {
    return reply.code(404).send({ error: 'Photo not found.' })
  }
  await pool.query(`DELETE FROM photo_library WHERE id = $1`, [id])
  const filePath = path.join(PHOTO_UPLOAD_DIR, rows[0].file_name)
  fs.promises.unlink(filePath).catch(() => null)
  reply.send({ success: true })
})



}
