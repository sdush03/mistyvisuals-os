module.exports = async function(api, opts) {
  const {
    ALLOWED_COMPOUND_TLDS, ALLOWED_EMAIL_TLDS, ALLOWED_ORIGINS, AUTH_COOKIE, AUTH_SECRET, COMMON_EMAIL_DOMAINS, COVERAGE_SCOPES, DEV_ORIGINS, EMAIL_TYPO_MAP, FOLLOWUP_TYPES, HEAT_VALUES, LEAD_STATUSES, PHOTO_UPLOAD_DIR, PROD_ORIGIN, PROTECTED_ADMIN_EMAIL, PUBLIC_API_PATHS, UPLOADS_DIR, VIDEO_UPLOAD_DIR, addDaysToYMD, addDaysYMD, apiRoutes, assignReferenceCode, boolToYesNo, canonicalizeEmail, canonicalizeInstagram, canonicalizePhone, classifyDeviceType, clearAuthCookie, createNotification, dateToYMD, detectBrowser, detectPlatform, ensureDirectory, fetchProfitProjectRows, formatName, formatRefDate, getAuthFromRequest, getAvailableFyLabels, getClientInfo, getCurrentFyLabel, getDateRange, getFirstName, getFyLabelFromDate, getFyRange, getImageContentType, getNextLeadNumber, getOrCreateCity, getRoundRobinSalesUserId, getUserDisplayName, hasAllEventTimes, hasAnyEvent, hasEventInPrimaryCity, hasEventsForAllCities, hasPrimaryCity, hashPassword, isProtectedAdminUser, isValidInstagramUsername, listFyLabelsBetween, logAdminAudit, logLeadActivity, normalizeDateValue, normalizeEmailInput, normalizeInstagramUrl, normalizeLeadRow, normalizeLeadRows, normalizeNickname, normalizePhone, normalizeYMD, parseCookies, parseDataUrl, parseFyLabel, recalculateAccountBalances, recomputeLeadMetrics, recomputeUserMetrics, recomputeUserMetricsRange, requireAdmin, requireAuth, requireVendor, resolveUserDisplayName, runMetricsJob, sanitizeTags, setAuthCookie, signToken, startOfDay, toISTDateString, validateEmail, verifyPassword, verifyToken, yesNoToBool, pool
  } = opts;

  /* ===================== FOLLOW UPS ===================== */

  api.get('/leads/:id/followups', async (req) =>
    (await pool.query(
      `SELECT * FROM lead_followups
     WHERE lead_id=$1
     ORDER BY follow_up_at ASC`,
      [req.params.id]
    )).rows
  )

  api.post('/leads/:id/followups', async (req, reply) => {
    const { followUpAt, type, note } = req.body
    const auth = getAuthFromRequest(req)
    if (!followUpAt || !FOLLOWUP_TYPES.includes(type))
      return reply.code(400).send({ error: 'Invalid follow-up' })

    const leadRes = await pool.query(`SELECT status FROM leads WHERE id=$1`, [req.params.id])
    if (!leadRes.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }
    if (['Converted', 'Lost', 'Rejected'].includes(leadRes.rows[0].status)) {
      return reply.code(400).send({ error: 'Follow-up not allowed for this status' })
    }

    const r = await pool.query(
      `INSERT INTO lead_followups (lead_id, follow_up_at, type, note, user_id)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
      [req.params.id, followUpAt, type, note || null, auth?.sub || null]
    )

    await pool.query(
      `UPDATE leads
     SET heat = CASE WHEN heat='Cold' THEN 'Warm' ELSE heat END,
         updated_at=NOW()
     WHERE id=$1 AND status NOT IN ('Lost','Converted','Rejected')`,
      [req.params.id]
    )

    return r.rows[0]
  })


}
