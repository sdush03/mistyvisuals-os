const crypto = require('crypto')

const GRAPH_API_VERSION = process.env.FB_GRAPH_API_VERSION || 'v25.0'
const GRAPH_API_RETRIES = 3
const SOURCE = 'FB Ads'

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
          const adContext = await fetchAdContext(leadMeta.ad_id).catch(err => {
            fastify.log.warn({ err, ad_id: leadMeta.ad_id }, 'Unable to fetch Meta ad context')
            return null
          })
          const lead = mapLeadData(leadData, leadMeta, adContext)

          if (!lead.phone && !lead.email) {
            fastify.log.warn({ lead }, 'Facebook lead skipped because phone and email are missing')
            continue
          }

          const duplicate = await findDuplicateLead(pool, lead, opts)
          if (duplicate) {
            await recordDuplicateLeadInquiry(pool, duplicate, lead, opts)
            fastify.log.info({ lead, duplicate }, 'duplicate lead inquiry recorded')
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

  /* ---- Facebook Lead Polling (fallback for webhook delivery issues) ---- */

  const pollAccessToken = getEnv('FB_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN')
  if (pollAccessToken) {
    const POLL_INTERVAL_MS = parseInt(process.env.FB_POLL_INTERVAL_MS || '180000', 10)
    let pollPageId = null

    async function discoverPageId() {
      const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/me`)
      url.searchParams.set('fields', 'id,name')
      url.searchParams.set('access_token', pollAccessToken)
      const me = await fetchGraphJson(url)
      return { id: me.id, name: me.name }
    }

    async function fetchActiveForms(pageId) {
      const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/leadgen_forms`)
      url.searchParams.set('fields', 'id,name,status')
      url.searchParams.set('limit', '25')
      url.searchParams.set('access_token', pollAccessToken)
      const payload = await fetchGraphJson(url)
      return Array.isArray(payload.data) ? payload.data.filter(f => f.status === 'ACTIVE') : []
    }

    async function fetchRecentLeads(formId) {
      const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${formId}/leads`)
      url.searchParams.set('fields', 'id,created_time,field_data,ad_id')
      url.searchParams.set('limit', '25')
      url.searchParams.set('access_token', pollAccessToken)
      const payload = await fetchGraphJson(url)
      return Array.isArray(payload.data) ? payload.data : []
    }

    async function isLeadAlreadyProcessed(leadgenId) {
      const r1 = await pool.query(
        `SELECT 1 FROM lead_activities
         WHERE activity_type = 'lead_created'
         AND metadata @> $1::jsonb
         LIMIT 1`,
        [JSON.stringify({ source_meta: { leadgen_id: leadgenId } })]
      )
      if (r1.rows.length) return true

      const r2 = await pool.query(
        `SELECT 1 FROM lead_activities
         WHERE activity_type = 'facebook_lead_duplicate'
         AND metadata->'incoming_lead'->'source_meta'->>'leadgen_id' = $1
         LIMIT 1`,
        [leadgenId]
      )
      return r2.rows.length > 0
    }

    async function pollLeads() {
      try {
        if (!pollPageId) {
          const page = await discoverPageId()
          pollPageId = page.id
          fastify.log.info({ pageId: pollPageId, pageName: page.name }, 'FB poll: page discovered')
        }

        const forms = await fetchActiveForms(pollPageId)
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
        let newCount = 0

        for (const form of forms) {
          let leads
          try {
            leads = await fetchRecentLeads(form.id)
          } catch (err) {
            fastify.log.warn({ err, formId: form.id, formName: form.name }, 'FB poll: failed to fetch leads')
            continue
          }

          for (const leadData of leads) {
            if (leadData.created_time && new Date(leadData.created_time) < cutoff) continue

            const leadgenId = String(leadData.id)
            const alreadyProcessed = await isLeadAlreadyProcessed(leadgenId)
            if (alreadyProcessed) continue

            const leadMeta = {
              leadgen_id: leadgenId,
              form_id: String(form.id),
              ad_id: leadData.ad_id ? String(leadData.ad_id) : null,
              page_id: pollPageId,
              created_time: leadData.created_time || null,
            }

            try {
              fastify.log.info(leadMeta, 'FB poll: new lead found')

              const adContext = leadMeta.ad_id
                ? await fetchAdContext(leadMeta.ad_id).catch(err => {
                    fastify.log.warn({ err, ad_id: leadMeta.ad_id }, 'FB poll: unable to fetch ad context')
                    return null
                  })
                : null

              const lead = mapLeadData(leadData, leadMeta, adContext)

              if (!lead.phone && !lead.email) {
                fastify.log.warn({ leadgenId }, 'FB poll: lead skipped (no phone/email)')
                continue
              }

              const duplicate = await findDuplicateLead(pool, lead, opts)
              if (duplicate) {
                await recordDuplicateLeadInquiry(pool, duplicate, lead, opts)
                fastify.log.info({ leadgenId, duplicateId: duplicate.id }, 'FB poll: duplicate recorded')
                continue
              }

              const created = await createLead(pool, lead, opts)
              fastify.log.info(
                { lead_id: created.id, lead_number: created.lead_number },
                'FB poll: lead created'
              )
              newCount += 1
            } catch (err) {
              fastify.log.error({ err, leadgen_id: leadgenId }, 'FB poll: error processing lead')
            }
          }
        }

        if (newCount > 0) {
          fastify.log.info({ count: newCount }, 'FB poll: new leads processed')
        }
      } catch (err) {
        fastify.log.error({ err }, 'FB poll: error during poll cycle')
      }
    }

    // Initial poll 15s after startup, then every POLL_INTERVAL_MS
    const startTimer = setTimeout(pollLeads, 15000)
    const intervalId = setInterval(pollLeads, POLL_INTERVAL_MS)
    fastify.addHook('onClose', () => {
      clearTimeout(startTimer)
      clearInterval(intervalId)
    })
    fastify.log.info({ intervalMs: POLL_INTERVAL_MS }, 'FB lead polling enabled')
  }
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

async function fetchAdContext(adId) {
  if (!adId) return null

  const accessToken = getEnv('FB_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN')
  if (!accessToken) return null

  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(adId)}`)
  url.searchParams.set('fields', 'id,name,adset_id,campaign_id,adset{id,name},campaign{id,name}')
  url.searchParams.set('access_token', accessToken)

  const payload = await fetchGraphJson(url)
  return {
    ad_id: payload.id || adId,
    ad_name: payload.name || null,
    adset_id: payload.adset?.id || payload.adset_id || null,
    adset_name: payload.adset?.name || null,
    campaign_id: payload.campaign?.id || payload.campaign_id || null,
    campaign_name: payload.campaign?.name || null,
  }
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

function mapLeadData(leadData, leadMeta, adContext = null) {
  leadData = leadData || {}
  const fields = getFieldMap(leadData.field_data)
  const sourceName = buildSourceName(leadMeta, adContext)
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
    source_name: sourceName,
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
      ad_context: adContext,
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
        coverage_scope,
        assigned_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, lead_number, name, phone_primary
      `,
      [
        leadNumber,
        formatName(lead.name, opts) || 'Facebook Lead',
        phone,
        lead.email,
        SOURCE,
        lead.source_name,
        'Both Sides',
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

    await createLeadNote(client, row.id, buildLeadNote(lead))

    await client.query('COMMIT')
    return row
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function createLeadNote(client, leadId, noteText) {
  if (!noteText) return

  await client.query(
    `INSERT INTO lead_notes (lead_id, note_text, status_at_time, user_id)
     SELECT $1, $2, status, $3
     FROM leads
     WHERE id = $1`,
    [leadId, noteText, null]
  )
}

async function recordDuplicateLeadInquiry(pool, duplicate, lead, opts) {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    await client.query(
      'UPDATE leads SET updated_at = NOW() WHERE id = $1',
      [duplicate.id]
    )

    await createLeadNote(client, duplicate.id, buildLeadNote(lead, 'Repeat Facebook Lead Ads inquiry'))

    await logLeadActivity(
      duplicate.id,
      'facebook_lead_duplicate',
      {
        log_type: 'activity',
        source: SOURCE,
        incoming_lead: lead,
        duplicate_lead: {
          id: duplicate.id,
          lead_number: duplicate.lead_number,
          name: duplicate.name,
        },
      },
      null,
      client,
      opts
    )

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  await createDuplicateLeadNotification(pool, duplicate, lead, opts)
}

async function createDuplicateLeadNotification(pool, duplicate, lead, opts) {
  const target = {
    userId: duplicate.assigned_user_id || null,
    roleTarget: duplicate.assigned_user_id ? null : 'sales',
    title: 'Repeat Facebook inquiry',
    message: `${lead.name || 'A Facebook lead'} submitted the form again for lead #${duplicate.lead_number}.`,
    category: 'LEAD',
    type: 'WARNING',
    linkUrl: `/leads/${duplicate.id}`,
  }

  if (typeof opts.createNotification === 'function') {
    await opts.createNotification(target, pool)
    return
  }

  await pool.query(
    `INSERT INTO notifications (user_id, role_target, title, message, category, type, link_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      target.userId,
      target.roleTarget,
      target.title,
      target.message,
      target.category,
      target.type,
      target.linkUrl,
    ]
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
    SELECT id, lead_number, name, status, phone_primary, email, assigned_user_id
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

function buildSourceName(leadMeta, adContext) {
  if (adContext || leadMeta.ad_id) {
    const campaign = adContext?.campaign_name || adContext?.campaign_id || 'Campaign'
    const adSet = adContext?.adset_name || adContext?.adset_id || 'Ad Set'
    const ad = adContext?.ad_name || adContext?.ad_id || leadMeta.ad_id || 'Ad'
    return `${campaign} | ${adSet} | ${ad}`
  }

  if (leadMeta.form_id) {
    return `Form ${leadMeta.form_id} | Lead ${leadMeta.leadgen_id}`
  }

  return `Lead ${leadMeta.leadgen_id}`
}

function buildLeadNote(lead, title = 'Facebook Lead Ads inquiry') {
  const meta = lead.source_meta || {}
  const lines = [
    title,
    `Ref: ${SOURCE} ${lead.source_name || ''}`.trim(),
    '',
    'Contact',
    `Name: ${lead.name || '-'}`,
    `Phone: ${lead.phone || '-'}`,
    `Email: ${lead.email || '-'}`,
    '',
    'Meta',
    `Leadgen ID: ${meta.leadgen_id || '-'}`,
    `Form ID: ${meta.form_id || '-'}`,
    `Page ID: ${meta.page_id || '-'}`,
    `Ad ID: ${meta.ad_id || '-'}`,
    `Created Time: ${meta.created_time || '-'}`,
  ]

  if (meta.ad_context) {
    lines.push(
      `Campaign: ${meta.ad_context.campaign_name || meta.ad_context.campaign_id || '-'}`,
      `Ad Set: ${meta.ad_context.adset_name || meta.ad_context.adset_id || '-'}`,
      `Ad: ${meta.ad_context.ad_name || meta.ad_context.ad_id || '-'}`
    )
  }

  const answers = formatFieldAnswersForNote(meta.raw_field_data)
  if (answers.length) {
    lines.push('', 'Instant Form Answers', ...answers)
  }

  return lines.join('\n')
}

function formatFieldAnswersForNote(fieldData) {
  if (!Array.isArray(fieldData)) return []

  return fieldData
    .filter(field => field && field.name)
    .map(field => {
      const values = Array.isArray(field.values)
        ? field.values.map(value => String(value || '').trim()).filter(Boolean)
        : []
      return `${formatFieldLabel(field.name)}: ${values.length ? values.join(', ') : '-'}`
    })
}

function formatFieldLabel(value) {
  return String(value || '')
    .replace(/[_/()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
