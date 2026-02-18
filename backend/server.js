
require('dotenv').config({
  path: '/var/www/mistyvisuals-os/backend/.env'
});

require('dotenv').config()
const fastify = require('fastify')({ logger: true })
const cors = require('@fastify/cors')
const crypto = require('crypto')

/* ===================== DB ===================== */
if (!require.extensions['.ts']) {
  require.extensions['.ts'] = require.extensions['.js']
}
const { pool } = require('./db.ts')

/* ===================== CORS ===================== */

const PROD_ORIGIN = 'https://os.mistyvisuals.com'
const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']
const ALLOWED_ORIGINS =
  process.env.NODE_ENV === 'production'
    ? [PROD_ORIGIN]
    : [PROD_ORIGIN, ...DEV_ORIGINS]

fastify.register(cors, {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
    return callback(new Error('Origin not allowed'), false)
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  credentials: true,
})

/* ===================== CONSTANTS ===================== */

const LEAD_STATUSES = [
  'New',
  'Contacted',
  'Quoted',
  'Follow Up',
  'Negotiation',
  'Awaiting Advance',
  'Converted',
  'Lost',
  'Rejected',
]
const COVERAGE_SCOPES = ['Both Sides', 'Bride Side', 'Groom Side']

const FOLLOWUP_TYPES = ['call', 'whatsapp', 'email', 'in-person', 'other', 'meeting']
const HEAT_VALUES = ['Hot', 'Warm', 'Cold']

/* ===================== HELPERS ===================== */
function boolToYesNo(value) {
  return value === true ? 'Yes' : 'No'
}

function yesNoToBool(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value
  const v = String(value).trim().toLowerCase()
  if (v === 'yes' || v === 'true') return true
  if (v === 'no' || v === 'false') return false
  return null
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (options.path) parts.push(`Path=${options.path}`)
  if (options.domain) parts.push(`Domain=${options.domain}`)
  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`)
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  return parts.join('; ')
}

if (!fastify.hasReplyDecorator('setCookie')) {
  fastify.decorateReply('setCookie', function (name, value, options) {
    const serialized = serializeCookie(name, value, options || {})
    const existing = this.getHeader('Set-Cookie')
    if (!existing) {
      this.header('Set-Cookie', serialized)
    } else if (Array.isArray(existing)) {
      this.header('Set-Cookie', [...existing, serialized])
    } else {
      this.header('Set-Cookie', [existing, serialized])
    }
    return this
  })
}

function normalizeLeadRow(row) {
  if (!row) return row
  return {
    ...row,
    potential: boolToYesNo(row.potential),
    important: boolToYesNo(row.important),
  }
}

function normalizeLeadRows(rows = []) {
  return rows.map(normalizeLeadRow)
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function dateToYMD(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function addDaysYMD(days, base = new Date()) {
  const next = startOfDay(base)
  next.setDate(next.getDate() + days)
  return dateToYMD(next)
}

async function logLeadActivity(leadId, activityType, metadata = null, userId = null, client = pool) {
  try {
    await client.query(
      `INSERT INTO lead_activities (lead_id, activity_type, metadata, user_id)
       VALUES ($1,$2,$3,$4)`,
      [leadId, activityType, metadata, userId]
    )
  } catch (err) {
    console.warn('Activity log skipped:', err?.message || err)
  }
}

async function getNextLeadNumber(client = pool) {
  const now = new Date()
  const prefix = now.getFullYear() % 100

  // lock per-year to avoid collisions
  await client.query('SELECT pg_advisory_xact_lock($1)', [prefix])

  const r = await client.query(
    `
    SELECT COALESCE(
      MAX(
        CASE
          WHEN lead_number BETWEEN $1 AND $2 THEN lead_number - $3
          WHEN lead_number BETWEEN $4 AND $5 THEN lead_number - $6
          ELSE 0
        END
      ),
      0
    ) AS max_seq
    FROM leads
    WHERE lead_number IS NOT NULL
      AND lead_number BETWEEN $1 AND $5
    `,
    [
      prefix * 1000 + 1,
      prefix * 1000 + 999,
      prefix * 1000,
      prefix * 10000 + 1000,
      prefix * 10000 + 9999,
      prefix * 10000,
    ]
  )

  const nextSeq = (Number(r.rows[0]?.max_seq) || 0) + 1
  if (nextSeq <= 999) return prefix * 1000 + nextSeq
  return prefix * 10000 + nextSeq
}

async function getOrCreateCity({ name, state, country }, client = pool) {
  const existing = await client.query(
    `SELECT id FROM cities
     WHERE name=$1 AND state=$2 AND country=$3`,
    [name, state, country]
  )

  if (existing.rows.length) return existing.rows[0].id

  const created = await client.query(
    `INSERT INTO cities (name, state, country)
     VALUES ($1,$2,$3)
     RETURNING id`,
    [name, state, country]
  )

  return created.rows[0].id
}

async function hasAnyEvent(leadId) {
  const r = await pool.query(
    `SELECT 1 FROM lead_events WHERE lead_id=$1 LIMIT 1`,
    [leadId]
  )
  return r.rows.length > 0
}

async function hasAllEventTimes(leadId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM lead_events
     WHERE lead_id=$1 AND (start_time IS NULL OR end_time IS NULL)`,
    [leadId]
  )
  return (r.rows[0]?.cnt ?? 0) === 0
}

async function hasPrimaryCity(leadId) {
  const r = await pool.query(
    `SELECT 1 FROM lead_cities WHERE lead_id=$1 AND is_primary=true LIMIT 1`,
    [leadId]
  )
  return r.rows.length > 0
}

function normalizeNickname(value) {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const capped =
    trimmed.length > 50 ? trimmed.slice(0, 50) : trimmed
  return `${capped.charAt(0).toUpperCase()}${capped.slice(1)}`
}

function getFirstName(value) {
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  return trimmed.split(/\s+/)[0] || null
}

function getUserDisplayName(user) {
  if (!user) return null
  const nickname = normalizeNickname(user.nickname)
  if (nickname) return nickname
  const firstName = getFirstName(user.first_name || user.name)
  if (firstName) return firstName
  if (user.name && String(user.name).trim()) return String(user.name).trim()
  return null
}

async function recomputeLeadMetrics(client = pool) {
  await client.query(
    `
    WITH followups AS (
      SELECT
        lead_id,
        COUNT(*) FILTER (WHERE activity_type = 'followup_done')::int AS total_followups,
        COUNT(*) FILTER (
          WHERE activity_type = 'followup_done'
            AND metadata->>'outcome' = 'Connected'
        )::int AS connected_followups
      FROM lead_activities
      WHERE lead_id IS NOT NULL
      GROUP BY lead_id
    ),
    diffs AS (
      SELECT
        lead_id,
        AVG(EXTRACT(EPOCH FROM (created_at - prev_at)) / 86400.0) AS avg_days_between_followups
      FROM (
        SELECT
          lead_id,
          created_at,
          LAG(created_at) OVER (PARTITION BY lead_id ORDER BY created_at) AS prev_at
        FROM lead_activities
        WHERE activity_type = 'followup_done'
      ) t
      WHERE prev_at IS NOT NULL
      GROUP BY lead_id
    ),
    usage AS (
      SELECT
        lead_id,
        COALESCE(SUM(duration_seconds), 0)::int AS total_time_spent_seconds
      FROM lead_usage_logs
      GROUP BY lead_id
    ),
    last_activity AS (
      SELECT lead_id, MAX(created_at) AS last_activity_at
      FROM lead_activities
      WHERE lead_id IS NOT NULL
      GROUP BY lead_id
    ),
    last_note AS (
      SELECT lead_id, MAX(created_at) AS last_note_at
      FROM lead_notes
      GROUP BY lead_id
    )
    INSERT INTO lead_metrics (
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
    )
    SELECT
      l.id,
      COALESCE(f.total_followups, 0),
      COALESCE(f.connected_followups, 0),
      COALESCE(l.not_contacted_count, 0),
      d.avg_days_between_followups,
      COALESCE(u.total_time_spent_seconds, 0),
      GREATEST(
        COALESCE(a.last_activity_at, n.last_note_at),
        COALESCE(n.last_note_at, a.last_activity_at)
      ) AS last_activity_at,
      CASE
        WHEN l.first_contacted_at IS NULL THEN NULL
        ELSE (l.first_contacted_at::date - l.created_at::date)::numeric
      END AS days_to_first_contact,
      CASE
        WHEN l.converted_at IS NULL OR l.first_contacted_at IS NULL THEN NULL
        ELSE (l.converted_at::date - l.first_contacted_at::date)::numeric
      END AS days_to_conversion,
      GREATEST(COALESCE(l.conversion_count, 0) - 1, 0) AS reopen_count
    FROM leads l
    LEFT JOIN followups f ON f.lead_id = l.id
    LEFT JOIN diffs d ON d.lead_id = l.id
    LEFT JOIN usage u ON u.lead_id = l.id
    LEFT JOIN last_activity a ON a.lead_id = l.id
    LEFT JOIN last_note n ON n.lead_id = l.id
    ON CONFLICT (lead_id) DO UPDATE SET
      total_followups = EXCLUDED.total_followups,
      connected_followups = EXCLUDED.connected_followups,
      not_connected_count = EXCLUDED.not_connected_count,
      avg_days_between_followups = EXCLUDED.avg_days_between_followups,
      total_time_spent_seconds = EXCLUDED.total_time_spent_seconds,
      last_activity_at = EXCLUDED.last_activity_at,
      days_to_first_contact = EXCLUDED.days_to_first_contact,
      days_to_conversion = EXCLUDED.days_to_conversion,
      reopen_count = EXCLUDED.reopen_count
    `
  )
}

