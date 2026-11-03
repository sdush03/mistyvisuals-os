const path = require('path')
const {
  uploadAsset,
  uploadPrivateSelfie,
  getPrivateSelfieStream,
  deletePrivateSelfie
} = require('../utils/r2')
const { parsePhoneNumberFromString } = require('libphonenumber-js')

// Upload rate limiting per project: max 10 uploads in 10 minutes
const projectUploadAttempts = new Map()
function checkUploadRateLimit(projectId) {
  const now = Date.now()
  const windowMs = 10 * 60 * 1000
  const history = projectUploadAttempts.get(projectId) || []
  const recent = history.filter(ts => now - ts < windowMs)
  if (recent.length >= 10) {
    return false
  }
  recent.push(now)
  projectUploadAttempts.set(projectId, recent)
  return true
}

// Helper: Comprehensive phone number validation
function validatePhoneNumber(phone, fieldName = 'Phone number') {
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return { valid: false, error: `${fieldName} is required.` }
  }
  const clean = phone.trim()
  if (!clean.startsWith('+')) {
    return { valid: false, error: `${fieldName} must include country code (e.g. +91 for India).` }
  }
  const parsed = parsePhoneNumberFromString(clean)
  if (!parsed || !parsed.isValid()) {
    return { valid: false, error: `Please enter a valid ${fieldName.toLowerCase()} with country code.` }
  }
  const national = parsed.nationalNumber
  // Check for dummy repeating numbers (e.g. 0000000000, 9999999999, etc. 8+ repeating digits)
  if (/^(\d)\1{7,}$/.test(national)) {
    return { valid: false, error: `Please enter a genuine ${fieldName.toLowerCase()} (dummy repeating digits detected).` }
  }
  // For India mobile numbers, enforce 10 digits starting with 6, 7, 8, or 9
  if (parsed.country === 'IN') {
    if (!/^[6-9]\d{9}$/.test(national)) {
      return { valid: false, error: 'Indian mobile number must be 10 digits starting with 6, 7, 8, or 9.' }
    }
  }
  return { valid: true, formatted: parsed.format('E.164') }
}

