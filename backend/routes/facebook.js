const crypto = require('crypto')

const GRAPH_API_VERSION = process.env.FB_GRAPH_API_VERSION || 'v25.0'
const GRAPH_API_RETRIES = 3
const SOURCE = 'facebook_ads'

module.exports = async function facebookRoutes(fastify, opts) {
  const { pool } = opts

  fastify.get('/webhooks/meta', async (req, reply) => {
    const mode = req.query?.['hub.mode']
    const token = req.query?.['hub.verify_token']
    const challenge = req.query?.['hub.challenge']
    const verifyToken = getEnv('FB_VERIFY_TOKEN', 'FACEBOOK_VERIFY_TOKEN')

    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      fastify.log.info('Meta webhook verified')
      return reply.code(200).send(challenge)
    }

    fastify.log.warn({ mode }, 'Meta webhook verification failed')
    return reply.code(403).send()
  })

  fastify.post('/webhooks/meta', async (req, reply) => {
    if (!verifySignature(req)) {
      fastify.log.warn('Meta webhook signature verification failed')
      return reply.code(403).send({ error: 'Invalid signature' })
    }

    const body = req.body
    if (!body || body.object !== 'page' || !Array.isArray(body.entry)) {
      fastify.log.warn({ body }, 'Invalid Meta webhook payload')
      return reply.code(400).send({ error: 'Invalid payload' })
    }

    for (const entry of body.entry) {
      const changes = Array.isArray(entry.changes) ? entry.changes : []

      for (const change of changes) {
        const leadMeta = extractLeadMeta(change, entry)
        if (!leadMeta) continue

        try {
          fastify.log.info(leadMeta, 'New Facebook lead received')

          const leadData = await fetchLeadData(leadMeta)
          const lead = mapLeadData(leadData, leadMeta)

          if (!lead.phone && !lead.email) {
            fastify.log.warn({ lead }, 'Facebook lead skipped because phone and email are missing')
            continue
          }

          const duplicate = await findDuplicateLead(pool, lead, opts)
          if (duplicate) {
            await logLeadActivity(
              duplicate.id,
              'facebook_lead_duplicate',
              {
                log_type: 'activity',
                source: SOURCE,
                incoming_lead: lead,
              },
              null,
              pool,
              opts
            )
            fastify.log.info({ lead, duplicate }, 'duplicate lead skipped')
            continue
          }

          const created = await createLead(pool, lead, opts)
          fastify.log.info(
            { lead_id: created.id, lead_number: created.lead_number },
            'Facebook lead created'
          )
        } catch (err) {
          fastify.log.error(
            { err, leadgen_id: leadMeta.leadgen_id },
            'Error processing Facebook lead'
          )
        }
      }
    }

    return reply.code(200).send({ ok: true })
  })
}

function verifySignature(req) {
  const appSecret = getEnv('FB_APP_SECRET', 'FACEBOOK_APP_SECRET')
  if (!appSecret) return true

  const signature = req.headers['x-hub-signature-256']
  if (!signature || typeof signature !== 'string') return false

  const [algorithm, hash] = signature.split('=')
  if (algorithm !== 'sha256' || !hash) return false

  const rawBody = req.rawBody || req.raw?.rawBody
  if (!rawBody) return false

  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')

  const expected = Buffer.from(hash, 'hex')
  const actual = Buffer.from(expectedHash, 'hex')

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

async function fetchLeadData(leadMeta, attempt = 1) {
  const leadgenId = typeof leadMeta === 'string' ? leadMeta : leadMeta?.leadgen_id
  const formId = typeof leadMeta === 'object' ? leadMeta.form_id : null
  const accessToken = getEnv('FB_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN')
  if (!accessToken) {
    throw new Error('FB_PAGE_ACCESS_TOKEN is required')
  }

  if (!leadgenId) {
    throw new Error('leadgen_id is required')
  }

  try {
    return await fetchLeadById(leadgenId, accessToken)
  } catch (err) {
    if (formId && isMissingLeadObjectError(err)) {
      const testLead = await fetchMatchingTestLead(formId, leadgenId, accessToken)
      if (testLead) return { ...testLead, is_test_lead: true }
    }

    if (attempt < GRAPH_API_RETRIES && shouldRetry(err)) {
      await wait(250 * attempt)
      return fetchLeadData(leadMeta, attempt + 1)
    }
    throw err
  }
}

async function fetchLeadById(leadgenId, accessToken) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(leadgenId)}`)
  url.searchParams.set('fields', 'id,created_time,field_data')
  url.searchParams.set('access_token', accessToken)

  return fetchGraphJson(url)
}

async function fetchMatchingTestLead(formId, leadgenId, accessToken) {
  let url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(formId)}/test_leads`)
  url.searchParams.set('fields', 'id,created_time,field_data')
  url.searchParams.set('access_token', accessToken)

  for (let page = 0; page < 5 && url; page += 1) {
    const payload = await fetchGraphJson(url)
    const lead = Array.isArray(payload.data)
      ? payload.data.find(item => String(item.id) === String(leadgenId))
      : null

    if (lead) return lead
    url = payload.paging?.next ? new URL(payload.paging.next) : null
  }

  return null
}

