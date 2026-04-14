const { GoogleGenerativeAI } = require('@google/generative-ai')

const SYSTEM_PROMPT = `You are MistyAI, an intelligent CRM assistant for MistyVisuals — a premium wedding photography company in India. You help the sales team manage leads efficiently through natural conversation.

## YOUR CAPABILITIES
1. **Query leads** — search, filter, count, find upcoming events
2. **Create leads** — gather required info conversationally
3. **Answer CRM questions** — conversion rates, pipeline health, etc.

## LEAD SCHEMA
- name (string, required) — lead/client name
- primary_phone (string, required) — 10-digit Indian mobile number
- source (string, required) — one of: Instagram, WhatsApp, Direct Call, Reference, Website, JustDial, Other
- source_name (string) — REQUIRED if source is WhatsApp, Direct Call, or Reference (who referred/contacted)
- bride_name, groom_name (optional strings)
- client_budget_amount (optional number in INR)
- coverage_scope (optional) — one of: photos_only, videos_only, photos_and_videos

## LEAD STATUSES
New, Contacted, Quoted, Follow Up, Negotiation, Awaiting Advance, Converted, Rejected, Lost

## HEAT LEVELS
Hot, Warm, Cold

## RESPONSE FORMAT
Always respond with valid JSON (no markdown, no code fences). Use exactly one of these formats:

### 1. Query — when user asks to find/show/list/count leads
{
  "type": "query",
  "message": "Human readable description of what you're searching for",
  "query": {
    "intent": "search" | "count",
    "filters": {
      "status": "comma-separated statuses or null",
      "heat": "comma-separated heat levels or null",
      "source": "comma-separated sources or null",
      "search": "text search term or null",
      "event_in_days": number or null,
      "created_mode": "last_7" | "last_30" | null,
      "priority": "important" | "potential" | null
    }
  }
}

### 2. Action — when user wants to create/update something and ALL required fields are present
{
  "type": "action",
  "message": "Confirmation message",
  "action": {
    "intent": "create_lead" | "update_status" | "set_followup",
    "params": { ... all required params ... }
  }
}

For create_lead params: { name, primary_phone, source, source_name?, bride_name?, groom_name?, client_budget_amount?, coverage_scope? }
For update_status params: { search_name, new_status }
For set_followup params: { search_name, date (YYYY-MM-DD) }

### 3. Need Info — when required fields are missing for an action
{
  "type": "need_info",
  "message": "Friendly question asking for the missing info",
  "partial": { ... fields collected so far ... },
  "missing": ["field1", "field2"]
}

### 4. Answer — for general questions or conversational responses
{
  "type": "answer",
  "message": "Your response"
}

## RULES
- For phone numbers: accept any format, normalize to 10 digits (strip +91, spaces, dashes)
- For dates: interpret relative dates like "tomorrow", "next Tuesday", "Dec 15" relative to today
- For source: if user says "insta" → Instagram, "WA" → WhatsApp, "ref" → Reference, "website"/"web" → Website
- When creating a lead, if source is missing, ASK (don't assume)
- If user says something ambiguous, ask for clarification
- Keep messages concise and professional but warm
- Today's date is: {{TODAY}}
- Use Indian number formatting (lakhs, crores) for amounts`

