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
              p.is_destination, p.lead_id, p.created_at,
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

    // Project
    const projRes = await pool.query(
      `SELECT p.*,
              u.name AS project_manager_name,
              u.nickname AS project_manager_nickname,
              l.name AS lead_name
       FROM projects p
       LEFT JOIN users u ON u.id = p.project_manager_id
       LEFT JOIN leads l ON l.id = p.lead_id
       WHERE p.id = $1`,
      [id]
    )
    if (!projRes.rows.length) {
      return reply.code(404).send({ error: 'Project not found' })
    }
    const project = projRes.rows[0]

    // Events
    const eventsRes = await pool.query(
      `SELECT * FROM project_events WHERE project_id = $1 ORDER BY event_date ASC, created_at ASC`,
      [id]
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
      [id]
    )

    // Checklist
    const checkRes = await pool.query(
      `SELECT * FROM project_checklist WHERE project_id = $1 ORDER BY phase ASC, created_at ASC`,
      [id]
    )

    // Invoice
    const invoiceRes = await pool.query(
      `SELECT i.*, 
        (SELECT json_agg(ili.*) FROM invoice_line_items ili WHERE ili.invoice_id = i.id) as line_items,
        (SELECT json_agg(ips.* ORDER BY ips.step_order) FROM invoice_payment_schedule ips WHERE ips.invoice_id = i.id) as payment_schedule
       FROM invoices i
       WHERE i.project_id = $1`,
      [id]
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
    const { status, notes, project_manager_id } = req.body || {}

    const validStatuses = ['upcoming', 'ongoing', 'completed', 'archived']

    // Build dynamic SET clause
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

    if (sets.length === 0) {
      return reply.code(400).send({ error: 'No fields to update' })
    }

    params.push(id)
    const r = await pool.query(
      `UPDATE projects SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )

    if (!r.rows.length) {
      return reply.code(404).send({ error: 'Project not found' })
    }

    console.log(`[projects] Updated project ${id}`)
    return { success: true, data: r.rows[0] }
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
