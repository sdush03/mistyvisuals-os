const fastify = require('fastify')({ logger: true })
const cors = require('@fastify/cors')
const { Pool } = require('pg')
const crypto = require('crypto')

/* ===================== DB ===================== */

const pool = new Pool({
  user: 'dushyantsaini',
  host: 'localhost',
  database: 'postgres',
  port: 5432,
})

/* ===================== CORS ===================== */

fastify.register(cors, {
  origin: 'http://localhost:3000',
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
  'Converted',
  'Lost',
  'Rejected',
]
const COVERAGE_SCOPES = ['Both Sides', 'Bride Side', 'Groom Side']

const FOLLOWUP_TYPES = ['call', 'whatsapp', 'meeting']
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

async function hasPrimaryCity(leadId) {
  const r = await pool.query(
    `SELECT 1 FROM lead_cities WHERE lead_id=$1 AND is_primary=true LIMIT 1`,
    [leadId]
  )
  return r.rows.length > 0
}

async function isValidUserName(name) {
  if (!name) return false
  const r = await pool.query(
    `SELECT 1
     FROM users
     WHERE name IS NOT NULL
       AND lower(name) = lower($1)
       AND (role = 'admin' OR role = 'sales')
     LIMIT 1`,
    [name.trim()]
  )
  return r.rows.length > 0
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

function normalizePhone(raw) {
  if (!raw) return null

  let p = raw.trim()

  // already has country code
  if (p.startsWith('+')) return p

  // numeric only → assume India
  return `+91${p}`
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
const AUTH_SECRET = process.env.AUTH_SECRET || 'dev_secret_change_me'

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
  const maxAge = 60 * 60 * 24 * 7
  const cookie = [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  if (process.env.NODE_ENV === 'production') cookie.push('Secure')
  reply.header('Set-Cookie', cookie.join('; '))
}

function clearAuthCookie(reply) {
  reply.header('Set-Cookie', `${AUTH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`)
}

function getAuthFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '')
  if (!cookies[AUTH_COOKIE]) return null
  return verifyToken(cookies[AUTH_COOKIE])
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

  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  })

  setAuthCookie(reply, token)
  return { success: true, role: user.role, email: user.email }
})

fastify.post('/auth/logout', async (_req, reply) => {
  clearAuthCookie(reply)
  return { success: true }
})

fastify.get('/auth/me', async (req) => {
  const auth = getAuthFromRequest(req)
  if (!auth) return { authenticated: false }
  const r = await pool.query(
    'SELECT id, email, role, name, profile_photo, job_title FROM users WHERE id=$1',
    [auth.sub]
  )
  const user = r.rows[0] || { id: auth.sub, email: auth.email, role: auth.role, name: null, profile_photo: null, job_title: null }
  return {
    authenticated: true,
    user: { email: user.email, role: user.role, id: user.id, name: user.name, job_title: user.job_title, has_photo: Boolean(user.profile_photo) },
  }
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
  return { success: true }
})

/* ===================== LEADS ===================== */

fastify.get('/leads', async () =>
  normalizeLeadRows(
    (await pool.query(
      'SELECT *, phone_primary AS primary_phone FROM leads ORDER BY created_at DESC'
    )).rows
  )
)