async function fetchGraphJson(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  const payload = await safeJson(response)

  if (!response.ok) {
    const err = new Error(`Graph API request failed with status ${response.status}`)
    err.status = response.status
    err.payload = payload
    throw err
  }

  return payload
}

function mapLeadData(leadData, leadMeta) {
  leadData = leadData || {}
  const fields = getFieldMap(leadData.field_data)
  const firstName = pickField(fields, ['first_name'])
  const lastName = pickField(fields, ['last_name'])
  const brideName = pickField(fields, ['bride_name', 'brides_name'], key => key.includes('bride') && key.includes('name'))
  const groomName = pickField(fields, ['groom_name', 'grooms_name'], key => key.includes('groom') && key.includes('name'))
  const weddingDateRaw = pickField(
    fields,
    ['wedding_date', 'wedding_dates', 'event_date', 'event_dates', 'date_of_wedding'],
    key => key.includes('date') && (key.includes('wedding') || key.includes('event'))
  )
  const budgetRaw = pickField(
    fields,
    ['budget', 'wedding_budget', 'photography_budget', 'estimated_budget', 'budget_range'],
    key => key.includes('budget')
  )
  const venue = pickField(
    fields,
    ['venue', 'wedding_venue', 'venue_name', 'location', 'wedding_location'],
    key => key.includes('venue') || key.includes('location')
  )
  const city = pickField(
    fields,
    ['city', 'venue_city', 'wedding_city', 'event_city'],
    key => key.includes('city')
  )
  const eventType = pickField(
    fields,
    ['event_type', 'occasion', 'function_type'],
    key => key.includes('event_type') || key.includes('occasion') || key.includes('function')
  )
  const guestCount = parseInteger(pickField(
    fields,
    ['guest_count', 'guests', 'pax', 'number_of_guests', 'expected_guests'],
    key => key.includes('guest') || key.includes('pax')
  ))
  const fullName = pickField(
    fields,
    ['full_name', 'name', 'client_name', 'customer_name', 'your_name', 'couple_name'],
    key => key.includes('name')
      && !key.includes('bride')
      && !key.includes('groom')
      && !key.includes('venue')
      && !key.includes('city')
      && !key.includes('location')
  )
  const phone = pickField(
    fields,
    ['phone_number', 'phone', 'mobile_number', 'mobile', 'whatsapp_number'],
    key => key.includes('phone') || key.includes('mobile') || key.includes('whatsapp')
  )
  const email = pickField(fields, ['email', 'email_address'], key => key.includes('email'))

  return {
    name: fullName || [firstName, lastName].filter(Boolean).join(' ') || brideName || groomName || 'Facebook Lead',
    phone: phone || null,
    email: normalizeEmail(email),
    bride_name: brideName || null,
    groom_name: groomName || null,
    client_budget_amount: parseBudgetAmount(budgetRaw),
    wedding_date: normalizeFormDate(weddingDateRaw),
    wedding_date_raw: weddingDateRaw || null,
    event_type: eventType || 'Wedding',
    venue: venue || null,
    city: city || null,
    guest_count: guestCount,
    source_meta: {
      leadgen_id: leadMeta.leadgen_id,
      form_id: leadMeta.form_id || null,
      ad_id: leadMeta.ad_id || null,
      page_id: leadMeta.page_id || null,
      created_time: leadMeta.created_time || leadData.created_time || null,
      is_test_lead: leadData.is_test_lead === true,
      field_answers: getFieldAnswers(leadData.field_data),
      raw_field_data: leadData.field_data || [],
    },
  }
}

function extractLeadMeta(change, entry) {
  if (!change || change.field !== 'leadgen' || !change.value) return null

  const value = change.value
  const leadgenId = value.leadgen_id || value.leadgenId || value.id
  if (!leadgenId) return null

  return {
    leadgen_id: String(leadgenId),
    form_id: value.form_id ? String(value.form_id) : null,
    ad_id: value.ad_id ? String(value.ad_id) : null,
    page_id: value.page_id ? String(value.page_id) : entry?.id ? String(entry.id) : null,
    created_time: value.created_time || entry?.time || null,
  }
}

