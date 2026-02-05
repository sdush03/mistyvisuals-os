const fastify = require('fastify')({ logger: true })
const cors = require('@fastify/cors')
const { Pool } = require('pg')

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
]

const FOLLOWUP_TYPES = ['call', 'whatsapp', 'meeting']
const HEAT_VALUES = ['Hot', 'Warm', 'Cold']

/* ===================== HELPERS ===================== */

async function getOrCreateCity({ name, state, country }) {
  const existing = await pool.query(
    `SELECT id FROM cities
     WHERE name=$1 AND state=$2 AND country=$3`,
    [name, state, country]
  )

  if (existing.rows.length) return existing.rows[0].id

  const created = await pool.query(
    `INSERT INTO cities (name, state, country)
     VALUES ($1,$2,$3)
     RETURNING id`,
    [name, state, country]
  )

  return created.rows[0].id
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

/* ===================== LEADS ===================== */

fastify.get('/leads', async () =>
  (await pool.query(
    'SELECT *, phone_primary AS primary_phone FROM leads ORDER BY created_at DESC'
  )).rows
)

fastify.post('/leads', async (req, reply) => {
  const {
    name,
    primary_phone,
    bride_name,
    groom_name,
  } = req.body || {}

  if (!name || !String(name).trim()) {
    return reply.code(400).send({ error: 'Name is required' })
  }
  if (!primary_phone || !String(primary_phone).trim()) {
    return reply.code(400).send({ error: 'Primary phone is required' })
  }

  const r = await pool.query(
    `
    INSERT INTO leads (name, source, phone_primary, bride_name, groom_name)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING *, phone_primary AS primary_phone
    `,
    [
      formatName(name),
      'Unknown',
      normalizePhone(primary_phone),
      formatName(bride_name),
      formatName(groom_name),
    ]
  )

  return r.rows[0]
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
      status,
      heat,
      event_type,
      is_destination,
      country,
      budget_bucket,
      description,
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

  return r.rows[0]
})

fastify.patch('/leads/:id/status', async (req, reply) => {
  const { id } = req.params
  const { status } = req.body

  if (!LEAD_STATUSES.includes(status)) {
    return reply.code(400).send({ error: 'Invalid status' })
  }

  // 🔒 HARD BLOCK — ONLY HERE
  const needsPrimaryEvent = ['Quoted','Follow Up','Negotiation', 'Converted'].includes(status)

  if (needsPrimaryEvent) {
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
    'SELECT status FROM leads WHERE id=$1',
    [id]
  )

  const updated = await pool.query(
    `
    UPDATE leads
    SET status=$1,
        previous_status=$2,
        updated_at=NOW()
    WHERE id=$3
    RETURNING *
    `,
    [status, cur.rows[0].status, id]
  )

  return updated.rows[0]
})

fastify.patch('/leads/:id/heat', async (req, reply) => {
  const { heat } = req.body
  if (!HEAT_VALUES.includes(heat))
    return reply.code(400).send({ error: 'Invalid heat value' })

  const r = await pool.query(
    `UPDATE leads
     SET heat=$1, updated_at=NOW()
     WHERE id=$2 AND status NOT IN ('Lost','Converted')
     RETURNING *`,
    [heat, req.params.id]
  )

  return r.rows[0]
})

/* ===================== ENRICHMENT ===================== */

fastify.get('/leads/:id/enrichment', async (req, reply) => {
  const lead = await pool.query(
    `SELECT event_type, is_destination, country, budget_bucket, description
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

  return {
    ...lead.rows[0],
    city: primaryCity?.name || null,
    state: primaryCity?.state || null,
    country: primaryCity?.country || lead.rows[0].country,
    cities: cities.rows,
    events: events.rows,
  }
})

fastify.patch('/leads/:id/enrichment', async (req) => {
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
  const isDestination =
    primaryCountry !== 'India' ? true : !!payload.is_destination
  // Fetch existing core lead data (fallback safety)
  const existingLead = await pool.query(
    `SELECT name, phone_primary FROM leads WHERE id=$1`,
    [id]
  )
  // Resolve primary phone safely
  const resolvedPrimaryPhone = normalizePhone(
    payload.primary_phone ||
    existingLead.rows[0]?.phone_primary ||
    null
  )

  await pool.query(
    `UPDATE leads SET
      name=$1,
      phone_primary=$2,
      phone_secondary=$3,
      email=$4,

      event_type=$5,
      is_destination=$6,
      country=$7,
      budget_bucket=$8,
      description=$9,

      updated_at=NOW()
    WHERE id=$10`,
    [
      formatName(payload.name) || existingLead.rows[0]?.name || null,
      resolvedPrimaryPhone,
      payload.phone_secondary || null,
      payload.email || null,

      payload.event_type,
      isDestination,
      primaryCountry,
      payload.budget_bucket,
      payload.description || null,

      id,
    ]
  )

  await pool.query(
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

  return { success: true }
})

/* ===================== CONTACT DETAILS ===================== */
fastify.patch('/leads/:id/contact', async (req, reply) => {
  const { id } = req.params
  const c = req.body

  if (!c.primary_phone) {
    return reply.code(400).send({ error: 'Primary phone required' })
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

      bride_name = $7,
      bride_phone_primary = $8,
      bride_phone_secondary = $9,
      bride_email = $10,
      bride_instagram = $11,

      groom_name = $12,
      groom_phone_primary = $13,
      groom_phone_secondary = $14,
      groom_email = $15,
      groom_instagram = $16,

      updated_at = NOW()
    WHERE id = $17
    RETURNING *, phone_primary AS primary_phone
    `,
    [
      formatName(c.name),
      normalizePhone(c.primary_phone),
      normalizePhone(c.phone_secondary),
      c.email,
      c.instagram,
      c.source,

      formatName(c.bride_name),
      normalizePhone(c.bride_phone_primary),
      normalizePhone(c.bride_phone_secondary),
      c.bride_email,
      c.bride_instagram,

      formatName(c.groom_name),
      normalizePhone(c.groom_phone_primary),
      normalizePhone(c.groom_phone_secondary),
      c.groom_email,
      c.groom_instagram,

      id,
    ]
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

  await pool.query('BEGIN')

  try {
    await pool.query('DELETE FROM lead_cities WHERE lead_id=$1', [id])

    let primaryCountry = 'India'

    for (const city of cities) {
      const cityId = await getOrCreateCity({
        name: city.name.trim(),
        state: city.state.trim(),
        country: city.country || 'India',
      })

      if (city.is_primary) primaryCountry = city.country || 'India'

      await pool.query(
        `INSERT INTO lead_cities (lead_id, city_id, is_primary)
         VALUES ($1,$2,$3)`,
        [id, cityId, city.is_primary]
      )
    }

    const isDestination = primaryCountry !== 'India'

    await pool.query(
      `UPDATE leads
       SET is_destination=$1,
           country=$2,
           updated_at=NOW()
       WHERE id=$3`,
      [isDestination, primaryCountry, id]
    )

    await pool.query('COMMIT')
    return { success: true }
  } catch (err) {
    await pool.query('ROLLBACK')
    throw err
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

fastify.delete('/leads/:id/events/:eventId', async (req) => {
  await pool.query(
    'DELETE FROM lead_events WHERE id=$1 AND lead_id=$2',
    [req.params.eventId, req.params.id]
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
