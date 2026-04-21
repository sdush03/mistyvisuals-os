module.exports = async function(api, opts) {
  const {
    ALLOWED_COMPOUND_TLDS, ALLOWED_EMAIL_TLDS, ALLOWED_ORIGINS, AUTH_COOKIE, AUTH_SECRET, COMMON_EMAIL_DOMAINS, COVERAGE_SCOPES, DEV_ORIGINS, EMAIL_TYPO_MAP, FOLLOWUP_TYPES, HEAT_VALUES, LEAD_STATUSES, PHOTO_UPLOAD_DIR, PROD_ORIGIN, PROTECTED_ADMIN_EMAIL, PUBLIC_API_PATHS, UPLOADS_DIR, VIDEO_UPLOAD_DIR, addDaysToYMD, addDaysYMD, apiRoutes, assignReferenceCode, boolToYesNo, canonicalizeEmail, canonicalizeInstagram, canonicalizePhone, classifyDeviceType, clearAuthCookie, createNotification, dateToYMD, detectBrowser, detectPlatform, ensureDirectory, fetchProfitProjectRows, formatName, formatRefDate, getAuthFromRequest, getAvailableFyLabels, getClientInfo, getCurrentFyLabel, getDateRange, getFirstName, getFyLabelFromDate, getFyRange, getImageContentType, getNextLeadNumber, getOrCreateCity, getRoundRobinSalesUserId, getUserDisplayName, hasAllEventTimes, hasAnyEvent, hasEventInPrimaryCity, hasEventsForAllCities, hasPrimaryCity, hashPassword, isProtectedAdminUser, isValidInstagramUsername, listFyLabelsBetween, logAdminAudit, logLeadActivity, normalizeDateValue, normalizeEmailInput, normalizeInstagramUrl, normalizeLeadRow, normalizeLeadRows, normalizeNickname, normalizePhone, normalizeYMD, parseCookies, parseDataUrl, parseFyLabel, recalculateAccountBalances, recomputeLeadMetrics, recomputeUserMetrics, recomputeUserMetricsRange, requireAdmin, requireAuth, requireVendor, resolveUserDisplayName, runMetricsJob, sanitizeTags, setAuthCookie, signToken, startOfDay, toISTDateString, validateEmail, verifyPassword, verifyToken, yesNoToBool, pool
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
        ps.snapshot_json->'status' AS status,
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
      `SELECT pv.id, pv.ip, pv.device, (pv.proposal_snapshot_id = $1) AS is_current_version,
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
              to_char((created_at AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+05:30"') AS created_at,
              (metadata->>'token' = $2) AS is_current_version 
       FROM lead_activities 
       WHERE lead_id = $1 AND activity_type LIKE 'PROPOSAL_%'
       ORDER BY created_at DESC`,
      [proposal.lead_id, proposal.proposal_token]
    )

    // Engagement events
    const { rows: events } = await pool.query(
      `SELECT pe.id, pe.session_id, pe.event_type, pe.event_data, pe.ip, pe.device, pe.referrer,
              to_char((pe.created_at AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+05:30"') AS created_at,
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

    return {
      proposal, views, activities, events,
      slideHeatmap: Object.entries(slideMap).map(([slide, d]) => ({ slide, ...d })),
      engagement: { uniqueSessions, uniqueDevices, totalDwellMs: totalDwell, pricingDwellMs: pricingDwell, addonRequested, accepted },
      geoData: geoMap,
      isForwarded,
      uniqueFingerprints: viewFingerprints.size,
      internalIPs,
    }
  })


}