async function createLead(pool, lead, opts) {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const leadNumber = await getNextLeadNumber(client, opts)
    const assignedUserId = await getAssignedUserId(client, opts)
    const phone = canonicalizePhone(lead.phone, opts)

    const inserted = await client.query(
      `
      INSERT INTO leads (
        lead_number,
        name,
        phone_primary,
        email,
        source,
        source_name,
        bride_name,
        groom_name,
        client_budget_amount,
        coverage_scope,
        event_type,
        assigned_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id, lead_number, name, phone_primary
      `,
      [
        leadNumber,
        formatName(lead.name, opts) || 'Facebook Lead',
        phone,
        lead.email,
        SOURCE,
        lead.source_meta.leadgen_id ? `Meta Lead ${lead.source_meta.leadgen_id}` : 'Meta Lead',
        formatName(lead.bride_name, opts),
        formatName(lead.groom_name, opts),
        lead.client_budget_amount,
        'Both Sides',
        lead.event_type,
        assignedUserId,
      ]
    )

    const row = inserted.rows[0]
    await logLeadActivity(
      row.id,
      'lead_created',
      {
        log_type: 'activity',
        source: SOURCE,
        assigned_user_id: assignedUserId,
        source_meta: lead.source_meta,
        facebook_lead: {
          wedding_date: lead.wedding_date,
          wedding_date_raw: lead.wedding_date_raw,
          client_budget_amount: lead.client_budget_amount,
          event_type: lead.event_type,
          venue: lead.venue,
          city: lead.city,
          guest_count: lead.guest_count,
        },
      },
      null,
      client,
      opts
    )

    if (lead.wedding_date) {
      await createLeadEvent(client, row.id, lead, opts)
    }

    await client.query('COMMIT')
    return row
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function createLeadEvent(client, leadId, lead, opts) {
  const position = await client.query(
    'SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM lead_events WHERE lead_id = $1',
    [leadId]
  )
  const dateStatus = isMonthOnlyDate(lead.wedding_date_raw) ? 'tentative' : 'confirmed'

  const event = await client.query(
    `
    INSERT INTO lead_events (lead_id, event_date, event_type, venue, position, date_status, slot, pax)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING id, event_type, event_date
    `,
    [
      leadId,
      lead.wedding_date,
      lead.event_type || 'Wedding',
      lead.venue || lead.city || null,
      position.rows[0]?.next_position || 1,
      dateStatus,
      'Day',
      lead.guest_count || null,
    ]
  )

  await logLeadActivity(
    leadId,
    'event_create',
    {
      log_type: 'activity',
      source: SOURCE,
      event_id: event.rows[0]?.id || null,
      event_name: event.rows[0]?.event_type || lead.event_type || 'Wedding',
      event_date: lead.wedding_date,
      venue: lead.venue || null,
      city_name: lead.city || null,
      date_status: dateStatus,
    },
    null,
    client,
    opts
  )
}

async function findDuplicateLead(pool, lead, opts) {
  const phone = canonicalizePhone(lead.phone, opts)
  const email = normalizeEmail(lead.email)
  if (!phone && !email) return null

  const params = []
  const clauses = []

  if (phone) {
    params.push(phone)
    clauses.push(`
      phone_primary = $${params.length}
      OR phone_secondary = $${params.length}
      OR bride_phone_primary = $${params.length}
      OR bride_phone_secondary = $${params.length}
      OR groom_phone_primary = $${params.length}
      OR groom_phone_secondary = $${params.length}
    `)
  }

  if (email) {
    params.push(email)
    clauses.push(`
      lower(email) = lower($${params.length})
      OR lower(bride_email) = lower($${params.length})
      OR lower(groom_email) = lower($${params.length})
    `)
  }

  const result = await pool.query(
    `
    SELECT id, lead_number, name, status, phone_primary, email
    FROM leads
    WHERE ${clauses.map(clause => `(${clause})`).join(' OR ')}
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    params
  )

  return result.rows[0] || null
}

async function getNextLeadNumber(client, opts) {
  if (typeof opts.getNextLeadNumber === 'function') {
    return opts.getNextLeadNumber(client)
  }

  const now = new Date()
  const prefix = now.getFullYear() % 100
  await client.query('SELECT pg_advisory_xact_lock($1)', [prefix])

  const result = await client.query(
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

  const nextSeq = (Number(result.rows[0]?.max_seq) || 0) + 1
  if (nextSeq <= 999) return prefix * 1000 + nextSeq
  return prefix * 10000 + nextSeq
}

async function getAssignedUserId(client, opts) {
  if (typeof opts.getRoundRobinSalesUserId === 'function') {
    return opts.getRoundRobinSalesUserId(client)
  }
  return null
}

async function logLeadActivity(leadId, activityType, metadata, userId, client, opts) {
  if (typeof opts.logLeadActivity === 'function') {
    return opts.logLeadActivity(leadId, activityType, metadata, userId, client)
  }

  await client.query(
    `INSERT INTO lead_activities (lead_id, activity_type, metadata, user_id)
     VALUES ($1,$2,$3,$4)`,
    [leadId, activityType, metadata, userId]
  )
}

function getFieldMap(fieldData) {
  const fields = new Map()
  if (!Array.isArray(fieldData)) return fields

  for (const field of fieldData) {
    if (!field || !field.name) continue
    fields.set(normalizeFieldKey(field.name), Array.isArray(field.values) ? field.values : [])
  }

  return fields
}

function getFieldAnswers(fieldData) {
  if (!Array.isArray(fieldData)) return {}

  return fieldData.reduce((answers, field) => {
    if (!field || !field.name) return answers
    const values = Array.isArray(field.values)
      ? field.values.map(value => String(value || '').trim()).filter(Boolean)
      : []
    answers[normalizeFieldKey(field.name)] = values.length === 1 ? values[0] : values
    return answers
  }, {})
}

function pickField(fields, aliases, matcher) {
  for (const alias of aliases) {
    const value = firstValue(fields.get(normalizeFieldKey(alias)))
    if (value) return value
  }

  if (typeof matcher === 'function') {
    for (const [key, values] of fields.entries()) {
      const value = matcher(key) ? firstValue(values) : null
      if (value) return value
    }
  }

  return null
}

function firstValue(values) {
  if (!Array.isArray(values)) return null
  const value = values.find(item => item !== undefined && item !== null && String(item).trim())
  return value === undefined ? null : String(value).trim()
}

function canonicalizePhone(value, opts) {
  if (!value) return null
  if (typeof opts.canonicalizePhone === 'function') return opts.canonicalizePhone(value)

  const trimmed = String(value).trim()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  return hasPlus ? `+${digits}` : `+91${digits}`
}

function formatName(value, opts) {
  if (typeof opts.formatName === 'function') return opts.formatName(value)
  const name = String(value || '').trim().replace(/\s+/g, ' ')
  return name || null
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  return email || null
}

function normalizeFieldKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseBudgetAmount(value) {
  if (!value) return null

  const text = String(value).toLowerCase().replace(/,/g, ' ')
  const multiplier = /crore|\bcr\b/.test(text)
    ? 10000000
    : /lakh|lac|\blk\b|\bl\b/.test(text)
      ? 100000
      : /\bk\b/.test(text)
        ? 1000
        : 1
  const matches = text.match(/\d+(?:\.\d+)?/g)
  if (!matches) return null

  const values = matches.map(match => Number(match) * multiplier).filter(Number.isFinite)
  if (!values.length) return null

  return Math.round(Math.max(...values))
}

function normalizeFormDate(value) {
  if (!value) return null

  const raw = String(value).trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (slash) {
    const day = slash[1].padStart(2, '0')
    const month = slash[2].padStart(2, '0')
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3]
    if (isValidDate(year, month, day)) return `${year}-${month}-${day}`
  }

  const monthYear = raw.match(/^([a-zA-Z]+)\s+(\d{4})$/)
  if (monthYear) {
    const month = monthNameToNumber(monthYear[1])
    if (month) return `${monthYear[2]}-${month}-01`
  }

  return null
}

function isMonthOnlyDate(value) {
  return /^[a-zA-Z]+\s+\d{4}$/.test(String(value || '').trim())
}

function isValidDate(year, month, day) {
  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime())
    && parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() + 1 === Number(month)
    && parsed.getUTCDate() === Number(day)
}

function monthNameToNumber(value) {
  const months = {
    january: '01',
    jan: '01',
    february: '02',
    feb: '02',
    march: '03',
    mar: '03',
    april: '04',
    apr: '04',
    may: '05',
    june: '06',
    jun: '06',
    july: '07',
    jul: '07',
    august: '08',
    aug: '08',
    september: '09',
    sep: '09',
    sept: '09',
    october: '10',
    oct: '10',
    november: '11',
    nov: '11',
    december: '12',
    dec: '12',
  }

  return months[String(value || '').trim().toLowerCase()] || null
}

function parseInteger(value) {
  if (!value) return null
  const match = String(value).replace(/,/g, '').match(/\d+/)
  if (!match) return null
  const number = Number(match[0])
  return Number.isFinite(number) ? number : null
}

async function safeJson(response) {
  try {
    return await response.json()
  } catch (err) {
    return {}
  }
}

function shouldRetry(err) {
  if (!err.status) return true
  return err.status === 429 || err.status >= 500
}

function isMissingLeadObjectError(err) {
  const error = err?.payload?.error
  return err?.status === 400
    && error?.code === 100
    && error?.error_subcode === 33
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getEnv(primary, fallback) {
  return process.env[primary] || process.env[fallback]
}