fastify.post('/leads', async (req, reply) => {
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

  const needsSourceName = ['WhatsApp', 'Direct Call'].includes(source)
  if (needsSourceName) {
    if (!source_name || !String(source_name).trim()) {
      return reply.code(400).send({ error: 'Name is required for this source' })
    }
    const ok = await isValidUserName(String(source_name))
    if (!ok) {
      return reply.code(400).send({ error: 'Source name must match an existing user' })
    }
  }
  const storeSourceName = ['WhatsApp', 'Direct Call', 'Reference'].includes(source)

  if (!name || !String(name).trim()) {
    return reply.code(400).send({ error: 'Name is required' })
  }
  if (!primary_phone || !String(primary_phone).trim()) {
    return reply.code(400).send({ error: 'Primary phone is required' })
  }
  if (coverage_scope && !COVERAGE_SCOPES.includes(coverage_scope)) {
    return reply.code(400).send({ error: 'Invalid coverage scope' })
  }

  const r = await pool.query(
    `
    INSERT INTO leads (name, source, source_name, phone_primary, bride_name, groom_name, client_budget_amount, coverage_scope)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *, phone_primary AS primary_phone
    `,
    [
      formatName(name),
      source || 'Unknown',
      storeSourceName && source_name ? source_name.trim() : null,
      normalizePhone(primary_phone),
      formatName(bride_name),
      formatName(groom_name),
      client_budget_amount || null,
      coverage_scope || 'Both Sides',
    ]
  )

  return normalizeLeadRow(r.rows[0])
})

fastify.get('/leads/:id', async (req, reply) => {
  const r = await pool.query(
    `
    SELECT
      id,
      name,
      phone_primary AS primary_phone,
      phone_secondary,
      email,
      instagram,

      bride_name,
      bride_phone_primary,
      bride_phone_secondary,
      bride_email,
      bride_instagram,

      groom_name,
      groom_phone_primary,
      groom_phone_secondary,
      groom_email,
      groom_instagram,

      source,
      source_name,
      status,
      rejected_reason,
      client_budget_amount,
      amount_quoted,
      client_offer_amount,
      discounted_amount,
      coverage_scope,
      potential,
      important,
      next_followup_date,
      heat,
      event_type,
      is_destination,
      country,
      created_at,
      updated_at
    FROM leads
    WHERE id = $1
    `,
    [req.params.id]
  )

  if (!r.rows.length) {
    return reply.code(404).send({ error: 'Lead not found' })
  }

  return normalizeLeadRow(r.rows[0])
})

fastify.patch('/leads/:id/status', async (req, reply) => {
  const { id } = req.params
  const { status, rejected_reason } = req.body

  if (!LEAD_STATUSES.includes(status)) {
    return reply.code(400).send({ error: 'Invalid status' })
  }

  // 🔒 HARD BLOCK — ONLY HERE
  const needsPrimaryEvent = ['Quoted','Follow Up','Negotiation', 'Converted'].includes(status)

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
        error: 'At least one event is required before moving this lead forward',
      })
    }

    const hasPrimary = await hasPrimaryCity(id)
    if (!hasPrimary) {
      return reply.code(400).send({
        code: 'PRIMARY_CITY_REQUIRED',
        error: 'A primary city is required before moving this lead forward',
      })
    }

    const ok = await hasEventInPrimaryCity(id)

    if (!ok) {
      return reply.code(400).send({
        code: 'PRIMARY_CITY_EVENT_REQUIRED',
        error: 'At least one event must be linked to the primary city before moving this lead forward',
      })
    }
  }

  // 🔒 HARD BLOCK ONLY FOR CONVERSION
  if (status === 'Converted') {
    const r = await pool.query(`
      SELECT 1
      FROM lead_events e
      JOIN lead_cities lc ON lc.city_id = e.city_id
      WHERE e.lead_id=$1 AND lc.is_primary=true
      LIMIT 1
    `, [req.params.id])

    if (r.rowCount === 0) {
      return reply.code(400).send({
        code: 'PRIMARY_CITY_EVENT_REQUIRED',
        error: 'At least one event must be linked to the primary city before converting the lead',
      })
    }
  }

  const cur = await pool.query(
    'SELECT status, heat FROM leads WHERE id=$1',
    [id]
  )
  if (!cur.rows.length) {
    return reply.code(404).send({ error: 'Lead not found' })
  }

  const currentStatus = cur.rows[0].status
  const currentHeat = cur.rows[0].heat || 'Cold'

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
  if (status === 'Converted') nextHeat = 'Hot'
  if (status === 'Lost') nextHeat = 'Cold'
  if (status === 'Rejected') nextHeat = 'Cold'

  const finalRejectedReason =
    status === 'Rejected'
      ? (String(rejected_reason || '').trim() || 'Low budget')
      : null

  const updated = await pool.query(
    `
    UPDATE leads
    SET status=$1,
        previous_status=$2,
        heat=$3,
        rejected_reason=$4,
        updated_at=NOW()
    WHERE id=$5
    RETURNING *
    `,
    [status, currentStatus, nextHeat, finalRejectedReason, id]
  )

  return normalizeLeadRow(updated.rows[0])
})

