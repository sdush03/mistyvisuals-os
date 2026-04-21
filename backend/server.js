
require('dotenv').config()
const fastify = require('fastify')({ logger: true, bodyLimit: 524288000 })
const cors = require('@fastify/cors')
const cookie = require('@fastify/cookie')
const jwt = require('@fastify/jwt')
const multipart = require('@fastify/multipart')
const quotationRoutes = require('./modules/quotation/quotation.routes')
const placesRoutes = require('./modules/places/places.routes')
const crypto = require('crypto')
const { pipeline } = require('stream/promises')
const fs = require('fs')
const path = require('path')
const authRoutes = require('./routes/auth')
const aiRoutes = require('./routes/ai')
const facebookRoutes = require('./routes/facebook')
const fbAdsRoutes = require('./routes/fb-ads')

/* ===================== DB ===================== */
const { pool } = require('./db.js')


/* ===================== CORS ===================== */

const PROD_ORIGIN = process.env.APP_ORIGIN
const DEV_ORIGINS = (process.env.DEV_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
const ALLOWED_ORIGINS = [PROD_ORIGIN, ...DEV_ORIGINS].filter(Boolean)

fastify.register(cors, {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (!ALLOWED_ORIGINS.length) return callback(null, true)
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
    return callback(new Error('Origin not allowed'), false)
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  credentials: true,
})

const AUTH_COOKIE = 'mv_auth'
const AUTH_SECRET = process.env.AUTH_SECRET
if (!AUTH_SECRET) {
  throw new Error('AUTH_SECRET is required.')
}

fastify.register(cookie, { hook: 'onRequest' })
fastify.register(jwt, { secret: AUTH_SECRET })

fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    req.rawBody = body
    var json = JSON.parse(body)
    done(null, json)
  } catch (err) {
    err.statusCode = 400
    done(err, undefined)
  }
})
fastify.register(multipart, { limits: { fileSize: 524288000 } }) // 500MB multipart limit



/* ===================== CONSTANTS ===================== */
const constants = require('./config/constants.js')
const {
  LEAD_STATUSES, COVERAGE_SCOPES, FOLLOWUP_TYPES, HEAT_VALUES, UPLOADS_DIR, PHOTO_UPLOAD_DIR
} = constants;

/* ===================== HELPERS ===================== */
const helpers = require('./utils/helpers.js')({
  pool, fs, path, crypto, jwt, AUTH_SECRET, AUTH_COOKIE, ...constants
})
const {
  setAuthCookie, normalizeYMD, getUserDisplayName, canonicalizeInstagram, startOfDay, ALLOWED_COMPOUND_TLDS, listFyLabelsBetween, recomputeLeadMetrics, normalizeEmailInput, addDaysToYMD, recomputeUserMetrics, resolveUserDisplayName, COMMON_EMAIL_DOMAINS, hasEventsForAllCities, signToken, EMAIL_TYPO_MAP, logAdminAudit, hasAnyEvent, sanitizeTags, getCurrentFyLabel, getOrCreateCity, requireAuth, parseDataUrl, normalizeLeadRow, ensureDirectory, ALLOWED_EMAIL_TLDS, hasAllEventTimes, canonicalizeEmail, normalizeInstagramUrl, normalizeLeadRows, isProtectedAdminUser, parseCookies, getFirstName, getAuthFromRequest, normalizePhone, hasEventInPrimaryCity, isValidInstagramUsername, createNotification, formatName, normalizeNickname, getDateRange, requireVendor, dateToYMD, validateEmail, assignReferenceCode, formatRefDate, PROTECTED_ADMIN_EMAIL, getAvailableFyLabels, yesNoToBool, verifyPassword, getFyLabelFromDate, logLeadActivity, getFyRange, boolToYesNo, getImageContentType, getRoundRobinSalesUserId, parseFyLabel, hashPassword, hasPrimaryCity, verifyToken, requireAdmin, normalizeDateValue, addDaysYMD, clearAuthCookie, fetchProfitProjectRows, toISTDateString, getNextLeadNumber, canonicalizePhone
} = helpers;

