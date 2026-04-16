
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

/* ===================== DB ===================== */
if (!require.extensions['.ts']) {
  require.extensions['.ts'] = require.extensions['.js']
}
const { pool } = require('./db.ts')

const toISTDateString = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

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
const UPLOADS_DIR = path.join(__dirname, 'uploads')
const PHOTO_UPLOAD_DIR = path.join(UPLOADS_DIR, 'photos')


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

function ensureDirectory(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true })
  } catch (err) {
    console.warn('Failed to ensure upload directory:', err?.message || err)
  }
}

function sanitizeTags(input) {
  if (!Array.isArray(input)) return []
  const clean = input
    .map(tag => String(tag || '').trim())
    .filter(Boolean)
  return Array.from(new Set(clean))
}

function getImageContentType(filename) {
  const ext = path.extname(filename || '').toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'application/octet-stream'
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

async function logAdminAudit(req, action, entity_type, entity_id, before_data, after_data, user_id) {
  try {
    const ip = req?.ip || req?.headers?.['x-forwarded-for'] || null
    const userAgent = req?.headers?.['user-agent'] || null
    await pool.query(
      `INSERT INTO admin_audit_log (user_id, action, entity_type, entity_id, before_data, after_data, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        user_id || null,
        action,
        entity_type,
        entity_id || null,
        before_data ? JSON.stringify(before_data) : null,
        after_data ? JSON.stringify(after_data) : null,
        ip,
        userAgent,
      ]
    )
  } catch (err) {
    console.warn('Admin audit log failed:', err?.message || err)
  }
}

const PROTECTED_ADMIN_EMAIL = String(process.env.PROTECTED_ADMIN_EMAIL || 'dushyant@mistyvisuals.com')
  .trim()
  .toLowerCase()

const isProtectedAdminUser = (user) => {
  const email = String(user?.email || '').trim().toLowerCase()
  const name = String(user?.name || '').trim().toLowerCase()
  return email === PROTECTED_ADMIN_EMAIL || name === 'dushyant saini'
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function dateToYMD(d) {
  // Always return IST date string regardless of server timezone
  return toISTDateString(d)
}

function addDaysYMD(days, base = new Date()) {
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
  return dateToYMD(next)
}

function normalizeYMD(value) {
  if (!value) return null
  const trimmed = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const parsed = new Date(`${trimmed}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return trimmed
}

function addDaysToYMD(ymd, days) {
  const base = new Date(`${ymd}T00:00:00`)
  if (Number.isNaN(base.getTime())) return null
  base.setDate(base.getDate() + days)
  return dateToYMD(base)
}

function normalizeDateValue(value) {
  if (!value) return null
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const str = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
  const parsed = new Date(str)
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear()
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    const day = String(parsed.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return str.slice(0, 10)
}

function getFyLabelFromDate(date) {
  if (!date) return null
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return null
  const month = d.getMonth() + 1
  const startYear = month >= 4 ? d.getFullYear() : d.getFullYear() - 1
  const endYear = startYear + 1
  return `FY${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`
}

function getCurrentFyLabel() {
  return getFyLabelFromDate(new Date())
}

function parseFyLabel(fyLabel) {
  const value = String(fyLabel || '').trim()
  const match = /^FY(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const startYear = 2000 + Number(match[1])
  const endYear = 2000 + Number(match[2])
  if (endYear !== startYear + 1) return null
  const startDate = `${startYear}-04-01`
  const endDate = `${endYear}-03-31`
  return { label: value, startYear, endYear, startDate, endDate }
}

function getFyRange(fyLabel) {
  const parsed = parseFyLabel(fyLabel)
  if (!parsed) return null
  return parsed
}

function listFyLabelsBetween(minDate, maxDate) {
  const labels = []
  if (!minDate || !maxDate) return labels
  const startLabel = getFyLabelFromDate(minDate)
  const endLabel = getFyLabelFromDate(maxDate)
  if (!startLabel || !endLabel) return labels
  const startParsed = parseFyLabel(startLabel)
  const endParsed = parseFyLabel(endLabel)
  if (!startParsed || !endParsed) return labels
  for (let year = endParsed.startYear; year >= startParsed.startYear; year -= 1) {
    const nextYear = year + 1
    labels.push(`FY${String(year).slice(-2)}-${String(nextYear).slice(-2)}`)
  }
  return labels
}

function formatRefDate(value) {
  if (!value) return ''
  return String(value).replace(/-/g, '').slice(0, 8)
}

async function assignReferenceCode(client, txId, baseCode) {
  if (!baseCode || !txId) return null
  try {
    await client.query(
      `UPDATE finance_transactions SET reference_code = $1 WHERE id = $2`,
      [baseCode, txId]
    )
    return baseCode
  } catch (err) {
    if (err?.code === '23505') {
      const fallback = `${baseCode}-T${txId}`
      await client.query(
        `UPDATE finance_transactions SET reference_code = $1 WHERE id = $2`,
        [fallback, txId]
      )
      return fallback
    }
    throw err
  }
}

async function getAvailableFyLabels() {
  try {
    const { rows } = await pool.query(`
      SELECT MIN(d)::date as min_date, MAX(d)::date as max_date FROM (
        SELECT MAX(created_at)::date as d FROM invoice_payments GROUP BY invoice_id
        UNION ALL
        SELECT MAX(date)::date as d FROM finance_transactions WHERE vendor_bill_id IS NOT NULL AND is_deleted = false AND is_transfer = false GROUP BY vendor_bill_id
        UNION ALL
        SELECT month::date as d FROM contribution_units
        UNION ALL
        SELECT date::date as d FROM finance_transactions WHERE transaction_type = 'overhead' AND is_deleted = false AND is_transfer = false
      ) t
    `)
    const minDate = rows[0]?.min_date
    const maxDate = rows[0]?.max_date
    const currentFy = getCurrentFyLabel()
    const labels = listFyLabelsBetween(minDate, maxDate)
    if (currentFy && !labels.includes(currentFy)) {
      labels.unshift(currentFy)
    }
    return labels.length ? labels : [currentFy].filter(Boolean)
  } catch (err) {
    const currentFy = getCurrentFyLabel()
    return currentFy ? [currentFy] : []
  }
}

async function fetchProfitProjectRows({
  fyStart,
  fyEndExclusive,
  filters = {},
}) {
  const params = [fyStart, fyEndExclusive]
  let idx = 3
  const leadFilters = []

  if (filters.leadId) {
    leadFilters.push(`l.id = $${idx++}`)
    params.push(filters.leadId)
  }
  if (filters.status) {
    leadFilters.push(`l.status = $${idx++}`)
    params.push(filters.status)
  }
  if (filters.cityId) {
    leadFilters.push(`EXISTS (SELECT 1 FROM lead_cities lc WHERE lc.lead_id = l.id AND lc.city_id = $${idx++})`)
    params.push(filters.cityId)
  }
  if (filters.cityName) {
    leadFilters.push(`EXISTS (
      SELECT 1 FROM lead_cities lc
      JOIN cities c ON c.id = lc.city_id
      WHERE lc.lead_id = l.id AND lower(c.name) = lower($${idx++})
    )`)
    params.push(filters.cityName)
  }

  if (filters.eventType || filters.eventFrom || filters.eventTo) {
    const eventClauses = []
    if (filters.eventType) {
      eventClauses.push(`e.event_type = $${idx++}`)
      params.push(filters.eventType)
    }
    if (filters.eventFrom) {
      eventClauses.push(`e.event_date >= $${idx++}`)
      params.push(filters.eventFrom)
    }
    if (filters.eventTo) {
      eventClauses.push(`e.event_date <= $${idx++}`)
      params.push(filters.eventTo)
    }
    leadFilters.push(`EXISTS (
      SELECT 1 FROM lead_events e
      WHERE e.lead_id = l.id ${eventClauses.length ? `AND ${eventClauses.join(' AND ')}` : ''}
    )`)
  }

  const leadWhere = leadFilters.length ? `WHERE ${leadFilters.join(' AND ')}` : ''

  const { rows } = await pool.query(
    `
    WITH paid_invoices AS (
      SELECT i.id, i.lead_id, i.total_amount, MAX(p.created_at)::date as paid_date
      FROM invoices i
      JOIN invoice_payments p ON p.invoice_id = i.id
      WHERE i.status = 'paid'
      GROUP BY i.id
    ),
    revenue AS (
      SELECT lead_id, SUM(total_amount) as total_revenue
      FROM paid_invoices
      WHERE paid_date >= $1 AND paid_date < $2
      GROUP BY lead_id
    ),
    paid_vendor AS (
      SELECT vb.id, vb.lead_id, vb.bill_amount, vb.is_billable_to_client, MAX(ft.date)::date as paid_date
      FROM vendor_bills vb
      JOIN finance_transactions ft ON ft.vendor_bill_id = vb.id AND ft.is_deleted = false AND ft.is_transfer = false
      WHERE vb.status = 'paid'
      GROUP BY vb.id
    ),
    vendor_cost AS (
      SELECT lead_id, SUM(bill_amount) as total_vendor
      FROM paid_vendor pv
      WHERE pv.paid_date >= $1 AND pv.paid_date < $2
        AND NOT (
          pv.is_billable_to_client = true
          AND EXISTS (
            SELECT 1 FROM invoice_line_items ili
            WHERE ili.vendor_bill_id = pv.id
          )
        )
      GROUP BY lead_id
    ),
    cu AS (
      SELECT cu.user_id,
             cu.lead_id,
             date_trunc('month', cu.month)::date as month_start,
             COUNT(*) as cu_count
      FROM contribution_units cu
      WHERE cu.month >= $1 AND cu.month < $2
      GROUP BY cu.user_id, cu.lead_id, month_start
    ),
    cu_totals AS (
      SELECT user_id, month_start, SUM(cu_count) as total_cu
      FROM cu
      GROUP BY user_id, month_start
    ),
    salaries AS (
      SELECT ecp.user_id, ecp.base_amount
      FROM employee_compensation_profiles ecp
      WHERE ecp.is_active = true
        AND ecp.base_amount IS NOT NULL
        AND ecp.employment_type IN ('salaried','stipend','salaried_plus_variable')
    ),
    payroll_alloc AS (
      SELECT cu.lead_id,
             (cu.cu_count / NULLIF(ct.total_cu, 0)) * s.base_amount as allocated
      FROM cu
      JOIN cu_totals ct ON ct.user_id = cu.user_id AND ct.month_start = cu.month_start
      JOIN salaries s ON s.user_id = cu.user_id
    ),
    payroll_overhead AS (
      SELECT lead_id, SUM(allocated) as total_payroll
      FROM payroll_alloc
      GROUP BY lead_id
    ),
    infra AS (
      SELECT date_trunc('month', ft.date)::date as month_start,
             SUM(ft.amount) as total_infra
      FROM finance_transactions ft
      WHERE ft.transaction_type = 'overhead'
        AND ft.is_deleted = false
        AND ft.is_transfer = false
        AND ft.date >= $1 AND ft.date < $2
      GROUP BY month_start
    ),
    active_events AS (
      SELECT cu.lead_id, date_trunc('month', cu.month)::date as month_start
      FROM contribution_units cu
      WHERE cu.month >= $1 AND cu.month < $2
      UNION
      SELECT vb.lead_id, date_trunc('month', ft.date)::date as month_start
      FROM finance_transactions ft
      JOIN vendor_bills vb ON vb.id = ft.vendor_bill_id
      WHERE ft.vendor_bill_id IS NOT NULL AND ft.is_deleted = false AND ft.is_transfer = false
        AND ft.date >= $1 AND ft.date < $2 AND vb.lead_id IS NOT NULL
      UNION
      SELECT la.lead_id, date_trunc('month', la.created_at)::date as month_start
      FROM lead_activities la
      WHERE la.created_at >= $1 AND la.created_at < $2 AND la.lead_id IS NOT NULL
      UNION
      SELECT lul.lead_id, date_trunc('month', lul.entered_at)::date as month_start
      FROM lead_usage_logs lul
      WHERE lul.entered_at >= $1 AND lul.entered_at < $2 AND lul.lead_id IS NOT NULL
    ),
    active_counts AS (
      SELECT month_start, COUNT(DISTINCT lead_id) as active_projects
      FROM active_events
      GROUP BY month_start
    ),
    active_leads AS (
      SELECT DISTINCT lead_id, month_start FROM active_events
    ),
    infra_alloc AS (
      SELECT al.lead_id,
             SUM(infra.total_infra / NULLIF(ac.active_projects, 0)) as total_infra
      FROM active_leads al
      JOIN infra ON infra.month_start = al.month_start
      JOIN active_counts ac ON ac.month_start = al.month_start
      GROUP BY al.lead_id
    ),
    lead_base AS (
      SELECT lead_id FROM revenue
      UNION
      SELECT lead_id FROM vendor_cost
      UNION
      SELECT lead_id FROM payroll_overhead
      UNION
      SELECT lead_id FROM infra_alloc
      UNION
      SELECT DISTINCT lead_id FROM active_events
    )
    SELECT
      l.id as lead_id,
      l.lead_number,
      l.name,
      l.bride_name,
      l.groom_name,
      l.status,
      COALESCE(r.total_revenue, 0) as revenue,
      COALESCE(v.total_vendor, 0) as vendor_cost,
      COALESCE(p.total_payroll, 0) as payroll_overhead,
      COALESCE(i.total_infra, 0) as infra_overhead
    FROM lead_base lb
    JOIN leads l ON l.id = lb.lead_id
    LEFT JOIN revenue r ON r.lead_id = lb.lead_id
    LEFT JOIN vendor_cost v ON v.lead_id = lb.lead_id
    LEFT JOIN payroll_overhead p ON p.lead_id = lb.lead_id
    LEFT JOIN infra_alloc i ON i.lead_id = lb.lead_id
    ${leadWhere}
    `,
    params
  )

  return rows
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

async function createNotification({ userId = null, roleTarget = null, title, message, category, type = 'INFO', linkUrl = null }, client = pool) {
  try {
    await client.query(`
      INSERT INTO notifications (user_id, role_target, title, message, category, type, link_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [userId, roleTarget, title, message, category, type, linkUrl])

    // Cleanup: Fire and forget (don't await)
    // 1. Delete read notifications older than 30 days
    client.query(`DELETE FROM notifications WHERE is_read = true AND created_at < NOW() - INTERVAL '30 days';`).catch(() => {})

    // 2. Keep only latest 1000 per target (user or role)
    if (userId) {
      client.query(`
        DELETE FROM notifications 
        WHERE id IN (
          SELECT id FROM notifications WHERE user_id = $1 ORDER BY created_at DESC OFFSET 1000
        )
      `, [userId]).catch(() => {})
    } else if (roleTarget) {
      client.query(`
        DELETE FROM notifications 
        WHERE id IN (
          SELECT id FROM notifications WHERE role_target = $1 ORDER BY created_at DESC OFFSET 1000
        )
      `, [roleTarget]).catch(() => {})
    }
  } catch (err) {
    console.warn('Failed to create notification:', err?.message || err)
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
    WITH bounds AS (
      SELECT
        $1::date AS day_start,
        ($1::date + INTERVAL '1 day') AS day_end
    ),
    sessions AS (
      SELECT
        s.user_id,
        GREATEST(s.login_at, b.day_start) AS seg_start,
        LEAST(COALESCE(s.logout_at, s.last_seen_at, s.login_at), b.day_end) AS seg_end
      FROM user_sessions s
      CROSS JOIN bounds b
      WHERE s.login_at < b.day_end
        AND COALESCE(s.logout_at, s.last_seen_at, s.login_at) > b.day_start
    ),
    session_sums AS (
      SELECT
        user_id,
        COUNT(*)::int AS total_sessions,
        COALESCE(SUM(EXTRACT(EPOCH FROM (seg_end - seg_start))), 0)::int AS total_session_duration_seconds
      FROM sessions
      WHERE seg_end > seg_start
      GROUP BY user_id
    ),
    usage AS (
      SELECT
        user_id,
        COUNT(DISTINCT lead_id)::int AS leads_opened_count,
        COALESCE(SUM(duration_seconds), 0)::int AS total_time_spent_on_leads_seconds
      FROM lead_usage_logs
      WHERE (entered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = $1::date
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
      WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = $1::date
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
      FROM session_sums s
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

async function getRoundRobinSalesUserId(client = pool) {
  const salesRes = await client.query(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE u.is_active = true AND r.key = 'sales' AND u.email != 'test@mistyvisuals.com'
     ORDER BY u.id ASC`
  )
  const salesIds = salesRes.rows.map(r => r.id)
  if (!salesIds.length) return null
  if (salesIds.length === 1) return salesIds[0]

  const lastAssigned = await client.query(
    `SELECT assigned_user_id
     FROM leads
     WHERE assigned_user_id = ANY($1::int[])
     ORDER BY created_at DESC
     LIMIT 1`,
    [salesIds]
  )
  const lastId = lastAssigned.rows[0]?.assigned_user_id || null
  if (!lastId) return salesIds[0]
  const idx = salesIds.indexOf(lastId)
  return salesIds[(idx + 1) % salesIds.length]
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

function signToken(payload) {
  return fastify.jwt.sign(payload)
}

function verifyToken(token) {
  try {
    return fastify.jwt.verify(token)
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
    maxAge: 60 * 60 * 24 * 7,
  })
}

function clearAuthCookie(reply) {
  const common = {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    expires: new Date(0),
  }
  
  // Clear without domain (covers current host)
  reply.setCookie(AUTH_COOKIE, '', common)

  // Also try clearing common domain patterns to hit any legacy stuck cookies
  if (process.env.NODE_ENV === 'production') {
    reply.setCookie(AUTH_COOKIE, '', { ...common, domain: '.mistyvisuals.com' })
    reply.setCookie(AUTH_COOKIE, '', { ...common, domain: 'mistyvisuals.com' })
    reply.setCookie(AUTH_COOKIE, '', { ...common, domain: '.mistyvisuals.in' })
    reply.setCookie(AUTH_COOKIE, '', { ...common, domain: 'mistyvisuals.in' })
  }
}

function getAuthFromRequest(req) {
  const token =
    (req.cookies && req.cookies[AUTH_COOKIE]) ||
    parseCookies(req.headers.cookie || '')[AUTH_COOKIE]
  if (!token) return null
  return verifyToken(token)
}

function requireAuth(req, reply) {
  const auth = getAuthFromRequest(req)
  if (!auth) {
    reply.code(401).send({ error: 'Not authenticated' })
    return null
  }
  return auth
}

function requireAdmin(req, reply) {
  const auth = requireAuth(req, reply)
  if (!auth) return null
  const roles = Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []
  if (!roles.includes('admin')) {
    reply.code(403).send({ error: 'Admin only' })
    return null
  }
  return auth
}

async function requireVendor(req, reply) {
  const auth = requireAuth(req, reply)
  if (!auth) return null
  const roles = Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []
  if (roles.includes('admin')) {
    reply.code(403).send({ error: 'Vendor portal is not available for admin users' })
    return null
  }
  const userId = auth.sub
  if (!userId) {
    reply.code(401).send({ error: 'Not authenticated' })
    return null
  }
  try {
    const { rows } = await pool.query(`SELECT * FROM vendors WHERE user_id = $1 AND is_active = true`, [userId])
    if (!rows.length) {
      reply.code(403).send({ error: 'Vendor profile not linked. Contact admin.' })
      return null
    }
    return { user: { id: userId, email: auth.email, role: auth.role }, roles, vendor: rows[0] }
  } catch (err) {
    reply.code(500).send({ error: 'Server error' })
    return null
  }
}

/* ===================== API AUTH GUARD ===================== */
const PUBLIC_API_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/health',
  '/api/version',
  '/auth/login',
  '/auth/logout',
  '/health',
  '/version',
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

fastify.get('/api/health', async () => ({ status: 'ok' }))
fastify.get('/api/version', async () => ({
  version: '1.0.0',
  env: process.env.NODE_ENV,
}))
fastify.get('/health', async () => ({ status: 'ok' }))
fastify.get('/version', async () => ({ version: '1.0.0' }))


const apiRoutes = async function apiRoutes(api) {
  /* ===================== ADMIN USERS ===================== */
  const getDefaultPassword = () => {
    const raw = String(process.env.DEFAULT_PASSWORD || '').trim()
    return raw || null
  }

  const normalizeUserEmail = (value) => {
    const trimmed = String(value || '').trim().toLowerCase()
    return trimmed || null
  }

  const normalizeUserPhone = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return null
    const compact = raw.replace(/[\s\-().]/g, '')
    if (/^\+91\d{10}$/.test(compact)) return compact
    if (/^\d{10}$/.test(compact)) return compact
    return null
  }

  const ensureUniqueUserFields = async ({ email, phone, excludeId }) => {
    if (email) {
      const exists = await pool.query(
        `SELECT id FROM users WHERE lower(email)=lower($1) AND id<>COALESCE($2, -1) LIMIT 1`,
        [email, excludeId || null]
      )
      if (exists.rows.length) return 'Email already in use'
    }
    if (phone) {
      const exists = await pool.query(
        `SELECT id FROM users WHERE phone=$1 AND id<>COALESCE($2, -1) LIMIT 1`,
        [phone, excludeId || null]
      )
      if (exists.rows.length) return 'Phone already in use'
    }
    return null
  }

  api.get('/admin/roles', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    return (await pool.query(`SELECT id, key, label FROM roles ORDER BY key ASC`)).rows
  })

  api.get('/admin/users', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    return (await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.phone,
         u.nickname,
         u.job_title,
         u.crew_type,
         u.operational_role_id,
         u.is_login_enabled,
         u.is_active,
         u.force_password_reset,
         u.created_at,
         COALESCE(array_remove(array_agg(r.key), NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id
       ORDER BY u.name NULLS LAST, u.email ASC`
    )).rows
  })

  api.get('/admin/users/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { id } = req.params
    const res = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.phone,
         u.nickname,
         u.job_title,
         u.profile_photo,
         u.crew_type,
         u.operational_role_id,
         u.is_login_enabled,
         u.is_active,
         u.force_password_reset,
         u.created_at,
         COALESCE(array_remove(array_agg(r.key), NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [id]
    )
    if (!res.rows.length) return reply.code(404).send({ error: 'User not found' })
    return res.rows[0]
  })

  api.post('/admin/users', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const {
      name,
      email,
      phone,
      nickname,
      job_title,
      profile_photo,
      crew_type,
      operational_role_id,
      is_login_enabled,
      roles,
    } = req.body || {}

    const finalName = String(name || '').trim()
    if (!finalName) return reply.code(400).send({ error: 'Name is required' })

    const finalEmail = normalizeUserEmail(email)
    const finalPhone = normalizeUserPhone(phone)
    if (!finalPhone) {
      return reply.code(400).send({ error: 'Phone is required (10 digits or +91XXXXXXXXXX)' })
    }

    const uniquenessError = await ensureUniqueUserFields({ email: finalEmail, phone: finalPhone })
    if (uniquenessError) return reply.code(400).send({ error: uniquenessError })

    const defaultPassword = getDefaultPassword()
    if (!defaultPassword) {
      return reply.code(500).send({ error: 'Default password is not configured' })
    }

    const rolesList = Array.isArray(roles) ? roles.map(r => String(r)) : []
    if (!rolesList.length) {
      return reply.code(400).send({ error: 'At least one role is required' })
    }
    const legacyRole = rolesList.includes('admin') ? 'admin' : 'sales'
    const loginEnabled =
      is_login_enabled == null
        ? !rolesList.includes('crew')
        : String(is_login_enabled).toLowerCase() === 'true' || is_login_enabled === true
    const finalCrewType = crew_type != null ? String(crew_type).trim() || null : null
    let finalOperationalRoleId = null
    if (operational_role_id != null) {
      const parsed = Number(operational_role_id)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return reply.code(400).send({ error: 'Operational role is invalid' })
      }
      const roleRes = await pool.query('SELECT id FROM operational_roles WHERE id=$1', [parsed])
      if (!roleRes.rows.length) {
        return reply.code(400).send({ error: 'Operational role not found' })
      }
      finalOperationalRoleId = parsed
    }
    if (rolesList.includes('crew') && !finalOperationalRoleId) {
      return reply.code(400).send({ error: 'Operational role is required for crew' })
    }

    const res = await pool.query(
      `INSERT INTO users (name, email, phone, nickname, job_title, profile_photo, crew_type, operational_role_id, is_login_enabled, role, is_active, force_password_reset, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, true, $11, NOW(), NOW())
       RETURNING id, name, email, phone, nickname, job_title, profile_photo, crew_type, operational_role_id, is_login_enabled, is_active, force_password_reset, created_at`,
      [
        finalName,
        finalEmail,
        finalPhone,
        nickname ? String(nickname).trim() : null,
        job_title ? String(job_title).trim() : null,
        profile_photo ? String(profile_photo) : null,
        finalCrewType,
        finalOperationalRoleId,
        loginEnabled,
        legacyRole,
        hashPassword(defaultPassword),
      ]
    )
    const row = res.rows[0]

    if (rolesList.length) {
      const roleRows = await pool.query(
        `SELECT id, key FROM roles WHERE key = ANY($1::text[])`,
        [rolesList]
      )
      if (roleRows.rows.length !== rolesList.length) {
        return reply.code(400).send({ error: 'One or more roles are invalid' })
      }
      for (const roleRow of roleRows.rows) {
        await pool.query(
          `INSERT INTO user_roles (user_id, role_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [row.id, roleRow.id]
        )
      }
    }

    const final = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.phone,
         u.nickname,
         u.job_title,
         u.profile_photo,
         u.crew_type,
         u.operational_role_id,
         u.is_login_enabled,
         u.is_active,
         u.force_password_reset,
         u.created_at,
         COALESCE(array_remove(array_agg(r.key), NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [row.id]
    )
    const created = final.rows[0]
    await logAdminAudit(req, 'create', 'user', created.id, null, created, auth.sub)
    return created
  })

  api.patch('/admin/users/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { id } = req.params
    const cur = await pool.query(
      `SELECT id, name, email, phone, nickname, job_title, profile_photo, crew_type, operational_role_id, is_login_enabled, role, is_active, force_password_reset
       FROM users WHERE id=$1`,
      [id]
    )
    if (!cur.rows.length) return reply.code(404).send({ error: 'User not found' })
    const existing = cur.rows[0]
    if (isProtectedAdminUser(existing)) {
      const editorEmail = String(auth?.email || '').trim().toLowerCase()
      if (editorEmail !== PROTECTED_ADMIN_EMAIL) {
        return reply.code(403).send({ error: 'Only Dushyant Saini can edit this profile' })
      }
    }
    const {
      name,
      email,
      phone,
      nickname,
      job_title,
      profile_photo,
      crew_type,
      operational_role_id,
      is_login_enabled,
      roles,
      is_active,
    } = req.body || {}

    const finalName = name != null ? String(name).trim() : existing.name
    if (!finalName) return reply.code(400).send({ error: 'Name is required' })

    const finalEmail = email != null ? normalizeUserEmail(email) : existing.email
    const finalPhone = phone != null ? normalizeUserPhone(phone) : existing.phone
    if (!finalPhone) {
      return reply.code(400).send({ error: 'Phone is required (10 digits or +91XXXXXXXXXX)' })
    }

    const uniquenessError = await ensureUniqueUserFields({
      email: finalEmail,
      phone: finalPhone,
      excludeId: id,
    })
    if (uniquenessError) return reply.code(400).send({ error: uniquenessError })

    const rolesList = Array.isArray(roles) ? roles.map(r => String(r)) : null
    const existingRolesRes = await pool.query(
      `SELECT r.key
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [id]
    )
    const existingRoles = existingRolesRes.rows.map(row => row.key)
    const nextRoles = rolesList ?? existingRoles
    if (!nextRoles.length) {
      return reply.code(400).send({ error: 'At least one role is required' })
    }
    if (isProtectedAdminUser(existing) && !nextRoles.includes('admin')) {
      return reply.code(400).send({ error: 'Admin role cannot be removed for this user' })
    }
    if (isProtectedAdminUser(existing) && is_active === false) {
      return reply.code(400).send({ error: 'This user cannot be disabled' })
    }
    const legacyRole = rolesList
      ? (rolesList.includes('admin') ? 'admin' : rolesList.includes('sales') ? 'sales' : rolesList[0] || 'crew')
      : existing.role
    const nextLoginEnabled =
      is_login_enabled == null
        ? existing.is_login_enabled
        : String(is_login_enabled).toLowerCase() === 'true' || is_login_enabled === true
    const nextCrewType = crew_type != null ? String(crew_type).trim() || null : existing.crew_type
    let nextOperationalRoleId = existing.operational_role_id
    if (operational_role_id !== undefined) {
      if (operational_role_id === null || operational_role_id === '') {
        nextOperationalRoleId = null
      } else {
        const parsed = Number(operational_role_id)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return reply.code(400).send({ error: 'Operational role is invalid' })
        }
        const roleRes = await pool.query('SELECT id FROM operational_roles WHERE id=$1', [parsed])
        if (!roleRes.rows.length) {
          return reply.code(400).send({ error: 'Operational role not found' })
        }
        nextOperationalRoleId = parsed
      }
    }
    if (nextRoles.includes('crew') && !nextOperationalRoleId) {
      return reply.code(400).send({ error: 'Operational role is required for crew' })
    }

    const updated = await pool.query(
      `UPDATE users
       SET name=$1,
           email=$2,
           phone=$3,
           nickname=$4,
           job_title=$5,
           profile_photo=$6,
           crew_type=$7,
           operational_role_id=$8,
           is_login_enabled=$9,
           role=$10,
           is_active=$11,
           updated_at=NOW()
       WHERE id=$12
       RETURNING id, name, email, phone, nickname, job_title, profile_photo, crew_type, operational_role_id, is_login_enabled, is_active, force_password_reset, created_at`,
      [
        finalName,
        finalEmail,
        finalPhone,
        nickname != null ? String(nickname).trim() : existing.nickname,
        job_title != null ? String(job_title).trim() : existing.job_title,
        profile_photo != null ? String(profile_photo) : existing.profile_photo,
        nextCrewType,
        nextOperationalRoleId,
        nextLoginEnabled,
        legacyRole,
        is_active != null ? Boolean(is_active) : existing.is_active,
        id,
      ]
    )
    const row = updated.rows[0]

    if (rolesList) {
      const roleRows = await pool.query(
        `SELECT id, key FROM roles WHERE key = ANY($1::text[])`,
        [rolesList]
      )
      if (roleRows.rows.length !== rolesList.length) {
        return reply.code(400).send({ error: 'One or more roles are invalid' })
      }
      await pool.query('DELETE FROM user_roles WHERE user_id=$1', [id])
      for (const roleRow of roleRows.rows) {
        await pool.query(
          `INSERT INTO user_roles (user_id, role_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [id, roleRow.id]
        )
      }
    }

    const final = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.phone,
         u.nickname,
         u.job_title,
         u.profile_photo,
         u.crew_type,
         u.operational_role_id,
         u.is_login_enabled,
         u.is_active,
         u.force_password_reset,
         u.created_at,
         COALESCE(array_remove(array_agg(r.key), NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [id]
    )
    const updatedRow = final.rows[0]
    await logAdminAudit(req, 'update', 'user', updatedRow.id, existing, updatedRow, auth.sub)
    return updatedRow
  })

  api.post('/admin/users/:id/reset-password', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { id } = req.params
    const cur = await pool.query(`SELECT id, email, name FROM users WHERE id=$1`, [id])
    if (!cur.rows.length) return reply.code(404).send({ error: 'User not found' })
    if (isProtectedAdminUser(cur.rows[0])) {
      const editorEmail = String(auth?.email || '').trim().toLowerCase()
      if (editorEmail !== PROTECTED_ADMIN_EMAIL) {
        return reply.code(403).send({ error: 'Only Dushyant Saini can reset this password' })
      }
    }
    const defaultPassword = getDefaultPassword()
    if (!defaultPassword) {
      return reply.code(500).send({ error: 'Default password is not configured' })
    }
    await pool.query(
      `UPDATE users SET password_hash=$1, force_password_reset=true, updated_at=NOW() WHERE id=$2`,
      [hashPassword(defaultPassword), id]
    )
    await logAdminAudit(req, 'reset_password', 'user', Number(id), null, { force_password_reset: true }, auth.sub)
    return { success: true }
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
  const parseId = (value) => {
    const num = Number(value)
    if (!Number.isFinite(num) || num <= 0) return null
    return Math.floor(num)
  }

  const parseBool = (value) => {
    if (value === true || value === false) return value
    if (value === 1 || value === 0) return Boolean(value)
    const normalized = String(value || '').trim().toLowerCase()
    if (['1', 'true', 'yes', 'y'].includes(normalized)) return true
    if (['0', 'false', 'no', 'n'].includes(normalized)) return false
    return null
  }

  const normalizeName = (value) => {
    const trimmed = String(value || '').trim()
    return trimmed || null
  }

  const normalizeMoneySourceType = (value) => {
    const type = String(value || '').trim().toUpperCase()
    if (['GST', 'NON_GST', 'CASH', 'PERSONAL'].includes(type)) return type
    return null
  }

  const normalizeDirection = (value) => {
    const dir = String(value || '').trim().toLowerCase()
    return dir === 'in' || dir === 'out' ? dir : null
  }

  const getMonthStart = (value) => {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${year}-${month}-01`
  }

  const withTransaction = async (work) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      try { await client.query('ROLLBACK') } catch (_) { }
      throw err
    } finally {
      client.release()
    }
  }

  const getVendorBillInfo = async (client, billId, excludeTxId = null) => {
    const r = await client.query(
      `
      SELECT
        vb.id,
        vb.status,
        vb.bill_amount,
        COALESCE(paid.total_paid, 0) as total_paid
      FROM vendor_bills vb
      LEFT JOIN (
        SELECT vendor_bill_id, SUM(amount) as total_paid
        FROM finance_transactions
        WHERE vendor_bill_id IS NOT NULL
          AND is_deleted = false
          AND ($2::int IS NULL OR id <> $2)
        GROUP BY vendor_bill_id
      ) paid ON paid.vendor_bill_id = vb.id
      WHERE vb.id = $1
      `,
      [billId, excludeTxId]
    )
    if (!r.rows.length) return null
    const row = r.rows[0]
    return {
      id: row.id,
      status: row.status,
      bill_amount: Number(row.bill_amount),
      total_paid: Number(row.total_paid),
      remaining: Number(row.bill_amount) - Number(row.total_paid || 0),
    }
  }

  const markVendorBillPaidIfComplete = async (client, billId) => {
    const r = await client.query(
      `
      SELECT
        vb.status,
        vb.bill_amount,
        COALESCE(paid.total_paid, 0) as total_paid
      FROM vendor_bills vb
      LEFT JOIN (
        SELECT vendor_bill_id, SUM(amount) as total_paid
        FROM finance_transactions
        WHERE vendor_bill_id = $1 AND is_deleted = false
        GROUP BY vendor_bill_id
      ) paid ON paid.vendor_bill_id = vb.id
      WHERE vb.id = $1
      `,
      [billId]
    )
    if (!r.rows.length) return
    const row = r.rows[0]
    if (row.status !== 'approved') return
    if (Number(row.total_paid || 0) >= Number(row.bill_amount || 0)) {
      await client.query(`UPDATE vendor_bills SET status = 'paid' WHERE id = $1`, [billId])
    }
  }

  const formatFinanceRow = async (id) => {
    const r = await pool.query(
      `
      SELECT
        t.*,
        ms.name AS money_source_name,
        c.name AS category_name,
        l.name AS lead_name,
        l.lead_number AS lead_number
      FROM finance_transactions t
      JOIN money_sources ms ON ms.id = t.money_source_id
      LEFT JOIN finance_categories c ON c.id = t.category_id
      LEFT JOIN leads l ON l.id = t.lead_id
      WHERE t.id = $1
      `,
      [id]
    )
    return r.rows[0] || null
  }

  api.get('/finance/leads/search', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const q = (req.query.q || '').trim()
    if (!q) return []
    const limit = Number(req.query.limit) || 10
    const finalLimit = Math.min(Math.max(limit, 1), 15)

    const isNumeric = /^\\d+$/.test(q)
    let numericCondition = ''
    if (isNumeric) {
      numericCondition = `OR l.id::text ILIKE $1 OR l.lead_number::text ILIKE $1`
    }

    try {
      const r = await pool.query(
        `
          SELECT l.id, l.lead_number, l.name, l.bride_name, l.groom_name, l.phone_primary,
                 (SELECT e.event_date FROM lead_events e WHERE e.lead_id = l.id AND e.event_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date ORDER BY e.event_date ASC LIMIT 1) as next_event_date
          FROM leads l
          WHERE l.status = 'Converted' AND (
            l.name ILIKE $1 OR
            l.bride_name ILIKE $1 OR
            l.groom_name ILIKE $1 OR
            l.phone_primary ILIKE $1 OR
            l.phone_secondary ILIKE $1 OR
            l.bride_phone_primary ILIKE $1 OR
            l.bride_phone_secondary ILIKE $1 OR
            l.groom_phone_primary ILIKE $1 OR
            l.groom_phone_secondary ILIKE $1
            ${numericCondition}
          )
          ORDER BY next_event_date ASC NULLS LAST, l.created_at DESC
          LIMIT $2
          `,
        [`%${q}%`, finalLimit]
      )
      return r.rows
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to search leads' })
    }
  })

  api.get('/finance/money-sources', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const r = await pool.query(
        `SELECT id, name, type, is_active, created_at, updated_at
         FROM money_sources
         ORDER BY name ASC, id ASC`
      )
      return r.rows
    } catch (err) {
      if (err?.code === '42703') {
        const fallback = await pool.query(
          `SELECT id, name, created_at, updated_at
           FROM money_sources
           ORDER BY name ASC, id ASC`
        )
        return fallback.rows
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load money sources' })
    }
  })

  api.post('/finance/money-sources', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const name = normalizeName(req.body?.name)
    if (!name) return reply.code(400).send({ error: 'Name is required' })
    const type = normalizeMoneySourceType(req.body?.type)
    if (!type) return reply.code(400).send({ error: 'Type is required' })
    const isActive = parseBool(req.body?.is_active)
    const activeValue = isActive === null ? true : isActive
    try {
      const r = await pool.query(
        `INSERT INTO money_sources (name, type, is_active)
         VALUES ($1, $2, $3)
         RETURNING id, name, type, is_active, created_at, updated_at`,
        [name, type, activeValue]
      )
      return r.rows[0]
    } catch (err) {
      if (err?.code === '42703') {
        const fallback = await pool.query(
          `INSERT INTO money_sources (name) VALUES ($1) RETURNING id, name, created_at, updated_at`,
          [name]
        )
        return fallback.rows[0]
      }
      if (err?.code === '23505') {
        return reply.code(400).send({ error: 'Money source already exists' })
      }
      if (err?.code === '23514') {
        return reply.code(400).send({ error: 'Invalid money source type' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to add money source' })
    }
  })

  api.patch('/finance/money-sources/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params?.id)
    if (!id) return reply.code(400).send({ error: 'Invalid money source id' })
    const name = normalizeName(req.body?.name)
    const type = normalizeMoneySourceType(req.body?.type)
    const isActive = parseBool(req.body?.is_active)

    const updates = []
    const values = []
    let paramIndex = 1

    if (name) {
      updates.push(`name = $${paramIndex++}`)
      values.push(name)
    }
    if (type) {
      updates.push(`type = $${paramIndex++}`)
      values.push(type)
    }
    if (isActive !== null) {
      updates.push(`is_active = $${paramIndex++}`)
      values.push(isActive)
    }

    if (!updates.length) {
      return reply.code(400).send({ error: 'No fields to update' })
    }

    updates.push('updated_at = NOW()')
    values.push(id)

    try {
      const r = await pool.query(
        `UPDATE money_sources
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, name, type, is_active, created_at, updated_at`,
        values
      )
      if (!r.rows.length) return reply.code(404).send({ error: 'Money source not found' })
      return r.rows[0]
    } catch (err) {
      if (err?.code === '42703') {
        if (!name) return reply.code(400).send({ error: 'Name is required' })
        const fallback = await pool.query(
          `UPDATE money_sources
           SET name = $1, updated_at = NOW()
           WHERE id = $2
           RETURNING id, name, created_at, updated_at`,
          [name, id]
        )
        if (!fallback.rows.length) return reply.code(404).send({ error: 'Money source not found' })
        return fallback.rows[0]
      }
      if (err?.code === '23505') {
        return reply.code(400).send({ error: 'Money source already exists' })
      }
      if (err?.code === '23514') {
        return reply.code(400).send({ error: 'Invalid money source type' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to update money source' })
    }
  })

  api.get('/finance/categories', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const r = await pool.query(
      `SELECT id, name, created_at, updated_at
       FROM finance_categories
       ORDER BY name ASC, id ASC`
    )
    return r.rows
  })

  api.post('/finance/categories', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const name = normalizeName(req.body?.name)
    if (!name) return reply.code(400).send({ error: 'Name is required' })
    const r = await pool.query(
      `INSERT INTO finance_categories (name) VALUES ($1) RETURNING id, name, created_at, updated_at`,
      [name]
    )
    return r.rows[0]
  })

  api.patch('/finance/categories/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params?.id)
    if (!id) return reply.code(400).send({ error: 'Invalid category id' })
    const name = normalizeName(req.body?.name)
    if (!name) return reply.code(400).send({ error: 'Name is required' })
    const r = await pool.query(
      `UPDATE finance_categories
       SET name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, created_at, updated_at`,
      [name, id]
    )
    if (!r.rows.length) return reply.code(404).send({ error: 'Category not found' })
    return r.rows[0]
  })

  api.get('/finance/transactions', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const q = req.query || {}
    const where = []
    const params = []
    const addParam = (value) => {
      params.push(value)
      return `$${params.length}`
    }
    const leadId = parseId(q.lead_id)
    if (leadId) where.push(`t.lead_id = ${addParam(leadId)}`)
    const sourceId = parseId(q.money_source_id)
    if (sourceId) where.push(`t.money_source_id = ${addParam(sourceId)}`)
    const vendorId = parseId(q.vendor_id)
    if (vendorId) where.push(`t.vendor_bill_id IN (SELECT id FROM vendor_bills WHERE vendor_id = ${addParam(vendorId)})`)
    const categoryId = parseId(q.category_id)
    if (categoryId) where.push(`t.category_id = ${addParam(categoryId)}`)
    const dir = normalizeDirection(q.direction)
    if (dir) where.push(`t.direction = ${addParam(dir)}`)
    const overheadFlag = parseBool(q.is_overhead)
    if (overheadFlag !== null) where.push(`t.is_overhead = ${addParam(overheadFlag)}`)
    const includeTransfers = parseBool(q.include_transfers)
    if (includeTransfers !== true) where.push(`t.is_transfer = false`)
    const showDeletedFlag = parseBool(q.show_deleted)
    if (showDeletedFlag !== true) where.push(`t.is_deleted = false`)
    const referenceQuery = q.reference_code ? String(q.reference_code).trim() : ''
    if (referenceQuery) where.push(`t.reference_code ILIKE ${addParam(`%${referenceQuery}%`)}`)

    const dateFrom = normalizeDateValue(q.date_from)
    if (dateFrom) where.push(`t.date >= ${addParam(dateFrom)}`)
    const dateTo = normalizeDateValue(q.date_to)
    if (dateTo) where.push(`t.date <= ${addParam(dateTo)}`)
    const limit = parseId(q.limit)
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const limitClause = limit ? `LIMIT ${addParam(limit)}` : ''
    const r = await pool.query(
      `
      SELECT
        t.*,
        ms.name AS money_source_name,
        c.name AS category_name,
        l.name AS lead_name,
        l.lead_number AS lead_number
      FROM finance_transactions t
      JOIN money_sources ms ON ms.id = t.money_source_id
      LEFT JOIN finance_categories c ON c.id = t.category_id
      LEFT JOIN leads l ON l.id = t.lead_id
      ${whereClause}
      ORDER BY t.date DESC, t.created_at DESC
      ${limitClause}
      `,
      params
    )
    return r.rows
  })

  api.get('/finance/totals', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { group_by } = req.query || {}
    try {
      if (group_by === 'lead') {
        const r = await pool.query(`
          SELECT 
            t.lead_id, 
            l.name AS lead_name, 
            l.lead_number,
            SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE 0 END) as total_in,
            SUM(CASE WHEN t.direction = 'out' THEN t.amount ELSE 0 END) as total_out
          FROM finance_transactions t
          JOIN leads l ON l.id = t.lead_id
          WHERE t.is_deleted = false AND t.is_transfer = false AND t.lead_id IS NOT NULL
          GROUP BY t.lead_id, l.name, l.lead_number
          ORDER BY l.name ASC
        `);
        return r.rows
      } else if (group_by === 'source') {
        const r = await pool.query(`
          SELECT 
            t.money_source_id, 
            ms.name AS source_name,
            SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE 0 END) as total_in,
            SUM(CASE WHEN t.direction = 'out' THEN t.amount ELSE 0 END) as total_out
          FROM finance_transactions t
          JOIN money_sources ms ON ms.id = t.money_source_id
          WHERE t.is_deleted = false AND t.is_transfer = false
          GROUP BY t.money_source_id, ms.name
          ORDER BY ms.name ASC
        `);
        return r.rows
      } else if (group_by === 'month') {
        const r = await pool.query(`
          SELECT 
            TO_CHAR(DATE_TRUNC('month', t.date), 'YYYY-MM') AS month,
            SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE 0 END) as total_in,
            SUM(CASE WHEN t.direction = 'out' THEN t.amount ELSE 0 END) as total_out,
            SUM(CASE WHEN t.transaction_type = 'overhead' AND t.direction = 'in' THEN t.amount ELSE 0 END) as overhead_in,
            SUM(CASE WHEN t.transaction_type = 'overhead' AND t.direction = 'out' THEN t.amount ELSE 0 END) as overhead_out
          FROM finance_transactions t
          WHERE t.is_deleted = false AND t.is_transfer = false
          GROUP BY DATE_TRUNC('month', t.date)
          ORDER BY month DESC
        `);
        return r.rows
      }
      return reply.code(400).send({ error: 'Invalid group_by parameter' })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch totals' })
    }
  })

  api.post('/finance/transactions', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const body = req.body || {}
    const date = normalizeDateValue(body.date)
    if (!date) return reply.code(400).send({ error: 'Valid date is required' })
    const amountNum = Number(body.amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return reply.code(400).send({ error: 'Valid positive amount is required' })
    }
    const direction = normalizeDirection(body.direction)
    if (!direction) return reply.code(400).send({ error: 'Direction in or out is required' })
    const moneySourceId = parseId(body.money_source_id)
    if (!moneySourceId) return reply.code(400).send({ error: 'Money source is required' })
    let leadId = parseId(body.lead_id) || null
    let isOverhead = parseBool(body.is_overhead) || false
    if (!leadId && !isOverhead) {
      return reply.code(400).send({ error: 'Provide a lead or check overhead' })
    }
    if (leadId && isOverhead) {
      return reply.code(400).send({ error: 'Cannot specify both lead and overhead' })
    }
    let categoryId = parseId(body.category_id) || null
    const note = (body.note || '').trim() || null
    const isTransferFlag = parseBool(body.is_transfer)
    if (isTransferFlag) {
      return reply.code(400).send({ error: 'Use transfers endpoint for internal transfers' })
    }

    const vendorBillIdRaw = body.vendor_bill_id
    const vendorBillId = vendorBillIdRaw !== undefined ? parseId(vendorBillIdRaw) : null
    if (vendorBillIdRaw !== undefined && !vendorBillId) {
      return reply.code(400).send({ error: 'Invalid vendor_bill_id' })
    }
    if (body.employee_payout_id !== undefined) {
      return reply.code(400).send({ error: 'employee_payout_id is not supported in finance transactions' })
    }
    if (vendorBillId && direction !== 'out') {
      return reply.code(400).send({ error: 'Only OUT transactions can be linked to vendor bills' })
    }
    if (isOverhead && !categoryId) {
      return reply.code(400).send({ error: 'Category is required for overhead transactions' })
    }

    let transactionType = null
    let referenceBase = null
    if (vendorBillId) {
      transactionType = 'vendor_payment'
      referenceBase = `VENDOR-${vendorBillId}`
    } else if (isOverhead) {
      transactionType = 'overhead'
      referenceBase = `OH-${categoryId}-${formatRefDate(date)}`
    } else if (direction === 'in' && leadId) {
      return reply.code(400).send({ error: 'Use invoice payment flow for client payments' })
    } else {
      return reply.code(400).send({ error: 'Unsupported transaction type' })
    }

    try {
      if (vendorBillId) {
        const dupR = await pool.query(
          `
          SELECT 1
          FROM finance_transactions
          WHERE vendor_bill_id = $1
            AND amount = $2
            AND date = $3
            AND is_deleted = false
          LIMIT 1
          `,
          [vendorBillId, amountNum, date]
        )
        if (dupR.rows.length) {
          return reply.code(400).send({ error: 'Duplicate vendor payment detected' })
        }
      }

      const result = await withTransaction(async (client) => {
        if (vendorBillId) {
          const billInfo = await getVendorBillInfo(client, vendorBillId, null)
          if (!billInfo) throw { code: 'BILL_NOT_FOUND' }
          if (billInfo.status !== 'approved') throw { code: 'BILL_NOT_APPROVED' }
          if (amountNum > billInfo.remaining) throw { code: 'BILL_AMOUNT_EXCEEDS' }
        }
        const r = await client.query(
          `INSERT INTO finance_transactions (date, amount, direction, money_source_id, lead_id, is_overhead, category_id, note, vendor_bill_id, transaction_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [date, amountNum, direction, moneySourceId, leadId, isOverhead, categoryId, note, vendorBillId || null, transactionType]
        )
        const tx = r.rows[0]

        if (referenceBase) {
          await assignReferenceCode(client, tx.id, referenceBase)
        }

        if (vendorBillId) {
          await client.query(
            `INSERT INTO finance_transaction_audits (transaction_id, field, old_value, new_value, edited_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [tx.id, 'vendor_bill_id', null, String(vendorBillId), auth.user.id]
          )
          await markVendorBillPaidIfComplete(client, vendorBillId)

          const billVendorRes = await client.query('SELECT vendor_id FROM vendor_bills WHERE id = $1', [vendorBillId])
          if (billVendorRes.rows.length) {
            await createNotification({
              userId: billVendorRes.rows[0].vendor_id,
              title: 'Payment Recorded 💸',
              message: `A payment of ₹${amountNum} was recorded for your bill.`,
              category: 'VENDOR',
              type: 'SUCCESS',
              linkUrl: '/vendor/payments'
            }, client)
          }
        }

        return tx
      })

      void recalculateAccountBalances()
      return result
    } catch (err) {
      if (err?.code === '23503') {
        return reply.code(400).send({ error: 'Invalid money source, category, or lead' })
      }
      if (err?.code === '23514') {
        return reply.code(400).send({ error: 'Lead and overhead selection is invalid' })
      }
      if (err?.code === 'BILL_NOT_FOUND') {
        return reply.code(404).send({ error: 'Bill not found' })
      }
      if (err?.code === 'BILL_NOT_APPROVED') {
        return reply.code(400).send({ error: 'Bill must be approved before linking' })
      }
      if (err?.code === 'BILL_AMOUNT_EXCEEDS') {
        return reply.code(400).send({ error: 'Amount exceeds remaining bill amount' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to create transaction' })
    }
  })

  api.patch('/finance/transactions/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params?.id)
    if (!id) return reply.code(400).send({ error: 'Invalid transaction id' })

    const body = req.body || {}
    const amountNum = body.amount !== undefined ? Number(body.amount) : undefined
    if (amountNum !== undefined && (!Number.isFinite(amountNum) || amountNum <= 0)) {
      return reply.code(400).send({ error: 'Valid positive amount is required' })
    }
    if (body.vendor_bill_id !== undefined || body.employee_payout_id !== undefined) {
      return reply.code(400).send({ error: 'Editing bill/payout links is not supported' })
    }
    let categoryId = body.category_id !== undefined ? (parseId(body.category_id) || null) : undefined
    let note = body.note !== undefined ? ((body.note || '').trim() || null) : undefined

    try {
      const result = await withTransaction(async (client) => {
        const currentTx = await client.query(
          `SELECT * FROM finance_transactions WHERE id = $1 AND is_deleted = false FOR UPDATE`,
          [id]
        )
        if (!currentTx.rows.length) {
          const err = new Error('Not found')
          err.code = 'TX_NOT_FOUND'
          throw err
        }

        const oldValues = currentTx.rows[0]
        if (oldValues.is_transfer) {
          const err = new Error('Transfer transactions cannot be edited')
          err.code = 'TX_IS_TRANSFER'
          throw err
        }
        const oldAmount = Number(oldValues.amount)
        const nextAmount = amountNum !== undefined ? amountNum : oldAmount

        const updates = []
        const values = []
        const audits = []

        if (amountNum !== undefined && amountNum !== oldAmount) {
          audits.push({ field: 'amount', old: String(oldValues.amount), new: String(amountNum) })
          values.push(amountNum)
          updates.push(`amount = $${values.length}`)
        }
        if (categoryId !== undefined && categoryId !== oldValues.category_id) {
          audits.push({ field: 'category_id', old: oldValues.category_id !== null ? String(oldValues.category_id) : 'null', new: categoryId !== null ? String(categoryId) : 'null' })
          values.push(categoryId)
          updates.push(`category_id = $${values.length}`)
        }
        if (note !== undefined && note !== oldValues.note) {
          audits.push({ field: 'note', old: oldValues.note || 'null', new: note || 'null' })
          values.push(note)
          updates.push(`note = $${values.length}`)
        }

        if (oldValues.vendor_bill_id) {
          const billInfo = await getVendorBillInfo(client, oldValues.vendor_bill_id, id)
          if (billInfo && nextAmount > billInfo.remaining) {
            const err = new Error('Amount exceeds remaining')
            err.code = 'BILL_AMOUNT_EXCEEDS'
            throw err
          }
        }

        if (updates.length) {
          values.push(id)
          values.push(auth.user.id)
          updates.push(`updated_at = NOW()`)
          updates.push(`updated_by = $${values.length}`)

          await client.query(
            `UPDATE finance_transactions
             SET ${updates.join(', ')}
             WHERE id = $${values.length - 1}`,
            values
          )
        }

        if (oldValues.vendor_bill_id) {
          await markVendorBillPaidIfComplete(client, oldValues.vendor_bill_id)
        }

        for (const audit of audits) {
          await client.query(
            `INSERT INTO finance_transaction_audits (transaction_id, field, old_value, new_value, edited_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, audit.field, audit.old, audit.new, auth.user.id]
          )
        }

        const refreshed = await client.query(`SELECT * FROM finance_transactions WHERE id = $1`, [id])
        return refreshed.rows[0]
      })

      return result
    } catch (err) {
      if (err?.code === 'TX_NOT_FOUND') {
        return reply.code(404).send({ error: 'Transaction not found or deleted' })
      }
      if (err?.code === 'TX_IS_TRANSFER') {
        return reply.code(400).send({ error: 'Transfer transactions cannot be edited' })
      }
      if (err?.code === 'BILL_NOT_FOUND') {
        return reply.code(404).send({ error: 'Bill not found' })
      }
      if (err?.code === 'BILL_NOT_APPROVED') {
        return reply.code(400).send({ error: 'Bill must be approved before linking' })
      }
      if (err?.code === 'BILL_AMOUNT_EXCEEDS') {
        return reply.code(400).send({ error: 'Amount exceeds remaining bill amount' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to update transaction' })
    }
  })

  api.delete('/finance/transactions/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params?.id)
    if (!id) return reply.code(400).send({ error: 'Invalid transaction id' })

    try {
      const existing = await pool.query(`SELECT id, is_transfer FROM finance_transactions WHERE id = $1`, [id])
      if (!existing.rows.length) return reply.code(404).send({ error: 'Transaction not found' })
      if (existing.rows[0].is_transfer) {
        return reply.code(400).send({ error: 'Use transfer delete for transfer transactions' })
      }
      const r = await pool.query(
        `UPDATE finance_transactions 
         SET is_deleted = true, updated_at = NOW(), updated_by = $1
         WHERE id = $2
         RETURNING id, is_deleted`,
        [auth.user.id, id]
      )
      if (!r.rows.length) return reply.code(404).send({ error: 'Transaction not found' })
      void recalculateAccountBalances()
      return { success: true }
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to delete transaction' })
    }
  })

  /* ===================== FINANCE — ACCOUNT TRANSFERS v1 ===================== */

  api.post('/finance/transfers', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const body = req.body || {}
    const fromId = parseId(body.from_money_source_id)
    const toId = parseId(body.to_money_source_id)
    if (!fromId || !toId) return reply.code(400).send({ error: 'From and To money sources are required' })
    if (fromId === toId) return reply.code(400).send({ error: 'From and To money sources must differ' })
    const amountNum = Number(body.amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return reply.code(400).send({ error: 'Valid positive amount is required' })
    }
    const date = normalizeDateValue(body.date)
    if (!date) return reply.code(400).send({ error: 'Valid date is required' })
    const note = (body.note || '').trim() || null

    try {
      const result = await withTransaction(async (client) => {
        const fromR = await client.query(`SELECT id, name FROM money_sources WHERE id = $1`, [fromId])
        if (!fromR.rows.length) throw { code: 'SOURCE_NOT_FOUND' }
        const toR = await client.query(`SELECT id, name FROM money_sources WHERE id = $1`, [toId])
        if (!toR.rows.length) throw { code: 'DEST_NOT_FOUND' }

        const transferGroupId = crypto.randomUUID()

        const outNote = note ? `Transfer to ${toR.rows[0].name} — ${note}` : `Transfer to ${toR.rows[0].name}`
        const inNote = note ? `Transfer from ${fromR.rows[0].name} — ${note}` : `Transfer from ${fromR.rows[0].name}`

        const outR = await client.query(
          `INSERT INTO finance_transactions
            (date, amount, direction, money_source_id, lead_id, is_overhead, category_id, note, is_transfer, transfer_group_id, transaction_type)
           VALUES ($1, $2, 'out', $3, NULL, false, NULL, $4, true, $5, 'transfer')
           RETURNING id`,
          [date, amountNum, fromId, outNote, transferGroupId]
        )
        const inR = await client.query(
          `INSERT INTO finance_transactions
            (date, amount, direction, money_source_id, lead_id, is_overhead, category_id, note, is_transfer, transfer_group_id, transaction_type)
           VALUES ($1, $2, 'in', $3, NULL, false, NULL, $4, true, $5, 'transfer')
           RETURNING id`,
          [date, amountNum, toId, inNote, transferGroupId]
        )

        await assignReferenceCode(client, outR.rows[0].id, `TR-${transferGroupId}`)
        await assignReferenceCode(client, inR.rows[0].id, `TR-${transferGroupId}`)

        const checkR = await client.query(
          `
          SELECT COUNT(*)::int as count
          FROM finance_transactions
          WHERE transfer_group_id = $1 AND is_transfer = true
          `,
          [transferGroupId]
        )
        if (Number(checkR.rows[0]?.count || 0) !== 2) {
          throw { code: 'TRANSFER_COUNT_MISMATCH' }
        }

        return {
          transfer_group_id: transferGroupId,
          from_account: fromR.rows[0],
          to_account: toR.rows[0],
          transaction_ids: [outR.rows[0].id, inR.rows[0].id]
        }
      })

      await logAdminAudit(
        req,
        'create',
        'finance_transfer',
        null,
        null,
        {
          transfer_group_id: result.transfer_group_id,
          from_money_source_id: fromId,
          to_money_source_id: toId,
          amount: amountNum,
          date,
          note,
          transaction_ids: result.transaction_ids
        },
        auth.sub
      )

      void recalculateAccountBalances()
      return reply.send({
        transfer_group_id: result.transfer_group_id,
        date,
        amount: amountNum,
        note,
        from_account: result.from_account.name,
        to_account: result.to_account.name,
        transaction_ids: result.transaction_ids
      })
    } catch (err) {
      if (err?.code === 'SOURCE_NOT_FOUND') {
        return reply.code(404).send({ error: 'From money source not found' })
      }
      if (err?.code === 'DEST_NOT_FOUND') {
        return reply.code(404).send({ error: 'To money source not found' })
      }
      if (err?.code === '23503') {
        return reply.code(400).send({ error: 'Invalid money source reference' })
      }
      if (err?.code === '23514') {
        return reply.code(400).send({ error: 'Transfer violates finance transaction rules. Ensure transfers migration is applied.' })
      }
      if (err?.code === 'TRANSFER_COUNT_MISMATCH') {
        return reply.code(500).send({ error: 'Transfer integrity check failed' })
      }
      if (err?.code === '42703') {
        return reply.code(500).send({ error: 'Transfer columns missing. Apply finance transfers migration.' })
      }
      console.error('TRANSFER ERROR:', err)
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to create transfer' })
    }
  })

  api.get('/finance/transfers', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const { rows } = await pool.query(
        `
        SELECT
          t.transfer_group_id,
          MAX(t.date)::date as date,
          MAX(t.amount) as amount,
          MAX(t.note) as note,
          MAX(CASE WHEN t.direction = 'out' THEN ms.name END) as from_account,
          MAX(CASE WHEN t.direction = 'in' THEN ms.name END) as to_account,
          MAX(t.created_at) as created_at,
          creator.user_id as created_by,
          creator.user_name as created_by_name
        FROM finance_transactions t
        JOIN money_sources ms ON ms.id = t.money_source_id
        LEFT JOIN LATERAL (
          SELECT aal.user_id, u.name as user_name
          FROM admin_audit_log aal
          LEFT JOIN users u ON u.id = aal.user_id
          WHERE aal.entity_type = 'finance_transfer'
            AND aal.action = 'create'
            AND (aal.after_data->>'transfer_group_id') = t.transfer_group_id
          ORDER BY aal.created_at DESC
          LIMIT 1
        ) creator ON true
        WHERE t.is_deleted = false
          AND t.is_transfer = true
          AND t.transfer_group_id IS NOT NULL
        GROUP BY t.transfer_group_id, creator.user_id, creator.user_name
        ORDER BY date DESC, created_at DESC
        `
      )
      return rows
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load transfers' })
    }
  })

  api.get('/finance/transfers/:groupId', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const groupId = String(req.params?.groupId || '').trim()
    if (!groupId) return reply.code(400).send({ error: 'Invalid transfer group id' })
    try {
      const { rows } = await pool.query(
        `
        SELECT
          t.id,
          t.date,
          t.amount,
          t.direction,
          t.note,
          t.created_at,
          ms.id as money_source_id,
          ms.name as money_source_name
        FROM finance_transactions t
        JOIN money_sources ms ON ms.id = t.money_source_id
        WHERE t.transfer_group_id = $1
          AND t.is_transfer = true
          AND t.is_deleted = false
        ORDER BY t.direction DESC, t.id ASC
        `,
        [groupId]
      )
      if (!rows.length) return reply.code(404).send({ error: 'Transfer not found' })

      const audit = await pool.query(
        `
        SELECT aal.user_id, u.name as user_name, aal.created_at
        FROM admin_audit_log aal
        LEFT JOIN users u ON u.id = aal.user_id
        WHERE aal.entity_type = 'finance_transfer'
          AND aal.action = 'create'
          AND (aal.after_data->>'transfer_group_id') = $1
        ORDER BY aal.created_at DESC
        LIMIT 1
        `,
        [groupId]
      )

      const meta = audit.rows[0] || null
      const date = rows[0].date
      const amount = rows[0].amount
      const note = rows[0].note
      const fromLeg = rows.find(r => r.direction === 'out') || null
      const toLeg = rows.find(r => r.direction === 'in') || null

      return reply.send({
        transfer_group_id: groupId,
        date,
        amount,
        note,
        from_account: fromLeg?.money_source_name || null,
        to_account: toLeg?.money_source_name || null,
        created_by: meta ? { user_id: meta.user_id, user_name: meta.user_name, created_at: meta.created_at } : null,
        legs: rows
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load transfer' })
    }
  })

  api.delete('/finance/transfers/:groupId', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const groupId = String(req.params?.groupId || '').trim()
    if (!groupId) return reply.code(400).send({ error: 'Invalid transfer group id' })
    const deleteReason = (req.body?.delete_reason || '').trim()
    if (!deleteReason) return reply.code(400).send({ error: 'delete_reason is required' })

    try {
      const result = await withTransaction(async (client) => {
        const existing = await client.query(
          `SELECT id FROM finance_transactions
           WHERE transfer_group_id = $1 AND is_transfer = true AND is_deleted = false`,
          [groupId]
        )
        if (!existing.rows.length) throw { code: 'NOT_FOUND' }

        const ids = existing.rows.map(r => r.id)

        await client.query(
          `UPDATE finance_transactions
           SET is_deleted = true, updated_at = NOW(), updated_by = $1
           WHERE transfer_group_id = $2 AND is_transfer = true`,
          [auth.user.id, groupId]
        )

        return ids
      })

      await logAdminAudit(
        req,
        'delete',
        'finance_transfer',
        null,
        { transfer_group_id: groupId, transaction_ids: result, delete_reason: deleteReason },
        null,
        auth.user.id
      )

      void recalculateAccountBalances()
      return reply.send({ success: true })
    } catch (err) {
      if (err?.code === 'NOT_FOUND') {
        return reply.code(404).send({ error: 'Transfer not found' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to delete transfer' })
    }
  })

  /* ===================== FINANCE — ACCOUNT BALANCES v1 ===================== */

  api.get('/finance/balances', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const asOf = normalizeDateValue(req.query?.as_of) || dateToYMD(new Date())
    const today = dateToYMD(new Date())
    try {
      if (asOf === today) {
        try {
          const { rows } = await pool.query(
            `
            SELECT
              ms.id as money_source_id,
              ms.name,
              ms.type as account_type,
              COALESCE(fab.balance, 0) as balance,
              (
                SELECT MAX(t.date)
                FROM finance_transactions t
                WHERE t.money_source_id = ms.id
                  AND t.is_deleted = false
                  AND t.date <= $1
              ) as last_transaction_date
            FROM money_sources ms
            LEFT JOIN finance_account_balances fab ON fab.money_source_id = ms.id
            ORDER BY balance DESC, ms.name ASC
            `,
            [asOf]
          )
          return rows
        } catch (err) {
          if (err?.code !== '42P01') throw err
        }
      }
      const queryWithType = `
        SELECT
          ms.id as money_source_id,
          ms.name,
          ms.type as account_type,
          COALESCE(SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE -t.amount END), 0) as balance,
          MAX(t.date) as last_transaction_date
        FROM money_sources ms
        LEFT JOIN finance_transactions t
          ON t.money_source_id = ms.id
         AND t.is_deleted = false
         AND t.date <= $1
        GROUP BY ms.id, ms.name, ms.type
        ORDER BY balance DESC, ms.name ASC
      `
      const { rows } = await pool.query(queryWithType, [asOf])
      return rows
    } catch (err) {
      if (err?.code === '42703') {
        const fallback = await pool.query(
          `
          SELECT
            ms.id as money_source_id,
            ms.name,
            NULL::text as account_type,
            COALESCE(SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE -t.amount END), 0) as balance,
            MAX(t.date) as last_transaction_date
          FROM money_sources ms
          LEFT JOIN finance_transactions t
            ON t.money_source_id = ms.id
           AND t.is_deleted = false
           AND t.date <= $1
          GROUP BY ms.id, ms.name
          ORDER BY balance DESC, ms.name ASC
          `,
          [asOf]
        )
        return fallback.rows
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load balances' })
    }
  })

  api.get('/finance/balances/:money_source_id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const sourceId = parseId(req.params?.money_source_id)
    if (!sourceId) return reply.code(400).send({ error: 'Invalid money source id' })
    const fromDate = normalizeDateValue(req.query?.from_date)
    const toDate = normalizeDateValue(req.query?.to_date)
    const where = ['t.money_source_id = $1', 't.is_deleted = false']
    const params = [sourceId]
    if (fromDate) {
      params.push(fromDate)
      where.push(`t.date >= $${params.length}`)
    }
    if (toDate) {
      params.push(toDate)
      where.push(`t.date <= $${params.length}`)
    }
    try {
      let accountRow = null
      try {
        const accountR = await pool.query(
          `SELECT id, name, type FROM money_sources WHERE id = $1`,
          [sourceId]
        )
        if (!accountR.rows.length) return reply.code(404).send({ error: 'Money source not found' })
        accountRow = accountR.rows[0]
      } catch (err) {
        if (err?.code === '42703') {
          const fallback = await pool.query(
            `SELECT id, name FROM money_sources WHERE id = $1`,
            [sourceId]
          )
          if (!fallback.rows.length) return reply.code(404).send({ error: 'Money source not found' })
          accountRow = { ...fallback.rows[0], type: null }
        } else {
          throw err
        }
      }

      const ledgerR = await pool.query(
        `
        SELECT
          t.id,
          t.date,
          t.direction,
          t.amount,
          t.note,
          t.is_transfer,
          t.transfer_group_id,
          t.created_at,
          cp.name as counterparty_name
        FROM finance_transactions t
        LEFT JOIN finance_transactions t2
          ON t.is_transfer = true
         AND t.transfer_group_id IS NOT NULL
         AND t2.transfer_group_id = t.transfer_group_id
         AND t2.money_source_id <> t.money_source_id
         AND t2.is_deleted = false
        LEFT JOIN money_sources cp ON cp.id = t2.money_source_id
        WHERE ${where.join(' AND ')}
        ORDER BY t.date ASC, t.created_at ASC, t.id ASC
        `,
        params
      )

      let running = 0
      const ledger = ledgerR.rows.map(row => {
        const amt = Number(row.amount || 0)
        if (row.direction === 'in') running += amt
        else running -= amt
        return {
          date: row.date,
          direction: row.direction,
          amount: row.amount,
          note: row.note,
          is_transfer: row.is_transfer,
          transfer_group_id: row.transfer_group_id,
          counterparty_name: row.counterparty_name,
          running_balance: running
        }
      })

      return {
        account: {
          money_source_id: accountRow.id,
          name: accountRow.name,
          account_type: accountRow.type || null
        },
        ledger
      }
    } catch (err) {
      if (err?.code === '42703') {
        req.log.error(err)
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load ledger' })
    }
  })

  api.get('/finance/ledger-audit', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const missingTypeR = await pool.query(
        `SELECT COUNT(*)::int as count FROM finance_transactions WHERE is_deleted = false AND transaction_type IS NULL`
      )

      const orphanR = await pool.query(
        `
        SELECT COUNT(*)::int as count
        FROM finance_transactions
        WHERE is_deleted = false
          AND (
            transaction_type IS NULL
            OR (transaction_type = 'invoice_payment' AND lead_id IS NULL)
            OR (transaction_type = 'vendor_payment' AND vendor_bill_id IS NULL)
            OR (transaction_type = 'payroll' AND user_id IS NULL)
            OR (transaction_type = 'overhead' AND (is_overhead = false OR category_id IS NULL))
            OR (transaction_type = 'transfer' AND transfer_group_id IS NULL)
          )
        `
      )

      const duplicateInvoiceR = await pool.query(
        `
        SELECT ip.invoice_id, ft.date, ft.amount, COUNT(*)::int as count
        FROM invoice_payments ip
        JOIN finance_transactions ft ON ft.id = ip.finance_transaction_id
        WHERE ft.is_deleted = false
        GROUP BY ip.invoice_id, ft.date, ft.amount
        HAVING COUNT(*) > 1
        ORDER BY count DESC, ft.date DESC
        LIMIT 20
        `
      )

      const duplicateVendorR = await pool.query(
        `
        SELECT vendor_bill_id, date, amount, COUNT(*)::int as count
        FROM finance_transactions
        WHERE vendor_bill_id IS NOT NULL
          AND is_deleted = false
        GROUP BY vendor_bill_id, date, amount
        HAVING COUNT(*) > 1
        ORDER BY count DESC, date DESC
        LIMIT 20
        `
      )

      const transferMismatchR = await pool.query(
        `
        SELECT transfer_group_id, COUNT(*)::int as count
        FROM finance_transactions
        WHERE is_transfer = true
          AND is_deleted = false
          AND transfer_group_id IS NOT NULL
        GROUP BY transfer_group_id
        HAVING COUNT(*) != 2
        ORDER BY count DESC
        LIMIT 20
        `
      )

      return reply.send({
        missing_transaction_type: missingTypeR.rows[0]?.count || 0,
        orphan_transactions: orphanR.rows[0]?.count || 0,
        duplicate_invoice_payments: duplicateInvoiceR.rows || [],
        duplicate_vendor_payments: duplicateVendorR.rows || [],
        transfer_group_mismatches: transferMismatchR.rows || [],
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to run ledger audit' })
    }
  })

  /* ===================== FINANCE v1 INVOICES ===================== */

  const generateInvoiceNumber = async (client = pool) => {
    // Basic format: INV-YYYYMMDD-XXXX
    const dateStr = dateToYMD(new Date()).replace(/-/g, '')
    const prefix = `INV-${dateStr}-`
    const r = await client.query(
      `SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1 ORDER BY invoice_number DESC LIMIT 1`,
      [`${prefix}%`]
    )
    let nextNum = 1
    if (r.rows.length > 0) {
      const lastNum = parseInt(r.rows[0].invoice_number.split('-')[2], 10)
      if (!isNaN(lastNum)) nextNum = lastNum + 1
    }
    return `${prefix}${String(nextNum).padStart(4, '0')}`
  }

  api.get('/finance/invoices', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const leadId = parseId(req.query.lead_id)
    const status = req.query.status ? String(req.query.status) : null

    let query = `
      SELECT i.*, 
             l.name as lead_name, 
             l.lead_number,
             COALESCE((SELECT SUM(amount_applied) FROM invoice_payments WHERE invoice_id = i.id), 0) as paid_amount
      FROM invoices i
      JOIN leads l ON l.id = i.lead_id
      WHERE 1=1
    `
    const params = []

    if (leadId) {
      params.push(leadId)
      query += ` AND i.lead_id = $${params.length}`
    }
    if (status) {
      params.push(status)
      query += ` AND i.status = $${params.length}`
    }

    query += ` ORDER BY i.created_at DESC`

    try {
      const r = await pool.query(query, params)
      return r.rows
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch invoices' })
    }
  })

  api.get('/finance/invoices/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid invoice id' })

    try {
      const invR = await pool.query(
        `SELECT i.*, l.name as lead_name, l.lead_number 
         FROM invoices i JOIN leads l ON l.id = i.lead_id 
         WHERE i.id = $1`,
        [id]
      )
      if (!invR.rows.length) return reply.code(404).send({ error: 'Invoice not found' })
      const invoice = invR.rows[0]

      const itemsR = await pool.query(`SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY id ASC`, [id])
      invoice.line_items = itemsR.rows

      const paymentsR = await pool.query(
        `SELECT ip.*, ft.date as transaction_date, ft.amount as transaction_amount, ms.name as money_source_name
         FROM invoice_payments ip
         JOIN finance_transactions ft ON ft.id = ip.finance_transaction_id
         LEFT JOIN money_sources ms ON ms.id = ft.money_source_id
         WHERE ip.invoice_id = $1
         ORDER BY ip.created_at ASC`,
        [id]
      )
      invoice.payments = paymentsR.rows

      if (invoice.payment_structure_id) {
        const stepsR = await pool.query(
          `SELECT * FROM payment_structure_steps WHERE payment_structure_id = $1 ORDER BY step_order ASC`,
          [invoice.payment_structure_id]
        )
        invoice.payment_steps = stepsR.rows
      }

      const scheduleR = await pool.query(
        `SELECT id, invoice_id, label, percentage, amount, due_date, step_order
         FROM invoice_payment_schedule
         WHERE invoice_id = $1
         ORDER BY step_order ASC, id ASC`,
        [id]
      )
      invoice.payment_schedule = scheduleR.rows

      return invoice
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch invoice details' })
    }
  })

  api.put('/finance/invoices/:id/schedule', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid invoice id' })

    const scheduleInput = Array.isArray(req.body?.schedule) ? req.body.schedule : []
    if (scheduleInput.length === 0) {
      return reply.code(400).send({ error: 'Schedule is required' })
    }

    try {
      const invR = await pool.query(`SELECT id, total_amount, status FROM invoices WHERE id = $1`, [id])
      if (!invR.rows.length) return reply.code(404).send({ error: 'Invoice not found' })
      if (invR.rows[0].status === 'cancelled') {
        return reply.code(400).send({ error: 'Cannot update schedule for cancelled invoice' })
      }

      const totalAmount = Number(invR.rows[0].total_amount || 0)

      const normalized = scheduleInput.map((item, index) => {
        const dueDate = normalizeDateValue(item?.due_date)
        if (!dueDate) throw new Error('Each schedule item must have a due_date')
        const percentageRaw = item?.percentage
        const amountRaw = item?.amount
        const percentage = percentageRaw !== undefined && percentageRaw !== null && percentageRaw !== '' ? Number(percentageRaw) : null
        let amount = amountRaw !== undefined && amountRaw !== null && amountRaw !== '' ? Number(amountRaw) : null
        if (amount === null) {
          if (!percentage || !Number.isFinite(percentage)) {
            throw new Error('Each schedule item must have amount or percentage')
          }
          amount = (percentage / 100) * totalAmount
        }
        if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid schedule amount')
        const stepOrder = Number.isFinite(Number(item?.step_order)) ? Number(item.step_order) : index + 1
        return {
          label: item?.label ? String(item.label).trim() : null,
          percentage: Number.isFinite(percentage) ? percentage : null,
          amount,
          due_date: dueDate,
          step_order: stepOrder
        }
      })

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(`DELETE FROM invoice_payment_schedule WHERE invoice_id = $1`, [id])
        for (const row of normalized) {
          await client.query(
            `INSERT INTO invoice_payment_schedule (invoice_id, label, percentage, amount, due_date, step_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, row.label, row.percentage, row.amount, row.due_date, row.step_order]
          )
        }
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      return reply.send({ schedule: normalized })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: err.message || 'Failed to update schedule' })
    }
  })

  api.post('/finance/invoices', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const body = req.body || {}

    const leadId = parseId(body.lead_id)
    if (!leadId) return reply.code(400).send({ error: 'Lead ID is required' })

    const invoiceType = ['gst', 'non_gst'].includes(body.invoice_type) ? body.invoice_type : 'non_gst'
    const issueDate = normalizeDateValue(body.issue_date) || normalizeDateValue(new Date())
    const dueDate = normalizeDateValue(body.due_date)
    const notes = (body.notes || '').trim() || null
    const lineItems = Array.isArray(body.line_items) ? body.line_items : []
    const scheduleInput = Array.isArray(body.payment_schedule) ? body.payment_schedule : []

    let subtotal = 0
    let taxAmount = Number(body.tax_amount) || 0
    let totalAmount = Number(body.total_amount) || 0

    // Compute basic totals safely, totalAmount is authoritative
    lineItems.forEach(item => {
      const qty = Number(item.quantity) || 1
      const price = Number(item.unit_price) || 0
      subtotal += (qty * price)
    })

    if (!body.total_amount) {
      // Auto-compute but respect frontend override
      totalAmount = subtotal + taxAmount
    }

    let client
    try {
      client = await pool.connect()
      await client.query('BEGIN')

      // Auto-fetch default payment structure
      let paymentStructureId = null;
      const defaultStruct = await client.query(`SELECT id FROM payment_structures WHERE is_default = true LIMIT 1`)
      if (defaultStruct.rows.length) {
        paymentStructureId = defaultStruct.rows[0].id
      }

      const invoiceNumber = await generateInvoiceNumber(client)

      const r = await client.query(
        `INSERT INTO invoices (invoice_number, lead_id, invoice_type, payment_structure_id, subtotal, tax_amount, total_amount, status, issue_date, due_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9, $10)
         RETURNING *`,
        [invoiceNumber, leadId, invoiceType, paymentStructureId, subtotal, taxAmount, totalAmount, issueDate, dueDate, notes]
      )
      const newInvoice = r.rows[0]

      const scheduleRows = []
      if (scheduleInput.length > 0) {
        scheduleInput.forEach((item, index) => {
          const due = normalizeDateValue(item?.due_date)
          if (!due) throw new Error('Each schedule item must have a due_date')
          const percentageRaw = item?.percentage
          const amountRaw = item?.amount
          const percentage = percentageRaw !== undefined && percentageRaw !== null && percentageRaw !== '' ? Number(percentageRaw) : null
          let amount = amountRaw !== undefined && amountRaw !== null && amountRaw !== '' ? Number(amountRaw) : null
          if (amount === null) {
            if (!percentage || !Number.isFinite(percentage)) {
              throw new Error('Each schedule item must have amount or percentage')
            }
            amount = (percentage / 100) * totalAmount
          }
          if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid schedule amount')
          const stepOrder = Number.isFinite(Number(item?.step_order)) ? Number(item.step_order) : index + 1
          scheduleRows.push({
            label: item?.label ? String(item.label).trim() : null,
            percentage: Number.isFinite(percentage) ? percentage : null,
            amount,
            due_date: due,
            step_order: stepOrder
          })
        })
      } else if (dueDate) {
        scheduleRows.push({
          label: 'Due',
          percentage: null,
          amount: totalAmount,
          due_date: dueDate,
          step_order: 1
        })
      }

      for (const item of lineItems) {
        const qty = Number(item.quantity) || 1
        const price = Number(item.unit_price) || 0
        const lineTotal = qty * price

        let vendorBillId = item.vendor_bill_id ? Number(item.vendor_bill_id) : null
        if (vendorBillId) {
          const checkLink = await client.query(`SELECT id FROM invoice_line_items WHERE vendor_bill_id = $1`, [vendorBillId])
          if (checkLink.rows.length > 0) {
            throw new Error(`Vendor bill #${vendorBillId} is already linked to another invoice line item.`)
          }
        }

        await client.query(
          `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, line_total, is_billable_expense, vendor_bill_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [newInvoice.id, (item.description || '').trim() || 'Item', qty, price, lineTotal, !!item.is_billable_expense, vendorBillId]
        )
      }

      for (const row of scheduleRows) {
        await client.query(
          `INSERT INTO invoice_payment_schedule (invoice_id, label, percentage, amount, due_date, step_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [newInvoice.id, row.label, row.percentage, row.amount, row.due_date, row.step_order]
        )
      }

      await client.query('COMMIT')

      // Respond immediately after commit; audit logging should never block or fail the response.
      const invoiceToReturn = newInvoice
      reply.code(201).send(invoiceToReturn)

      setImmediate(async () => {
        try {
          await logAdminAudit(req, 'create', 'invoice', newInvoice.id, null, newInvoice, auth?.user?.id || null)
        } catch (auditErr) {
          console.warn('Failed to write admin audit log for invoice create', auditErr?.message || auditErr)
        }
      })
      return
    } catch (err) {
      if (client) await client.query('ROLLBACK')
      req.log.error(err)
      return reply.code(500).send({ error: err.message || 'Failed to create invoice' })
    } finally {
      if (client) client.release()
    }
  })

  // We abstract the status calculation so applying/removing payments and editing totals auto-updates status.
  const updateInvoiceStatusAsync = async (invoiceId) => {
    const invR = await pool.query(`SELECT status, total_amount FROM invoices WHERE id = $1`, [invoiceId])
    if (!invR.rows.length) return
    const invoice = invR.rows[0]

    // Cancelled is terminal
    if (invoice.status === 'cancelled') return

    const payR = await pool.query(`SELECT COALESCE(SUM(amount_applied), 0) as paid FROM invoice_payments WHERE invoice_id = $1`, [invoiceId])
    const paid = Number(payR.rows[0].paid)
    const total = Number(invoice.total_amount)

    let newStatus = invoice.status
    if (paid > 0) {
      if (paid >= total) newStatus = 'paid'
      else newStatus = 'partially_paid'
    } else {
      if (invoice.status === 'paid' || invoice.status === 'partially_paid') {
        newStatus = 'issued' // fallback to issued if payments removed
      }
    }

    if (newStatus !== invoice.status) {
      await pool.query(`UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, invoiceId])
    }
  }

  api.patch('/finance/invoices/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid invoice id' })

    const body = req.body || {}
    let client
    try {
      const curR = await pool.query(`SELECT * FROM invoices WHERE id = $1`, [id])
      if (!curR.rows.length) return reply.code(404).send({ error: 'Invoice not found' })
      const existing = curR.rows[0]

      const updates = []
      const values = []
      const addVal = (val) => {
        values.push(val)
        return `$${values.length}`
      }

      if (body.status && ['draft', 'issued', 'partially_paid', 'paid', 'cancelled'].includes(body.status)) {
        updates.push(`status = ${addVal(body.status)}`)
      }
      if (body.invoice_type && ['gst', 'non_gst'].includes(body.invoice_type)) {
        updates.push(`invoice_type = ${addVal(body.invoice_type)}`)
      }
      if (body.issue_date !== undefined) {
        updates.push(`issue_date = ${addVal(normalizeDateValue(body.issue_date))}`)
      }
      if (body.due_date !== undefined) {
        updates.push(`due_date = ${addVal(normalizeDateValue(body.due_date))}`)
      }
      if (body.notes !== undefined) {
        updates.push(`notes = ${addVal(String(body.notes || '').trim() || null)}`)
      }
      if (body.tax_amount !== undefined) {
        updates.push(`tax_amount = ${addVal(Number(body.tax_amount) || 0)}`)
      }
      if (body.total_amount !== undefined) {
        updates.push(`total_amount = ${addVal(Number(body.total_amount) || 0)}`)
      }
      if (body.subtotal !== undefined) {
        updates.push(`subtotal = ${addVal(Number(body.subtotal) || 0)}`)
      }

      client = await pool.connect()
      await client.query('BEGIN')

      let updatedInvoice = existing
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`)
        const q = `UPDATE invoices SET ${updates.join(', ')} WHERE id = ${addVal(id)} RETURNING *`
        const r = await client.query(q, values)
        updatedInvoice = r.rows[0]
      }

      // If line items passed in array, replace completely
      if (Array.isArray(body.line_items)) {
        await client.query(`DELETE FROM invoice_line_items WHERE invoice_id = $1`, [id])
        for (const item of body.line_items) {
          const qty = Number(item.quantity) || 1
          const price = Number(item.unit_price) || 0
          const lineTotal = qty * price

          let vendorBillId = item.vendor_bill_id ? Number(item.vendor_bill_id) : null
          if (vendorBillId) {
            const checkLink = await client.query(`SELECT id FROM invoice_line_items WHERE vendor_bill_id = $1`, [vendorBillId])
            if (checkLink.rows.length > 0) {
              // Since we deleted all line items for this invoice before inserting, 
              // any existing matches here belong to a different invoice, or are duplicates in this payload.
              throw new Error(`Vendor bill #${vendorBillId} is already linked to another invoice line item.`)
            }
          }

          await client.query(
            `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, line_total, is_billable_expense, vendor_bill_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, (item.description || '').trim() || 'Item', qty, price, lineTotal, !!item.is_billable_expense, vendorBillId]
          )
        }
      }

      await client.query('COMMIT')

      // Auto calc status just in case total_amount changed to less than paid amount
      await updateInvoiceStatusAsync(id)

      await logAdminAudit(req, 'update', 'invoice', id, existing, updatedInvoice, auth.user.id, client)
      return updatedInvoice
    } catch (err) {
      if (client) await client.query('ROLLBACK')
      req.log.error(err)
      return reply.code(500).send({ error: err.message || 'Failed to update invoice' })
    } finally {
      if (client) client.release()
    }
  })

  api.post('/finance/invoices/:id/payments', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const invoiceId = parseId(req.params.id)
    if (!invoiceId) return reply.code(400).send({ error: 'Invalid invoice id' })

    const { amount_applied, money_source_id, date, note, category_id } = req.body || {}
    const moneySourceId = parseId(money_source_id)
    if (!moneySourceId) return reply.code(400).send({ error: 'money_source_id is required' })

    const amount = Number(amount_applied)
    if (!Number.isFinite(amount) || amount <= 0) return reply.code(400).send({ error: 'Valid positive amount_applied is required' })

    try {
      const invR = await pool.query(`SELECT id, status, lead_id FROM invoices WHERE id = $1`, [invoiceId])
      if (!invR.rows.length) return reply.code(404).send({ error: 'Invoice not found' })
      if (invR.rows[0].status === 'cancelled') return reply.code(400).send({ error: 'Cannot apply payments to cancelled invoice' })

      const txDate = normalizeDateValue(date) || dateToYMD(new Date())
      const categoryId = parseId(category_id) || null
      const txNote = (note || '').trim() || null

      const dupR = await pool.query(
        `
        SELECT 1
        FROM invoice_payments ip
        JOIN finance_transactions ft ON ft.id = ip.finance_transaction_id
        WHERE ip.invoice_id = $1
          AND ft.date = $2
          AND ft.amount = $3
          AND ft.money_source_id = $4
          AND ft.is_deleted = false
        LIMIT 1
        `,
        [invoiceId, txDate, amount, moneySourceId]
      )
      if (dupR.rows.length) {
        return reply.code(400).send({ error: 'Duplicate payment detected' })
      }

      await withTransaction(async (client) => {
        const txR = await client.query(
          `INSERT INTO finance_transactions (date, amount, direction, money_source_id, lead_id, is_overhead, category_id, note, transaction_type)
           VALUES ($1, $2, 'in', $3, $4, false, $5, $6, 'invoice_payment')
           RETURNING id`,
          [txDate, amount, moneySourceId, invR.rows[0].lead_id, categoryId, txNote]
        )
        const trxId = txR.rows[0].id

        const paymentR = await client.query(
          `INSERT INTO invoice_payments (invoice_id, finance_transaction_id, amount_applied)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [invoiceId, trxId, amount]
        )

        const paymentId = paymentR.rows[0]?.id
        if (paymentId) {
          const base = `INV-${invR.rows[0].lead_id}-P${paymentId}`
          await assignReferenceCode(client, trxId, base)
        }
      })

      await updateInvoiceStatusAsync(invoiceId)
      void recalculateAccountBalances()
      return { success: true }
    } catch (err) {
      if (err?.code === '23505') {
        return reply.code(400).send({ error: 'This transaction is already mapped to this invoice' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to apply payment' })
    }
  })

  /* ===================== FINANCE — PROJECT P&L v1 ===================== */

  api.get('/finance/projects/:leadId/pnl', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const leadId = parseId(req.params.leadId)
    if (!leadId) return reply.code(400).send({ error: 'Invalid lead id' })

    try {
      const leadCheck = await pool.query(`SELECT id FROM leads WHERE id = $1`, [leadId])
      if (!leadCheck.rows.length) return reply.code(404).send({ error: 'Lead not found' })

      const dateFrom = normalizeDateValue(req.query?.date_from)
      const dateTo = normalizeDateValue(req.query?.date_to)
      const toMonthStart = (ymd) => (ymd ? `${String(ymd).slice(0, 7)}-01` : null)
      const monthStartFrom = toMonthStart(dateFrom)
      const monthStartTo = toMonthStart(dateTo)
      const allocationVersion = 'v2.2'

      const revenueParams = [leadId]
      let revenueWhere = `i.lead_id = $1 AND i.status = 'paid'`
      let revenueIdx = 2
      if (dateFrom || dateTo) {
        revenueWhere += ` AND paid.paid_date IS NOT NULL`
      }
      if (dateFrom) {
        revenueWhere += ` AND paid.paid_date >= $${revenueIdx++}`
        revenueParams.push(dateFrom)
      }
      if (dateTo) {
        revenueWhere += ` AND paid.paid_date <= $${revenueIdx++}`
        revenueParams.push(dateTo)
      }

      const revenueR = await pool.query(
        `
        SELECT i.id as invoice_id,
               i.total_amount as amount,
               paid.paid_date
        FROM invoices i
        LEFT JOIN (
          SELECT invoice_id, MAX(created_at)::date as paid_date
          FROM invoice_payments
          GROUP BY invoice_id
        ) paid ON paid.invoice_id = i.id
        WHERE ${revenueWhere}
        ORDER BY i.id DESC
        `,
        revenueParams
      )

      const vendorParams = [leadId]
      let vendorWhere = `
        vb.lead_id = $1
        AND vb.status = 'paid'
        AND NOT (
          vb.is_billable_to_client = true
          AND EXISTS (
            SELECT 1 FROM invoice_line_items ili
            WHERE ili.vendor_bill_id = vb.id
          )
        )
      `
      let vendorIdx = 2
      if (dateFrom || dateTo) {
        vendorWhere += ` AND paid.paid_date IS NOT NULL`
      }
      if (dateFrom) {
        vendorWhere += ` AND paid.paid_date >= $${vendorIdx++}`
        vendorParams.push(dateFrom)
      }
      if (dateTo) {
        vendorWhere += ` AND paid.paid_date <= $${vendorIdx++}`
        vendorParams.push(dateTo)
      }

      const vendorCostR = await pool.query(
        `
        SELECT vb.id as vendor_bill_id,
               v.name as vendor_name,
               vb.bill_category as category,
               vb.bill_amount as amount,
               paid.paid_date
        FROM vendor_bills vb
        JOIN vendors v ON v.id = vb.vendor_id
        LEFT JOIN (
          SELECT vendor_bill_id, MAX(date)::date as paid_date
          FROM finance_transactions
          WHERE vendor_bill_id IS NOT NULL AND is_deleted = false AND is_transfer = false
          GROUP BY vendor_bill_id
        ) paid ON paid.vendor_bill_id = vb.id
        WHERE ${vendorWhere}
        ORDER BY vb.id DESC
        `,
        vendorParams
      )

      const payrollParams = [leadId]
      let payrollWhere = `
        ece.lead_id = $1
        AND cc.component_type = 'earning'
        AND cc.is_variable = true
      `
      let payrollIdx = 2
      if (dateFrom) {
        payrollWhere += ` AND ece.month >= $${payrollIdx++}`
        payrollParams.push(dateFrom)
      }
      if (dateTo) {
        payrollWhere += ` AND ece.month <= $${payrollIdx++}`
        payrollParams.push(dateTo)
      }

      const payrollR = await pool.query(
        `
        SELECT ece.id,
               u.name as user_name,
               cc.name as component_name,
               ece.amount,
               ece.month
        FROM employee_compensation_entries ece
        JOIN users u ON u.id = ece.user_id
        JOIN compensation_components cc ON cc.id = ece.component_id
        WHERE ${payrollWhere}
        ORDER BY ece.month DESC, u.name ASC, cc.id ASC
        `,
        payrollParams
      )

      // Overhead allocation v2.2 (read-only) using Contribution Units
      const cuParams = []
      let cuIdx = 1
      let cuWhere = `cu.lead_id IS NOT NULL`
      if (monthStartFrom) {
        cuWhere += ` AND cu.month >= $${cuIdx++}`
        cuParams.push(monthStartFrom)
      }
      if (monthStartTo) {
        cuWhere += ` AND cu.month <= $${cuIdx++}`
        cuParams.push(monthStartTo)
      }

      const cuEntriesR = await pool.query(
        `
        SELECT cu.user_id,
               cu.lead_id,
               date_trunc('month', cu.month)::date as month_start,
               COUNT(*) as cu_count
        FROM contribution_units cu
        WHERE ${cuWhere}
        GROUP BY cu.user_id, cu.lead_id, month_start
        `,
        cuParams
      )
      const cuEntries = cuEntriesR.rows

      const profilesR = await pool.query(
        `
        SELECT ecp.user_id,
               ecp.base_amount,
               ecp.employment_type,
               u.name as user_name
        FROM employee_compensation_profiles ecp
        JOIN users u ON u.id = ecp.user_id
        WHERE ecp.is_active = true AND ecp.base_amount IS NOT NULL
        `
      )

      const salaryMap = {}
      const userNameMap = {}
      profilesR.rows.forEach(row => {
        const base = Number(row.base_amount || 0)
        if (!Number.isFinite(base) || base <= 0) return
        if (row.employment_type === 'salaried' || row.employment_type === 'salaried_plus_variable' || row.employment_type === 'stipend') {
          salaryMap[row.user_id] = base
          userNameMap[row.user_id] = row.user_name
        }
      })

      const totalCuByUserMonth = {}
      cuEntries.forEach(row => {
        const key = `${row.user_id}-${dateToYMD(row.month_start)}`
        const cu = Number(row.cu_count || 0)
        if (!Number.isFinite(cu) || cu <= 0) return
        totalCuByUserMonth[key] = (totalCuByUserMonth[key] || 0) + cu
      })

      const peopleOverheadBreakdown = []
      cuEntries.forEach(row => {
        if (Number(row.lead_id) !== Number(leadId)) return
        const monthKey = dateToYMD(row.month_start)
        const cu = Number(row.cu_count || 0)
        if (!Number.isFinite(cu) || cu <= 0) return
        const totalCu = totalCuByUserMonth[`${row.user_id}-${monthKey}`] || 0
        if (!totalCu || totalCu <= 0) return
        const base = salaryMap[row.user_id]
        if (!base) return
        const allocated = (cu / totalCu) * base
        peopleOverheadBreakdown.push({
          employee_name: userNameMap[row.user_id] || `User ${row.user_id}`,
          month: monthKey,
          cu_count: cu,
          allocated_amount: allocated
        })
      })

      const peopleOverheadTotal = peopleOverheadBreakdown.reduce((sum, r) => sum + Number(r.allocated_amount || 0), 0)

      const infraParams = []
      let infraIdx = 1
      let infraWhere = `
        ft.transaction_type = 'overhead'
        AND ft.is_deleted = false
        AND ft.is_transfer = false
      `
      if (monthStartFrom) {
        infraWhere += ` AND date_trunc('month', ft.date)::date >= $${infraIdx++}`
        infraParams.push(monthStartFrom)
      }
      if (monthStartTo) {
        infraWhere += ` AND date_trunc('month', ft.date)::date <= $${infraIdx++}`
        infraParams.push(monthStartTo)
      }

      const infraR = await pool.query(
        `
        SELECT date_trunc('month', ft.date)::date as month_start,
               SUM(ft.amount) as total_infra
        FROM finance_transactions ft
        WHERE ${infraWhere}
        GROUP BY month_start
        ORDER BY month_start DESC
        `,
        infraParams
      )

      const activeParams = [leadId]
      let activeIdx = 2
      let activeMonthFilter = ''
      if (monthStartFrom) {
        activeMonthFilter += ` AND month_start >= $${activeIdx++}`
        activeParams.push(monthStartFrom)
      }
      if (monthStartTo) {
        activeMonthFilter += ` AND month_start <= $${activeIdx++}`
        activeParams.push(monthStartTo)
      }

      const activeR = await pool.query(
        `
        WITH active_events AS (
          SELECT cu.lead_id, date_trunc('month', cu.month)::date as month_start
          FROM contribution_units cu
          WHERE cu.lead_id IS NOT NULL
          UNION
          SELECT vb.lead_id, date_trunc('month', ft.date)::date as month_start
          FROM finance_transactions ft
          JOIN vendor_bills vb ON vb.id = ft.vendor_bill_id
          WHERE ft.vendor_bill_id IS NOT NULL AND ft.is_deleted = false AND ft.is_transfer = false AND vb.lead_id IS NOT NULL
          UNION
          SELECT la.lead_id, date_trunc('month', la.created_at)::date as month_start
          FROM lead_activities la
          WHERE la.lead_id IS NOT NULL
          UNION
          SELECT lul.lead_id, date_trunc('month', lul.entered_at)::date as month_start
          FROM lead_usage_logs lul
          WHERE lul.lead_id IS NOT NULL
        )
        SELECT month_start,
               COUNT(DISTINCT lead_id) as active_projects,
               MAX(CASE WHEN lead_id = $1 THEN 1 ELSE 0 END) as lead_active
        FROM active_events
        WHERE lead_id IS NOT NULL ${activeMonthFilter}
        GROUP BY month_start
        ORDER BY month_start DESC
        `,
        activeParams
      )

      const activeMonthMap = {}
      activeR.rows.forEach(row => {
        const key = dateToYMD(row.month_start)
        activeMonthMap[key] = {
          active_projects: Number(row.active_projects || 0),
          lead_active: Number(row.lead_active || 0)
        }
      })

      const infraBreakdown = []
      infraR.rows.forEach(row => {
        const monthKey = dateToYMD(row.month_start)
        const infraTotal = Number(row.total_infra || 0)
        const activeInfo = activeMonthMap[monthKey]
        if (!activeInfo || !activeInfo.lead_active) return
        if (!infraTotal || infraTotal <= 0) return
        const activeCount = Number(activeInfo.active_projects || 0)
        if (!activeCount) return
        infraBreakdown.push({
          month: monthKey,
          total_infra: infraTotal,
          active_projects: activeCount,
          allocated_amount: infraTotal / activeCount
        })
      })

      const infraOverheadTotal = infraBreakdown.reduce((sum, r) => sum + Number(r.allocated_amount || 0), 0)

      const activeMonths = Object.keys(activeMonthMap)
        .filter(m => activeMonthMap[m]?.lead_active)
        .sort()
      const activePeriod = activeMonths.length
        ? { start_month: activeMonths[0], end_month: activeMonths[activeMonths.length - 1] }
        : { start_month: null, end_month: null }

      const revenueBreakdown = revenueR.rows.map(r => ({
        invoice_id: r.invoice_id,
        amount: Number(r.amount || 0),
        paid_date: r.paid_date
      }))

      const vendorCostBreakdown = vendorCostR.rows.map(r => ({
        vendor_bill_id: r.vendor_bill_id,
        vendor_name: r.vendor_name,
        category: r.category,
        amount: Number(r.amount || 0),
        paid_date: r.paid_date
      }))

      const payrollBreakdown = payrollR.rows.map(r => ({
        user_name: r.user_name,
        component_name: r.component_name,
        amount: Number(r.amount || 0),
        month: r.month
      }))

      const revenueTotal = revenueBreakdown.reduce((sum, r) => sum + Number(r.amount || 0), 0)
      const vendorCostTotal = vendorCostBreakdown.reduce((sum, r) => sum + Number(r.amount || 0), 0)
      const payrollCostTotal = payrollBreakdown.reduce((sum, r) => sum + Number(r.amount || 0), 0)
      const overheadTotal = peopleOverheadTotal + infraOverheadTotal
      const netProfit = revenueTotal - vendorCostTotal - payrollCostTotal - overheadTotal

      req.log.info({ leadId, allocationVersion }, 'P&L overhead allocation version')

      return reply.send({
        revenue_total: revenueTotal,
        vendor_cost_total: vendorCostTotal,
        payroll_cost_total: payrollCostTotal,
        people_overhead_total: peopleOverheadTotal,
        infra_overhead_total: infraOverheadTotal,
        overhead_total: overheadTotal,
        net_profit: netProfit,
        revenue_breakdown: revenueBreakdown,
        vendor_cost_breakdown: vendorCostBreakdown,
        payroll_breakdown: payrollBreakdown,
        overhead_breakdown: {
          people: peopleOverheadBreakdown,
          infra: infraBreakdown
        },
        project_active_period: activePeriod,
        allocation_version: allocationVersion
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch project P&L' })
    }
  })

  /* ===================== FINANCE — CASHFLOW v1 ===================== */

  api.get('/finance/cashflow', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const parseMonthStart = (value) => {
      if (!value) return null
      const trimmed = String(value).trim()
      let candidate = trimmed
      if (/^\d{4}-\d{2}$/.test(trimmed)) {
        candidate = `${trimmed}-01`
      } else if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        candidate = trimmed.slice(0, 10)
      } else {
        return null
      }
      const parsed = new Date(`${candidate}T00:00:00`)
      if (Number.isNaN(parsed.getTime())) return null
      const start = new Date(parsed.getFullYear(), parsed.getMonth(), 1)
      return dateToYMD(start)
    }

    const addMonths = (ymd, months) => {
      const base = new Date(`${ymd}T00:00:00`)
      if (Number.isNaN(base.getTime())) return null
      const next = new Date(base.getFullYear(), base.getMonth() + months, 1)
      return dateToYMD(next)
    }

    const buildMonthRange = (fromYmd, toYmd) => {
      const months = []
      const cursor = new Date(`${fromYmd}T00:00:00`)
      const end = new Date(`${toYmd}T00:00:00`)
      if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return months
      while (cursor <= end) {
        const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
        months.push(ym)
        cursor.setMonth(cursor.getMonth() + 1, 1)
      }
      return months
    }

    try {
      const sourceId = parseId(req.query?.money_source_id)
      const now = new Date()
      const defaultTo = dateToYMD(new Date(now.getFullYear(), now.getMonth(), 1))

      const fromParam = parseMonthStart(req.query?.from_month)
      const toParam = parseMonthStart(req.query?.to_month) || defaultTo
      const toStart = toParam

      const fromStart =
        fromParam ||
        dateToYMD(new Date(new Date(`${toStart}T00:00:00`).getFullYear(), new Date(`${toStart}T00:00:00`).getMonth() - 5, 1))

      if (!fromStart || !toStart) {
        return reply.code(400).send({ error: 'Invalid from_month or to_month' })
      }

      const rangeStart = fromStart
      const rangeEndExclusive = addMonths(toStart, 1)
      if (!rangeEndExclusive) return reply.code(400).send({ error: 'Invalid range' })

      const params = [rangeStart, rangeEndExclusive]
      let sourceFilter = ''
      if (sourceId) {
        params.push(sourceId)
        sourceFilter = ` AND money_source_id = $${params.length}`
      }

      const { rows } = await pool.query(
        `
        SELECT to_char(date_trunc('month', date), 'YYYY-MM') as month,
               SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END) as total_in,
               SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END) as total_out
        FROM finance_transactions
        WHERE is_deleted = false AND is_transfer = false AND date >= $1 AND date < $2${sourceFilter}
        GROUP BY month
        ORDER BY month DESC
        `,
        params
      )

      const dataByMonth = {}
      rows.forEach(r => {
        dataByMonth[r.month] = {
          month: r.month,
          total_in: Number(r.total_in || 0),
          total_out: Number(r.total_out || 0),
          net: Number(r.total_in || 0) - Number(r.total_out || 0)
        }
      })

      const monthList = buildMonthRange(rangeStart, toStart).reverse()
      const resultRows = monthList.map(month => {
        if (dataByMonth[month]) return dataByMonth[month]
        return { month, total_in: 0, total_out: 0, net: 0 }
      })

      const rowsWithData = rows
        .map(r => ({ month: r.month, total_out: Number(r.total_out || 0) }))
        .sort((a, b) => (a.month < b.month ? 1 : -1))

      const lastThree = rowsWithData.slice(0, 3)
      const avgMonthlyOut =
        lastThree.length === 0
          ? 0
          : lastThree.reduce((sum, r) => sum + r.total_out, 0) / lastThree.length

      return reply.send({
        rows: resultRows,
        summary: {
          avg_monthly_out: avgMonthlyOut
        }
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch cashflow' })
    }
  })

  api.get('/finance/expected-payments', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const parseMonthStart = (value) => {
      if (!value) return null
      const trimmed = String(value).trim()
      let candidate = trimmed
      if (/^\d{4}-\d{2}$/.test(trimmed)) {
        candidate = `${trimmed}-01`
      } else if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        candidate = trimmed.slice(0, 10)
      } else {
        return null
      }
      const parsed = new Date(`${candidate}T00:00:00`)
      if (Number.isNaN(parsed.getTime())) return null
      const start = new Date(parsed.getFullYear(), parsed.getMonth(), 1)
      return dateToYMD(start)
    }

    const addMonths = (ymd, months) => {
      const base = new Date(`${ymd}T00:00:00`)
      if (Number.isNaN(base.getTime())) return null
      const next = new Date(base.getFullYear(), base.getMonth() + months, 1)
      return dateToYMD(next)
    }

    try {
      const now = new Date()
      const defaultTo = dateToYMD(new Date(now.getFullYear(), now.getMonth(), 1))

      const fromParam = parseMonthStart(req.query?.from_month)
      const toParam = parseMonthStart(req.query?.to_month) || defaultTo
      if (!toParam) return reply.code(400).send({ error: 'Invalid to_month' })

      const fromStart = fromParam || dateToYMD(new Date(new Date(`${toParam}T00:00:00`).getFullYear(), new Date(`${toParam}T00:00:00`).getMonth() - 5, 1))
      if (!fromStart) return reply.code(400).send({ error: 'Invalid from_month' })

      const rangeStart = fromStart
      const rangeEndExclusive = addMonths(toParam, 1)
      if (!rangeEndExclusive) return reply.code(400).send({ error: 'Invalid range' })

      const { rows } = await pool.query(
        `
        WITH schedule_rows AS (
          SELECT s.invoice_id, s.due_date, s.amount
          FROM invoice_payment_schedule s
          JOIN invoices i ON i.id = s.invoice_id
          WHERE i.status NOT IN ('draft', 'cancelled')
        ),
        fallback_rows AS (
          SELECT i.id as invoice_id, i.due_date, i.total_amount as amount
          FROM invoices i
          WHERE i.status NOT IN ('draft', 'cancelled')
            AND i.due_date IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM invoice_payment_schedule s WHERE s.invoice_id = i.id
            )
        )
        SELECT to_char(date_trunc('month', due_date), 'YYYY-MM') as month,
               SUM(amount) as expected_total
        FROM (
          SELECT * FROM schedule_rows
          UNION ALL
          SELECT * FROM fallback_rows
        ) x
        WHERE due_date >= $1 AND due_date < $2
        GROUP BY month
        ORDER BY month
        `,
        [rangeStart, rangeEndExclusive]
      )

      const normalized = rows.map(r => ({
        month: r.month,
        expected_total: Number(r.expected_total || 0)
      }))

      return reply.send({ rows: normalized })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch expected payments' })
    }
  })

  api.get('/finance/expected-payments/range', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fromDate = normalizeDateValue(req.query?.from_date)
    const toDate = normalizeDateValue(req.query?.to_date)
    if (!fromDate || !toDate) {
      return reply.code(400).send({ error: 'from_date and to_date are required (YYYY-MM-DD)' })
    }

    try {
      const { rows } = await pool.query(
        `
        WITH schedule_rows AS (
          SELECT s.invoice_id, s.due_date, s.amount
          FROM invoice_payment_schedule s
          JOIN invoices i ON i.id = s.invoice_id
          WHERE i.status NOT IN ('draft', 'cancelled')
        ),
        fallback_rows AS (
          SELECT i.id as invoice_id, i.due_date, i.total_amount as amount
          FROM invoices i
          WHERE i.status NOT IN ('draft', 'cancelled')
            AND i.due_date IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM invoice_payment_schedule s WHERE s.invoice_id = i.id
            )
        )
        SELECT COALESCE(SUM(amount), 0) as total
        FROM (
          SELECT * FROM schedule_rows
          UNION ALL
          SELECT * FROM fallback_rows
        ) x
        WHERE due_date >= $1 AND due_date <= $2
        `,
        [fromDate, toDate]
      )

      return reply.send({ total: Number(rows[0]?.total || 0) })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch expected payments range' })
    }
  })

  api.post('/finance/cashflow/runway', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const balanceRaw = req.body?.current_cash_balance
    const balance = Number(balanceRaw)
    if (!Number.isFinite(balance) || balance < 0) {
      return reply.code(400).send({ error: 'current_cash_balance must be a valid number' })
    }

    try {
      const { rows } = await pool.query(
        `
        SELECT to_char(date_trunc('month', date), 'YYYY-MM') as month,
               SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END) as total_out
        FROM finance_transactions
        WHERE is_deleted = false AND is_transfer = false
        GROUP BY month
        ORDER BY month DESC
        LIMIT 3
        `
      )

      const totals = rows.map(r => Number(r.total_out || 0))
      const avgMonthlyOut = totals.length === 0 ? 0 : totals.reduce((a, b) => a + b, 0) / totals.length
      const runwayMonths = avgMonthlyOut > 0 ? balance / avgMonthlyOut : null

      return reply.send({
        avg_monthly_out: avgMonthlyOut,
        runway_months: runwayMonths
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to calculate runway' })
    }
  })

  /* ===================== FINANCE — PROFIT DASHBOARD v1 ===================== */

  api.get('/finance/profit/projects', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fyLabel = String(req.query?.fy || getCurrentFyLabel() || '').trim()
    const fyRange = getFyRange(fyLabel)
    if (!fyRange) return reply.code(400).send({ error: 'Invalid FY' })

    const eventFrom = normalizeDateValue(req.query?.event_from)
    const eventTo = normalizeDateValue(req.query?.event_to)
    const eventType = req.query?.event_type ? String(req.query.event_type) : null
    const status = req.query?.status ? String(req.query.status) : null
    const cityId = parseId(req.query?.city_id)
    const cityName = req.query?.city ? String(req.query.city) : null
    const leadId = parseId(req.query?.lead_id)

    try {
      const rows = await fetchProfitProjectRows({
        fyStart: fyRange.startDate,
        fyEndExclusive: addDaysToYMD(fyRange.endDate, 1),
        filters: {
          leadId,
          status,
          cityId,
          cityName,
          eventType,
          eventFrom,
          eventTo
        }
      })

      const projects = rows.map(row => {
        const revenue = Number(row.revenue || 0)
        const vendor = Number(row.vendor_cost || 0)
        const payroll = Number(row.payroll_overhead || 0)
        const infra = Number(row.infra_overhead || 0)
        const net = revenue - vendor - payroll - infra
        const profitPercent = revenue > 0 ? (net / revenue) * 100 : null
        return {
          lead_id: row.lead_id,
          lead_number: row.lead_number,
          name: row.name,
          bride_name: row.bride_name,
          groom_name: row.groom_name,
          status: row.status,
          revenue,
          vendor_cost: vendor,
          payroll_overhead: payroll,
          infra_overhead: infra,
          net_profit: net,
          profit_percent: profitPercent
        }
      }).sort((a, b) => b.net_profit - a.net_profit)

      const availableFys = await getAvailableFyLabels()

      return reply.send({
        fy: fyRange.label,
        fy_range: {
          start: fyRange.startDate,
          end: fyRange.endDate
        },
        available_fys: availableFys,
        projects
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load profit projects' })
    }
  })

  api.get('/finance/profit/monthly', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fyLabel = String(req.query?.fy || getCurrentFyLabel() || '').trim()
    const fyRange = getFyRange(fyLabel)
    if (!fyRange) return reply.code(400).send({ error: 'Invalid FY' })

    const fyStart = fyRange.startDate
    const fyEndExclusive = addDaysToYMD(fyRange.endDate, 1)

    try {
      const revenueR = await pool.query(
        `
        WITH paid_invoices AS (
          SELECT i.id, i.total_amount, MAX(p.created_at)::date as paid_date
          FROM invoices i
          JOIN invoice_payments p ON p.invoice_id = i.id
          WHERE i.status = 'paid'
          GROUP BY i.id
        )
        SELECT to_char(date_trunc('month', paid_date), 'YYYY-MM') as month,
               SUM(total_amount) as total
        FROM paid_invoices
        WHERE paid_date >= $1 AND paid_date < $2
        GROUP BY month
        `,
        [fyStart, fyEndExclusive]
      )

      const vendorR = await pool.query(
        `
        WITH paid_vendor AS (
          SELECT vb.id, vb.bill_amount, vb.is_billable_to_client, MAX(ft.date)::date as paid_date
          FROM vendor_bills vb
          JOIN finance_transactions ft ON ft.vendor_bill_id = vb.id AND ft.is_deleted = false AND ft.is_transfer = false AND ft.transaction_type = 'vendor_payment'
          WHERE vb.status = 'paid'
          GROUP BY vb.id
        )
        SELECT to_char(date_trunc('month', paid_date), 'YYYY-MM') as month,
               SUM(bill_amount) as total
        FROM paid_vendor pv
        WHERE paid_date >= $1 AND paid_date < $2
          AND NOT (
            pv.is_billable_to_client = true
            AND EXISTS (
              SELECT 1 FROM invoice_line_items ili
              WHERE ili.vendor_bill_id = pv.id
            )
          )
        GROUP BY month
        `,
        [fyStart, fyEndExclusive]
      )

      const payrollR = await pool.query(
        `
        WITH cu_user_month AS (
          SELECT user_id, date_trunc('month', month)::date as month_start, COUNT(*) as cu_count
          FROM contribution_units
          WHERE month >= $1 AND month < $2
          GROUP BY user_id, month_start
        ),
        salaries AS (
          SELECT user_id, base_amount
          FROM employee_compensation_profiles
          WHERE is_active = true
            AND base_amount IS NOT NULL
            AND employment_type IN ('salaried','stipend','salaried_plus_variable')
        )
        SELECT to_char(cu.month_start, 'YYYY-MM') as month,
               SUM(s.base_amount) as total
        FROM cu_user_month cu
        JOIN salaries s ON s.user_id = cu.user_id
        GROUP BY month
        `,
        [fyStart, fyEndExclusive]
      )

      const infraR = await pool.query(
        `
        SELECT to_char(date_trunc('month', ft.date), 'YYYY-MM') as month,
               SUM(ft.amount) as total
        FROM finance_transactions ft
        WHERE ft.transaction_type = 'overhead'
          AND ft.is_deleted = false
          AND ft.is_transfer = false
          AND ft.date >= $1 AND ft.date < $2
        GROUP BY month
        `,
        [fyStart, fyEndExclusive]
      )

      const monthMap = {}
      const applyTotals = (rows, key) => {
        rows.forEach(r => {
          if (!monthMap[r.month]) monthMap[r.month] = { month: r.month, revenue: 0, vendor_cost: 0, payroll_overhead: 0, infra_overhead: 0 }
          monthMap[r.month][key] = Number(r.total || 0)
        })
      }

      applyTotals(revenueR.rows, 'revenue')
      applyTotals(vendorR.rows, 'vendor_cost')
      applyTotals(payrollR.rows, 'payroll_overhead')
      applyTotals(infraR.rows, 'infra_overhead')

      const months = []
      const start = new Date(`${fyRange.startDate}T00:00:00`)
      for (let i = 0; i < 12; i += 1) {
        const date = new Date(start.getFullYear(), start.getMonth() + i, 1)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        const row = monthMap[monthKey] || { month: monthKey, revenue: 0, vendor_cost: 0, payroll_overhead: 0, infra_overhead: 0 }
        const net = row.revenue - row.vendor_cost - row.payroll_overhead - row.infra_overhead
        months.push({ ...row, net_profit: net })
      }

      const availableFys = await getAvailableFyLabels()

      return reply.send({
        fy: fyRange.label,
        fy_range: { start: fyRange.startDate, end: fyRange.endDate },
        available_fys: availableFys,
        months
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load monthly profit' })
    }
  })

  api.get('/finance/profit/cost-mix', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fyLabel = String(req.query?.fy || getCurrentFyLabel() || '').trim()
    const fyRange = getFyRange(fyLabel)
    if (!fyRange) return reply.code(400).send({ error: 'Invalid FY' })

    const leadId = parseId(req.query?.lead_id)

    try {
      let totals = { vendor_cost: 0, payroll_overhead: 0, infra_overhead: 0 }
      let leadInfo = null

      if (leadId) {
        const rows = await fetchProfitProjectRows({
          fyStart: fyRange.startDate,
          fyEndExclusive: addDaysToYMD(fyRange.endDate, 1),
          filters: { leadId }
        })
        const row = rows[0]
        if (row) {
          totals.vendor_cost = Number(row.vendor_cost || 0)
          totals.payroll_overhead = Number(row.payroll_overhead || 0)
          totals.infra_overhead = Number(row.infra_overhead || 0)
          leadInfo = {
            lead_id: row.lead_id,
            lead_number: row.lead_number,
            name: row.name,
            bride_name: row.bride_name,
            groom_name: row.groom_name
          }
        }
      } else {
        const monthlyRes = await pool.query(
          `
          WITH paid_invoices AS (
            SELECT i.id, i.total_amount, MAX(p.created_at)::date as paid_date
            FROM invoices i
            JOIN invoice_payments p ON p.invoice_id = i.id
            WHERE i.status = 'paid'
            GROUP BY i.id
          ),
          paid_vendor AS (
            SELECT vb.id, vb.bill_amount, vb.is_billable_to_client, MAX(ft.date)::date as paid_date
            FROM vendor_bills vb
            JOIN finance_transactions ft ON ft.vendor_bill_id = vb.id AND ft.is_deleted = false AND ft.is_transfer = false AND ft.transaction_type = 'vendor_payment'
            WHERE vb.status = 'paid'
            GROUP BY vb.id
          ),
          vendor_cost AS (
            SELECT SUM(bill_amount) as total
            FROM paid_vendor pv
            WHERE pv.paid_date >= $1 AND pv.paid_date < $2
              AND NOT (
                pv.is_billable_to_client = true
                AND EXISTS (
                  SELECT 1 FROM invoice_line_items ili
                  WHERE ili.vendor_bill_id = pv.id
                )
              )
          ),
          payroll_overhead AS (
            WITH cu_user_month AS (
              SELECT user_id, date_trunc('month', month)::date as month_start, COUNT(*) as cu_count
              FROM contribution_units
              WHERE month >= $1 AND month < $2
              GROUP BY user_id, month_start
            ),
            salaries AS (
              SELECT user_id, base_amount
              FROM employee_compensation_profiles
              WHERE is_active = true
                AND base_amount IS NOT NULL
                AND employment_type IN ('salaried','stipend','salaried_plus_variable')
            )
            SELECT SUM(s.base_amount) as total
            FROM cu_user_month cu
            JOIN salaries s ON s.user_id = cu.user_id
          ),
          infra_overhead AS (
            SELECT SUM(ft.amount) as total
            FROM finance_transactions ft
            WHERE ft.transaction_type = 'overhead'
              AND ft.is_deleted = false
              AND ft.is_transfer = false
              AND ft.date >= $1 AND ft.date < $2
          )
          SELECT
            (SELECT total FROM vendor_cost) as vendor_cost,
            (SELECT total FROM payroll_overhead) as payroll_overhead,
            (SELECT total FROM infra_overhead) as infra_overhead
          `,
          [fyRange.startDate, addDaysToYMD(fyRange.endDate, 1)]
        )
        const row = monthlyRes.rows[0] || {}
        totals.vendor_cost = Number(row.vendor_cost || 0)
        totals.payroll_overhead = Number(row.payroll_overhead || 0)
        totals.infra_overhead = Number(row.infra_overhead || 0)
      }

      const totalCosts = totals.vendor_cost + totals.payroll_overhead + totals.infra_overhead
      const percentages = {
        vendor_pct: totalCosts > 0 ? (totals.vendor_cost / totalCosts) * 100 : 0,
        payroll_pct: totalCosts > 0 ? (totals.payroll_overhead / totalCosts) * 100 : 0,
        infra_pct: totalCosts > 0 ? (totals.infra_overhead / totalCosts) * 100 : 0
      }

      const availableFys = await getAvailableFyLabels()

      return reply.send({
        fy: fyRange.label,
        fy_range: { start: fyRange.startDate, end: fyRange.endDate },
        available_fys: availableFys,
        lead: leadInfo,
        totals,
        percentages
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load cost mix' })
    }
  })

  /* ===================== REPORTING v1 ===================== */

  api.get('/reports/leads', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fyLabel = String(req.query?.fy || getCurrentFyLabel() || '').trim()
    const fyRange = getFyRange(fyLabel)
    if (!fyRange) return reply.code(400).send({ error: 'Invalid FY' })

    const status = req.query?.status ? String(req.query.status) : null
    const eventType = req.query?.event_type ? String(req.query.event_type) : null
    const cityName = req.query?.city ? String(req.query.city) : null
    const profitMin = req.query?.profit_min ? Number(req.query.profit_min) : null
    const profitMax = req.query?.profit_max ? Number(req.query.profit_max) : null

    try {
      const rows = await fetchProfitProjectRows({
        fyStart: fyRange.startDate,
        fyEndExclusive: addDaysToYMD(fyRange.endDate, 1),
        filters: {}
      })

      const leadIds = rows.map(r => r.lead_id)
      let metaMap = {}
      if (leadIds.length) {
        const metaR = await pool.query(
          `
          SELECT l.id,
                 l.event_type,
                 l.status,
                 COALESCE(primary_city.name, any_city.name) as city
          FROM leads l
          LEFT JOIN LATERAL (
            SELECT c.name
            FROM lead_cities lc
            JOIN cities c ON c.id = lc.city_id
            WHERE lc.lead_id = l.id AND lc.is_primary = true
            LIMIT 1
          ) primary_city ON true
          LEFT JOIN LATERAL (
            SELECT c.name
            FROM lead_cities lc
            JOIN cities c ON c.id = lc.city_id
            WHERE lc.lead_id = l.id
            ORDER BY lc.is_primary DESC, c.name ASC
            LIMIT 1
          ) any_city ON true
          WHERE l.id = ANY($1)
          `,
          [leadIds]
        )
        metaMap = metaR.rows.reduce((acc, row) => {
          acc[row.id] = row
          return acc
        }, {})
      }

      let leads = rows.map(row => {
        const revenue = Number(row.revenue || 0)
        const vendor = Number(row.vendor_cost || 0)
        const payroll = Number(row.payroll_overhead || 0)
        const infra = Number(row.infra_overhead || 0)
        const net = revenue - vendor - payroll - infra
        const profitPercent = revenue > 0 ? (net / revenue) * 100 : null
        const meta = metaMap[row.lead_id] || {}
        return {
          lead_id: row.lead_id,
          lead_number: row.lead_number,
          name: row.name,
          bride_name: row.bride_name,
          groom_name: row.groom_name,
          status: meta.status || row.status,
          event_type: meta.event_type || null,
          city: meta.city || null,
          revenue,
          vendor_cost: vendor,
          payroll_overhead: payroll,
          infra_overhead: infra,
          net_profit: net,
          profit_percent: profitPercent
        }
      })

      if (status) {
        leads = leads.filter(item => item.status === status)
      }
      if (eventType) {
        leads = leads.filter(item => item.event_type === eventType)
      }
      if (cityName) {
        leads = leads.filter(item => item.city && String(item.city).toLowerCase() === cityName.toLowerCase())
      }
      if (Number.isFinite(profitMin)) {
        leads = leads.filter(item => item.net_profit >= profitMin)
      }
      if (Number.isFinite(profitMax)) {
        leads = leads.filter(item => item.net_profit <= profitMax)
      }

      const availableFys = await getAvailableFyLabels()

      return reply.send({
        fy: fyRange.label,
        fy_range: { start: fyRange.startDate, end: fyRange.endDate },
        available_fys: availableFys,
        leads
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load lead report' })
    }
  })

  api.get('/reports/vendors', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fyLabel = String(req.query?.fy || getCurrentFyLabel() || '').trim()
    const fyRange = getFyRange(fyLabel)
    if (!fyRange) return reply.code(400).send({ error: 'Invalid FY' })

    try {
      const summaryR = await pool.query(
        `
        WITH paid_vendor AS (
          SELECT vb.id, vb.vendor_id, vb.lead_id, vb.bill_amount, vb.bill_category, MAX(ft.date)::date as paid_date
          FROM vendor_bills vb
          JOIN finance_transactions ft ON ft.vendor_bill_id = vb.id AND ft.is_deleted = false AND ft.is_transfer = false
          WHERE vb.status = 'paid'
          GROUP BY vb.id
        )
        SELECT v.id as vendor_id,
               v.name as vendor_name,
               v.vendor_type,
               SUM(pv.bill_amount) as total_paid,
               COUNT(pv.id) as bills_paid,
               COUNT(DISTINCT pv.lead_id) as projects_count
        FROM paid_vendor pv
        JOIN vendors v ON v.id = pv.vendor_id
        WHERE pv.paid_date >= $1 AND pv.paid_date < $2
        GROUP BY v.id, v.name, v.vendor_type
        ORDER BY total_paid DESC
        `,
        [fyRange.startDate, addDaysToYMD(fyRange.endDate, 1)]
      )

      const billsR = await pool.query(
        `
        WITH paid_vendor AS (
          SELECT vb.id, vb.vendor_id, vb.lead_id, vb.bill_amount, vb.bill_category, MAX(ft.date)::date as paid_date
          FROM vendor_bills vb
          JOIN finance_transactions ft ON ft.vendor_bill_id = vb.id AND ft.is_deleted = false AND ft.is_transfer = false
          WHERE vb.status = 'paid'
          GROUP BY vb.id
        )
        SELECT pv.vendor_id,
               pv.id as bill_id,
               pv.lead_id,
               pv.bill_amount,
               pv.bill_category,
               pv.paid_date,
               l.lead_number,
               l.name as lead_name
        FROM paid_vendor pv
        LEFT JOIN leads l ON l.id = pv.lead_id
        WHERE pv.paid_date >= $1 AND pv.paid_date < $2
        ORDER BY pv.paid_date DESC
        `,
        [fyRange.startDate, addDaysToYMD(fyRange.endDate, 1)]
      )

      const billMap = billsR.rows.reduce((acc, row) => {
        if (!acc[row.vendor_id]) acc[row.vendor_id] = []
        acc[row.vendor_id].push({
          bill_id: row.bill_id,
          lead_id: row.lead_id,
          lead_number: row.lead_number,
          lead_name: row.lead_name,
          amount: Number(row.bill_amount || 0),
          category: row.bill_category,
          paid_date: row.paid_date
        })
        return acc
      }, {})

      const vendors = summaryR.rows.map(row => {
        const totalPaid = Number(row.total_paid || 0)
        const billsPaid = Number(row.bills_paid || 0)
        return {
          vendor_id: row.vendor_id,
          vendor_name: row.vendor_name,
          vendor_type: row.vendor_type,
          total_paid: totalPaid,
          bills_paid: billsPaid,
          avg_bill_value: billsPaid > 0 ? totalPaid / billsPaid : 0,
          projects_count: Number(row.projects_count || 0),
          bills: billMap[row.vendor_id] || []
        }
      })

      const availableFys = await getAvailableFyLabels()

      return reply.send({
        fy: fyRange.label,
        fy_range: { start: fyRange.startDate, end: fyRange.endDate },
        available_fys: availableFys,
        vendors
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load vendor report' })
    }
  })

  api.get('/reports/employees', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fyLabel = String(req.query?.fy || getCurrentFyLabel() || '').trim()
    const fyRange = getFyRange(fyLabel)
    if (!fyRange) return reply.code(400).send({ error: 'Invalid FY' })

    const fyStart = fyRange.startDate
    const fyEndExclusive = addDaysToYMD(fyRange.endDate, 1)

    try {
      const summaryR = await pool.query(
        `
        WITH payouts AS (
          SELECT user_id, SUM(total_paid) as total_paid
          FROM employee_payouts
          WHERE total_paid > 0
            AND COALESCE(payout_date, month) >= $1
            AND COALESCE(payout_date, month) < $2
          GROUP BY user_id
        ),
        cu AS (
          SELECT user_id,
                 COUNT(*) as total_cu,
                 COUNT(DISTINCT lead_id) as projects_count,
                 COUNT(DISTINCT date_trunc('month', month)) as months_with_cu
          FROM contribution_units
          WHERE month >= $1 AND month < $2
          GROUP BY user_id
        ),
        base AS (
          SELECT user_id FROM payouts
          UNION
          SELECT user_id FROM cu
          UNION
          SELECT user_id FROM employee_compensation_profiles
        )
        SELECT u.id as user_id,
               u.name,
               u.email,
               u.role,
               u.job_title,
               u.is_active,
               ecp.employment_type,
               ecp.is_active as profile_active,
               COALESCE(p.total_paid, 0) as total_paid,
               COALESCE(c.total_cu, 0) as total_cu,
               COALESCE(c.projects_count, 0) as projects_count,
               COALESCE(c.months_with_cu, 0) as months_with_cu
        FROM base b
        JOIN users u ON u.id = b.user_id
        LEFT JOIN employee_compensation_profiles ecp ON ecp.user_id = u.id
        LEFT JOIN payouts p ON p.user_id = u.id
        LEFT JOIN cu c ON c.user_id = u.id
        ORDER BY u.name ASC
        `,
        [fyStart, fyEndExclusive]
      )

      const monthlyR = await pool.query(
        `
        SELECT user_id,
               to_char(date_trunc('month', month), 'YYYY-MM') as month,
               COUNT(*) as cu_count
        FROM contribution_units
        WHERE month >= $1 AND month < $2
        GROUP BY user_id, month
        ORDER BY month ASC
        `,
        [fyStart, fyEndExclusive]
      )

      const projectR = await pool.query(
        `
        SELECT cu.user_id,
               cu.lead_id,
               l.lead_number,
               l.name as lead_name,
               COUNT(*) as cu_count
        FROM contribution_units cu
        JOIN leads l ON l.id = cu.lead_id
        WHERE cu.month >= $1 AND cu.month < $2
        GROUP BY cu.user_id, cu.lead_id, l.lead_number, l.name
        ORDER BY cu_count DESC
        `,
        [fyStart, fyEndExclusive]
      )

      const monthlyMap = monthlyR.rows.reduce((acc, row) => {
        if (!acc[row.user_id]) acc[row.user_id] = []
        acc[row.user_id].push({ month: row.month, cu_count: Number(row.cu_count || 0) })
        return acc
      }, {})

      const projectMap = projectR.rows.reduce((acc, row) => {
        if (!acc[row.user_id]) acc[row.user_id] = []
        acc[row.user_id].push({
          lead_id: row.lead_id,
          lead_number: row.lead_number,
          lead_name: row.lead_name,
          cu_count: Number(row.cu_count || 0)
        })
        return acc
      }, {})

      const employees = summaryR.rows.map(row => {
        const totalCu = Number(row.total_cu || 0)
        const monthsWithCu = Number(row.months_with_cu || 0)
        return {
          user_id: row.user_id,
          name: row.name,
          email: row.email,
          role: row.role,
          job_title: row.job_title,
          is_active: row.is_active,
          employment_type: row.employment_type,
          profile_active: row.profile_active,
          total_paid: Number(row.total_paid || 0),
          projects_count: Number(row.projects_count || 0),
          total_cu: totalCu,
          avg_cu_per_month: monthsWithCu > 0 ? totalCu / monthsWithCu : 0,
          monthly_cu: monthlyMap[row.user_id] || [],
          project_cu: projectMap[row.user_id] || []
        }
      })

      const availableFys = await getAvailableFyLabels()

      return reply.send({
        fy: fyRange.label,
        fy_range: { start: fyRange.startDate, end: fyRange.endDate },
        available_fys: availableFys,
        employees
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load employee report' })
    }
  })

  api.delete('/finance/invoices/:id/payments/:payment_id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const invoiceId = parseId(req.params.id)
    const paymentId = parseId(req.params.payment_id)
    if (!invoiceId || !paymentId) return reply.code(400).send({ error: 'Invalid IDs' })

    try {
      const r = await pool.query(
        `DELETE FROM invoice_payments WHERE id = $1 AND invoice_id = $2 RETURNING id`,
        [paymentId, invoiceId]
      )
      if (!r.rows.length) return reply.code(404).send({ error: 'Payment mapping not found' })

      await updateInvoiceStatusAsync(invoiceId)
      return { success: true }
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to remove payment mapping' })
    }
  })

  /* ===================== FINANCE V2: VENDORS & BILLS ===================== */

  api.get('/finance/vendors', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const { rows } = await pool.query(`SELECT * FROM vendors ORDER BY name ASC`)
      return rows
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch vendors' })
    }
  })

  api.post('/finance/vendors', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { name, vendor_type, phone, email, notes } = req.body || {}
    if (!name || !vendor_type) return reply.code(400).send({ error: 'Name and Vendor Type are required' })

    try {
      const { rows } = await pool.query(
        `INSERT INTO vendors (name, vendor_type, phone, email, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, vendor_type, phone || null, email || null, notes || null]
      )
      try { await logAdminAudit(req, 'create', 'vendor', rows[0].id, null, rows[0], auth.user.id) } catch (_) { }
      return reply.send(rows[0])
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to create vendor' })
    }
  })

  api.get('/finance/vendors/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    try {
      const { rows } = await pool.query(`SELECT * FROM vendors WHERE id = $1`, [id])
      if (!rows.length) return reply.code(404).send({ error: 'Not found' })
      return rows[0]
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch' })
    }
  })

  api.patch('/finance/vendors/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    const { name, vendor_type, phone, email, notes, is_active, user_id } = req.body || {}

    try {
      const current = await pool.query(`SELECT * FROM vendors WHERE id = $1`, [id])
      if (!current.rows.length) return reply.code(404).send({ error: 'Not found' })

      const updates = []
      const values = []
      let i = 1
      if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name) }
      if (vendor_type !== undefined) { updates.push(`vendor_type = $${i++}`); values.push(vendor_type) }
      if (phone !== undefined) { updates.push(`phone = $${i++}`); values.push(phone) }
      if (email !== undefined) { updates.push(`email = $${i++}`); values.push(email) }
      if (notes !== undefined) { updates.push(`notes = $${i++}`); values.push(notes) }
      if (is_active !== undefined) { updates.push(`is_active = $${i++}`); values.push(is_active) }
      if (user_id !== undefined) { updates.push(`user_id = $${i++}`); values.push(user_id || null) }

      if (!updates.length) return current.rows[0]

      updates.push(`updated_at = NOW()`)
      values.push(id)

      const { rows } = await pool.query(
        `UPDATE vendors SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      )
      try { await logAdminAudit(req, 'update', 'vendor', id, current.rows[0], rows[0], auth.user.id) } catch (_) { }
      return reply.send(rows[0])
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to update' })
    }
  })

  api.get('/vendors/:id/rate-card', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid vendor id' })
    try {
      const vendorRes = await pool.query(`SELECT id, vendor_type FROM vendors WHERE id = $1`, [id])
      if (!vendorRes.rows.length) return reply.code(404).send({ error: 'Vendor not found' })
      if (vendorRes.rows[0].vendor_type !== 'freelancer') {
        return reply.code(400).send({ error: 'Rate cards only allowed for freelancer vendors' })
      }
      const { rows } = await pool.query(
        `SELECT * FROM vendor_rate_cards WHERE vendor_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
        [id]
      )
      return reply.send({ rate_card: rows[0] || null })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch rate card' })
    }
  })

  api.post('/vendors/:id/rate-card', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid vendor id' })

    const { rate_type, rates, effective_from } = req.body || {}
    if (!rate_type) return reply.code(400).send({ error: 'rate_type is required' })

    const parseNumber = (value) => {
      const num = Number(value)
      if (!Number.isFinite(num) || num < 0) return null
      return num
    }

    const normalizeRates = () => {
      if (!rates || typeof rates !== 'object') return null
      if (rate_type === 'per_day') {
        const half = parseNumber(rates.half_day)
        const full = parseNumber(rates.full_day)
        if (half === null || full === null) return null
        return { half_day: half, full_day: full }
      }
      if (rate_type === 'per_function') {
        const small = parseNumber(rates.small_function)
        const big = parseNumber(rates.big_function)
        const full = parseNumber(rates.full_day)
        if (small === null || big === null || full === null) return null
        return { small_function: small, big_function: big, full_day: full }
      }
      if (rate_type === 'flat') {
        const amount = parseNumber(rates.amount)
        const unit = typeof rates.unit === 'string' ? rates.unit.trim() : ''
        if (amount === null || !unit) return null
        return { amount, unit }
      }
      return null
    }

    const normalizedRates = normalizeRates()
    if (!normalizedRates) return reply.code(400).send({ error: 'Invalid rates payload for rate_type' })

    try {
      const vendorRes = await pool.query(`SELECT id, vendor_type FROM vendors WHERE id = $1`, [id])
      if (!vendorRes.rows.length) return reply.code(404).send({ error: 'Vendor not found' })
      if (vendorRes.rows[0].vendor_type !== 'freelancer') {
        return reply.code(400).send({ error: 'Rate cards only allowed for freelancer vendors' })
      }

      const effectiveDate = effective_from && normalizeDateValue(effective_from)
      const effectiveValue = effectiveDate || dateToYMD(new Date())

      await pool.query('BEGIN')
      await pool.query(
        `UPDATE vendor_rate_cards SET is_active = false, updated_at = NOW() WHERE vendor_id = $1 AND is_active = true`,
        [id]
      )
      const insertRes = await pool.query(
        `INSERT INTO vendor_rate_cards (vendor_id, rate_type, rates, is_active, effective_from)\n         VALUES ($1, $2, $3, true, $4)\n         RETURNING *`,
        [id, rate_type, normalizedRates, effectiveValue]
      )
      await pool.query('COMMIT')
      try { await logAdminAudit(req, 'create', 'vendor_rate_card', insertRes.rows[0].id, null, insertRes.rows[0], auth.user.id) } catch (_) { }
      return reply.send({ rate_card: insertRes.rows[0] })
    } catch (err) {
      await pool.query('ROLLBACK')
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to save rate card' })
    }
  })

  api.get('/finance/vendor-bills', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const where = []
      const params = []
      const addParam = (value) => {
        params.push(value)
        return `$${params.length}`
      }
      const vendorId = parseId(req.query?.vendor_id)
      if (vendorId) where.push(`vb.vendor_id = ${addParam(vendorId)}`)
      const leadId = parseId(req.query?.lead_id)
      if (leadId) where.push(`vb.lead_id = ${addParam(leadId)}`)
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

      const { rows } = await pool.query(`
        SELECT vb.*, 
               v.name as vendor_name, 
               l.lead_number as lead_number, 
               l.name as lead_name,
               COALESCE(SUM(CASE WHEN ft.is_deleted = false THEN ft.amount ELSE 0 END), 0) as paid_amount
        FROM vendor_bills vb
        JOIN vendors v ON v.id = vb.vendor_id
        LEFT JOIN leads l ON l.id = vb.lead_id
        LEFT JOIN finance_transactions ft ON ft.vendor_bill_id = vb.id
        ${whereClause}
        GROUP BY vb.id, v.name, l.lead_number, l.name
        ORDER BY vb.created_at DESC
      `, params)
      return rows
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch bills' })
    }
  })

  api.post('/finance/transactions/project-expense', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { lead_id, vendor_id, vendor_bill_id, amount, date, money_source_id, note, bill_category } = req.body || {}
    const leadId = parseId(lead_id)
    const vendorId = parseId(vendor_id)
    const vendorBillId = parseId(vendor_bill_id)
    const moneySourceId = parseId(money_source_id)
    const amt = Number(amount)

    if (!leadId && !vendorBillId) return reply.code(400).send({ error: 'lead_id is required' })
    if (!vendorId) return reply.code(400).send({ error: 'vendor_id is required' })
    if (!moneySourceId) return reply.code(400).send({ error: 'money_source_id is required' })
    if (!Number.isFinite(amt) || amt <= 0) return reply.code(400).send({ error: 'Valid positive amount is required' })
    if (!vendorBillId) {
      const allowedCategories = ['editing', 'shooting', 'travel', 'food', 'printing', 'misc']
      if (!bill_category || !allowedCategories.includes(String(bill_category))) {
        return reply.code(400).send({ error: 'Valid bill_category is required' })
      }
    }

    try {
      if (leadId) {
        const leadR = await pool.query(`SELECT id FROM leads WHERE id = $1`, [leadId])
        if (!leadR.rows.length) return reply.code(404).send({ error: 'Lead not found' })
      }

      const vendorR = await pool.query(`SELECT id, name, vendor_type FROM vendors WHERE id = $1`, [vendorId])
      if (!vendorR.rows.length) return reply.code(404).send({ error: 'Vendor not found' })
      if (vendorR.rows[0].vendor_type === 'employee') return reply.code(400).send({ error: 'Employee vendors must be paid via payroll' })

      let billRow = null
      let finalBillId = vendorBillId || null
      if (vendorBillId) {
        const billR = await pool.query(`SELECT * FROM vendor_bills WHERE id = $1`, [vendorBillId])
        if (!billR.rows.length) return reply.code(404).send({ error: 'Vendor bill not found' })
        billRow = billR.rows[0]
        if (billRow.vendor_id !== vendorId) return reply.code(400).send({ error: 'Bill does not belong to selected vendor' })
        if (leadId && billRow.lead_id && billRow.lead_id !== leadId) return reply.code(400).send({ error: 'Bill does not belong to selected project' })
        if (billRow.status === 'rejected') return reply.code(400).send({ error: 'Cannot pay a rejected bill' })
      }

      const vendorName = vendorR.rows[0].name

      const txDate = normalizeDateValue(date) || dateToYMD(new Date())

      const result = await withTransaction(async (client) => {
        if (!finalBillId) {
          const createdBill = await client.query(
            `INSERT INTO vendor_bills (vendor_id, lead_id, bill_date, bill_amount, bill_category, is_billable_to_client, notes, status)
             VALUES ($1, $2, $3, $4, $5, false, $6, 'paid')
             RETURNING *`,
            [vendorId, leadId, txDate, amt, String(bill_category), note || null]
          )
          billRow = createdBill.rows[0]
          finalBillId = billRow.id
        }

        const dupR = await client.query(
          `
          SELECT 1
          FROM finance_transactions
          WHERE vendor_bill_id = $1
            AND amount = $2
            AND date = $3
            AND is_deleted = false
          LIMIT 1
          `,
          [finalBillId, amt, txDate]
        )
        if (dupR.rows.length) {
          throw { code: 'DUPLICATE_VENDOR_PAYMENT' }
        }

        const noteParts = []
        if (note && String(note).trim()) noteParts.push(String(note).trim())
        noteParts.push(`Vendor: ${vendorName}`)
        if (finalBillId) noteParts.push(`Bill #${finalBillId}`)
        const finalNote = noteParts.join(' | ')

        const txR = await client.query(
          `INSERT INTO finance_transactions (date, amount, direction, money_source_id, lead_id, is_overhead, category_id, note, vendor_bill_id, transaction_type)
           VALUES ($1, $2, 'out', $3, $4, false, NULL, $5, $6, 'vendor_payment')
           RETURNING id`,
          [txDate, amt, moneySourceId, leadId || billRow?.lead_id || null, finalNote || null, finalBillId]
        )

        await assignReferenceCode(client, txR.rows[0].id, `VENDOR-${finalBillId}`)

        if (finalBillId) {
          const totalR = await client.query(
            `SELECT COALESCE(SUM(amount), 0) as paid
             FROM finance_transactions
             WHERE vendor_bill_id = $1 AND is_deleted = false`,
            [finalBillId]
          )
          const totalPaid = Number(totalR.rows[0].paid || 0)
          const status = totalPaid >= Number(billRow.bill_amount || 0) ? 'paid' : 'approved'
          await client.query(
            `UPDATE vendor_bills SET status = $1, updated_at = NOW() WHERE id = $2`,
            [status, finalBillId]
          )
        }

        return txR.rows[0]
      })

      void recalculateAccountBalances()
      return reply.send({ success: true, transaction_id: result.id })
    } catch (err) {
      if (err?.code === 'DUPLICATE_VENDOR_PAYMENT') {
        return reply.code(400).send({ error: 'Duplicate vendor payment detected' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to record expense' })
    }
  })

  api.post('/finance/vendor-bills', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { vendor_id, lead_id, bill_date, bill_amount, bill_category, is_billable_to_client, notes } = req.body || {}
    if (!vendor_id || !bill_amount || !bill_category) return reply.code(400).send({ error: 'Missing required fields' })

    try {
      const { rows } = await pool.query(
        `INSERT INTO vendor_bills (vendor_id, lead_id, bill_date, bill_amount, bill_category, is_billable_to_client, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted') RETURNING *`,
        [vendor_id, lead_id || null, bill_date || null, bill_amount, bill_category, !!is_billable_to_client, notes || null]
      )
      try { await logAdminAudit(req, 'create', 'vendor_bill', rows[0].id, null, rows[0], auth.user.id) } catch (_) { }
      return reply.send(rows[0])
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to create bill' })
    }
  })

  api.get('/finance/vendor-bills/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    try {
      const billR = await pool.query(`
        SELECT vb.*, v.name as vendor_name, l.lead_number as lead_number, l.name as lead_name
        FROM vendor_bills vb
        JOIN vendors v ON v.id = vb.vendor_id
        LEFT JOIN leads l ON l.id = vb.lead_id
        WHERE vb.id = $1
      `, [id])
      if (!billR.rows.length) return reply.code(404).send({ error: 'Not found' })
      let bill = billR.rows[0]

      const { rows: attachments } = await pool.query(`SELECT id, file_url, uploaded_at FROM vendor_bill_attachments WHERE vendor_bill_id = $1 ORDER BY uploaded_at DESC`, [id])
      bill.attachments = attachments

      const { rows: payments } = await pool.query(`
        SELECT t.id as transaction_id, t.date, t.amount, t.note, ms.name as money_source_name
        FROM finance_transactions t
        LEFT JOIN money_sources ms ON ms.id = t.money_source_id
        WHERE t.vendor_bill_id = $1 AND t.is_deleted = false
      `, [id])
      bill.payments = payments

      return bill
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch bill' })
    }
  })

  api.patch('/finance/vendor-bills/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    const { status, is_billable_to_client, notes } = req.body || {}

    try {
      const current = await pool.query(`SELECT * FROM vendor_bills WHERE id = $1`, [id])
      if (!current.rows.length) return reply.code(404).send({ error: 'Not found' })

      const updates = []
      const values = []
      let i = 1
      if (status !== undefined) {
        const oldStatus = current.rows[0].status
        const allowedTransitions = {
          'submitted': ['approved', 'rejected'],
          'approved': ['paid', 'submitted'],
          'rejected': ['submitted'],
          'paid': ['approved']
        }
        if (status !== oldStatus && (!allowedTransitions[oldStatus] || !allowedTransitions[oldStatus].includes(status))) {
          return reply.code(400).send({ error: `Cannot transition bill from ${oldStatus} to ${status}` })
        }
        updates.push(`status = $${i++}`); values.push(status)
      }
      if (is_billable_to_client !== undefined) { updates.push(`is_billable_to_client = $${i++}`); values.push(is_billable_to_client) }
      if (notes !== undefined) { updates.push(`notes = $${i++}`); values.push(notes) }

      if (!updates.length) return current.rows[0]
      updates.push(`updated_at = NOW()`)
      values.push(id)

      const { rows } = await pool.query(
        `UPDATE vendor_bills SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      )
      try { await logAdminAudit(req, 'update', 'vendor_bill', id, current.rows[0], rows[0], auth.user.id) } catch (_) { }
      
      const newStatus = rows[0].status
      const oldStatus = current.rows[0].status
      if (newStatus !== oldStatus) {
        if (newStatus === 'approved') {
          await createNotification({ userId: rows[0].vendor_id, title: 'Bill Approved ✅', message: `Your bill for ₹${rows[0].bill_amount} was approved by Finance.`, category: 'VENDOR', type: 'SUCCESS', linkUrl: `/vendor/bills` })
        } else if (newStatus === 'rejected') {
          await createNotification({ userId: rows[0].vendor_id, title: 'Bill Rejected ❌', message: `Your bill for ₹${rows[0].bill_amount} requires revisions. Note: ${rows[0].notes || 'None given'}`, category: 'VENDOR', type: 'ERROR', linkUrl: `/vendor/bills` })
        }
      }

      return reply.send(rows[0])
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to update bill' })
    }
  })

  api.get('/finance/vendor-bills/:id/payments', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })

    try {
      const billExists = await pool.query(`SELECT id FROM vendor_bills WHERE id = $1`, [id])
      if (!billExists.rows.length) return reply.code(404).send({ error: 'Not found' })

      const { rows } = await pool.query(`
        SELECT t.id as transaction_id, t.date, t.amount, t.note,
               ms.name as money_source_name,
               t.created_at
        FROM finance_transactions t
        LEFT JOIN money_sources ms ON ms.id = t.money_source_id
        WHERE t.vendor_bill_id = $1 AND t.is_deleted = false
        ORDER BY t.date DESC, t.id DESC
      `, [id])
      return reply.send(rows)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch bill payments' })
    }
  })

  api.post('/finance/vendor-bills/:id/attachments', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    const { file_url } = req.body || {}
    if (!file_url) return reply.code(400).send({ error: 'File URL is required' })

    try {
      const { rows } = await pool.query(
        `INSERT INTO vendor_bill_attachments (vendor_bill_id, file_url) VALUES ($1, $2) RETURNING id, file_url, uploaded_at`,
        [id, file_url]
      )
      return rows[0]
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to add attachment' })
    }
  })

  api.delete('/finance/vendor-bills/:id/attachments/:attachment_id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    const attId = parseId(req.params.attachment_id)
    if (!id || !attId) return reply.code(400).send({ error: 'Invalid IDs' })

    try {
      const { rows } = await pool.query(
        `DELETE FROM vendor_bill_attachments WHERE id = $1 AND vendor_bill_id = $2 RETURNING id`,
        [attId, id]
      )
      if (!rows.length) return reply.code(404).send({ error: 'Not found' })
      return { success: true }
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to delete attachment' })
    }
  })

  /* ===================== VENDOR PORTAL v2.5/2.6 (READ-ONLY) ===================== */

  // Statement Dashboard
  api.get('/vendor/statement', async (req, reply) => {
    const ctx = await requireVendor(req, reply)
    if (!ctx) return
    const { date_from, date_to } = req.query || {}

    try {
      let paymentWhere = `t.direction = 'out' AND t.is_deleted = false AND vb.vendor_id = $1 AND vb.status = 'paid'`
      let billWhere = `vb.vendor_id = $1 AND vb.status IN ('approved', 'submitted')`

      const pValues = [ctx.vendor.id]
      const bValues = [ctx.vendor.id]
      let pI = 2
      let bI = 2

      if (date_from) {
        paymentWhere += ` AND t.date >= $${pI++}`
        pValues.push(date_from)
        billWhere += ` AND vb.bill_date >= $${bI++}`
        bValues.push(date_from)
      }
      if (date_to) {
        paymentWhere += ` AND t.date <= $${pI++}`
        pValues.push(date_to)
        billWhere += ` AND vb.bill_date <= $${bI++}`
        bValues.push(date_to)
      }

      // Payments
      const { rows: payments } = await pool.query(`
        SELECT t.id, t.date, t.amount,
               'payment' as record_type,
               'Paid' as status,
               l.lead_number as lead_num, l.name as lead_name
        FROM finance_transactions t
        JOIN vendor_bills vb ON vb.id = t.vendor_bill_id
        LEFT JOIN leads l ON l.id = vb.lead_id
        WHERE ${paymentWhere}
      `, pValues)

      // Bills
      const { rows: bills } = await pool.query(`
        SELECT vb.id, vb.bill_date as date, vb.bill_amount as amount,
               'bill' as record_type,
               vb.status,
               l.lead_number as lead_num, l.name as lead_name
        FROM vendor_bills vb
        LEFT JOIN leads l ON l.id = vb.lead_id
        WHERE ${billWhere}
      `, bValues)

      const history = [...payments, ...bills].sort((a, b) => {
        const d1 = new Date(a.date).getTime()
        const d2 = new Date(b.date).getTime()
        if (d1 !== d2) return d2 - d1 // latest first
        return b.id - a.id
      })

      // Calculate summary for the date range requested
      const totalPaid = payments.reduce((acc, p) => acc + Number(p.amount), 0)
      const pendingApprovedAmount = bills.filter(b => b.status === 'approved').reduce((acc, b) => acc + Number(b.amount), 0)
      const billsUnderReview = bills.filter(b => b.status === 'submitted').length

      return reply.send({
        summary: { totalPaid, pendingApprovedAmount, billsUnderReview },
        history
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch statement' })
    }
  })

  // Projects (Leads) — read-only list of unique projects this vendor has billed for
  api.get('/vendor/projects', async (req, reply) => {
    const ctx = await requireVendor(req, reply)
    if (!ctx) return
    try {
      const { rows } = await pool.query(`
        SELECT DISTINCT l.id, l.lead_number as lead_num, l.name as lead_name, l.bride_name, l.groom_name
        FROM vendor_bills vb
        JOIN leads l ON l.id = vb.lead_id
        WHERE vb.vendor_id = $1
        ORDER BY l.id DESC
      `, [ctx.vendor.id])

      const result = rows.map(r => ({
        id: r.id,
        name: `L#${r.lead_num} ${r.lead_name || ''}${r.bride_name && r.groom_name ? ` (${r.bride_name}–${r.groom_name})` : ''}`.trim()
      }))
      return reply.send(result)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch projects' })
    }
  })

  // My Payments — only transactions linked to PAID vendor bills
  api.get('/vendor/payments', async (req, reply) => {
    const ctx = await requireVendor(req, reply)
    if (!ctx) return
    const { date_from, date_to, lead_id } = req.query || {}

    try {
      let where = `vb.vendor_id = $1 AND vb.status = 'paid' AND ft.is_deleted = false AND ft.direction = 'out'`
      const values = [ctx.vendor.id]
      let i = 2

      if (date_from) { where += ` AND ft.date >= $${i++}`; values.push(date_from) }
      if (date_to) { where += ` AND ft.date <= $${i++}`; values.push(date_to) }
      if (lead_id) { where += ` AND vb.lead_id = $${i++}`; values.push(lead_id) }

      const { rows } = await pool.query(`
        SELECT ft.id, ft.date, ft.amount,
               vb.lead_id,
               l.lead_number as lead_num,
               l.name as lead_name, l.bride_name, l.groom_name
        FROM finance_transactions ft
        JOIN vendor_bills vb ON vb.id = ft.vendor_bill_id
        LEFT JOIN leads l ON l.id = vb.lead_id
        WHERE ${where}
        ORDER BY ft.date DESC
      `, values)

      const result = rows.map(r => ({
        id: r.id,
        date: r.date,
        amount: r.amount,
        project: r.lead_id ? `L#${r.lead_num} ${r.lead_name || ''}${r.bride_name && r.groom_name ? ` (${r.bride_name}–${r.groom_name})` : ''}`.trim() : null
      }))
      return reply.send(result)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch payments' })
    }
  })

  // My Bills — read-only list of the vendor's own bills
  api.get('/vendor/bills', async (req, reply) => {
    const ctx = await requireVendor(req, reply)
    if (!ctx) return
    const showRejected = req.query?.show_rejected === 'true'
    const statusFilter = req.query?.status
    const leadIdFilter = req.query?.lead_id

    try {
      let where = `vb.vendor_id = $1`
      const values = [ctx.vendor.id]
      let i = 2

      if (statusFilter) {
        where += ` AND vb.status = $${i++}`
        values.push(statusFilter)
      } else if (!showRejected) {
        where += ` AND vb.status != 'rejected'`
      }

      if (leadIdFilter) {
        where += ` AND vb.lead_id = $${i++}`
        values.push(leadIdFilter)
      }

      const { rows } = await pool.query(`
        SELECT vb.id, vb.bill_date, vb.bill_amount, vb.bill_category, vb.status, vb.notes, vb.lead_id,
               l.lead_number as lead_num,
               l.name as lead_name, l.bride_name, l.groom_name
        FROM vendor_bills vb
        LEFT JOIN leads l ON l.id = vb.lead_id
        WHERE ${where}
        ORDER BY vb.bill_date DESC NULLS LAST, vb.id DESC
      `, values)

      const result = rows.map(r => ({
        id: r.id,
        bill_date: r.bill_date,
        bill_amount: r.bill_amount,
        bill_category: r.bill_category,
        status: r.status,
        notes: r.notes,
        project: r.lead_id ? `L#${r.lead_num} ${r.lead_name || ''}${r.bride_name && r.groom_name ? ` (${r.bride_name}–${r.groom_name})` : ''}`.trim() : null
      }))
      return reply.send(result)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch bills' })
    }
  })

  // Submit Bill — vendor creates a new bill (status = submitted)
  api.post('/vendor/bills', async (req, reply) => {
    const ctx = await requireVendor(req, reply)
    if (!ctx) return
    const { bill_date, bill_amount, bill_category, lead_id, notes, receipt_url } = req.body || {}

    if (!bill_amount || Number(bill_amount) <= 0) return reply.code(400).send({ error: 'Bill amount is required' })
    if (!bill_category) return reply.code(400).send({ error: 'Bill category is required' })

    try {
      const { rows } = await pool.query(
        `INSERT INTO vendor_bills (vendor_id, lead_id, bill_date, bill_amount, bill_category, is_billable_to_client, notes, status)
         VALUES ($1, $2, $3, $4, $5, false, $6, 'submitted') RETURNING *`,
        [ctx.vendor.id, lead_id || null, bill_date || null, Number(bill_amount), bill_category, notes || null]
      )
      const newBill = rows[0]

      // If receipt URL provided, add as attachment
      if (receipt_url && String(receipt_url).trim()) {
        await pool.query(
          `INSERT INTO vendor_bill_attachments (vendor_bill_id, file_url) VALUES ($1, $2)`,
          [newBill.id, String(receipt_url).trim()]
        )
      }

      return reply.send(newBill)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to submit bill' })
    }
  })

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

  /* ===================== FINANCE — PAYROLL INTENT v1 ===================== */

  api.get('/finance/payroll/summary', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const month = normalizePayrollMonth(req.query?.month)
    if (!month) return reply.code(400).send({ error: 'month query param is required (YYYY-MM-01)' })

    try {
      const profilesR = await pool.query(`
        SELECT ecp.*, u.name as user_name, u.email as user_email, u.job_title
        FROM employee_compensation_profiles ecp
        JOIN users u ON u.id = ecp.user_id
        WHERE ecp.is_active = true
        ORDER BY u.name ASC
      `)

      const incentivesR = await pool.query(
        `
        SELECT ece.user_id, SUM(ece.amount) as total
        FROM employee_compensation_entries ece
        JOIN compensation_components cc ON cc.id = ece.component_id
        WHERE ece.month = $1 AND cc.component_type = 'earning' AND cc.is_variable = true
        GROUP BY ece.user_id
        `,
        [month]
      )

      const payoutMapR = await pool.query(
        `
        SELECT user_id, amount_paid, payout_date, leave_deduction, manual_adjustment, carry_forward_next, advance_next
        FROM employee_payouts
        WHERE month = $1
        `,
        [month]
      )

      const nextMonthDate = new Date(`${month}T00:00:00`)
      nextMonthDate.setMonth(nextMonthDate.getMonth() + 1)
      const nextMonth = dateToYMD(new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), 1))

      const nextPayoutR = await pool.query(
        `
        SELECT user_id, carry_forward_prev, carry_forward_next
        FROM employee_payouts
        WHERE month = $1
        `,
        [nextMonth]
      )

      const prevCarryR = await pool.query(
        `
        SELECT DISTINCT ON (user_id)
          user_id,
          carry_forward_next,
          advance_next
        FROM employee_payouts
        WHERE month < $1
        ORDER BY user_id, month DESC
        `,
        [month]
      )

      const incentiveMap = {}
      for (const row of incentivesR.rows) {
        incentiveMap[row.user_id] = Number(row.total || 0)
      }

      const paidMap = {}
      for (const row of payoutMapR.rows) {
        paidMap[row.user_id] = row
      }

      const nextMap = {}
      for (const row of nextPayoutR.rows) {
        nextMap[row.user_id] = row
      }

      const carryMap = {}
      for (const row of prevCarryR.rows) {
        const carryForwardNext = Number(row.carry_forward_next || 0)
        const advanceNext = Number(row.advance_next || 0)
        carryMap[row.user_id] = carryForwardNext - advanceNext
      }

      const summary = profilesR.rows.map((profile) => {
        const baseSalary = Number(profile.base_amount || 0)
        const incentives = Number(incentiveMap[profile.user_id] || 0)
        const payout = paidMap[profile.user_id]
        const nextPayout = nextMap[profile.user_id]
        const leaveDeduction = payout ? Number(payout.leave_deduction || 0) : 0
        const manualAdjustment = payout ? Number(payout.manual_adjustment || 0) : 0
        const carryForwardPrev = Number(carryMap[profile.user_id] || 0)
        const gross = baseSalary + incentives - leaveDeduction + manualAdjustment
        const netDue = gross + carryForwardPrev
        const carryForwardNext = payout ? Number(payout.carry_forward_next || 0) : 0
        const carrySettled = carryForwardNext > 0 && nextPayout
          ? Number(nextPayout.carry_forward_prev || 0) >= carryForwardNext && Number(nextPayout.carry_forward_next || 0) === 0
          : false

        return {
          user_id: profile.user_id,
          user_name: profile.user_name,
          role: profile.job_title || null,
          employment_type: profile.employment_type,
          base_salary: baseSalary,
          incentives,
          leave_deduction: leaveDeduction,
          manual_adjustment: manualAdjustment,
          carry_forward: carryForwardPrev,
          net_due: netDue,
          amount_paid: payout ? Number(payout.amount_paid || 0) : 0,
          carry_forward_next: carryForwardNext,
          advance_next: payout ? Number(payout.advance_next || 0) : 0,
          payout_exists: !!payout,
          carry_settled: carrySettled,
          payout_date: payout?.payout_date || null,
        }
      })

      return reply.send(summary)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to compute payroll summary' })
    }
  })

  api.post('/finance/payroll/draft', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const body = req.body || {}
    const userId = parseId(body.user_id)
    const month = normalizePayrollMonth(body.month)
    const leaveDeduction = Number(body.leave_deduction || 0)
    const manualAdjustment = Number(body.manual_adjustment || 0)

    if (!userId) return reply.code(400).send({ error: 'user_id is required' })
    if (!month) return reply.code(400).send({ error: 'month is required (YYYY-MM-01)' })
    if (!Number.isFinite(leaveDeduction) || leaveDeduction < 0) {
      return reply.code(400).send({ error: 'Leave deduction must be 0 or greater' })
    }
    if (!Number.isFinite(manualAdjustment)) {
      return reply.code(400).send({ error: 'Manual adjustment must be a number' })
    }

    try {
      const result = await withTransaction(async (client) => {
        const userR = await client.query(
          `
          SELECT u.id, u.name, ecp.base_amount
          FROM users u
          JOIN employee_compensation_profiles ecp ON ecp.user_id = u.id
          WHERE u.id = $1
          `,
          [userId]
        )
        if (!userR.rows.length) throw { code: 'USER_NOT_FOUND' }
        const userName = userR.rows[0].name
        const baseSalary = Number(userR.rows[0].base_amount || 0)

        const incentivesR = await client.query(
          `
          SELECT SUM(ece.amount) as total
          FROM employee_compensation_entries ece
          JOIN compensation_components cc ON cc.id = ece.component_id
          WHERE ece.month = $1 AND ece.user_id = $2 AND cc.component_type = 'earning' AND cc.is_variable = true
          `,
          [month, userId]
        )
        const incentives = Number(incentivesR.rows[0]?.total || 0)

        const prevCarryR = await client.query(
          `
          SELECT carry_forward_next, advance_next
          FROM employee_payouts
          WHERE user_id = $1 AND month < $2
          ORDER BY month DESC
          LIMIT 1
          `,
          [userId, month]
        )
        const carryForwardPrev = prevCarryR.rows.length
          ? Number(prevCarryR.rows[0].carry_forward_next || 0) - Number(prevCarryR.rows[0].advance_next || 0)
          : 0

        const gross = baseSalary + incentives - leaveDeduction + manualAdjustment
        const netDue = gross + carryForwardPrev

        const existingR = await client.query(
          `SELECT amount_paid FROM employee_payouts WHERE user_id = $1 AND month = $2`,
          [userId, month]
        )
        if (existingR.rows.length && Number(existingR.rows[0].amount_paid || 0) > 0) {
          throw { code: 'PAYMENT_ALREADY_RECORDED' }
        }

        const payoutR = await client.query(
          `INSERT INTO employee_payouts (
             user_id, month, total_payable, total_paid, payout_date, finance_transaction_id,
             base_salary, incentives, leave_deduction, manual_adjustment, carry_forward_prev,
             amount_paid, carry_forward_next, advance_next
           )
           VALUES ($1, $2, $3, 0, NULL, NULL, $4, $5, $6, $7, $8, 0, 0, 0)
           ON CONFLICT (user_id, month) DO UPDATE SET
             total_payable = EXCLUDED.total_payable,
             total_paid = 0,
             payout_date = NULL,
             finance_transaction_id = NULL,
             base_salary = EXCLUDED.base_salary,
             incentives = EXCLUDED.incentives,
             leave_deduction = EXCLUDED.leave_deduction,
             manual_adjustment = EXCLUDED.manual_adjustment,
             carry_forward_prev = EXCLUDED.carry_forward_prev,
             amount_paid = 0,
             carry_forward_next = 0,
             advance_next = 0
           RETURNING *`,
          [userId, month, netDue, baseSalary, incentives, leaveDeduction, manualAdjustment, carryForwardPrev]
        )

        await logAdminAudit(
          req,
          'create',
          'payroll_draft',
          payoutR.rows[0].id,
          null,
          {
            user_id: userId,
            user_name: userName,
            month,
            base_salary: baseSalary,
            incentives,
            leave_deduction: leaveDeduction,
            manual_adjustment: manualAdjustment,
            carry_forward_prev: carryForwardPrev,
            net_due: netDue,
          },
          auth.sub
        )

        return payoutR.rows[0]
      })

      return reply.send(result)
    } catch (err) {
      if (err?.code === 'USER_NOT_FOUND') return reply.code(404).send({ error: 'User not found' })
      if (err?.code === 'PAYMENT_ALREADY_RECORDED') return reply.code(400).send({ error: 'Payment already recorded for this month' })
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to save draft' })
    }
  })

  api.post('/finance/payroll/payouts', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const body = req.body || {}
    const userId = parseId(body.user_id)
    const month = normalizePayrollMonth(body.month)
    const paymentDate = normalizeDateValue(body.date)
    const moneySourceId = parseId(body.money_source_id)
    const amountPaid = Number(body.amount_paid)
    const leaveDeduction = Number(body.leave_deduction || 0)
    const manualAdjustment = Number(body.manual_adjustment || 0)
    const deductionReason = String(body.leave_deduction_reason || '').trim()
    const adjustmentReason = String(body.manual_adjustment_reason || '').trim()
    const advanceReason = String(body.advance_reason || '').trim()

    if (!userId) return reply.code(400).send({ error: 'user_id is required' })
    if (!month) return reply.code(400).send({ error: 'month is required (YYYY-MM-01)' })
    if (!paymentDate) return reply.code(400).send({ error: 'Valid date is required' })
    if (!moneySourceId) return reply.code(400).send({ error: 'Money source is required' })
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) return reply.code(400).send({ error: 'Valid amount is required' })
    if (leaveDeduction > 0 && !deductionReason) {
      return reply.code(400).send({ error: 'Leave deduction reason is required' })
    }
    if (manualAdjustment !== 0 && !adjustmentReason) {
      return reply.code(400).send({ error: 'Manual adjustment reason is required' })
    }

    try {
      const dupR = await pool.query(
        `
        SELECT 1
        FROM finance_transactions
        WHERE user_id = $1
          AND transaction_type = 'payroll'
          AND date = $2
          AND is_deleted = false
        LIMIT 1
        `,
        [userId, paymentDate]
      )
      if (dupR.rows.length) {
        return reply.code(400).send({ error: 'Duplicate payroll payment detected' })
      }

      const result = await withTransaction(async (client) => {
        const userR = await client.query(
          `
          SELECT u.id, u.name, ecp.base_amount
          FROM users u
          JOIN employee_compensation_profiles ecp ON ecp.user_id = u.id
          WHERE u.id = $1
          `,
          [userId]
        )
        if (!userR.rows.length) throw { code: 'USER_NOT_FOUND' }
        const userName = userR.rows[0].name
        const baseSalary = Number(userR.rows[0].base_amount || 0)

        const incentivesR = await client.query(
          `
          SELECT SUM(ece.amount) as total
          FROM employee_compensation_entries ece
          JOIN compensation_components cc ON cc.id = ece.component_id
          WHERE ece.month = $1 AND ece.user_id = $2 AND cc.component_type = 'earning' AND cc.is_variable = true
          `,
          [month, userId]
        )
        const incentives = Number(incentivesR.rows[0]?.total || 0)

        const prevCarryR = await client.query(
          `
          SELECT carry_forward_next, advance_next
          FROM employee_payouts
          WHERE user_id = $1 AND month < $2
          ORDER BY month DESC
          LIMIT 1
          `,
          [userId, month]
        )
        const carryForwardPrev = prevCarryR.rows.length
          ? Number(prevCarryR.rows[0].carry_forward_next || 0) - Number(prevCarryR.rows[0].advance_next || 0)
          : 0

        const gross = baseSalary + incentives - leaveDeduction + manualAdjustment
        const netDue = gross + carryForwardPrev

        const advanceNext = amountPaid > netDue ? amountPaid - netDue : 0
        const carryForwardNext = amountPaid < netDue ? netDue - amountPaid : 0

        if (advanceNext > 0 && !advanceReason) {
          throw { code: 'ADVANCE_REASON_REQUIRED' }
        }

        const categoryId = await getPayrollCategoryId(client)
        const monthLabel = new Date(month).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
        const fullNote = `Salary – ${userName} – ${monthLabel}`

        const txR = await client.query(
          `INSERT INTO finance_transactions (date, amount, direction, money_source_id, lead_id, is_overhead, category_id, note, user_id, transaction_type)
           VALUES ($1, $2, 'out', $3, NULL, true, $4, $5, $6, 'payroll')
           RETURNING id`,
          [paymentDate, amountPaid, moneySourceId, categoryId, fullNote, userId]
        )

        const ym = formatRefDate(paymentDate).slice(0, 6)
        await assignReferenceCode(client, txR.rows[0].id, `PAYROLL-${userId}-${ym}`)

        const payoutR = await client.query(
          `INSERT INTO employee_payouts (
             user_id, month, total_payable, total_paid, payout_date, finance_transaction_id,
             base_salary, incentives, leave_deduction, manual_adjustment, carry_forward_prev,
             amount_paid, carry_forward_next, advance_next
           )
           VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (user_id, month) DO UPDATE SET
             total_payable = EXCLUDED.total_payable,
             total_paid = EXCLUDED.total_paid,
             payout_date = EXCLUDED.payout_date,
             finance_transaction_id = NULL,
             base_salary = EXCLUDED.base_salary,
             incentives = EXCLUDED.incentives,
             leave_deduction = EXCLUDED.leave_deduction,
             manual_adjustment = EXCLUDED.manual_adjustment,
             carry_forward_prev = EXCLUDED.carry_forward_prev,
             amount_paid = EXCLUDED.amount_paid,
             carry_forward_next = EXCLUDED.carry_forward_next,
             advance_next = EXCLUDED.advance_next
           RETURNING *`,
          [
            userId,
            month,
            netDue,
            amountPaid,
            paymentDate,
            baseSalary,
            incentives,
            leaveDeduction,
            manualAdjustment,
            carryForwardPrev,
            amountPaid,
            carryForwardNext,
            advanceNext,
          ]
        )

        await logAdminAudit(
          req,
          'create',
          'payroll_payment',
          payoutR.rows[0].id,
          null,
          {
            user_id: userId,
            month,
            base_salary: baseSalary,
            incentives,
            leave_deduction: leaveDeduction,
            manual_adjustment: manualAdjustment,
            carry_forward_prev: carryForwardPrev,
            net_due: netDue,
            amount_paid: amountPaid,
            carry_forward_next: carryForwardNext,
            advance_next: advanceNext,
            leave_deduction_reason: deductionReason || null,
            manual_adjustment_reason: adjustmentReason || null,
            advance_reason: advanceReason || null,
          },
          auth.sub
        )

        return { payout: payoutR.rows[0] }
      })

      void recalculateAccountBalances()
      return reply.send(result)
    } catch (err) {
      if (err?.code === 'USER_NOT_FOUND') return reply.code(404).send({ error: 'User not found' })
      if (err?.code === 'ADVANCE_REASON_REQUIRED') return reply.code(400).send({ error: 'Advance reason is required when payment exceeds net due' })
      if (err?.code === '23503') return reply.code(400).send({ error: 'Invalid money source' })
      if (err?.code === '23514') return reply.code(400).send({ error: 'Payroll payment violates finance rules' })
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to record payroll payment' })
    }
  })

  // Create compensation profile
  api.post('/payroll/profiles', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { user_id, employment_type, base_amount } = req.body || {}
    if (!user_id || !employment_type) return reply.code(400).send({ error: 'user_id and employment_type are required' })

    try {
      const { rows } = await pool.query(
        `INSERT INTO employee_compensation_profiles (user_id, employment_type, base_amount)
         VALUES ($1, $2, $3) RETURNING *`,
        [user_id, employment_type, base_amount || null]
      )
      return reply.send(rows[0])
    } catch (err) {
      if (err?.code === '23505') return reply.code(400).send({ error: 'Profile already exists for this user' })
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to create profile' })
    }
  })

  // Update compensation profile
  api.patch('/payroll/profiles/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    const { employment_type, base_amount, is_active } = req.body || {}

    try {
      const updates = []
      const values = []
      let i = 1
      if (employment_type !== undefined) { updates.push(`employment_type = $${i++}`); values.push(employment_type) }
      if (base_amount !== undefined) { updates.push(`base_amount = $${i++}`); values.push(base_amount) }
      if (is_active !== undefined) { updates.push(`is_active = $${i++}`); values.push(is_active) }
      if (!updates.length) return reply.code(400).send({ error: 'Nothing to update' })
      updates.push(`updated_at = NOW()`)
      values.push(id)

      const { rows } = await pool.query(
        `UPDATE employee_compensation_profiles SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      )
      if (!rows.length) return reply.code(404).send({ error: 'Profile not found' })
      return reply.send(rows[0])
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to update profile' })
    }
  })

  // List compensation components
  api.get('/payroll/components', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const { rows } = await pool.query(`SELECT id, name, component_type, is_variable, rule_type, calculation_note FROM compensation_components ORDER BY id ASC`)
      return reply.send(rows)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch components' })
    }
  })

  // List entries for a month
  api.get('/payroll/entries', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const month = req.query?.month
    if (!month) return reply.code(400).send({ error: 'month query param is required (YYYY-MM-01)' })

    try {
      const { rows } = await pool.query(`
        SELECT ece.*, u.name as user_name, cc.name as component_name, cc.component_type,
               l.name as lead_name, l.bride_name, l.groom_name
        FROM employee_compensation_entries ece
        JOIN users u ON u.id = ece.user_id
        JOIN compensation_components cc ON cc.id = ece.component_id
        LEFT JOIN leads l ON l.id = ece.lead_id
        WHERE ece.month = $1
        ORDER BY u.name ASC, cc.id ASC
      `, [month])
      return reply.send(rows)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch entries' })
    }
  })

  // Add compensation entry
  api.post('/payroll/entries', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { user_id, component_id, amount, month, lead_id, notes } = req.body || {}
    if (!user_id || !component_id || !amount || !month) {
      return reply.code(400).send({ error: 'user_id, component_id, amount, and month are required' })
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO employee_compensation_entries (user_id, component_id, amount, month, lead_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [user_id, component_id, Number(amount), month, lead_id || null, notes || null]
      )
      return reply.send(rows[0])
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to add entry' })
    }
  })

  // Monthly summary — per-user breakdown: base + variable − deductions = payable
  api.get('/payroll/summary', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const month = req.query?.month
    if (!month) return reply.code(400).send({ error: 'month query param is required (YYYY-MM-01)' })

    try {
      // Get all active profiles
      const profilesR = await pool.query(`
        SELECT ecp.*, u.name as user_name, u.email as user_email
        FROM employee_compensation_profiles ecp
        JOIN users u ON u.id = ecp.user_id
        WHERE ecp.is_active = true
        ORDER BY u.name ASC
      `)

      // Get all entries up to this month to compute carry-forward
      const allEntriesR = await pool.query(`
        SELECT ece.user_id, ece.month, cc.component_type, cc.is_variable, SUM(ece.amount) as total
        FROM employee_compensation_entries ece
        JOIN compensation_components cc ON cc.id = ece.component_id
        WHERE ece.month <= $1
        GROUP BY ece.user_id, ece.month, cc.component_type, cc.is_variable
      `, [month])

      const entryMap = {} // user_id -> current month data
      const historyMap = {} // user_id -> all past months data

      for (const e of allEntriesR.rows) {
        // e.month is a Javascript Date object. Convert to YYYY-MM-01 format string to match `month`.
        const eMonthStr = toISTDateString(e.month)

        if (eMonthStr === month) {
          if (!entryMap[e.user_id]) entryMap[e.user_id] = { base_earnings: 0, var_earnings: 0, deductions: 0 }
          const amount = Number(e.total)
          if (e.component_type === 'earning') {
            if (e.is_variable) entryMap[e.user_id].var_earnings += amount
            else entryMap[e.user_id].base_earnings += amount
          } else {
            entryMap[e.user_id].deductions += amount
          }
        } else {
          // Accumulate history to find carry forward
          if (!historyMap[e.user_id]) historyMap[e.user_id] = {}
          if (!historyMap[e.user_id][eMonthStr]) historyMap[e.user_id][eMonthStr] = { e: 0, d: 0 }

          if (e.component_type === 'earning') historyMap[e.user_id][eMonthStr].e += Number(e.total)
          else historyMap[e.user_id][eMonthStr].d += Number(e.total)
        }
      }

      // Calculate carry forward per user
      const carryForwardMap = {}
      for (const userId in historyMap) {
        // Sort months ascending
        const pastMonths = Object.keys(historyMap[userId]).sort()
        let runningBalance = 0

        for (const m of pastMonths) {
          const mData = historyMap[userId][m]
          const profile = profilesR.rows.find(p => p.user_id === Number(userId))
          const bAmount = profile?.employment_type === 'salaried' ? Number(profile.base_amount || 0) : 0

          const monthEarnings = mData.e + bAmount
          const monthDeductions = mData.d

          // Net for that month: Add to running balance. 
          // If they made more than deductions, it "pays off" negative running balance.
          runningBalance += (monthEarnings - monthDeductions)
          if (runningBalance > 0) runningBalance = 0
        }

        if (runningBalance < 0) {
          carryForwardMap[userId] = Math.abs(runningBalance)
        }
      }

      const payoutsR = await pool.query(`SELECT * FROM employee_payouts WHERE month = $1`, [month])

      const payoutMap = {}
      for (const p of payoutsR.rows) {
        payoutMap[p.user_id] = p
      }

      const summary = profilesR.rows.map(profile => {
        const entry = entryMap[profile.user_id] || { base_earnings: 0, var_earnings: 0, deductions: 0 }
        const payout = payoutMap[profile.user_id] || null
        const carryForward = carryForwardMap[profile.user_id] || 0

        const baseAmount = profile.employment_type === 'salaried' ? Number(profile.base_amount || 0) : 0

        // Automatically include the employee's base salary in their earnings.
        // If there are also manual base adjustments (entry.base_earnings), add them.
        const totalEarnings = baseAmount + entry.var_earnings + entry.base_earnings
        const totalDeductions = entry.deductions
        const payable = totalEarnings - totalDeductions - carryForward

        return {
          user_id: profile.user_id,
          user_name: profile.user_name,
          user_email: profile.user_email,
          employment_type: profile.employment_type,
          base_amount: profile.base_amount,
          base_earnings: entry.base_earnings, // explicit base entries
          var_earnings: entry.var_earnings,
          earnings: totalEarnings,
          deductions: totalDeductions,
          carry_forward: carryForward,
          payable,
          total_paid: payout ? Number(payout.total_paid) : 0,
          payout_id: payout?.id || null,
          payout_date: payout?.payout_date || null,
        }
      })

      return reply.send(summary)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to compute summary' })
    }
  })

  /* ===================== CONTRIBUTION UNITS v1 ===================== */

  const CU_CATEGORIES = ['sales', 'planning', 'execution', 'post_production']
  const CU_ELIGIBLE_EMPLOYMENT_TYPES = ['salaried', 'stipend', 'salaried_plus_variable']

  const normalizeMonthStart = (value) => {
    if (!value) return null
    const trimmed = String(value).trim()
    if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return `${trimmed.slice(0, 7)}-01`
    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) return null
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    return `${parsed.getFullYear()}-${month}-01`
  }

  api.post('/contribution-units', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { user_id, lead_id, category, month, notes } = req.body || {}

    if (!user_id || !lead_id || !category || !month) {
      return reply.code(400).send({ error: 'user_id, lead_id, category, and month are required' })
    }

    if (!CU_CATEGORIES.includes(String(category))) {
      return reply.code(400).send({ error: 'Invalid category' })
    }

    const monthStart = normalizeMonthStart(month)
    if (!monthStart) return reply.code(400).send({ error: 'Invalid month' })

    const now = new Date()
    const currentMonthStart = dateToYMD(new Date(now.getFullYear(), now.getMonth(), 1))
    if (monthStart > currentMonthStart) {
      return reply.code(400).send({ error: 'Cannot log CU for a future month' })
    }

    try {
      const leadR = await pool.query(`SELECT id, name FROM leads WHERE id = $1`, [lead_id])
      if (!leadR.rows.length) return reply.code(404).send({ error: 'Lead not found' })

      const userR = await pool.query(
        `
        SELECT u.id, u.name, u.is_active, ecp.employment_type, ecp.is_active as profile_active
        FROM users u
        JOIN employee_compensation_profiles ecp ON ecp.user_id = u.id
        WHERE u.id = $1
        `,
        [user_id]
      )
      if (!userR.rows.length) return reply.code(400).send({ error: 'User is not eligible for CU logging' })
      const userRow = userR.rows[0]
      if (!userRow.is_active || !userRow.profile_active) {
        return reply.code(400).send({ error: 'User is not active' })
      }
      if (!CU_ELIGIBLE_EMPLOYMENT_TYPES.includes(userRow.employment_type)) {
        return reply.code(400).send({ error: 'User is not eligible for CU logging' })
      }

      const { rows } = await pool.query(
        `
        INSERT INTO contribution_units (user_id, lead_id, category, month, notes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [user_id, lead_id, category, monthStart, notes || null]
      )
      const newCu = rows[0]

      const countR = await pool.query(
        `SELECT COUNT(*)::int as count FROM contribution_units WHERE user_id = $1 AND month = $2`,
        [user_id, monthStart]
      )
      const cuCount = countR.rows[0]?.count || 0
      const warning = cuCount > 40 ? 'CU count exceeds recommended threshold for this month' : null

      await logAdminAudit(req, 'create', 'contribution_unit', newCu.id, null, newCu, auth.user?.id)

      return reply.send({
        ...newCu,
        user_name: userRow.name,
        lead_name: leadR.rows[0]?.name || null,
        warning
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to create contribution unit' })
    }
  })

  api.get('/contribution-units', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const leadId = parseId(req.query?.lead_id)
    const userId = parseId(req.query?.user_id)
    const monthStart = normalizeMonthStart(req.query?.month)

    const where = []
    const values = []
    let i = 1
    if (leadId) { where.push(`cu.lead_id = $${i++}`); values.push(leadId) }
    if (userId) { where.push(`cu.user_id = $${i++}`); values.push(userId) }
    if (monthStart) { where.push(`cu.month = $${i++}`); values.push(monthStart) }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    try {
      const { rows } = await pool.query(
        `
        SELECT cu.*, u.name as user_name, l.name as lead_name
        FROM contribution_units cu
        JOIN users u ON u.id = cu.user_id
        JOIN leads l ON l.id = cu.lead_id
        ${whereSql}
        ORDER BY cu.month DESC, cu.created_at DESC
        `,
        values
      )
      return reply.send(rows)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch contribution units' })
    }
  })

  api.delete('/contribution-units/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    const deleteReason = String(req.body?.delete_reason || '').trim()
    if (!deleteReason) return reply.code(400).send({ error: 'delete_reason is required' })

    try {
      const existingR = await pool.query(
        `
        SELECT cu.*, u.name as user_name, l.name as lead_name
        FROM contribution_units cu
        JOIN users u ON u.id = cu.user_id
        JOIN leads l ON l.id = cu.lead_id
        WHERE cu.id = $1
        `,
        [id]
      )
      if (!existingR.rows.length) return reply.code(404).send({ error: 'Contribution unit not found' })

      const existing = existingR.rows[0]
      await pool.query(`DELETE FROM contribution_units WHERE id = $1`, [id])
      await logAdminAudit(
        req,
        'delete',
        'contribution_unit',
        id,
        existing,
        { delete_reason: deleteReason },
        auth.user?.id
      )

      return reply.send({ success: true })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to delete contribution unit' })
    }
  })

  // List payouts for a month
  api.get('/payroll/payouts', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const month = req.query?.month
    if (!month) return reply.code(400).send({ error: 'month query param is required' })

    try {
      const { rows } = await pool.query(`
        SELECT ep.*, u.name as user_name
        FROM employee_payouts ep
        JOIN users u ON u.id = ep.user_id
        WHERE ep.month = $1
        ORDER BY u.name ASC
      `, [month])
      return reply.send(rows)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch payouts' })
    }
  })

  // Record payout
  api.post('/payroll/payouts', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { user_id, month, total_payable, total_paid, payout_date } = req.body || {}
    if (!user_id || !month) return reply.code(400).send({ error: 'user_id and month are required' })

    try {
      const result = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO employee_payouts (user_id, month, total_payable, total_paid, payout_date, finance_transaction_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, month) DO UPDATE SET
             total_payable = EXCLUDED.total_payable,
             total_paid = EXCLUDED.total_paid,
             payout_date = EXCLUDED.payout_date,
             finance_transaction_id = EXCLUDED.finance_transaction_id
           RETURNING *`,
          [user_id, month, Number(total_payable) || 0, Number(total_paid) || 0, payout_date || null, null]
        )

        return rows[0]
      })

      return reply.send(result)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to record payout' })
    }
  })

  /* ===================== LEADS ===================== */

  api.get('/leads', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    const isAdmin = auth ? (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin') : false
    const {
      status,
      source,
      heat,
      priority,
      overdue,
      followup_done,
      last_contacted_mode,
      last_contacted_from,
      last_contacted_to,
      not_contacted_min,
      created_mode,
      created_from,
      created_to,
      event_from,
      event_to,
      amount_min,
      amount_max,
      budget_min,
      budget_max,
      discount_min,
      discount_max,
    } = req.query || {}

    const toNumber = (value) => {
      const num = Number(value)
      return Number.isFinite(num) ? num : null
    }

    const amountMin = toNumber(amount_min)
    const amountMax = toNumber(amount_max)
    const budgetMin = toNumber(budget_min)
    const budgetMax = toNumber(budget_max)
    const discountMin = toNumber(discount_min)
    const discountMax = toNumber(discount_max)

    const where = []
    const params = []
    const addParam = (value) => {
      params.push(value)
      return `$${params.length}`
    }

    if (!isAdmin && auth && auth.sub) {
      where.push(`l.assigned_user_id = ${addParam(auth.sub)}`)
    }

    if (status) {
      const statusList = String(status)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      if (statusList.length > 1) {
        where.push(`l.status = ANY(${addParam(statusList)})`)
      } else if (statusList.length === 1) {
        where.push(`l.status = ${addParam(statusList[0])}`)
      }
    }
    if (source) {
      const sourceList = String(source)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      if (sourceList.length > 1) {
        where.push(`l.source = ANY(${addParam(sourceList)})`)
      } else if (sourceList.length === 1) {
        where.push(`l.source = ${addParam(sourceList[0])}`)
      }
    }
    if (heat) {
      const heatList = String(heat)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      if (heatList.length > 1) {
        where.push(`l.heat = ANY(${addParam(heatList)})`)
      } else if (heatList.length === 1) {
        where.push(`l.heat = ${addParam(heatList[0])}`)
      }
    }

    if (priority) {
      const priorityList = String(priority)
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
      const wantsImportant = priorityList.includes('important')
      const wantsPotential = priorityList.includes('potential')
      if (wantsImportant && wantsPotential) {
        where.push('(l.important = true OR l.potential = true)')
      } else if (wantsImportant) {
        where.push('l.important = true')
      } else if (wantsPotential) {
        where.push('l.potential = true')
      }
    }

    const wantsOverdue = overdue === 'true' || overdue === '1'
    const wantsDone = followup_done === 'true' || followup_done === '1'
    const doneClause = `
    (
      l.next_followup_date::date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
      AND (
        SELECT lf.outcome
        FROM lead_followups lf
        WHERE lf.lead_id = l.id
        ORDER BY lf.follow_up_at DESC NULLS LAST
        LIMIT 1
      ) = 'Connected'
    )
  `
    const overdueClause = `
    (
      l.next_followup_date::date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
      OR (
        l.next_followup_date::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        AND COALESCE((
          SELECT lf.outcome
          FROM lead_followups lf
          WHERE lf.lead_id = l.id
          ORDER BY lf.follow_up_at DESC NULLS LAST
          LIMIT 1
        ), 'Not Connected') = 'Not Connected'
      )
    )
  `
    if (wantsOverdue && wantsDone) {
      where.push(`(${doneClause} OR (${overdueClause}))`)
      where.push(`l.status NOT IN ('Converted','Lost','Rejected')`)
    } else if (wantsOverdue) {
      where.push(overdueClause)
      where.push(`l.status NOT IN ('Converted','Lost','Rejected')`)
    } else if (wantsDone) {
      where.push(doneClause)
    }

    if (not_contacted_min != null && not_contacted_min !== '') {
      const countVal = Number(not_contacted_min)
      if (Number.isFinite(countVal)) {
        where.push(`COALESCE(l.not_contacted_count, 0) >= ${addParam(countVal)}`)
      }
    }

    if (last_contacted_mode || last_contacted_from || last_contacted_to) {
      let fromDate = last_contacted_from
      let toDate = last_contacted_to
      if (last_contacted_mode === 'within_7') {
        fromDate = toISTDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))
        toDate = toISTDateString(new Date())
      } else if (last_contacted_mode === 'within_30') {
        fromDate = toISTDateString(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000))
        toDate = toISTDateString(new Date())
      }
      const clauses = []
      if (fromDate) clauses.push(`lf.follow_up_at::date >= ${addParam(fromDate)}`)
      if (toDate) clauses.push(`lf.follow_up_at::date <= ${addParam(toDate)}`)
      if (clauses.length) {
        where.push(
          `EXISTS (
          SELECT 1 FROM lead_followups lf
          WHERE lf.lead_id = l.id
          AND ${clauses.join(' AND ')}
        )`
        )
      }
    }

    if (created_mode) {
      if (created_mode === 'last_7') {
        where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= ${addParam(toISTDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)))}`)
      } else if (created_mode === 'last_30' || created_mode === 'between_7_30') {
        const fromDate = toISTDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        const toDate = toISTDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= ${addParam(fromDate)}`)
        where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= ${addParam(toDate)}`)
      } else if (created_mode === 'before_30') {
        where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= ${addParam(toISTDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))}`)
      }
    }
    if (created_from) where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= ${addParam(created_from)}`)
    if (created_to) where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= ${addParam(created_to)}`)

    if (event_from || event_to) {
      const clauses = []
      if (event_from) clauses.push(`e2.event_date >= ${addParam(event_from)}`)
      if (event_to) clauses.push(`e2.event_date <= ${addParam(event_to)}`)
      where.push(
        `EXISTS (
        SELECT 1 FROM lead_events e2
        WHERE e2.lead_id = l.id
        ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      )`
      )
    }

    if (amountMin != null) where.push(`l.amount_quoted >= ${addParam(amountMin)}`)
    if (amountMax != null) where.push(`l.amount_quoted <= ${addParam(amountMax)}`)
    if (budgetMin != null) where.push(`l.client_budget_amount >= ${addParam(budgetMin)}`)
    if (budgetMax != null) where.push(`l.client_budget_amount <= ${addParam(budgetMax)}`)
    if (discountMin != null) where.push(`l.discounted_amount >= ${addParam(discountMin)}`)
    if (discountMax != null) where.push(`l.discounted_amount <= ${addParam(discountMax)}`)

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const rows = (await pool.query(
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
    ${whereClause}
    GROUP BY l.id, u.name, u.nickname
    ORDER BY l.created_at DESC
    `,
      params
    )).rows

    return normalizeLeadRows(rows)
  })

  api.post('/leads/phone-duplicates', async (req) => {
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

  api.post('/leads/duplicate-check', async (req) => {
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

  // --- Notifications API ---
  api.get('/notifications', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    const userRole = auth.role
    const userId = auth.id

    let targetCondition = `(role_target = $1 OR user_id = $2)`
    if (userRole === 'admin') {
      targetCondition = `(role_target IN ($1, 'sales') OR user_id = $2)`
    }
    let queryParams = [userRole, userId]
    
    const countQuery = `SELECT count(*) FROM notifications WHERE ${targetCondition} AND is_read = false`
    const unreadCountResp = await pool.query(countQuery, queryParams)

    const listQuery = `
      SELECT * FROM notifications 
      WHERE ${targetCondition} 
      ORDER BY created_at DESC 
      LIMIT 100
    `
    const r = await pool.query(listQuery, queryParams)
    
    return {
      unread_count: parseInt(unreadCountResp.rows[0].count, 10),
      notifications: r.rows
    }
  })

  api.patch('/notifications/read-all', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    const userRole = auth.role
    const userId = auth.id

    let targetCondition = `(role_target = $1 OR user_id = $2)`
    if (userRole === 'admin') {
      targetCondition = `(role_target IN ($1, 'sales') OR user_id = $2)`
    }

    await pool.query(`
      UPDATE notifications 
      SET is_read = true, read_at = NOW() 
      WHERE is_read = false AND ${targetCondition}
    `, [userRole, userId])
    return { success: true }
  })

  api.patch('/notifications/:id/read', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    const { id } = req.params
    const ids = id.split(',').filter(Boolean)
    if (!ids.length) return { success: true }
    await pool.query(`UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = ANY($1::uuid[])`, [ids])
    return { success: true }
  })

  api.get('/dashboard/metrics', async (req) => {
    const auth = getAuthFromRequest(req)
    const isAdmin = auth ? (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin') : false
    let leadFilter = ""
    let params = []
    if (!isAdmin && auth && auth.sub) {
       params.push(auth.sub)
       leadFilter = `WHERE assigned_user_id = $1`
    }

    try {
      const r = await pool.query(
      `
    WITH auth_leads AS (SELECT * FROM leads ${leadFilter}),
    status_counts AS (
      SELECT status, COUNT(*)::int AS count
      FROM auth_leads
      GROUP BY status
    ),
    heat_counts AS (
      SELECT heat, COUNT(*)::int AS count
      FROM auth_leads
      WHERE status NOT IN ('Converted','Lost','Rejected')
      GROUP BY heat
    ),
    followups AS (
      SELECT
        SUM(CASE WHEN next_followup_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 1 ELSE 0 END)::int AS due_today,
        SUM(CASE WHEN next_followup_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 1 ELSE 0 END)::int AS overdue
      FROM auth_leads
      WHERE next_followup_date IS NOT NULL
        AND status NOT IN ('New','Converted','Lost','Rejected')
    ),
    priority AS (
      SELECT
        SUM(CASE WHEN important = true THEN 1 ELSE 0 END)::int AS important,
        SUM(CASE WHEN potential = true THEN 1 ELSE 0 END)::int AS potential
      FROM auth_leads
      WHERE status NOT IN ('Converted','Lost','Rejected')
    ),
    source_counts AS (
      SELECT COALESCE(NULLIF(source, ''), 'Unknown') AS source, COUNT(*)::int AS count
      FROM auth_leads
      GROUP BY COALESCE(NULLIF(source, ''), 'Unknown')
    ),
    today_activity AS (
      SELECT
        SUM(CASE WHEN activity_type = 'followup_done' THEN 1 ELSE 0 END)::int AS followups_completed,
        SUM(CASE WHEN activity_type = 'status_change' AND metadata->>'to' = 'Negotiation' THEN 1 ELSE 0 END)::int AS moved_to_negotiation
      FROM lead_activities
      JOIN auth_leads ON auth_leads.id = lead_activities.lead_id
      WHERE (lead_activities.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
    ),
    proposal_stats AS (
      SELECT
        COUNT(*)::int AS total_sent,
        SUM(CASE WHEN (ps.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 1 ELSE 0 END)::int AS sent_today,
        SUM(CASE WHEN (ps.last_viewed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 1 ELSE 0 END)::int AS viewed_today,
        SUM(CASE WHEN ps.snapshot_json->>'status' = 'ACCEPTED' THEN 1 ELSE 0 END)::int AS total_accepted,
        SUM(CASE WHEN ps.view_count > 0 THEN 1 ELSE 0 END)::int AS total_viewed,
        (SELECT COUNT(*)::int FROM proposal_views pv JOIN proposal_snapshots pss ON pv.proposal_snapshot_id = pss.id JOIN quote_versions qqv ON pss.quote_version_id = qqv.id JOIN quote_groups qqg ON qqv.quote_group_id = qqg.id JOIN auth_leads ccl ON ccl.id = qqg.lead_id WHERE (pv.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AND NOT EXISTS (SELECT 1 FROM known_internal_ips WHERE ip = pv.ip) AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE ip = pv.ip LIMIT 1)) as views_logged_today
      FROM proposal_snapshots ps
      JOIN quote_versions qv ON ps.quote_version_id = qv.id
      JOIN quote_groups qg ON qv.quote_group_id = qg.id
      JOIN auth_leads sl ON sl.id = qg.lead_id
    )
    SELECT
      COALESCE((SELECT json_object_agg(status, count) FROM status_counts), '{}'::json) AS status_counts,
      COALESCE((SELECT json_object_agg(heat, count) FROM heat_counts), '{}'::json) AS heat_counts,
      COALESCE((SELECT json_build_object('today', due_today, 'overdue', overdue) FROM followups), '{}'::json) AS followups,
      COALESCE((SELECT json_build_object('important', important, 'potential', potential) FROM priority), '{}'::json) AS priority,
      COALESCE((SELECT json_object_agg(source, count) FROM source_counts), '{}'::json) AS source_counts,
      COALESCE((SELECT json_build_object('followups_completed', followups_completed, 'moved_to_negotiation', moved_to_negotiation) FROM today_activity), '{}'::json) AS today_activity,
      COALESCE((SELECT row_to_json(proposal_stats.*) FROM proposal_stats), '{}'::json) AS proposal_stats
    `, params)
    const baseMetrics = r.rows[0]

    const revQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT 
        SUM(CASE WHEN status IN ('Quoted', 'Negotiation', 'Follow Up') THEN COALESCE(amount_quoted, client_budget_amount, 0) ELSE 0 END)::float as projected_revenue,
        SUM(CASE WHEN status = 'Converted' THEN COALESCE(amount_quoted, client_budget_amount, 0) ELSE 0 END)::float as converted_revenue
      FROM auth_leads
      WHERE status IN ('Quoted', 'Negotiation', 'Follow Up', 'Converted')
    `, params)

    const feedQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT 
        a.id,
        a.activity_type,
        a.metadata,
        a.created_at,
        l.id as lead_id,
        l.name as lead_name
      FROM lead_activities a
      JOIN auth_leads l ON l.id = a.lead_id
      ORDER BY a.created_at DESC
      LIMIT 12
    `, params)

    const dealSizeQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT
        COALESCE(AVG(CASE WHEN status NOT IN ('Lost','Rejected') AND COALESCE(amount_quoted, client_budget_amount) > 0
          THEN COALESCE(amount_quoted, client_budget_amount) END), 0)::float AS avg_deal_size,
        COALESCE(AVG(CASE WHEN status = 'Converted' AND COALESCE(amount_quoted, client_budget_amount) > 0
          THEN COALESCE(amount_quoted, client_budget_amount) END), 0)::float AS avg_closed_deal_size
      FROM auth_leads
    `, params)

    const leadsVolumeQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT
        SUM(CASE WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) THEN 1 ELSE 0 END)::int AS this_week,
        SUM(CASE WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) - interval '7 days'
                  AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') < date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) THEN 1 ELSE 0 END)::int AS last_week,
        SUM(CASE WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) THEN 1 ELSE 0 END)::int AS this_month,
        SUM(CASE WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) - interval '1 month'
                  AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') < date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) THEN 1 ELSE 0 END)::int AS last_month
      FROM auth_leads
    `, params)

    const staleQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT l.id, l.name, l.status, l.heat,
        COALESCE(amount_quoted, client_budget_amount) as deal_value,
        (SELECT MAX(a.created_at) FROM lead_activities a WHERE a.lead_id = l.id) as last_activity
      FROM auth_leads l
      WHERE l.status NOT IN ('Converted', 'Lost', 'Rejected')
        AND NOT EXISTS (
          SELECT 1 FROM lead_activities a
          WHERE a.lead_id = l.id AND (a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - interval '7 days'
        )
      ORDER BY COALESCE(amount_quoted, client_budget_amount, 0) DESC
      LIMIT 5
    `, params)

    const monthlyTrendQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT
        to_char(date_trunc('month', (converted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')), 'YYYY-MM') AS month,
        SUM(COALESCE(amount_quoted, client_budget_amount, 0))::float AS revenue,
        COUNT(*)::int AS deals
      FROM auth_leads
      WHERE status = 'Converted'
        AND converted_at IS NOT NULL
        AND (converted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - interval '6 months'
      GROUP BY date_trunc('month', (converted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'))
      ORDER BY date_trunc('month', (converted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) ASC
    `, params)

    return {
      ...baseMetrics,
      revenue: revQuery.rows[0],
      recent_activities: feedQuery.rows,
      deal_sizes: dealSizeQuery.rows[0],
      leads_volume: leadsVolumeQuery.rows[0],
      stale_leads: staleQuery.rows,
      monthly_trend: monthlyTrendQuery.rows
    }
    } catch (err) {
      console.error('Dashboard metrics error:', err)
      return { success: false, error: 'Internal server error' }
    }
  })

  api.get('/insights', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    const isAdmin = auth ? (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin') : false
    let leadFilter = ""
    let sourceFilter = ""
    let params = []
    if (!isAdmin && auth && auth.sub) {
       params.push(auth.sub)
       leadFilter = `AND l.assigned_user_id = $1`
       sourceFilter = `WHERE assigned_user_id = $1`
    }
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
      WHERE l.status = 'Converted' ${leadFilter}
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
      ${sourceFilter}
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
    `, params
      )
      return r.rows[0]
    } catch (err) {
      api.log.error(err)
      return reply.code(500).send({ error: err?.message || 'Internal Server Error' })
    }
  })

  api.get('/follow-ups', async (req) => {
    const auth = getAuthFromRequest(req)
    const isAdmin = auth ? (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin') : false
    
    let userFilter = "WHERE status NOT IN ('Converted','Lost','Rejected')"
    let params = []
    
    if (!isAdmin && auth && auth.sub) {
       params.push(auth.sub)
       userFilter += ` AND assigned_user_id = $1`
    }

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
      phone_primary,
      client_budget_amount,
      coverage_scope,
      amount_quoted,
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
    ${userFilter}
    ORDER BY created_at DESC
    `, params
    )
    return r.rows
  })

  api.post('/leads', async (req, reply) => {
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
      const authRoles = Array.isArray(auth?.roles) ? auth.roles : []
      const isSales = authRoles.includes('sales')
      const isAdmin = authRoles.includes('admin')

      if (isAdmin) {
        assignedUserId = await getRoundRobinSalesUserId(client)
        if (!assignedUserId) assignedUserId = auth.sub
      } else if (isSales) {
        assignedUserId = auth.sub
      } else {
        assignedUserId = await getRoundRobinSalesUserId(client)
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

  api.get('/leads/:id', async (req, reply) => {
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

    const auth = getAuthFromRequest(req)
    const isAdmin = auth ? (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin') : false
    if (!isAdmin && auth && auth.sub && r.rows[0].assigned_user_id !== auth.sub) {
      return reply.code(403).send({ error: 'Access denied: You are not assigned to this lead' })
    }

    const eventsRes = await pool.query(
      `SELECT id, event_type, event_date, pax, venue, start_time, end_time, slot, venue_id, venue_metadata, date_status FROM lead_events WHERE lead_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    )

    const citiesRes = await pool.query(
      `SELECT c.name FROM lead_cities lc JOIN cities c ON c.id = lc.city_id WHERE lc.lead_id = $1 AND lc.is_primary = true LIMIT 1`,
      [req.params.id]
    )

    const notesRes = await pool.query(
      `SELECT note_text FROM lead_notes WHERE lead_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    )

    const lead = normalizeLeadRow(r.rows[0])
    lead.events = eventsRes.rows
    lead.notes = notesRes.rows.map(n => n.note_text).join(' \n ')
    lead.city_name = citiesRes.rows[0]?.name || null

    return lead
  })

  api.patch('/leads/:id/intake', async (req, reply) => {
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

    return r.rows[0]
  })

  api.patch('/leads/:id/status', async (req, reply) => {
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
    const needsPrimaryEvent = ['Quoted', 'Follow Up', 'Negotiation', 'Awaiting Advance', 'Converted'].includes(status)

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
    const manualNextFollowupDate = req.body?.next_followup_date

    if (status === 'Converted' && !assignedUserId) {
      assignedUserId = await getRoundRobinSalesUserId()
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
        manualNextFollowupDate || null,
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

  api.patch('/leads/:id/heat', async (req, reply) => {
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

  api.post('/leads/:id/lost', async (req, reply) => {
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

  api.patch('/leads/:id/followup-date', async (req, reply) => {
    const { id } = req.params
    const { next_followup_date } = req.body || {}
    const auth = getAuthFromRequest(req)
    const leadId = Number(id)
    if (!Number.isInteger(leadId) || leadId <= 0) {
      return reply.code(400).send({ error: 'Invalid lead id' })
    }

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
      `SELECT next_followup_date, status FROM leads WHERE id=$1`,
      [leadId]
    )
    if (!current.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }
    if (['Converted', 'Lost', 'Rejected'].includes(current.rows[0]?.status)) {
      return reply.code(400).send({ error: 'Follow-up not allowed for this status' })
    }
    const previousRaw = current.rows[0]?.next_followup_date
    const previousDate = previousRaw ? dateToYMD(new Date(previousRaw)) : null

    const r = await pool.query(
      `UPDATE leads
     SET next_followup_date=$1, updated_at=NOW()
     WHERE id=$2
     RETURNING *, phone_primary AS primary_phone`,
      [normalizedDate, leadId]
    )

    if (previousDate !== normalizedDate) {
      await logLeadActivity(
        leadId,
        'followup_date_change',
        { log_type: 'activity', from: previousDate, to: normalizedDate },
        auth?.sub || null
      )
    }

    return normalizeLeadRow(r.rows[0])
  })

  api.post('/leads/:id/followup-done', async (req, reply) => {
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
    if (['Converted', 'Lost', 'Rejected'].includes(lead.status)) {
      return reply.code(400).send({ error: 'Follow-up not allowed for this status' })
    }

    const isAwaitingAdvance = lead.status === 'Awaiting Advance'
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
    } else if (lead.status === 'Awaiting Advance') {
      normalizedDate = addDaysYMD(3)
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
        const modeForType =
          typeof follow_up_mode === 'string' && follow_up_mode
            ? follow_up_mode.toLowerCase()
            : 'other'
        await pool.query(
          `INSERT INTO lead_followups (lead_id, follow_up_at, type, note, outcome, follow_up_mode, discussed_topics, not_connected_reason, user_id)
         VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
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

  api.get('/leads/:id/enrichment', async (req, reply) => {
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

  api.patch('/leads/:id/enrichment', async (req, reply) => {
    const { id } = req.params
    const payload = req.body
    const auth = getAuthFromRequest(req)
    const statusCheck = await pool.query(`SELECT status FROM leads WHERE id=$1`, [id])
    if (!statusCheck.rows.length) return reply.code(404).send({ error: 'Lead not found' })
    if (statusCheck.rows[0].status === 'Converted') {
      return reply.code(400).send({ error: 'Converted leads cannot be edited' })
    }

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

    const hasName = Object.prototype.hasOwnProperty.call(payload, 'name')
    const hasPrimaryPhone = Object.prototype.hasOwnProperty.call(payload, 'primary_phone')
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
    const isDestination = hasIsDestination ? !!payload.is_destination : !!existing.is_destination
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
          `SELECT u.id FROM users u 
           LEFT JOIN user_roles ur ON ur.user_id = u.id 
           LEFT JOIN roles r ON r.id = ur.role_id 
           WHERE u.id=$1 AND u.is_active = true AND (u.role = 'sales' OR r.key = 'sales')
           LIMIT 1`,
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

    const normalizeText = (val) => {
      if (val === undefined || val === null) return null
      const str = String(val).trim()
      return str.length ? str : null
    }
    const textChanged = (fromVal, toVal) => normalizeText(fromVal) !== normalizeText(toVal)
    const boolLabel = (val) => (val ? 'Yes' : 'No')

    const existingName = normalizeText(existing.name)
    const nextName = hasName ? normalizeText(formatName(payload.name)) : existingName
    const nameChanged = hasName && textChanged(existingName, nextName)

    const existingPrimaryPhone = normalizeText(existing.phone_primary)
    const nextPrimaryPhone = hasPrimaryPhone ? normalizeText(resolvedPrimaryPhone) : existingPrimaryPhone
    const primaryPhoneChanged = hasPrimaryPhone && textChanged(existingPrimaryPhone, nextPrimaryPhone)

    const existingPhoneSecondary = normalizeText(existing.phone_secondary)
    const nextPhoneSecondaryVal = hasPhoneSecondary ? normalizeText(nextPhoneSecondary) : existingPhoneSecondary
    const phoneSecondaryChanged = hasPhoneSecondary && textChanged(existingPhoneSecondary, nextPhoneSecondaryVal)

    const existingEmailVal = normalizeText(existing.email)
    const nextEmailVal = hasEmail ? normalizeText(nextEmail) : existingEmailVal
    const emailChanged = hasEmail && textChanged(existingEmailVal, nextEmailVal)

    const existingEventType = normalizeText(existing.event_type)
    const nextEventTypeVal = hasEventType ? normalizeText(nextEventType) : existingEventType
    const eventTypeChanged = hasEventType && textChanged(existingEventType, nextEventTypeVal)

    const existingCoverageScope = normalizeText(existing.coverage_scope || 'Both Sides')
    const nextCoverageScopeVal = hasCoverageScope ? normalizeText(nextCoverageScope) : existingCoverageScope
    const coverageChanged = hasCoverageScope && textChanged(existingCoverageScope, nextCoverageScopeVal)

    const existingIsDestinationVal =
      existing.is_destination === null || existing.is_destination === undefined
        ? null
        : !!existing.is_destination
    const nextIsDestinationVal = hasIsDestination ? !!isDestination : existingIsDestinationVal
    const isDestinationChanged =
      hasIsDestination && existingIsDestinationVal !== nextIsDestinationVal

    const existingPotentialVal =
      existing.potential === null || existing.potential === undefined ? null : !!existing.potential
    const nextPotentialVal =
      hasPotential && parsedPotential !== null ? !!parsedPotential : existingPotentialVal
    const potentialChanged =
      hasPotential && parsedPotential !== null && existingPotentialVal !== nextPotentialVal

    const existingImportantVal =
      existing.important === null || existing.important === undefined ? null : !!existing.important
    const nextImportantVal =
      hasImportant && parsedImportant !== null ? !!parsedImportant : existingImportantVal
    const importantChanged =
      hasImportant && parsedImportant !== null && existingImportantVal !== nextImportantVal

    const detailChanges = {}
    const addDetailChange = (field, from, to) => {
      if ((from ?? null) !== (to ?? null)) {
        detailChanges[field] = { from: from ?? null, to: to ?? null }
      }
    }

    if (amountQuotedChanged) {
      addDetailChange('amount_quoted', existingAmountQuoted, nextAmountQuotedNum)
    }
    if (clientBudgetChanged) {
      addDetailChange('client_budget_amount', existingClientBudget, nextClientBudgetNum)
    }
    if (nameChanged) {
      addDetailChange('name', existingName, nextName)
    }
    if (primaryPhoneChanged) {
      addDetailChange('phone_primary', existingPrimaryPhone, nextPrimaryPhone)
    }
    if (phoneSecondaryChanged) {
      addDetailChange('phone_secondary', existingPhoneSecondary, nextPhoneSecondaryVal)
    }
    if (emailChanged) {
      addDetailChange('email', existingEmailVal, nextEmailVal)
    }
    if (eventTypeChanged) {
      addDetailChange('event_type', existingEventType, nextEventTypeVal)
    }
    if (coverageChanged) {
      addDetailChange('coverage_scope', existingCoverageScope, nextCoverageScopeVal)
    }
    if (isDestinationChanged) {
      addDetailChange(
        'is_destination',
        existingIsDestinationVal === null ? '—' : boolLabel(existingIsDestinationVal),
        nextIsDestinationVal === null ? '—' : boolLabel(nextIsDestinationVal)
      )
    }
    if (potentialChanged) {
      addDetailChange(
        'potential',
        existingPotentialVal === null ? '—' : boolLabel(existingPotentialVal),
        nextPotentialVal === null ? '—' : boolLabel(nextPotentialVal)
      )
    }
    if (importantChanged) {
      addDetailChange(
        'important',
        existingImportantVal === null ? '—' : boolLabel(existingImportantVal),
        nextImportantVal === null ? '—' : boolLabel(nextImportantVal)
      )
    }

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

      if (Object.keys(detailChanges).length) {
        await logLeadActivity(
          id,
          'lead_field_change',
          { log_type: 'activity', section: 'details', changes: detailChanges },
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
  api.patch('/leads/:id/contact', async (req, reply) => {
    const { id } = req.params
    const c = req.body
    const auth = getAuthFromRequest(req)
    const statusCheck = await pool.query(`SELECT status FROM leads WHERE id=$1`, [id])
    if (!statusCheck.rows.length) return reply.code(404).send({ error: 'Lead not found' })
    if (statusCheck.rows[0].status === 'Converted') {
      return reply.code(400).send({ error: 'Converted leads cannot be edited' })
    }

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

    const existingRes = await pool.query(
      `SELECT
       name,
       phone_primary,
       phone_secondary,
       email,
       instagram,
       source,
       source_name,
       bride_name,
       bride_phone_primary,
       bride_phone_secondary,
       bride_email,
       bride_instagram,
       groom_name,
       groom_phone_primary,
       groom_phone_secondary,
       groom_email,
       groom_instagram
     FROM leads
     WHERE id=$1`,
      [id]
    )
    if (!existingRes.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }
    const existing = existingRes.rows[0]

    const storeSourceName = ['WhatsApp', 'Direct Call', 'Reference'].includes(c.source)
    const needsSourceName = storeSourceName
    let resolvedSourceName = storeSourceName && c.source_name ? String(c.source_name).trim() : null
    
    // Only validate source_name against users if source/source_name actually changed
    const sourceChanged = c.source !== existing.source || c.source_name !== existing.source_name
    
    if (needsSourceName) {
      if (!c.source_name || !String(c.source_name).trim()) {
        return reply.code(400).send({ error: 'Name is required for this source' })
      }
      if (['WhatsApp', 'Direct Call'].includes(c.source)) {
        if (sourceChanged) {
          const displayName = await resolveUserDisplayName(String(c.source_name))
          if (!displayName) {
            return reply.code(400).send({ error: 'Source name must match an existing user' })
          }
          resolvedSourceName = displayName
        } else {
          // If not changed, accept the existing value even if it wouldn't pass strict validation now
          resolvedSourceName = String(c.source_name).trim()
        }
      } else {
        resolvedSourceName = String(c.source_name).trim()
      }
    }

    const normalizeText = (val) => {
      if (val === undefined || val === null) return null
      const str = String(val).trim()
      return str.length ? str : null
    }
    const textChanged = (fromVal, toVal) => normalizeText(fromVal) !== normalizeText(toVal)

    const nextName = formatName(c.name)
    const nextPrimaryPhone = normalizePhone(c.primary_phone)
    const nextPhoneSecondary = normalizePhone(c.phone_secondary)
    const nextEmail = normalizedEmails.email || null
    const nextInstagram = normalizeInstagramUrl(c.instagram)
    const nextSource = c.source
    const nextSourceName = resolvedSourceName

    const nextBrideName = formatName(c.bride_name)
    const nextBridePrimary = normalizePhone(c.bride_phone_primary)
    const nextBrideSecondary = normalizePhone(c.bride_phone_secondary)
    const nextBrideEmail = normalizedEmails.bride_email || null
    const nextBrideInstagram = normalizeInstagramUrl(c.bride_instagram)

    const nextGroomName = formatName(c.groom_name)
    const nextGroomPrimary = normalizePhone(c.groom_phone_primary)
    const nextGroomSecondary = normalizePhone(c.groom_phone_secondary)
    const nextGroomEmail = normalizedEmails.groom_email || null
    const nextGroomInstagram = normalizeInstagramUrl(c.groom_instagram)

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

    const contactChanges = {}
    const addContactChange = (field, from, to) => {
      if (textChanged(from, to)) {
        contactChanges[field] = { from: normalizeText(from), to: normalizeText(to) }
      }
    }
    addContactChange('name', existing.name, nextName)
    addContactChange('phone_primary', existing.phone_primary, nextPrimaryPhone)
    addContactChange('phone_secondary', existing.phone_secondary, nextPhoneSecondary)
    addContactChange('email', existing.email, nextEmail)
    addContactChange('instagram', existing.instagram, nextInstagram)
    addContactChange('source', existing.source, nextSource)
    addContactChange('source_name', existing.source_name, nextSourceName)
    addContactChange('bride_name', existing.bride_name, nextBrideName)
    addContactChange('bride_phone_primary', existing.bride_phone_primary, nextBridePrimary)
    addContactChange('bride_phone_secondary', existing.bride_phone_secondary, nextBrideSecondary)
    addContactChange('bride_email', existing.bride_email, nextBrideEmail)
    addContactChange('bride_instagram', existing.bride_instagram, nextBrideInstagram)
    addContactChange('groom_name', existing.groom_name, nextGroomName)
    addContactChange('groom_phone_primary', existing.groom_phone_primary, nextGroomPrimary)
    addContactChange('groom_phone_secondary', existing.groom_phone_secondary, nextGroomSecondary)
    addContactChange('groom_email', existing.groom_email, nextGroomEmail)
    addContactChange('groom_instagram', existing.groom_instagram, nextGroomInstagram)

    if (Object.keys(contactChanges).length) {
      await logLeadActivity(
        id,
        'lead_field_change',
        { log_type: 'activity', section: 'contact', changes: contactChanges },
        auth?.sub || null
      )
    }

    return normalizeLeadRow(r.rows[0])
  })

  /* ===================== NOTES ===================== */
  api.get('/leads/:id/notes', async (req, reply) => {
    const r = await pool.query(
      `SELECT id, lead_id, note_text, status_at_time, created_at
     FROM lead_notes
     WHERE lead_id=$1
     ORDER BY created_at ASC`,
      [req.params.id]
    )

    return r.rows
  })

  api.post('/leads/:id/notes', async (req, reply) => {
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

  api.patch('/leads/:id/notes/:noteId', async (req, reply) => {
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

  api.get('/leads/:id/activities', async (req, reply) => {
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
    } catch (err) {
      return reply.code(500).send({ error: 'Unable to load activities' })
    }
  })

  api.get('/leads/:id/metrics', async (req, reply) => {
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

  api.get('/admin/activity-summary', async (req, reply) => {
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
      WHERE (a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
      ${activityUserClause}
      UNION ALL
      SELECT id
      FROM lead_notes n
      WHERE (n.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
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
      WHERE (a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
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
      WHERE (n.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
      ${notesUserClause}
    ) t
    ORDER BY created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
      rowsParams
    )

    const summaryRes = await pool.query(
      `
    SELECT
      t.user_id,
      t.user_name,
      t.user_nickname,
      t.user_email,
      t.user_role,
      t.activity_type,
      COUNT(*)::int AS count
    FROM (
      SELECT
        a.user_id,
        u.name AS user_name,
        u.nickname AS user_nickname,
        u.email AS user_email,
        u.role AS user_role,
        a.activity_type
      FROM lead_activities a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE (a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
      ${activityUserClause}
      UNION ALL
      SELECT
        n.user_id,
        u.name AS user_name,
        u.nickname AS user_nickname,
        u.email AS user_email,
        u.role AS user_role,
        'note_added'::text AS activity_type
      FROM lead_notes n
      LEFT JOIN users u ON u.id = n.user_id
      WHERE (n.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
      ${notesUserClause}
    ) t
    GROUP BY t.user_id, t.user_name, t.user_nickname, t.user_email, t.user_role, t.activity_type
    `,
      baseParams
    )

    const recentRes = await pool.query(
      `
    SELECT *
    FROM (
      SELECT
        t.*,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(t.user_id, -1)
          ORDER BY t.created_at DESC
        ) AS rn
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
        WHERE (a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
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
        WHERE (n.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
        ${notesUserClause}
      ) t
    ) ranked
    WHERE rn <= 10
    ORDER BY created_at DESC
    `,
      baseParams
    )

    const summaryMap = new Map()
    for (const row of summaryRes.rows) {
      const key = row.user_id ?? 'system'
      if (!summaryMap.has(String(key))) {
        summaryMap.set(String(key), {
          user_id: row.user_id ?? null,
          user_name: row.user_name || null,
          user_nickname: row.user_nickname || null,
          user_email: row.user_email || null,
          user_role: row.user_role || null,
          total: 0,
          counts: {},
        })
      }
      const entry = summaryMap.get(String(key))
      entry.counts[row.activity_type] = row.count
      entry.total += row.count
    }

    const recentByUser = new Map()
    for (const row of recentRes.rows) {
      const key = row.user_id ?? 'system'
      if (!recentByUser.has(String(key))) recentByUser.set(String(key), [])
      recentByUser.get(String(key)).push(row)
    }

    return {
      range: { start: startDate, end: endDate },
      page,
      page_size: pageSize,
      total: countRes.rows[0]?.count || 0,
      rows: rowsRes.rows,
      user_summaries: Array.from(summaryMap.values()),
      recent_by_user: Array.from(recentByUser.entries()).map(([key, items]) => ({
        user_id: key === 'system' ? null : Number(key),
        items,
      })),
    }
  })

  api.get('/admin/sales-performance', async (req, reply) => {
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
    const sessionsTableRes = await pool.query(
      "SELECT to_regclass('public.user_sessions') AS exists"
    )
    const hasSessionsTable = !!sessionsTableRes.rows[0]?.exists
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
        runMetricsJob(true, { from: startDate, to: endDate })
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
      WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
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

    const sessionsCte = hasSessionsTable
      ? `
    sessions AS (
      SELECT
        user_id,
        MAX(COALESCE(last_seen_at, logout_at, login_at)) AS last_seen_at
      FROM user_sessions
      GROUP BY user_id
    )`
      : `
    sessions AS (
      SELECT NULL::int AS user_id, NULL::timestamp AS last_seen_at
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
    ${followupsCte},
    ${sessionsCte}
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
      COALESCE(a.negotiation_entries, 0)::int AS negotiation_entries,
      s.last_seen_at AS last_seen_at
    FROM users_scope u
    LEFT JOIN metrics m ON m.user_id = u.id
    LEFT JOIN activity a ON a.user_id = u.id
    LEFT JOIN followups f ON f.user_id = u.id
    LEFT JOIN sessions s ON s.user_id = u.id
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

  /* ===================== QUOTES ===================== */
  api.get('/leads/:id/quotes', async (req, reply) => {
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

  api.post('/leads/:id/quotes', async (req, reply) => {
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

  api.post('/leads/:id/quotes/share', async (req, reply) => {
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

  api.patch('/leads/:id/proposal-draft', async (req, reply) => {
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

  api.put('/leads/:id/cities', async (req, reply) => {
    const { id } = req.params
    const { cities } = req.body
    const auth = getAuthFromRequest(req)

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
    if (leadStatus === 'Converted') {
      return reply.code(400).send({ error: 'Converted leads cannot be edited' })
    }
    const mustEnforce = ['Quoted', 'Follow Up', 'Negotiation', 'Converted'].includes(leadStatus)

    const formatCityLabel = (row) => {
      const name = String(row?.name || '').trim()
      if (!name) return ''
      return row?.is_primary ? `${name} (Primary)` : name
    }
    const normalizeCityLabel = (rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return ''
      const normalized = rows
        .map(row => ({
          name: String(row?.name || '').trim(),
          is_primary: !!row?.is_primary,
        }))
        .filter(row => row.name)
        .sort((a, b) => {
          if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
          return a.name.localeCompare(b.name)
        })
      return normalized.map(formatCityLabel).filter(Boolean).join(', ')
    }

    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      const existingCitiesRes = await client.query(
        `SELECT c.name, lc.is_primary
       FROM lead_cities lc
       JOIN cities c ON c.id = lc.city_id
       WHERE lc.lead_id=$1`,
        [id]
      )
      const existingCityLabel = normalizeCityLabel(existingCitiesRes.rows)
      const nextCityLabel = normalizeCityLabel(cities)

      await client.query('DELETE FROM lead_cities WHERE lead_id=$1', [id])

      let primaryCountry = 'India'

      for (const city of cities) {
        const cityId = await getOrCreateCity({
          name: (city.name || '').trim(),
          state: (city.state || '').trim(),
          country: city.country || 'India',
        }, client)

        if (city.is_primary) primaryCountry = city.country || 'India'

        await client.query(
          `INSERT INTO lead_cities (lead_id, city_id, is_primary)
         VALUES ($1,$2,$3)`,
          [id, cityId, city.is_primary]
        )
      }

      const isInternational = primaryCountry !== 'India'

      if (isInternational) {
        await client.query(
          `UPDATE leads
         SET is_destination=true,
             country=$1,
             updated_at=NOW()
         WHERE id=$2`,
          [primaryCountry, id]
        )
      } else {
        await client.query(
          `UPDATE leads
         SET country=$1,
             updated_at=NOW()
         WHERE id=$2`,
          [primaryCountry, id]
        )
      }

      // City-event linkage is now validated only during status transitions (not here)
      // This allows users to freely add/change/remove cities and fix events afterward

      if (existingCityLabel !== nextCityLabel) {
        await logLeadActivity(
          id,
          'lead_field_change',
          {
            log_type: 'activity',
            section: 'details',
            field: 'cities',
            from: existingCityLabel || '—',
            to: nextCityLabel || '—',
          },
          auth?.sub || null,
          client
        )
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

  api.post('/leads/:id/events', async (req, reply) => {
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
      venue_id,
      venue_metadata,
      date_status,
    } = req.body || {}

    if (event_type && String(event_type).trim().length > 50) {
      return reply.code(400).send({ error: 'Event name must be 50 characters or fewer' })
    }
    if (venue && String(venue).trim().length > 150) {
      return reply.code(400).send({ error: 'Venue must be 150 characters or fewer' })
    }

    const statusRes = await pool.query(`SELECT status FROM leads WHERE id=$1`, [id])
    if (!statusRes.rows.length) return reply.code(404).send({ error: 'Lead not found' })
    if (statusRes.rows[0].status === 'Converted') {
      return reply.code(400).send({ error: 'Converted leads cannot be edited' })
    }

    const normalizeEventDate = (value) => {
      if (!value) return null
      if (value instanceof Date) {
        const year = value.getFullYear()
        const month = String(value.getMonth() + 1).padStart(2, '0')
        const day = String(value.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
      const str = String(value)
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
      const parsed = new Date(str)
      if (!Number.isNaN(parsed.getTime())) {
        const year = parsed.getFullYear()
        const month = String(parsed.getMonth() + 1).padStart(2, '0')
        const day = String(parsed.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
      return str.slice(0, 10)
    }

    const validDateStatus = ['confirmed', 'tentative', 'tba'].includes(date_status) ? date_status : 'confirmed'
    const normalizedEventDate = normalizeEventDate(event_date)
    if (!normalizedEventDate && validDateStatus !== 'tba') {
      return reply.code(400).send({ error: 'Event date is required' })
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
    // Allow event creation without a city — validation happens at status transitions

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
      (lead_id, event_date, slot, start_time, end_time, event_type, pax, venue, description, city_id, position, venue_id, venue_metadata, date_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
      [
        id,
        normalizedEventDate,
        slot,
        start_time || null,
        end_time || null,
        event_type,
        pax,
        venue || null,
        description || null,
        finalCityId,
        pos.rows[0].p,
        venue_id || null,
        venue_metadata ? (typeof venue_metadata === 'object' ? JSON.stringify(venue_metadata) : venue_metadata) : null,
        validDateStatus,
      ]
    )

    let cityName = null
    if (finalCityId) {
      const cityRes = await pool.query('SELECT name FROM cities WHERE id=$1', [finalCityId])
      cityName = cityRes.rows[0]?.name || null
    }

    await logLeadActivity(
      id,
      'event_create',
      {
        log_type: 'activity',
        event_id: r.rows[0]?.id || null,
        event_date: normalizeEventDate(r.rows[0]?.event_date || normalizedEventDate) || null,
        slot: r.rows[0]?.slot || slot || null,
        event_name: r.rows[0]?.event_type || event_type || null,
        city_name: cityName,
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


  api.patch('/leads/:id/events/:eventId', async (req, reply) => {
    const { id, eventId } = req.params
    const auth = getAuthFromRequest(req)
    let { event_date, slot, start_time, end_time, event_type, pax, venue, description, city_id, venue_id, venue_metadata, date_status } =
      req.body || {}

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
    const normalizeDateValue = (value) => {
      if (!value) return null
      if (value instanceof Date) {
        const year = value.getFullYear()
        const month = String(value.getMonth() + 1).padStart(2, '0')
        const day = String(value.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
      const str = String(value)
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
      const parsed = new Date(str)
      if (!Number.isNaN(parsed.getTime())) {
        const year = parsed.getFullYear()
        const month = String(parsed.getMonth() + 1).padStart(2, '0')
        const day = String(parsed.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
      return str.slice(0, 10)
    }
    const normalizeTimeValue = (value) => {
      if (!value) return null
      const str = String(value)
      return str.length >= 5 ? str.slice(0, 5) : str
    }
     const validDateStatus = date_status !== undefined ? (['confirmed', 'tentative', 'tba'].includes(date_status) ? date_status : e.date_status) : e.date_status
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
      venue_id: venue_id ?? e.venue_id,
      venue_metadata: venue_metadata ?? e.venue_metadata,
      date_status: validDateStatus || 'confirmed',
    }
    const cityIds = [e.city_id, nextValues.city_id].filter((val) => val !== null && val !== undefined)
    const cityNameMap = {}
    if (cityIds.length) {
      const uniqueCityIds = Array.from(new Set(cityIds.map((val) => Number(val))))
      const cityRes = await pool.query(
        `SELECT id, name FROM cities WHERE id = ANY($1)`,
        [uniqueCityIds]
      )
      for (const row of cityRes.rows) {
        cityNameMap[row.id] = row.name
      }
    }
    const resolveCityName = (val) => {
      if (val === null || val === undefined) return null
      const key = Number(val)
      return cityNameMap[key] || null
    }
    const changes = {}
    const addChange = (field, from, to) => {
      if ((from ?? null) !== (to ?? null)) {
        changes[field] = { from: from ?? null, to: to ?? null }
      }
    }
    addChange('event_date', normalizeDateValue(e.event_date), normalizeDateValue(nextValues.event_date))
    addChange('slot', e.slot, nextValues.slot)
    addChange('start_time', normalizeTimeValue(e.start_time), normalizeTimeValue(nextValues.start_time))
    addChange('end_time', normalizeTimeValue(e.end_time), normalizeTimeValue(nextValues.end_time))
    addChange('event_name', e.event_type, nextValues.event_type)
    addChange('pax', e.pax, nextValues.pax)
    addChange('venue', e.venue, nextValues.venue)
    addChange('description', e.description, nextValues.description)
    addChange('city', resolveCityName(e.city_id), resolveCityName(nextValues.city_id))
    addChange('venue_id', e.venue_id, nextValues.venue_id)
    addChange('venue_metadata', e.venue_metadata, nextValues.venue_metadata)
    const statusRes = await pool.query(`SELECT status FROM leads WHERE id=$1`, [id])
    if (!statusRes.rows.length) return reply.code(404).send({ error: 'Lead not found' })
    const leadStatus = statusRes.rows[0].status
    if (leadStatus === 'Converted') {
      return reply.code(400).send({ error: 'Converted leads cannot be edited' })
    }
    const mustEnforce = ['Quoted', 'Follow Up', 'Negotiation', 'Converted'].includes(leadStatus)
    const nextCityId = city_id ?? e.city_id

    // City-event linkage validated during status transitions, not here
    // This allows users to freely reassign events to different cities

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
      venue_id=$10,
      venue_metadata=$11,
      date_status=$12,
      updated_at=NOW()
     WHERE id=$13 AND lead_id=$14
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
        nextValues.venue_id,
        nextValues.venue_metadata ? (typeof nextValues.venue_metadata === 'object' ? JSON.stringify(nextValues.venue_metadata) : nextValues.venue_metadata) : null,
        nextValues.date_status || 'confirmed',
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

  api.delete('/leads/:id/events/:eventId', async (req, reply) => {
    const { id, eventId } = req.params
    const auth = getAuthFromRequest(req)
    const eventRes = await pool.query(
      `SELECT e.id, e.event_date, e.slot, e.event_type, e.city_id, c.name AS city_name
     FROM lead_events e
     LEFT JOIN cities c ON c.id = e.city_id
     WHERE e.id=$1 AND e.lead_id=$2`,
      [eventId, id]
    )
    const eventInfo = eventRes.rows[0] || null
    const statusRes = await pool.query(`SELECT status FROM leads WHERE id=$1`, [id])
    if (!statusRes.rows.length) return reply.code(404).send({ error: 'Lead not found' })
    const leadStatus = statusRes.rows[0].status
    if (leadStatus === 'Converted') {
      return reply.code(400).send({ error: 'Converted leads cannot be edited' })
    }
    const mustEnforce = ['Quoted', 'Follow Up', 'Negotiation', 'Converted'].includes(leadStatus)

    // City-event linkage validated during status transitions, not here
    // This allows users to freely delete events and fix cities afterward

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
          event_date: eventInfo.event_date ? normalizeDateValue(eventInfo.event_date) : null,
          slot: eventInfo.slot || null,
          event_name: eventInfo.event_type || null,
          city_name: eventInfo.city_name || null,
        },
        auth?.sub || null
      )
    }
    return { success: true }
  })

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

  /* ===================== REPORTS ===================== */

  api.get('/reports/funnel', async (req) => {
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
  api.get('/reports/heat-distribution', async (req) =>
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

  /* ===================== CITIES ===================== */

  api.get('/cities', async () =>
    (await pool.query(
      `SELECT id, name, state, country FROM cities ORDER BY name`
    )).rows
  )

  /* ===================== OPERATIONAL ROLES ===================== */
  const mapOperationalRole = (row) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    active: row.active,
    createdAt: row.createdAt,
  })

  api.get('/operational-roles', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const rows = await pool.query(
      `SELECT id, category, name, active, created_at AS "createdAt"
       FROM operational_roles
       ORDER BY active DESC, category, name`
    )
    return rows.rows.map(mapOperationalRole)
  })

  api.post('/operational-roles', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const category = String(req.body?.category || '').trim()
    const name = String(req.body?.name || '').trim()
    const active = req.body?.active !== undefined ? Boolean(req.body.active) : true
    if (!category) return reply.code(400).send({ error: 'Category is required' })
    if (!name) return reply.code(400).send({ error: 'Name is required' })
    const exists = await pool.query(
      `SELECT id FROM operational_roles WHERE LOWER(name) = LOWER($1)`,
      [name]
    )
    if (exists.rows.length) {
      return reply.code(400).send({ error: 'Role already exists' })
    }
    const r = await pool.query(
      `INSERT INTO operational_roles (category, name, active)
       VALUES ($1, $2, $3)
       RETURNING id, category, name, active, created_at AS "createdAt"`,
      [category, name, active]
    )
    const role = mapOperationalRole(r.rows[0])
    await pool.query(
      `INSERT INTO team_role_catalog (name, price, unit_type, active, created_at, operational_role_id)
       VALUES ($1, 0, 'PER_DAY', $2, NOW(), $3)
       ON CONFLICT DO NOTHING`,
      [role.name, role.active, role.id]
    )
    return role
  })

  api.patch('/operational-roles/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const fields = []
    const values = []
    if (req.body?.category !== undefined) {
      const category = String(req.body.category || '').trim()
      if (!category) return reply.code(400).send({ error: 'Category is required' })
      values.push(category)
      fields.push(`category=$${values.length}`)
    }
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim()
      if (!name) return reply.code(400).send({ error: 'Name is required' })
      values.push(name)
      fields.push(`name=$${values.length}`)
    }
    if (req.body?.active !== undefined) {
      values.push(Boolean(req.body.active))
      fields.push(`active=$${values.length}`)
    }
    if (!fields.length) return reply.code(400).send({ error: 'No fields to update' })
    values.push(Number(req.params.id))
    const r = await pool.query(
      `UPDATE operational_roles
       SET ${fields.join(', ')}
       WHERE id=$${values.length}
       RETURNING id, category, name, active, created_at AS "createdAt"`,
      values
    )
    if (!r.rows.length) return reply.code(404).send({ error: 'Role not found' })
    const updatedRole = mapOperationalRole(r.rows[0])
    const updates = []
    const params = []
    if (req.body?.name !== undefined) {
      params.push(updatedRole.name)
      updates.push(`name=$${params.length}`)
    }
    if (req.body?.active !== undefined) {
      params.push(updatedRole.active)
      updates.push(`active=$${params.length}`)
    }
    if (updates.length) {
      params.push(updatedRole.id)
      await pool.query(
        `UPDATE team_role_catalog
         SET ${updates.join(', ')}
         WHERE operational_role_id=$${params.length}`,
        params
      )
    }
    return updatedRole
  })

  /* ===================== PRICING CATALOG ===================== */
  const UNIT_TYPES = new Set(['PER_DAY', 'PER_UNIT', 'FLAT'])
  const mapCatalogRow = (row) => ({
    id: row.id,
    name: row.name,
    price: Number(row.price),
    unitType: row.unitType,
    active: row.active,
    createdAt: row.createdAt,
    category: row.category,
    description: row.description,
  })

  const mapTeamRoleRow = (row) => ({
    id: row.id,
    name: row.name,
    price: Number(row.price),
    unitType: row.unitType,
    active: row.active,
    createdAt: row.createdAt,
    operationalRoleId: row.operationalRoleId,
    category: row.category,
  })

  const listCatalog = async (table) => {
    const hasCategory = table === 'deliverable_catalog'
    const query = hasCategory 
      ? `SELECT id, name, price, unit_type AS "unitType", active, created_at AS "createdAt", category, description
         FROM ${table}
         ORDER BY active DESC, category, name`
      : `SELECT id, name, price, unit_type AS "unitType", active, created_at AS "createdAt"
         FROM ${table}
         ORDER BY active DESC, name`
    
    return (await pool.query(query)).rows.map(mapCatalogRow)
  }

  const listTeamRoleCatalog = async () =>
    (await pool.query(
      `SELECT tr.id,
              COALESCE(orole.name, tr.name) AS name,
              tr.price,
              tr.unit_type AS "unitType",
              tr.active,
              tr.created_at AS "createdAt",
              tr.operational_role_id AS "operationalRoleId",
              orole.category AS category
       FROM team_role_catalog tr
       LEFT JOIN operational_roles orole ON orole.id = tr.operational_role_id
       ORDER BY tr.active DESC, COALESCE(orole.name, tr.name)`
    )).rows.map(mapTeamRoleRow)

  const createCatalogItem = async (table, payload) => {
    const name = String(payload?.name || '').trim()
    const price = Number(payload?.price)
    const unitType = String(payload?.unitType || '').trim()
    const active = payload?.active !== undefined ? Boolean(payload.active) : true
    const isDeliverable = table === 'deliverable_catalog'
    const category = payload?.category && ['PHOTO', 'VIDEO', 'OTHER'].includes(payload.category) ? payload.category : 'OTHER'
    const description = payload?.description || null

    if (!name) throw new Error('Name is required')
    if (!Number.isFinite(price) || price <= 0) throw new Error('Price must be greater than 0')
    if (!UNIT_TYPES.has(unitType)) throw new Error('Invalid unit type')

    let r;
    if (isDeliverable) {
      r = await pool.query(
        `INSERT INTO ${table} (name, price, unit_type, active, category, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, price, unit_type AS "unitType", active, created_at AS "createdAt", category, description`,
        [name, price, unitType, active, category, description]
      )
    } else {
      r = await pool.query(
        `INSERT INTO ${table} (name, price, unit_type, active)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, price, unit_type AS "unitType", active, created_at AS "createdAt"`,
        [name, price, unitType, active]
      )
    }
    return mapCatalogRow(r.rows[0])
  }

  const updateCatalogItem = async (table, id, payload) => {
    const fields = []
    const values = []
    const isDeliverable = table === 'deliverable_catalog'

    if (payload?.name !== undefined) {
      const name = String(payload.name || '').trim()
      if (!name) throw new Error('Name is required')
      values.push(name)
      fields.push(`name=$${values.length}`)
    }
    if (payload?.price !== undefined) {
      const price = Number(payload.price)
      if (!Number.isFinite(price) || price <= 0) throw new Error('Price must be greater than 0')
      values.push(price)
      fields.push(`price=$${values.length}`)
    }
    if (payload?.unitType !== undefined) {
      const unitType = String(payload.unitType || '').trim()
      if (!UNIT_TYPES.has(unitType)) throw new Error('Invalid unit type')
      values.push(unitType)
      fields.push(`unit_type=$${values.length}`)
    }
    if (payload?.active !== undefined) {
      values.push(Boolean(payload.active))
      fields.push(`active=$${values.length}`)
    }
    if (isDeliverable && payload?.category !== undefined) {
      const cat = ['PHOTO', 'VIDEO', 'OTHER'].includes(payload.category) ? payload.category : 'OTHER'
      values.push(cat)
      fields.push(`category=$${values.length}`)
    }
    if (isDeliverable && payload?.description !== undefined) {
      values.push(payload.description || null)
      fields.push(`description=$${values.length}`)
    }
    if (!fields.length) throw new Error('No fields to update')
    values.push(Number(id))

    const returningStr = isDeliverable 
      ? 'id, name, price, unit_type AS "unitType", active, created_at AS "createdAt", category, description'
      : 'id, name, price, unit_type AS "unitType", active, created_at AS "createdAt"'

    const r = await pool.query(
      `UPDATE ${table}
       SET ${fields.join(', ')}
       WHERE id=$${values.length}
       RETURNING ${returningStr}`,
      values
    )
    if (!r.rows.length) return null
    return mapCatalogRow(r.rows[0])
  }

  const smartDeleteCatalogItem = async (table, id, itemType) => {
    const numId = Number(id)
    // Check if this item is referenced in any quote
    const ref = await pool.query(
      `SELECT 1 FROM quote_pricing_items WHERE catalog_id = $1 AND item_type = $2 LIMIT 1`,
      [numId, itemType]
    )
    if (ref.rows.length > 0) {
      // Referenced — soft archive
      const r = await pool.query(`UPDATE ${table} SET active = false WHERE id = $1 RETURNING *`, [numId])
      if (!r.rows.length) return null
      return { action: 'archived', item: mapCatalogRow(r.rows[0]) }
    }
    // Not referenced — permanent delete
    const r = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [numId])
    if (!r.rows.length) return null
    return { action: 'deleted', item: { id: numId } }
  }

  
  api.get('/pricing-rules', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { rows } = await pool.query('SELECT * FROM pricing_rules ORDER BY priority DESC')
    return rows.map(r => ({
      id: r.id,
      ruleName: r.rule_name,
      conditionsJson: r.conditions_json,
      defaultTeamJson: r.default_team_json,
      defaultDeliverablesJson: r.default_deliverables_json,
      priority: r.priority,
      active: r.active,
      createdAt: r.created_at
    }))
  })

  api.post('/pricing-rules', async (req, reply) => {
    try {
      const auth = await requireAdmin(req, reply)
      if (!auth) return
      const payload = req.body || {}
      const { rows } = await pool.query(
        `INSERT INTO pricing_rules (rule_name, conditions_json, default_team_json, default_deliverables_json, priority, active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          payload.ruleName || 'New Rule',
          JSON.stringify(payload.conditionsJson || {}),
          JSON.stringify(payload.defaultTeamJson || []),
          JSON.stringify(payload.defaultDeliverablesJson || []),
          payload.priority || 0,
          payload.active !== false
        ]
      )
      return rows[0]
    } catch (err) {
      reply.code(400).send({ error: err.message })
    }
  })

  api.patch('/pricing-rules/:id', async (req, reply) => {
    try {
      const auth = await requireAdmin(req, reply)
      if (!auth) return
      const payload = req.body || {}
      let setClauses = []
      let args = []
      let i = 1
      
      if (payload.ruleName !== undefined) { setClauses.push(`rule_name=$${i++}`); args.push(payload.ruleName) }
      if (payload.conditionsJson !== undefined) { setClauses.push(`conditions_json=$${i++}`); args.push(JSON.stringify(payload.conditionsJson)) }
      if (payload.defaultTeamJson !== undefined) { setClauses.push(`default_team_json=$${i++}`); args.push(JSON.stringify(payload.defaultTeamJson)) }
      if (payload.defaultDeliverablesJson !== undefined) { setClauses.push(`default_deliverables_json=$${i++}`); args.push(JSON.stringify(payload.defaultDeliverablesJson)) }
      if (payload.priority !== undefined) { setClauses.push(`priority=$${i++}`); args.push(payload.priority) }
      if (payload.active !== undefined) { setClauses.push(`active=$${i++}`); args.push(payload.active) }
      
      if (setClauses.length === 0) return reply.code(400).send({ error: 'No fields to update' })
      args.push(req.params.id)
      
      const { rows } = await pool.query(
        `UPDATE pricing_rules SET ${setClauses.join(', ')} WHERE id=$${i} RETURNING *`,
        args
      )
      if (!rows.length) return reply.code(404).send({ error: 'Not found' })
      return rows[0]
    } catch (err) {
      reply.code(400).send({ error: err.message })
    }
  })

  api.delete('/pricing-rules/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { rowCount } = await pool.query('DELETE FROM pricing_rules WHERE id=$1', [req.params.id])
    if (!rowCount) return reply.code(404).send({ error: 'Not found' })
    return { success: true }
  })

  api.get('/catalog/team-roles', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    return listTeamRoleCatalog()
  })

  api.post('/catalog/team-roles', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    reply.code(400).send({ error: 'Team roles are managed via Operational Roles' })
  })

  api.patch('/catalog/team-roles/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const updated = await updateCatalogItem('team_role_catalog', req.params.id, {
        price: req.body?.price,
        unitType: req.body?.unitType,
        active: req.body?.active,
      })
      if (!updated) return reply.code(404).send({ error: 'Item not found' })
      return updated
    } catch (err) {
      reply.code(400).send({ error: err.message })
    }
  })

  api.delete('/catalog/team-roles/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const result = await smartDeleteCatalogItem('team_role_catalog', req.params.id, 'TEAM_ROLE')
    if (!result) return reply.code(404).send({ error: 'Item not found' })
    return result
  })

  api.get('/catalog/deliverables', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    return listCatalog('deliverable_catalog')
  })

  api.post('/catalog/deliverables', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      return await createCatalogItem('deliverable_catalog', req.body || {})
    } catch (err) {
      reply.code(400).send({ error: err.message })
    }
  })

  api.patch('/catalog/deliverables/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const updated = await updateCatalogItem('deliverable_catalog', req.params.id, req.body || {})
      if (!updated) return reply.code(404).send({ error: 'Item not found' })
      return updated
    } catch (err) {
      reply.code(400).send({ error: err.message })
    }
  })

  api.delete('/catalog/deliverables/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const result = await smartDeleteCatalogItem('deliverable_catalog', req.params.id, 'DELIVERABLE')
    if (!result) return reply.code(404).send({ error: 'Item not found' })
    return result
  })

  // NEW: Public endpoint for quote viewer to see available addons
  api.get('/catalog/addons/public', async (req, reply) => {
    try {
      const { rows } = await pool.query(`
        SELECT id, name, price, unit_type, description 
        FROM deliverable_catalog 
        WHERE category::text = 'ADDON' AND active = true 
        ORDER BY name ASC
      `)
      return rows
    } catch (err) {
      // If ADDON enum value doesn't exist yet, return empty array
      return []
    }
  })

  // NEW: Public endpoint for fetching random covers (for Editor preview & viewers)
  api.get('/public/covers', async (req, reply) => {
    const { rows } = await pool.query(`
      SELECT file_url FROM photo_library WHERE 'cover' = ANY(tags) ORDER BY random() LIMIT 2
    `)
    return rows.map(r => r.file_url)
  })

  /* ===================== PENDING APPROVALS ===================== */

  api.get('/pending-approvals', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    const isAdmin = Array.isArray(auth.roles) ? auth.roles.includes('admin') : auth.role === 'admin'
    let userFilter = ""
    let params = []
    if (!isAdmin) {
       params.push(auth.sub)
       userFilter = `AND l.assigned_user_id = $1`
    }

    const baseSelect = `
        qv.id AS version_id,
        qv.version_number,
        qv.status,
        qv.calculated_price,
        qv.sales_override_price,
        qv.draft_data_json,
        to_char((qv.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+05:30"') AS submitted_at,
        qg.id AS group_id,
        qg.title AS quote_title,
        qg.lead_id,
        l.name AS lead_name,
        l.email AS lead_email
    `

    // 1. Pending approval
    const { rows: pending } = await pool.query(`
      SELECT ${baseSelect}
      FROM quote_versions qv
      JOIN quote_groups qg ON qg.id = qv.quote_group_id
      JOIN leads l ON l.id = qg.lead_id
      WHERE qv.status = 'PENDING_APPROVAL' ${userFilter}
      ORDER BY qv.created_at DESC
    `, params)

    // 2. Approved but NOT yet sent (disappears once a proposal_snapshot exists)
    const { rows: approved } = await pool.query(`
      SELECT ${baseSelect},
        to_char((qa.approved_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+05:30"') AS approved_at
      FROM quote_versions qv
      JOIN quote_groups qg ON qg.id = qv.quote_group_id
      JOIN leads l ON l.id = qg.lead_id
      LEFT JOIN quote_approvals qa ON qa.quote_version_id = qv.id
      WHERE qv.status = 'APPROVED' ${userFilter}
        AND qv.is_latest = true
        AND NOT EXISTS (
          SELECT 1 FROM proposal_snapshots ps WHERE ps.quote_version_id = qv.id
        )
      ORDER BY qa.approved_at DESC NULLS LAST, qv.created_at DESC
    `, params)

    // 3. Admin rejected — disappears once sales resubmits for approval (status changes to PENDING_APPROVAL)
    const { rows: rejected } = await pool.query(`
      SELECT ${baseSelect}
      FROM quote_versions qv
      JOIN quote_groups qg ON qg.id = qv.quote_group_id
      JOIN leads l ON l.id = qg.lead_id
      WHERE qv.status = 'ADMIN_REJECTED' ${userFilter}
      ORDER BY qv.created_at DESC
    `, params)

    return { pending, approved, rejected }
  })

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
        ps.snapshot_json->'status' AS status,
        ps.snapshot_json->'calculatedPrice' AS calculated_price,
        ps.snapshot_json->'salesOverridePrice' AS override_price,
        ps.snapshot_json->'draftData'->'hero'->'coupleNames' AS couple_names,
        ps.snapshot_json->'draftData'->'tiers' AS tiers,
        ps.snapshot_json->'draftData'->>'pricingMode' AS pricing_mode,
        ps.snapshot_json->'draftData'->>'selectedTierId' AS selected_tier_id,
        (SELECT COUNT(*)::int FROM proposal_views pv WHERE pv.proposal_snapshot_id = ps.id AND NOT EXISTS (SELECT 1 FROM known_internal_ips WHERE ip = pv.ip) AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE ip = pv.ip LIMIT 1)) AS total_views,
        (SELECT COUNT(DISTINCT ip)::int FROM proposal_views pv WHERE pv.proposal_snapshot_id = ps.id AND NOT EXISTS (SELECT 1 FROM known_internal_ips WHERE ip = pv.ip) AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE ip = pv.ip LIMIT 1)) AS unique_views
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
    const { rows } = await pool.query(
      'SELECT id FROM proposal_snapshots WHERE proposal_token = $1', [token]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Not found' })
    const snapshotId = rows[0].id
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null
    const device = req.headers['user-agent'] || null
    const referrer = req.headers['referer'] || req.headers['referrer'] || null
    const body = req.body || {}
    const events = Array.isArray(body.events) ? body.events : [body]
    for (const evt of events) {
      await pool.query(
        `INSERT INTO proposal_events (proposal_snapshot_id, session_id, event_type, event_data, ip, device, referrer)
         SELECT $1, $2, $3, $4, $5, $6, $7
         WHERE NOT EXISTS (SELECT 1 FROM known_internal_ips WHERE ip = $5)
         AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE ip = $5 LIMIT 1)`,
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

  /* ===================== QUOTATIONS ===================== */

  api.register(quotationRoutes)
  api.register(placesRoutes, { prefix: '/places' })


}

fastify.register(apiRoutes, { prefix: '/api' })
fastify.register(apiRoutes, { prefix: '' })

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

/* ===================== METRICS JOB ===================== */

let metricsLastRun = null
let metricsRunning = false

async function recomputeUserMetricsRange(fromYmd, toYmd, client = pool) {
  const start = normalizeYMD(fromYmd)
  const end = normalizeYMD(toYmd)
  if (!start || !end) return
  let cursor = start
  while (cursor <= end) {
    await recomputeUserMetrics(cursor, client)
    cursor = addDaysToYMD(cursor, 1)
    if (!cursor) break
  }
}

async function runMetricsJob(force = false, range = null) {
  if (metricsRunning) return
  const today = dateToYMD(new Date())
  const from = range?.from || addDaysYMD(-6)
  const to = range?.to || today
  if (!force && metricsLastRun === today) return
  metricsRunning = true
  try {
    await recomputeLeadMetrics()
    await recomputeUserMetricsRange(from, to)
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

/* ===================== PHOTO LIBRARY ===================== */

fastify.get('/api/photos', async (req, reply) => {
  const auth = requireAuth(req, reply)
  if (!auth) return
  const { rows } = await pool.query(
    `SELECT id, file_url as url, tags, content_hash, created_at FROM photo_library ORDER BY created_at DESC`
  )
  reply.send(rows)
})

fastify.post('/api/photos/auto-curate', async (req, reply) => {
   const { structuredEvents: rawStructured = [], leadEvents: rawLeadEvents, location = '', isDestination = false, requiredCount = 8, excludeUrls = [], notesContext = '', coverageScope = 'Both Sides' } = req.body || {}
   
   // Accept both structuredEvents (objects) and leadEvents (flat strings) — auto-convert if needed
   let structuredEvents = rawStructured
   if ((!structuredEvents || structuredEvents.length === 0) && Array.isArray(rawLeadEvents) && rawLeadEvents.length > 0) {
      structuredEvents = rawLeadEvents.map(name => ({ name: String(name), slot: '', location: '' }))
   }

   const cleanLoc = String(location || '').toLowerCase().trim()
   const notesText = String(notesContext || '').toLowerCase()
   const scopeText = String(coverageScope || '').toLowerCase()
   const isBrideOnly = scopeText.includes('bride') && !scopeText.includes('both')
   const isGroomOnly = scopeText.includes('groom') && !scopeText.includes('both')
 
   const knownEventTags = ['haldi', 'mehendi', 'wedding', 'sangeet', 'reception', 'engagement', 'pre wedding']
   const dayTimeTags = ['day', 'morning', 'daylight', 'outdoor', 'sunlight', 'sunset']
   const nightTimeTags = ['evening', 'night', 'dusk', 'golden hour']

   const targetEventWords = [...new Set(structuredEvents.map(ev => {
      const evName = (ev.name || ev).toString().toLowerCase()
      const baseWordRaw = evName.replace(/^[^']+'\s*/i, '').replace(/\s*\([^)]*\)/i, '').trim()
      return knownEventTags.find(t => baseWordRaw.includes(t)) || baseWordRaw
   }))]
 
   const { rows } = await pool.query(`SELECT id, file_url as url, tags FROM photo_library`)
   
   const scored = rows.map(photo => {
      let score = 0
      const pTags = Array.isArray(photo.tags) ? photo.tags.map(t => String(t).toLowerCase()) : []
      
      let maxEventScore = 0
      let hasEventMatch = false
 
      for (const ev of structuredEvents) {
         const evName = ev.name.toLowerCase()
         const baseWordRaw = evName.replace(/^[^']+'\s*/i, '').replace(/\s*\([^)]*\)/i, '').trim()
         const baseEventWord = knownEventTags.find(t => baseWordRaw.includes(t)) || baseWordRaw
         
         if (!pTags.includes(baseEventWord)) continue
         hasEventMatch = true
         let currentEventScore = 10
 
         // Location context for event (e.g., Pre Wedding in Agra)
         const evLoc = ev.location.toLowerCase().trim()
         if (evLoc && evLoc !== 'local' && pTags.some(t => t.includes(evLoc))) {
            currentEventScore += 15 // MASSIVE EXACT LOCATION+EVENT MATCH
         }
 
         // Time of day logic
         const slot = ev.slot.toLowerCase()
         if (slot.includes('morning') || slot.includes('day')) {
            if (pTags.some(t => dayTimeTags.includes(t))) currentEventScore += 5
            if (pTags.some(t => nightTimeTags.includes(t))) currentEventScore -= 15
         } else if (slot.includes('evening') || slot.includes('night')) {
            if (pTags.some(t => nightTimeTags.includes(t))) currentEventScore += 5
         }
 
         if (currentEventScore > maxEventScore) maxEventScore = currentEventScore
      }
 
      score += maxEventScore

      // Explicit Event Exclusion: Penalize heavily if the photo belongs to an event NOT requested.
      const photoKnownEvents = pTags.filter(t => knownEventTags.includes(t))
      if (photoKnownEvents.length > 0) {
          const matchesRequested = photoKnownEvents.some(t => targetEventWords.includes(t))
          if (!matchesRequested) {
              score -= 9999
          }
      }
 
      // Baseline Location Matches (General)
      if (isDestination && pTags.some(t => t.includes('destination') || t.includes('palace') || t.includes('resort'))) score += 4
      if (!isDestination && pTags.some(t => t.includes('local') || t.includes('home'))) score += 3
      if (cleanLoc && cleanLoc !== 'local' && pTags.some(t => t.includes(cleanLoc))) {
          score += hasEventMatch ? 5 : 10 // highly reward exact city if it's a general shot without event tags
      }
 
      // Styling tags
      for(const t of pTags) {
         if(notesText.includes(t) && t.length > 3 && !knownEventTags.includes(t)) score += 3
      }
      if (notesText.includes('colour') && pTags.includes('color')) score += 3
      if (notesText.includes('color') && pTags.includes('colour')) score += 3
      
      // Base Subjects
      const coreSubjects = ['bride', 'groom', 'couple', 'portrait', 'family', 'details']
      if (pTags.some(t => coreSubjects.includes(t))) score += 2
 
      // Scope validation
      if (isBrideOnly && pTags.includes('groom') && !pTags.includes('bride')) score -= 20
      if (isGroomOnly && pTags.includes('bride') && !pTags.includes('groom')) score -= 20
      
      // Minor padding so equal photos have different scores
      score += Math.random() * 0.5
      
      return { ...photo, score, pTags }
   })
  
  scored.sort((a,b) => b.score - a.score)
  
  // Filter out negative-scoring (wrong event) photos and excluded URLs
  const eligiblePool = scored.filter(p => p.score > -100 && !excludeUrls.includes(p.url))

  // === EVENT-FIRST ALLOCATION ENGINE ===
  // Allocate slots per event, then pick best-scoring photos within each event with subject diversity
  const portraitTags = ['portrait', 'couple', 'bride', 'groom']
  const candidTags = ['candid', 'family', 'guests', 'dance', 'mom', 'dad', 'friends']
  const detailTags = ['decor', 'details', 'ritual', 'ring', 'shoes', 'lehenga', 'flowers', 'venue']

  const hasWeddingEvent = targetEventWords.includes('wedding')
  const numEvents = targetEventWords.length

  // Calculate slots per event: wedding gets +2 extra if present
  const eventSlots = {}
  if (numEvents > 0) {
     const weddingBonus = hasWeddingEvent ? 2 : 0
     const remaining = requiredCount - weddingBonus
     const basePerEvent = Math.floor(remaining / numEvents)
     let leftover = remaining - (basePerEvent * numEvents)
     for (const ew of targetEventWords) {
        eventSlots[ew] = basePerEvent + (ew === 'wedding' ? weddingBonus : 0)
        if (leftover > 0) { eventSlots[ew]++; leftover-- }
     }
  }

  let finalSelection = []
  const usedUrls = new Set()

  // For each event, pick photos with subject diversity
  for (const eventWord of targetEventWords) {
     const slots = eventSlots[eventWord] || 0
     if (slots === 0) continue

     // Get all eligible photos for this event, sorted by score
     const eventPhotos = eligiblePool.filter(p => p.pTags.includes(eventWord) && !usedUrls.has(p.url))

     // Mini-category targets within this event
     const pTarget = Math.max(1, Math.round(slots * 0.30))  // ~30% portraits
     const cTarget = Math.max(1, Math.round(slots * 0.30))  // ~30% candid/family
     const dTarget = Math.max(1, Math.round(slots * 0.15))  // ~15% detail/ritual
     const bestTarget = Math.max(0, slots - pTarget - cTarget - dTarget) // ~25% best remaining

     const picked = []
     const pickUsed = new Set()

     // Fill portraits for this event
     const pCandidates = eventPhotos.filter(p => p.pTags.some(t => portraitTags.includes(t)))
     for (const p of pCandidates) {
        if (picked.filter(x => x._cat === 'portrait').length >= pTarget) break
        if (!pickUsed.has(p.url)) { picked.push({ ...p, _cat: 'portrait' }); pickUsed.add(p.url) }
     }

     // Fill candids for this event
     const cCandidates = eventPhotos.filter(p => p.pTags.some(t => candidTags.includes(t)))
     for (const p of cCandidates) {
        if (picked.filter(x => x._cat === 'candid').length >= cTarget) break
        if (!pickUsed.has(p.url)) { picked.push({ ...p, _cat: 'candid' }); pickUsed.add(p.url) }
     }

     // Fill details for this event
     const dCandidates = eventPhotos.filter(p => p.pTags.some(t => detailTags.includes(t)))
     for (const p of dCandidates) {
        if (picked.filter(x => x._cat === 'detail').length >= dTarget) break
        if (!pickUsed.has(p.url)) { picked.push({ ...p, _cat: 'detail' }); pickUsed.add(p.url) }
     }

     // Fill best remaining (highest score, any subject)
     for (const p of eventPhotos) {
        if (picked.length >= slots) break
        if (!pickUsed.has(p.url)) { picked.push({ ...p, _cat: 'best' }); pickUsed.add(p.url) }
     }

     // Sort within event by score
     picked.sort((a, b) => b.score - a.score)
     picked.forEach(p => usedUrls.add(p.url))
     finalSelection.push(...picked)
  }

  // If still short (e.g. generic photos with no event tag), fill from top of eligible pool
  if (finalSelection.length < requiredCount) {
     const filler = eligiblePool.filter(p => !usedUrls.has(p.url))
     for (const p of filler) {
        if (finalSelection.length >= requiredCount) break
        finalSelection.push(p)
        usedUrls.add(p.url)
     }
  }

  const formatted = finalSelection.map(p => ({ url: p.url, score: Math.round(p.score * 10) / 10, tags: p.pTags }))
  reply.send(formatted)
})

fastify.post('/api/photos/auto-curate-portraits', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return

  const {
    structuredEvents: rawStructured = [],
    leadEvents: rawLeadEvents,
    location = '',
    isDestination = false,
    excludeUrls = [],      // moodboard URLs + previously picked portraits
    notesContext = '',
    hasWedding = false,
    existingPortraitCount = 0, // portraits already in moodboard
    coverageScope = 'Both Sides'
  } = req.body || {}

  // Accept both formats
  let structuredEvents = rawStructured
  if ((!structuredEvents || structuredEvents.length === 0) && Array.isArray(rawLeadEvents) && rawLeadEvents.length > 0) {
     structuredEvents = rawLeadEvents.map(name => ({ name: String(name), slot: '', location: '' }))
  }

  const scopeText = String(coverageScope || '').toLowerCase()
  const isBrideOnly = scopeText.includes('bride') && !scopeText.includes('both')
  const isGroomOnly = scopeText.includes('groom') && !scopeText.includes('both')

  const TARGET_TOTAL_PORTRAITS = 8
  const requiredCount = Math.max(4, Math.min(6, TARGET_TOTAL_PORTRAITS - existingPortraitCount))

  const cleanLoc = String(location || '').toLowerCase().trim()
  const notesText = String(notesContext || '').toLowerCase()

  const knownEventTags = ['haldi', 'mehendi', 'wedding', 'sangeet', 'reception', 'engagement', 'pre wedding']
  const dayTimeTags = ['day', 'morning', 'daylight', 'outdoor', 'sunlight', 'sunset']
  const nightTimeTags = ['evening', 'night', 'dusk', 'golden hour']
  const portraitSubjects = ['portrait', 'bride', 'groom', 'couple']

  const targetEventWords = [...new Set(structuredEvents.map(ev => {
     const evName = ev.name.toLowerCase()
     const baseWordRaw = evName.replace(/^[^']+'\s*/i, '').replace(/\s*\([^)]*\)/i, '').trim()
     return knownEventTags.find(t => baseWordRaw.includes(t)) || baseWordRaw
  }))]

  const { rows } = await pool.query(`SELECT id, file_url as url, tags FROM photo_library`)

  // Only consider photos that have at least one portrait subject tag
  const portraitPool = rows.filter(photo => {
    const pTags = Array.isArray(photo.tags) ? photo.tags.map(t => String(t).toLowerCase()) : []
    return pTags.some(t => portraitSubjects.includes(t))
  })

  // Match logic for portraits
  const scored = portraitPool.map(photo => {
    let score = 0
    const pTags = Array.isArray(photo.tags) ? photo.tags.map(t => String(t).toLowerCase()) : []

    // Portrait subject bonus (primary scoring differentiator)
    if (pTags.includes('couple')) score += 4
    if (pTags.includes('bride')) score += 3
    if (pTags.includes('groom')) score += 3
    if (pTags.includes('portrait')) score += 4

    let maxEventScore = 0
    let hasEventMatch = false

    for (const ev of structuredEvents) {
       const evName = ev.name.toLowerCase()
       const baseWordRaw = evName.replace(/^[^']+'\s*/i, '').replace(/\s*\([^)]*\)/i, '').trim()
       const baseEventWord = knownEventTags.find(t => baseWordRaw.includes(t)) || baseWordRaw
       
       if (!pTags.includes(baseEventWord)) continue
       hasEventMatch = true
       let currentEventScore = 10

       // Location context for event (e.g., Pre Wedding in Agra)
       const evLoc = ev.location.toLowerCase().trim()
       if (evLoc && evLoc !== 'local' && pTags.some(t => t.includes(evLoc))) {
          currentEventScore += 15
       }

       // Time of day logic
       const slot = ev.slot.toLowerCase()
       if (slot.includes('morning') || slot.includes('day')) {
          if (pTags.some(t => dayTimeTags.includes(t))) currentEventScore += 5
          if (pTags.some(t => nightTimeTags.includes(t))) currentEventScore -= 15
       } else if (slot.includes('evening') || slot.includes('night')) {
          if (pTags.some(t => nightTimeTags.includes(t))) currentEventScore += 5
       }

       if (currentEventScore > maxEventScore) maxEventScore = currentEventScore
    }
    score += maxEventScore

    // Explicit Event Exclusion: Penalize heavily if the photo belongs to an event NOT requested.
    const photoKnownEvents = pTags.filter(t => knownEventTags.includes(t))
    if (photoKnownEvents.length > 0) {
        const matchesRequested = photoKnownEvents.some(t => targetEventWords.includes(t))
        if (!matchesRequested) {
            score -= 9999
        }
    }

    // Location match
    if (isDestination && pTags.some(t => t.includes('destination') || t.includes('palace') || t.includes('resort'))) score += 4
    if (!isDestination && pTags.some(t => t.includes('local') || t.includes('home'))) score += 3
    if (cleanLoc && cleanLoc !== 'local' && pTags.some(t => t.includes(cleanLoc))) {
       score += hasEventMatch ? 5 : 10
    }

    // Notes match
    for (const t of pTags) {
      if (notesText.includes(t) && t.length > 3 && !knownEventTags.includes(t)) {
         score += 3
      }
    }
    
    // Scope validation
    if (isBrideOnly && pTags.includes('groom') && !pTags.includes('bride')) score -= 20
    if (isGroomOnly && pTags.includes('bride') && !pTags.includes('groom')) score -= 20

    // Organic variety salt
    score += Math.random() * 0.5

    return { ...photo, score, pTags }
  })

  scored.sort((a, b) => b.score - a.score)

  // Remove already-used photos (moodboard + previously picked portraits) and unrequested event junk
  let pool_ = scored.filter(p => p.score > -100 && !excludeUrls.includes(p.url))

  // Score-first selection, no random shuffle
  const topPool = pool_.slice(0, 30)

  // Hard guarantee: if lead has wedding event, slot 1 must be a wedding portrait
  const weddingPortraits = topPool.filter(p =>
    p.pTags.includes('wedding') && p.pTags.some(t => portraitSubjects.includes(t))
  )

  let finalSelection = []

  if (hasWedding && weddingPortraits.length > 0) {
    const guaranteed = weddingPortraits[0]
    finalSelection.push(guaranteed)
    const remaining = topPool.filter(p => p.url !== guaranteed.url)
    finalSelection = [...finalSelection, ...remaining.slice(0, requiredCount - 1)]
  } else {
    finalSelection = topPool.slice(0, requiredCount)
  }

  // If still short, pull from full pool
  if (finalSelection.length < requiredCount) {
    const used = new Set(finalSelection.map(p => p.url))
    const extras = pool_.filter(p => !used.has(p.url))
    finalSelection = [...finalSelection, ...extras.slice(0, requiredCount - finalSelection.length)]
  }

  // Final sort by score for display
  finalSelection.sort((a, b) => b.score - a.score)

  const formatted = finalSelection.map(p => ({ url: p.url, score: Math.round(p.score * 10) / 10, tags: p.pTags }))
  reply.send(formatted)
})


fastify.get('/api/photos/file/:filename', async (req, reply) => {
  const filename = path.basename(req.params.filename || '')
  if (!filename) return reply.code(404).send({ error: 'Not found' })
  const filePath = path.join(PHOTO_UPLOAD_DIR, filename)
  try {
    await fs.promises.stat(filePath)
  } catch (err) {
    return reply.code(404).send({ error: 'Not found' })
  }
  reply.type(getImageContentType(filename))
  return reply.send(fs.createReadStream(filePath))
})

fastify.post('/api/photos', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  ensureDirectory(PHOTO_UPLOAD_DIR)
  const { dataUrl, filename: originalName, tags, contentHash } = req.body || {}
  if (!dataUrl || typeof dataUrl !== 'string') {
    return reply.code(400).send({ error: 'File data is required.' })
  }
  if (!contentHash) {
    return reply.code(400).send({ error: 'Content hash is required for deduplication.' })
  }
  const match = dataUrl.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/)
  if (!match) {
    return reply.code(400).send({ error: 'Invalid file data.' })
  }
  const [, mimeType, base64Data] = match
  const extFromMime = mimeType === 'image/jpeg' ? '.jpg'
    : mimeType === 'image/png' ? '.png'
      : mimeType === 'image/webp' ? '.webp'
        : mimeType === 'image/gif' ? '.gif'
          : ''
  const ext = path.extname(originalName || '').toLowerCase()
  const safeExt = extFromMime || (ext && ext.length <= 8 ? ext : '')
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`
  const filePath = path.join(PHOTO_UPLOAD_DIR, filename)

  try {
    const buffer = Buffer.from(base64Data, 'base64')
    
    // Hash the file to prevent duplicates using the strictly deterministic original file hash provided by frontend
    const { rows: existing } = await pool.query(`SELECT id FROM photo_library WHERE content_hash = $1`, [contentHash])
    if (existing.length > 0) {
      return reply.code(409).send({ error: 'This photo already exists in the library.', duplicateId: existing[0].id })
    }

    await fs.promises.writeFile(filePath, buffer)
    
    const fileUrl = `/api/photos/file/${filename}`
    const cleanTags = sanitizeTags(tags)

    const { rows } = await pool.query(
      `INSERT INTO photo_library (file_name, file_url, tags, content_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, file_url as url, tags, content_hash, created_at`,
      [filename, fileUrl, cleanTags, contentHash]
    )

    reply.send(rows[0])
  } catch (err) {
    console.warn('Photo upload failed:', err?.message || err)
    return reply.code(500).send({ error: 'Failed to upload photo.' })
  }
})

fastify.patch('/api/photos/:id', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { id } = req.params
  const tags = sanitizeTags(req.body?.tags)
  const { rows } = await pool.query(
    `UPDATE photo_library
     SET tags = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, file_url as url, tags, created_at`,
    [tags, id]
  )
  if (!rows.length) {
    return reply.code(404).send({ error: 'Photo not found.' })
  }
  reply.send(rows[0])
})

fastify.delete('/api/photos/:id', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { id } = req.params
  const { rows } = await pool.query(
    `SELECT file_name FROM photo_library WHERE id = $1`,
    [id]
  )
  if (!rows.length) {
    return reply.code(404).send({ error: 'Photo not found.' })
  }
  await pool.query(`DELETE FROM photo_library WHERE id = $1`, [id])
  const filePath = path.join(PHOTO_UPLOAD_DIR, rows[0].file_name)
  fs.promises.unlink(filePath).catch(() => null)
  reply.send({ success: true })
})


/* ===================== VIDEO LIBRARY ===================== */
const VIDEO_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'videos')
fastify.get('/api/videos', async (req, reply) => {
  const auth = requireAuth(req, reply)
  if (!auth) return
  const { rows } = await pool.query(
    `SELECT id, file_url as url, tags, file_hash, created_at FROM video_library ORDER BY created_at DESC`
  )
  reply.send(rows)
})

fastify.get('/api/videos/file/:filename', async (req, reply) => {
  const filename = path.basename(req.params.filename || '')
  if (!filename) return reply.code(404).send({ error: 'Not found' })
  const filePath = path.join(VIDEO_UPLOAD_DIR, filename)
  try {
    await fs.promises.stat(filePath)
  } catch (err) {
    return reply.code(404).send({ error: 'Not found' })
  }
  
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.mp4') reply.type('video/mp4')
  else if (ext === '.webm') reply.type('video/webm')
  else if (ext === '.mov') reply.type('video/quicktime')
  else reply.type('application/octet-stream')

  return reply.send(fs.createReadStream(filePath))
})

fastify.post('/api/videos', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  ensureDirectory(VIDEO_UPLOAD_DIR)

  // Prefer multipart streaming for large files
  if (req.isMultipart()) {
    let savedFile = null
    let tags = []
    let contentHash = null
    let fileTooLarge = false

    try {
      const parts = req.parts({ limits: { fileSize: 524288000 } }) // 500MB
      for await (const part of parts) {
        if (part.type === 'file') {
          const originalName = part.filename || 'video'
          const ext = path.extname(originalName).toLowerCase() || '.webm'
          const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`
          const filePath = path.join(VIDEO_UPLOAD_DIR, filename)

          part.file.on('limit', () => {
            fileTooLarge = true
          })

          try {
            await pipeline(part.file, fs.createWriteStream(filePath, { highWaterMark: 1024 * 1024 }))
          } catch (err) {
            if (fileTooLarge || err?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
              try { await fs.promises.unlink(filePath) } catch {}
            }
            throw err
          }

          savedFile = { filename, filePath }
        } else if (part.fieldname === 'tags') {
          try { tags = JSON.parse(part.value) } catch { tags = [] }
        } else if (part.fieldname === 'contentHash') {
          contentHash = part.value || null
        }
      }

      if (!savedFile) return reply.code(400).send({ error: 'No video file received.' })
      if (fileTooLarge) {
        try { await fs.promises.unlink(savedFile.filePath) } catch {}
        return reply.code(413).send({ error: 'Video file is too large (max 500MB).' })
      }

      if (contentHash) {
        const { rows: existing } = await pool.query(`SELECT id FROM video_library WHERE file_hash = $1`, [contentHash])
        if (existing.length > 0) {
          try { await fs.promises.unlink(savedFile.filePath) } catch {}
          return reply.code(409).send({ error: 'This video already exists in the library.', duplicateId: existing[0].id })
        }
      }

      const fileUrl = `/api/videos/file/${savedFile.filename}`
      const cleanTags = sanitizeTags(tags)
      const { rows } = await pool.query(
        `INSERT INTO video_library (file_name, file_url, tags, file_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, file_url as url, tags, file_hash, created_at`,
        [savedFile.filename, fileUrl, cleanTags, contentHash || null]
      )
      return reply.send(rows[0])
    } catch (err) {
      if (err?.code === 'FST_RET_ERR_FILE_TOO_LARGE') {
        return reply.code(413).send({ error: 'Video file is too large (max 500MB).' })
      }
      if (err?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        return reply.code(400).send({ error: 'Upload was interrupted. Please try again.' })
      }
      console.error('❌ CRITICAL: Video upload failed:', err)
      return reply.code(500).send({
        error: 'Technical upload failure.',
        details: err?.message || 'Server error during stream processing'
      })
    }
  }

  // Legacy base64 fallback
  const { dataUrl, filename: originalName, tags: legacyTags, contentHash: legacyHash } = req.body || {}
  if (!dataUrl || typeof dataUrl !== 'string') {
    return reply.code(400).send({ error: 'File data is required.' })
  }
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/)
  if (!match || !match[1].startsWith('video/')) {
    return reply.code(400).send({ error: 'Invalid video file data.' })
  }
  const [, mimeType, base64Data] = match
  const extFromMime = mimeType === 'video/mp4' ? '.mp4'
    : mimeType === 'video/webm' ? '.webm'
      : mimeType === 'video/quicktime' ? '.mov'
        : '.webm'
  const ext = path.extname(originalName || '').toLowerCase()
  const safeExt = extFromMime || (ext && ext.length <= 8 ? ext : '.webm')
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`
  const filePath = path.join(VIDEO_UPLOAD_DIR, filename)
  const buffer = Buffer.from(base64Data, 'base64')
  await fs.promises.writeFile(filePath, buffer)

  const fileUrl = `/api/videos/file/${filename}`
  const cleanTags = sanitizeTags(legacyTags)
  const { rows } = await pool.query(
    `INSERT INTO video_library (file_name, file_url, tags, file_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, file_url as url, tags, file_hash, created_at`,
    [filename, fileUrl, cleanTags, legacyHash || null]
  )
  return reply.send(rows[0])
})

fastify.patch('/api/videos/:id', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { id } = req.params
  const tags = sanitizeTags(req.body?.tags)
  const { rows } = await pool.query(
    `UPDATE video_library SET tags = $1, updated_at = NOW() WHERE id = $2 RETURNING id, file_url as url, tags, created_at`,
    [tags, id]
  )
  if (!rows.length) return reply.code(404).send({ error: 'Video not found.' })
  reply.send(rows[0])
})

fastify.delete('/api/videos/:id', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { id } = req.params
  const { rows } = await pool.query(`SELECT file_name FROM video_library WHERE id = $1`, [id])
  if (!rows.length) return reply.code(404).send({ error: 'Video not found.' })
  await pool.query(`DELETE FROM video_library WHERE id = $1`, [id])
  const filePath = path.join(VIDEO_UPLOAD_DIR, rows[0].file_name)
  fs.promises.unlink(filePath).catch(() => null)
  reply.send({ success: true })
})

/* ===================== TESTIMONIALS ===================== */
fastify.get('/api/testimonials', async (req, reply) => {
  const auth = requireAuth(req, reply)
  if (!auth) return
  const { rows } = await pool.query(`SELECT * FROM testimonials ORDER BY created_at DESC`)
  reply.send(rows)
})

fastify.post('/api/testimonials', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { couple_names, testimonial_text, media_url, media_type } = req.body || {}
  try {
    const { rows } = await pool.query(
      `INSERT INTO testimonials (couple_names, testimonial_text, media_url, media_type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [couple_names, testimonial_text, media_url, media_type || 'photo']
    )
    reply.send(rows[0])
  } catch(err) {
    reply.code(500).send({ error: 'Failed to save testimonial.' })
  }
})

fastify.patch('/api/testimonials/:id', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { id } = req.params
  const { couple_names, testimonial_text, media_url, media_type } = req.body || {}
  try {
    const { rows } = await pool.query(
      `UPDATE testimonials 
       SET couple_names=$1, testimonial_text=$2, media_url=$3, media_type=$4, updated_at=NOW() 
       WHERE id=$5 RETURNING *`,
      [couple_names, testimonial_text, media_url, media_type, id]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Not found.' })
    reply.send(rows[0])
  } catch(err) {
    reply.code(500).send({ error: 'Failed to update testimonial.' })
  }
})

fastify.delete('/api/testimonials/:id', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { id } = req.params
  const numId = Number(id)
  // Check if this testimonial is referenced in any proposal snapshot
  const ref = await pool.query(
    `SELECT 1 FROM proposal_snapshots WHERE snapshot_json::text LIKE $1 LIMIT 1`,
    [`%"id":${numId}%`]
  )
  if (ref.rows.length > 0) {
    // Referenced in a proposal — cannot delete, inform admin
    return reply.code(409).send({ 
      error: 'This testimonial is used in a sent proposal and cannot be permanently deleted. It has been hidden instead.',
      action: 'archived'
    })
  }
  // Not referenced — permanent delete
  await pool.query(`DELETE FROM testimonials WHERE id = $1`, [numId])
  reply.send({ success: true, action: 'deleted' })
})


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
  runMetricsJob().catch(err => {
    console.warn('Metrics job failed on startup:', err?.message || err)
  })
  setInterval(() => {
    runMetricsJob().catch(err => {
      console.warn('Metrics job failed:', err?.message || err)
    })
  }, 24 * 60 * 60 * 1000)
  recalculateAccountBalances().catch(err => {
    console.warn('Balance recompute failed on startup:', err?.message || err)
  })
})

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})
