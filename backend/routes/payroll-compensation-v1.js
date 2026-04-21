module.exports = async function(api, opts) {
  const {
    ALLOWED_COMPOUND_TLDS, ALLOWED_EMAIL_TLDS, ALLOWED_ORIGINS, AUTH_COOKIE, AUTH_SECRET, COMMON_EMAIL_DOMAINS, COVERAGE_SCOPES, DEV_ORIGINS, EMAIL_TYPO_MAP, FOLLOWUP_TYPES, HEAT_VALUES, LEAD_STATUSES, PHOTO_UPLOAD_DIR, PROD_ORIGIN, PROTECTED_ADMIN_EMAIL, PUBLIC_API_PATHS, UPLOADS_DIR, VIDEO_UPLOAD_DIR, addDaysToYMD, addDaysYMD, apiRoutes, assignReferenceCode, boolToYesNo, canonicalizeEmail, canonicalizeInstagram, canonicalizePhone, classifyDeviceType, clearAuthCookie, createNotification, dateToYMD, detectBrowser, detectPlatform, ensureDirectory, fetchProfitProjectRows, formatName, formatRefDate, getAuthFromRequest, getAvailableFyLabels, getClientInfo, getCurrentFyLabel, getDateRange, getFirstName, getFyLabelFromDate, getFyRange, getImageContentType, getNextLeadNumber, getOrCreateCity, getRoundRobinSalesUserId, getUserDisplayName, hasAllEventTimes, hasAnyEvent, hasEventInPrimaryCity, hasEventsForAllCities, hasPrimaryCity, hashPassword, isProtectedAdminUser, isValidInstagramUsername, listFyLabelsBetween, logAdminAudit, logLeadActivity, normalizeDateValue, normalizeEmailInput, normalizeInstagramUrl, normalizeLeadRow, normalizeLeadRows, normalizeNickname, normalizePhone, normalizeYMD, parseCookies, parseDataUrl, parseFyLabel, recalculateAccountBalances, recomputeLeadMetrics, recomputeUserMetrics, recomputeUserMetricsRange, requireAdmin, requireAuth, requireVendor, resolveUserDisplayName, runMetricsJob, sanitizeTags, setAuthCookie, signToken, startOfDay, toISTDateString, validateEmail, verifyPassword, verifyToken, yesNoToBool, pool
  } = opts;

  /* ===================== PAYROLL / COMPENSATION v1 ===================== */

  const normalizePayrollMonth = (value) => {
    if (!value) return null
    const trimmed = String(value).trim()
    if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return `${trimmed.slice(0, 7)}-01`
    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) return null
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    return `${parsed.getFullYear()}-${month}-01`
  }

  const getPayrollCategoryId = async (client) => {
    const existing = await client.query(
      `SELECT id, name FROM finance_categories WHERE LOWER(name) IN ('payroll','salary','stipend') ORDER BY id ASC LIMIT 1`
    )
    if (existing.rows.length) return existing.rows[0].id
    const created = await client.query(
      `INSERT INTO finance_categories (name) VALUES ('Payroll') RETURNING id`
    )
    return created.rows[0].id
  }

  // List compensation profiles (joined with user name)
  api.get('/payroll/profiles', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const { rows } = await pool.query(`
        SELECT ecp.*, u.name as user_name, u.email as user_email
        FROM employee_compensation_profiles ecp
        JOIN users u ON u.id = ecp.user_id
        ORDER BY u.name ASC
      `)
      return reply.send(rows)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch profiles' })
    }
  })


}
