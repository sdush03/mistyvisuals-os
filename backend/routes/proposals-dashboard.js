const { prisma } = require('../modules/quotation/prisma');

module.exports = async function(api, opts) {
  const {
    requireAuth,
    fastify,
    jwt,
    cookie,
    AUTH_COOKIE,
    pool,
  } = opts;

  /* ===================== PROPOSALS DASHBOARD ===================== */

  // Dashboard: all sent proposals with engagement data
  api.get('/proposals-dashboard', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    const isAdmin = Array.isArray(auth.roles) ? auth.roles.includes('admin') : auth.role === 'admin'
    let userFilter = ""
    let params = []
    if (!isAdmin) {
       params.push(auth.sub)
       userFilter = `WHERE l.assigned_user_id = $1`
    }

    const { rows } = await pool.query(`
      SELECT 
        ps.id,
        ps.proposal_token,
        ps.view_count,
        to_char((ps.last_viewed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+05:30"') AS last_viewed_at,
        to_char((ps.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+05:30"') AS sent_at,
        ps.expires_at,
        qv.id AS version_id,
        qv.version_number,
        qg.id AS group_id,
        qg.title AS quote_title,
        qg.lead_id,
        l.name AS lead_name,
        l.email AS lead_email,
        qv.status,
        l.status AS lead_status,
        ps.snapshot_json->'calculatedPrice' AS calculated_price,
        ps.snapshot_json->'salesOverridePrice' AS override_price,
        ps.snapshot_json->'draftData'->'hero'->'coupleNames' AS couple_names,
        ps.snapshot_json->'draftData'->'tiers' AS tiers,
        ps.snapshot_json->'draftData'->>'pricingMode' AS pricing_mode,
        ps.snapshot_json->'draftData'->>'selectedTierId' AS selected_tier_id,
        (SELECT COUNT(*)::int FROM proposal_views pv WHERE pv.proposal_snapshot_id = ps.id AND NOT EXISTS (SELECT 1 FROM known_internal_ips WHERE split_part(ip, ',', 1) = split_part(pv.ip, ',', 1)) AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE split_part(ip, ',', 1) = split_part(pv.ip, ',', 1) LIMIT 1)) AS total_views,
        (SELECT COUNT(DISTINCT pv.ip)::int FROM proposal_views pv WHERE pv.proposal_snapshot_id = ps.id AND NOT EXISTS (SELECT 1 FROM known_internal_ips WHERE split_part(ip, ',', 1) = split_part(pv.ip, ',', 1)) AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE split_part(ip, ',', 1) = split_part(pv.ip, ',', 1) LIMIT 1)) AS unique_views
      FROM proposal_snapshots ps
      JOIN quote_versions qv ON qv.id = ps.quote_version_id
      JOIN quote_groups qg ON qg.id = qv.quote_group_id
      JOIN leads l ON l.id = qg.lead_id
      ${userFilter ? userFilter : ''}
      ORDER BY ps.created_at DESC
    `, params)
    return rows
  })

  // Public: ingest engagement events from proposal viewer
  api.post('/proposals/:token/events', async (req, reply) => {
    const { token } = req.params
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null

    // If viewer has a valid CRM login cookie, they're staff — skip event logging
    try {
      const authToken = req.cookies && req.cookies[AUTH_COOKIE]
      if (authToken) {
        const decoded = fastify.jwt.verify(authToken)
        if (decoded && decoded.sub) {
          if (ip) pool.query('INSERT INTO known_internal_ips (ip) VALUES ($1) ON CONFLICT (ip) DO UPDATE SET last_seen_at = NOW()', [ip]).catch(() => {})
          return { ok: true }
        }
      }
    } catch (e) { /* not logged in — continue */ }

    const { rows } = await pool.query(
      'SELECT id FROM proposal_snapshots WHERE proposal_token = $1', [token]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Not found' })
    const snapshotId = rows[0].id
    const device = req.headers['user-agent'] || null
    const referrer = req.headers['referer'] || req.headers['referrer'] || null
    const body = req.body || {}
    const events = Array.isArray(body.events) ? body.events : [body]
    for (const evt of events) {
      await pool.query(
        `INSERT INTO proposal_events (proposal_snapshot_id, session_id, event_type, event_data, ip, device, referrer)
         SELECT $1, $2, $3, $4, $5, $6, $7
         WHERE NOT EXISTS (SELECT 1 FROM known_internal_ips WHERE split_part(ip, ',', 1) = split_part($5, ',', 1))
         AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE split_part(ip, ',', 1) = split_part($5, ',', 1) LIMIT 1)`,
        [snapshotId, evt.sessionId || 'unknown', evt.type || 'unknown', JSON.stringify(evt.data || {}), ip, device, referrer]
      )
    }
    return { ok: true }
  })

  // Detail: single proposal analytics with engagement score
  api.get('/proposals-dashboard/:id/analytics', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
     const isAdmin = Array.isArray(auth.roles) ? auth.roles.includes('admin') : auth.role === 'admin'
    const id = Number(req.params.id)

    const { rows: [proposal] } = await pool.query(`
      SELECT 
        ps.id, ps.proposal_token, ps.view_count,
        to_char((ps.last_viewed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+05:30"') AS last_viewed_at,
        to_char((ps.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+05:30"') AS sent_at,
        qg.title AS quote_title, qg.lead_id, qg.id AS quote_group_id, l.name AS lead_name,
        l.assigned_user_id,
        qv.status AS status,
        ps.snapshot_json->'calculatedPrice' AS calculated_price,
        ps.snapshot_json->'salesOverridePrice' AS override_price,
        ps.snapshot_json->'draftData'->'hero'->'coupleNames' AS couple_names,
        ps.snapshot_json->'draftData'->'tiers' AS tiers,
        ps.snapshot_json->'draftData'->>'pricingMode' AS pricing_mode,
        ps.snapshot_json->'draftData'->>'selectedTierId' AS selected_tier_id
      FROM proposal_snapshots ps
      JOIN quote_versions qv ON qv.id = ps.quote_version_id
      JOIN quote_groups qg ON qg.id = qv.quote_group_id
      JOIN leads l ON l.id = qg.lead_id
      WHERE ps.id = $1
    `, [id])
    if (!proposal) return reply.code(404).send({ error: 'Not found' })
    if (!isAdmin && auth && auth.sub && proposal.assigned_user_id !== auth.sub) {
      return reply.code(403).send({ error: 'Access denied' })
    }

    // View log
    const { rows: views } = await pool.query(
      `SELECT pv.id, pv.ip, pv.device, pv.duration_seconds,
              (pv.proposal_snapshot_id = $1) AS is_current_version,
              to_char((pv.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+05:30"') AS created_at
       FROM proposal_views pv
       JOIN proposal_snapshots ps ON ps.id = pv.proposal_snapshot_id
       JOIN quote_versions qv ON qv.id = ps.quote_version_id
       WHERE qv.quote_group_id = $2
       AND NOT EXISTS (SELECT 1 FROM known_internal_ips WHERE split_part(ip, ',', 1) = split_part(pv.ip, ',', 1))
       AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE split_part(ip, ',', 1) = split_part(pv.ip, ',', 1) LIMIT 1)
       ORDER BY pv.created_at DESC`,
      [id, proposal.quote_group_id]
    )

    // Lead activities
    const { rows: activities } = await pool.query(
      `SELECT id, activity_type, metadata, 
              to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+05:30"') AS created_at,
              (metadata->>'token' = $2) AS is_current_version 
       FROM lead_activities 
       WHERE lead_id = $1 AND activity_type LIKE 'PROPOSAL_%'
       ORDER BY created_at DESC`,
      [proposal.lead_id, proposal.proposal_token]
    )

    // Engagement events
    const { rows: events } = await pool.query(
      `SELECT pe.id, pe.session_id, pe.event_type, pe.event_data, pe.ip, pe.device, pe.referrer,
              to_char((pe.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+05:30"') AS created_at,
              (pe.proposal_snapshot_id = $1) AS is_current_version
       FROM proposal_events pe
       JOIN proposal_snapshots ps ON ps.id = pe.proposal_snapshot_id
       JOIN quote_versions qv ON qv.id = ps.quote_version_id
       WHERE qv.quote_group_id = $2
       AND NOT EXISTS (SELECT 1 FROM known_internal_ips WHERE split_part(ip, ',', 1) = split_part(pe.ip, ',', 1))
       AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE split_part(ip, ',', 1) = split_part(pe.ip, ',', 1) LIMIT 1)
       ORDER BY pe.created_at DESC`, 
      [id, proposal.quote_group_id]
    )

    // Compute slide heatmap from events
    const slideMap = {}
    let totalDwell = 0
    const sessions = new Set()
    let addonRequested = false
    let accepted = typeof proposal.status === 'string' && proposal.status === 'ACCEPTED'
    for (const e of events) {
      sessions.add(e.session_id)
      if (e.event_type === 'slide_view' && e.event_data) {
        const slide = e.event_data.slide || 'unknown'
        const dwell = Number(e.event_data.dwellMs || 0)
        if (!slideMap[slide]) slideMap[slide] = { views: 0, totalDwellMs: 0 }
        slideMap[slide].views++
        slideMap[slide].totalDwellMs += dwell
        totalDwell += dwell
      }
      if (e.event_type === 'addon_request') addonRequested = true
    }

    // Engagement data — raw metrics, no scoring
    const uniqueDevices = new Set(views.map(v => v.device)).size
    const uniqueSessions = sessions.size
    const pricingDwell = (slideMap['pricing']?.totalDwellMs || 0) + (slideMap['Pricing']?.totalDwellMs || 0)

    // GeoIP: resolve unique IPs to cities (best-effort, non-blocking)
    const uniqueIPs = [...new Set(views.map(v => v.ip).filter(Boolean))]
    const geoMap = {}
    try {
      // ip-api.com allows batch of up to 100 IPs, free, no key needed
      const publicIPs = uniqueIPs.filter(ip => ip && !ip.startsWith('127.') && !ip.startsWith('192.168.') && !ip.startsWith('10.') && ip !== '::1')
      if (publicIPs.length > 0 && publicIPs.length <= 100) {
        const geoRes = await fetch('http://ip-api.com/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(publicIPs.map(ip => ({ query: ip, fields: 'query,city,regionName,country,status' }))),
        })
        if (geoRes.ok) {
          const geoData = await geoRes.json()
          for (const g of geoData) {
            if (g.status === 'success') {
              geoMap[g.query] = { city: g.city, region: g.regionName, country: g.country }
            }
          }
        }
      }
    } catch {}

    // Forwarded link detection: unique IP+device combinations
    const viewFingerprints = new Set()
    for (const v of views) {
      const fp = `${v.ip}|||${(v.device || '').substring(0, 50)}`
      viewFingerprints.add(fp)
    }
    const isForwarded = viewFingerprints.size > 1

    // Collect known internal IPs from admin audit log
    let internalIPs = []
    try {
      const ipRes = await pool.query(`
        SELECT DISTINCT ip FROM admin_audit_log WHERE ip IS NOT NULL
        UNION
        SELECT DISTINCT ip FROM known_internal_ips WHERE ip IS NOT NULL
      `)
      internalIPs = ipRes.rows.map(r => r.ip).filter(Boolean)
    } catch {}

    const totalReadSeconds = views.reduce((sum, v) => sum + (Number(v.duration_seconds) || 0), 0)

    return {
      proposal, views, activities, events,
      slideHeatmap: Object.entries(slideMap).map(([slide, d]) => ({ slide, ...d })),
      engagement: { uniqueSessions, uniqueDevices, totalDwellMs: totalDwell, pricingDwellMs: pricingDwell, addonRequested, accepted, totalReadSeconds },
      geoData: geoMap,
      isForwarded,
      uniqueFingerprints: viewFingerprints.size,
      internalIPs,
    }
  })


  api.patch('/proposals-dashboard/:id/status', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    const isAdmin = Array.isArray(auth.roles) ? auth.roles.includes('admin') : auth.role === 'admin'
    if (!isAdmin) return reply.code(403).send({ error: 'Access denied' })

    const id = Number(req.params.id)
    const { status } = req.body || {}
    if (!status) return reply.code(400).send({ error: 'Status is required' })

    // Update QuoteVersion status
    const { rows: [proposal] } = await pool.query(
      'SELECT qv.id AS quote_version_id, qg.lead_id FROM proposal_snapshots ps JOIN quote_versions qv ON qv.id = ps.quote_version_id JOIN quote_groups qg ON qg.id = qv.quote_group_id WHERE ps.id = $1',
      [id]
    )
    if (!proposal) return reply.code(404).send({ error: 'Proposal not found' })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('UPDATE quote_versions SET status = $1 WHERE id = $2', [status, proposal.quote_version_id])
      
      // If setting status to ACCEPTED, write a lead activity log and supersede older versions
      if (status === 'ACCEPTED') {
        await client.query(
          `UPDATE quote_versions SET status = 'SUPERSEDED'
           WHERE quote_group_id = (SELECT quote_group_id FROM quote_versions WHERE id = $1)
           AND id <> $1 AND status IN ('ACCEPTED', 'ADVANCE_AWAITING')`,
          [proposal.quote_version_id]
        )

        await client.query(
          `INSERT INTO lead_activities (lead_id, activity_type, metadata, created_at)
           VALUES ($1, 'status_change', $2, NOW())`,
          [proposal.lead_id, JSON.stringify({ notes: 'Quote marked as Accepted by admin.', log_type: 'activity' })]
        )
      }
      
      await client.query('COMMIT')
      return { success: true }
    } catch (err) {
      await client.query('ROLLBACK')
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to update status' })
    } finally {
      client.release()
    }
  })

  api.post('/proposals-dashboard/:id/convert-to-project', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    const isAdmin = Array.isArray(auth.roles) ? auth.roles.includes('admin') : auth.role === 'admin'
    if (!isAdmin) return reply.code(403).send({ error: 'Access denied' })

    const id = Number(req.params.id)

    // Fetch snapshot details
    const { rows: [proposal] } = await pool.query(`
      SELECT ps.proposal_token, ps.quote_version_id, qv.status, qg.lead_id, qg.id AS quote_group_id, qg.title AS quote_title
      FROM proposal_snapshots ps
      JOIN quote_versions qv ON qv.id = ps.quote_version_id
      JOIN quote_groups qg ON qg.id = qv.quote_group_id
      WHERE ps.id = $1
    `, [id])

    if (!proposal) return reply.code(404).send({ error: 'Proposal not found' })
    if (proposal.status !== 'ACCEPTED') {
      return reply.code(400).send({ error: 'Only accepted proposals can be converted to projects' })
    }

    // Check if project already exists for this lead, quote version, or quote group
    const { rows: existingProject } = await pool.query(
      'SELECT id FROM projects WHERE lead_id = $1 OR quote_version_id = $2 OR quote_group_id = $3',
      [proposal.lead_id, proposal.quote_version_id, proposal.quote_group_id]
    )
    if (existingProject.length > 0) {
      // Just make sure lead is Converted
      await pool.query("UPDATE leads SET status = 'Converted', updated_at = NOW() WHERE id = $1", [proposal.lead_id])
      return { success: true, message: 'Lead already converted to a project.', projectId: existingProject[0].id }
    }

    // Run transaction to convert lead to project
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE leads SET status = 'Converted', converted_at = COALESCE(converted_at, NOW()), updated_at = NOW() WHERE id = $1`, [proposal.lead_id])

      const { createProjectFromLead } = require('../utils/createProjectFromLead')
      const { projectId, invoiceResult } = await createProjectFromLead(proposal.lead_id, client)

      // If there is an advance amount, register it on the new invoice
      const version = await prisma.quoteVersion.findUnique({
        where: { id: proposal.quote_version_id }
      })

      if (invoiceResult && invoiceResult.invoiceId && invoiceResult.advanceAmount > 0) {
        await client.query(
          `INSERT INTO invoice_payments (invoice_id, amount, paid_at, method, note)
           VALUES ($1, $2, NOW(), 'manual', 'Advance payment confirmation')`,
          [invoiceResult.invoiceId, invoiceResult.advanceAmount]
        )
        await client.query(
          `UPDATE invoices SET advance_paid = TRUE, status = 'partial' WHERE id = $1`,
          [invoiceResult.invoiceId]
        )

        const desc = 'Advance payment - ' + (proposal.quote_title || `Lead ${proposal.lead_id}`)
        const catRes = await client.query(`SELECT id FROM finance_categories WHERE name = 'Package Advance' AND type = 'income' LIMIT 1`)
        const catId = catRes.rows.length ? catRes.rows[0].id : null

        await client.query(
          `INSERT INTO finance_transactions (amount, type, direction, category_id, description, date, project_uuid, metadata)
           VALUES ($1, 'income', 'in', $2, $3, NOW()::date, $4, $5)`,
          [
            invoiceResult.advanceAmount,
            catId,
            desc,
            projectId || null,
            JSON.stringify({ source: 'manual', invoice_id: invoiceResult.invoiceId })
          ]
        )
      }

      await client.query(
        `INSERT INTO lead_activities (lead_id, activity_type, metadata, created_at)
         VALUES ($1, 'status_change', $2, NOW())`,
        [proposal.lead_id, JSON.stringify({ notes: 'Lead converted manually. Project created.', log_type: 'activity' })]
      )

      await client.query('COMMIT')
      return { success: true, message: 'Project created successfully', projectId }
    } catch (txErr) {
      await client.query('ROLLBACK')
      req.log.error(txErr, '[convert-to-project] Transaction failed')
      return reply.code(500).send({ error: 'Failed to create project' })
    } finally {
      client.release()
    }
  })

}
