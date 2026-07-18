module.exports = async function(api, opts) {
  const {
    requireAuth,
    requireAdmin,
    pool,
  } = opts;

  /* ===================== LIST PROJECTS ===================== */

  api.get('/projects', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    const { status } = req.query || {}

    let where = ''
    const params = []
    if (status) {
      params.push(status)
      where = `WHERE p.status = $${params.length}`
    }

    const r = await pool.query(
      `SELECT p.id, p.name, p.status, p.start_date, p.end_date, p.city,
              p.is_destination, p.lead_id, p.created_at, p.slug,
              u.name AS project_manager_name,
              u.nickname AS project_manager_nickname
       FROM projects p
       LEFT JOIN users u ON u.id = p.project_manager_id
       ${where}
       ORDER BY p.start_date ASC NULLS LAST, p.created_at DESC`,
      params
    )

    return { success: true, data: r.rows }
  })

  /* ===================== GET PROJECT ===================== */

  api.get('/projects/:id', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    const { id } = req.params

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    let queryWhere = 'WHERE p.id = $1'
    if (!uuidRegex.test(id)) {
      queryWhere = 'WHERE p.slug = $1 OR p.name = $1'
    }

    // Project
    const projRes = await pool.query(
      `SELECT p.*,
              u.name AS project_manager_name,
              u.nickname AS project_manager_nickname,
              l.name AS lead_name,
              l.phone_primary AS lead_phone,
              l.phone_secondary AS lead_phone_secondary,
              l.email AS lead_email,
              l.instagram AS lead_instagram,
              l.bride_name,
              l.bride_phone_primary,
              l.bride_phone_secondary,
              l.bride_email,
              l.bride_instagram,
              l.groom_name,
              l.groom_phone_primary,
              l.groom_phone_secondary,
              l.groom_email,
              l.groom_instagram
       FROM projects p
       LEFT JOIN users u ON u.id = p.project_manager_id
       LEFT JOIN leads l ON l.id = p.lead_id
       ${queryWhere}`,
      [id]
    )
    if (!projRes.rows.length) {
      return reply.code(404).send({ error: 'Project not found' })
    }
    const project = projRes.rows[0]
    const actualProjectId = project.id

    // Events
    const eventsRes = await pool.query(
      `SELECT * FROM project_events WHERE project_id = $1 ORDER BY event_date ASC, created_at ASC`,
      [actualProjectId]
    )

    // Team assignments (grouped by event)
    const eventIds = eventsRes.rows.map(e => e.id)
    let teamAssignments = []
    if (eventIds.length > 0) {
      const teamRes = await pool.query(
        `SELECT pta.*, u.name AS user_name, u.nickname AS user_nickname
         FROM project_team_assignments pta
         JOIN users u ON u.id = pta.user_id
         WHERE pta.project_event_id = ANY($1::uuid[])
         ORDER BY pta.created_at ASC`,
        [eventIds]
      )
      teamAssignments = teamRes.rows
    }

    // Deliverables
    const delRes = await pool.query(
      `SELECT * FROM project_deliverables WHERE project_id = $1 ORDER BY created_at ASC`,
      [actualProjectId]
    )

    // Checklist
    const checkRes = await pool.query(
      `SELECT * FROM project_checklist WHERE project_id = $1 ORDER BY phase ASC, created_at ASC`,
      [actualProjectId]
    )

    // Invoice
    const invoiceRes = await pool.query(
      `SELECT i.*, 
        (SELECT json_agg(ili.*) FROM invoice_line_items ili WHERE ili.invoice_id = i.id) as line_items,
        (SELECT json_agg(ips.* ORDER BY ips.step_order) FROM invoice_payment_schedule ips WHERE ips.invoice_id = i.id) as payment_schedule
       FROM invoices i
       WHERE i.project_id = $1`,
      [actualProjectId]
    )

    return {
      success: true,
      data: {
        project,
        events: eventsRes.rows,
        team_assignments: teamAssignments,
        deliverables: delRes.rows,
        checklist: checkRes.rows,
        invoice: invoiceRes.rows[0] || null,
      }
    }
  })

  /* ===================== UPDATE PROJECT ===================== */

  api.patch('/projects/:id', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    const { id } = req.params
    const {
      status, notes, project_manager_id, slug, passcode,
      city, start_date, end_date,
      bride_name, groom_name,
      bride_phone_primary, bride_phone_secondary, bride_email, bride_instagram,
      groom_phone_primary, groom_phone_secondary, groom_email, groom_instagram
    } = req.body || {}

    // Resolve actual project id first (can be UUID or slug)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    let projectRowRes;
    if (uuidRegex.test(id)) {
      projectRowRes = await pool.query('SELECT id, lead_id FROM projects WHERE id = $1', [id])
    } else {
      projectRowRes = await pool.query('SELECT id, lead_id FROM projects WHERE slug = $1', [id])
    }
    if (!projectRowRes.rows.length) {
      return reply.code(404).send({ error: 'Project not found' })
    }
    const actualProjectId = projectRowRes.rows[0].id
    const leadId = projectRowRes.rows[0].lead_id

    const validStatuses = ['upcoming', 'ongoing', 'completed', 'archived']

    // 1. Update Lead Profile details if present
    const leadSets = []
    const leadParams = []
    const addLeadParam = (val) => { leadParams.push(val); return `$${leadParams.length}` }

    if (bride_name !== undefined) leadSets.push(`bride_name = ${addLeadParam(bride_name || null)}`)
    if (groom_name !== undefined) leadSets.push(`groom_name = ${addLeadParam(groom_name || null)}`)
    if (bride_phone_primary !== undefined) leadSets.push(`bride_phone_primary = ${addLeadParam(bride_phone_primary || null)}`)
    if (bride_phone_secondary !== undefined) leadSets.push(`bride_phone_secondary = ${addLeadParam(bride_phone_secondary || null)}`)
    if (bride_email !== undefined) leadSets.push(`bride_email = ${addLeadParam(bride_email || null)}`)
    if (bride_instagram !== undefined) leadSets.push(`bride_instagram = ${addLeadParam(bride_instagram || null)}`)
    if (groom_phone_primary !== undefined) leadSets.push(`groom_phone_primary = ${addLeadParam(groom_phone_primary || null)}`)
    if (groom_phone_secondary !== undefined) leadSets.push(`groom_phone_secondary = ${addLeadParam(groom_phone_secondary || null)}`)
    if (groom_email !== undefined) leadSets.push(`groom_email = ${addLeadParam(groom_email || null)}`)
    if (groom_instagram !== undefined) leadSets.push(`groom_instagram = ${addLeadParam(groom_instagram || null)}`)

    if (leadSets.length > 0) {
      leadParams.push(leadId)
      await pool.query(
        `UPDATE leads SET ${leadSets.join(', ')} WHERE id = $${leadParams.length}`,
        leadParams
      )
    }

    // 2. Build dynamic SET clause for Projects table
    const sets = []
    const params = []
    const addParam = (value) => { params.push(value); return `$${params.length}` }

    if (status !== undefined) {
      if (!validStatuses.includes(status)) {
        return reply.code(400).send({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` })
      }
      sets.push(`status = ${addParam(status)}`)
    }
    if (notes !== undefined) {
      sets.push(`notes = ${addParam(notes)}`)
    }
    if (project_manager_id !== undefined) {
      sets.push(`project_manager_id = ${addParam(project_manager_id)}`)
    }
    if (city !== undefined) {
      sets.push(`city = ${addParam(city)}`)
    }
    if (start_date !== undefined) {
      sets.push(`start_date = ${addParam(start_date || null)}`)
    }
    if (end_date !== undefined) {
      sets.push(`end_date = ${addParam(end_date || null)}`)
    }
    if (slug !== undefined) {
      const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9\-]/g, '').trim()
      if (!cleanSlug) {
        return reply.code(400).send({ error: 'Slug cannot be empty' })
      }
      const RESERVED_SLUGS = [
        'login', 'logout', 'leads', 'projects', 'admin', 'api', 'approvals',
        'insights', 'sales', 'vendor', 'privacy', 'terms', 'refund',
        'follow-ups', 'contact', 'fb-ads', 'proposalanalytics', 'proforma', 'me'
      ]
      if (RESERVED_SLUGS.includes(cleanSlug)) {
        return reply.code(400).send({ error: 'This URL is reserved and cannot be used.' })
      }
      const checkRes = await pool.query(
        `SELECT id FROM projects WHERE slug = $1 AND id <> $2`,
        [cleanSlug, actualProjectId]
      )
      if (checkRes.rows.length > 0) {
        return reply.code(400).send({ error: 'This URL is already in use by another client.' })
      }
      sets.push(`slug = ${addParam(cleanSlug)}`)
    }
    if (passcode !== undefined) {
      const cleanPasscode = passcode.trim()
      if (!cleanPasscode) {
        return reply.code(400).send({ error: 'Passcode cannot be empty' })
      }
      sets.push(`passcode = ${addParam(cleanPasscode)}`)
    }

    // Auto-update project name if bride or groom names changed
    if (bride_name !== undefined || groom_name !== undefined) {
      // Get latest names
      const leadRes = await pool.query('SELECT name, bride_name, groom_name FROM leads WHERE id = $1', [leadId])
      const { bride_name: bName, groom_name: gName, name: lName } = leadRes.rows[0]
      let newProjName = ''
      if (bName && gName) {
        newProjName = `${bName.trim().split(' ')[0]} & ${gName.trim().split(' ')[0]}`
      } else if (bName) {
        newProjName = bName.trim()
      } else if (gName) {
        newProjName = gName.trim()
      } else {
        newProjName = lName || 'Workspace'
      }
      sets.push(`name = ${addParam(newProjName)}`)
    }

    if (sets.length === 0 && leadSets.length === 0) {
      return reply.code(400).send({ error: 'No fields to update' })
    }

    let updatedProject = null
    if (sets.length > 0) {
      params.push(actualProjectId)
      const r = await pool.query(
        `UPDATE projects SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      )
      updatedProject = r.rows[0]

      // Sync the new slug and qr token to the gallery_events table if a slug was updated
      if (slug !== undefined) {
        try {
          const { prisma } = require('../modules/quotation/prisma');
          const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9\-]/g, '').trim();
          await prisma.galleryEvent.updateMany({
            where: { projectId: actualProjectId },
            data: {
              slug: cleanSlug,
              qrToken: `${cleanSlug}_qr`
            }
          });
          console.log(`[projects] Synced new slug "${cleanSlug}" to gallery_events for project ${actualProjectId}`);
        } catch (err) {
          console.error(`[projects] Failed to sync slug to gallery_events:`, err);
        }
      }
    } else {
      const r = await pool.query('SELECT * FROM projects WHERE id = $1', [actualProjectId])
      updatedProject = r.rows[0]
    }

    // Reset invoice client verification status on any project changes
    await pool.query('UPDATE invoices SET is_verified = false WHERE project_id = $1', [actualProjectId])

    console.log(`[projects] Updated project ${actualProjectId}`)
    return { success: true, data: updatedProject }
  })

  /* ===================== PROJECT EVENT CRUD ===================== */

  // POST /projects/:id/events
  api.post('/projects/:id/events', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    const { id } = req.params
    const { event_type, event_date, pax, venue, venue_address, start_time, end_time, slot, notes } = req.body || {}

    // Resolve actual project ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    let projectRowRes;
    if (uuidRegex.test(id)) {
      projectRowRes = await pool.query('SELECT id FROM projects WHERE id = $1', [id])
    } else {
      projectRowRes = await pool.query('SELECT id FROM projects WHERE slug = $1', [id])
    }
    if (!projectRowRes.rows.length) {
      return reply.code(404).send({ error: 'Project not found' })
    }
    const actualProjectId = projectRowRes.rows[0].id

    const r = await pool.query(
      `INSERT INTO project_events (project_id, event_type, event_date, pax, venue, venue_address, start_time, end_time, slot, notes, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false) RETURNING *`,
      [actualProjectId, event_type, event_date || null, pax ? Number(pax) : null, venue, venue_address, start_time, end_time, slot, notes]
    )

    // Reset invoice verification
    await pool.query('UPDATE invoices SET is_verified = false WHERE project_id = $1', [actualProjectId])

    return { success: true, data: r.rows[0] }
  })

  // PUT /projects/events/:eventId
  api.put('/projects/events/:eventId', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    const { eventId } = req.params
    const { event_type, event_date, pax, venue, venue_address, start_time, end_time, slot, notes } = req.body || {}

    const r = await pool.query(
      `UPDATE project_events
       SET event_type = $1, event_date = $2, pax = $3, venue = $4, venue_address = $5, start_time = $6, end_time = $7, slot = $8, notes = $9, is_verified = false
       WHERE id = $10 RETURNING *`,
      [event_type, event_date || null, pax ? Number(pax) : null, venue, venue_address, start_time, end_time, slot, notes, eventId]
    )

    if (r.rows.length === 0) {
      return reply.code(404).send({ error: 'Event not found' })
    }

    const projectId = r.rows[0].project_id
    // Reset invoice verification
    await pool.query('UPDATE invoices SET is_verified = false WHERE project_id = $1', [projectId])

    return { success: true, data: r.rows[0] }
  })

  // DELETE /projects/events/:eventId
  api.delete('/projects/events/:eventId', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    const { eventId } = req.params

    const getProj = await pool.query('SELECT project_id FROM project_events WHERE id = $1', [eventId])
    if (getProj.rows.length === 0) {
      return reply.code(404).send({ error: 'Event not found' })
    }
    const projectId = getProj.rows[0].project_id

    await pool.query('DELETE FROM project_events WHERE id = $1', [eventId])

    // Reset invoice verification
    await pool.query('UPDATE invoices SET is_verified = false WHERE project_id = $1', [projectId])

    return { success: true }
  })

  /* ===================== ASSIGN TEAM MEMBER ===================== */

  api.post('/projects/events/:eventId/assign', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    const { eventId } = req.params
    const { user_id, role, call_time, wrap_time, notes } = req.body || {}

    if (!user_id || !role) {
      return reply.code(400).send({ error: 'user_id and role are required' })
    }

    const validRoles = ['photographer', 'cinematographer', 'drone', 'editor', 'album_designer']
    if (!validRoles.includes(role)) {
      return reply.code(400).send({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` })
    }

    // Verify event exists
    const evCheck = await pool.query(
      `SELECT id FROM project_events WHERE id = $1`,
      [eventId]
    )
    if (!evCheck.rows.length) {
      return reply.code(404).send({ error: 'Project event not found' })
    }

    const r = await pool.query(
      `INSERT INTO project_team_assignments (project_event_id, user_id, role, call_time, wrap_time, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [eventId, user_id, role, call_time || null, wrap_time || null, notes || null]
    )

    console.log(`[projects] Assigned user ${user_id} as ${role} to event ${eventId}`)
    return { success: true, data: r.rows[0] }
  })

  /* ===================== REMOVE TEAM ASSIGNMENT ===================== */

  api.delete('/projects/events/:eventId/assignments/:assignmentId', async (req, reply) => {
    const auth = requireAdmin(req, reply)
    if (!auth) return

    const { eventId, assignmentId } = req.params

    const r = await pool.query(
      `DELETE FROM project_team_assignments WHERE id = $1 AND project_event_id = $2 RETURNING id`,
      [assignmentId, eventId]
    )

    if (!r.rows.length) {
      return reply.code(404).send({ error: 'Assignment not found' })
    }

    console.log(`[projects] Removed assignment ${assignmentId} from event ${eventId}`)
    return { success: true }
  })

  /* ===================== UPDATE DELIVERABLE ===================== */

  api.patch('/projects/deliverables/:id', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    const { id } = req.params
    const { status, due_date, notes } = req.body || {}

    const validStatuses = ['pending', 'in_progress', 'client_preview', 'revision', 'delivered']

    const sets = []
    const params = []
    const addParam = (value) => { params.push(value); return `$${params.length}` }

    if (status !== undefined) {
      if (!validStatuses.includes(status)) {
        return reply.code(400).send({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` })
      }
      sets.push(`status = ${addParam(status)}`)
    }
    if (due_date !== undefined) {
      sets.push(`due_date = ${addParam(due_date)}`)
    }
    if (notes !== undefined) {
      sets.push(`notes = ${addParam(notes)}`)
    }

    if (sets.length === 0) {
      return reply.code(400).send({ error: 'No fields to update' })
    }

    params.push(id)
    const r = await pool.query(
      `UPDATE project_deliverables SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )

    if (!r.rows.length) {
      return reply.code(404).send({ error: 'Deliverable not found' })
    }

    console.log(`[projects] Updated deliverable ${id}`)
    return { success: true, data: r.rows[0] }
  })

  /* ===================== UPDATE CHECKLIST ITEM ===================== */

  api.patch('/projects/checklist/:id', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    const { id } = req.params
    const { is_completed } = req.body || {}

    if (is_completed === undefined) {
      return reply.code(400).send({ error: 'is_completed is required' })
    }

    const r = await pool.query(
      `UPDATE project_checklist SET is_completed = $1 WHERE id = $2 RETURNING *`,
      [!!is_completed, id]
    )

    if (!r.rows.length) {
      return reply.code(404).send({ error: 'Checklist item not found' })
    }

    console.log(`[projects] Toggled checklist ${id} to ${is_completed}`)
    return { success: true, data: r.rows[0] }
  })

}
