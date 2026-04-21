module.exports = async function(api, opts) {
  const {
    ALLOWED_COMPOUND_TLDS, ALLOWED_EMAIL_TLDS, ALLOWED_ORIGINS, AUTH_COOKIE, AUTH_SECRET, COMMON_EMAIL_DOMAINS, COVERAGE_SCOPES, DEV_ORIGINS, EMAIL_TYPO_MAP, FOLLOWUP_TYPES, HEAT_VALUES, LEAD_STATUSES, PHOTO_UPLOAD_DIR, PROD_ORIGIN, PROTECTED_ADMIN_EMAIL, PUBLIC_API_PATHS, UPLOADS_DIR, VIDEO_UPLOAD_DIR, addDaysToYMD, addDaysYMD, apiRoutes, assignReferenceCode, boolToYesNo, canonicalizeEmail, canonicalizeInstagram, canonicalizePhone, classifyDeviceType, clearAuthCookie, createNotification, dateToYMD, detectBrowser, detectPlatform, ensureDirectory, fetchProfitProjectRows, formatName, formatRefDate, getAuthFromRequest, getAvailableFyLabels, getClientInfo, getCurrentFyLabel, getDateRange, getFirstName, getFyLabelFromDate, getFyRange, getImageContentType, getNextLeadNumber, getOrCreateCity, getRoundRobinSalesUserId, getUserDisplayName, hasAllEventTimes, hasAnyEvent, hasEventInPrimaryCity, hasEventsForAllCities, hasPrimaryCity, hashPassword, isProtectedAdminUser, isValidInstagramUsername, listFyLabelsBetween, logAdminAudit, logLeadActivity, normalizeDateValue, normalizeEmailInput, normalizeInstagramUrl, normalizeLeadRow, normalizeLeadRows, normalizeNickname, normalizePhone, normalizeYMD, parseCookies, parseDataUrl, parseFyLabel, recalculateAccountBalances, recomputeLeadMetrics, recomputeUserMetrics, recomputeUserMetricsRange, requireAdmin, requireAuth, requireVendor, resolveUserDisplayName, runMetricsJob, sanitizeTags, setAuthCookie, signToken, startOfDay, toISTDateString, validateEmail, verifyPassword, verifyToken, yesNoToBool, pool
  } = opts;

  /* ===================== WHATSAPP MESSAGE TEMPLATE ===================== */
  api.get('/leads/:id/whatsapp-message', async (req, reply) => {
    const { id } = req.params
    const auth = getAuthFromRequest(req)

    const lead = await pool.query(
      `SELECT name, status FROM leads WHERE id=$1`,
      [id]
    )

    if (!lead.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }

    const tpl = await pool.query(
      `SELECT message FROM whatsapp_templates WHERE stage=$1`,
      [lead.rows[0].status]
    )

    const raw =
      tpl.rows[0]?.message ||
      'Hey {{name}}, I am {{user}}. Let me know a good time to connect.'

    let userName = 'Misty Visuals Team'
    if (auth?.sub) {
      const userRes = await pool.query(
        `SELECT name FROM users WHERE id=$1`,
        [auth.sub]
      )
      if (userRes.rows[0]?.name) {
        userName = userRes.rows[0].name
      }
    }

    const resolved = raw
      .replace('{{name}}', lead.rows[0].name || '')
      .replace('{{user}}', userName)
      .replace('{{quote_link}}', 'https://mistyvisuals.in/quote')

    return { message: resolved }
  })


}