async function recomputeUserMetrics(metricDate, client = pool) {
  await client.query(
    `
    WITH sessions AS (
      SELECT
        user_id,
        COUNT(*)::int AS total_sessions,
        COALESCE(SUM(duration_seconds), 0)::int AS total_session_duration_seconds
      FROM user_sessions
      WHERE login_at::date = $1::date
      GROUP BY user_id
    ),
    usage AS (
      SELECT
        user_id,
        COUNT(DISTINCT lead_id)::int AS leads_opened_count,
        COALESCE(SUM(duration_seconds), 0)::int AS total_time_spent_on_leads_seconds
      FROM lead_usage_logs
      WHERE entered_at::date = $1::date
      GROUP BY user_id
    ),
    activity AS (
      SELECT
        user_id,
        SUM(CASE WHEN activity_type = 'followup_done' THEN 1 ELSE 0 END)::int AS followups_done,
        SUM(CASE WHEN activity_type = 'negotiation_entry' THEN 1 ELSE 0 END)::int AS negotiations_done,
        SUM(CASE WHEN activity_type = 'quote_generated' THEN 1 ELSE 0 END)::int AS quotes_generated,
        SUM(
          CASE
            WHEN activity_type = 'status_change' AND metadata->>'to' = 'Converted' THEN 1
            ELSE 0
          END
        )::int AS conversions
      FROM lead_activities
      WHERE created_at::date = $1::date
        AND user_id IS NOT NULL
        AND (metadata->>'system' IS NULL OR metadata->>'system' <> 'true')
      GROUP BY user_id
    ),
    combined AS (
      SELECT
        COALESCE(s.user_id, u.user_id, a.user_id) AS user_id,
        $1::date AS metric_date,
        COALESCE(s.total_sessions, 0) AS total_sessions,
        COALESCE(s.total_session_duration_seconds, 0) AS total_session_duration_seconds,
        COALESCE(u.leads_opened_count, 0) AS leads_opened_count,
        COALESCE(u.total_time_spent_on_leads_seconds, 0) AS total_time_spent_on_leads_seconds,
        COALESCE(a.followups_done, 0) AS followups_done,
        COALESCE(a.negotiations_done, 0) AS negotiations_done,
        COALESCE(a.quotes_generated, 0) AS quotes_generated,
        COALESCE(a.conversions, 0) AS conversions
      FROM sessions s
      FULL OUTER JOIN usage u ON u.user_id = s.user_id
      FULL OUTER JOIN activity a ON a.user_id = COALESCE(s.user_id, u.user_id)
    )
    INSERT INTO user_metrics_daily (
      user_id,
      metric_date,
      total_sessions,
      total_session_duration_seconds,
      leads_opened_count,
      total_time_spent_on_leads_seconds,
      followups_done,
      negotiations_done,
      quotes_generated,
      conversions
    )
    SELECT
      user_id,
      metric_date,
      total_sessions,
      total_session_duration_seconds,
      leads_opened_count,
      total_time_spent_on_leads_seconds,
      followups_done,
      negotiations_done,
      quotes_generated,
      conversions
    FROM combined
    WHERE user_id IS NOT NULL
    ON CONFLICT (user_id, metric_date) DO UPDATE SET
      total_sessions = EXCLUDED.total_sessions,
      total_session_duration_seconds = EXCLUDED.total_session_duration_seconds,
      leads_opened_count = EXCLUDED.leads_opened_count,
      total_time_spent_on_leads_seconds = EXCLUDED.total_time_spent_on_leads_seconds,
      followups_done = EXCLUDED.followups_done,
      negotiations_done = EXCLUDED.negotiations_done,
      quotes_generated = EXCLUDED.quotes_generated,
      conversions = EXCLUDED.conversions
    `,
    [metricDate]
  )
}

async function resolveUserDisplayName(name) {
  if (!name) return null
  const trimmed = String(name).trim()
  if (!trimmed) return null
  const r = await pool.query(
    `SELECT name, nickname
     FROM users
     WHERE (
       (name IS NOT NULL AND lower(name) = lower($1))
       OR (nickname IS NOT NULL AND lower(nickname) = lower($1))
       OR (name IS NOT NULL AND lower(split_part(name, ' ', 1)) = lower($1))
     )
       AND (role = 'admin' OR role = 'sales')
     LIMIT 1`,
    [trimmed]
  )
  if (!r.rows.length) return null
  return getUserDisplayName(r.rows[0])
}

async function getRandomSalesUserId(client = pool) {
  const r = await client.query(
    `SELECT id
     FROM users
     WHERE role = 'sales'
     ORDER BY RANDOM()
     LIMIT 1`
  )
  return r.rows[0]?.id || null
}
function getDateRange(query) {
  const to = query.to ? new Date(query.to) : new Date()
  const from = query.from
    ? new Date(query.from)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  return { from, to }
}

async function hasEventInPrimaryCity(leadId) {
  const r = await pool.query(
    `
    SELECT 1
    FROM lead_events e
    JOIN lead_cities lc
      ON lc.city_id = e.city_id
     AND lc.lead_id = e.lead_id
     AND lc.is_primary = true
    WHERE e.lead_id = $1
    LIMIT 1
    `,
    [leadId]
  )

  return r.rows.length > 0
}

async function hasEventsForAllCities(leadId) {
  const r = await pool.query(
    `
    SELECT 1
    FROM lead_cities lc
    WHERE lc.lead_id = $1
      AND NOT EXISTS (
        SELECT 1
        FROM lead_events e
        WHERE e.lead_id = lc.lead_id
          AND e.city_id = lc.city_id
      )
    LIMIT 1
    `,
    [leadId]
  )

  return r.rows.length === 0
}

function normalizePhone(raw) {
  if (!raw) return null

  let p = raw.trim()

  // already has country code
  if (p.startsWith('+')) return p

  // numeric only → assume India
  return `+91${p}`
}

function canonicalizePhone(raw) {
  if (!raw) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  const value = hasPlus ? `+${digits}` : digits
  return normalizePhone(value)
}

function formatName(value) {
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  return trimmed
    .split(/\s+/)
    .map(part =>
      part
        ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        : ''
    )
    .join(' ')
}

const EMAIL_TYPO_MAP = {
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'yaho.com': 'yahoo.com',
  'outlook.con': 'outlook.com',
}

const ALLOWED_EMAIL_TLDS = new Set([
  'com',
  'in',
  'co',
  'org',
  'net',
  'edu',
  'gov',
])

const ALLOWED_COMPOUND_TLDS = new Set([
  'co.in',
  'org.in',
])

const COMMON_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'hotmail.com',
  'yahoo.com',
  'outlook.com',
  'icloud.com',
  'live.com',
  'msn.com',
  'protonmail.com',
  'zoho.com',
  'ymail.com',
  'rediffmail.com',
])