fastify.patch('/leads/:id/heat', async (req, reply) => {
  const { heat } = req.body
  if (!HEAT_VALUES.includes(heat))
    return reply.code(400).send({ error: 'Invalid heat value' })

  const r = await pool.query(
    `UPDATE leads
     SET heat=$1, updated_at=NOW()
     WHERE id=$2 AND status NOT IN ('Lost','Converted','Rejected')
     RETURNING *`,
    [heat, req.params.id]
  )

  return normalizeLeadRow(r.rows[0])
})

fastify.post('/leads/:id/lost', async (req, reply) => {
  const { id } = req.params
  const { reason, note } = req.body || {}
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
    INSERT INTO lead_lost_reasons (lead_id, reason, note)
    VALUES ($1,$2,$3)
    ON CONFLICT (lead_id)
    DO UPDATE SET reason=EXCLUDED.reason, note=EXCLUDED.note, lost_at=NOW()
    `,
    [id, String(reason).trim(), note || null]
  )

  const updated = await pool.query(
    `
    UPDATE leads
    SET status='Lost',
        previous_status=$1,
        heat='Cold',
        rejected_reason=NULL,
        updated_at=NOW()
    WHERE id=$2
    RETURNING *
    `,
    [cur.rows[0].status, id]
  )

  return normalizeLeadRow(updated.rows[0])
})

fastify.patch('/leads/:id/followup-date', async (req, reply) => {
  const { id } = req.params
  const { next_followup_date } = req.body || {}

  const r = await pool.query(
    `UPDATE leads
     SET next_followup_date=$1, updated_at=NOW()
     WHERE id=$2
     RETURNING *, phone_primary AS primary_phone`,
    [next_followup_date || null, id]
  )

  if (!r.rows.length) {
    return reply.code(404).send({ error: 'Lead not found' })
  }

  return normalizeLeadRow(r.rows[0])
})

/* ===================== ENRICHMENT ===================== */

fastify.get('/leads/:id/enrichment', async (req, reply) => {
  const lead = await pool.query(
    `SELECT event_type, is_destination, country, client_budget_amount, amount_quoted, client_offer_amount, discounted_amount, coverage_scope, potential, important
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
       important
     FROM leads
     WHERE id=$1`,
    [id]
  )
  const existing = existingLead.rows[0] || {}
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

  const numEqual = (a, b) => {
    if (a === null && b === null) return true
    if (a === null || b === null) return false
    return Number(a) === Number(b)
  }

  const existingClientOffer = toNumberOrNull(existing.client_offer_amount)
  const existingDiscounted = toNumberOrNull(existing.discounted_amount)
  const clientOfferChanged = hasClientOffer && !numEqual(existingClientOffer, nextClientOffer)
  const discountedChanged = hasDiscounted && !numEqual(existingDiscounted, nextDiscounted)

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
      updated_at=NOW()
    WHERE id=$15`,
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
      id,
    ]
  )

    if (clientOfferChanged && nextClientOffer !== null) {
      await client.query(
        `INSERT INTO lead_pricing_logs (lead_id, field_type, amount)
         VALUES ($1,'client_offer',$2)`,
        [id, nextClientOffer]
      )
    }

    if (discountedChanged && nextDiscounted !== null) {
      await client.query(
        `INSERT INTO lead_pricing_logs (lead_id, field_type, amount)
         VALUES ($1,'discounted',$2)`,
        [id, nextDiscounted]
      )
    }

    await client.query(
      `INSERT INTO lead_enrichment_logs (lead_id, payload)
       VALUES ($1,$2)`,
      [
        id,
        {
          ...payload,
          enforced_is_destination: isDestination,
          primary_country: primaryCountry,
        },
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

  const needsSourceName = ['WhatsApp', 'Direct Call'].includes(c.source)
  if (needsSourceName) {
    if (!c.source_name || !String(c.source_name).trim()) {
      return reply.code(400).send({ error: 'Name is required for this source' })
    }
    const ok = await isValidUserName(String(c.source_name))
    if (!ok) {
      return reply.code(400).send({ error: 'Source name must match an existing user' })
    }
  }
  const storeSourceName = ['WhatsApp', 'Direct Call', 'Reference'].includes(c.source)

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
      storeSourceName && c.source_name ? c.source_name.trim() : null,

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
    `SELECT id, lead_id, note_text, created_at
     FROM lead_notes
     WHERE lead_id=$1
     ORDER BY created_at ASC`,
    [req.params.id]
  )

  return r.rows
})

