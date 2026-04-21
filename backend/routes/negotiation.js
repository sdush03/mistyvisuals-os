module.exports = async function(api, opts) {
  const {
    ALLOWED_COMPOUND_TLDS, ALLOWED_EMAIL_TLDS, ALLOWED_ORIGINS, AUTH_COOKIE, AUTH_SECRET, COMMON_EMAIL_DOMAINS, COVERAGE_SCOPES, DEV_ORIGINS, EMAIL_TYPO_MAP, FOLLOWUP_TYPES, HEAT_VALUES, LEAD_STATUSES, PHOTO_UPLOAD_DIR, PROD_ORIGIN, PROTECTED_ADMIN_EMAIL, PUBLIC_API_PATHS, UPLOADS_DIR, VIDEO_UPLOAD_DIR, addDaysToYMD, addDaysYMD, apiRoutes, assignReferenceCode, boolToYesNo, canonicalizeEmail, canonicalizeInstagram, canonicalizePhone, classifyDeviceType, clearAuthCookie, createNotification, dateToYMD, detectBrowser, detectPlatform, ensureDirectory, fetchProfitProjectRows, formatName, formatRefDate, getAuthFromRequest, getAvailableFyLabels, getClientInfo, getCurrentFyLabel, getDateRange, getFirstName, getFyLabelFromDate, getFyRange, getImageContentType, getNextLeadNumber, getOrCreateCity, getRoundRobinSalesUserId, getUserDisplayName, hasAllEventTimes, hasAnyEvent, hasEventInPrimaryCity, hasEventsForAllCities, hasPrimaryCity, hashPassword, isProtectedAdminUser, isValidInstagramUsername, listFyLabelsBetween, logAdminAudit, logLeadActivity, normalizeDateValue, normalizeEmailInput, normalizeInstagramUrl, normalizeLeadRow, normalizeLeadRows, normalizeNickname, normalizePhone, normalizeYMD, parseCookies, parseDataUrl, parseFyLabel, recalculateAccountBalances, recomputeLeadMetrics, recomputeUserMetrics, recomputeUserMetricsRange, requireAdmin, requireAuth, requireVendor, resolveUserDisplayName, runMetricsJob, sanitizeTags, setAuthCookie, signToken, startOfDay, toISTDateString, validateEmail, verifyPassword, verifyToken, yesNoToBool, pool
  } = opts;

  /* ===================== NEGOTIATION ===================== */

  api.get('/leads/:id/negotiations', async (req) =>
    (await pool.query(
      `SELECT * FROM lead_negotiations
     WHERE lead_id=$1
     ORDER BY created_at DESC`,
      [req.params.id]
    )).rows
  )

  api.post('/leads/:id/negotiations', async (req, reply) => {
    const { topic, note } = req.body
    const auth = getAuthFromRequest(req)
    if (!topic || !note)
      return reply.code(400).send({ error: 'Invalid negotiation note' })

    const leadRes = await pool.query(`SELECT status FROM leads WHERE id=$1`, [req.params.id])
    if (!leadRes.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }
    if (['Converted', 'Lost', 'Rejected'].includes(leadRes.rows[0].status)) {
      return reply.code(400).send({ error: 'Negotiation not allowed for this status' })
    }

    const r = await pool.query(
      `INSERT INTO lead_negotiations (lead_id, topic, note)
     VALUES ($1,$2,$3)
     RETURNING *`,
      [req.params.id, topic, note]
    )

    await pool.query(
      `UPDATE leads
     SET heat='Hot', updated_at=NOW()
     WHERE id=$1 AND status NOT IN ('Lost','Converted','Rejected')`,
      [req.params.id]
    )

    await logLeadActivity(
      req.params.id,
      'negotiation_entry',
      { log_type: 'activity', negotiation_id: r.rows[0]?.id || null, topic },
      auth?.sub || null
    )

    return r.rows[0]
  })


}
