module.exports = async function(api, opts) {
  const {
    createNotification,
    addDaysYMD,
    formatName,
    canonicalizePhone,
    normalizeLeadRows,
    hasAnyEvent,
    getRoundRobinSalesUserId,
    normalizePhone,
    normalizeLeadRow,
    hasPrimaryCity,
    getAuthFromRequest,
    logLeadActivity,
    getNextLeadNumber,
    requireAuth,
    hasAllEventTimes,
    hasEventsForAllCities,
    canonicalizeInstagram,
    canonicalizeEmail,
    dateToYMD,
    resolveUserDisplayName,
    HEAT_VALUES,
    LEAD_STATUSES,
    COVERAGE_SCOPES,
    toISTDateString,
    pool,
  } = opts;

  /* ===================== LEADS ===================== */

  api.get('/leads', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    const isAdmin = auth ? (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin') : false
    const {
      status,
      source,
      heat,
      priority,
      overdue,
      followup_done,
      last_contacted_mode,
      last_contacted_from,
      last_contacted_to,
      not_contacted_min,
      created_mode,
      created_from,
      created_to,
      event_from,
      event_to,
      amount_min,
      amount_max,
      budget_min,
      budget_max,
      discount_min,
      discount_max,
    } = req.query || {}

    const toNumber = (value) => {
      const num = Number(value)
      return Number.isFinite(num) ? num : null
    }

    const amountMin = toNumber(amount_min)
    const amountMax = toNumber(amount_max)
    const budgetMin = toNumber(budget_min)
    const budgetMax = toNumber(budget_max)
    const discountMin = toNumber(discount_min)
    const discountMax = toNumber(discount_max)

    const where = []
    const params = []
    const addParam = (value) => {
      params.push(value)
      return `$${params.length}`
    }

    if (!isAdmin && auth && auth.sub) {
      where.push(`l.assigned_user_id = ${addParam(auth.sub)}`)
    }

    if (status) {
      const statusList = String(status)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      if (statusList.length > 1) {
        where.push(`l.status = ANY(${addParam(statusList)})`)
      } else if (statusList.length === 1) {
        where.push(`l.status = ${addParam(statusList[0])}`)
      }
    }
    if (source) {
      const sourceList = String(source)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      if (sourceList.length > 1) {
        where.push(`l.source = ANY(${addParam(sourceList)})`)
      } else if (sourceList.length === 1) {
        where.push(`l.source = ${addParam(sourceList[0])}`)
      }
    }
    if (heat) {
      const heatList = String(heat)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      if (heatList.length > 1) {
        where.push(`l.heat = ANY(${addParam(heatList)})`)
      } else if (heatList.length === 1) {
        where.push(`l.heat = ${addParam(heatList[0])}`)
      }
    }

    if (priority) {
      const priorityList = String(priority)
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
      const wantsImportant = priorityList.includes('important')
      const wantsPotential = priorityList.includes('potential')
      if (wantsImportant && wantsPotential) {
        where.push('(l.important = true OR l.potential = true)')
      } else if (wantsImportant) {
        where.push('l.important = true')
      } else if (wantsPotential) {
        where.push('l.potential = true')
      }
    }

    const wantsOverdue = overdue === 'true' || overdue === '1'
    const wantsDone = followup_done === 'true' || followup_done === '1'
    const doneClause = `
    (
      l.next_followup_date::date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
      AND (
        SELECT lf.outcome
        FROM lead_followups lf
        WHERE lf.lead_id = l.id
        ORDER BY lf.follow_up_at DESC NULLS LAST
        LIMIT 1
      ) = 'Connected'
    )
  `
    const overdueClause = `
    (
      l.next_followup_date::date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
      OR (
        l.next_followup_date::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        AND COALESCE((
          SELECT lf.outcome
          FROM lead_followups lf
          WHERE lf.lead_id = l.id
          ORDER BY lf.follow_up_at DESC NULLS LAST
          LIMIT 1
        ), 'Not Connected') = 'Not Connected'
      )
    )
  `
    if (wantsOverdue && wantsDone) {
      where.push(`(${doneClause} OR (${overdueClause}))`)
      where.push(`l.status NOT IN ('Converted','Lost','Rejected')`)
    } else if (wantsOverdue) {
      where.push(overdueClause)
      where.push(`l.status NOT IN ('Converted','Lost','Rejected')`)
    } else if (wantsDone) {
      where.push(doneClause)
    }

    if (not_contacted_min != null && not_contacted_min !== '') {
      const countVal = Number(not_contacted_min)
      if (Number.isFinite(countVal)) {
        where.push(`COALESCE(l.not_contacted_count, 0) >= ${addParam(countVal)}`)
      }
    }

    if (last_contacted_mode || last_contacted_from || last_contacted_to) {
      let fromDate = last_contacted_from
      let toDate = last_contacted_to
      if (last_contacted_mode === 'within_7') {
        fromDate = toISTDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))
        toDate = toISTDateString(new Date())
      } else if (last_contacted_mode === 'within_30') {
        fromDate = toISTDateString(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000))
        toDate = toISTDateString(new Date())
      }
      const clauses = []
      if (fromDate) clauses.push(`lf.follow_up_at::date >= ${addParam(fromDate)}`)
      if (toDate) clauses.push(`lf.follow_up_at::date <= ${addParam(toDate)}`)
      if (clauses.length) {
        where.push(
          `EXISTS (
          SELECT 1 FROM lead_followups lf
          WHERE lf.lead_id = l.id
          AND ${clauses.join(' AND ')}
        )`
        )
      }
    }

    if (created_mode) {
      if (created_mode === 'last_7') {
        where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= ${addParam(toISTDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)))}`)
      } else if (created_mode === 'last_30' || created_mode === 'between_7_30') {
        const fromDate = toISTDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        const toDate = toISTDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= ${addParam(fromDate)}`)
        where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= ${addParam(toDate)}`)
      } else if (created_mode === 'before_30') {
        where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= ${addParam(toISTDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))}`)
      }
    }
    if (created_from) where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= ${addParam(created_from)}`)
    if (created_to) where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= ${addParam(created_to)}`)

    if (event_from || event_to) {
      const clauses = []
      if (event_from) clauses.push(`e2.event_date >= ${addParam(event_from)}`)
      if (event_to) clauses.push(`e2.event_date <= ${addParam(event_to)}`)
      where.push(
        `EXISTS (
        SELECT 1 FROM lead_events e2
        WHERE e2.lead_id = l.id
        ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      )`
      )
    }

    if (amountMin != null) where.push(`l.amount_quoted >= ${addParam(amountMin)}`)
    if (amountMax != null) where.push(`l.amount_quoted <= ${addParam(amountMax)}`)
    if (budgetMin != null) where.push(`l.client_budget_amount >= ${addParam(budgetMin)}`)
    if (budgetMax != null) where.push(`l.client_budget_amount <= ${addParam(budgetMax)}`)
    if (discountMin != null) where.push(`l.discounted_amount >= ${addParam(discountMin)}`)
    if (discountMax != null) where.push(`l.discounted_amount <= ${addParam(discountMax)}`)

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const rows = (await pool.query(
      `
    SELECT
      l.*,
      l.phone_primary AS primary_phone,
      l.not_contacted_count,
      u.name AS assigned_user_name,
      u.nickname AS assigned_user_nickname,
      (
        SELECT a.created_at
        FROM lead_activities a
        WHERE a.lead_id = l.id
          AND a.activity_type = 'followup_done'
        ORDER BY a.created_at DESC
        LIMIT 1
      ) AS last_followup_at,
      (
        SELECT a.metadata->>'follow_up_mode'
        FROM lead_activities a
        WHERE a.lead_id = l.id
          AND a.activity_type = 'followup_done'
        ORDER BY a.created_at DESC
        LIMIT 1
      ) AS last_followup_mode,
      (
        SELECT n.note_text
        FROM lead_notes n
        WHERE n.lead_id = l.id
        ORDER BY n.created_at DESC
        LIMIT 1
      ) AS last_note_text,
      COALESCE(
        json_agg(
          json_build_object(
            'event_type', e.event_type,
            'event_date', e.event_date,
            'slot', e.slot
          )
          ORDER BY
            e.event_date ASC,
            CASE e.slot
              WHEN 'Morning' THEN 1
              WHEN 'Day' THEN 2
              WHEN 'Evening' THEN 3
              ELSE 4
            END ASC,
            e.created_at ASC
        ) FILTER (WHERE e.id IS NOT NULL),
        '[]'::json
      ) AS events
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_user_id
    LEFT JOIN lead_events e ON e.lead_id = l.id
    ${whereClause}
    GROUP BY l.id, u.name, u.nickname
    ORDER BY l.created_at DESC
    `,
      params
    )).rows

    return normalizeLeadRows(rows)
  })

  api.post('/leads/phone-duplicates', async (req) => {
    const { phone, lead_id } = req.body || {}
    const canonical = canonicalizePhone(phone)
    if (!canonical) return { matches: [] }

    const params = [canonical]
    let exclude = ''
    if (lead_id) {
      params.push(lead_id)
      exclude = `AND id <> $2`
    }

    const r = await pool.query(
      `
    SELECT
      id,
      name,
      status,
      phone_primary AS primary_phone
    FROM leads
    WHERE (
      $1 IN (
        phone_primary,
        phone_secondary,
        bride_phone_primary,
        bride_phone_secondary,
        groom_phone_primary,
        groom_phone_secondary
      )
    )
    ${exclude}
    ORDER BY updated_at DESC
    `,
      params
    )

    return { matches: r.rows }
  })

  api.post('/leads/duplicate-check', async (req) => {
    const { phones = [], emails = [], instagrams = [], lead_id } = req.body || {}
    const leadId = lead_id ? Number(lead_id) : null

    const phoneValues = Array.from(
      new Set((phones || []).map(canonicalizePhone).filter(Boolean))
    )
    const emailValues = Array.from(
      new Set((emails || []).map(canonicalizeEmail).filter(Boolean))
    )
    const instagramValues = Array.from(
      new Set((instagrams || []).map(canonicalizeInstagram).filter(Boolean))
    )

    const buildMatches = (rows, value, fields) => {
      return rows
        .filter(row => fields.some(field => row[field] === value))
        .map(row => ({
          id: row.id,
          name: row.name,
          status: row.status,
          primary_phone: row.phone_primary,
        }))
    }

    const phoneGroups = []
    if (phoneValues.length) {
      const params = [phoneValues]
      let excludeClause = ''
      if (leadId) {
        params.push(leadId)
        excludeClause = 'AND id <> $2'
      }
      const r = await pool.query(
        `
      SELECT id, name, status, phone_primary, phone_secondary,
             bride_phone_primary, bride_phone_secondary,
             groom_phone_primary, groom_phone_secondary
      FROM leads
      WHERE (
        phone_primary = ANY($1)
        OR phone_secondary = ANY($1)
        OR bride_phone_primary = ANY($1)
        OR bride_phone_secondary = ANY($1)
        OR groom_phone_primary = ANY($1)
        OR groom_phone_secondary = ANY($1)
      )
      ${excludeClause}
      ORDER BY updated_at DESC
      `,
        params
      )
      phoneValues.forEach(value => {
        const matches = buildMatches(
          r.rows,
          value,
          [
            'phone_primary',
            'phone_secondary',
            'bride_phone_primary',
            'bride_phone_secondary',
            'groom_phone_primary',
            'groom_phone_secondary',
          ]
        )
        if (matches.length) {
          phoneGroups.push({ value, matches })
        }
      })
    }

    const emailGroups = []
    if (emailValues.length) {
      const params = [emailValues]
      let excludeClause = ''
      if (leadId) {
        params.push(leadId)
        excludeClause = 'AND id <> $2'
      }
      const r = await pool.query(
        `
      SELECT id, name, status, phone_primary, email, bride_email, groom_email
      FROM leads
      WHERE (
        email = ANY($1)
        OR bride_email = ANY($1)
        OR groom_email = ANY($1)
      )
      ${excludeClause}
      ORDER BY updated_at DESC
      `,
        params
      )
      emailValues.forEach(value => {
        const matches = buildMatches(r.rows, value, ['email', 'bride_email', 'groom_email'])
        if (matches.length) {
          emailGroups.push({ value, matches })
        }
      })
    }

    const instagramGroups = []
    if (instagramValues.length) {
      const params = [instagramValues]
      let excludeClause = ''
      if (leadId) {
        params.push(leadId)
        excludeClause = 'AND id <> $2'
      }
      const r = await pool.query(
        `
      SELECT id, name, status, phone_primary, instagram, bride_instagram, groom_instagram
      FROM leads
      WHERE (
        instagram = ANY($1)
        OR bride_instagram = ANY($1)
        OR groom_instagram = ANY($1)
      )
      ${excludeClause}
      ORDER BY updated_at DESC
      `,
        params
      )
      instagramValues.forEach(value => {
        const matches = buildMatches(r.rows, value, ['instagram', 'bride_instagram', 'groom_instagram'])
        if (matches.length) {
          instagramGroups.push({ value, matches })
        }
      })
    }

    return {
      phones: phoneGroups,
      emails: emailGroups,
      instagrams: instagramGroups,
    }
  })

  // --- Notifications API ---
  api.get('/notifications', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    const userRole = auth.role
    const userId = auth.id

    let targetCondition = `(role_target = $1 OR user_id = $2)`
    if (userRole === 'admin') {
      targetCondition = `(role_target IN ($1, 'sales') OR user_id = $2)`
    }
    let queryParams = [userRole, userId]
    
    const countQuery = `SELECT count(*) FROM notifications WHERE ${targetCondition} AND is_read = false`
    const unreadCountResp = await pool.query(countQuery, queryParams)

    const listQuery = `
      SELECT * FROM notifications 
      WHERE ${targetCondition} 
      ORDER BY created_at DESC 
      LIMIT 100
    `
    const r = await pool.query(listQuery, queryParams)
    
    return {
      unread_count: parseInt(unreadCountResp.rows[0].count, 10),
      notifications: r.rows
    }
  })

  api.patch('/notifications/read-all', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    const userRole = auth.role
    const userId = auth.id

    let targetCondition = `(role_target = $1 OR user_id = $2)`
    if (userRole === 'admin') {
      targetCondition = `(role_target IN ($1, 'sales') OR user_id = $2)`
    }

    await pool.query(`
      UPDATE notifications 
      SET is_read = true, read_at = NOW() 
      WHERE is_read = false AND ${targetCondition}
    `, [userRole, userId])
    return { success: true }
  })

  api.post('/notifications/read', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    const { ids } = req.body || {}
    if (!Array.isArray(ids) || !ids.length) return { success: true }
    await pool.query(`UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = ANY($1::uuid[])`, [ids])
    return { success: true }
  })

  api.get('/dashboard/metrics', async (req) => {
    const auth = getAuthFromRequest(req)
    const isAdmin = auth ? (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin') : false
    let leadFilter = ""
    let params = []
    if (!isAdmin && auth && auth.sub) {
       params.push(auth.sub)
       leadFilter = `WHERE assigned_user_id = $1`
    }

    try {
      const r = await pool.query(
      `
    WITH auth_leads AS (SELECT * FROM leads ${leadFilter}),
    status_counts AS (
      SELECT status, COUNT(*)::int AS count
      FROM auth_leads
      GROUP BY status
    ),
    heat_counts AS (
      SELECT heat, COUNT(*)::int AS count
      FROM auth_leads
      WHERE status NOT IN ('Converted','Lost','Rejected')
      GROUP BY heat
    ),
    followups AS (
      SELECT
        SUM(CASE WHEN next_followup_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 1 ELSE 0 END)::int AS due_today,
        SUM(CASE WHEN next_followup_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 1 ELSE 0 END)::int AS overdue
      FROM auth_leads
      WHERE next_followup_date IS NOT NULL
        AND status NOT IN ('New','Converted','Lost','Rejected')
    ),
    priority AS (
      SELECT
        SUM(CASE WHEN important = true THEN 1 ELSE 0 END)::int AS important,
        SUM(CASE WHEN potential = true THEN 1 ELSE 0 END)::int AS potential
      FROM auth_leads
      WHERE status NOT IN ('Converted','Lost','Rejected')
    ),
    source_counts AS (
      SELECT COALESCE(NULLIF(source, ''), 'Unknown') AS source, COUNT(*)::int AS count
      FROM auth_leads
      GROUP BY COALESCE(NULLIF(source, ''), 'Unknown')
    ),
    today_activity AS (
      SELECT
        SUM(CASE WHEN activity_type = 'followup_done' THEN 1 ELSE 0 END)::int AS followups_completed,
        SUM(CASE WHEN activity_type = 'status_change' AND metadata->>'to' = 'Negotiation' THEN 1 ELSE 0 END)::int AS moved_to_negotiation
      FROM lead_activities
      JOIN auth_leads ON auth_leads.id = lead_activities.lead_id
      WHERE (lead_activities.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
    ),
    proposal_stats AS (
      SELECT
        COUNT(*)::int AS total_sent,
        SUM(CASE WHEN (ps.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 1 ELSE 0 END)::int AS sent_today,
        SUM(CASE WHEN (ps.last_viewed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 1 ELSE 0 END)::int AS viewed_today,
        SUM(CASE WHEN ps.snapshot_json->>'status' = 'ACCEPTED' THEN 1 ELSE 0 END)::int AS total_accepted,
        SUM(CASE WHEN ps.view_count > 0 THEN 1 ELSE 0 END)::int AS total_viewed,
        (SELECT COUNT(*)::int FROM proposal_views pv JOIN proposal_snapshots pss ON pv.proposal_snapshot_id = pss.id JOIN quote_versions qqv ON pss.quote_version_id = qqv.id JOIN quote_groups qqg ON qqv.quote_group_id = qqg.id JOIN auth_leads ccl ON ccl.id = qqg.lead_id WHERE (pv.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AND NOT EXISTS (SELECT 1 FROM known_internal_ips WHERE ip = pv.ip) AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE ip = pv.ip LIMIT 1)) as views_logged_today
      FROM proposal_snapshots ps
      JOIN quote_versions qv ON ps.quote_version_id = qv.id
      JOIN quote_groups qg ON qv.quote_group_id = qg.id
      JOIN auth_leads sl ON sl.id = qg.lead_id
    )
    SELECT
      COALESCE((SELECT json_object_agg(status, count) FROM status_counts), '{}'::json) AS status_counts,
      COALESCE((SELECT json_object_agg(heat, count) FROM heat_counts), '{}'::json) AS heat_counts,
      COALESCE((SELECT json_build_object('today', due_today, 'overdue', overdue) FROM followups), '{}'::json) AS followups,
      COALESCE((SELECT json_build_object('important', important, 'potential', potential) FROM priority), '{}'::json) AS priority,
      COALESCE((SELECT json_object_agg(source, count) FROM source_counts), '{}'::json) AS source_counts,
      COALESCE((SELECT json_build_object('followups_completed', followups_completed, 'moved_to_negotiation', moved_to_negotiation) FROM today_activity), '{}'::json) AS today_activity,
      COALESCE((SELECT row_to_json(proposal_stats.*) FROM proposal_stats), '{}'::json) AS proposal_stats
    `, params)
    const baseMetrics = r.rows[0]

    const revQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT 
        SUM(CASE WHEN status IN ('Quoted', 'Negotiation', 'Follow Up') THEN COALESCE(discounted_amount, amount_quoted, client_budget_amount, 0) ELSE 0 END)::float as projected_revenue,
        SUM(CASE WHEN status = 'Converted' THEN COALESCE(discounted_amount, amount_quoted, client_budget_amount, 0) ELSE 0 END)::float as converted_revenue
      FROM auth_leads
      WHERE status IN ('Quoted', 'Negotiation', 'Follow Up', 'Converted')
    `, params)

    const feedQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT 
        a.id,
        a.activity_type,
        a.metadata,
        a.created_at,
        l.id as lead_id,
        l.name as lead_name
      FROM lead_activities a
      JOIN auth_leads l ON l.id = a.lead_id
      ORDER BY a.created_at DESC
      LIMIT 12
    `, params)

    const dealSizeQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT
        COALESCE(AVG(CASE WHEN status NOT IN ('Lost','Rejected') AND COALESCE(discounted_amount, amount_quoted, client_budget_amount) > 0
          THEN COALESCE(discounted_amount, amount_quoted, client_budget_amount) END), 0)::float AS avg_deal_size,
        COALESCE(AVG(CASE WHEN status = 'Converted' AND COALESCE(discounted_amount, amount_quoted, client_budget_amount) > 0
          THEN COALESCE(discounted_amount, amount_quoted, client_budget_amount) END), 0)::float AS avg_closed_deal_size
      FROM auth_leads
    `, params)

    const leadsVolumeQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT
        SUM(CASE WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) THEN 1 ELSE 0 END)::int AS this_week,
        SUM(CASE WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) - interval '7 days'
                  AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') < date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) THEN 1 ELSE 0 END)::int AS last_week,
        SUM(CASE WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) THEN 1 ELSE 0 END)::int AS this_month,
        SUM(CASE WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) - interval '1 month'
                  AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') < date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) THEN 1 ELSE 0 END)::int AS last_month
      FROM auth_leads
    `, params)

    const staleQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT l.id, l.name, l.status, l.heat,
        COALESCE(discounted_amount, amount_quoted, client_budget_amount) as deal_value,
        (SELECT MAX(a.created_at) FROM lead_activities a WHERE a.lead_id = l.id) as last_activity
      FROM auth_leads l
      WHERE l.status NOT IN ('Converted', 'Lost', 'Rejected')
        AND NOT EXISTS (
          SELECT 1 FROM lead_activities a
          WHERE a.lead_id = l.id AND (a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - interval '7 days'
        )
      ORDER BY COALESCE(discounted_amount, amount_quoted, client_budget_amount, 0) DESC
      LIMIT 5
    `, params)

    const monthlyTrendQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT
        to_char(date_trunc('month', (converted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')), 'YYYY-MM') AS month,
        SUM(COALESCE(discounted_amount, amount_quoted, client_budget_amount, 0))::float AS revenue,
        COUNT(*)::int AS deals
      FROM auth_leads
      WHERE status = 'Converted'
        AND converted_at IS NOT NULL
        AND (converted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - interval '6 months'
      GROUP BY date_trunc('month', (converted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'))
      ORDER BY date_trunc('month', (converted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) ASC
    `, params)

    return {
      ...baseMetrics,
      revenue: revQuery.rows[0],
      recent_activities: feedQuery.rows,
      deal_sizes: dealSizeQuery.rows[0],
      leads_volume: leadsVolumeQuery.rows[0],
      stale_leads: staleQuery.rows,
      monthly_trend: monthlyTrendQuery.rows
    }
    } catch (err) {
      console.error('Dashboard metrics error:', err)
      return { success: false, error: 'Internal server error' }
    }
  })

  api.get('/insights', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    const isAdmin = auth ? (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin') : false
    let leadFilter = ""
    let sourceFilter = ""
    let params = []
    if (!isAdmin && auth && auth.sub) {
       params.push(auth.sub)
       leadFilter = `AND l.assigned_user_id = $1`
       sourceFilter = `WHERE assigned_user_id = $1`
    }
    try {
      const r = await pool.query(
        `
    WITH converted AS (
      SELECT
        l.*,
        COALESCE(
          l.first_contacted_at,
          (
            SELECT MIN(a.created_at)
            FROM lead_activities a
            WHERE a.lead_id = l.id
              AND a.activity_type = 'status_change'
              AND a.metadata->>'to' = 'Contacted'
          ),
          l.created_at
        ) AS first_contact_at,
        COALESCE(
          l.converted_at,
          (
            SELECT MIN(a.created_at)
            FROM lead_activities a
            WHERE a.lead_id = l.id
              AND a.activity_type = 'status_change'
              AND a.metadata->>'to' = 'Converted'
          ),
          l.created_at
        ) AS converted_at_calc
      FROM leads l
      WHERE l.status = 'Converted' ${leadFilter}
    ),
    conversion_times AS (
      SELECT
        CASE
          WHEN first_contact_at IS NULL OR converted_at_calc IS NULL THEN NULL
          ELSE GREATEST(
            0,
            EXTRACT(EPOCH FROM (converted_at_calc - first_contact_at)) / 86400
          )
        END AS days_to_convert
      FROM converted
    ),
    followups AS (
      SELECT c.id, COUNT(a.*)::int AS followup_count
      FROM converted c
      LEFT JOIN lead_activities a
        ON a.lead_id = c.id
       AND a.activity_type = 'followup_done'
      GROUP BY c.id
    ),
    discounts AS (
      SELECT
        CASE
          WHEN amount_quoted > 0
           AND discounted_amount IS NOT NULL
           AND discounted_amount < amount_quoted
          THEN amount_quoted - discounted_amount
          ELSE 0
        END AS discount_value,
        CASE
          WHEN amount_quoted > 0
           AND discounted_amount IS NOT NULL
           AND discounted_amount < amount_quoted
          THEN (amount_quoted - discounted_amount) / amount_quoted
          ELSE NULL
        END AS discount_pct
      FROM converted
    ),
    revenue AS (
      SELECT
        COALESCE(
          NULLIF(u.nickname, ''),
          NULLIF(split_part(u.name, ' ', 1), ''),
          u.name,
          'Unassigned'
        ) AS salesperson,
        COUNT(*)::int AS converted_count,
        SUM(COALESCE(discounted_amount, amount_quoted, 0))::numeric AS total_revenue,
        AVG(COALESCE(discounted_amount, amount_quoted))::numeric AS avg_deal
      FROM converted c
      LEFT JOIN users u ON u.id = c.assigned_user_id
      GROUP BY u.id, u.nickname, u.name
    ),
    source_counts AS (
      SELECT
        COALESCE(NULLIF(source, ''), 'Unknown') AS source,
        COUNT(*)::int AS total_leads,
        SUM(CASE WHEN status = 'Converted' THEN 1 ELSE 0 END)::int AS converted_leads
      FROM leads
      ${sourceFilter}
      GROUP BY COALESCE(NULLIF(source, ''), 'Unknown')
    )
    SELECT
      COALESCE(
        (
          SELECT json_build_object(
            'average', COALESCE(AVG(days_to_convert), 0),
            'fastest', COALESCE(MIN(days_to_convert), 0),
            'slowest', COALESCE(MAX(days_to_convert), 0)
          )
          FROM conversion_times
        ),
        '{}'::json
      ) AS time_to_convert,
      COALESCE(
        (
          SELECT json_build_object(
            'total_followups', COALESCE(SUM(followup_count), 0),
            'average_per_conversion', COALESCE(AVG(followup_count), 0)
          )
          FROM followups
        ),
        '{}'::json
      ) AS followups_per_conversion,
      COALESCE(
        (
          SELECT json_build_object(
            'average_discount_pct', COALESCE(AVG(discount_pct), 0),
            'total_discount_amount', COALESCE(SUM(discount_value), 0)
          )
          FROM discounts
        ),
        '{}'::json
      ) AS discount_efficiency,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'salesperson', salesperson,
              'converted_count', converted_count,
              'total_revenue', total_revenue,
              'average_deal', avg_deal
            )
            ORDER BY total_revenue DESC
          )
          FROM revenue
        ),
        '[]'::json
      ) AS revenue_per_salesperson,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'source', source,
              'total_leads', total_leads,
              'converted_leads', converted_leads,
              'conversion_rate',
                CASE WHEN total_leads > 0
                  THEN ROUND(converted_leads::numeric / total_leads * 100, 1)
                  ELSE 0
                END
            )
            ORDER BY total_leads DESC
          )
          FROM source_counts
        ),
        '[]'::json
      ) AS source_conversion
    `, params
      )
      return r.rows[0]
    } catch (err) {
      api.log.error(err)
      return reply.code(500).send({ error: err?.message || 'Internal Server Error' })
    }
  })

  api.get('/follow-ups', async (req) => {
    const auth = getAuthFromRequest(req)
    const isAdmin = auth ? (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin') : false
    
    let userFilter = "WHERE status NOT IN ('Converted','Lost','Rejected')"
    let params = []
    
    if (!isAdmin && auth && auth.sub) {
       params.push(auth.sub)
       userFilter += ` AND assigned_user_id = $1`
    }

    const r = await pool.query(
      `
    SELECT
      id,
      name,
      status,
      heat,
      source,
      created_at,
      next_followup_date,
      not_contacted_count,
      phone_primary,
      client_budget_amount,
      coverage_scope,
      amount_quoted,
      (
        SELECT a.metadata->>'outcome'
        FROM lead_activities a
        WHERE a.lead_id = leads.id
          AND a.activity_type = 'followup_done'
        ORDER BY a.created_at DESC
        LIMIT 1
      ) AS last_followup_outcome,
      (
        SELECT MAX(a.created_at)
        FROM lead_activities a
        WHERE a.lead_id = leads.id
          AND a.activity_type = 'followup_done'
          AND a.metadata->>'outcome' = 'Not connected'
          AND a.created_at > COALESCE(
            (
              SELECT MAX(c.created_at)
              FROM lead_activities c
              WHERE c.lead_id = leads.id
                AND c.activity_type = 'followup_done'
                AND c.metadata->>'outcome' = 'Connected'
            ),
            'epoch'::timestamp
          )
      ) AS last_not_connected_at,
      COALESCE(not_contacted_count, 0) AS not_contacted_count
    FROM leads
    ${userFilter}
    ORDER BY created_at DESC
    `, params
    )
    return r.rows
  })

  api.post('/leads', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    const {
      name,
      primary_phone,
      bride_name,
      groom_name,
      source,
      source_name,
      client_budget_amount,
      coverage_scope,
    } = req.body || {}

    const storeSourceName = ['WhatsApp', 'Direct Call', 'Reference'].includes(source)
    const needsSourceName = storeSourceName
    let resolvedSourceName = storeSourceName && source_name ? source_name.trim() : null
    if (needsSourceName) {
      if (!source_name || !String(source_name).trim()) {
        return reply.code(400).send({ error: 'Name is required for this source' })
      }
      if (['WhatsApp', 'Direct Call'].includes(source)) {
        const displayName = await resolveUserDisplayName(String(source_name))
        if (!displayName) {
          return reply.code(400).send({ error: 'Source name must match an existing user' })
        }
        resolvedSourceName = displayName
      } else {
        resolvedSourceName = String(source_name).trim()
      }
    }

    if (!name || !String(name).trim()) {
      return reply.code(400).send({ error: 'Name is required' })
    }
    if (!primary_phone || !String(primary_phone).trim()) {
      return reply.code(400).send({ error: 'Primary phone is required' })
    }
    if (coverage_scope && !COVERAGE_SCOPES.includes(coverage_scope)) {
      return reply.code(400).send({ error: 'Invalid coverage scope' })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const leadNumber = await getNextLeadNumber(client)
      let assignedUserId = null
      const authRoles = Array.isArray(auth?.roles) ? auth.roles : []
      const isSales = authRoles.includes('sales')
      const isAdmin = authRoles.includes('admin')

      if (isAdmin) {
        assignedUserId = await getRoundRobinSalesUserId(client)
        if (!assignedUserId) assignedUserId = auth.sub
      } else if (isSales) {
        assignedUserId = auth.sub
      } else {
        assignedUserId = await getRoundRobinSalesUserId(client)
      }

      const r = await client.query(
        `
      INSERT INTO leads (
        lead_number,
        name,
        source,
        source_name,
        phone_primary,
        bride_name,
        groom_name,
        client_budget_amount,
        coverage_scope,
        assigned_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *, phone_primary AS primary_phone
      `,
        [
          leadNumber,
          formatName(name),
          source || 'Unknown',
          resolvedSourceName,
          normalizePhone(primary_phone),
          formatName(bride_name),
          formatName(groom_name),
          client_budget_amount || null,
          coverage_scope || 'Both Sides',
          assignedUserId,
        ]
      )

      await logLeadActivity(
        r.rows[0].id,
        'lead_created',
        {
          log_type: 'activity',
          source: source || 'Unknown',
          assigned_user_id: assignedUserId,
        },
        auth?.sub || null,
        client
      )

      await client.query('COMMIT')

      if (assignedUserId && assignedUserId !== auth?.sub) {
        let creatorName = 'An admin'
        if (auth?.sub) {
          const authUserRes = await pool.query(`SELECT display_name FROM users WHERE id = $1`, [auth.sub])
          if (authUserRes.rows[0]) creatorName = authUserRes.rows[0].display_name || creatorName
        }
        await createNotification({
          userId: assignedUserId,
          title: 'New Lead Assigned',
          message: `${creatorName} manually assigned a new lead to you: ${formatName(name)}`,
          linkUrl: `/leads/${r.rows[0].id}`,
          category: 'LEAD',
          type: isAdmin ? 'WARNING' : 'INFO'
        }).catch(err => console.error('Notif error:', err))
      }

      return normalizeLeadRow(r.rows[0])
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })

  api.get('/leads/:id', async (req, reply) => {
    const r = await pool.query(
      `
    SELECT
      l.id,
      l.lead_number,
      l.name,
      l.phone_primary AS primary_phone,
      l.phone_secondary,
      l.email,
      l.instagram,

      l.bride_name,
      l.bride_phone_primary,
      l.bride_phone_secondary,
      l.bride_email,
      l.bride_instagram,

      l.groom_name,
      l.groom_phone_primary,
      l.groom_phone_secondary,
      l.groom_email,
      l.groom_instagram,

      l.source,
      l.source_name,
      l.status,
      l.rejected_reason,
      l.client_budget_amount,
      l.amount_quoted,
      l.client_offer_amount,
      l.discounted_amount,
      l.coverage_scope,
      l.potential,
      l.important,
      l.intake_completed,
      l.proposal_draft,
      l.first_contacted_at,
      l.converted_at,
      l.negotiation_since,
      l.next_followup_date,
      l.awaiting_advance_since,
      l.not_contacted_count,
      l.entered_awaiting_advance,
      l.conversion_count,
      l.heat,
      l.event_type,
      l.is_destination,
      l.country,
      l.created_at,
      l.updated_at,
      l.assigned_user_id,
      u.name AS assigned_user_name,
      u.nickname AS assigned_user_nickname
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_user_id
    WHERE l.id = $1
    `,
      [req.params.id]
    )

    if (!r.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }

    const auth = getAuthFromRequest(req)
    const isAdmin = auth ? (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin') : false
    if (!isAdmin && auth && auth.sub && r.rows[0].assigned_user_id !== auth.sub) {
      return reply.code(403).send({ error: 'Access denied: You are not assigned to this lead' })
    }

    const eventsRes = await pool.query(
      `SELECT e.id, e.event_type, e.event_date, e.pax, e.venue, e.start_time, e.end_time, e.slot, e.venue_id, e.venue_metadata, e.date_status, c.name AS city_name FROM lead_events e LEFT JOIN cities c ON c.id = e.city_id WHERE e.lead_id = $1 ORDER BY e.created_at ASC`,
      [req.params.id]
    )

    const citiesRes = await pool.query(
      `SELECT c.name FROM lead_cities lc JOIN cities c ON c.id = lc.city_id WHERE lc.lead_id = $1 AND lc.is_primary = true LIMIT 1`,
      [req.params.id]
    )

    const notesRes = await pool.query(
      `SELECT note_text FROM lead_notes WHERE lead_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    )

    const lead = normalizeLeadRow(r.rows[0])
    lead.events = eventsRes.rows
    lead.notes = notesRes.rows.map(n => n.note_text).join(' \n ')
    lead.city_name = citiesRes.rows[0]?.name || null

    if (lead.status === 'Lost') {
      try {
        const lostRes = await pool.query('SELECT reason FROM lead_lost_reasons WHERE lead_id = $1', [req.params.id])
        lead.lost_reason = lostRes.rows[0]?.reason || null
      } catch { lead.lost_reason = null }
    }

    return lead
  })

  api.patch('/leads/:id/intake', async (req, reply) => {
    const { id } = req.params
    const completed = req.body?.completed
    const nextValue = completed === undefined ? true : !!completed

    const r = await pool.query(
      `UPDATE leads SET intake_completed=$2 WHERE id=$1 RETURNING id, intake_completed`,
      [id, nextValue]
    )

    if (!r.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }

    return r.rows[0]
  })

  api.patch('/leads/:id/status', async (req, reply) => {
    const { id } = req.params
    const { status, rejected_reason, advance_received } = req.body
    const auth = getAuthFromRequest(req)

    if (!LEAD_STATUSES.includes(status)) {
      return reply.code(400).send({ error: 'Invalid status' })
    }

    if (status === 'Converted' && advance_received !== true) {
      return reply.code(400).send({
        code: 'ADVANCE_REQUIRED',
        error: 'Advance is required before converting this lead',
      })
    }

    // 🔒 HARD BLOCK — ONLY HERE
    const needsPrimaryEvent = ['Quoted', 'Follow Up', 'Negotiation', 'Awaiting Advance', 'Converted'].includes(status)

    if (needsPrimaryEvent) {
      const leadRow = await pool.query(
        `SELECT amount_quoted FROM leads WHERE id=$1`,
        [id]
      )
      if (!leadRow.rows.length) {
        return reply.code(404).send({ error: 'Lead not found' })
      }
      const amountQuoted = leadRow.rows[0].amount_quoted
      if (amountQuoted === null || amountQuoted === undefined || amountQuoted === '') {
        return reply.code(400).send({
          code: 'AMOUNT_QUOTED_REQUIRED',
          error: 'Amount quoted is required before moving this lead forward',
        })
      }

      const hasEvent = await hasAnyEvent(id)
      if (!hasEvent) {
        return reply.code(400).send({
          code: 'EVENT_REQUIRED',
          error: 'No events are added yet. Add an event before moving this lead forward',
        })
      }

      const hasPrimary = await hasPrimaryCity(id)
      if (!hasPrimary) {
        return reply.code(400).send({
          code: 'PRIMARY_CITY_REQUIRED',
          error: 'A primary city is required before moving this lead forward',
        })
      }

      const ok = await hasEventsForAllCities(id)

      if (!ok) {
        return reply.code(400).send({
          code: 'ALL_CITIES_EVENT_REQUIRED',
          error: 'Each city must be linked to at least one event before moving this lead forward',
        })
      }
    }

    // 🔒 HARD BLOCK ONLY FOR CONVERSION
    if (status === 'Converted') {
      const ok = await hasEventsForAllCities(id)
      if (!ok) {
        return reply.code(400).send({
          code: 'ALL_CITIES_EVENT_REQUIRED',
          error: 'Each city must be linked to at least one event before converting the lead',
        })
      }
      const timesOk = await hasAllEventTimes(id)
      if (!timesOk) {
        return reply.code(400).send({
          code: 'EVENT_TIME_REQUIRED',
          error: 'Start and end time are required for all events before converting the lead',
        })
      }
    }

    const cur = await pool.query(
      'SELECT status, heat, assigned_user_id FROM leads WHERE id=$1',
      [id]
    )
    if (!cur.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }

    const currentStatus = cur.rows[0].status
    const currentHeat = cur.rows[0].heat || 'Cold'
    const previousAssignedUserId = cur.rows[0].assigned_user_id || null
    let assignedUserId = previousAssignedUserId

    if (currentStatus === status) {
      return cur.rows[0]
    }

    let nextHeat = currentHeat
    if (status === 'New') {
      nextHeat = currentHeat === 'Cold' ? 'Cold' : currentHeat
    }
    if (status === 'Contacted') {
      nextHeat = currentHeat === 'Cold' ? 'Warm' : currentHeat
    }
    if (status === 'Quoted') {
      nextHeat = currentHeat === 'Cold' ? 'Warm' : currentHeat
    }
    if (status === 'Follow Up') {
      nextHeat = currentHeat === 'Cold' ? 'Warm' : currentHeat
    }
    if (status === 'Negotiation') nextHeat = 'Hot'
    if (status === 'Awaiting Advance') nextHeat = 'Hot'
    if (status === 'Converted') nextHeat = 'Hot'
    if (status === 'Lost') nextHeat = 'Cold'
    if (status === 'Rejected') nextHeat = 'Cold'

    const finalRejectedReason =
      status === 'Rejected'
        ? (String(rejected_reason || '').trim() || 'Low budget')
        : null

    const clearFollowup = ['Lost', 'Rejected', 'Converted'].includes(status)
    const manualNextFollowupDate = req.body?.next_followup_date

    if (status === 'Converted' && !assignedUserId) {
      assignedUserId = await getRoundRobinSalesUserId()
    }

    const updated = await pool.query(
      `
    UPDATE leads
    SET status=$1,
        previous_status=$2,
        heat=$3,
        rejected_reason=$4,
        first_contacted_at = CASE
          WHEN $1 = 'Contacted' AND first_contacted_at IS NULL THEN NOW()
          ELSE first_contacted_at
        END,
        negotiation_since = CASE
          WHEN $1 = 'Negotiation' THEN NOW()
          WHEN $2 = 'Negotiation' AND $1 <> 'Negotiation' THEN NULL
          ELSE negotiation_since
        END,
        awaiting_advance_since = CASE
          WHEN $1 = 'Awaiting Advance' THEN NOW()
          WHEN $2 = 'Awaiting Advance' AND $1 <> 'Awaiting Advance' THEN NULL
          ELSE awaiting_advance_since
        END,
        entered_awaiting_advance = CASE
          WHEN $1 = 'Awaiting Advance' THEN true
          ELSE entered_awaiting_advance
        END,
        converted_at = CASE
          WHEN $1 = 'Converted' AND converted_at IS NULL THEN NOW()
          ELSE converted_at
        END,
        conversion_count = CASE
          WHEN $1 = 'Converted' AND converted_at IS NULL THEN 1
          WHEN $1 = 'Converted' AND converted_at IS NOT NULL THEN COALESCE(conversion_count, 0) + 1
          ELSE conversion_count
        END,
        next_followup_date = CASE
          WHEN $6 THEN NULL
          WHEN $7::date IS NOT NULL THEN $7::date
          ELSE next_followup_date
        END,
        assigned_user_id = CASE
          WHEN $8::int IS NOT NULL AND assigned_user_id IS NULL THEN $8::int
          ELSE assigned_user_id
        END,
        updated_at=NOW()
    WHERE id=$5
    RETURNING *
    `,
      [
        status,
        currentStatus,
        nextHeat,
        finalRejectedReason,
        id,
        clearFollowup,
        manualNextFollowupDate || null,
        assignedUserId,
      ]
    )

    const updatedRow = updated.rows[0]
    const normalized = normalizeLeadRow(updatedRow)
    await logLeadActivity(id, 'status_change', { from: currentStatus, to: status }, auth?.sub || null)
    if ((previousAssignedUserId ?? null) !== (updatedRow.assigned_user_id ?? null)) {
      await logLeadActivity(
        id,
        'assigned_user_change',
        {
          log_type: 'audit',
          from: previousAssignedUserId ?? null,
          to: updatedRow.assigned_user_id ?? null,
          system: true,
          reason: 'auto_assign_on_convert',
        },
        auth?.sub || null
      )
      if (updatedRow.assigned_user_id && updatedRow.assigned_user_id !== previousAssignedUserId && typeof createNotification === 'function') {
        const clientName = updatedRow.name || updatedRow.bride_name || `Lead #${id}`
        await createNotification({
          userId: updatedRow.assigned_user_id,
          title: 'Lead Reassigned to You',
          message: `You have been automatically assigned to ${clientName} upon conversion.`,
          category: 'LEAD',
          type: 'INFO',
          linkUrl: `/leads/${id}`,
        })
      }
    }
    
    // Status change to Converted -> Admin notification
    if (status === 'Converted' && currentStatus !== 'Converted' && typeof createNotification === 'function') {
      const clientName = updatedRow.name || updatedRow.bride_name || `Lead #${id}`
      await createNotification({
        roleTarget: 'admin',
        title: 'Lead Converted 🎉',
        message: `${clientName} has been marked as Converted!`,
        category: 'LEAD',
        type: 'SUCCESS',
        linkUrl: `/leads/${id}`,
      })
    }
    return normalized
  })

  api.patch('/leads/:id/heat', async (req, reply) => {
    const { heat } = req.body
    const auth = getAuthFromRequest(req)
    if (!HEAT_VALUES.includes(heat))
      return reply.code(400).send({ error: 'Invalid heat value' })

    const cur = await pool.query('SELECT heat FROM leads WHERE id=$1', [req.params.id])
    if (!cur.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }
    const currentHeat = cur.rows[0].heat

    const r = await pool.query(
      `UPDATE leads
     SET heat=$1, updated_at=NOW()
     WHERE id=$2 AND status NOT IN ('Lost','Converted','Rejected')
     RETURNING *`,
      [heat, req.params.id]
    )

    if (!r.rows.length) {
      return reply.code(400).send({ error: 'Unable to update heat' })
    }

    if (currentHeat !== heat) {
      await logLeadActivity(req.params.id, 'heat_change', { from: currentHeat, to: heat }, auth?.sub || null)
    }

    return normalizeLeadRow(r.rows[0])
  })

  api.post('/leads/:id/lost', async (req, reply) => {
    const { id } = req.params
    const { reason, note } = req.body || {}
    const auth = getAuthFromRequest(req)
    if (!reason || !String(reason).trim()) {
      return reply.code(400).send({ error: 'Reason is required' })
    }

    const cur = await pool.query(
      'SELECT status FROM leads WHERE id=$1',
      [id]
    )
    if (!cur.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }

    await pool.query(
      `
    INSERT INTO lead_lost_reasons (lead_id, reason, note, user_id)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (lead_id)
    DO UPDATE SET reason=EXCLUDED.reason, note=EXCLUDED.note, user_id=EXCLUDED.user_id, lost_at=NOW()
    `,
      [id, String(reason).trim(), note || null, auth?.sub || null]
    )

    const updated = await pool.query(
      `
    UPDATE leads
    SET status='Lost',
        previous_status=$1,
        heat='Cold',
        next_followup_date=NULL,
        rejected_reason=NULL,
        awaiting_advance_since=NULL,
        negotiation_since=NULL,
        updated_at=NOW()
    WHERE id=$2
    RETURNING *
    `,
      [cur.rows[0].status, id]
    )

    const normalized = normalizeLeadRow(updated.rows[0])
    await logLeadActivity(id, 'status_change', { from: cur.rows[0].status, to: 'Lost' }, auth?.sub || null)
    
    // Status change to Lost -> Admin notification
    if (typeof createNotification === 'function') {
      const leadInfo = await pool.query('SELECT name, bride_name FROM leads WHERE id=$1', [id])
      const clientName = leadInfo.rows[0]?.name || leadInfo.rows[0]?.bride_name || `Lead #${id}`
      await createNotification({
        roleTarget: 'admin',
        title: 'Lead Lost 📉',
        message: `${clientName} has been marked as Lost. Reason: ${reason}`,
        category: 'LEAD',
        type: 'ERROR',
        linkUrl: `/leads/${id}`,
      })
    }
    return normalized
  })

  api.patch('/leads/:id/followup-date', async (req, reply) => {
    const { id } = req.params
    const { next_followup_date } = req.body || {}
    const auth = getAuthFromRequest(req)
    const leadId = Number(id)
    if (!Number.isInteger(leadId) || leadId <= 0) {
      return reply.code(400).send({ error: 'Invalid lead id' })
    }

    let normalizedDate = null
    if (next_followup_date) {
      const raw = String(next_followup_date)
      const dateOnly = raw.split('T')[0].split(' ')[0]
      const parsed = new Date(`${dateOnly}T00:00:00`)
      if (Number.isNaN(parsed.getTime())) {
        return reply.code(400).send({ error: 'Invalid follow-up date' })
      }
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      if (parsed < start) {
        return reply.code(400).send({ error: 'Follow-up date cannot be in the past' })
      }
      normalizedDate = dateOnly
    }

    const current = await pool.query(
      `SELECT next_followup_date, status FROM leads WHERE id=$1`,
      [leadId]
    )
    if (!current.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }
    if (['Converted', 'Lost', 'Rejected'].includes(current.rows[0]?.status)) {
      return reply.code(400).send({ error: 'Follow-up not allowed for this status' })
    }
    const previousRaw = current.rows[0]?.next_followup_date
    const previousDate = previousRaw ? dateToYMD(new Date(previousRaw)) : null

    const r = await pool.query(
      `UPDATE leads
     SET next_followup_date=$1, updated_at=NOW()
     WHERE id=$2
     RETURNING *, phone_primary AS primary_phone`,
      [normalizedDate, leadId]
    )

    if (previousDate !== normalizedDate) {
      await logLeadActivity(
        leadId,
        'followup_date_change',
        { log_type: 'activity', from: previousDate, to: normalizedDate },
        auth?.sub || null
      )
    }

    return normalizeLeadRow(r.rows[0])
  })

  api.post('/leads/:id/followup-done', async (req, reply) => {
    const { id } = req.params
    const {
      outcome,
      next_followup_date,
      follow_up_mode,
      discussed_topics,
      note,
      not_connected_reason,
    } = req.body || {}
    const auth = getAuthFromRequest(req)
    if (note && String(note).trim().length > 1000) {
      return reply.code(400).send({ error: 'Note must be 1000 characters or fewer' })
    }
    const allowed = ['Connected', 'Not connected']
    if (!allowed.includes(outcome)) {
      return reply.code(400).send({ error: 'Follow-up outcome is required' })
    }
    const allowedModes = ['Call', 'WhatsApp', 'Email', 'In-person', 'Other']
    if (outcome === 'Connected' && (!follow_up_mode || !allowedModes.includes(follow_up_mode))) {
      return reply.code(400).send({ error: 'Follow-up mode is required' })
    }
    const allowedReasons = [
      'Did not pick up',
      'Phone switched off',
      'Busy / asked to call later',
      'Number unreachable',
      'Wrong number',
      'Other',
    ]
    if (outcome === 'Not connected' && (!not_connected_reason || !allowedReasons.includes(not_connected_reason))) {
      return reply.code(400).send({ error: 'Reason is required' })
    }

    const leadRow = await pool.query(
      `SELECT status, next_followup_date, heat, not_contacted_count FROM leads WHERE id=$1`,
      [id]
    )
    if (!leadRow.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }
    const lead = leadRow.rows[0]
    if (['Converted', 'Lost', 'Rejected'].includes(lead.status)) {
      return reply.code(400).send({ error: 'Follow-up not allowed for this status' })
    }

    const isAwaitingAdvance = lead.status === 'Awaiting Advance'
    let normalizedDate = null
    if (next_followup_date) {
      const raw = String(next_followup_date)
      const dateOnly = raw.split('T')[0].split(' ')[0]
      const parsed = new Date(`${dateOnly}T00:00:00`)
      if (Number.isNaN(parsed.getTime())) {
        return reply.code(400).send({ error: 'Invalid follow-up date' })
      }
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      if (parsed < start) {
        return reply.code(400).send({ error: 'Follow-up date cannot be in the past' })
      }
      normalizedDate = dateOnly
    } else if (lead.status === 'Awaiting Advance') {
      normalizedDate = addDaysYMD(3)
    } else {
      return reply.code(400).send({ error: 'Next follow-up date is required' })
    }

    let nextNotContactedCount = lead.not_contacted_count ?? 0
    if (outcome === 'Connected') {
      nextNotContactedCount = 0
    } else if (outcome === 'Not connected') {
      nextNotContactedCount = (lead.not_contacted_count ?? 0) + 1
    }
    const shouldForceCold =
      outcome === 'Not connected' && nextNotContactedCount >= 5 && lead.heat !== 'Cold'

    const updated = await pool.query(
      `UPDATE leads
     SET next_followup_date=$1,
         not_contacted_count=$2,
         heat = CASE WHEN $3 THEN 'Cold' ELSE heat END,
         updated_at=NOW()
     WHERE id=$4
     RETURNING *`,
      [normalizedDate, nextNotContactedCount, shouldForceCold, id]
    )

    const shouldCreateNote =
      (outcome === 'Not connected' && not_connected_reason) ||
      (Array.isArray(discussed_topics) && discussed_topics.length > 0) ||
      (note && String(note).trim())

    if (shouldCreateNote) {
      const lines = []
      if (outcome === 'Connected' && follow_up_mode) {
        lines.push(`${follow_up_mode} follow-up.`)
      }
      if (outcome === 'Not connected' && not_connected_reason) {
        lines.push('Follow up Attempted . Not Connected')
        lines.push(`Reason: ${not_connected_reason}`)
      }
      if (Array.isArray(discussed_topics) && discussed_topics.length) {
        lines.push(`Discussed: ${discussed_topics.join(', ')}`)
      }
      if (note && String(note).trim()) {
        lines.push(String(note).trim())
      }

      const noteText = lines.join('\n')
      if (noteText.length > 1000) {
        return reply.code(400).send({ error: 'Note must be 1000 characters or fewer' })
      }

      await pool.query(
        `INSERT INTO lead_notes (lead_id, note_text, status_at_time, user_id)
       VALUES ($1,$2,$3,$4)`,
        [id, noteText, lead.status, auth?.sub || null]
      )
    }

    try {
      const tableCheck = await pool.query("SELECT to_regclass('public.lead_followups') AS exists")
      if (tableCheck.rows[0]?.exists) {
        const modeForType =
          typeof follow_up_mode === 'string' && follow_up_mode
            ? follow_up_mode.toLowerCase()
            : 'other'
        await pool.query(
          `INSERT INTO lead_followups (lead_id, follow_up_at, type, note, outcome, follow_up_mode, discussed_topics, not_connected_reason, user_id)
         VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            modeForType,
            note || null,
            outcome,
            follow_up_mode || null,
            Array.isArray(discussed_topics) ? JSON.stringify(discussed_topics) : null,
            not_connected_reason || null,
            auth?.sub || null,
          ]
        )
      }
    } catch (err) {
      console.warn('Follow-up log skipped:', err?.message || err)
    }

    await logLeadActivity(
      id,
      'followup_done',
      {
        outcome,
        follow_up_mode: outcome === 'Connected' ? follow_up_mode || null : null,
        previous_followup_date: lead.next_followup_date || null,
        next_followup_date: normalizedDate,
      },
      auth?.sub || null
    )
    if (shouldForceCold) {
      await logLeadActivity(id, 'heat_change', { from: lead.heat || 'Warm', to: 'Cold' }, auth?.sub || null)
    }

    let finalLeadRow = updated.rows[0]
    let autoContacted = false
    let statusForAuto = lead.status

    if (lead.status === 'New' && outcome === 'Connected') {
      const currentHeat = lead.heat || 'Cold'
      const nextHeat = currentHeat === 'Cold' ? 'Warm' : currentHeat
      const contactedUpdate = await pool.query(
        `
      UPDATE leads
      SET status='Contacted',
          previous_status=$1,
          heat=$2,
          first_contacted_at = CASE
            WHEN first_contacted_at IS NULL THEN NOW()
            ELSE first_contacted_at
          END,
          updated_at=NOW()
      WHERE id=$3
      RETURNING *
      `,
        [lead.status, nextHeat, id]
      )
      if (contactedUpdate.rows.length) {
        finalLeadRow = contactedUpdate.rows[0]
        statusForAuto = 'Contacted'
        autoContacted = true
        await logLeadActivity(
          id,
          'status_change',
          { from: lead.status, to: 'Contacted', system: true, reason: 'auto_contacted' },
          auth?.sub || null
        )
      }
    }
    let autoNegotiation = null
    const shouldAutoNegotiation =
      outcome === 'Connected' &&
      Array.isArray(discussed_topics) &&
      discussed_topics.includes('Pricing / negotiation') &&
      statusForAuto !== 'Negotiation' &&
      !['Lost', 'Converted', 'Rejected'].includes(statusForAuto)

    if (shouldAutoNegotiation) {
      autoNegotiation = { attempted: true, success: false, reason: null }
      const quoteCheck = await pool.query(`SELECT amount_quoted FROM leads WHERE id=$1`, [id])
      const amountQuoted = quoteCheck.rows[0]?.amount_quoted
      const hasEvent = await hasAnyEvent(id)
      const hasPrimary = await hasPrimaryCity(id)
      const hasAllCities = await hasEventsForAllCities(id)

      let failureReason = null
      if (amountQuoted === null || amountQuoted === undefined || amountQuoted === '') {
        failureReason = 'Amount quoted is required before moving this lead forward'
      } else if (!hasEvent) {
        failureReason = 'No events are added yet. Add an event before moving this lead forward'
      } else if (!hasPrimary) {
        failureReason = 'A primary city is required before moving this lead forward'
      } else if (!hasAllCities) {
        failureReason = 'Each city must be linked to at least one event before moving this lead forward'
      }

      if (failureReason) {
        autoNegotiation.reason = failureReason
      } else {
        const updatedStatus = await pool.query(
          `
        UPDATE leads
        SET status='Negotiation',
            previous_status=$1,
            heat='Hot',
            negotiation_since=NOW(),
            updated_at=NOW()
        WHERE id=$2
        RETURNING *
        `,
          [statusForAuto, id]
        )
        if (updatedStatus.rows.length) {
          finalLeadRow = updatedStatus.rows[0]
          await logLeadActivity(
            id,
            'status_change',
            { from: statusForAuto, to: 'Negotiation', system: true, reason: 'auto_negotiation' },
            auth?.sub || null
          )
          autoNegotiation.success = true
        }
      }
    }

    return {
      ...normalizeLeadRow(finalLeadRow),
      auto_negotiation: autoNegotiation,
      auto_contacted: autoContacted,
    }
  })

  api.delete('/leads/:id', async (req, reply) => {
    const { id } = req.params
    const auth = getAuthFromRequest(req)
    const isAdmin = auth ? (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin') : false
    
    if (!isAdmin) {
      return reply.code(403).send({ error: 'Only admins can delete leads' })
    }

    try {
      // Check if there are any invoices. Invoices have ON DELETE RESTRICT on lead_id.
      // We don't want to accidentally delete a real project with invoices.
      const invoiceCheck = await pool.query('SELECT id FROM invoices WHERE lead_id = $1 LIMIT 1', [id])
      if (invoiceCheck.rows.length > 0) {
        return reply.code(400).send({ error: 'Cannot delete lead with associated invoices. Delete invoices first.' })
      }

      await pool.query('BEGIN')
      
      // Cleanup tables that might not have ON DELETE CASCADE or to be explicit
      await pool.query('DELETE FROM lead_events WHERE lead_id = $1', [id])
      await pool.query('DELETE FROM lead_notes WHERE lead_id = $1', [id])
      await pool.query('DELETE FROM lead_activities WHERE lead_id = $1', [id])
      
      // Attempt to delete the lead
      const res = await pool.query('DELETE FROM leads WHERE id = $1 RETURNING id', [id])
      
      if (res.rows.length === 0) {
        await pool.query('ROLLBACK')
        return reply.code(404).send({ error: 'Lead not found' })
      }
      
      await pool.query('COMMIT')
      return { success: true }
    } catch (error) {
      await pool.query('ROLLBACK')
      console.error('Error deleting lead:', error)
      return reply.code(500).send({ error: 'Failed to delete lead: ' + error.message })
    }
  })

}