fastify.post('/leads/:id/notes', async (req, reply) => {
  const { note_text } = req.body || {}
  if (!note_text || !String(note_text).trim()) {
    return reply.code(400).send({ error: 'Note text is required' })
  }

  const r = await pool.query(
    `INSERT INTO lead_notes (lead_id, note_text)
     VALUES ($1,$2)
     RETURNING id, lead_id, note_text, created_at`,
    [req.params.id, String(note_text).trim()]
  )

  return r.rows[0]
})

fastify.patch('/leads/:id/notes/:noteId', async (req, reply) => {
  const { id, noteId } = req.params
  const { note_text } = req.body || {}
  if (!note_text || !String(note_text).trim()) {
    return reply.code(400).send({ error: 'Note text is required' })
  }

  const r = await pool.query(
    `UPDATE lead_notes
     SET note_text = $1
     WHERE id = $2 AND lead_id = $3
     RETURNING id, lead_id, note_text, created_at`,
    [String(note_text).trim(), noteId, id]
  )

  if (!r.rows.length) {
    return reply.code(404).send({ error: 'Note not found' })
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
          error: 'At least one event is required for this status',
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
          error: 'At least one event must be linked to the primary city for this status',
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

fastify.post('/leads/:id/events', async (req) => {
  const { id } = req.params
  const {
    event_date,
    slot,
    event_type,
    pax,
    venue,
    description,
    city_id,
  } = req.body

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
      (lead_id, event_date, slot, event_type, pax, venue, description, city_id, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      id,
      event_date,
      slot,
      event_type,
      pax,
      venue || null,
      description || null,
      finalCityId,
      pos.rows[0].p,
    ]
  )

  // 🔹 Soft validation (AFTER insert)
  const hasPrimaryEvent = await hasEventInPrimaryCity(id)

  return {
    success: true,
    event: r.rows[0],
    warnings: hasPrimaryEvent
      ? []
      : [
          'No event is linked to the primary city yet. Please ensure at least one main event is in the primary city before proceeding.',
        ],
  }
})


fastify.patch('/leads/:id/events/:eventId', async (req, reply) => {
  const { id, eventId } = req.params
  let { event_date, slot, event_type, pax, venue, description, city_id } =
    req.body

  if (event_date) event_date = event_date.slice(0, 10)

  const current = await pool.query(
    `SELECT * FROM lead_events WHERE id=$1 AND lead_id=$2`,
    [eventId, id]
  )

  if (!current.rows.length)
    return reply.code(404).send({ error: 'Event not found' })

  const e = current.rows[0]
  const statusRes = await pool.query(`SELECT status FROM leads WHERE id=$1`, [id])
  if (!statusRes.rows.length) return reply.code(404).send({ error: 'Lead not found' })
  const leadStatus = statusRes.rows[0].status
  const mustEnforce = ['Quoted','Follow Up','Negotiation','Converted'].includes(leadStatus)
  const nextCityId = city_id ?? e.city_id

  if (mustEnforce) {
    if (!nextCityId) {
      return reply.code(400).send({ error: 'Event city is required for this status' })
    }
    const primaryCityRes = await pool.query(
      `SELECT city_id FROM lead_cities WHERE lead_id=$1 AND is_primary=true`,
      [id]
    )
    const primaryCityId = primaryCityRes.rows[0]?.city_id
    if (!primaryCityId) {
      return reply.code(400).send({ error: 'Primary city is required for this status' })
    }

    const primaryCountRes = await pool.query(
      `
      SELECT SUM(
        CASE
          WHEN id=$2 THEN CASE WHEN $3::int = $4::int THEN 1 ELSE 0 END
          ELSE CASE WHEN city_id=$4::int THEN 1 ELSE 0 END
        END
      )::int AS cnt
      FROM lead_events
      WHERE lead_id=$1
      `,
      [id, eventId, nextCityId, primaryCityId]
    )
    if ((primaryCountRes.rows[0]?.cnt || 0) === 0) {
      return reply.code(400).send({
        error: 'At least one event must be linked to the primary city for this status',
      })
    }
  }

  const r = await pool.query(
    `UPDATE lead_events SET
      event_date=$1,
      slot=$2,
      event_type=$3,
      pax=$4,
      venue=$5,
      description=$6,
      city_id=$7,
      updated_at=NOW()
     WHERE id=$8 AND lead_id=$9
     RETURNING *`,
    [
      event_date ?? e.event_date,
      slot ?? e.slot,
      event_type ?? e.event_type,
      pax ?? e.pax,
      venue ?? e.venue,
      description ?? e.description,
      city_id ?? e.city_id,
      eventId,
      id,
    ]
  )

  return r.rows[0]
})

fastify.delete('/leads/:id/events/:eventId', async (req, reply) => {
  const { id, eventId } = req.params
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
      return reply.code(400).send({ error: 'At least one event is required for this status' })
    }

    const primaryEventRes = await pool.query(
      `
      SELECT 1
      FROM lead_events e
      JOIN lead_cities lc
        ON lc.city_id = e.city_id
       AND lc.lead_id = e.lead_id
       AND lc.is_primary = true
      WHERE e.lead_id = $1
        AND e.id <> $2
      LIMIT 1
      `,
      [id, eventId]
    )
    if (!primaryEventRes.rows.length) {
      return reply.code(400).send({
        error: 'At least one event must be linked to the primary city for this status',
      })
    }
  }

  await pool.query(
    'DELETE FROM lead_events WHERE id=$1 AND lead_id=$2',
    [eventId, id]
  )
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
  if (!followUpAt || !FOLLOWUP_TYPES.includes(type))
    return reply.code(400).send({ error: 'Invalid follow-up' })

  const r = await pool.query(
    `INSERT INTO lead_followups (lead_id, follow_up_at, type, note)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [req.params.id, followUpAt, type, note || null]
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
fastify.get('/leads/:id/whatsapp-message', async (req) => {
  const { id } = req.params

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
    'Hey {{name}}, connecting from Misty Visuals.'

  const resolved = raw
    .replace('{{name}}', lead.rows[0].name || '')
    .replace('{{user}}', 'Misty Visuals') // later from auth
    .replace('{{quote_link}}', 'https://mistyvisuals.in/quote')

  return { message: resolved }
})

/* ===================== CITIES ===================== */

fastify.get('/cities', async () =>
  (await pool.query(
    `SELECT id, name, state, country FROM cities ORDER BY name`
  )).rows
)

/* ===================== START ===================== */

fastify.listen({ port: 3001 }, () =>
  console.log('Backend running on http://localhost:3001')
)
