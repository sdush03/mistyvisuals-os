/**
 * Facebook Ads — Insights & Management API
 *
 * Provides endpoints for reading ad performance data (from Meta Marketing API)
 * and managing lead quality/spam flags. Registered under /api prefix.
 *
 * Required env vars:
 *   FB_PAGE_ACCESS_TOKEN | FACEBOOK_PAGE_ACCESS_TOKEN  — system user token
 *   FB_AD_ACCOUNT_ID                                   — e.g. act_452236339616395
 *   FB_GRAPH_API_VERSION (optional, default v25.0)
 */

const GRAPH = process.env.FB_GRAPH_API_VERSION || 'v25.0'
const INSIGHTS_CACHE_TTL_MS = 5 * 60 * 1000 // 5 min

// Simple in-memory cache for expensive Graph API calls
const cache = new Map()

function getCached(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > INSIGHTS_CACHE_TTL_MS) { cache.delete(key); return null }
  return entry.data
}
function setCache(key, data) { cache.set(key, { data, ts: Date.now() }) }

module.exports = async function fbAdsRoutes(fastify, opts) {
  const { pool, requireAdmin: requireAdminFn } = opts

  function getToken() {
    return process.env.FB_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN
  }
  function getAccountId() {
    return process.env.FB_AD_ACCOUNT_ID
  }

  function requireAdmin(req, reply) {
    if (typeof requireAdminFn === 'function') return requireAdminFn(req, reply)
    reply.code(403).send({ error: 'Forbidden' })
    return null
  }

  // ─── Graph API helper ───────────────────────────────────────────────
  async function graphGet(path, params = {}) {
    const token = getToken()
    if (!token) throw Object.assign(new Error('FB access token not configured'), { status: 500 })

    const url = new URL(`https://graph.facebook.com/${GRAPH}/${path}`)
    url.searchParams.set('access_token', token)
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v))
    }

    const res = await fetch(url, { headers: { accept: 'application/json' } })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(`Graph API ${res.status}: ${json?.error?.message || 'Unknown error'}`)
      err.status = res.status
      err.payload = json
      throw err
    }
    return json
  }

  // ─── GET /facebook-ads/overview ─────────────────────────────────────
  // Dashboard KPIs + recent performance
  fastify.get('/facebook-ads/overview', async (req, reply) => {
    const auth = requireAdmin(req, reply)
    if (!auth) return

    const dateFrom = req.query.date_from || null
    const dateTo = req.query.date_to || null

    try {
      // 1) DB: Lead stats from our leads table
      const leadStats = await getLeadStats(pool, dateFrom, dateTo)

      // 2) Meta: Ad account insights (spend, impressions, etc.)
      let adInsights = null
      const accountId = getAccountId()
      if (accountId && getToken()) {
        const cacheKey = `overview:${accountId}:${dateFrom || ''}:${dateTo || ''}`
        adInsights = getCached(cacheKey)
        if (!adInsights) {
          try {
            adInsights = await fetchAccountInsights(accountId, dateFrom, dateTo)
            setCache(cacheKey, adInsights)
          } catch (err) {
            fastify.log.warn({ err: err.message }, 'Failed to fetch Meta ad insights')
            adInsights = { error: err.message }
          }
        }
      }

      return reply.send({ lead_stats: leadStats, ad_insights: adInsights })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch overview' })
    }
  })

  // ─── GET /facebook-ads/campaigns ────────────────────────────────────
  // All campaigns with ad sets and ads from Meta API
  fastify.get('/facebook-ads/campaigns', async (req, reply) => {
    const auth = requireAdmin(req, reply)
    if (!auth) return

    const accountId = getAccountId()
    if (!accountId) return reply.code(400).send({ error: 'FB_AD_ACCOUNT_ID not configured' })

    const dateFrom = req.query.date_from || null
    const dateTo = req.query.date_to || null

    try {
      const cacheKey = `campaigns:${accountId}:${dateFrom || ''}:${dateTo || ''}`
      let data = getCached(cacheKey)
      if (!data) {
        data = await fetchCampaignTree(accountId, dateFrom, dateTo)
        setCache(cacheKey, data)
      }
      return reply.send(data)
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: err.message || 'Failed to fetch campaigns' })
    }
  })

  // ─── GET /facebook-ads/leads ────────────────────────────────────────
  // All FB Ads leads with campaign/adset/ad grouping from our DB
  fastify.get('/facebook-ads/leads', async (req, reply) => {
    const auth = requireAdmin(req, reply)
    if (!auth) return

    const { date_from, date_to, campaign, adset, ad, quality, spam, status, search } = req.query || {}

    try {
      const where = [`l.source = 'FB Ads'`]
      const params = []
      const addParam = (v) => { params.push(v); return `$${params.length}` }

      if (date_from) where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= ${addParam(date_from)}`)
      if (date_to) where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= ${addParam(date_to)}`)

      if (status) {
        const statuses = String(status).split(',').map(s => s.trim()).filter(Boolean)
        if (statuses.length) where.push(`l.status = ANY(${addParam(statuses)})`)
      }

      if (quality) {
        const quals = String(quality).split(',').map(s => s.trim()).filter(Boolean)
        if (quals.includes('unrated')) {
          const rated = quals.filter(q => q !== 'unrated')
          if (rated.length) {
            where.push(`(l.fb_lead_quality = ANY(${addParam(rated)}) OR l.fb_lead_quality IS NULL)`)
          } else {
            where.push(`l.fb_lead_quality IS NULL`)
          }
        } else {
          where.push(`l.fb_lead_quality = ANY(${addParam(quals)})`)
        }
      }

      if (spam === 'only') where.push(`l.fb_is_spam = true`)
      else if (spam === 'hide') where.push(`(l.fb_is_spam = false OR l.fb_is_spam IS NULL)`)

      if (search) {
        const q = `%${String(search).trim().toLowerCase()}%`
        where.push(`(LOWER(l.name) LIKE ${addParam(q)} OR l.phone_primary LIKE ${addParam(q)} OR LOWER(l.source_name) LIKE ${addParam(q)})`)
      }

      const rows = (await pool.query(`
        SELECT
          l.id, l.lead_number, l.name, l.phone_primary, l.email,
          l.status, l.source_name, l.city, l.event_type,
          l.client_budget_amount, l.amount_quoted,
          l.fb_lead_quality, l.fb_is_spam,
          l.created_at, l.updated_at,
          u.name AS assigned_user_name,
          (
            SELECT la.metadata
            FROM lead_activities la
            WHERE la.lead_id = l.id AND la.activity_type = 'lead_created'
            ORDER BY la.created_at ASC LIMIT 1
          ) AS creation_metadata
        FROM leads l
        LEFT JOIN users u ON u.id = l.assigned_user_id
        WHERE ${where.join(' AND ')}
        ORDER BY l.created_at DESC
      `, params)).rows

      // Parse ad context from creation_metadata
      const leads = rows.map(row => {
        const meta = row.creation_metadata || {}
        const sm = meta.source_meta || {}
        const ctx = sm.ad_context || {}
        return {
          id: row.id,
          lead_number: row.lead_number,
          name: row.name,
          phone: row.phone_primary,
          email: row.email,
          status: row.status,
          source_name: row.source_name,
          city: row.city,
          event_type: row.event_type,
          budget: row.client_budget_amount,
          amount_quoted: row.amount_quoted,
          fb_lead_quality: row.fb_lead_quality,
          fb_is_spam: row.fb_is_spam || false,
          created_at: row.created_at,
          assigned_user_name: row.assigned_user_name,
          // Ad hierarchy
          campaign_id: ctx.campaign_id || null,
          campaign_name: ctx.campaign_name || null,
          adset_id: ctx.adset_id || null,
          adset_name: ctx.adset_name || null,
          ad_id: ctx.ad_id || sm.ad_id || null,
          ad_name: ctx.ad_name || null,
          form_id: sm.form_id || null,
          leadgen_id: sm.leadgen_id || null,
        }
      })

      // Filter by campaign/adset/ad names if specified
      let filtered = leads
      if (campaign) {
        const c = String(campaign).toLowerCase()
        filtered = filtered.filter(l => l.campaign_name && l.campaign_name.toLowerCase().includes(c))
      }
      if (adset) {
        const a = String(adset).toLowerCase()
        filtered = filtered.filter(l => l.adset_name && l.adset_name.toLowerCase().includes(a))
      }
      if (ad) {
        const a = String(ad).toLowerCase()
        filtered = filtered.filter(l => l.ad_name && l.ad_name.toLowerCase().includes(a))
      }

      return reply.send(filtered)
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch FB leads' })
    }
  })

  // ─── PATCH /facebook-ads/leads/:id/quality ──────────────────────────
  fastify.patch('/facebook-ads/leads/:id/quality', async (req, reply) => {
    const auth = requireAdmin(req, reply)
    if (!auth) return

    const id = Number(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })

    const quality = req.body?.quality || null
    const valid = [null, 'excellent', 'good', 'average', 'poor']
    if (quality !== null && !valid.includes(quality)) {
      return reply.code(400).send({ error: 'Invalid quality value' })
    }

    try {
      await pool.query(`UPDATE leads SET fb_lead_quality = $1, updated_at = NOW() WHERE id = $2`, [quality, id])
      return reply.send({ ok: true, id, fb_lead_quality: quality })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Failed to update quality' })
    }
  })

  // ─── PATCH /facebook-ads/leads/:id/spam ─────────────────────────────
  fastify.patch('/facebook-ads/leads/:id/spam', async (req, reply) => {
    const auth = requireAdmin(req, reply)
    if (!auth) return

    const id = Number(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })

    const isSpam = req.body?.is_spam === true
    try {
      await pool.query(`UPDATE leads SET fb_is_spam = $1, updated_at = NOW() WHERE id = $2`, [isSpam, id])
      return reply.send({ ok: true, id, fb_is_spam: isSpam })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: 'Failed to update spam flag' })
    }
  })

  // ─── GET /facebook-ads/audience ─────────────────────────────────────
  // Demographics breakdown from Meta API
  fastify.get('/facebook-ads/audience', async (req, reply) => {
    const auth = requireAdmin(req, reply)
    if (!auth) return

    const accountId = getAccountId()
    if (!accountId) return reply.code(400).send({ error: 'FB_AD_ACCOUNT_ID not configured' })

    const dateFrom = req.query.date_from || null
    const dateTo = req.query.date_to || null
    const campaignId = req.query.campaign_id || null

    try {
      const cacheKey = `audience:${accountId}:${dateFrom || ''}:${dateTo || ''}:${campaignId || ''}`
      let data = getCached(cacheKey)
      if (!data) {
        data = await fetchAudienceBreakdown(accountId, dateFrom, dateTo, campaignId)
        setCache(cacheKey, data)
      }
      return reply.send(data)
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: err.message || 'Failed to fetch audience data' })
    }
  })

  // ─── GET /facebook-ads/daily-insights ───────────────────────────────
  // Daily spend + leads chart data
  fastify.get('/facebook-ads/daily-insights', async (req, reply) => {
    const auth = requireAdmin(req, reply)
    if (!auth) return

    const accountId = getAccountId()
    if (!accountId) return reply.code(400).send({ error: 'FB_AD_ACCOUNT_ID not configured' })

    const dateFrom = req.query.date_from || null
    const dateTo = req.query.date_to || null

    try {
      const cacheKey = `daily:${accountId}:${dateFrom || ''}:${dateTo || ''}`
      let metaDaily = getCached(cacheKey)
      if (!metaDaily) {
        metaDaily = await fetchDailyInsights(accountId, dateFrom, dateTo)
        setCache(cacheKey, metaDaily)
      }

      // Also get daily lead counts from our DB
      const dateWhere = []
      const dateParams = []
      dateWhere.push(`source = 'FB Ads'`)
      if (dateFrom) { dateParams.push(dateFrom); dateWhere.push(`(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= $${dateParams.length}`) }
      if (dateTo) { dateParams.push(dateTo); dateWhere.push(`(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= $${dateParams.length}`) }

      const dbDaily = (await pool.query(`
        SELECT
          (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS day,
          COUNT(*)::int AS leads
        FROM leads
        WHERE ${dateWhere.join(' AND ')}
        GROUP BY day ORDER BY day
      `, dateParams)).rows

      return reply.send({ meta: metaDaily, db: dbDaily })
    } catch (err) {
      fastify.log.error(err)
      return reply.code(500).send({ error: err.message || 'Failed to fetch daily insights' })
    }
  })

  // ────────────────────────────── Helpers ──────────────────────────────

  async function getLeadStats(pool, dateFrom, dateTo) {
    const where = [`source = 'FB Ads'`]
    const params = []
    if (dateFrom) { params.push(dateFrom); where.push(`(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= $${params.length}`) }
    if (dateTo) { params.push(dateTo); where.push(`(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= $${params.length}`) }

    const whereClause = where.join(' AND ')

    const r = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= date_trunc('month', (NOW() AT TIME ZONE 'Asia/Kolkata'))::date)::int AS this_month,
        COUNT(*) FILTER (WHERE fb_lead_quality IN ('excellent','good'))::int AS quality,
        COUNT(*) FILTER (WHERE fb_is_spam = true)::int AS spam,
        COUNT(*) FILTER (WHERE status = 'Converted')::int AS converted,
        COUNT(*) FILTER (WHERE fb_lead_quality IS NOT NULL)::int AS rated,
        COUNT(*) FILTER (WHERE fb_lead_quality = 'excellent')::int AS excellent,
        COUNT(*) FILTER (WHERE fb_lead_quality = 'good')::int AS good_quality,
        COUNT(*) FILTER (WHERE fb_lead_quality = 'average')::int AS average_quality,
        COUNT(*) FILTER (WHERE fb_lead_quality = 'poor')::int AS poor_quality,
        COUNT(*) FILTER (WHERE status = 'New')::int AS status_new,
        COUNT(*) FILTER (WHERE status = 'Contacted')::int AS status_contacted,
        COUNT(*) FILTER (WHERE status = 'Quoted')::int AS status_quoted,
        COUNT(*) FILTER (WHERE status = 'Follow Up')::int AS status_followup,
        COUNT(*) FILTER (WHERE status = 'Negotiation')::int AS status_negotiation,
        COUNT(*) FILTER (WHERE status = 'Awaiting Advance')::int AS status_awaiting,
        COUNT(*) FILTER (WHERE status = 'Lost')::int AS status_lost,
        COUNT(*) FILTER (WHERE status = 'Rejected')::int AS status_rejected,
        ROUND(AVG(client_budget_amount) FILTER (WHERE client_budget_amount IS NOT NULL AND client_budget_amount > 0))::int AS avg_budget
      FROM leads
      WHERE ${whereClause}
    `, params)

    return r.rows[0] || {}
  }

  async function fetchAccountInsights(accountId, dateFrom, dateTo) {
    const timeRange = buildTimeRange(dateFrom, dateTo)
    const params = {
      fields: 'spend,impressions,reach,clicks,cpc,cpm,ctr,frequency,actions,cost_per_action_type',
      ...(timeRange ? { time_range: JSON.stringify(timeRange) } : {}),
    }

    const data = await graphGet(`${accountId}/insights`, params)
    const row = data?.data?.[0] || {}
    const leads = extractActionValue(row.actions, 'lead')
    const cpl = extractActionValue(row.cost_per_action_type, 'lead')

    return {
      spend: parseFloat(row.spend) || 0,
      impressions: parseInt(row.impressions) || 0,
      reach: parseInt(row.reach) || 0,
      clicks: parseInt(row.clicks) || 0,
      cpc: parseFloat(row.cpc) || 0,
      cpm: parseFloat(row.cpm) || 0,
      ctr: parseFloat(row.ctr) || 0,
      frequency: parseFloat(row.frequency) || 0,
      meta_leads: leads,
      cost_per_lead: cpl,
    }
  }

  async function fetchCampaignTree(accountId, dateFrom, dateTo) {
    const timeRange = buildTimeRange(dateFrom, dateTo)
    const trParam = timeRange ? JSON.stringify(timeRange) : null

    // 1) Campaigns
    const campaignsData = await graphGet(`${accountId}/campaigns`, {
      fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time',
      limit: 100,
    })
    const campaigns = campaignsData?.data || []

    // 2) Campaign-level insights
    const campaignInsightsData = await graphGet(`${accountId}/insights`, {
      fields: 'campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,actions,cost_per_action_type',
      level: 'campaign',
      limit: 100,
      ...(trParam ? { time_range: trParam } : {}),
    })
    const campaignInsights = {}
    for (const row of (campaignInsightsData?.data || [])) {
      campaignInsights[row.campaign_id] = parseInsightRow(row)
    }

    // 3) Ad set-level insights
    const adsetInsightsData = await graphGet(`${accountId}/insights`, {
      fields: 'campaign_id,adset_id,adset_name,spend,impressions,reach,clicks,ctr,actions,cost_per_action_type',
      level: 'adset',
      limit: 200,
      ...(trParam ? { time_range: trParam } : {}),
    })
    const adsetMap = {}
    for (const row of (adsetInsightsData?.data || [])) {
      if (!adsetMap[row.campaign_id]) adsetMap[row.campaign_id] = []
      adsetMap[row.campaign_id].push({ id: row.adset_id, name: row.adset_name, ...parseInsightRow(row) })
    }

    // 4) Ad-level insights
    const adInsightsData = await graphGet(`${accountId}/insights`, {
      fields: 'campaign_id,adset_id,ad_id,ad_name,spend,impressions,reach,clicks,ctr,actions,cost_per_action_type',
      level: 'ad',
      limit: 500,
      ...(trParam ? { time_range: trParam } : {}),
    })
    const adMap = {}
    for (const row of (adInsightsData?.data || [])) {
      const key = `${row.campaign_id}:${row.adset_id}`
      if (!adMap[key]) adMap[key] = []
      adMap[key].push({ id: row.ad_id, name: row.ad_name, ...parseInsightRow(row) })
    }

    // 5) Lead counts from DB per campaign/adset/ad
    const leadCountsR = await pool.query(`
      SELECT
        la.metadata->'source_meta'->'ad_context'->>'campaign_id' AS campaign_id,
        la.metadata->'source_meta'->'ad_context'->>'adset_id' AS adset_id,
        la.metadata->'source_meta'->'ad_context'->>'ad_id' AS ad_id,
        COUNT(*)::int AS db_leads,
        COUNT(*) FILTER (WHERE l.fb_lead_quality IN ('excellent','good'))::int AS quality_leads,
        COUNT(*) FILTER (WHERE l.fb_is_spam = true)::int AS spam_leads,
        COUNT(*) FILTER (WHERE l.status = 'Converted')::int AS converted
      FROM lead_activities la
      JOIN leads l ON l.id = la.lead_id
      WHERE la.activity_type = 'lead_created'
        AND la.metadata->'source_meta'->>'leadgen_id' IS NOT NULL
        AND l.source = 'FB Ads'
      GROUP BY campaign_id, adset_id, ad_id
    `)

    const dbLeadMap = {}
    for (const row of leadCountsR.rows) {
      const cKey = row.campaign_id || '_none'
      const aKey = row.adset_id || '_none'
      const adKey = row.ad_id || '_none'
      const fullKey = `${cKey}:${aKey}:${adKey}`
      dbLeadMap[fullKey] = row
    }

    // Aggregate db leads at campaign and adset levels
    const campaignDbLeads = {}
    const adsetDbLeads = {}
    for (const row of leadCountsR.rows) {
      const cId = row.campaign_id || '_none'
      const asId = row.adset_id || '_none'
      if (!campaignDbLeads[cId]) campaignDbLeads[cId] = { db_leads: 0, quality_leads: 0, spam_leads: 0, converted: 0 }
      campaignDbLeads[cId].db_leads += row.db_leads
      campaignDbLeads[cId].quality_leads += row.quality_leads
      campaignDbLeads[cId].spam_leads += row.spam_leads
      campaignDbLeads[cId].converted += row.converted

      const asKey = `${cId}:${asId}`
      if (!adsetDbLeads[asKey]) adsetDbLeads[asKey] = { db_leads: 0, quality_leads: 0, spam_leads: 0, converted: 0 }
      adsetDbLeads[asKey].db_leads += row.db_leads
      adsetDbLeads[asKey].quality_leads += row.quality_leads
      adsetDbLeads[asKey].spam_leads += row.spam_leads
      adsetDbLeads[asKey].converted += row.converted
    }

    // Build tree
    const tree = campaigns.map(c => {
      const cInsights = campaignInsights[c.id] || {}
      const adsets = (adsetMap[c.id] || []).map(as => {
        const asKey = `${c.id}:${as.id}`
        const ads = (adMap[asKey] || []).map(ad => {
          const dbKey = `${c.id}:${as.id}:${ad.id}`
          return { ...ad, ...(dbLeadMap[dbKey] || { db_leads: 0, quality_leads: 0, spam_leads: 0, converted: 0 }) }
        })
        return { ...as, ads, ...(adsetDbLeads[`${c.id}:${as.id}`] || { db_leads: 0, quality_leads: 0, spam_leads: 0, converted: 0 }) }
      })
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        daily_budget: c.daily_budget,
        lifetime_budget: c.lifetime_budget,
        start_time: c.start_time,
        stop_time: c.stop_time,
        ...cInsights,
        adsets,
        ...(campaignDbLeads[c.id] || { db_leads: 0, quality_leads: 0, spam_leads: 0, converted: 0 }),
      }
    })

    return tree
  }

  async function fetchAudienceBreakdown(accountId, dateFrom, dateTo, campaignId) {
    const timeRange = buildTimeRange(dateFrom, dateTo)
    const trParam = timeRange ? JSON.stringify(timeRange) : null
    const baseParams = {
      fields: 'spend,impressions,reach,clicks,actions,cost_per_action_type',
      limit: 200,
      ...(trParam ? { time_range: trParam } : {}),
    }

    const target = campaignId ? campaignId : accountId
    const levelParam = campaignId ? {} : { level: 'account' }

    // Age + Gender
    let ageGender = []
    try {
      const r = await graphGet(`${target}/insights`, { ...baseParams, ...levelParam, breakdowns: 'age,gender' })
      ageGender = (r?.data || []).map(row => ({
        age: row.age,
        gender: row.gender,
        ...parseInsightRow(row),
      }))
    } catch (e) { fastify.log.warn({ err: e.message }, 'Failed age/gender breakdown') }

    // Region
    let regions = []
    try {
      const r = await graphGet(`${target}/insights`, { ...baseParams, ...levelParam, breakdowns: 'region' })
      regions = (r?.data || []).map(row => ({
        region: row.region,
        ...parseInsightRow(row),
      }))
    } catch (e) { fastify.log.warn({ err: e.message }, 'Failed region breakdown') }

    // Platform
    let platforms = []
    try {
      const r = await graphGet(`${target}/insights`, { ...baseParams, ...levelParam, breakdowns: 'publisher_platform' })
      platforms = (r?.data || []).map(row => ({
        platform: row.publisher_platform,
        ...parseInsightRow(row),
      }))
    } catch (e) { fastify.log.warn({ err: e.message }, 'Failed platform breakdown') }

    // Placement
    let placements = []
    try {
      const r = await graphGet(`${target}/insights`, { ...baseParams, ...levelParam, breakdowns: 'publisher_platform,platform_position' })
      placements = (r?.data || []).map(row => ({
        platform: row.publisher_platform,
        position: row.platform_position,
        ...parseInsightRow(row),
      }))
    } catch (e) { fastify.log.warn({ err: e.message }, 'Failed placement breakdown') }

    // Device
    let devices = []
    try {
      const r = await graphGet(`${target}/insights`, { ...baseParams, ...levelParam, breakdowns: 'device_platform' })
      devices = (r?.data || []).map(row => ({
        device: row.device_platform,
        ...parseInsightRow(row),
      }))
    } catch (e) { fastify.log.warn({ err: e.message }, 'Failed device breakdown') }

    return { age_gender: ageGender, regions, platforms, placements, devices }
  }

  async function fetchDailyInsights(accountId, dateFrom, dateTo) {
    const timeRange = buildTimeRange(dateFrom, dateTo)
    const r = await graphGet(`${accountId}/insights`, {
      fields: 'spend,impressions,reach,clicks,actions,cost_per_action_type',
      time_increment: 1,
      limit: 90,
      ...(timeRange ? { time_range: JSON.stringify(timeRange) } : {}),
    })
    return (r?.data || []).map(row => ({
      date: row.date_start,
      ...parseInsightRow(row),
    }))
  }

  // ─── Utility functions ──────────────────────────────────────────────

  function buildTimeRange(from, to) {
    // "All Time" — no date filter, let Meta return lifetime data
    if (!from && !to) return null
    const range = {}
    if (from) range.since = from
    if (to) range.until = to
    return range
  }

  function parseInsightRow(row) {
    const leads = extractActionValue(row.actions, 'lead')
    const cpl = extractActionValue(row.cost_per_action_type, 'lead')
    return {
      spend: parseFloat(row.spend) || 0,
      impressions: parseInt(row.impressions) || 0,
      reach: parseInt(row.reach) || 0,
      clicks: parseInt(row.clicks) || 0,
      ctr: parseFloat(row.ctr) || 0,
      meta_leads: leads,
      cost_per_lead: cpl,
    }
  }

  function extractActionValue(actions, actionType) {
    if (!Array.isArray(actions)) return 0
    // Try onsite_conversion.lead_grouped first, then lead, fallback to leadgen
    const keys = [
      `onsite_conversion.lead_grouped`,
      actionType,
      'leadgen',
      'onsite_conversion.messaging_first_reply',
    ]
    for (const key of keys) {
      const found = actions.find(a => a.action_type === key)
      if (found) return parseFloat(found.value) || 0
    }
    return 0
  }
}