function normalizeEmailInput(value) {
  if (!value) return ''
  let email = String(value).trim().toLowerCase()
  if (!email) return ''
  email = email.replace(/^https?:\/\//i, '')
  email = email.replace(/^mailto:/i, '')
  email = email.replace(/\s+/g, '')

  const parts = email.split('@')
  if (parts.length === 2) {
    let [local, domain] = parts
    if (EMAIL_TYPO_MAP[domain]) {
      domain = EMAIL_TYPO_MAP[domain]
    }
    email = `${local}@${domain}`
  }
  return email
}

function validateEmail(value) {
  if (!value) return { valid: true, normalized: '' }
  const normalized = normalizeEmailInput(value)
  if (!normalized) return { valid: true, normalized: '' }

  const parts = normalized.split('@')
  if (parts.length !== 2) return { valid: false, normalized }
  const [local, domain] = parts
  if (!local || !domain) return { valid: false, normalized }

  if (!/^[a-z0-9._%+-]+$/.test(local)) return { valid: false, normalized }
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return { valid: false, normalized }

  if (!/^[a-z0-9.-]+$/.test(domain)) return { valid: false, normalized }
  if (!domain.includes('.')) return { valid: false, normalized }
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return { valid: false, normalized }

  const labels = domain.split('.')
  if (labels.some(l => !l || l.length > 63)) return { valid: false, normalized }
  if (labels.some(l => l.startsWith('-') || l.endsWith('-'))) return { valid: false, normalized }

  const lowerDomain = domain.toLowerCase()
  let sld = ''
  if (ALLOWED_COMPOUND_TLDS.has(labels.slice(-2).join('.'))) {
    sld = labels[labels.length - 3] || ''
  } else {
    const tld = labels[labels.length - 1]
    if (!ALLOWED_EMAIL_TLDS.has(tld)) return { valid: false, normalized }
    sld = labels[labels.length - 2] || ''
  }

  if (!sld) return { valid: false, normalized }
  if (sld.length >= 5 && !/[aeiouy]/i.test(sld) && !COMMON_EMAIL_DOMAINS.has(lowerDomain)) {
    return { valid: false, normalized }
  }

  return { valid: true, normalized }
}

function isValidInstagramUsername(value) {
  if (!value) return false
  const username = String(value).trim()
  if (!username) return false
  if (/^https?:/i.test(username)) return false
  if (/instagram\.com/i.test(username)) return false
  if (username.includes('/') || username.includes('@')) return false
  const normalized = username.toLowerCase()
  if (!/^[a-z0-9._]{1,30}$/.test(normalized)) return false
  return true
}

function normalizeInstagramUrl(value) {
  if (!value) return null
  const username = String(value).trim().toLowerCase()
  if (!isValidInstagramUsername(username)) return null
  return `https://instagram.com/${username}`
}

function canonicalizeEmail(value) {
  if (!value) return null
  const normalized = normalizeEmailInput(value)
  if (!normalized) return null
  return normalized
}

function canonicalizeInstagram(value) {
  if (!value) return null
  let raw = String(value).trim()
  if (!raw) return null
  raw = raw.replace(/^https?:\/\//i, '')
  raw = raw.replace(/^www\./i, '')
  if (raw.toLowerCase().includes('instagram.com')) {
    raw = raw.split('instagram.com/')[1] || ''
  }
  raw = raw.replace(/^@/, '')
  raw = raw.split(/[/?#]/)[0] || ''
  if (!isValidInstagramUsername(raw)) return null
  return `https://instagram.com/${raw.toLowerCase()}`
}

function parseCookies(header) {
  const out = {}
  if (!header) return out
  const parts = header.split(';')
  for (const part of parts) {
    const [key, ...rest] = part.trim().split('=')
    out[key] = decodeURIComponent(rest.join('=') || '')
  }
  return out
}

const AUTH_COOKIE = 'mv_auth'
const AUTH_SECRET = process.env.AUTH_SECRET
if (!AUTH_SECRET) {
  throw new Error('AUTH_SECRET is required.')
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function signToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const signature = base64url(
    crypto.createHmac('sha256', AUTH_SECRET).update(data).digest()
  )
  return `${data}.${signature}`
}

function verifyToken(token) {
  try {
    const [header, body, signature] = token.split('.')
    if (!header || !body || !signature) return null
    const data = `${header}.${body}`
    const expected = base64url(
      crypto.createHmac('sha256', AUTH_SECRET).update(data).digest()
    )
    if (expected !== signature) return null
    const payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8'))
    if (payload.exp && Date.now() / 1000 > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const iterations = 100000
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex')
  return `pbkdf2$${iterations}$${salt}$${hash}`
}

function verifyPassword(password, stored) {
  try {
    const [algo, iterStr, salt, hash] = stored.split('$')
    if (algo !== 'pbkdf2') return false
    const iterations = parseInt(iterStr, 10)
    const test = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'))
  } catch {
    return false
  }
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(dataUrl || '')
  if (!match) return null
  const mime = match[1].toLowerCase().replace('jpg', 'jpeg')
  const base64 = match[2]
  return { mime, base64 }
}

function setAuthCookie(reply, token) {
  reply.setCookie(AUTH_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    domain: process.env.NODE_ENV === 'production' ? 'os.mistyvisuals.com' : undefined,
    maxAge: 60 * 60 * 24 * 7,
  })
}

function clearAuthCookie(reply) {
  reply.setCookie(AUTH_COOKIE, '', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    domain: process.env.NODE_ENV === 'production' ? 'os.mistyvisuals.com' : undefined,
    maxAge: 0,
  })
}

function getAuthFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '')
  if (!cookies[AUTH_COOKIE]) return null
  return verifyToken(cookies[AUTH_COOKIE])
}

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

fastify.post('/auth/login', async (req, reply) => {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return reply.code(400).send({ error: 'Email and password are required' })
  }

  const r = await pool.query(
    'SELECT id, email, password_hash, role FROM users WHERE email=$1',
    [String(email).toLowerCase()]
  )
  if (!r.rows.length) {
    return reply.code(401).send({ error: 'Invalid credentials' })
  }

  const user = r.rows[0]
  if (!verifyPassword(String(password), user.password_hash)) {
    return reply.code(401).send({ error: 'Invalid credentials' })
  }

  const clientInfo = getClientInfo(req)
  const sessionRes = await pool.query(
    `INSERT INTO user_sessions (user_id, login_at, device_type, user_agent, client_kind, platform, client_name, client_version)
     VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      user.id,
      clientInfo.device_type,
      clientInfo.user_agent,
      clientInfo.client_kind,
      clientInfo.platform,
      clientInfo.client_name,
      clientInfo.client_version,
    ]
  )
  const sessionId = sessionRes.rows[0]?.id || null

  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    sid: sessionId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  })

  setAuthCookie(reply, token)
  await logLeadActivity(
    null,
    'audit_login',
    {
      log_type: 'audit',
      client_kind: clientInfo.client_kind,
      device_type: clientInfo.device_type,
      platform: clientInfo.platform,
      client_name: clientInfo.client_name,
      client_version: clientInfo.client_version,
    },
    user.id
  )
  return { success: true, role: user.role, email: user.email }
})

fastify.post('/auth/logout', async (req, reply) => {
  const auth = getAuthFromRequest(req)
  clearAuthCookie(reply)
  if (auth?.sub) {
    await logLeadActivity(null, 'audit_logout', { log_type: 'audit' }, auth.sub)
    const sessionId = auth?.sid
    if (sessionId) {
      await pool.query(
        `
        UPDATE user_sessions
        SET logout_at=NOW(),
            duration_seconds=EXTRACT(EPOCH FROM (NOW() - login_at))::int
        WHERE id=$1 AND user_id=$2 AND logout_at IS NULL
        `,
        [sessionId, auth.sub]
      )
    } else {
      await pool.query(
        `
        WITH target AS (
          SELECT id FROM user_sessions
          WHERE user_id=$1 AND logout_at IS NULL
          ORDER BY login_at DESC
          LIMIT 1
        )
        UPDATE user_sessions
        SET logout_at=NOW(),
            duration_seconds=EXTRACT(EPOCH FROM (NOW() - login_at))::int
        WHERE id IN (SELECT id FROM target)
        `,
        [auth.sub]
      )
    }
  }
  return { success: true }
})

fastify.get('/auth/me', async (req) => {
  const auth = getAuthFromRequest(req)
  if (!auth) return { authenticated: false }
  const r = await pool.query(
    'SELECT id, email, role, name, nickname, profile_photo, job_title FROM users WHERE id=$1',
    [auth.sub]
  )
  const user = r.rows[0] || {
    id: auth.sub,
    email: auth.email,
    role: auth.role,
    name: null,
    nickname: null,
    profile_photo: null,
    job_title: null,
  }
  return {
    authenticated: true,
    user: {
      email: user.email,
      role: user.role,
      id: user.id,
      name: user.name,
      nickname: user.nickname,
      job_title: user.job_title,
      has_photo: Boolean(user.profile_photo),
    },
  }
})

fastify.post('/auth/nickname', async (req, reply) => {
  const auth = getAuthFromRequest(req)
  if (!auth) return reply.code(401).send({ error: 'Not authenticated' })

  const raw = req.body?.nickname
  if (raw && String(raw).trim().length > 50) {
    return reply.code(400).send({ error: 'Nickname must be 50 characters or less' })
  }
  const normalized = normalizeNickname(raw)

  await pool.query('UPDATE users SET nickname=$1 WHERE id=$2', [normalized, auth.sub])
  await logLeadActivity(null, 'audit_profile_update', { log_type: 'audit', fields: ['nickname'] }, auth.sub)
  return { success: true, nickname: normalized }
})

fastify.get('/auth/profile-photo', async (req, reply) => {
  const auth = getAuthFromRequest(req)
  if (!auth) return reply.code(401).send({ error: 'Not authenticated' })

  const r = await pool.query('SELECT profile_photo FROM users WHERE id=$1', [auth.sub])
  const dataUrl = r.rows[0]?.profile_photo
  if (!dataUrl) return reply.code(404).send({ error: 'No photo' })

  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return reply.code(400).send({ error: 'Invalid photo data' })

  const buffer = Buffer.from(parsed.base64, 'base64')
  reply.header('Content-Type', parsed.mime)
  return buffer
})

fastify.post('/auth/profile-photo', async (req, reply) => {
  const auth = getAuthFromRequest(req)
  if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
  const { image_data } = req.body || {}
  const parsed = parseDataUrl(image_data)
  if (!parsed) {
    return reply.code(400).send({ error: 'Invalid image format' })
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(parsed.mime)) {
    return reply.code(400).send({ error: 'Only JPG, PNG, or WEBP allowed' })
  }
  const bytes = Math.floor((parsed.base64.length * 3) / 4)
  if (bytes > 2 * 1024 * 1024) {
    return reply.code(400).send({ error: 'Image must be 2MB or less' })
  }

  await pool.query('UPDATE users SET profile_photo=$1 WHERE id=$2', [image_data, auth.sub])
  await logLeadActivity(null, 'audit_profile_update', { log_type: 'audit', fields: ['profile_photo'] }, auth.sub)
  return { success: true }
})

fastify.post('/auth/change-password', async (req, reply) => {
  const auth = getAuthFromRequest(req)
  if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
  const { current_password, new_password } = req.body || {}
  if (!current_password || !new_password) {
    return reply.code(400).send({ error: 'Current and new password are required' })
  }

  const r = await pool.query(
    'SELECT password_hash FROM users WHERE id=$1',
    [auth.sub]
  )
  if (!r.rows.length) {
    return reply.code(404).send({ error: 'User not found' })
  }
  const ok = verifyPassword(String(current_password), r.rows[0].password_hash)
  if (!ok) {
    return reply.code(401).send({ error: 'Current password is incorrect' })
  }

  const nextHash = hashPassword(String(new_password))
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [nextHash, auth.sub])
  await logLeadActivity(null, 'audit_password_change', { log_type: 'audit' }, auth.sub)
  return { success: true }
})

fastify.get('/users', async (req, reply) => {
  const auth = getAuthFromRequest(req)
  if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
  if (auth.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })

  const role = req.query?.role ? String(req.query.role) : null
  const params = []
  let where = ''
  if (role) {
    params.push(role)
    where = 'WHERE role = $1'
  }

  const r = await pool.query(
    `SELECT id, email, role, name, nickname
     FROM users
     ${where}
     ORDER BY name NULLS LAST, email ASC`,
    params
  )
  return r.rows
})

/* ===================== LEADS ===================== */

fastify.get('/leads', async () =>
  normalizeLeadRows(
    (await pool.query(
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
      GROUP BY l.id, u.name, u.nickname
      ORDER BY l.created_at DESC
      `
    )).rows
  )
)

