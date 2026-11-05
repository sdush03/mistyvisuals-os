const path = require('path')
const fs = require('fs')
const {
  isR2Enabled,
  getQuestionnaireUploadPresignedUrl,
  deleteAsset,
  deletePrivateSelfie
} = require('../utils/r2')
const { PHOTO_UPLOAD_DIR } = require('../config/constants')

// Limits for digital wedding invitations uploaded by the couple
const INVITATION_MAX_COUNT = 10
const INVITATION_SIZE_LIMITS = {
  video: 100 * 1024 * 1024, // 100 MB
  pdf: 30 * 1024 * 1024,    // 30 MB
  image: 25 * 1024 * 1024   // 25 MB
}

// Rate limit helper: max 30 presigned upload requests in 10 minutes per project
const uploadUrlAttempts = new Map()
function checkRateLimit(projectId, limit = 30) {
  const now = Date.now()
  const windowMs = 10 * 60 * 1000
  const history = uploadUrlAttempts.get(projectId) || []
  const recent = history.filter(ts => now - ts < windowMs)
  if (recent.length >= limit) return false
  recent.push(now)
  uploadUrlAttempts.set(projectId, recent)
  return true
}

let tablesChecked = false
async function ensureTables(pool, log) {
  if (tablesChecked) return
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_questionnaires (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
        has_opened BOOLEAN NOT NULL DEFAULT FALSE,
        current_step INT NOT NULL DEFAULT 1,
        story JSONB NOT NULL DEFAULT '{}'::jsonb,
        traditions JSONB NOT NULL DEFAULT '{}'::jsonb,
        photo_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
        video_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
        special_considerations JSONB NOT NULL DEFAULT '{}'::jsonb,
        final_touches JSONB NOT NULL DEFAULT '{}'::jsonb,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_project_questionnaires_project_id UNIQUE (project_id)
      );
      CREATE INDEX IF NOT EXISTS idx_project_questionnaires_project_id ON project_questionnaires(project_id);
      CREATE INDEX IF NOT EXISTS idx_project_questionnaires_status ON project_questionnaires(status);

      CREATE TABLE IF NOT EXISTS questionnaire_family_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        side VARCHAR(10) NOT NULL CHECK (side IN ('bride', 'groom')),
        name VARCHAR(255) NOT NULL,
        relationship VARCHAR(100) NOT NULL,
        custom_relationship VARCHAR(100),
        priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
        notes TEXT,
        order_index INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_questionnaire_family_groups_project_id ON questionnaire_family_groups(project_id);
      CREATE INDEX IF NOT EXISTS idx_questionnaire_family_groups_side ON questionnaire_family_groups(project_id, side);

      CREATE TABLE IF NOT EXISTS questionnaire_family_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        family_group_id UUID REFERENCES questionnaire_family_groups(id) ON DELETE CASCADE,
        role_in_family VARCHAR(50),
        side VARCHAR(10) NOT NULL CHECK (side IN ('bride', 'groom')),
        name VARCHAR(255) NOT NULL,
        relationship VARCHAR(100) NOT NULL,
        custom_relationship VARCHAR(100),
        category VARCHAR(50) NOT NULL CHECK (category IN ('parents', 'siblings', 'grandparents', 'extended', 'friends', 'other')),
        priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
        is_remembering BOOLEAN NOT NULL DEFAULT FALSE,
        notes TEXT,
        parent_member_id UUID REFERENCES questionnaire_family_members(id) ON DELETE SET NULL,
        photo_url VARCHAR(1024),
        storage_key VARCHAR(1024),
        original_photo_url VARCHAR(1024),
        original_storage_key VARCHAR(1024),
        crop_data JSONB,
        order_index INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE questionnaire_family_members ADD COLUMN IF NOT EXISTS family_group_id UUID REFERENCES questionnaire_family_groups(id) ON DELETE CASCADE;
      ALTER TABLE questionnaire_family_members ADD COLUMN IF NOT EXISTS role_in_family VARCHAR(50);
      CREATE INDEX IF NOT EXISTS idx_questionnaire_family_project_id ON questionnaire_family_members(project_id);
      CREATE INDEX IF NOT EXISTS idx_questionnaire_family_side ON questionnaire_family_members(project_id, side);
      CREATE INDEX IF NOT EXISTS idx_questionnaire_family_parent ON questionnaire_family_members(parent_member_id);
      CREATE INDEX IF NOT EXISTS idx_questionnaire_family_group_id ON questionnaire_family_members(family_group_id);

      CREATE TABLE IF NOT EXISTS questionnaire_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        project_event_id UUID NOT NULL REFERENCES project_events(id) ON DELETE CASCADE,
        schedule_text TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_questionnaire_schedules_event UNIQUE (project_id, project_event_id)
      );
      CREATE INDEX IF NOT EXISTS idx_questionnaire_schedules_project_id ON questionnaire_schedules(project_id);
      CREATE INDEX IF NOT EXISTS idx_questionnaire_schedules_event_id ON questionnaire_schedules(project_event_id);

      CREATE TABLE IF NOT EXISTS questionnaire_invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        file_url VARCHAR(1024) NOT NULL,
        storage_key VARCHAR(1024) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('pdf', 'image', 'video')),
        file_size INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_questionnaire_invitations_project_id ON questionnaire_invitations(project_id);

      CREATE TABLE IF NOT EXISTS questionnaire_music_references (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        url VARCHAR(1024) NOT NULL,
        reference_type VARCHAR(50) NOT NULL CHECK (reference_type IN ('exact_song', 'inspiration')),
        deliverable_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        deliverable_names JSONB NOT NULL DEFAULT '[]'::jsonb,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_questionnaire_music_project_id ON questionnaire_music_references(project_id);

      CREATE TABLE IF NOT EXISTS questionnaire_media_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        section VARCHAR(50) NOT NULL,
        file_url VARCHAR(1024) NOT NULL,
        storage_key VARCHAR(1024) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INT,
        reference_count INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_questionnaire_media_project_id ON questionnaire_media_assets(project_id);
      CREATE INDEX IF NOT EXISTS idx_questionnaire_media_storage_key ON questionnaire_media_assets(storage_key);
    `)
    tablesChecked = true
  } catch (err) {
    if (log) log.warn('ensureTables warning: ' + err.message)
  }
}

module.exports = async function(api, opts) {
  const { pool, getAuthFromRequest, requireAuth } = opts

  // Authentication helper for Client Portal or Admin session
  async function checkPortalOrAdminAuth(req, reply, slug) {
    await ensureTables(pool, req.log)

    const r = await pool.query(
      'SELECT id, name, slug, lead_id, passcode FROM projects WHERE LOWER(slug) = LOWER($1) OR id::text = $1',
      [slug]
    )
    if (r.rows.length === 0) {
      reply.code(404).send({ error: 'Portal not found' })
      return null
    }
    const project = r.rows[0]

    // 1. Client session check (cookie)
    const clientCookie = req.cookies?.mv_client_auth
    if (clientCookie) {
      try {
        const decoded = req.server.jwt.verify(clientCookie)
        if (decoded && decoded.projectId === project.id) {
          return { project, isAdmin: false }
        }
      } catch (err) {}
    }

    // 2. Admin / Studio team check
    if (typeof getAuthFromRequest === 'function') {
      const adminAuth = getAuthFromRequest(req)
      if (adminAuth) {
        return { project, isAdmin: true }
      }
    }

    reply.code(401).send({ error: 'Unauthorized. Please enter your portal passcode.' })
    return null
  }

  // Helper to compute Family Tree statistics and validate mandatory requirements
  function computeFamilyStats(familyRows) {
    const bride = {
      total: 0,
      with_photo: 0,
      high_priority: 0,
      medium_priority: 0,
      low_priority: 0,
      remembering_count: 0,
      has_father: false,
      has_mother: false,
      father_has_photo: false,
      mother_has_photo: false,
      missing_requirements: []
    }

    const groom = {
      total: 0,
      with_photo: 0,
      high_priority: 0,
      medium_priority: 0,
      low_priority: 0,
      remembering_count: 0,
      has_father: false,
      has_mother: false,
      father_has_photo: false,
      mother_has_photo: false,
      missing_requirements: []
    }

    for (const m of familyRows) {
      const target = m.side === 'bride' ? bride : groom
      target.total += 1
      const hasPhoto = Boolean(m.photo_url || m.storage_key || m.original_photo_url)
      if (hasPhoto) target.with_photo += 1
      if (m.is_remembering) target.remembering_count += 1

      if (m.priority === 'high') target.high_priority += 1
      else if (m.priority === 'low') target.low_priority += 1
      else target.medium_priority += 1

      const relLower = (m.relationship || '').toLowerCase().trim()
      const isFather = relLower === 'father' || relLower === 'dad'
      const isMother = relLower === 'mother' || relLower === 'mom'

      const hasValidName = Boolean(m.name && m.name.trim())

      if (isFather && hasValidName) {
        target.has_father = true
        if (hasPhoto || m.is_remembering) {
          target.father_has_photo = true
        }
      }
      if (isMother && hasValidName) {
        target.has_mother = true
        if (hasPhoto || m.is_remembering) {
          target.mother_has_photo = true
        }
      }
    }

    // Check mandatory parents
    if (!bride.has_father) bride.missing_requirements.push("Bride's Father entry is required")
    else if (!bride.father_has_photo) bride.missing_requirements.push("Bride's Father photograph is required (unless marked remembering someone)")

    if (!bride.has_mother) bride.missing_requirements.push("Bride's Mother entry is required")
    else if (!bride.mother_has_photo) bride.missing_requirements.push("Bride's Mother photograph is required (unless marked remembering someone)")

    if (!groom.has_father) groom.missing_requirements.push("Groom's Father entry is required")
    else if (!groom.father_has_photo) groom.missing_requirements.push("Groom's Father photograph is required (unless marked remembering someone)")

    if (!groom.has_mother) groom.missing_requirements.push("Groom's Mother entry is required")
    else if (!groom.mother_has_photo) groom.missing_requirements.push("Groom's Mother photograph is required (unless marked remembering someone)")

    return {
      bride,
      groom,
      allRequirementsMet: bride.missing_requirements.length === 0 && groom.missing_requirements.length === 0
    }
  }

  /* ==========================================================================
     CLIENT PORTAL QUESTIONNAIRE ENDPOINTS
     ========================================================================== */

  // 1. GET /client-portal/:slug/questionnaire
  // Loads complete questionnaire, family tree, dynamic project events, and deliverables
  api.get('/client-portal/:slug/questionnaire', async (req, reply) => {
    try {
      const { slug } = req.params
      const auth = await checkPortalOrAdminAuth(req, reply, slug)
      if (!auth) return
      const { project } = auth

      // Ensure questionnaire row exists and mark has_opened = true
      const qUpsert = await pool.query(
        `INSERT INTO project_questionnaires (project_id, has_opened, updated_at)
         VALUES ($1, true, NOW())
         ON CONFLICT (project_id)
         DO UPDATE SET has_opened = true, updated_at = NOW()
         RETURNING *`,
        [project.id]
      )
      const questionnaire = qUpsert.rows[0]

      // Fetch Family Members
      const familyRes = await pool.query(
        `SELECT * FROM questionnaire_family_members
         WHERE project_id = $1
         ORDER BY order_index ASC, created_at ASC`,
        [project.id]
      )
      const familyMembers = familyRes.rows

      // Fetch Family Groups (Relatives)
      const familyGroupsRes = await pool.query(
        `SELECT * FROM questionnaire_family_groups
         WHERE project_id = $1
         ORDER BY order_index ASC, created_at ASC`,
        [project.id]
      )
      const familyGroups = familyGroupsRes.rows

      // Fetch dynamic project events & saved schedule text
      const eventsRes = await pool.query(
        `SELECT pe.id, pe.event_type, pe.event_date, pe.start_time, pe.end_time, pe.venue, pe.slot,
                COALESCE(qs.schedule_text, '') AS schedule_text, qs.updated_at AS schedule_updated_at
         FROM project_events pe
         LEFT JOIN questionnaire_schedules qs ON qs.project_event_id = pe.id AND qs.project_id = $1
         WHERE pe.project_id = $1
         ORDER BY pe.event_date ASC, pe.created_at ASC`,
        [project.id]
      )

      // Fetch dynamic video deliverables
      const delivRes = await pool.query(
        `SELECT id, title, type, quantity, status, notes
         FROM project_deliverables
         WHERE project_id = $1
         ORDER BY created_at ASC`,
        [project.id]
      )

      // Fetch uploaded invitations
      const invRes = await pool.query(
        `SELECT id, file_url, storage_key, filename, file_type, file_size, created_at
         FROM questionnaire_invitations
         WHERE project_id = $1
         ORDER BY created_at ASC`,
        [project.id]
      )

      // Fetch music references
      const musicRes = await pool.query(
        `SELECT id, url, reference_type, deliverable_ids, deliverable_names, notes, created_at
         FROM questionnaire_music_references
         WHERE project_id = $1
         ORDER BY created_at ASC`,
        [project.id]
      )

      const stats = computeFamilyStats(familyMembers)

      // Fetch gallery for this project (if created, dynamically links full access)
      let gallery = null
      try {
        const galleryRes = await pool.query(
          `SELECT ge.id, ge.slug, ge.title, ge.cover_photo_url, ge.active,
                  ge.full_code, ge.partial_code
           FROM gallery_events ge
           WHERE (ge.project_id = $1 OR ge.slug = $2 OR (ge.lead_id IS NOT NULL AND ge.lead_id = $3))
             AND ge.active = true
           ORDER BY ge.created_at ASC
           LIMIT 1`,
          [String(project.id), slug, project.lead_id || null]
        )
        if (galleryRes.rows.length > 0) {
          const gRow = galleryRes.rows[0]
          gallery = {
            exists: true,
            id: gRow.id,
            slug: gRow.slug,
            title: gRow.title,
            coverPhotoUrl: gRow.cover_photo_url || null,
            passcode: gRow.full_code || project.passcode || null,
            partialPasscode: gRow.partial_code || null
          }
        } else {
          gallery = {
            exists: false,
            slug: project.slug || slug,
            passcode: project.passcode || null
          }
        }
      } catch (gErr) {
        req.log.warn('Could not query gallery for questionnaire: ' + gErr.message)
      }

      // Fetch Bride & Groom profiles
      let couple = {
        bride: { name: 'Bride', photo_url: null },
        groom: { name: 'Groom', photo_url: null }
      }
      try {
        const leadRes = await pool.query(
          `SELECT bride_name, groom_name FROM leads WHERE id = $1`,
          [project.lead_id]
        )
        if (leadRes.rows.length > 0) {
          if (leadRes.rows[0].bride_name) couple.bride.name = leadRes.rows[0].bride_name
          if (leadRes.rows[0].groom_name) couple.groom.name = leadRes.rows[0].groom_name
        }
        const onbRes = await pool.query(
          `SELECT role, name, storage_key, selfie_url, updated_at FROM client_onboarding_profiles WHERE project_id = $1`,
          [project.id]
        )
        for (const row of onbRes.rows) {
          const timeBuster = row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
          const selfieEndpoint = (row.storage_key || row.selfie_url)
            ? `/api/client-portal/${slug}/selfie/${row.role}?t=${timeBuster}`
            : null
          if (row.role === 'bride') {
            if (row.name) couple.bride.name = row.name
            if (selfieEndpoint) couple.bride.photo_url = selfieEndpoint
          } else if (row.role === 'groom') {
            if (row.name) couple.groom.name = row.name
            if (selfieEndpoint) couple.groom.photo_url = selfieEndpoint
          }
        }
      } catch (cErr) {
        req.log.warn('Could not query couple info: ' + cErr.message)
      }

      return {
        success: true,
        questionnaire,
        familyMembers,
        familyGroups,
        events: eventsRes.rows,
        deliverables: delivRes.rows,
        invitations: invRes.rows,
        musicReferences: musicRes.rows,
        stats,
        gallery,
        couple
      }
    } catch (err) {
      req.log.error('Error loading questionnaire:', err)
      return reply.code(500).send({ error: 'Failed to load questionnaire: ' + err.message })
    }
  })

  // 1b. GET /client-portal/:slug/gallery-redirect
  // Dynamic smart redirection: If gallery exists -> redirects to full access gallery URL
  // If no gallery exists -> redirects to App Store / Google Play
  api.get('/client-portal/:slug/gallery-redirect', async (req, reply) => {
    try {
      const { slug } = req.params
      const projRes = await pool.query(
        'SELECT id, slug, lead_id, passcode FROM projects WHERE LOWER(slug) = LOWER($1) OR id::text = $1',
        [slug]
      )
      if (projRes.rows.length === 0) {
        return reply.code(404).send({ error: 'Portal not found' })
      }
      const project = projRes.rows[0]
      const galleryRes = await pool.query(
        `SELECT ge.slug, ge.full_code
         FROM gallery_events ge
         WHERE (ge.project_id = $1 OR ge.slug = $2 OR (ge.lead_id IS NOT NULL AND ge.lead_id = $3))
           AND ge.active = true
         ORDER BY ge.created_at ASC
         LIMIT 1`,
        [String(project.id), slug, project.lead_id || null]
      )

      if (galleryRes.rows.length > 0) {
        const g = galleryRes.rows[0]
        const code = g.full_code || project.passcode || ''
        const codeQuery = code ? `?code=${encodeURIComponent(code)}` : ''
        const host = req.headers['host'] || ''
        let domain = 'https://mycircle.mistyvisuals.com'
        if (host.includes('localhost') || host.includes('127.0.0.1')) {
          domain = `${req.protocol}://${host}`
        }
        return reply.redirect(`${domain}/${g.slug}/gallery${codeQuery}`)
      }

      const ua = req.headers['user-agent'] || ''
      if (/android/i.test(ua)) {
        return reply.redirect('https://play.google.com/store/apps/details?id=com.mistyvisuals.mycircle')
      }
      if (/iphone|ipad|ipod/i.test(ua)) {
        return reply.redirect('https://apps.apple.com/app/id6796633077')
      }
      return reply.redirect('https://mycircle.mistyvisuals.com')
    } catch (err) {
      req.log.error('Error in gallery redirect: ' + err.message)
      return reply.redirect('https://mycircle.mistyvisuals.com')
    }
  })

  // 2. POST /client-portal/:slug/questionnaire/draft
  // Autosave or explicit Save Draft for any or all sections
  api.post('/client-portal/:slug/questionnaire/draft', async (req, reply) => {
    const { slug } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    const {
      current_step,
      story,
      traditions,
      photo_preferences,
      video_preferences,
      special_considerations,
      final_touches
    } = req.body || {}

    const qRes = await pool.query(
      `INSERT INTO project_questionnaires (
         project_id, status, has_opened, current_step,
         story, traditions, photo_preferences, video_preferences, special_considerations, final_touches,
         updated_at
       ) VALUES (
         $1, 'in_progress', true, COALESCE($2, 1),
         COALESCE($3, '{}'::jsonb), COALESCE($4, '{}'::jsonb),
         COALESCE($5, '{}'::jsonb), COALESCE($6, '{}'::jsonb),
         COALESCE($7, '{}'::jsonb), COALESCE($8, '{}'::jsonb),
         NOW()
       )
       ON CONFLICT (project_id)
       DO UPDATE SET
         status = CASE WHEN project_questionnaires.status = 'completed' THEN 'completed' ELSE 'in_progress' END,
         has_opened = true,
         current_step = COALESCE($2, project_questionnaires.current_step),
         story = CASE WHEN $3::jsonb IS NOT NULL THEN $3::jsonb ELSE project_questionnaires.story END,
         traditions = CASE WHEN $4::jsonb IS NOT NULL THEN $4::jsonb ELSE project_questionnaires.traditions END,
         photo_preferences = CASE WHEN $5::jsonb IS NOT NULL THEN $5::jsonb ELSE project_questionnaires.photo_preferences END,
         video_preferences = CASE WHEN $6::jsonb IS NOT NULL THEN $6::jsonb ELSE project_questionnaires.video_preferences END,
         special_considerations = CASE WHEN $7::jsonb IS NOT NULL THEN $7::jsonb ELSE project_questionnaires.special_considerations END,
         final_touches = CASE WHEN $8::jsonb IS NOT NULL THEN $8::jsonb ELSE project_questionnaires.final_touches END,
         updated_at = NOW()
       RETURNING id, status, current_step, updated_at`,
      [
        project.id,
        current_step || null,
        story ? JSON.stringify(story) : null,
        traditions ? JSON.stringify(traditions) : null,
        photo_preferences ? JSON.stringify(photo_preferences) : null,
        video_preferences ? JSON.stringify(video_preferences) : null,
        special_considerations ? JSON.stringify(special_considerations) : null,
        final_touches ? JSON.stringify(final_touches) : null
      ]
    )

    return {
      success: true,
      questionnaire: qRes.rows[0],
      data: qRes.rows[0]
    }
  })

  // 3. POST /client-portal/:slug/questionnaire/submit
  // Validates mandatory parent requirements and marks questionnaire completed
  api.post('/client-portal/:slug/questionnaire/submit', async (req, reply) => {
    const { slug } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    // Check mandatory parent entries and photos
    const familyRes = await pool.query(
      `SELECT * FROM questionnaire_family_members WHERE project_id = $1`,
      [project.id]
    )
    const stats = computeFamilyStats(familyRes.rows)

    if (!stats.allRequirementsMet) {
      const allMissing = [...stats.bride.missing_requirements, ...stats.groom.missing_requirements]
      return reply.code(400).send({
        error: 'Mandatory parent profiles and photographs are required before completing the questionnaire.',
        missingRequirements: allMissing,
        stats
      })
    }

    const qRes = await pool.query(
      `UPDATE project_questionnaires
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE project_id = $1
       RETURNING *`,
      [project.id]
    )

    return {
      success: true,
      status: 'completed',
      questionnaire: qRes.rows[0],
      stats
    }
  })

  // 4. POST /client-portal/:slug/questionnaire/family
  // Adds an individual person to the Family Tree & Important People directory
  api.post('/client-portal/:slug/questionnaire/family', async (req, reply) => {
    const { slug } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    const {
      side,
      name,
      relationship,
      custom_relationship,
      category,
      priority,
      is_remembering,
      notes,
      parent_member_id,
      family_group_id,
      role_in_family,
      photo_url,
      storage_key,
      original_photo_url,
      original_storage_key,
      crop_data
    } = req.body || {}

    if (!name || typeof name !== 'string' || !name.trim()) {
      return reply.code(400).send({ error: 'Name is required' })
    }
    if (!side || !['bride', 'groom'].includes(side.toLowerCase())) {
      return reply.code(400).send({ error: 'Side must be either bride or groom' })
    }
    if (!relationship || typeof relationship !== 'string' || !relationship.trim()) {
      return reply.code(400).send({ error: 'Relationship is required' })
    }

    const cleanCategory = (category || 'other').toLowerCase()
    const validCategories = ['parents', 'siblings', 'grandparents', 'extended', 'friends', 'other']
    const safeCategory = validCategories.includes(cleanCategory) ? cleanCategory : 'other'

    // Smart default priorities:
    // Parents: High, Siblings: High, Grandparents: High
    // Close relatives (extended): Medium, Friends: Low
    let safePriority = (priority || '').toLowerCase()
    if (!['high', 'medium', 'low'].includes(safePriority)) {
      if (['parents', 'siblings', 'grandparents'].includes(safeCategory)) {
        safePriority = 'high'
      } else if (safeCategory === 'friends') {
        safePriority = 'low'
      } else {
        safePriority = 'medium'
      }
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const memberRes = await client.query(
        `INSERT INTO questionnaire_family_members (
           project_id, side, name, relationship, custom_relationship,
           category, priority, is_remembering, notes, parent_member_id,
           family_group_id, role_in_family,
           photo_url, storage_key, original_photo_url, original_storage_key,
           crop_data, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
         RETURNING *`,
        [
          project.id,
          side.toLowerCase(),
          name.trim(),
          relationship.trim(),
          custom_relationship ? custom_relationship.trim() : null,
          safeCategory,
          safePriority,
          Boolean(is_remembering),
          notes ? notes.trim() : null,
          parent_member_id || null,
          family_group_id || null,
          role_in_family || null,
          photo_url || null,
          storage_key || null,
          original_photo_url || null,
          original_storage_key || null,
          crop_data ? JSON.stringify(crop_data) : null
        ]
      )

      // Register or increment reference count for shared group photo
      if (original_storage_key) {
        await client.query(
          `INSERT INTO questionnaire_media_assets (
             project_id, section, file_url, storage_key, filename, mime_type, reference_count
           ) VALUES ($1, 'family_original', $2, $3, 'group_photo.jpg', 'image/jpeg', 1)
           ON CONFLICT DO NOTHING`,
          [project.id, original_photo_url || '', original_storage_key]
        )
      }

      await client.query('COMMIT')
      return { success: true, member: memberRes.rows[0] }
    } catch (err) {
      await client.query('ROLLBACK')
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to add family member' })
    } finally {
      client.release()
    }
  })

  // 5. PATCH /client-portal/:slug/questionnaire/family/:memberId
  // Updates a family member's details, priority, photograph, crop, or remembering status
  api.patch('/client-portal/:slug/questionnaire/family/:memberId', async (req, reply) => {
    const { slug, memberId } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    const {
      name,
      relationship,
      custom_relationship,
      category,
      priority,
      is_remembering,
      notes,
      parent_member_id,
      family_group_id,
      role_in_family,
      photo_url,
      storage_key,
      original_photo_url,
      original_storage_key,
      crop_data
    } = req.body || {}

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Verify member belongs to this project
      const existingRes = await client.query(
        `SELECT * FROM questionnaire_family_members WHERE id = $1 AND project_id = $2`,
        [memberId, project.id]
      )
      if (existingRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return reply.code(404).send({ error: 'Family member not found' })
      }
      const existing = existingRes.rows[0]

      const updated = await client.query(
        `UPDATE questionnaire_family_members
         SET name = COALESCE($1, name),
             relationship = COALESCE($2, relationship),
             custom_relationship = CASE WHEN $3::text IS NOT NULL THEN $3::text ELSE custom_relationship END,
             category = COALESCE($4, category),
             priority = COALESCE($5, priority),
             is_remembering = CASE WHEN $6::boolean IS NOT NULL THEN $6::boolean ELSE is_remembering END,
             notes = CASE WHEN $7::text IS NOT NULL THEN $7::text ELSE notes END,
             parent_member_id = CASE WHEN $8::uuid IS NOT NULL THEN $8::uuid ELSE parent_member_id END,
             family_group_id = CASE WHEN $9::uuid IS NOT NULL THEN $9::uuid ELSE family_group_id END,
             role_in_family = CASE WHEN $10::text IS NOT NULL THEN $10::text ELSE role_in_family END,
             photo_url = CASE WHEN $11::text IS NOT NULL THEN $11::text ELSE photo_url END,
             storage_key = CASE WHEN $12::text IS NOT NULL THEN $12::text ELSE storage_key END,
             original_photo_url = CASE WHEN $13::text IS NOT NULL THEN $13::text ELSE original_photo_url END,
             original_storage_key = CASE WHEN $14::text IS NOT NULL THEN $14::text ELSE original_storage_key END,
             crop_data = CASE WHEN $15::jsonb IS NOT NULL THEN $15::jsonb ELSE crop_data END,
             updated_at = NOW()
         WHERE id = $16 AND project_id = $17
         RETURNING *`,
        [
          name !== undefined ? name.trim() : null,
          relationship !== undefined ? relationship.trim() : null,
          custom_relationship !== undefined ? custom_relationship : null,
          category !== undefined ? category : null,
          priority !== undefined ? priority.toLowerCase() : null,
          is_remembering !== undefined ? Boolean(is_remembering) : null,
          notes !== undefined ? notes : null,
          parent_member_id !== undefined ? parent_member_id : null,
          family_group_id !== undefined ? family_group_id : null,
          role_in_family !== undefined ? role_in_family : null,
          photo_url !== undefined ? photo_url : null,
          storage_key !== undefined ? storage_key : null,
          original_photo_url !== undefined ? original_photo_url : null,
          original_storage_key !== undefined ? original_storage_key : null,
          crop_data !== undefined ? JSON.stringify(crop_data) : null,
          memberId,
          project.id
        ]
      )

      await client.query('COMMIT')
      return { success: true, member: updated.rows[0] }
    } catch (err) {
      await client.query('ROLLBACK')
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to update family member' })
    } finally {
      client.release()
    }
  })

  // 6. DELETE /client-portal/:slug/questionnaire/family/:memberId
  // Deletes family member and safely handles shared original image cleanup
  api.delete('/client-portal/:slug/questionnaire/family/:memberId', async (req, reply) => {
    const { slug, memberId } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const memberRes = await client.query(
        `SELECT * FROM questionnaire_family_members WHERE id = $1 AND project_id = $2`,
        [memberId, project.id]
      )
      if (memberRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return reply.code(404).send({ error: 'Family member not found' })
      }
      const member = memberRes.rows[0]

      // Delete the member record
      await client.query(
        `DELETE FROM questionnaire_family_members WHERE id = $1 AND project_id = $2`,
        [memberId, project.id]
      )

      // Check if cropped photo storage_key is used by anyone else
      if (member.storage_key) {
        const otherUses = await client.query(
          `SELECT count(*)::int as count FROM questionnaire_family_members
           WHERE storage_key = $1 AND project_id = $2`,
          [member.storage_key, project.id]
        )
        if (otherUses.rows[0].count === 0) {
          try {
            await deletePrivateSelfie(member.storage_key)
          } catch (e) {
            req.log.warn('Failed to delete orphaned family crop: ' + e.message)
          }
        }
      }

      await client.query('COMMIT')
      return { success: true }
    } catch (err) {
      await client.query('ROLLBACK')
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to delete family member' })
    } finally {
      client.release()
    }
  })

  // 6c. POST /client-portal/:slug/questionnaire/family-groups
  // Creates a new family group container (e.g. Chacha & Chachi)
  api.post('/client-portal/:slug/questionnaire/family-groups', async (req, reply) => {
    const { slug } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    const { side, name, relationship, custom_relationship, priority, notes } = req.body || {}

    if (!side || !['bride', 'groom'].includes(side.toLowerCase())) {
      return reply.code(400).send({ error: 'Side must be either bride or groom' })
    }
    if (!relationship || typeof relationship !== 'string' || !relationship.trim()) {
      return reply.code(400).send({ error: 'Relationship is required' })
    }

    const familyName = (name && typeof name === 'string' && name.trim())
      ? name.trim()
      : relationship.trim()

    const safePriority = ['high', 'medium', 'low'].includes((priority || '').toLowerCase())
      ? priority.toLowerCase()
      : 'medium'

    const res = await pool.query(
      `INSERT INTO questionnaire_family_groups (
         project_id, side, name, relationship, custom_relationship, priority, notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [
        project.id,
        side.toLowerCase(),
        familyName,
        relationship.trim(),
        custom_relationship ? custom_relationship.trim() : null,
        safePriority,
        notes ? notes.trim() : null
      ]
    )

    return { success: true, familyGroup: res.rows[0] }
  })

  // 6d. PATCH /client-portal/:slug/questionnaire/family-groups/:groupId
  // Updates a family group's name, relationship, priority, or notes
  api.patch('/client-portal/:slug/questionnaire/family-groups/:groupId', async (req, reply) => {
    const { slug, groupId } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    const { name, relationship, custom_relationship, priority, notes } = req.body || {}

    const res = await pool.query(
      `UPDATE questionnaire_family_groups
       SET name = COALESCE($1, name),
           relationship = COALESCE($2, relationship),
           custom_relationship = CASE WHEN $3::text IS NOT NULL THEN $3::text ELSE custom_relationship END,
           priority = COALESCE($4, priority),
           notes = CASE WHEN $5::text IS NOT NULL THEN $5::text ELSE notes END,
           updated_at = NOW()
       WHERE id = $6 AND project_id = $7
       RETURNING *`,
      [
        name !== undefined ? name.trim() : null,
        relationship !== undefined ? relationship.trim() : null,
        custom_relationship !== undefined ? custom_relationship : null,
        priority !== undefined ? priority.toLowerCase() : null,
        notes !== undefined ? notes : null,
        groupId,
        project.id
      ]
    )

    if (res.rows.length === 0) {
      return reply.code(404).send({ error: 'Family group not found' })
    }

    return { success: true, familyGroup: res.rows[0] }
  })

  // 6e. DELETE /client-portal/:slug/questionnaire/family-groups/:groupId
  // Deletes family group and cascade-deletes or unlinks its members
  api.delete('/client-portal/:slug/questionnaire/family-groups/:groupId', async (req, reply) => {
    const { slug, groupId } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    const res = await pool.query(
      `DELETE FROM questionnaire_family_groups WHERE id = $1 AND project_id = $2 RETURNING id`,
      [groupId, project.id]
    )

    if (res.rows.length === 0) {
      return reply.code(404).send({ error: 'Family group not found' })
    }

    return { success: true, deletedId: groupId }
  })

  // 6b. POST /client-portal/:slug/questionnaire/couple-photo
  // Saves bride or groom photo/name directly from questionnaire
  api.post('/client-portal/:slug/questionnaire/couple-photo', async (req, reply) => {
    const { slug } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    const { role, name, photo_url, storage_key } = req.body || {}
    const safeRole = (role || '').toLowerCase()
    if (!['bride', 'groom'].includes(safeRole)) {
      return reply.code(400).send({ error: 'Role must be bride or groom' })
    }

    if (storage_key && typeof storage_key === 'string') {
      const expectedPrefix1 = `private/portals/${project.id}/`
      const expectedPrefix2 = `portals/${project.id}/`
      const isTestKey = (storage_key.startsWith('private/portals/test/') || storage_key.startsWith('portals/test/')) && process.env.NODE_ENV === 'test'
      if (!storage_key.startsWith(expectedPrefix1) && !storage_key.startsWith(expectedPrefix2) && !isTestKey) {
        req.log.warn(`[Security] Unauthorized couple-photo storage key submission attempt for project ${project.id}: ${storage_key}`)
        return reply.code(403).send({ error: 'Invalid storage key scope.' })
      }
    }

    const checkRes = await pool.query(
      `SELECT id FROM client_onboarding_profiles WHERE project_id = $1 AND role = $2`,
      [project.id, safeRole]
    )

    if (checkRes.rows.length > 0) {
      await pool.query(
        `UPDATE client_onboarding_profiles
         SET selfie_url = COALESCE($1, selfie_url),
             storage_key = COALESCE($2, storage_key),
             name = COALESCE($3, name),
             updated_at = NOW()
         WHERE project_id = $4 AND role = $5`,
        [photo_url || null, storage_key || null, name || null, project.id, safeRole]
      )
    } else {
      await pool.query(
        `INSERT INTO client_onboarding_profiles (project_id, role, name, selfie_url, storage_key, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [project.id, safeRole, name || (safeRole === 'bride' ? 'Bride' : 'Groom'), photo_url || null, storage_key || null]
      )
    }

    if (name && project.lead_id) {
      if (safeRole === 'bride') {
        await pool.query(`UPDATE leads SET bride_name = $1 WHERE id = $2`, [name, project.lead_id])
      } else {
        await pool.query(`UPDATE leads SET groom_name = $1 WHERE id = $2`, [name, project.lead_id])
      }
    }

    return {
      success: true,
      couple: {
        role: safeRole,
        name: name || undefined,
        photo_url: photo_url || `/api/client-portal/${slug}/selfie/${safeRole}`
      }
    }
  })

  // 7. POST /client-portal/:slug/questionnaire/schedules
  // Saves event schedule text for a specific project event
  api.post('/client-portal/:slug/questionnaire/schedules', async (req, reply) => {
    const { slug } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    const { project_event_id, schedule_text } = req.body || {}

    if (!project_event_id) {
      return reply.code(400).send({ error: 'project_event_id is required' })
    }

    // Verify event belongs to this project
    const evCheck = await pool.query(
      `SELECT id FROM project_events WHERE id = $1 AND project_id = $2`,
      [project_event_id, project.id]
    )
    if (evCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'Project event not found' })
    }

    const schedRes = await pool.query(
      `INSERT INTO questionnaire_schedules (project_id, project_event_id, schedule_text, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (project_id, project_event_id)
       DO UPDATE SET schedule_text = EXCLUDED.schedule_text, updated_at = NOW()
       RETURNING *`,
      [project.id, project_event_id, schedule_text || '']
    )

    return { success: true, schedule: schedRes.rows[0] }
  })

  // 8. POST /client-portal/:slug/questionnaire/invitations
  // Records an uploaded digital wedding invitation (PDF, Image, or Video)
  api.post('/client-portal/:slug/questionnaire/invitations', async (req, reply) => {
    const { slug } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    const { file_url, storage_key, filename, file_type, file_size } = req.body || {}

    if (!file_url || !storage_key || !filename || !file_type) {
      return reply.code(400).send({ error: 'file_url, storage_key, filename, and file_type are required' })
    }

    const expectedPrefix = `portals/${project.id}/`
    const isTestKey = storage_key.startsWith('portals/test/') && process.env.NODE_ENV === 'test'
    if (typeof storage_key !== 'string' || (!storage_key.startsWith(expectedPrefix) && !isTestKey)) {
      req.log.warn(`[Security] Unauthorized invitation storage key submission attempt for project ${project.id}: ${storage_key}`)
      return reply.code(403).send({ error: 'Invalid storage key scope.' })
    }

    const safeType = file_type.toLowerCase()
    if (!['pdf', 'image', 'video'].includes(safeType)) {
      return reply.code(400).send({ error: 'file_type must be pdf, image, or video' })
    }

    // 1. Enforce max invitations limit (10)
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM questionnaire_invitations WHERE project_id = $1`,
      [project.id]
    )
    if (parseInt(countRes.rows[0].count, 10) >= INVITATION_MAX_COUNT) {
      return reply.code(400).send({
        error: `Maximum limit of ${INVITATION_MAX_COUNT} invitations reached for this project.`
      })
    }

    // 2. Enforce file size limit per invitation type
    if (file_size && INVITATION_SIZE_LIMITS[safeType] && Number(file_size) > INVITATION_SIZE_LIMITS[safeType]) {
      const mbLimit = Math.round(INVITATION_SIZE_LIMITS[safeType] / (1024 * 1024))
      return reply.code(400).send({
        error: `File size exceeds the ${mbLimit} MB limit for ${safeType} invitations.`
      })
    }

    const invRes = await pool.query(
      `INSERT INTO questionnaire_invitations (project_id, file_url, storage_key, filename, file_type, file_size, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [project.id, file_url, storage_key, filename.trim(), safeType, Number(file_size) || null]
    )

    return { success: true, invitation: invRes.rows[0] }
  })

  // 9. DELETE /client-portal/:slug/questionnaire/invitations/:invitationId
  // Deletes an invitation and cleans up storage asset
  api.delete('/client-portal/:slug/questionnaire/invitations/:invitationId', async (req, reply) => {
    const { slug, invitationId } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    const invRes = await pool.query(
      `SELECT * FROM questionnaire_invitations WHERE id = $1 AND project_id = $2`,
      [invitationId, project.id]
    )
    if (invRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Invitation not found' })
    }
    const inv = invRes.rows[0]

    const expectedPrefix = `portals/${project.id}/`
    const isTestKey = inv.storage_key && inv.storage_key.startsWith('portals/test/') && process.env.NODE_ENV === 'test'
    if (!inv.storage_key || (!inv.storage_key.startsWith(expectedPrefix) && !isTestKey)) {
      req.log.warn(`[Security] Attempted deletion of unauthorized storage key for project ${project.id}: ${inv.storage_key}`)
      return reply.code(403).send({ error: 'Access denied: Asset scope violation.' })
    }

    await pool.query(
      `DELETE FROM questionnaire_invitations WHERE id = $1 AND project_id = $2`,
      [invitationId, project.id]
    )

    if (inv.storage_key) {
      try {
        await deleteAsset(inv.file_url)
      } catch (e) {
        req.log.warn('Failed to delete invitation file: ' + e.message)
      }
    }

    return { success: true }
  })

  // 10. POST /client-portal/:slug/questionnaire/music-references
  // Adds or updates a music reference linked to project video deliverables
  api.post('/client-portal/:slug/questionnaire/music-references', async (req, reply) => {
    const { slug } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    const { id, url, reference_type, deliverable_ids, deliverable_names, notes } = req.body || {}

    if (!url || typeof url !== 'string' || !url.trim()) {
      return reply.code(400).send({ error: 'URL is required' })
    }
    const safeRefType = reference_type === 'exact_song' ? 'exact_song' : 'inspiration'

    if (id) {
      const updated = await pool.query(
        `UPDATE questionnaire_music_references
         SET url = $1, reference_type = $2, deliverable_ids = $3::jsonb, deliverable_names = $4::jsonb, notes = $5, updated_at = NOW()
         WHERE id = $6 AND project_id = $7
         RETURNING *`,
        [
          url.trim(),
          safeRefType,
          JSON.stringify(deliverable_ids || []),
          JSON.stringify(deliverable_names || []),
          notes ? notes.trim() : null,
          id,
          project.id
        ]
      )
      return { success: true, musicReference: updated.rows[0] }
    } else {
      const inserted = await pool.query(
        `INSERT INTO questionnaire_music_references (project_id, url, reference_type, deliverable_ids, deliverable_names, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, NOW(), NOW())
         RETURNING *`,
        [
          project.id,
          url.trim(),
          safeRefType,
          JSON.stringify(deliverable_ids || []),
          JSON.stringify(deliverable_names || []),
          notes ? notes.trim() : null
        ]
      )
      return { success: true, musicReference: inserted.rows[0] }
    }
  })

  // 11. DELETE /client-portal/:slug/questionnaire/music-references/:refId
  // Removes a music reference
  api.delete('/client-portal/:slug/questionnaire/music-references/:refId', async (req, reply) => {
    const { slug, refId } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    await pool.query(
      `DELETE FROM questionnaire_music_references WHERE id = $1 AND project_id = $2`,
      [refId, project.id]
    )

    return { success: true }
  })

  // 12. POST /client-portal/:slug/questionnaire/presigned-url
  // Scoped direct-to-R2 upload URL generation (SEC & PERF: Direct browser-to-R2)
  api.post('/client-portal/:slug/questionnaire/presigned-url', async (req, reply) => {
    const { slug } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    if (!checkRateLimit(project.id)) {
      return reply.code(429).send({ error: 'Upload rate limit exceeded. Please wait a few moments.' })
    }

    const { section, filename, mimeType, isVideo, fileSize } = req.body || {}

    const allowedSections = ['family', 'photography', 'videography', 'invitations']
    if (!section || !allowedSections.includes(section)) {
      return reply.code(400).send({ error: 'Invalid upload section' })
    }

    // STRICT NON-NEGOTIABLE RULE: Video uploads permitted ONLY in wedding invitations!
    const isVideoMime = (mimeType || '').startsWith('video/')
    if ((isVideo || isVideoMime) && section !== 'invitations') {
      return reply.code(400).send({
        error: 'Video file uploads are permitted ONLY in the wedding invitation area. In photography and videography references, please share video links (e.g. YouTube, Instagram).'
      })
    }

    // Invitation-specific limits: Max 10 count and per-type file size limit
    if (section === 'invitations') {
      const countRes = await pool.query(
        `SELECT COUNT(*) FROM questionnaire_invitations WHERE project_id = $1`,
        [project.id]
      )
      if (parseInt(countRes.rows[0].count, 10) >= INVITATION_MAX_COUNT) {
        return reply.code(400).send({
          error: `Maximum limit of ${INVITATION_MAX_COUNT} invitations reached for this project.`
        })
      }

      if (fileSize) {
        const isPdf = mimeType === 'application/pdf' || (filename && filename.toLowerCase().endsWith('.pdf'))
        const invType = (isVideo || isVideoMime) ? 'video' : isPdf ? 'pdf' : 'image'
        const limit = INVITATION_SIZE_LIMITS[invType]
        if (limit && Number(fileSize) > limit) {
          const mbLimit = Math.round(limit / (1024 * 1024))
          return reply.code(400).send({
            error: `File size exceeds the ${mbLimit} MB limit for ${invType} invitations.`
          })
        }
      }
    }

    const cleanFilename = (filename || 'upload.jpg')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 100)

    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const timestamp = Date.now()
    const storageKey = `portals/${project.id}/questionnaire/${section}/${timestamp}_${randomSuffix}_${cleanFilename}`

    try {
      const presigned = await getQuestionnaireUploadPresignedUrl(
        storageKey,
        mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
        section === 'family' // Family photos are private
      )

      return {
        success: true,
        ...presigned
      }
    } catch (err) {
      req.log.error('Failed to generate presigned URL: ' + err.message)
      return reply.code(500).send({ error: 'Failed to generate upload URL: ' + err.message })
    }
  })

  // 13. POST /client-portal/:slug/questionnaire/upload-local
  // Local disk upload fallback for development when R2 is not enabled
  api.post('/client-portal/:slug/questionnaire/upload-local', async (req, reply) => {
    const { slug } = req.params
    const auth = await checkPortalOrAdminAuth(req, reply, slug)
    if (!auth) return
    const { project } = auth

    let fileData
    try {
      fileData = await req.file({ limits: { fileSize: 50 * 1024 * 1024 } })
    } catch (err) {
      return reply.code(400).send({ error: 'File upload error: ' + err.message })
    }

    if (!fileData) {
      return reply.code(400).send({ error: 'No file uploaded' })
    }

    const section = (req.query?.section || 'general').replace(/[^a-zA-Z0-9_-]/g, '')
    const mimeType = (fileData.mimetype || 'image/jpeg').toLowerCase()

    if (mimeType.startsWith('video/') && section !== 'invitations') {
      return reply.code(400).send({
        error: 'Video files are allowed only in the wedding invitation area.'
      })
    }

    if (section === 'invitations') {
      const countRes = await pool.query(
        `SELECT COUNT(*) FROM questionnaire_invitations WHERE project_id = $1`,
        [project.id]
      )
      if (parseInt(countRes.rows[0].count, 10) >= INVITATION_MAX_COUNT) {
        return reply.code(400).send({
          error: `Maximum limit of ${INVITATION_MAX_COUNT} invitations reached for this project.`
        })
      }
    }

    const buffer = await fileData.toBuffer()

    if (section === 'invitations') {
      const isVideo = mimeType.startsWith('video/')
      const isPdf = mimeType === 'application/pdf' || (fileData.filename && fileData.filename.toLowerCase().endsWith('.pdf'))
      const invType = isVideo ? 'video' : isPdf ? 'pdf' : 'image'
      const limit = INVITATION_SIZE_LIMITS[invType]
      if (limit && buffer.length > limit) {
        const mbLimit = Math.round(limit / (1024 * 1024))
        return reply.code(400).send({
          error: `File size exceeds the ${mbLimit} MB limit for ${invType} invitations.`
        })
      }
    }
    const cleanFilename = path.basename(fileData.filename || 'upload.jpg').replace(/[^a-zA-Z0-9._-]/g, '_')
    const uniqueName = `${Date.now()}_${cleanFilename}`
    const relativeSub = path.join('portals', project.id, 'questionnaire', section)
    const targetDir = path.join(PHOTO_UPLOAD_DIR, relativeSub)

    fs.mkdirSync(targetDir, { recursive: true })
    const fullPath = path.join(targetDir, uniqueName)
    fs.writeFileSync(fullPath, buffer)

    const storageKey = `${relativeSub}/${uniqueName}`
    const fileUrl = `/api/photos/file/${storageKey}`

    return {
      success: true,
      fileUrl,
      storageKey
    }
  })

  /* ==========================================================================
     INTERNAL PROJECT WORKSPACE REVIEW ENDPOINTS
     ========================================================================== */

  // 14. GET /projects/:id/wedding-vision
  // Internal workspace review endpoint for photography/videography teams
  api.get('/projects/:id/wedding-vision', async (req, reply) => {
    try {
      const auth = requireAuth(req, reply)
      if (!auth) return

      const { id } = req.params

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      let queryWhere = 'WHERE p.id = $1'
      if (!uuidRegex.test(id)) {
        queryWhere = 'WHERE p.slug = $1 OR p.name = $1'
      }

      const projRes = await pool.query(
        `SELECT p.id, p.name, p.slug, p.status, p.start_date, p.end_date, p.city,
                l.bride_name, l.groom_name
         FROM projects p
         LEFT JOIN leads l ON l.id = p.lead_id
         ${queryWhere}`,
        [id]
      )

      if (projRes.rows.length === 0) {
        return reply.code(404).send({ error: 'Project not found' })
      }
      const project = projRes.rows[0]

      // Fetch Questionnaire
      const qRes = await pool.query(
        `SELECT * FROM project_questionnaires WHERE project_id = $1`,
        [project.id]
      )
      const questionnaire = qRes.rows[0] || null

      // Fetch Family Tree
      const familyRes = await pool.query(
        `SELECT * FROM questionnaire_family_members
         WHERE project_id = $1
         ORDER BY
           CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
           order_index ASC,
           created_at ASC`,
        [project.id]
      )
      const familyMembers = familyRes.rows

      // Fetch Family Groups
      const familyGroupsRes = await pool.query(
        `SELECT * FROM questionnaire_family_groups
         WHERE project_id = $1
         ORDER BY order_index ASC, created_at ASC`,
        [project.id]
      )
      const familyGroups = familyGroupsRes.rows

      // Fetch Schedules
      const schedRes = await pool.query(
        `SELECT pe.id, pe.event_type, pe.event_date, pe.start_time, pe.end_time, pe.venue, pe.slot,
                COALESCE(qs.schedule_text, '') AS schedule_text, qs.updated_at AS schedule_updated_at
         FROM project_events pe
         LEFT JOIN questionnaire_schedules qs ON qs.project_event_id = pe.id AND qs.project_id = $1
         WHERE pe.project_id = $1
         ORDER BY pe.event_date ASC, pe.created_at ASC`,
        [project.id]
      )

      // Fetch Invitations
      const invRes = await pool.query(
        `SELECT * FROM questionnaire_invitations WHERE project_id = $1 ORDER BY created_at ASC`,
        [project.id]
      )

      // Fetch Music References
      const musicRes = await pool.query(
        `SELECT * FROM questionnaire_music_references WHERE project_id = $1 ORDER BY created_at ASC`,
        [project.id]
      )

      const stats = computeFamilyStats(familyMembers)

      // Fetch Bride & Groom profiles
      let couple = {
        bride: { name: project.bride_name || 'Bride', photo_url: null },
        groom: { name: project.groom_name || 'Groom', photo_url: null }
      }
      try {
        const onbRes = await pool.query(
          `SELECT role, name, storage_key, selfie_url FROM client_onboarding_profiles WHERE project_id = $1`,
          [project.id]
        )
        for (const row of onbRes.rows) {
          const selfieEndpoint = (row.storage_key || row.selfie_url)
            ? `/api/client-portal/${project.slug}/selfie/${row.role}`
            : null
          if (row.role === 'bride') {
            if (row.name) couple.bride.name = row.name
            if (selfieEndpoint) couple.bride.photo_url = selfieEndpoint
          } else if (row.role === 'groom') {
            if (row.name) couple.groom.name = row.name
            if (selfieEndpoint) couple.groom.photo_url = selfieEndpoint
          }
        }
      } catch (cErr) {
        req.log.warn('Could not query couple info in admin review: ' + cErr.message)
      }

      return {
        success: true,
        data: {
          project,
          questionnaire,
          familyMembers,
          familyGroups,
          schedules: schedRes.rows,
          invitations: invRes.rows,
          musicReferences: musicRes.rows,
          stats,
          couple
        }
      }
    } catch (err) {
      req.log.error('Error fetching admin wedding vision:', err)
      return reply.code(500).send({ error: 'Failed to load wedding vision: ' + err.message })
    }
  })
}
