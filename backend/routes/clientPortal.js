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
      `SELECT id, name, status, start_date, end_date, city, is_destination
       FROM projects WHERE slug = $1`,
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
      return { success: true, locked: true }
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
      `SELECT i.id, i.invoice_number, i.status, i.issue_date, i.due_date, i.total_amount, i.advance_amount, i.advance_paid, i.balance_amount AS balance_due,
        (SELECT json_agg(ili.*) FROM invoice_line_items ili WHERE ili.invoice_id = i.id) as line_items,
        (SELECT json_agg(ips.* ORDER BY ips.step_order) FROM invoice_payment_schedule ips WHERE ips.invoice_id = i.id) as payment_schedule
       FROM invoices i
       WHERE i.project_id = $1`,
      [projectId]
    )

    return {
      success: true,
      locked: false,
      data: {
        project,
        events: eventsRes.rows,
        deliverables: delRes.rows,
        checklist: checkRes.rows,
        invoice: invoiceRes.rows[0] || null
      }
    }
  })

  // POST /client-portal/:slug/logout
  api.post('/client-portal/:slug/logout', async (req, reply) => {
    reply.clearCookie('mv_client_auth', { path: '/' })
    return { success: true }
  })
}
