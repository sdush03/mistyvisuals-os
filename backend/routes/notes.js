module.exports = async function(api, opts) {
  const {
    addDaysYMD,
    getAuthFromRequest,
    runMetricsJob,
    isMetricsRunning,
    dateToYMD,
    pool,
  } = opts;

  /* ===================== NOTES ===================== */
  api.get('/leads/:id/notes', async (req, reply) => {
    const r = await pool.query(
      `SELECT id, lead_id, note_text, status_at_time, created_at
     FROM lead_notes
     WHERE lead_id=$1
     ORDER BY created_at ASC`,
      [req.params.id]
    )

    return r.rows
  })

  api.post('/leads/:id/notes', async (req, reply) => {
    const { note_text } = req.body || {}
    const auth = getAuthFromRequest(req)
    if (!note_text || !String(note_text).trim()) {
      return reply.code(400).send({ error: 'Note text is required' })
    }
    if (String(note_text).trim().length > 1000) {
      return reply.code(400).send({ error: 'Note must be 1000 characters or fewer' })
    }

    const r = await pool.query(
      `INSERT INTO lead_notes (lead_id, note_text, status_at_time, user_id)
     SELECT $1, $2, status, $3
     FROM leads
     WHERE id = $1
     RETURNING id, lead_id, note_text, status_at_time, created_at`,
      [req.params.id, String(note_text).trim(), auth?.sub || null]
    )

    if (!r.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }

    return r.rows[0]
  })

  api.patch('/leads/:id/notes/:noteId', async (req, reply) => {
    const { id, noteId } = req.params
    const { note_text } = req.body || {}
    if (!note_text || !String(note_text).trim()) {
      return reply.code(400).send({ error: 'Note text is required' })
    }
    if (String(note_text).trim().length > 1000) {
      return reply.code(400).send({ error: 'Note must be 1000 characters or fewer' })
    }

    const r = await pool.query(
      `UPDATE lead_notes
     SET note_text = $1
     WHERE id = $2 AND lead_id = $3
     RETURNING id, lead_id, note_text, status_at_time, created_at`,
      [String(note_text).trim(), noteId, id]
    )

    if (!r.rows.length) {
      return reply.code(404).send({ error: 'Note not found' })
    }

    return r.rows[0]
  })

  api.get('/leads/:id/activities', async (req, reply) => {
    try {
      const r = await pool.query(
        `SELECT
         a.id,
         a.lead_id,
         a.activity_type,
         a.metadata,
         a.created_at,
         a.user_id,
         u.name AS user_name,
         u.nickname AS user_nickname,
         u.email AS user_email
       FROM lead_activities a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.lead_id=$1
       ORDER BY a.created_at DESC`,
        [req.params.id]
      )
      return r.rows
    } catch (err) {
      return reply.code(500).send({ error: 'Unable to load activities' })
    }
  })

  api.get('/leads/:id/metrics', async (req, reply) => {
    const r = await pool.query(
      `SELECT
       lead_id,
       total_followups,
       connected_followups,
       not_connected_count,
       avg_days_between_followups,
       total_time_spent_seconds,
       last_activity_at,
       days_to_first_contact,
       days_to_conversion,
       reopen_count
     FROM lead_metrics
     WHERE lead_id=$1`,
      [req.params.id]
    )
    if (!r.rows.length) {
      return reply.code(404).send({ error: 'Metrics not found' })
    }
    return r.rows[0]
  })

  api.get('/admin/activity-summary', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
    if (auth.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })

    const rawStart = req.query?.start ? String(req.query.start) : null
    const rawEnd = req.query?.end ? String(req.query.end) : null

    const normalizeDate = (value) => {
      if (!value) return null
      const trimmed = value.trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
      const parsed = new Date(`${trimmed}T00:00:00`)
      if (Number.isNaN(parsed.getTime())) return null
      return trimmed
    }

    const today = dateToYMD(new Date())
    const defaultStart = addDaysYMD(-6)
    const startDate = normalizeDate(rawStart) || defaultStart
    const endDate = normalizeDate(rawEnd) || today

    if (!startDate || !endDate) {
      return reply.code(400).send({ error: 'Invalid date range' })
    }
    if (startDate > endDate) {
      return reply.code(400).send({ error: 'Start date must be before end date' })
    }

    const rawPage = req.query?.page ? Number(req.query.page) : 1
    const rawPageSize = req.query?.page_size ? Number(req.query.page_size) : 50
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
    const pageSize =
      Number.isFinite(rawPageSize) && rawPageSize > 0
        ? Math.min(200, Math.max(20, Math.floor(rawPageSize)))
        : 50
    const offset = (page - 1) * pageSize

    const rawUserFilter = req.query?.user_id ? String(req.query.user_id) : null
    let userFilterId = null
    let systemOnly = false
    if (rawUserFilter) {
      if (rawUserFilter === 'system') {
        systemOnly = true
      } else if (/^\d+$/.test(rawUserFilter)) {
        userFilterId = Number(rawUserFilter)
      } else {
        return reply.code(400).send({ error: 'Invalid user filter' })
      }
    }

    const baseParams = [startDate, endDate]
    let activityUserClause = ''
    let notesUserClause = ''
    if (userFilterId !== null) {
      baseParams.push(userFilterId)
      const idx = baseParams.length
      activityUserClause = `AND a.user_id = $${idx}`
      notesUserClause = `AND n.user_id = $${idx}`
    } else if (systemOnly) {
      activityUserClause = `AND (a.user_id IS NULL OR a.metadata->>'system' = 'true')`
      notesUserClause = `AND 1=0`
    }

    const countRes = await pool.query(
      `
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT id
      FROM lead_activities a
      WHERE (a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
      ${activityUserClause}
      UNION ALL
      SELECT id
      FROM lead_notes n
      WHERE (n.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
      ${notesUserClause}
    ) t
    `,
      baseParams
    )

    const rowsParams = [...baseParams, pageSize, offset]
    const limitIdx = baseParams.length + 1
    const offsetIdx = baseParams.length + 2

    const rowsRes = await pool.query(
      `
    SELECT *
    FROM (
      SELECT
        a.id,
        'activity'::text AS source,
        a.lead_id,
        l.lead_number,
        l.name AS lead_name,
        a.activity_type,
        a.metadata,
        a.created_at,
        a.user_id,
        u.name AS user_name,
        u.nickname AS user_nickname,
        u.email AS user_email,
        u.role AS user_role,
        CASE WHEN a.metadata->>'system' = 'true' THEN true ELSE false END AS is_system,
        NULL::text AS note_text
      FROM lead_activities a
      LEFT JOIN leads l ON l.id = a.lead_id
      LEFT JOIN users u ON u.id = a.user_id
      WHERE (a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
      ${activityUserClause}
      UNION ALL
      SELECT
        n.id,
        'note'::text AS source,
        n.lead_id,
        l.lead_number,
        l.name AS lead_name,
        'note_added'::text AS activity_type,
        NULL::jsonb AS metadata,
        n.created_at,
        n.user_id,
        u.name AS user_name,
        u.nickname AS user_nickname,
        u.email AS user_email,
        u.role AS user_role,
        false AS is_system,
        n.note_text
      FROM lead_notes n
      LEFT JOIN leads l ON l.id = n.lead_id
      LEFT JOIN users u ON u.id = n.user_id
      WHERE (n.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
      ${notesUserClause}
    ) t
    ORDER BY created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
      rowsParams
    )

    const summaryRes = await pool.query(
      `
    SELECT
      t.user_id,
      t.user_name,
      t.user_nickname,
      t.user_email,
      t.user_role,
      t.activity_type,
      COUNT(*)::int AS count
    FROM (
      SELECT
        a.user_id,
        u.name AS user_name,
        u.nickname AS user_nickname,
        u.email AS user_email,
        u.role AS user_role,
        a.activity_type
      FROM lead_activities a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE (a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
      ${activityUserClause}
      UNION ALL
      SELECT
        n.user_id,
        u.name AS user_name,
        u.nickname AS user_nickname,
        u.email AS user_email,
        u.role AS user_role,
        'note_added'::text AS activity_type
      FROM lead_notes n
      LEFT JOIN users u ON u.id = n.user_id
      WHERE (n.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
      ${notesUserClause}
    ) t
    GROUP BY t.user_id, t.user_name, t.user_nickname, t.user_email, t.user_role, t.activity_type
    `,
      baseParams
    )

    const recentRes = await pool.query(
      `
    SELECT *
    FROM (
      SELECT
        t.*,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(t.user_id, -1)
          ORDER BY t.created_at DESC
        ) AS rn
      FROM (
        SELECT
          a.id,
          'activity'::text AS source,
          a.lead_id,
          l.lead_number,
          l.name AS lead_name,
          a.activity_type,
          a.metadata,
          a.created_at,
          a.user_id,
          u.name AS user_name,
          u.nickname AS user_nickname,
          u.email AS user_email,
          u.role AS user_role,
          CASE WHEN a.metadata->>'system' = 'true' THEN true ELSE false END AS is_system,
          NULL::text AS note_text
        FROM lead_activities a
        LEFT JOIN leads l ON l.id = a.lead_id
        LEFT JOIN users u ON u.id = a.user_id
        WHERE (a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
        ${activityUserClause}
        UNION ALL
        SELECT
          n.id,
          'note'::text AS source,
          n.lead_id,
          l.lead_number,
          l.name AS lead_name,
          'note_added'::text AS activity_type,
          NULL::jsonb AS metadata,
          n.created_at,
          n.user_id,
          u.name AS user_name,
          u.nickname AS user_nickname,
          u.email AS user_email,
          u.role AS user_role,
          false AS is_system,
          n.note_text
        FROM lead_notes n
        LEFT JOIN leads l ON l.id = n.lead_id
        LEFT JOIN users u ON u.id = n.user_id
        WHERE (n.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
        ${notesUserClause}
      ) t
    ) ranked
    WHERE rn <= 10
    ORDER BY created_at DESC
    `,
      baseParams
    )

    const summaryMap = new Map()
    for (const row of summaryRes.rows) {
      const key = row.user_id ?? 'system'
      if (!summaryMap.has(String(key))) {
        summaryMap.set(String(key), {
          user_id: row.user_id ?? null,
          user_name: row.user_name || null,
          user_nickname: row.user_nickname || null,
          user_email: row.user_email || null,
          user_role: row.user_role || null,
          total: 0,
          counts: {},
        })
      }
      const entry = summaryMap.get(String(key))
      entry.counts[row.activity_type] = row.count
      entry.total += row.count
    }

    const recentByUser = new Map()
    for (const row of recentRes.rows) {
      const key = row.user_id ?? 'system'
      if (!recentByUser.has(String(key))) recentByUser.set(String(key), [])
      recentByUser.get(String(key)).push(row)
    }

    return {
      range: { start: startDate, end: endDate },
      page,
      page_size: pageSize,
      total: countRes.rows[0]?.count || 0,
      rows: rowsRes.rows,
      user_summaries: Array.from(summaryMap.values()),
      recent_by_user: Array.from(recentByUser.entries()).map(([key, items]) => ({
        user_id: key === 'system' ? null : Number(key),
        items,
      })),
    }
  })

  api.get('/admin/sales-performance', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
    if (auth.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })

    const rawStart = req.query?.start ? String(req.query.start) : null
    const rawEnd = req.query?.end ? String(req.query.end) : null

    const normalizeDate = (value) => {
      if (!value) return null
      const trimmed = value.trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
      const parsed = new Date(`${trimmed}T00:00:00`)
      if (Number.isNaN(parsed.getTime())) return null
      return trimmed
    }

    const today = dateToYMD(new Date())
    const defaultStart = addDaysYMD(-6)
    const startDate = normalizeDate(rawStart) || defaultStart
    const endDate = normalizeDate(rawEnd) || today

    if (!startDate || !endDate) {
      return reply.code(400).send({ error: 'Invalid date range' })
    }
    if (startDate > endDate) {
      return reply.code(400).send({ error: 'Start date must be before end date' })
    }

    const refreshLogRes = await pool.query(
      "SELECT to_regclass('public.metrics_refresh_log') AS exists"
    )
    const hasRefreshLog = !!refreshLogRes.rows[0]?.exists
    let lastRunAt = null
    if (hasRefreshLog) {
      const lastRunRes = await pool.query(
        `SELECT last_run_at FROM metrics_refresh_log WHERE id = 1`
      )
      lastRunAt = lastRunRes.rows[0]?.last_run_at || null
    }

    const metricsTableRes = await pool.query(
      "SELECT to_regclass('public.user_metrics_daily') AS exists"
    )
    const hasUserMetrics = !!metricsTableRes.rows[0]?.exists

    const activityTableRes = await pool.query(
      "SELECT to_regclass('public.lead_activities') AS exists"
    )
    const hasActivities = !!activityTableRes.rows[0]?.exists

    const followupsTableRes = await pool.query(
      "SELECT to_regclass('public.lead_followups') AS exists"
    )
    const hasFollowupsTable = !!followupsTableRes.rows[0]?.exists
    const sessionsTableRes = await pool.query(
      "SELECT to_regclass('public.user_sessions') AS exists"
    )
    const hasSessionsTable = !!sessionsTableRes.rows[0]?.exists
    let hasFollowupOutcome = false
    if (hasFollowupsTable) {
      const outcomeColRes = await pool.query(
        `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'lead_followups'
        AND column_name = 'outcome'
      LIMIT 1
      `
      )
      hasFollowupOutcome = outcomeColRes.rows.length > 0
    }

    if (hasRefreshLog) {
      const now = new Date()
      const metricsTodayYMD = dateToYMD(now)
      const lastRunDate = lastRunAt ? dateToYMD(new Date(lastRunAt)) : null
      const staleByAge =
        !lastRunAt || (now.getTime() - new Date(lastRunAt).getTime()) > 24 * 60 * 60 * 1000
      const includesToday = endDate >= metricsTodayYMD
      const staleByToday = includesToday && (!lastRunDate || lastRunDate < metricsTodayYMD)
      if ((staleByAge || staleByToday) && !isMetricsRunning()) {
        // Run in background to avoid blocking UI
        runMetricsJob(true, { from: startDate, to: endDate })
      }
    }

    const metricsCte = hasUserMetrics
      ? `
    metrics AS (
      SELECT
        user_id,
        COALESCE(SUM(total_session_duration_seconds), 0)::int AS total_session_duration_seconds,
        COALESCE(SUM(leads_opened_count), 0)::int AS leads_opened_count,
        COALESCE(SUM(followups_done), 0)::int AS followups_done,
        COALESCE(SUM(negotiations_done), 0)::int AS negotiations_done,
        COALESCE(SUM(quotes_generated), 0)::int AS quotes_generated,
        COALESCE(SUM(conversions), 0)::int AS conversions,
        COALESCE(SUM(total_time_spent_on_leads_seconds), 0)::int AS total_time_spent_on_leads_seconds
      FROM user_metrics_daily
      WHERE metric_date BETWEEN $1::date AND $2::date
      GROUP BY user_id
    )`
      : `
    metrics AS (
      SELECT NULL::int AS user_id,
        0::int AS total_session_duration_seconds,
        0::int AS leads_opened_count,
        0::int AS followups_done,
        0::int AS negotiations_done,
        0::int AS quotes_generated,
        0::int AS conversions,
        0::int AS total_time_spent_on_leads_seconds
      WHERE false
    )`

    const activityCte = hasActivities
      ? `
    activity AS (
      SELECT
        user_id,
        SUM(CASE WHEN activity_type = 'status_change' THEN 1 ELSE 0 END)::int AS status_changes,
        SUM(CASE WHEN activity_type = 'quote_generated' THEN 1 ELSE 0 END)::int AS quote_generated,
        SUM(CASE WHEN activity_type = 'quote_shared_whatsapp' THEN 1 ELSE 0 END)::int AS quote_shared,
        SUM(CASE WHEN activity_type = 'negotiation_entry' THEN 1 ELSE 0 END)::int AS negotiation_entries
      FROM lead_activities
      WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
        AND user_id IS NOT NULL
        AND (metadata->>'system' IS NULL OR metadata->>'system' <> 'true')
      GROUP BY user_id
    )`
      : `
    activity AS (
      SELECT NULL::int AS user_id,
        0::int AS status_changes,
        0::int AS quote_generated,
        0::int AS quote_shared,
        0::int AS negotiation_entries
      WHERE false
    )`

    const followupsCte = hasFollowupsTable && hasFollowupOutcome
      ? `
    followups AS (
      SELECT
        user_id,
        SUM(CASE WHEN outcome = 'Connected' THEN 1 ELSE 0 END)::int AS followups_connected,
        SUM(CASE WHEN outcome = 'Not connected' THEN 1 ELSE 0 END)::int AS followups_not_connected
      FROM lead_followups
      WHERE follow_up_at::date BETWEEN $1::date AND $2::date
        AND user_id IS NOT NULL
        AND outcome IS NOT NULL
      GROUP BY user_id
    )`
      : `
    followups AS (
      SELECT NULL::int AS user_id, 0::int AS followups_connected, 0::int AS followups_not_connected
      WHERE false
    )`

    const sessionsCte = hasSessionsTable
      ? `
    sessions AS (
      SELECT
        user_id,
        MAX(COALESCE(last_seen_at, logout_at, login_at)) AS last_seen_at
      FROM user_sessions
      GROUP BY user_id
    )`
      : `
    sessions AS (
      SELECT NULL::int AS user_id, NULL::timestamp AS last_seen_at
      WHERE false
    )`

    const baseRes = await pool.query(
      `
    WITH users_scope AS (
      SELECT id, name, nickname, email, role
      FROM users
    ),
    ${metricsCte},
    ${activityCte},
    ${followupsCte},
    ${sessionsCte}
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.nickname AS user_nickname,
      u.email AS user_email,
      u.role AS user_role,
      COALESCE(m.total_session_duration_seconds, 0)::int AS total_session_duration_seconds,
      COALESCE(m.leads_opened_count, 0)::int AS leads_opened_count,
      COALESCE(m.followups_done, 0)::int AS followups_done,
      COALESCE(m.negotiations_done, 0)::int AS negotiations_done,
      COALESCE(m.quotes_generated, 0)::int AS quotes_generated,
      COALESCE(m.conversions, 0)::int AS conversions,
      COALESCE(m.total_time_spent_on_leads_seconds, 0)::int AS total_time_spent_on_leads_seconds,
      COALESCE(a.status_changes, 0)::int AS status_changes,
      COALESCE(f.followups_connected, 0)::int AS followups_connected,
      COALESCE(f.followups_not_connected, 0)::int AS followups_not_connected,
      COALESCE(a.quote_generated, 0)::int AS quote_generated,
      COALESCE(a.quote_shared, 0)::int AS quote_shared,
      COALESCE(a.negotiation_entries, 0)::int AS negotiation_entries,
      s.last_seen_at AS last_seen_at
    FROM users_scope u
    LEFT JOIN metrics m ON m.user_id = u.id
    LEFT JOIN activity a ON a.user_id = u.id
    LEFT JOIN followups f ON f.user_id = u.id
    LEFT JOIN sessions s ON s.user_id = u.id
    ORDER BY u.name NULLS LAST, u.email ASC
    `,
      [startDate, endDate]
    )

    const dailyRes = await pool.query(
      hasUserMetrics
        ? `
        SELECT
          user_id,
          metric_date,
          total_sessions,
          leads_opened_count,
          followups_done,
          conversions
        FROM user_metrics_daily
        WHERE metric_date BETWEEN $1::date AND $2::date
        ORDER BY metric_date ASC
        `
        : `SELECT NULL::int AS user_id, NULL::date AS metric_date, 0::int AS total_sessions, 0::int AS leads_opened_count, 0::int AS followups_done, 0::int AS conversions WHERE false`,
      hasUserMetrics ? [startDate, endDate] : []
    )

    const dailyByUser = new Map()
    for (const row of dailyRes.rows) {
      const key = row.user_id
      if (!dailyByUser.has(key)) dailyByUser.set(key, [])
      dailyByUser.get(key).push(row)
    }

    const rows = baseRes.rows.map(row => ({
      ...row,
      avg_time_spent_per_lead_seconds:
        row.leads_opened_count > 0
          ? Math.round(row.total_time_spent_on_leads_seconds / row.leads_opened_count)
          : 0,
      daily: dailyByUser.get(row.user_id) || [],
    }))

    return { range: { start: startDate, end: endDate }, users: rows }
  })


}
