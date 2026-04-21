module.exports = async function(api, opts) {
  const {
    ALLOWED_COMPOUND_TLDS, ALLOWED_EMAIL_TLDS, ALLOWED_ORIGINS, AUTH_COOKIE, AUTH_SECRET, COMMON_EMAIL_DOMAINS, COVERAGE_SCOPES, DEV_ORIGINS, EMAIL_TYPO_MAP, FOLLOWUP_TYPES, HEAT_VALUES, LEAD_STATUSES, PHOTO_UPLOAD_DIR, PROD_ORIGIN, PROTECTED_ADMIN_EMAIL, PUBLIC_API_PATHS, UPLOADS_DIR, VIDEO_UPLOAD_DIR, addDaysToYMD, addDaysYMD, apiRoutes, assignReferenceCode, boolToYesNo, canonicalizeEmail, canonicalizeInstagram, canonicalizePhone, classifyDeviceType, clearAuthCookie, createNotification, dateToYMD, detectBrowser, detectPlatform, ensureDirectory, fetchProfitProjectRows, formatName, formatRefDate, getAuthFromRequest, getAvailableFyLabels, getClientInfo, getCurrentFyLabel, getDateRange, getFirstName, getFyLabelFromDate, getFyRange, getImageContentType, getNextLeadNumber, getOrCreateCity, getRoundRobinSalesUserId, getUserDisplayName, hasAllEventTimes, hasAnyEvent, hasEventInPrimaryCity, hasEventsForAllCities, hasPrimaryCity, hashPassword, isProtectedAdminUser, isValidInstagramUsername, listFyLabelsBetween, logAdminAudit, logLeadActivity, normalizeDateValue, normalizeEmailInput, normalizeInstagramUrl, normalizeLeadRow, normalizeLeadRows, normalizeNickname, normalizePhone, normalizeYMD, parseCookies, parseDataUrl, parseFyLabel, recalculateAccountBalances, recomputeLeadMetrics, recomputeUserMetrics, recomputeUserMetricsRange, requireAdmin, requireAuth, requireVendor, resolveUserDisplayName, runMetricsJob, sanitizeTags, setAuthCookie, signToken, startOfDay, toISTDateString, validateEmail, verifyPassword, verifyToken, yesNoToBool, pool
  } = opts;

  /* ===================== LEAD USAGE ===================== */

  api.post('/leads/:id/usage/start', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
    const { id } = req.params

    const r = await pool.query(
      `INSERT INTO lead_usage_logs (user_id, lead_id, entered_at)
     VALUES ($1,$2,NOW())
     RETURNING id, entered_at`,
      [auth.sub, id]
    )

    return r.rows[0]
  })

  api.post('/leads/:id/usage/end', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
    const { id } = req.params
    const usageId = req.body?.usage_id ? Number(req.body.usage_id) : null

    if (usageId) {
      const r = await pool.query(
        `
      UPDATE lead_usage_logs
      SET left_at=NOW(),
          duration_seconds=EXTRACT(EPOCH FROM (NOW() - entered_at))::int
      WHERE id=$1 AND user_id=$2 AND lead_id=$3 AND left_at IS NULL
      RETURNING id
      `,
        [usageId, auth.sub, id]
      )
      if (r.rows.length) return { success: true }
    }

    await pool.query(
      `
    WITH target AS (
      SELECT id FROM lead_usage_logs
      WHERE user_id=$1 AND lead_id=$2 AND left_at IS NULL
      ORDER BY entered_at DESC
      LIMIT 1
    )
    UPDATE lead_usage_logs
    SET left_at=NOW(),
        duration_seconds=EXTRACT(EPOCH FROM (NOW() - entered_at))::int
    WHERE id IN (SELECT id FROM target)
    `,
      [auth.sub, id]
    )

    return { success: true }
  })


}
