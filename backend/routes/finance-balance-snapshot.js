module.exports = async function(api, opts) {
  const {
    ALLOWED_COMPOUND_TLDS, ALLOWED_EMAIL_TLDS, ALLOWED_ORIGINS, AUTH_COOKIE, AUTH_SECRET, COMMON_EMAIL_DOMAINS, COVERAGE_SCOPES, DEV_ORIGINS, EMAIL_TYPO_MAP, FOLLOWUP_TYPES, HEAT_VALUES, LEAD_STATUSES, PHOTO_UPLOAD_DIR, PROD_ORIGIN, PROTECTED_ADMIN_EMAIL, PUBLIC_API_PATHS, UPLOADS_DIR, VIDEO_UPLOAD_DIR, addDaysToYMD, addDaysYMD, apiRoutes, assignReferenceCode, boolToYesNo, canonicalizeEmail, canonicalizeInstagram, canonicalizePhone, classifyDeviceType, clearAuthCookie, createNotification, dateToYMD, detectBrowser, detectPlatform, ensureDirectory, fetchProfitProjectRows, formatName, formatRefDate, getAuthFromRequest, getAvailableFyLabels, getClientInfo, getCurrentFyLabel, getDateRange, getFirstName, getFyLabelFromDate, getFyRange, getImageContentType, getNextLeadNumber, getOrCreateCity, getRoundRobinSalesUserId, getUserDisplayName, hasAllEventTimes, hasAnyEvent, hasEventInPrimaryCity, hasEventsForAllCities, hasPrimaryCity, hashPassword, isProtectedAdminUser, isValidInstagramUsername, listFyLabelsBetween, logAdminAudit, logLeadActivity, normalizeDateValue, normalizeEmailInput, normalizeInstagramUrl, normalizeLeadRow, normalizeLeadRows, normalizeNickname, normalizePhone, normalizeYMD, parseCookies, parseDataUrl, parseFyLabel, recalculateAccountBalances, recomputeLeadMetrics, recomputeUserMetrics, recomputeUserMetricsRange, requireAdmin, requireAuth, requireVendor, resolveUserDisplayName, runMetricsJob, sanitizeTags, setAuthCookie, signToken, startOfDay, toISTDateString, validateEmail, verifyPassword, verifyToken, yesNoToBool, pool
  } = opts;

/* ===================== FINANCE — BALANCE SNAPSHOT ===================== */

let balanceRefreshRunning = false

async function recalculateAccountBalances() {
  if (balanceRefreshRunning) return
  balanceRefreshRunning = true
  try {
    await pool.query(
      `
      WITH sums AS (
        SELECT money_source_id,
               SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) as balance
        FROM finance_transactions
        WHERE is_deleted = false
        GROUP BY money_source_id
      ),
      rows AS (
        SELECT ms.id as money_source_id, COALESCE(s.balance, 0) as balance
        FROM money_sources ms
        LEFT JOIN sums s ON s.money_source_id = ms.id
      )
      INSERT INTO finance_account_balances (money_source_id, balance, last_calculated_at)
      SELECT money_source_id, balance, NOW()
      FROM rows
      ON CONFLICT (money_source_id)
      DO UPDATE SET balance = EXCLUDED.balance, last_calculated_at = EXCLUDED.last_calculated_at
      `
    )
  } catch (err) {
    if (err?.code !== '42P01') {
      console.warn('Balance refresh failed:', err?.message || err)
    }
  } finally {
    balanceRefreshRunning = false
  }
}


}