// Helper: Comprehensive email validation
function validateEmail(email) {
  if (!email || typeof email !== 'string' || !email.trim()) {
    return { valid: false, error: 'Email address is required.' }
  }
  const clean = email.trim().toLowerCase()
  if (clean.length < 5 || clean.length > 254) {
    return { valid: false, error: 'Email address must be between 5 and 254 characters.' }
  }
  if (clean.includes('..') || clean.startsWith('.') || clean.includes('@.') || clean.includes('.@')) {
    return { valid: false, error: 'Email contains invalid dot placement.' }
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/
  if (!emailRegex.test(clean)) {
    return { valid: false, error: 'Please enter a valid email address.' }
  }
  const parts = clean.split('@')
  if (parts.length !== 2) return { valid: false, error: 'Please enter a valid email address.' }
  const domain = parts[1]
  const domainParts = domain.split('.')
  const tld = domainParts[domainParts.length - 1]
  if (!tld || tld.length < 2 || !/^[a-z]+$/.test(tld)) {
    return { valid: false, error: 'Email domain extension is invalid (e.g. .com, .in).' }
  }
  const dummyEmails = [
    'test@test.com',
    'admin@admin.com',
    'example@example.com',
    'none@none.com',
    'abc@xyz.com',
    'fake@fake.com',
    'user@domain.com',
    'test@gmail.com'
  ]
  if (dummyEmails.includes(clean)) {
    return { valid: false, error: 'Please enter your actual personal email address.' }
  }
  const domainTypos = {
    'gmai.com': 'gmail.com',
    'gamil.com': 'gmail.com',
    'gmial.com': 'gmail.com',
    'gmaill.com': 'gmail.com',
    'gmaik.com': 'gmail.com',
    'yaho.com': 'yahoo.com',
    'yahooo.com': 'yahoo.com',
    'hotmial.com': 'hotmail.com',
    'hotmai.com': 'hotmail.com',
    'outlok.com': 'outlook.com',
    'iclou.com': 'icloud.com'
  }
  if (domainTypos[domain]) {
    return { valid: false, error: `Did you mean @${domainTypos[domain]}? Please check your email spelling.` }
  }
  return { valid: true, clean }
}

module.exports = async function(api, opts) {
  const { pool, getAuthFromRequest, requireAuth } = opts

  // POST /client-portal/:slug/verify
  // Verifies the passcode and sets a cookie with database-backed rate limiting & lockout (SEC-04)
  api.post('/client-portal/:slug/verify', async (req, reply) => {
    const { slug } = req.params
    const { passcode } = req.body || {}

    const clientIp = (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || '127.0.0.1').substring(0, 45)

    // Check existing lockout state in database
    const attemptRes = await pool.query(
      `SELECT failed_attempts, locked_until FROM client_portal_verify_attempts WHERE ip = $1 AND slug = $2`,
      [clientIp, slug]
    )

    if (attemptRes.rows.length > 0) {
      const attempt = attemptRes.rows[0]
      if (attempt.locked_until && new Date(attempt.locked_until) > new Date()) {
        const retryAfter = Math.max(1, Math.ceil((new Date(attempt.locked_until).getTime() - Date.now()) / 1000))
        return reply.code(429).header('Retry-After', retryAfter).send({
          error: 'Too many failed passcode attempts. Please try again later.'
        })
      }
    }

    if (!passcode) {
      return reply.code(400).send({ error: 'Passcode is required' })
    }

    const r = await pool.query(
      `SELECT id, passcode FROM projects WHERE slug = $1`,
      [slug]
    )

    // Uniform 401 response and failure tracking on invalid slug or invalid passcode
    if (r.rows.length === 0 || r.rows[0].passcode !== passcode) {
      const lockoutRes = await pool.query(
        `INSERT INTO client_portal_verify_attempts (ip, slug, failed_attempts, first_failed_at, updated_at)
         VALUES ($1, $2, 1, NOW(), NOW())
         ON CONFLICT (ip, slug) DO UPDATE SET
           failed_attempts = CASE 
             WHEN client_portal_verify_attempts.first_failed_at < NOW() - INTERVAL '15 minutes' THEN 1
             ELSE client_portal_verify_attempts.failed_attempts + 1
           END,
           first_failed_at = CASE 
             WHEN client_portal_verify_attempts.first_failed_at < NOW() - INTERVAL '15 minutes' THEN NOW()
             ELSE client_portal_verify_attempts.first_failed_at
           END,
           locked_until = CASE
             WHEN (CASE WHEN client_portal_verify_attempts.first_failed_at < NOW() - INTERVAL '15 minutes' THEN 1 ELSE client_portal_verify_attempts.failed_attempts + 1 END) >= 5 
             THEN NOW() + INTERVAL '15 minutes'
             ELSE NULL
           END,
           updated_at = NOW()
         RETURNING failed_attempts, locked_until`,
        [clientIp, slug]
      )

      const updatedAttempt = lockoutRes.rows[0]
      if (updatedAttempt && updatedAttempt.locked_until && new Date(updatedAttempt.locked_until) > new Date()) {
        req.log.warn(`[Passcode Lockout] IP ${clientIp} locked out on slug ${slug} for 15 minutes after ${updatedAttempt.failed_attempts} failed attempts.`)
        const retryAfter = Math.max(1, Math.ceil((new Date(updatedAttempt.locked_until).getTime() - Date.now()) / 1000))
        return reply.code(429).header('Retry-After', retryAfter).send({
          error: 'Too many failed passcode attempts. Please try again later.'
        })
      }

      return reply.code(401).send({ error: 'Invalid passcode' })
    }

    // Passcode verified: clear failed attempts
    await pool.query(
      `DELETE FROM client_portal_verify_attempts WHERE ip = $1 AND slug = $2`,
      [clientIp, slug]
    )

    const project = r.rows[0]
    // Sign jwt token with project context
    const token = req.server.jwt.sign({ projectId: project.id, slug })

    reply.setCookie('mv_client_auth', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    })

    return { success: true }
  })

  // GET /client-portal/:slug
  // Fetches project details if verified, otherwise returns lock state
  api.get('/client-portal/:slug', async (req, reply) => {
    const { slug } = req.params

    const r = await pool.query(
      `SELECT p.id, p.name, p.status, p.start_date, p.end_date, p.city, p.is_destination, p.lead_id,
              l.phone_primary, l.email, l.instagram,
              l.bride_name, l.bride_phone_primary, l.bride_phone_secondary, l.bride_email, l.bride_instagram,
              l.groom_name, l.groom_phone_primary, l.groom_phone_secondary, l.groom_email, l.groom_instagram
       FROM projects p
       LEFT JOIN leads l ON p.lead_id = l.id
       WHERE p.slug = $1`,
      [slug]
    )

    if (r.rows.length === 0) {
      return reply.code(404).send({ error: 'Portal not found' })
    }

    const project = r.rows[0]

    // Verify token from cookie
    let authorized = false
    const clientCookie = req.cookies.mv_client_auth
    if (clientCookie) {
      try {
        const decoded = req.server.jwt.verify(clientCookie)
        if (decoded && decoded.projectId === project.id) {
          authorized = true
        }
      } catch (err) {
        // Stale or invalid signature, treat as locked
      }
    }

    if (!authorized) {
      return { success: true, locked: true, projectName: project.name }
    }

    const projectId = project.id

    // Fetch onboarding profiles for bride and groom
    let onboarding = {
      isFullyCompleted: false,
      bride: {
        role: 'bride',
        name: project.bride_name || 'Bride',
        phone_primary: project.bride_phone_primary || '',
        phone_secondary: project.bride_phone_secondary || '',
        email: project.bride_email || '',
        instagram: project.bride_instagram || '',
        selfie_url: null,
        is_completed: false,
        completed_at: null
      },
      groom: {
        role: 'groom',
        name: project.groom_name || 'Groom',
        phone_primary: project.groom_phone_primary || '',
        phone_secondary: project.groom_phone_secondary || '',
        email: project.groom_email || '',
        instagram: project.groom_instagram || '',
        selfie_url: null,
        is_completed: false,
        completed_at: null
      }
    }

    try {
      const onbRes = await pool.query(
        `SELECT role, name, phone_primary, phone_secondary, email, instagram, selfie_url, storage_key, is_completed, completed_at
         FROM client_onboarding_profiles
         WHERE project_id = $1`,
        [projectId]
      )

      for (const row of onbRes.rows) {
        const selfieEndpoint = (row.storage_key || row.selfie_url)
          ? `/api/client-portal/${slug}/selfie/${row.role}`
          : null

        if (row.role === 'bride') {
          onboarding.bride = {
            role: 'bride',
            name: row.name || project.bride_name || 'Bride',
            phone_primary: row.phone_primary || project.bride_phone_primary || '',
            phone_secondary: row.phone_secondary || project.bride_phone_secondary || '',
            email: row.email || project.bride_email || '',
            instagram: row.instagram || project.bride_instagram || '',
            selfie_url: selfieEndpoint,
            is_completed: Boolean(row.is_completed),
            completed_at: row.completed_at || null
          }
        } else if (row.role === 'groom') {
          onboarding.groom = {
            role: 'groom',
            name: row.name || project.groom_name || 'Groom',
            phone_primary: row.phone_primary || project.groom_phone_primary || '',
            phone_secondary: row.phone_secondary || project.groom_phone_secondary || '',
            email: row.email || project.groom_email || '',
            instagram: row.instagram || project.groom_instagram || '',
            selfie_url: selfieEndpoint,
            is_completed: Boolean(row.is_completed),
            completed_at: row.completed_at || null
          }
        }
      }

      onboarding.isFullyCompleted = Boolean(onboarding.bride.is_completed && onboarding.groom.is_completed)
    } catch (onbErr) {
      req.log.error(onbErr)
    }

    // Backend Onboarding Enforcement (SEC-05):
    // Mandatory onboarding for all projects. If incomplete, do not expose sensitive workspace assets.
    if (!onboarding.isFullyCompleted) {
      return {
        success: true,
        locked: false,
        data: {
          project,
          events: [],
          deliverables: [],
          checklist: [],
          invoice: null,
          gallery: null,
          onboarding
        }
      }
    }

    // Onboarding complete — load full workspace data
    // Events
    const eventsRes = await pool.query(
      `SELECT * FROM project_events WHERE project_id = $1 ORDER BY event_date ASC, created_at ASC`,
      [projectId]
    )

    // Deliverables
    const delRes = await pool.query(
      `SELECT * FROM project_deliverables WHERE project_id = $1 ORDER BY created_at ASC`,
      [projectId]
    )

    // Checklist
    const checkRes = await pool.query(
      `SELECT * FROM project_checklist WHERE project_id = $1 ORDER BY phase ASC, created_at ASC`,
      [projectId]
    )

    // Invoice
    const invoiceRes = await pool.query(
      `SELECT i.id, i.invoice_number, i.status, i.issue_date, i.due_date, i.total_amount, i.advance_amount, i.advance_paid, i.balance_amount AS balance_due, i.is_verified,
        (SELECT json_agg(ili.*) FROM invoice_line_items ili WHERE ili.invoice_id = i.id) as line_items,
        (SELECT json_agg(ips.* ORDER BY ips.step_order) FROM invoice_payment_schedule ips WHERE ips.invoice_id = i.id) as payment_schedule
       FROM invoices i
       WHERE i.project_id = $1`,
      [projectId]
    )

    // Gallery event and photo/video/highlight counts
    let gallery = null
    try {
      const galleryRes = await pool.query(
        `SELECT ge.id, ge.slug, ge.title, ge.cover_photo_url, ge.active,
                ge.full_code, ge.partial_code,
                COUNT(p.id)::int AS total_count,
                COUNT(p.id) FILTER (
                  WHERE p.filename ILIKE '%.mp4' OR p.filename ILIKE '%.mov' OR p.filename ILIKE '%.m4v' OR p.filename ILIKE '%.webm'
                     OR p.r2_url ILIKE '%.mp4' OR p.r2_url ILIKE '%.mov' OR p.r2_url ILIKE '%.m4v' OR p.r2_url ILIKE '%.webm'
                     OR LOWER(p.tab_name) = 'cinema'
                )::int AS video_count,
                COUNT(p.id) FILTER (
                  WHERE (p.filename NOT ILIKE '%.mp4' AND p.filename NOT ILIKE '%.mov' AND p.filename NOT ILIKE '%.m4v' AND p.filename NOT ILIKE '%.webm')
                    AND (p.r2_url IS NULL OR (p.r2_url NOT ILIKE '%.mp4' AND p.r2_url NOT ILIKE '%.mov' AND p.r2_url NOT ILIKE '%.m4v' AND p.r2_url NOT ILIKE '%.webm'))
                    AND (p.tab_name IS NULL OR LOWER(p.tab_name) != 'cinema')
                )::int AS photo_count,
                COUNT(p.id) FILTER (
                  WHERE LOWER(p.tab_name) = 'highlights' OR (p.exif->>'isHighlight')::boolean = true
                )::int AS highlights_count
         FROM gallery_events ge
         LEFT JOIN photos p ON p.event_id = ge.id
         WHERE (ge.project_id = $1 OR ge.slug = $2) AND ge.active = true
         GROUP BY ge.id, ge.slug, ge.title, ge.cover_photo_url, ge.active, ge.full_code, ge.partial_code
         LIMIT 1`,
        [String(projectId), slug]
      )

      if (galleryRes.rows.length > 0) {
        const gRow = galleryRes.rows[0]
        gallery = {
          exists: true,
          id: gRow.id,
          slug: gRow.slug,
          title: gRow.title,
          totalCount: Number(gRow.total_count || 0),
          videoCount: Number(gRow.video_count || 0),
          photoCount: Number(gRow.photo_count || 0),
          highlightsCount: Number(gRow.highlights_count || 0),
          coverPhotoUrl: gRow.cover_photo_url || null,
          passcode: gRow.full_code || project.passcode || null,
          partialPasscode: gRow.partial_code || null,
        }
      } else {
        gallery = {
          exists: false,
          slug,
          totalCount: 0,
          videoCount: 0,
          photoCount: 0,
          highlightsCount: 0,
          coverPhotoUrl: null,
          passcode: project.passcode || null,
          partialPasscode: null,
        }
      }
    } catch (gErr) {
      req.log.error(gErr)
    }

    return {
      success: true,
      locked: false,
      data: {
        project,
        events: eventsRes.rows,
        deliverables: delRes.rows,
        checklist: checkRes.rows,
        invoice: invoiceRes.rows[0] || null,
        gallery,
        onboarding
      }
    }
  })

  // GET /client-portal/:slug/selfie/:role
  // Authenticated streaming endpoint for private onboarding reference selfies (SEC-01)
  api.get('/client-portal/:slug/selfie/:role', async (req, reply) => {
    const { slug, role } = req.params
    const roleParam = (role || '').toLowerCase()
    if (!['bride', 'groom'].includes(roleParam)) {
      return reply.code(400).send({ error: 'Role must be bride or groom' })
    }

    const r = await pool.query('SELECT id FROM projects WHERE slug = $1', [slug])
    if (r.rows.length === 0) {
      return reply.code(404).send({ error: 'Portal not found' })
    }
    const project = r.rows[0]

    // Verify authentication: Authorized project client session OR authorized team admin
    let authorized = false

    // 1. Client session check
    const clientCookie = req.cookies.mv_client_auth
    if (clientCookie) {
      try {
        const decoded = req.server.jwt.verify(clientCookie)
        if (decoded && decoded.projectId === project.id) {
          authorized = true
        }
      } catch (err) {}
    }

    // 2. Admin/team auth check
    if (!authorized && typeof getAuthFromRequest === 'function') {
      const adminAuth = getAuthFromRequest(req)
      if (adminAuth) {
        authorized = true
      }
    }

    if (!authorized) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    // Fetch storage key
    const profRes = await pool.query(
      `SELECT storage_key, selfie_url FROM client_onboarding_profiles WHERE project_id = $1 AND role = $2`,
      [project.id, roleParam]
    )

    if (profRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Selfie not found' })
    }

    const keyToStream = profRes.rows[0].storage_key || profRes.rows[0].selfie_url
    if (!keyToStream) {
      return reply.code(404).send({ error: 'Selfie not found' })
    }

    try {
      const stream = await getPrivateSelfieStream(keyToStream)
      return reply
        .header('Content-Type', 'image/jpeg')
        .header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
        .send(stream)
    } catch (err) {
      req.log.error('Error streaming private selfie:', err)
      return reply.code(404).send({ error: 'Selfie asset not found' })
    }
  })

  // Helper function to verify client session
  async function checkAuth(req, reply, slug) {
    const r = await pool.query('SELECT id, lead_id FROM projects WHERE slug = $1', [slug])
    if (r.rows.length === 0) {
      reply.code(404).send({ error: 'Portal not found' })
      return null
    }
    const project = r.rows[0]

    const clientCookie = req.cookies.mv_client_auth
    if (!clientCookie) {
      reply.code(401).send({ error: 'Unauthorized' })
      return null
    }

    try {
      const decoded = req.server.jwt.verify(clientCookie)
      if (decoded && decoded.projectId === project.id) {
        return project
      }
    } catch (err) {}

    reply.code(401).send({ error: 'Unauthorized' })
    return null
  }

  // Helper to enforce couple onboarding completion on mutating actions (SEC-05)
  async function requireCompletedOnboarding(project, reply) {
    const onbRes = await pool.query(
      `SELECT role, is_completed FROM client_onboarding_profiles WHERE project_id = $1`,
      [project.id]
    )
    const brideDone = onbRes.rows.some(r => r.role === 'bride' && r.is_completed)
    const groomDone = onbRes.rows.some(r => r.role === 'groom' && r.is_completed)
    if (!brideDone || !groomDone) {
      reply.code(403).send({
        error: 'Please complete your couple onboarding profile before modifying workspace details.',
        requiresOnboarding: true
      })
      return false
    }
    return true
  }

  // POST /client-portal/:slug/details
  // Updates client bride/groom names and contact info in a transaction (requires completed onboarding)
  api.post('/client-portal/:slug/details', async (req, reply) => {
    const { slug } = req.params
    const project = await checkAuth(req, reply, slug)
    if (!project) return

    const allowed = await requireCompletedOnboarding(project, reply)
    if (!allowed) return

    const {
      bride_name, groom_name,
      bride_phone_primary, bride_phone_secondary, bride_email, bride_instagram, bride_selfie_url, bride_storage_key,
      groom_phone_primary, groom_phone_secondary, groom_email, groom_instagram, groom_selfie_url, groom_storage_key
    } = req.body || {}

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Update leads table (preserve secondary phone numbers if omitted from request)
      await client.query(
        `UPDATE leads
         SET bride_name = COALESCE($1, bride_name), groom_name = COALESCE($2, groom_name),
             bride_phone_primary = COALESCE($3, bride_phone_primary), bride_phone_secondary = COALESCE($4, bride_phone_secondary),
             bride_email = COALESCE($5, bride_email), bride_instagram = COALESCE($6, bride_instagram),
             groom_phone_primary = COALESCE($7, groom_phone_primary), groom_phone_secondary = COALESCE($8, groom_phone_secondary),
             groom_email = COALESCE($9, groom_email), groom_instagram = COALESCE($10, groom_instagram)
         WHERE id = $11`,
        [
          bride_name || null, groom_name || null,
          bride_phone_primary || null, bride_phone_secondary || null, bride_email || null, bride_instagram || null,
          groom_phone_primary || null, groom_phone_secondary || null, groom_email || null, groom_instagram || null,
          project.lead_id
        ]
      )

      // Synchronize client_onboarding_profiles table
      if (bride_name || bride_phone_primary || bride_phone_secondary || bride_email || bride_instagram || bride_selfie_url || bride_storage_key) {
        await client.query(
          `INSERT INTO client_onboarding_profiles (
             project_id, role, name, phone_primary, phone_secondary, email, instagram, selfie_url, storage_key, is_completed, updated_at
           ) VALUES ($1, 'bride', $2, $3, $4, $5, $6, $7, $8, false, NOW())
           ON CONFLICT (project_id, role)
           DO UPDATE SET
             name = COALESCE(EXCLUDED.name, client_onboarding_profiles.name),
             phone_primary = COALESCE(EXCLUDED.phone_primary, client_onboarding_profiles.phone_primary),
             phone_secondary = COALESCE(EXCLUDED.phone_secondary, client_onboarding_profiles.phone_secondary),
             email = COALESCE(EXCLUDED.email, client_onboarding_profiles.email),
             instagram = COALESCE(EXCLUDED.instagram, client_onboarding_profiles.instagram),
             selfie_url = COALESCE(EXCLUDED.selfie_url, client_onboarding_profiles.selfie_url),
             storage_key = COALESCE(EXCLUDED.storage_key, client_onboarding_profiles.storage_key),
             updated_at = NOW()`,
          [
            project.id,
            bride_name || null,
            bride_phone_primary || null,
            bride_phone_secondary || null,
            bride_email || null,
            bride_instagram || null,
            bride_selfie_url || null,
            bride_storage_key || null
          ]
        )
      }

      if (groom_name || groom_phone_primary || groom_phone_secondary || groom_email || groom_instagram || groom_selfie_url || groom_storage_key) {
        await client.query(
          `INSERT INTO client_onboarding_profiles (
             project_id, role, name, phone_primary, phone_secondary, email, instagram, selfie_url, storage_key, is_completed, updated_at
           ) VALUES ($1, 'groom', $2, $3, $4, $5, $6, $7, $8, false, NOW())
           ON CONFLICT (project_id, role)
           DO UPDATE SET
             name = COALESCE(EXCLUDED.name, client_onboarding_profiles.name),
             phone_primary = COALESCE(EXCLUDED.phone_primary, client_onboarding_profiles.phone_primary),
             phone_secondary = COALESCE(EXCLUDED.phone_secondary, client_onboarding_profiles.phone_secondary),
             email = COALESCE(EXCLUDED.email, client_onboarding_profiles.email),
             instagram = COALESCE(EXCLUDED.instagram, client_onboarding_profiles.instagram),
             selfie_url = COALESCE(EXCLUDED.selfie_url, client_onboarding_profiles.selfie_url),
             storage_key = COALESCE(EXCLUDED.storage_key, client_onboarding_profiles.storage_key),
             updated_at = NOW()`,
          [
            project.id,
            groom_name || null,
            groom_phone_primary || null,
            groom_phone_secondary || null,
            groom_email || null,
            groom_instagram || null,
            groom_selfie_url || null,
            groom_storage_key || null
          ]
        )
      }

      // Recompute project name
      let newProjectName = ''
      if (bride_name && groom_name) {
        newProjectName = `${bride_name.trim().split(' ')[0]} & ${groom_name.trim().split(' ')[0]}`
      } else if (bride_name) {
        newProjectName = bride_name.trim()
      } else if (groom_name) {
        newProjectName = groom_name.trim()
      } else {
        const leadRes = await client.query('SELECT name FROM leads WHERE id = $1', [project.lead_id])
        newProjectName = leadRes.rows[0]?.name || 'Workspace'
      }

      await client.query('UPDATE projects SET name = $1 WHERE id = $2', [newProjectName, project.id])

      await client.query('COMMIT')
      return { success: true, projectName: newProjectName }
    } catch (err) {
      await client.query('ROLLBACK')
      req.log.error('Failed to update details:', err)
      throw err
    } finally {
      client.release()
    }
  })

  // POST /client-portal/:slug/events/:eventId
  // Updates tentative or empty event details and sets verified = true (requires completed onboarding)
  api.post('/client-portal/:slug/events/:eventId', async (req, reply) => {
    const { slug, eventId } = req.params
    const project = await checkAuth(req, reply, slug)
    if (!project) return

    const allowed = await requireCompletedOnboarding(project, reply)
    if (!allowed) return

    const { venue, pax, start_time, end_time, slot } = req.body || {}

    // Pax, timings, slot are required inputs and can't be empty
    if (!pax || !start_time || !end_time || !slot) {
      return reply.code(400).send({ error: 'PAX count, Start/End times, and Slot are required and cannot be empty.' })
    }

    // Check if event belongs to project and if it is verified
    const evRes = await pool.query(
      'SELECT is_verified FROM project_events WHERE id = $1 AND project_id = $2',
      [eventId, project.id]
    )

    if (evRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Event not found' })
    }

    if (evRes.rows[0].is_verified) {
      return reply.code(400).send({ error: 'Verified events cannot be modified. Please contact support.' })
    }

    // Update event and mark as verified since couple filled it in
    await pool.query(
      `UPDATE project_events
       SET venue = $1, pax = $2, start_time = $3, end_time = $4, slot = $5, is_verified = true
       WHERE id = $6 AND project_id = $7`,
      [venue || null, Number(pax), start_time, end_time, slot, eventId, project.id]
    )

    return { success: true }
  })

  // POST /client-portal/:slug/events/:eventId/verify
  // Marks an event verified (requires completed onboarding)
  api.post('/client-portal/:slug/events/:eventId/verify', async (req, reply) => {
    const { slug, eventId } = req.params
    const project = await checkAuth(req, reply, slug)
    if (!project) return

    const allowed = await requireCompletedOnboarding(project, reply)
    if (!allowed) return

    await pool.query(
      'UPDATE project_events SET is_verified = true WHERE id = $1 AND project_id = $2',
      [eventId, project.id]
    )

    return { success: true }
  })

  // POST /client-portal/:slug/invoice/verify
  // Marks the pricing/invoice verified (requires completed onboarding)
  api.post('/client-portal/:slug/invoice/verify', async (req, reply) => {
    const { slug } = req.params
    const project = await checkAuth(req, reply, slug)
    if (!project) return

    const allowed = await requireCompletedOnboarding(project, reply)
    if (!allowed) return

    await pool.query(
      'UPDATE invoices SET is_verified = true WHERE project_id = $1',
      [project.id]
    )

    return { success: true }
  })

  // Helper: Validate selfie image with MyCircle AI face detection engine
  async function validateSelfieWithMyCircle(imageBuffer, filename = 'selfie.jpg') {
    const myCircleUrl = process.env.MYCIRCLE_API_URL || 'https://mycircle.mistyvisuals.com'
    const formData = new FormData()
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' })
    formData.append('file', blob, filename)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 7000)

    try {
      const res = await fetch(`${myCircleUrl}/api/gallery/public/validate-face`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      })
      clearTimeout(timer)

      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        return {
          valid: false,
          error: data.error || 'Failed to validate face on selfie'
        }
      }
      return { valid: true }
    } catch (err) {
      clearTimeout(timer)
      console.warn('[validateSelfieWithMyCircle] Service call failed/timed out:', err.message)
      // Non-blocking on network failure so user is not stuck if remote API is down
      return { valid: true, warning: 'Validation service unavailable' }
    }
  }

  // POST /client-portal/:slug/onboarding/upload-selfie
  // Uploads, optimizes, and verifies a selfie image using MyCircle AI face detection (SEC-01, SEC-02, SEC-03, SEC-07)
  api.post('/client-portal/:slug/onboarding/upload-selfie', async (req, reply) => {
    const { slug } = req.params
    const project = await checkAuth(req, reply, slug)
    if (!project) return

    // Upload rate limiting per project: max 10 uploads in 10 minutes
    if (!checkUploadRateLimit(project.id)) {
      return reply.code(429).send({ error: 'Upload rate limit exceeded. Please wait a few minutes before trying again.' })
    }

    // Multipart request level limit (25 MB) enforced before buffering (SEC-07)
    let data
    try {
      data = await req.file({ limits: { fileSize: 25 * 1024 * 1024 } })
    } catch (multipartErr) {
      return reply.code(400).send({ error: 'File upload error: ' + multipartErr.message })
    }

    if (!data) {
      return reply.code(400).send({ error: 'No selfie image provided' })
    }

    if (data.file && data.file.truncated) {
      return reply.code(400).send({ error: 'Selfie must be under 25MB' })
    }

    try {
      const rawBuffer = await data.toBuffer()
      if (rawBuffer.length === 0) {
        return reply.code(400).send({ error: 'Uploaded file is empty' })
      }
      if (rawBuffer.length > 25 * 1024 * 1024) {
        return reply.code(400).send({ error: 'Selfie must be under 25MB' })
      }

      const mimeType = (data.mimetype || 'image/jpeg').toLowerCase()
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
      if (!allowedMimes.includes(mimeType)) {
        return reply.code(400).send({ error: 'Please upload a valid image file (JPG, PNG, WebP, or HEIC)' })
      }

      // Fail-closed Sharp decoding and dimension verification (SEC-03)
      let optimizedBuffer
      try {
        const sharp = require('sharp')
        const image = sharp(rawBuffer, {
          failOnError: true,
          limitInputPixels: 4096 * 4096 // 16 megapixels max to prevent decompression bombs
        })

        const metadata = await image.metadata()
        const safeFormats = ['jpeg', 'png', 'webp', 'heif', 'avif', 'tiff']
        if (!metadata.format || !safeFormats.includes(metadata.format)) {
          return reply.code(400).send({ error: 'Unsupported or unreadable image format' })
        }

        if (!metadata.width || !metadata.height || metadata.width < 50 || metadata.height < 50) {
          return reply.code(400).send({ error: 'Image dimensions are too small' })
        }
        if (metadata.width > 8000 || metadata.height > 8000) {
          return reply.code(400).send({ error: 'Image dimensions are excessively large' })
        }

        optimizedBuffer = await image
          .rotate()
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85, mozjpeg: true })
          .toBuffer()

        if (!optimizedBuffer || optimizedBuffer.length === 0) {
          return reply.code(400).send({ error: 'Failed to process image' })
        }
      } catch (sharpErr) {
        req.log.warn('Sharp decoding failed (fail-closed): ' + sharpErr.message)
        // FAIL CLOSED: Never fall back to storing the unvalidated rawBuffer!
        return reply.code(400).send({ error: 'Corrupt or invalid image file. Please upload a genuine photo.' })
      }

      // Face validation via MyCircle AI engine
      // SEC-02: Only bypass if explicitly in test environment (NODE_ENV === 'test')
      const isTestEnv = process.env.NODE_ENV === 'test'
      const shouldBypass = isTestEnv && req.headers['x-bypass-face-validation'] === 'true'
      if (!shouldBypass) {
        const valRes = await validateSelfieWithMyCircle(optimizedBuffer, 'selfie.jpg')
        if (!valRes.valid) {
          return reply.code(400).send({ error: valRes.error })
        }
      }

      const roleParam = (req.query?.role || 'selfie').replace(/[^a-zA-Z0-9_-]/g, '')
      const filename = `selfie_${roleParam}_${Date.now()}.jpg`

      // Store in dedicated private storage (SEC-01)
      const uploadRes = await uploadPrivateSelfie(optimizedBuffer, filename, project.id, 'image/jpeg')

      const selfieEndpoint = `/api/client-portal/${slug}/selfie/${roleParam}?t=${Date.now()}`

      return {
        success: true,
        selfie_url: selfieEndpoint,
        storage_key: uploadRes.storageKey
      }
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to upload selfie' })
    }
  })

  // POST /client-portal/:slug/onboarding/submit
  // Submits onboarding form for bride or groom independently in an atomic PostgreSQL transaction (DATA-01)
  api.post('/client-portal/:slug/onboarding/submit', async (req, reply) => {
    const { slug } = req.params
    const project = await checkAuth(req, reply, slug)
    if (!project) return

    const {
      role,
      name,
      phone_primary,
      phone_secondary,
      email,
      instagram,
      selfie_url,
      storage_key
    } = req.body || {}

    if (!role || !['bride', 'groom'].includes(role.toLowerCase())) {
      return reply.code(400).send({ error: 'Role must be either "bride" or "groom"' })
    }
    const cleanRole = role.toLowerCase()

    const rawPhone = (phone_primary || '').trim()
    const rawPhoneSec = (phone_secondary || '').trim()
    const rawEmail = (email || '').trim()
    let cleanInsta = (instagram || '').trim()
    const cleanSelfie = (selfie_url || '').trim()

    // 1. Validate Primary Phone Number
    const phoneCheck = validatePhoneNumber(rawPhone, 'Primary phone')
    if (!phoneCheck.valid) {
      return reply.code(400).send({ error: phoneCheck.error })
    }
    const cleanPhone = phoneCheck.formatted

    // 2. Validate Secondary Phone Number (optional, but if present must be valid)
    let cleanPhoneSec = null
    if (rawPhoneSec) {
      const phoneSecCheck = validatePhoneNumber(rawPhoneSec, 'Secondary phone')
      if (!phoneSecCheck.valid) {
        return reply.code(400).send({ error: phoneSecCheck.error })
      }
      if (phoneSecCheck.formatted === phoneCheck.formatted) {
        return reply.code(400).send({ error: 'Secondary phone number must be different from primary phone number.' })
      }
      cleanPhoneSec = phoneSecCheck.formatted
    }

    // 3. Validate Email Address
    const emailCheck = validateEmail(rawEmail)
    if (!emailCheck.valid) {
      return reply.code(400).send({ error: emailCheck.error })
    }
    const cleanEmail = emailCheck.clean

    // 4. Validate Instagram Handle
    if (!cleanInsta) {
      return reply.code(400).send({ error: 'Instagram ID is required.' })
    }
    if (cleanInsta.startsWith('@')) {
      cleanInsta = cleanInsta.substring(1).trim()
    }
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(cleanInsta)) {
      return reply.code(400).send({ error: 'Please enter a valid Instagram handle (letters, numbers, underscores, and dots only).' })
    }

    // 5. Validate Selfie
    if (!cleanSelfie) {
      return reply.code(400).send({ error: 'Reference selfie is required.' })
    }

    // Wrap both writes and synchronization in a single PostgreSQL transaction (DATA-01)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Fetch existing name from leads or use submitted name
      const leadRes = await client.query(
        `SELECT bride_name, groom_name FROM leads WHERE id = $1`,
        [project.lead_id]
      )
      const lead = leadRes.rows[0] || {}
      const defaultName = cleanRole === 'bride'
        ? (lead.bride_name || 'Bride')
        : (lead.groom_name || 'Groom')
      const personName = (name && typeof name === 'string' && name.trim()) ? name.trim() : defaultName

      // Check existing storage_key for old selfie cleanup (DATA-03 / SEC-01)
      const prevRes = await client.query(
        `SELECT storage_key FROM client_onboarding_profiles WHERE project_id = $1 AND role = $2`,
        [project.id, cleanRole]
      )
      const prevStorageKey = prevRes.rows[0]?.storage_key || null

      let assignedStorageKey = storage_key || null
      if (!assignedStorageKey && prevStorageKey) {
        assignedStorageKey = prevStorageKey
      }

      const secureSelfieUrl = `/api/client-portal/${slug}/selfie/${cleanRole}`

      // Upsert into client_onboarding_profiles
      const upsertRes = await client.query(
        `INSERT INTO client_onboarding_profiles (
           project_id, role, name, phone_primary, phone_secondary, email, instagram, selfie_url, storage_key, is_completed, completed_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW())
         ON CONFLICT (project_id, role)
         DO UPDATE SET
           name = EXCLUDED.name,
           phone_primary = EXCLUDED.phone_primary,
           phone_secondary = EXCLUDED.phone_secondary,
           email = EXCLUDED.email,
           instagram = EXCLUDED.instagram,
           selfie_url = EXCLUDED.selfie_url,
           storage_key = COALESCE(EXCLUDED.storage_key, client_onboarding_profiles.storage_key),
           is_completed = true,
           completed_at = COALESCE(client_onboarding_profiles.completed_at, NOW()),
           updated_at = NOW()
         RETURNING *`,
        [
          project.id,
          cleanRole,
          personName,
          cleanPhone,
          cleanPhoneSec || null,
          cleanEmail,
          cleanInsta,
          secureSelfieUrl,
          assignedStorageKey
        ]
      )

      // Synchronize to leads table (Role separation strictly preserved)
      if (cleanRole === 'bride') {
        await client.query(
          `UPDATE leads
           SET bride_name = $1,
               bride_phone_primary = $2,
               bride_phone_secondary = COALESCE($3, bride_phone_secondary),
               bride_email = $4,
               bride_instagram = $5
           WHERE id = $6`,
          [personName, cleanPhone, cleanPhoneSec || null, cleanEmail, cleanInsta, project.lead_id]
        )
      } else {
        await client.query(
          `UPDATE leads
           SET groom_name = $1,
               groom_phone_primary = $2,
               groom_phone_secondary = COALESCE($3, groom_phone_secondary),
               groom_email = $4,
               groom_instagram = $5
           WHERE id = $6`,
          [personName, cleanPhone, cleanPhoneSec || null, cleanEmail, cleanInsta, project.lead_id]
        )
      }

      // Check full onboarding completion across both roles
      const allProfilesRes = await client.query(
        `SELECT role, name, is_completed FROM client_onboarding_profiles WHERE project_id = $1`,
        [project.id]
      )
      const brideProf = allProfilesRes.rows.find(r => r.role === 'bride' && r.is_completed)
      const groomProf = allProfilesRes.rows.find(r => r.role === 'groom' && r.is_completed)
      const isFullyCompleted = Boolean(brideProf && groomProf)

      // Project display name synchronization (Item 12)
      if (isFullyCompleted && brideProf?.name && groomProf?.name) {
        const projRes = await client.query(`SELECT name FROM projects WHERE id = $1`, [project.id])
        const currentName = projRes.rows[0]?.name || ''
        const isDefaultOrPlaceholder = !currentName ||
          currentName === 'Bride & Groom' ||
          currentName.toLowerCase().startsWith('project ') ||
          currentName === 'Unnamed Project'

        if (isDefaultOrPlaceholder) {
          const brideFirst = brideProf.name.trim().split(/\s+/)[0]
          const groomFirst = groomProf.name.trim().split(/\s+/)[0]
          const syncName = `${brideFirst} & ${groomFirst}`
          await client.query(`UPDATE projects SET name = $1 WHERE id = $2`, [syncName, project.id])
        }
      }

      await client.query('COMMIT')

      // Safe post-commit selfie cleanup: delete old selfie only after successful commit
      if (assignedStorageKey && prevStorageKey && assignedStorageKey !== prevStorageKey) {
        try {
          await deletePrivateSelfie(prevStorageKey)
        } catch (delErr) {
          req.log.warn(`[Cleanup] Failed to delete replaced selfie ${prevStorageKey}: ` + delErr.message)
        }
      }

      return {
        success: true,
        role: cleanRole,
        profile: upsertRes.rows[0],
        isFullyCompleted
      }
    } catch (err) {
      await client.query('ROLLBACK')
      req.log.error('Transaction rollback in onboarding submit:', err)
      throw err
    } finally {
      client.release()
    }
  })

  // POST /client-portal/:slug/logout
  api.post('/client-portal/:slug/logout', async (req, reply) => {
    reply.clearCookie('mv_client_auth', { path: '/' })
    return { success: true }
  })
}