module.exports = async function aiRoutes(fastify, opts) {
  const {
    pool,
    getAuthFromRequest,
    requireAuth,
    toISTDateString,
  } = opts

  const apiKey = process.env.GEMINI_API_KEY
  let genAI = null
  let model = null

  if (apiKey) {
    genAI = new GoogleGenerativeAI(apiKey)
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  }

  // ── Chat endpoint ──
  fastify.post('/ai/chat', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    if (!model) {
      return reply.code(503).send({
        type: 'answer',
        message: 'AI assistant is not configured. Please add GEMINI_API_KEY to your environment.',
      })
    }

    const { message, history = [] } = req.body || {}
    if (!message || !String(message).trim()) {
      return reply.code(400).send({ error: 'Message is required' })
    }

    const isAdmin = (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin')
    const userId = auth.sub
    const today = toISTDateString(new Date())

    const systemPrompt = SYSTEM_PROMPT.replace('{{TODAY}}', today)

    // Build conversation history for Gemini
    const chatHistory = []
    for (const msg of history.slice(-10)) {
      if (msg.role === 'user') {
        chatHistory.push({ role: 'user', parts: [{ text: msg.content }] })
      } else if (msg.role === 'assistant') {
        chatHistory.push({ role: 'model', parts: [{ text: msg.content }] })
      }
    }

    try {
      const chat = model.startChat({
        history: chatHistory,
        systemInstruction: systemPrompt,
      })

      const result = await chat.sendMessage(String(message).trim())
      const responseText = result.response.text()

      // Parse the AI response
      let parsed
      try {
        // Strip potential markdown code fences
        const cleaned = responseText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
        parsed = JSON.parse(cleaned)
      } catch {
        // If AI didn't return valid JSON, wrap it as an answer
        parsed = { type: 'answer', message: responseText }
      }

      // Execute based on type
      if (parsed.type === 'query' && parsed.query) {
        const queryResult = await executeQuery(parsed.query, userId, isAdmin, pool)
        return {
          type: 'query_result',
          message: parsed.message,
          data: queryResult,
          rawResponse: JSON.stringify(parsed),
        }
      }

      if (parsed.type === 'action' && parsed.action) {
        if (parsed.action.intent === 'create_lead') {
          // Don't auto-execute creates — confirm first
          return {
            type: 'confirm_action',
            message: parsed.message,
            action: parsed.action,
            rawResponse: JSON.stringify(parsed),
          }
        }
        if (parsed.action.intent === 'update_status') {
          const result = await executeStatusUpdate(parsed.action.params, userId, isAdmin, pool)
          return {
            type: 'action_result',
            message: result.message,
            success: result.success,
            rawResponse: JSON.stringify(parsed),
          }
        }
        if (parsed.action.intent === 'set_followup') {
          const result = await executeSetFollowup(parsed.action.params, userId, isAdmin, pool)
          return {
            type: 'action_result',
            message: result.message,
            success: result.success,
            rawResponse: JSON.stringify(parsed),
          }
        }
      }

      // need_info, answer, or unrecognized — pass through
      return {
        ...parsed,
        rawResponse: JSON.stringify(parsed),
      }
    } catch (err) {
      console.error('AI chat error:', err)
      return reply.code(500).send({
        type: 'answer',
        message: 'Sorry, I had trouble processing that. Please try again.',
      })
    }
  })

  // ── Execute confirmed action ──
  fastify.post('/ai/execute', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    const { action } = req.body || {}
    if (!action || !action.intent) {
      return reply.code(400).send({ error: 'No action to execute' })
    }

    const isAdmin = (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin')
    const userId = auth.sub

    try {
      if (action.intent === 'create_lead') {
        const result = await executeCreateLead(action.params, userId, isAdmin, auth, pool)
        return result
      }
      return reply.code(400).send({ error: 'Unknown action' })
    } catch (err) {
      console.error('AI execute error:', err)
      return reply.code(500).send({ error: 'Failed to execute action' })
    }
  })

  // ── Query executor ──
  async function executeQuery(query, userId, isAdmin, pool) {
    const filters = query.filters || {}
    const intent = query.intent || 'search'

    const where = []
    const params = []
    const addParam = (v) => { params.push(v); return `$${params.length}` }

    // User-level filtering
    if (!isAdmin) {
      where.push(`l.assigned_user_id = ${addParam(userId)}`)
    }

    if (filters.status) {
      const list = filters.status.split(',').map(s => s.trim()).filter(Boolean)
      if (list.length === 1) where.push(`l.status = ${addParam(list[0])}`)
      else if (list.length > 1) where.push(`l.status = ANY(${addParam(list)})`)
    }
    if (filters.heat) {
      const list = filters.heat.split(',').map(s => s.trim()).filter(Boolean)
      if (list.length === 1) where.push(`l.heat = ${addParam(list[0])}`)
      else if (list.length > 1) where.push(`l.heat = ANY(${addParam(list)})`)
    }
    if (filters.source) {
      const list = filters.source.split(',').map(s => s.trim()).filter(Boolean)
      if (list.length === 1) where.push(`l.source = ${addParam(list[0])}`)
      else if (list.length > 1) where.push(`l.source = ANY(${addParam(list)})`)
    }
    if (filters.search) {
      where.push(`(l.name ILIKE ${addParam(`%${filters.search}%`)} OR l.bride_name ILIKE ${addParam(`%${filters.search}%`)} OR l.groom_name ILIKE ${addParam(`%${filters.search}%`)})`)
    }
    if (filters.priority === 'important') where.push('l.important = true')
    if (filters.priority === 'potential') where.push('l.potential = true')

    if (filters.created_mode === 'last_7') {
      where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - interval '7 days'`)
    } else if (filters.created_mode === 'last_30') {
      where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - interval '30 days'`)
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    if (filters.event_in_days) {
      // Special query: leads with events in next N days
      const days = Math.max(1, Math.min(365, Number(filters.event_in_days) || 45))
      const eventWhere = where.length ? where.join(' AND ') + ' AND ' : ''
      const q = `
        SELECT DISTINCT l.id, l.name, l.status, l.heat, l.source, l.phone_primary,
               l.bride_name, l.groom_name,
               COALESCE(l.amount_quoted, l.client_budget_amount) as deal_value,
               e.event_date, e.event_type, e.city, e.state
        FROM leads l
        JOIN lead_events e ON e.lead_id = l.id
        WHERE ${eventWhere}
              e.event_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
          AND e.event_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + ${addParam(days + ' days')}::interval
        ORDER BY e.event_date ASC
        LIMIT 50
      `
      const r = await pool.query(q, params)
      return { intent, count: r.rows.length, leads: r.rows }
    }

    if (intent === 'count') {
      const r = await pool.query(`SELECT COUNT(*)::int as count FROM leads l ${whereClause}`, params)
      return { intent: 'count', count: r.rows[0]?.count || 0 }
    }

    // Default: search
    const r = await pool.query(`
      SELECT l.id, l.name, l.status, l.heat, l.source, l.phone_primary,
             l.bride_name, l.groom_name, l.next_followup_date,
             COALESCE(l.amount_quoted, l.client_budget_amount) as deal_value,
             l.created_at
      FROM leads l
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT 20
    `, params)
    return { intent: 'search', count: r.rows.length, leads: r.rows }
  }

  // ── Create lead executor ──
  async function executeCreateLead(params, userId, isAdmin, auth, pool) {
    const { name, primary_phone, source, source_name, bride_name, groom_name, client_budget_amount, coverage_scope } = params || {}

    if (!name) return { success: false, message: 'Name is required' }
    if (!primary_phone) return { success: false, message: 'Phone number is required' }

    // Simulate the POST /leads request
    const fakeReq = {
      body: {
        name,
        primary_phone: String(primary_phone).replace(/[\s\-+]/g, '').replace(/^91/, ''),
        source: source || 'Unknown',
        source_name: source_name || null,
        bride_name: bride_name || null,
        groom_name: groom_name || null,
        client_budget_amount: client_budget_amount || null,
        coverage_scope: coverage_scope || null,
      },
    }

    // Use a direct insert similar to the leads endpoint
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Get next lead number
      const seqRes = await client.query(`SELECT COALESCE(MAX(lead_number), 0) + 1 AS next FROM leads`)
      const leadNumber = seqRes.rows[0].next

      // Get assigned user
      let assignedUserId = userId
      if (isAdmin) {
        const rrRes = await client.query(`
          SELECT u.id FROM users u
          JOIN user_roles ur ON ur.user_id = u.id
          JOIN roles r ON r.id = ur.role_id
          WHERE r.key = 'sales' AND u.is_active = true
          ORDER BY (SELECT COUNT(*) FROM leads WHERE assigned_user_id = u.id) ASC
          LIMIT 1
        `)
        if (rrRes.rows.length) assignedUserId = rrRes.rows[0].id
      }

      const phone = String(primary_phone).replace(/[\s\-+]/g, '').replace(/^91/, '')

      const r = await client.query(`
        INSERT INTO leads (lead_number, name, source, source_name, phone_primary, bride_name, groom_name, client_budget_amount, coverage_scope, assigned_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, lead_number, name, phone_primary
      `, [
        leadNumber,
        String(name).trim(),
        source || 'Unknown',
        source_name || null,
        phone,
        bride_name || null,
        groom_name || null,
        client_budget_amount || null,
        coverage_scope || null,
        assignedUserId,
      ])

      await client.query('COMMIT')
      const lead = r.rows[0]
      return {
        success: true,
        message: `✅ Lead created — ${lead.name} (#${lead.lead_number}) | ${lead.phone_primary}`,
        lead: { id: lead.id, lead_number: lead.lead_number, name: lead.name },
      }
    } catch (err) {
      await client.query('ROLLBACK')
      console.error('AI create lead error:', err)
      return { success: false, message: 'Failed to create lead. Please try again.' }
    } finally {
      client.release()
    }
  }

  // ── Status update executor ──
  async function executeStatusUpdate(params, userId, isAdmin, pool) {
    const { search_name, new_status } = params || {}
    if (!search_name || !new_status) return { success: false, message: 'Missing lead name or status' }

    const validStatuses = ['New', 'Contacted', 'Quoted', 'Follow Up', 'Negotiation', 'Awaiting Advance', 'Converted', 'Rejected', 'Lost']
    if (!validStatuses.includes(new_status)) return { success: false, message: `Invalid status. Use one of: ${validStatuses.join(', ')}` }

    const userFilter = isAdmin ? '' : `AND assigned_user_id = $2`
    const searchParams = isAdmin ? [`%${search_name}%`] : [`%${search_name}%`, userId]

    const r = await pool.query(`
      SELECT id, name, status FROM leads
      WHERE name ILIKE $1 ${userFilter}
      ORDER BY created_at DESC LIMIT 5
    `, searchParams)

    if (!r.rows.length) return { success: false, message: `No lead found matching "${search_name}"` }
    if (r.rows.length > 1) {
      const names = r.rows.map(l => `• ${l.name} (${l.status})`).join('\n')
      return { success: false, message: `Multiple leads found:\n${names}\nPlease be more specific.` }
    }

    const lead = r.rows[0]
    await pool.query('UPDATE leads SET status = $1 WHERE id = $2', [new_status, lead.id])
    return { success: true, message: `✅ ${lead.name} moved from ${lead.status} → ${new_status}` }
  }

  // ── Set follow-up executor ──
  async function executeSetFollowup(params, userId, isAdmin, pool) {
    const { search_name, date } = params || {}
    if (!search_name || !date) return { success: false, message: 'Missing lead name or date' }

    const userFilter = isAdmin ? '' : `AND assigned_user_id = $2`
    const searchParams = isAdmin ? [`%${search_name}%`] : [`%${search_name}%`, userId]

    const r = await pool.query(`
      SELECT id, name FROM leads
      WHERE name ILIKE $1 ${userFilter}
      ORDER BY created_at DESC LIMIT 5
    `, searchParams)

    if (!r.rows.length) return { success: false, message: `No lead found matching "${search_name}"` }
    if (r.rows.length > 1) {
      const names = r.rows.map(l => `• ${l.name}`).join('\n')
      return { success: false, message: `Multiple leads found:\n${names}\nPlease be more specific.` }
    }

    const lead = r.rows[0]
    await pool.query('UPDATE leads SET next_followup_date = $1 WHERE id = $2', [date, lead.id])
    return { success: true, message: `✅ Follow-up for ${lead.name} set to ${date}` }
  }
}