/* ===================== API AUTH GUARD ===================== */
const PUBLIC_API_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/health',
  '/api/version',
  '/api/webhooks/meta',
  '/auth/login',
  '/auth/logout',
  '/health',
  '/version',
  '/webhooks/meta',
])

fastify.addHook('onRequest', (req, reply, done) => {
  const url = req.raw?.url || req.url || ''
  if (req.method === 'OPTIONS') return done()
  const path = url.split('?')[0]
  if (PUBLIC_API_PATHS.has(path)) return done()
  // Proposal endpoints are public — accessed by unauthenticated clients
  if (path.startsWith('/api/proposals/') || path.startsWith('/proposals/')) return done()
  // Public catalog endpoints for proposal viewers
  if (path === '/api/catalog/addons/public' || path === '/catalog/addons/public') return done()
  if (path.endsWith('/events') && (path.startsWith('/api/proposals/') || path.startsWith('/proposals/'))) return done()
  // Photo/Video files are static assets — safe to serve without auth (needed for public proposals)
  if (path.startsWith('/api/photos/file/') || path.startsWith('/photos/file/')) return done()
  if (path.startsWith('/api/videos/file/') || path.startsWith('/videos/file/')) return done()
  const auth = getAuthFromRequest(req)
  if (auth) req.auth = auth
  if (!auth) {
    reply.code(401).send({ error: 'Not authenticated' })
    return
  }
  done()
})

function classifyDeviceType(userAgent) {
  const ua = String(userAgent || '').toLowerCase()
  if (!ua) return 'desktop'
  if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet'
  if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) {
    return 'mobile'
  }
  return 'desktop'
}

