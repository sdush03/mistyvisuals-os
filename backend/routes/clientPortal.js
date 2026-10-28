module.exports = async function(api, opts) {
  const { pool } = opts

  // POST /client-portal/:slug/verify
  // Verifies the passcode and sets a cookie
  api.post('/client-portal/:slug/verify', async (req, reply) => {
    const { slug } = req.params
    const { passcode } = req.body || {}

    if (!passcode) {
      return reply.code(400).send({ error: 'Passcode is required' })
    }

    const r = await pool.query(
      `SELECT id, passcode FROM projects WHERE slug = $1`,
      [slug]
    )

    if (r.rows.length === 0) {
      return reply.code(404).send({ error: 'Portal not found' })
    }

    const project = r.rows[0]
    if (project.passcode !== passcode) {
      return reply.code(401).send({ error: 'Invalid passcode' })
    }

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
        gallery
      }
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

  // POST /client-portal/:slug/details
  // Updates client bride/groom names and contact info
  api.post('/client-portal/:slug/details', async (req, reply) => {
    const { slug } = req.params
    const project = await checkAuth(req, reply, slug)
    if (!project) return

    const {
      bride_name, groom_name,
      bride_phone_primary, bride_phone_secondary, bride_email, bride_instagram,
      groom_phone_primary, groom_phone_secondary, groom_email, groom_instagram
    } = req.body || {}

    // Update leads table (preserve secondary phone numbers if omitted from request)
    await pool.query(
      `UPDATE leads
       SET bride_name = $1, groom_name = $2,
           bride_phone_primary = $3, bride_phone_secondary = COALESCE($4, bride_phone_secondary), bride_email = $5, bride_instagram = $6,
           groom_phone_primary = $7, groom_phone_secondary = COALESCE($8, groom_phone_secondary), groom_email = $9, groom_instagram = $10
       WHERE id = $11`,
      [
        bride_name || null, groom_name || null,
        bride_phone_primary || null, bride_phone_secondary || null, bride_email || null, bride_instagram || null,
        groom_phone_primary || null, groom_phone_secondary || null, groom_email || null, groom_instagram || null,
        project.lead_id
      ]
    )

    // Recompute project name
    let newProjectName = ''
    if (bride_name && groom_name) {
      newProjectName = `${bride_name.trim().split(' ')[0]} & ${groom_name.trim().split(' ')[0]}`
    } else if (bride_name) {
      newProjectName = bride_name.trim()
    } else if (groom_name) {
      newProjectName = groom_name.trim()
    } else {
      const leadRes = await pool.query('SELECT name FROM leads WHERE id = $1', [project.lead_id])
      newProjectName = leadRes.rows[0]?.name || 'Workspace'
    }

    await pool.query('UPDATE projects SET name = $1 WHERE id = $2', [newProjectName, project.id])

    return { success: true, projectName: newProjectName }
  })

  // POST /client-portal/:slug/events/:eventId
  // Updates tentative or empty event details and sets verified = true
  api.post('/client-portal/:slug/events/:eventId', async (req, reply) => {
    const { slug, eventId } = req.params
    const project = await checkAuth(req, reply, slug)
    if (!project) return

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
  // Marks an event verified
  api.post('/client-portal/:slug/events/:eventId/verify', async (req, reply) => {
    const { slug, eventId } = req.params
    const project = await checkAuth(req, reply, slug)
    if (!project) return

    await pool.query(
      'UPDATE project_events SET is_verified = true WHERE id = $1 AND project_id = $2',
      [eventId, project.id]
    )

    return { success: true }
  })

  // POST /client-portal/:slug/invoice/verify
  // Marks the pricing/invoice verified
  api.post('/client-portal/:slug/invoice/verify', async (req, reply) => {
    const { slug } = req.params
    const project = await checkAuth(req, reply, slug)
    if (!project) return

    await pool.query(
      'UPDATE invoices SET is_verified = true WHERE project_id = $1',
      [project.id]
    )

    return { success: true }
  })

  // POST /client-portal/:slug/logout
  api.post('/client-portal/:slug/logout', async (req, reply) => {
    reply.clearCookie('mv_client_auth', { path: '/' })
    return { success: true }
  })
}