fastify.post('/leads/phone-duplicates', async (req) => {
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

fastify.post('/leads/duplicate-check', async (req) => {
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

fastify.get('/dashboard/metrics', async () => {
  const r = await pool.query(
    `
    WITH status_counts AS (
      SELECT status, COUNT(*)::int AS count
      FROM leads
      GROUP BY status
    ),
    heat_counts AS (
      SELECT heat, COUNT(*)::int AS count
      FROM leads
      WHERE status NOT IN ('Converted','Lost','Rejected')
      GROUP BY heat
    ),
    followups AS (
      SELECT
        SUM(CASE WHEN next_followup_date::date = CURRENT_DATE THEN 1 ELSE 0 END)::int AS due_today,
        SUM(CASE WHEN next_followup_date::date < CURRENT_DATE THEN 1 ELSE 0 END)::int AS overdue
      FROM leads
      WHERE next_followup_date IS NOT NULL
        AND status NOT IN ('Converted','Lost','Rejected')
    ),
    priority AS (
      SELECT
        SUM(CASE WHEN important = true THEN 1 ELSE 0 END)::int AS important,
        SUM(CASE WHEN potential = true THEN 1 ELSE 0 END)::int AS potential
      FROM leads
      WHERE status NOT IN ('Converted','Lost','Rejected')
    ),
    source_counts AS (
      SELECT COALESCE(NULLIF(source, ''), 'Unknown') AS source, COUNT(*)::int AS count
      FROM leads
      GROUP BY COALESCE(NULLIF(source, ''), 'Unknown')
    ),
    today_activity AS (
      SELECT
        SUM(CASE WHEN activity_type = 'followup_done' THEN 1 ELSE 0 END)::int AS followups_completed,
        SUM(CASE WHEN activity_type = 'status_change' AND metadata->>'to' = 'Negotiation' THEN 1 ELSE 0 END)::int AS moved_to_negotiation
      FROM lead_activities
      WHERE created_at::date = CURRENT_DATE
    )
    SELECT
      COALESCE((SELECT json_object_agg(status, count) FROM status_counts), '{}'::json) AS status_counts,
      COALESCE((SELECT json_object_agg(heat, count) FROM heat_counts), '{}'::json) AS heat_counts,
      COALESCE((SELECT json_build_object('today', due_today, 'overdue', overdue) FROM followups), '{}'::json) AS followups,
      COALESCE((SELECT json_build_object('important', important, 'potential', potential) FROM priority), '{}'::json) AS priority,
      COALESCE((SELECT json_object_agg(source, count) FROM source_counts), '{}'::json) AS source_counts,
      COALESCE((SELECT json_build_object('followups_completed', followups_completed, 'moved_to_negotiation', moved_to_negotiation) FROM today_activity), '{}'::json) AS today_activity
    `
  )
  return r.rows[0]
})

fastify.get('/insights', async (_req, reply) => {
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
      WHERE l.status = 'Converted'
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
    `
    )
    return r.rows[0]
  } catch (err) {
    fastify.log.error(err)
    return reply.code(500).send({ error: err?.message || 'Internal Server Error' })
  }
})

fastify.get('/follow-ups', async () => {
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
    WHERE status NOT IN ('Converted','Lost','Rejected')
    ORDER BY created_at DESC
    `
  )
  return r.rows
})

fastify.post('/leads', async (req, reply) => {
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
    if (auth?.role === 'sales') {
      assignedUserId = auth.sub
    } else if (auth?.role === 'admin') {
      assignedUserId = await getRandomSalesUserId(client)
      if (!assignedUserId) assignedUserId = auth.sub
    } else {
      assignedUserId = await getRandomSalesUserId(client)
    }

    if (!assignedUserId) {
      const fallback = await client.query('SELECT id FROM users ORDER BY id ASC LIMIT 1')
      assignedUserId = fallback.rows[0]?.id || null
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
    return normalizeLeadRow(r.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

fastify.get('/leads/:id', async (req, reply) => {
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

  return normalizeLeadRow(r.rows[0])
})

fastify.patch('/leads/:id/intake', async (req, reply) => {
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

  await logLeadActivity(
    id,
    'quote_generated',
    {
      log_type: 'activity',
      quote_id: r.rows[0].id,
      quote_number: r.rows[0].quote_number,
      amount_quoted: r.rows[0].amount_quoted ?? null,
      discounted_amount: r.rows[0].discounted_amount ?? null,
    },
    createdBy
  )

  return r.rows[0]
})

fastify.patch('/leads/:id/status', async (req, reply) => {
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
  const needsPrimaryEvent = ['Quoted','Follow Up','Negotiation', 'Awaiting Advance', 'Converted'].includes(status)

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
  const awaitingFollowupDate = status === 'Awaiting Advance' ? addDaysYMD(3) : null

  if (status === 'Converted' && !assignedUserId) {
    assignedUserId = await getRandomSalesUserId()
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
      awaitingFollowupDate,
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
  }
  return normalized
})

fastify.patch('/leads/:id/heat', async (req, reply) => {
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

fastify.post('/leads/:id/lost', async (req, reply) => {
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
  return normalized
})

fastify.patch('/leads/:id/followup-date', async (req, reply) => {
  const { id } = req.params
  const { next_followup_date } = req.body || {}
  const auth = getAuthFromRequest(req)

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
    `SELECT next_followup_date FROM leads WHERE id=$1`,
    [id]
  )
  if (!current.rows.length) {
    return reply.code(404).send({ error: 'Lead not found' })
  }
  const previousRaw = current.rows[0]?.next_followup_date
  const previousDate = previousRaw ? dateToYMD(new Date(previousRaw)) : null

  const r = await pool.query(
    `UPDATE leads
     SET next_followup_date=$1, updated_at=NOW()
     WHERE id=$2
     RETURNING *, phone_primary AS primary_phone`,
    [normalizedDate, id]
  )

  if (previousDate !== normalizedDate) {
    await logLeadActivity(
      id,
      'followup_date_change',
      { log_type: 'activity', from: previousDate, to: normalizedDate },
      auth?.sub || null
    )
  }

  return normalizeLeadRow(r.rows[0])
})

fastify.post('/leads/:id/followup-done', async (req, reply) => {
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
  if (['Converted','Lost','Rejected'].includes(lead.status)) {
    return reply.code(400).send({ error: 'Follow-up not allowed for this status' })
  }

  const isAwaitingAdvance = lead.status === 'Awaiting Advance'
  let normalizedDate = null
  if (isAwaitingAdvance) {
    normalizedDate = addDaysYMD(3)
  } else if (next_followup_date) {
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
      const followupAt = normalizedDate || lead.next_followup_date
      const modeForType =
        typeof follow_up_mode === 'string' && follow_up_mode
          ? follow_up_mode.toLowerCase()
          : 'other'
      await pool.query(
        `INSERT INTO lead_followups (lead_id, follow_up_at, type, note, outcome, follow_up_mode, discussed_topics, not_connected_reason, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          followupAt,
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

/* ===================== ENRICHMENT ===================== */

fastify.get('/leads/:id/enrichment', async (req, reply) => {
  const lead = await pool.query(
    `SELECT event_type, is_destination, country, client_budget_amount, amount_quoted, client_offer_amount, discounted_amount, coverage_scope, potential, important, assigned_user_id
     FROM leads WHERE id=$1`,
    [req.params.id]
  )

  if (!lead.rows.length)
    return reply.code(404).send({ error: 'Lead not found' })

  const cities = await pool.query(
    `SELECT c.id, c.name, c.state, c.country, lc.is_primary
     FROM lead_cities lc
     JOIN cities c ON c.id = lc.city_id
     WHERE lc.lead_id=$1
     ORDER BY lc.is_primary DESC`,
    [req.params.id]
  )

  const events = await pool.query(
    `
    SELECT 
      e.*,
      c.name AS city_name,
      c.state AS city_state,
      c.country AS city_country
    FROM lead_events e
    LEFT JOIN cities c ON c.id = e.city_id
    WHERE e.lead_id = $1
    ORDER BY
      e.event_date ASC,
      CASE e.slot
        WHEN 'Morning' THEN 1
        WHEN 'Day' THEN 2
        WHEN 'Evening' THEN 3
        ELSE 4
      END ASC,
      e.created_at ASC
    `,
    [req.params.id]
  )

  const primaryCity = cities.rows.find(c => c.is_primary) || null
  const pricingLogs = await pool.query(
    `SELECT id, lead_id, field_type, amount, created_at
     FROM lead_pricing_logs
     WHERE lead_id=$1
     ORDER BY created_at DESC`,
    [req.params.id]
  )

  const leadRow = lead.rows[0]
  return {
    ...leadRow,
    potential: boolToYesNo(leadRow.potential),
    important: boolToYesNo(leadRow.important),
    city: primaryCity?.name || null,
    state: primaryCity?.state || null,
    country: primaryCity?.country || lead.rows[0].country,
    cities: cities.rows,
    events: events.rows,
    pricing_logs: pricingLogs.rows,
  }
})

fastify.patch('/leads/:id/enrichment', async (req, reply) => {
  const { id } = req.params
  const payload = req.body
  const auth = getAuthFromRequest(req)

  const primaryCityRes = await pool.query(
    `SELECT c.country
     FROM lead_cities lc
     JOIN cities c ON c.id = lc.city_id
     WHERE lc.lead_id=$1 AND lc.is_primary=true
     LIMIT 1`,
    [id]
  )

  const primaryCountry = primaryCityRes.rows[0]?.country || 'India'
  // Fetch existing core lead data (fallback safety)
  const existingLead = await pool.query(
    `SELECT
       name,
       phone_primary,
       phone_secondary,
       email,
       event_type,
       is_destination,
       client_budget_amount,
       amount_quoted,
       client_offer_amount,
       discounted_amount,
       coverage_scope,
       potential,
       important,
       assigned_user_id
     FROM leads
     WHERE id=$1`,
    [id]
  )
  const existing = existingLead.rows[0] || {}
  const existingAssignedUserId = existing.assigned_user_id ?? null
  // Resolve primary phone safely
  const resolvedPrimaryPhone = normalizePhone(
    payload.primary_phone ||
    existing.phone_primary ||
    null
  )

  const hasEventType = Object.prototype.hasOwnProperty.call(payload, 'event_type')
  const hasIsDestination = Object.prototype.hasOwnProperty.call(payload, 'is_destination')
  const hasClientBudget = Object.prototype.hasOwnProperty.call(payload, 'client_budget_amount')
  const hasAmountQuoted = Object.prototype.hasOwnProperty.call(payload, 'amount_quoted')
  const hasPotential = Object.prototype.hasOwnProperty.call(payload, 'potential')
  const hasImportant = Object.prototype.hasOwnProperty.call(payload, 'important')
  const hasPhoneSecondary = Object.prototype.hasOwnProperty.call(payload, 'phone_secondary')
  const hasEmail = Object.prototype.hasOwnProperty.call(payload, 'email')
  const hasClientOffer = Object.prototype.hasOwnProperty.call(payload, 'client_offer_amount')
  const hasDiscounted = Object.prototype.hasOwnProperty.call(payload, 'discounted_amount')
  const hasCoverageScope = Object.prototype.hasOwnProperty.call(payload, 'coverage_scope')
  const hasAssignedUser = Object.prototype.hasOwnProperty.call(payload, 'assigned_user_id')

  if (hasAssignedUser) {
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
    if (auth.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
  }

  const toNumberOrNull = (val) => {
    if (val === undefined || val === null || val === '') return null
    const num = Number(val)
    return Number.isNaN(num) ? null : num
  }

  if (hasClientOffer && payload.client_offer_amount !== '' && payload.client_offer_amount !== null && payload.client_offer_amount !== undefined) {
    if (Number.isNaN(Number(payload.client_offer_amount))) {
      return reply.code(400).send({ error: 'Client offer amount must be a number' })
    }
  }
  if (hasDiscounted && payload.discounted_amount !== '' && payload.discounted_amount !== null && payload.discounted_amount !== undefined) {
    if (Number.isNaN(Number(payload.discounted_amount))) {
      return reply.code(400).send({ error: 'Discounted amount must be a number' })
    }
  }
  if (hasCoverageScope && payload.coverage_scope && !COVERAGE_SCOPES.includes(payload.coverage_scope)) {
    return reply.code(400).send({ error: 'Invalid coverage scope' })
  }

  const nextEventType = hasEventType ? payload.event_type : existing.event_type
  const baseIsDestination = hasIsDestination ? !!payload.is_destination : !!existing.is_destination
  const isDestination = primaryCountry !== 'India' ? true : baseIsDestination
  const nextClientBudget = hasClientBudget
    ? (payload.client_budget_amount === '' ? null : payload.client_budget_amount)
    : existing.client_budget_amount
  const nextAmountQuoted = hasAmountQuoted
    ? (payload.amount_quoted === '' ? null : payload.amount_quoted)
    : existing.amount_quoted
  const parsedPotential = hasPotential ? yesNoToBool(payload.potential) : null
  const parsedImportant = hasImportant ? yesNoToBool(payload.important) : null
  const nextPotential =
    hasPotential && parsedPotential !== null
      ? parsedPotential
      : !!existing.potential
  const nextImportant =
    hasImportant && parsedImportant !== null
      ? parsedImportant
      : !!existing.important
  const nextClientOffer = hasClientOffer
    ? toNumberOrNull(payload.client_offer_amount)
    : toNumberOrNull(existing.client_offer_amount)
  const nextDiscounted = hasDiscounted
    ? toNumberOrNull(payload.discounted_amount)
    : toNumberOrNull(existing.discounted_amount)
  const nextCoverageScope = hasCoverageScope
    ? (payload.coverage_scope || 'Both Sides')
    : (existing.coverage_scope || 'Both Sides')
  const nextPhoneSecondary = hasPhoneSecondary
    ? (payload.phone_secondary || null)
    : (existing.phone_secondary || null)
  const nextEmail = hasEmail
    ? (payload.email || null)
    : (existing.email || null)
  let nextAssignedUserId = hasAssignedUser ? payload.assigned_user_id : existing.assigned_user_id
  if (hasAssignedUser) {
    if (nextAssignedUserId === '' || nextAssignedUserId === null || nextAssignedUserId === undefined) {
      nextAssignedUserId = null
    } else {
      const parsed = Number(nextAssignedUserId)
      if (!Number.isInteger(parsed)) {
        return reply.code(400).send({ error: 'Invalid assigned user' })
      }
      const userCheck = await pool.query(
        `SELECT id FROM users WHERE id=$1 AND role IN ('admin','sales')`,
        [parsed]
      )
      if (!userCheck.rows.length) {
        return reply.code(400).send({ error: 'Assigned user not found' })
      }
      nextAssignedUserId = parsed
    }
  }

  const numEqual = (a, b) => {
    if (a === null && b === null) return true
    if (a === null || b === null) return false
    return Number(a) === Number(b)
  }

  const existingAmountQuoted = toNumberOrNull(existing.amount_quoted)
  const nextAmountQuotedNum = hasAmountQuoted
    ? toNumberOrNull(payload.amount_quoted)
    : existingAmountQuoted
  const amountQuotedChanged = hasAmountQuoted && !numEqual(existingAmountQuoted, nextAmountQuotedNum)

  const existingClientBudget = toNumberOrNull(existing.client_budget_amount)
  const nextClientBudgetNum = hasClientBudget
    ? toNumberOrNull(payload.client_budget_amount)
    : existingClientBudget
  const clientBudgetChanged = hasClientBudget && !numEqual(existingClientBudget, nextClientBudgetNum)

  const existingClientOffer = toNumberOrNull(existing.client_offer_amount)
  const existingDiscounted = toNumberOrNull(existing.discounted_amount)
  const clientOfferChanged = hasClientOffer && !numEqual(existingClientOffer, nextClientOffer)
  const discountedChanged = hasDiscounted && !numEqual(existingDiscounted, nextDiscounted)
  const assignedUserChanged =
    hasAssignedUser && (existingAssignedUserId ?? null) !== (nextAssignedUserId ?? null)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE leads SET
      name=$1,
      phone_primary=$2,
      phone_secondary=$3,
      email=$4,

      event_type=$5,
      is_destination=$6,
      country=$7,
      client_budget_amount=$8,
      amount_quoted=$9,
      client_offer_amount=$10,
      discounted_amount=$11,
      coverage_scope=$12,
      potential=$13,
      important=$14,
      assigned_user_id=$15,
      updated_at=NOW()
    WHERE id=$16`,
    [
      formatName(payload.name) || existing.name || null,
      resolvedPrimaryPhone,
      nextPhoneSecondary,
      nextEmail,

      nextEventType,
      isDestination,
      primaryCountry,
      nextClientBudget,
      nextAmountQuoted,
      nextClientOffer,
      nextDiscounted,
      nextCoverageScope,
      nextPotential,
      nextImportant,
      nextAssignedUserId,
      id,
    ]
  )

    if (amountQuotedChanged) {
      await logLeadActivity(
        id,
        'lead_field_change',
        { log_type: 'activity', field: 'amount_quoted', from: existingAmountQuoted, to: nextAmountQuotedNum },
        auth?.sub || null,
        client
      )
    }

    if (clientBudgetChanged) {
      await logLeadActivity(
        id,
        'lead_field_change',
        { log_type: 'activity', field: 'client_budget_amount', from: existingClientBudget, to: nextClientBudgetNum },
        auth?.sub || null,
        client
      )
    }

    if (assignedUserChanged) {
      await logLeadActivity(
        id,
        'assigned_user_change',
        { log_type: 'audit', from: existingAssignedUserId, to: nextAssignedUserId },
        auth?.sub || null,
        client
      )
    }

    if (clientOfferChanged && nextClientOffer !== null) {
      await client.query(
        `INSERT INTO lead_pricing_logs (lead_id, field_type, amount, user_id)
         VALUES ($1,'client_offer',$2,$3)`,
        [id, nextClientOffer, auth?.sub || null]
      )
      await logLeadActivity(
        id,
        'pricing_change',
        { field: 'client_offer_amount', from: existingClientOffer, to: nextClientOffer },
        auth?.sub || null,
        client
      )
    }

    if (discountedChanged && nextDiscounted !== null) {
      await client.query(
        `INSERT INTO lead_pricing_logs (lead_id, field_type, amount, user_id)
         VALUES ($1,'discounted',$2,$3)`,
        [id, nextDiscounted, auth?.sub || null]
      )
      await logLeadActivity(
        id,
        'pricing_change',
        { field: 'discounted_amount', from: existingDiscounted, to: nextDiscounted },
        auth?.sub || null,
        client
      )
    }

    await client.query(
      `INSERT INTO lead_enrichment_logs (lead_id, payload, user_id)
       VALUES ($1,$2,$3)`,
      [
        id,
        {
          ...payload,
          enforced_is_destination: isDestination,
          primary_country: primaryCountry,
        },
        auth?.sub || null,
      ]
    )

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return { success: true }
})

/* ===================== CONTACT DETAILS ===================== */
fastify.patch('/leads/:id/contact', async (req, reply) => {
  const { id } = req.params
  const c = req.body

  if (!c.primary_phone) {
    return reply.code(400).send({ error: 'Primary phone required' })
  }

  const emailFields = ['email', 'bride_email', 'groom_email']
  const normalizedEmails = {}
  for (const field of emailFields) {
    const value = c?.[field]
    const { valid, normalized } = validateEmail(value)
    if (!valid) {
      return reply.code(400).send({
        error: 'Please enter a valid email address',
        field,
      })
    }
    if (value) {
      normalizedEmails[field] = normalized
    }
  }

  const instagramFields = ['instagram', 'bride_instagram', 'groom_instagram']
  for (const field of instagramFields) {
    const value = c?.[field]
    if (value && !isValidInstagramUsername(value)) {
      return reply.code(400).send({
        error: 'Enter a valid Instagram username',
        field,
      })
    }
  }

  const storeSourceName = ['WhatsApp', 'Direct Call', 'Reference'].includes(c.source)
  const needsSourceName = storeSourceName
  let resolvedSourceName = storeSourceName && c.source_name ? String(c.source_name).trim() : null
  if (needsSourceName) {
    if (!c.source_name || !String(c.source_name).trim()) {
      return reply.code(400).send({ error: 'Name is required for this source' })
    }
    if (['WhatsApp', 'Direct Call'].includes(c.source)) {
      const displayName = await resolveUserDisplayName(String(c.source_name))
      if (!displayName) {
        return reply.code(400).send({ error: 'Source name must match an existing user' })
      }
      resolvedSourceName = displayName
    } else {
      resolvedSourceName = String(c.source_name).trim()
    }
  }

  const r = await pool.query(
    `
    UPDATE leads SET
      name = $1,
      phone_primary = $2,
      phone_secondary = $3,
      email = $4,
      instagram = $5,
      source = $6,
      source_name = $7,

      bride_name = $8,
      bride_phone_primary = $9,
      bride_phone_secondary = $10,
      bride_email = $11,
      bride_instagram = $12,

      groom_name = $13,
      groom_phone_primary = $14,
      groom_phone_secondary = $15,
      groom_email = $16,
      groom_instagram = $17,

      updated_at = NOW()
    WHERE id = $18
    RETURNING *, phone_primary AS primary_phone
    `,
    [
      formatName(c.name),
      normalizePhone(c.primary_phone),
      normalizePhone(c.phone_secondary),
      normalizedEmails.email || null,
      normalizeInstagramUrl(c.instagram),
      c.source,
      resolvedSourceName,

      formatName(c.bride_name),
      normalizePhone(c.bride_phone_primary),
      normalizePhone(c.bride_phone_secondary),
      normalizedEmails.bride_email || null,
      normalizeInstagramUrl(c.bride_instagram),

      formatName(c.groom_name),
      normalizePhone(c.groom_phone_primary),
      normalizePhone(c.groom_phone_secondary),
      normalizedEmails.groom_email || null,
      normalizeInstagramUrl(c.groom_instagram),

      id,
    ]
  )

  if (!r.rows.length) {
    return reply.code(404).send({ error: 'Lead not found' })
  }

  return normalizeLeadRow(r.rows[0])
})

/* ===================== NOTES ===================== */
fastify.get('/leads/:id/notes', async (req, reply) => {
  const r = await pool.query(
    `SELECT id, lead_id, note_text, status_at_time, created_at
     FROM lead_notes
     WHERE lead_id=$1
     ORDER BY created_at ASC`,
    [req.params.id]
  )

  return r.rows
})

fastify.post('/leads/:id/notes', async (req, reply) => {
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

fastify.patch('/leads/:id/notes/:noteId', async (req, reply) => {
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

fastify.get('/leads/:id/activities', async (req) => {
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
  } catch {
    return []
  }
})

fastify.get('/leads/:id/metrics', async (req, reply) => {
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

fastify.get('/admin/activity-summary', async (req, reply) => {
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
      WHERE a.created_at::date BETWEEN $1::date AND $2::date
      ${activityUserClause}
      UNION ALL
      SELECT id
      FROM lead_notes n
      WHERE n.created_at::date BETWEEN $1::date AND $2::date
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
      WHERE a.created_at::date BETWEEN $1::date AND $2::date
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
      WHERE n.created_at::date BETWEEN $1::date AND $2::date
      ${notesUserClause}
    ) t
    ORDER BY created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    rowsParams
  )

  return {
    range: { start: startDate, end: endDate },
    page,
    page_size: pageSize,
    total: countRes.rows[0]?.count || 0,
    rows: rowsRes.rows,
  }
})

fastify.get('/admin/sales-performance', async (req, reply) => {
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
    if ((staleByAge || staleByToday) && !metricsRunning) {
      // Run in background to avoid blocking UI
      runMetricsJob(true)
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
      WHERE created_at::date BETWEEN $1::date AND $2::date
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

  const baseRes = await pool.query(
    `
    WITH users_scope AS (
      SELECT id, name, nickname, email, role
      FROM users
    ),
    ${metricsCte},
    ${activityCte},
    ${followupsCte}
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
      COALESCE(a.negotiation_entries, 0)::int AS negotiation_entries
    FROM users_scope u
    LEFT JOIN metrics m ON m.user_id = u.id
    LEFT JOIN activity a ON a.user_id = u.id
    LEFT JOIN followups f ON f.user_id = u.id
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

/* ===================== LEAD USAGE ===================== */

fastify.post('/leads/:id/usage/start', async (req, reply) => {
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

fastify.post('/leads/:id/usage/end', async (req, reply) => {
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

/* ===================== QUOTES ===================== */
fastify.get('/leads/:id/quotes', async (req, reply) => {
  const r = await pool.query(
    `SELECT
       q.id,
       q.lead_id,
       q.quote_number,
       q.generated_text,
       q.amount_quoted,
       q.discounted_amount,
       q.created_at,
       q.created_by,
       u.name AS created_by_name,
       u.nickname AS created_by_nickname,
       u.email AS created_by_email
     FROM lead_quotes q
     LEFT JOIN users u ON u.id = q.created_by
     WHERE q.lead_id = $1
     ORDER BY q.created_at DESC`,
    [req.params.id]
  )
  return r.rows
})

fastify.post('/leads/:id/quotes', async (req, reply) => {
  const { id } = req.params
  const { generated_text, amount_quoted, discounted_amount } = req.body || {}
  if (!generated_text || !String(generated_text).trim()) {
    return reply.code(400).send({ error: 'Generated text is required' })
  }
  const auth = getAuthFromRequest(req)
  const createdBy = auth?.sub || null

  const lastRes = await pool.query(
    `SELECT id, lead_id, quote_number, generated_text, amount_quoted, discounted_amount, created_at, created_by
     FROM lead_quotes
     WHERE lead_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [id]
  )
  if (lastRes.rows.length) {
    const last = lastRes.rows[0]
    const sameText = String(last.generated_text || '').trim() === String(generated_text || '').trim()
    const sameQuoted = String(last.amount_quoted ?? '') === String(amount_quoted ?? '')
    const sameDiscounted = String(last.discounted_amount ?? '') === String(discounted_amount ?? '')
    if (sameText && sameQuoted && sameDiscounted) {
      await logLeadActivity(
        id,
        'quote_generated',
        {
          log_type: 'activity',
          quote_id: last.id,
          quote_number: last.quote_number,
          amount_quoted: last.amount_quoted ?? null,
          discounted_amount: last.discounted_amount ?? null,
          reused: true,
        },
        createdBy
      )
      return { ...last, reused: true }
    }
  }

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS count FROM lead_quotes WHERE lead_id = $1`,
    [id]
  )
  const nextIncrement = (countRes.rows[0]?.count || 0) + 1
  const quoteNumber = `MV-${id}-${nextIncrement}`

  const r = await pool.query(
    `INSERT INTO lead_quotes (
        lead_id,
        quote_number,
        generated_text,
        amount_quoted,
        discounted_amount,
        created_by
      )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, lead_id, quote_number, generated_text, amount_quoted, discounted_amount, created_at, created_by`,
    [
      id,
      quoteNumber,
      String(generated_text).trim(),
      amount_quoted ?? null,
      discounted_amount ?? null,
      createdBy,
    ]
  )

  if (!r.rows.length) {
    return reply.code(404).send({ error: 'Lead not found' })
  }

  return r.rows[0]
})

fastify.post('/leads/:id/quotes/share', async (req, reply) => {
  const auth = getAuthFromRequest(req)
  if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
  const { id } = req.params
  const { channel, quote_id, quote_number } = req.body || {}
  const safeChannel = channel || 'whatsapp'

  await logLeadActivity(
    id,
    'quote_shared_whatsapp',
    {
      log_type: 'activity',
      channel: safeChannel,
      quote_id: quote_id ?? null,
      quote_number: quote_number ?? null,
    },
    auth.sub || null
  )

  return { success: true }
})

fastify.patch('/leads/:id/proposal-draft', async (req, reply) => {
  const { id } = req.params
  const { proposal_draft } = req.body || {}
  if (proposal_draft !== null && typeof proposal_draft !== 'object') {
    return reply.code(400).send({ error: 'Invalid proposal draft' })
  }
  const r = await pool.query(
    `UPDATE leads
     SET proposal_draft = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING proposal_draft`,
    [proposal_draft ?? null, id]
  )
  if (!r.rows.length) {
    return reply.code(404).send({ error: 'Lead not found' })
  }
  return r.rows[0]
})

/* ===================== LEAD CITIES ===================== */

fastify.put('/leads/:id/cities', async (req, reply) => {
  const { id } = req.params
  const { cities } = req.body

  if (!Array.isArray(cities) || cities.length === 0)
    return reply.code(400).send({ error: 'Cities are required' })

  const primaryCount = cities.filter(c => c.is_primary).length
  if (primaryCount !== 1)
    return reply.code(400).send({ error: 'Exactly one primary city required' })

  const leadStatusRes = await pool.query(`SELECT status FROM leads WHERE id=$1`, [id])
  if (!leadStatusRes.rows.length) {
    return reply.code(404).send({ error: 'Lead not found' })
  }
  const leadStatus = leadStatusRes.rows[0].status
  const mustEnforce = ['Quoted','Follow Up','Negotiation','Converted'].includes(leadStatus)

  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM lead_cities WHERE lead_id=$1', [id])

    let primaryCountry = 'India'

    for (const city of cities) {
      const cityId = await getOrCreateCity({
        name: city.name.trim(),
        state: city.state.trim(),
        country: city.country || 'India',
      }, client)

      if (city.is_primary) primaryCountry = city.country || 'India'

      await client.query(
        `INSERT INTO lead_cities (lead_id, city_id, is_primary)
         VALUES ($1,$2,$3)`,
        [id, cityId, city.is_primary]
      )
    }

    const isDestination = primaryCountry !== 'India'

    await client.query(
      `UPDATE leads
       SET is_destination=$1,
           country=$2,
           updated_at=NOW()
       WHERE id=$3`,
      [isDestination, primaryCountry, id]
    )

    if (mustEnforce) {
      const eventCountRes = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM lead_events WHERE lead_id=$1`,
        [id]
      )
      if (eventCountRes.rows[0].cnt === 0) {
        await client.query('ROLLBACK')
        return reply.code(400).send({
          error: 'No events are added yet for this status',
        })
      }

      const primaryEventRes = await client.query(
        `
        SELECT 1
        FROM lead_events e
        JOIN lead_cities lc
          ON lc.city_id = e.city_id
         AND lc.lead_id = e.lead_id
         AND lc.is_primary = true
        WHERE e.lead_id = $1
        LIMIT 1
        `,
        [id]
      )
      if (!primaryEventRes.rows.length) {
        await client.query('ROLLBACK')
        return reply.code(400).send({
          error: 'No events are linked to the primary city for this status',
        })
      }
    }

    await client.query('COMMIT')
    return { success: true }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

/* ===================== EVENTS ===================== */

fastify.post('/leads/:id/events', async (req, reply) => {
  const { id } = req.params
  const auth = getAuthFromRequest(req)
  const {
    event_date,
    slot,
    start_time,
    end_time,
    event_type,
    pax,
    venue,
    description,
    city_id,
  } = req.body

  if (event_type && String(event_type).trim().length > 50) {
    return reply.code(400).send({ error: 'Event name must be 50 characters or fewer' })
  }
  if (venue && String(venue).trim().length > 150) {
    return reply.code(400).send({ error: 'Venue must be 150 characters or fewer' })
  }

  // 🔹 Get primary city (fallback)
  const primaryCityRes = await pool.query(
    `SELECT city_id
     FROM lead_cities
     WHERE lead_id=$1 AND is_primary=true`,
    [id]
  )

  const finalCityId =
    city_id || primaryCityRes.rows[0]?.city_id || null

  // 🔹 Next position
  const pos = await pool.query(
    `SELECT COALESCE(MAX(position),0)+1 AS p
     FROM lead_events
     WHERE lead_id=$1`,
    [id]
  )

  // 🔹 Insert event
  const r = await pool.query(
    `INSERT INTO lead_events
      (lead_id, event_date, slot, start_time, end_time, event_type, pax, venue, description, city_id, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      id,
      event_date,
      slot,
      start_time || null,
      end_time || null,
      event_type,
      pax,
      venue || null,
      description || null,
      finalCityId,
      pos.rows[0].p,
    ]
  )

  await logLeadActivity(
    id,
    'event_create',
    {
      log_type: 'activity',
      event_id: r.rows[0]?.id || null,
      event_date: r.rows[0]?.event_date || event_date || null,
      slot: r.rows[0]?.slot || slot || null,
      event_name: r.rows[0]?.event_type || event_type || null,
      city_id: r.rows[0]?.city_id || finalCityId || null,
    },
    auth?.sub || null
  )

  // 🔹 Soft validation (AFTER insert)
  const hasAllCityEvents = await hasEventsForAllCities(id)

  return {
    success: true,
    event: r.rows[0],
    warnings: hasAllCityEvents
      ? []
      : [
          'Each city should have at least one linked event before moving the lead forward.',
        ],
  }
})


fastify.patch('/leads/:id/events/:eventId', async (req, reply) => {
  const { id, eventId } = req.params
  const auth = getAuthFromRequest(req)
  let { event_date, slot, start_time, end_time, event_type, pax, venue, description, city_id } =
    req.body

  if (event_type && String(event_type).trim().length > 50) {
    return reply.code(400).send({ error: 'Event name must be 50 characters or fewer' })
  }
  if (venue && String(venue).trim().length > 150) {
    return reply.code(400).send({ error: 'Venue must be 150 characters or fewer' })
  }

  if (event_date) event_date = event_date.slice(0, 10)

  const current = await pool.query(
    `SELECT * FROM lead_events WHERE id=$1 AND lead_id=$2`,
    [eventId, id]
  )

  if (!current.rows.length)
    return reply.code(404).send({ error: 'Event not found' })

  const e = current.rows[0]
  const normalizeDateValue = (value) => (value ? String(value).slice(0, 10) : null)
  const nextValues = {
    event_date: event_date ?? e.event_date,
    slot: slot ?? e.slot,
    start_time: start_time ?? e.start_time,
    end_time: end_time ?? e.end_time,
    event_type: event_type ?? e.event_type,
    pax: pax ?? e.pax,
    venue: venue ?? e.venue,
    description: description ?? e.description,
    city_id: city_id ?? e.city_id,
  }
  const changes = {}
  const addChange = (field, from, to) => {
    if ((from ?? null) !== (to ?? null)) {
      changes[field] = { from: from ?? null, to: to ?? null }
    }
  }
  addChange('event_date', normalizeDateValue(e.event_date), normalizeDateValue(nextValues.event_date))
  addChange('slot', e.slot, nextValues.slot)
  addChange('start_time', e.start_time, nextValues.start_time)
  addChange('end_time', e.end_time, nextValues.end_time)
  addChange('event_name', e.event_type, nextValues.event_type)
  addChange('pax', e.pax, nextValues.pax)
  addChange('venue', e.venue, nextValues.venue)
  addChange('description', e.description, nextValues.description)
  addChange('city_id', e.city_id, nextValues.city_id)
  const statusRes = await pool.query(`SELECT status FROM leads WHERE id=$1`, [id])
  if (!statusRes.rows.length) return reply.code(404).send({ error: 'Lead not found' })
  const leadStatus = statusRes.rows[0].status
  const mustEnforce = ['Quoted','Follow Up','Negotiation','Converted'].includes(leadStatus)
  const nextCityId = city_id ?? e.city_id

  if (mustEnforce) {
    if (!nextCityId) {
      return reply.code(400).send({ error: 'Event city is required for this status' })
    }
    const missingRes = await pool.query(
      `
      SELECT lc.city_id,
        SUM(
          CASE
            WHEN e.id = $2 THEN CASE WHEN $3::int = lc.city_id THEN 1 ELSE 0 END
            ELSE CASE WHEN e.city_id = lc.city_id THEN 1 ELSE 0 END
          END
        )::int AS cnt
      FROM lead_cities lc
      LEFT JOIN lead_events e
        ON e.lead_id = lc.lead_id
      WHERE lc.lead_id = $1
      GROUP BY lc.city_id
      HAVING SUM(
        CASE
          WHEN e.id = $2 THEN CASE WHEN $3::int = lc.city_id THEN 1 ELSE 0 END
          ELSE CASE WHEN e.city_id = lc.city_id THEN 1 ELSE 0 END
        END
      )::int = 0
      LIMIT 1
      `,
      [id, eventId, nextCityId]
    )
    if (missingRes.rows.length) {
      return reply.code(400).send({
        error: 'Each city must be linked to at least one event for this status',
      })
    }
  }

  const r = await pool.query(
    `UPDATE lead_events SET
      event_date=$1,
      slot=$2,
      start_time=$3,
      end_time=$4,
      event_type=$5,
      pax=$6,
      venue=$7,
      description=$8,
      city_id=$9,
      updated_at=NOW()
     WHERE id=$10 AND lead_id=$11
     RETURNING *`,
    [
      nextValues.event_date,
      nextValues.slot,
      nextValues.start_time,
      nextValues.end_time,
      nextValues.event_type,
      nextValues.pax,
      nextValues.venue,
      nextValues.description,
      nextValues.city_id,
      eventId,
      id,
    ]
  )

  if (Object.keys(changes).length) {
    await logLeadActivity(
      id,
      'event_update',
      { log_type: 'activity', event_id: eventId, changes },
      auth?.sub || null
    )
  }

  return r.rows[0]
})

fastify.delete('/leads/:id/events/:eventId', async (req, reply) => {
  const { id, eventId } = req.params
  const auth = getAuthFromRequest(req)
  const eventRes = await pool.query(
    `SELECT id, event_date, slot, event_type, city_id
     FROM lead_events
     WHERE id=$1 AND lead_id=$2`,
    [eventId, id]
  )
  const eventInfo = eventRes.rows[0] || null
  const statusRes = await pool.query(`SELECT status FROM leads WHERE id=$1`, [id])
  if (!statusRes.rows.length) return reply.code(404).send({ error: 'Lead not found' })
  const leadStatus = statusRes.rows[0].status
  const mustEnforce = ['Quoted','Follow Up','Negotiation','Converted'].includes(leadStatus)

  if (mustEnforce) {
    const remainingRes = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM lead_events WHERE lead_id=$1 AND id<>$2`,
      [id, eventId]
    )
    if (remainingRes.rows[0].cnt === 0) {
      return reply.code(400).send({ error: 'No events are added yet for this status' })
    }

    const missingRes = await pool.query(
      `
      SELECT lc.city_id
      FROM lead_cities lc
      LEFT JOIN lead_events e
        ON e.lead_id = lc.lead_id
       AND e.city_id = lc.city_id
       AND e.id <> $2
      WHERE lc.lead_id = $1
      GROUP BY lc.city_id
      HAVING COUNT(e.id) = 0
      LIMIT 1
      `,
      [id, eventId]
    )
    if (missingRes.rows.length) {
      return reply.code(400).send({
        error: 'Each city must be linked to at least one event for this status',
      })
    }
  }

  await pool.query(
    'DELETE FROM lead_events WHERE id=$1 AND lead_id=$2',
    [eventId, id]
  )
  if (eventInfo) {
    await logLeadActivity(
      id,
      'event_delete',
      {
        log_type: 'activity',
        event_id: eventInfo.id,
        event_date: eventInfo.event_date ? String(eventInfo.event_date).slice(0, 10) : null,
        slot: eventInfo.slot || null,
        event_name: eventInfo.event_type || null,
        city_id: eventInfo.city_id || null,
      },
      auth?.sub || null
    )
  }
  return { success: true }
})

/* ===================== FOLLOW UPS ===================== */

fastify.get('/leads/:id/followups', async (req) =>
  (await pool.query(
    `SELECT * FROM lead_followups
     WHERE lead_id=$1
     ORDER BY follow_up_at ASC`,
    [req.params.id]
  )).rows
)

fastify.post('/leads/:id/followups', async (req, reply) => {
  const { followUpAt, type, note } = req.body
  const auth = getAuthFromRequest(req)
  if (!followUpAt || !FOLLOWUP_TYPES.includes(type))
    return reply.code(400).send({ error: 'Invalid follow-up' })

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
     WHERE id=$1 AND status NOT IN ('Lost','Converted')`,
    [req.params.id]
  )

  return r.rows[0]
})

/* ===================== NEGOTIATION ===================== */

fastify.get('/leads/:id/negotiations', async (req) =>
  (await pool.query(
    `SELECT * FROM lead_negotiations
     WHERE lead_id=$1
     ORDER BY created_at DESC`,
    [req.params.id]
  )).rows
)

fastify.post('/leads/:id/negotiations', async (req, reply) => {
  const { topic, note } = req.body
  const auth = getAuthFromRequest(req)
  if (!topic || !note)
    return reply.code(400).send({ error: 'Invalid negotiation note' })

  const r = await pool.query(
    `INSERT INTO lead_negotiations (lead_id, topic, note)
     VALUES ($1,$2,$3)
     RETURNING *`,
    [req.params.id, topic, note]
  )

  await pool.query(
    `UPDATE leads
     SET heat='Hot', updated_at=NOW()
     WHERE id=$1 AND status NOT IN ('Lost','Converted')`,
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

/* ===================== REPORTS ===================== */

fastify.get('/reports/funnel', async (req) => {
  const { from, to } = getDateRange(req.query)
  const r = await pool.query(
    `SELECT status, COUNT(*)::int count
     FROM leads
     WHERE created_at BETWEEN $1 AND $2
     GROUP BY status`,
    [from, to]
  )

  const map = Object.fromEntries(r.rows.map(x => [x.status, x.count]))
  return LEAD_STATUSES.map(s => ({ stage: s, count: map[s] || 0 }))
})

/* ===================== REPORTS: HEAT DISTRIBUTION ===================== */
fastify.get('/reports/heat-distribution', async (req) =>
  (await pool.query(
    `SELECT heat, COUNT(*)::int count
     FROM leads
     WHERE status NOT IN ('Lost','Converted')
       AND updated_at BETWEEN $1 AND $2
     GROUP BY heat`,
    Object.values(getDateRange(req.query))
  )).rows
)

/* ===================== WHATSAPP MESSAGE TEMPLATE ===================== */
fastify.get('/leads/:id/whatsapp-message', async (req, reply) => {
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

/* ===================== CITIES ===================== */

fastify.get('/cities', async () =>
  (await pool.query(
    `SELECT id, name, state, country FROM cities ORDER BY name`
  )).rows
)

/* ===================== METRICS JOB ===================== */

let metricsLastRun = null
let metricsRunning = false

async function runMetricsJob(force = false) {
  if (metricsRunning) return
  const today = dateToYMD(new Date())
  if (!force && metricsLastRun === today) return
  metricsRunning = true
  try {
    await recomputeLeadMetrics()
    await recomputeUserMetrics(today)
    metricsLastRun = today
    await pool.query(
      `
      INSERT INTO metrics_refresh_log (id, last_run_at)
      VALUES (1, NOW())
      ON CONFLICT (id) DO UPDATE SET last_run_at = EXCLUDED.last_run_at
      `
    )
  } catch (err) {
    console.warn('Metrics job failed:', err?.message || err)
  } finally {
    metricsRunning = false
  }
}

/* ===================== START ===================== */

fastify.listen({ port: 3001 }, () => {
  console.log('Backend running on http://localhost:3001')
  runMetricsJob()
  setInterval(runMetricsJob, 24 * 60 * 60 * 1000)
})