function detectPlatform(userAgent) {
  const ua = String(userAgent || '').toLowerCase()
  if (!ua) return 'unknown'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'ios'
  if (ua.includes('android')) return 'android'
  if (ua.includes('windows')) return 'windows'
  if (ua.includes('mac os x') || ua.includes('macintosh')) return 'macos'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

function detectBrowser(userAgent) {
  const ua = String(userAgent || '')
  const lower = ua.toLowerCase()
  if (lower.includes('edg/')) {
    const match = /edg\/([\d.]+)/i.exec(ua)
    return { name: 'Edge', version: match?.[1] || null }
  }
  if (lower.includes('chrome/')) {
    const match = /chrome\/([\d.]+)/i.exec(ua)
    return { name: 'Chrome', version: match?.[1] || null }
  }
  if (lower.includes('firefox/')) {
    const match = /firefox\/([\d.]+)/i.exec(ua)
    return { name: 'Firefox', version: match?.[1] || null }
  }
  if (lower.includes('safari/') && lower.includes('version/')) {
    const match = /version\/([\d.]+)/i.exec(ua)
    return { name: 'Safari', version: match?.[1] || null }
  }
  return { name: 'Unknown', version: null }
}

function getClientInfo(req) {
  const userAgent = String(req.headers['user-agent'] || '')
  const headerClientType = String(req.headers['x-client-type'] || '').toLowerCase()
  const headerPlatform = String(req.headers['x-client-platform'] || '').toLowerCase()
  const headerDevice = String(req.headers['x-device-type'] || '').toLowerCase()
  const headerName =
    String(req.headers['x-client-name'] || req.headers['x-app-name'] || '').trim()
  const headerVersion =
    String(req.headers['x-client-version'] || req.headers['x-app-version'] || '').trim()

  const clientKind = headerClientType === 'app' || headerName
    ? 'app'
    : 'browser'

  const deviceType =
    headerDevice === 'mobile' || headerDevice === 'tablet' || headerDevice === 'desktop'
      ? headerDevice
      : classifyDeviceType(userAgent)

  const platform =
    headerPlatform ||
    detectPlatform(userAgent)

  const browser = detectBrowser(userAgent)
  const clientName = headerName || (clientKind === 'browser' ? browser.name : null)
  const clientVersion = headerVersion || (clientKind === 'browser' ? browser.version : null)

  return {
    client_kind: clientKind,
    device_type: deviceType,
    platform,
    client_name: clientName,
    client_version: clientVersion,
    user_agent: userAgent,
  }
}

/* ===================== AUTH ===================== */

fastify.register(authRoutes, {
  prefix: '/api',
  pool,
  setAuthCookie,
  clearAuthCookie,
  verifyPassword,
  signToken,
  getAuthFromRequest,
  requireAuth,
  logLeadActivity,
  getClientInfo,
  normalizeNickname,
  parseDataUrl,
  hashPassword,
})
fastify.register(authRoutes, {
  prefix: '',
  pool,
  setAuthCookie,
  clearAuthCookie,
  verifyPassword,
  signToken,
  getAuthFromRequest,
  requireAuth,
  logLeadActivity,
  getClientInfo,
  normalizeNickname,
  parseDataUrl,
  hashPassword,
})

fastify.register(aiRoutes, {
  prefix: '/api',
  pool,
  getAuthFromRequest,
  requireAuth,
  toISTDateString,
  normalizePhone,
  canonicalizePhone,
  formatName,
  getNextLeadNumber,
  getRoundRobinSalesUserId,
  getOrCreateCity,
  logLeadActivity,
})

fastify.register(facebookRoutes, {
  prefix: '/api',
  pool,
  getNextLeadNumber,
  getRoundRobinSalesUserId,
  logLeadActivity,
  createNotification,
  normalizePhone,
  canonicalizePhone,
  formatName,
})

fastify.register(fbAdsRoutes, {
  prefix: '/api',
  pool,
  requireAdmin,
  requireAuth,
})

fastify.get('/api/health', async () => ({ status: 'ok' }))

fastify.get('/api/version', async () => ({
  version: '1.0.0',
  env: process.env.NODE_ENV,
}))
fastify.get('/health', async () => ({ status: 'ok' }))
fastify.get('/version', async () => ({ version: '1.0.0' }))


const apiRoutes = async function apiRoutes(api) {
  /* ===================== ADMIN USERS ===================== */
  api.register(require('./routes/admin'), {
    pool,
    requireAdmin,
    logAdminAudit,
    isProtectedAdminUser,
    PROTECTED_ADMIN_EMAIL,
    hashPassword,
  })
  api.get('/users', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
    if (auth.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })

    const r = await pool.query(
      `SELECT
         u.id,
         u.email,
         u.name,
         u.nickname,
         u.role AS legacy_role,
         COALESCE(array_remove(array_agg(r.key), NULL), '{}') as roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id
       ORDER BY u.name NULLS LAST, u.email ASC`
    )
    return r.rows.map(row => ({
      id: row.id,
      email: row.email,
      name: row.name,
      nickname: row.nickname,
      role: row.legacy_role,
      roles: row.roles
    }))
  })

  /* ===================== FINANCE ===================== */
  api.register(require('./routes/finance'), {
    createNotification,
    requireAdmin,
    normalizeDateValue,
    assignReferenceCode,
    recalculateAccountBalances,
    formatRefDate,
    pool,

  })
  /* ===================== FINANCE — ACCOUNT TRANSFERS v1 ===================== */
  api.register(require('./routes/finance-account-transfers-v1'), {
    requireAdmin,
    logAdminAudit,
    normalizeDateValue,
    assignReferenceCode,
    recalculateAccountBalances,
    crypto,
    pool,

  })
  /* ===================== FINANCE — ACCOUNT BALANCES v1 ===================== */
  api.register(require('./routes/finance-account-balances-v1'), {
    requireAdmin,
    normalizeDateValue,
    dateToYMD,
    pool,

  })
  /* ===================== FINANCE v1 INVOICES ===================== */
  api.register(require('./routes/finance-v1-invoices'), {
    requireAdmin,
    logAdminAudit,
    normalizeDateValue,
    assignReferenceCode,
    recalculateAccountBalances,
    dateToYMD,
    pool,

  })
  /* ===================== FINANCE — PROJECT P&L v1 ===================== */
  api.register(require('./routes/finance-project-p-l-v1'), {
    requireAdmin,
    normalizeDateValue,
    dateToYMD,
    pool,

  })
  /* ===================== FINANCE — CASHFLOW v1 ===================== */
  api.register(require('./routes/finance-cashflow-v1'), {
    requireAdmin,
    normalizeDateValue,
    dateToYMD,
    pool,

  })
  /* ===================== FINANCE — PROFIT DASHBOARD v1 ===================== */
  api.register(require('./routes/finance-profit-dashboard-v1'), {
    getFyRange,
    requireAdmin,
    getAvailableFyLabels,
    normalizeDateValue,
    getCurrentFyLabel,
    fetchProfitProjectRows,
    addDaysToYMD,
    pool,

  })
  /* ===================== REPORTING v1 ===================== */
  api.register(require('./routes/reporting-v1'), {
    getFyRange,
    requireAdmin,
    getAvailableFyLabels,
    getCurrentFyLabel,
    fetchProfitProjectRows,
    addDaysToYMD,
    pool,

  })
  /* ===================== FINANCE V2: VENDORS & BILLS ===================== */
  api.register(require('./routes/finance-v2-vendors-bills'), {
    createNotification,
    requireAdmin,
    logAdminAudit,
    normalizeDateValue,
    assignReferenceCode,
    recalculateAccountBalances,
    dateToYMD,
    pool,

  })
  /* ===================== VENDOR PORTAL v2.5/2.6 (READ-ONLY) ===================== */
  api.register(require('./routes/vendor-portal-v2-5-2-6-read-only'), {
    requireVendor,
    pool,

  })
  /* ===================== PAYROLL / COMPENSATION v1 ===================== */
  api.register(require('./routes/payroll-compensation-v1'), {
    requireAdmin,
    pool,

  })
  /* ===================== FINANCE — PAYROLL INTENT v1 ===================== */
  api.register(require('./routes/finance-payroll-intent-v1'), {
    requireAdmin,
    logAdminAudit,
    normalizeDateValue,
    assignReferenceCode,
    recalculateAccountBalances,
    formatRefDate,
    dateToYMD,
    toISTDateString,
    pool,

  })
  /* ===================== CONTRIBUTION UNITS v1 ===================== */
  api.register(require('./routes/contribution-units-v1'), {
    requireAdmin,
    logAdminAudit,
    dateToYMD,
    pool,

  })
  /* ===================== LEADS ===================== */
  api.register(require('./routes/leads'), {
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

  })
  /* ===================== ENRICHMENT ===================== */
  api.register(require('./routes/enrichment'), {
    formatName,
    normalizePhone,
    getAuthFromRequest,
    logLeadActivity,
    boolToYesNo,
    yesNoToBool,
    COVERAGE_SCOPES,
    pool,

  })
  /* ===================== CONTACT DETAILS ===================== */
  api.register(require('./routes/contact-details'), {
    formatName,
    normalizePhone,
    normalizeLeadRow,
    getAuthFromRequest,
    logLeadActivity,
    normalizeInstagramUrl,
    validateEmail,
    isValidInstagramUsername,
    resolveUserDisplayName,
    pool,

  })
  /* ===================== NOTES ===================== */
  api.register(require('./routes/notes'), {
    addDaysYMD,
    getAuthFromRequest,
    runMetricsJob,
    dateToYMD,
    pool,

  })
  /* ===================== LEAD USAGE ===================== */
  api.register(require('./routes/lead-usage'), {
    getAuthFromRequest,
    pool,

  })
  /* ===================== QUOTES ===================== */
  api.register(require('./routes/quotes'), {
    getAuthFromRequest,
    logLeadActivity,
    pool,

  })
  /* ===================== LEAD CITIES ===================== */
  api.register(require('./routes/lead-cities'), {
    getOrCreateCity,
    getAuthFromRequest,
    logLeadActivity,
    pool,

  })
  /* ===================== EVENTS ===================== */
  api.register(require('./routes/events'), {
    getAuthFromRequest,
    logLeadActivity,
    hasEventsForAllCities,
    normalizeDateValue,
    pool,

  })
  /* ===================== FOLLOW UPS ===================== */
  api.register(require('./routes/follow-ups'), {
    getAuthFromRequest,
    FOLLOWUP_TYPES,
    pool,

  })
  /* ===================== NEGOTIATION ===================== */
  api.register(require('./routes/negotiation'), {
    getAuthFromRequest,
    logLeadActivity,
    pool,

  })
  /* ===================== REPORTS ===================== */
  api.register(require('./routes/reports'), {
    getDateRange,
    LEAD_STATUSES,
    pool,

  })
  /* ===================== REPORTS: HEAT DISTRIBUTION ===================== */
  api.register(require('./routes/reports-heat-distribution'), {
    getDateRange,
    pool,

  })
  /* ===================== WHATSAPP MESSAGE TEMPLATE ===================== */
  api.register(require('./routes/whatsapp-message-template'), {
    getAuthFromRequest,
    pool,

  })
  /* ===================== CITIES ===================== */
  api.register(require('./routes/cities'), {
    pool,

  })
  /* ===================== OPERATIONAL ROLES ===================== */
  api.register(require('./routes/operational-roles'), {
    requireAdmin,
    pool,

  })
  /* ===================== PRICING CATALOG ===================== */
  api.register(require('./routes/pricing-catalog'), {
    requireAdmin,
    requireAuth,
    pool,

  })
  /* ===================== PENDING APPROVALS ===================== */
  api.register(require('./routes/pending-approvals'), {
    requireAuth,
    pool,

  })
  /* ===================== PROPOSALS DASHBOARD ===================== */
  api.register(require('./routes/proposals-dashboard'), {
    requireAuth,
    fastify,
    jwt,
    cookie,
    AUTH_COOKIE,
    pool,

  })
  /* ===================== QUOTATIONS ===================== */
  api.register(require('./routes/quotations'), {
    placesRoutes,
    fastify,
    quotationRoutes,
    apiRoutes,

  })
  /* ===================== FINANCE — BALANCE SNAPSHOT ===================== */
  api.register(require('./routes/finance-balance-snapshot'), {
    recalculateAccountBalances,
    pool,

  })
}


/* ===================== PHOTO LIBRARY ===================== */
fastify.register(require('./routes/photo-library'), {
    getImageContentType, requireAdmin, requireAuth, sanitizeTags, ensureDirectory, crypto, fastify, fs, path, PHOTO_UPLOAD_DIR, pool
})
/* ===================== VIDEO LIBRARY ===================== */
fastify.register(require('./routes/video-library'), {
    requireAdmin, requireAuth, sanitizeTags, ensureDirectory, crypto, fastify, fs, multipart, path, pool
})
/* ===================== TESTIMONIALS ===================== */
fastify.register(require('./routes/testimonials'), {
    requireAdmin, requireAuth, fastify, pool
})

fastify.register(apiRoutes, { prefix: '/api' })
fastify.register(apiRoutes, { prefix: '' })

/* ===================== METRICS JOB ===================== */
const metricsJob = require('./jobs/metrics.js')({
  pool, recomputeUserMetrics, addDaysToYMD, dateToYMD, addDaysYMD, recomputeLeadMetrics, normalizeYMD
})
setInterval(metricsJob.runMetricsJob, 60 * 60 * 1000).unref()

/* ===================== START ===================== */

fastify.listen({ port: 3001, host: '127.0.0.1' }, (err, address) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  
  // Extend timeouts for large 500MB video uploads (10 minutes)
  fastify.server.keepAliveTimeout = 600000;
  fastify.server.headersTimeout = 610000;
  fastify.server.requestTimeout = 600000;

  console.log(`Backend running on ${address}`)
  metricsJob.runMetricsJob().catch(err => {
    console.warn('Metrics job failed on startup:', err?.message || err)
  })
  setInterval(() => {
    metricsJob.runMetricsJob().catch(err => {
      console.warn('Metrics job failed:', err?.message || err)
    })
  }, 24 * 60 * 60 * 1000)
  // recalculateAccountBalances().catch(err => {
  //   console.warn('Balance recompute failed on startup:', err?.message || err)
  // })
})

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})
