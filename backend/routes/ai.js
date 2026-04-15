const { GoogleGenerativeAI } = require('@google/generative-ai')

const SYSTEM_PROMPT = `You are MistyAI, an intelligent CRM assistant for MistyVisuals — a premium wedding photography company in India. You help the sales team manage leads efficiently through natural conversation.

## YOUR CAPABILITIES
1. **Query leads** — search, filter, count, find upcoming events
2. **Create leads** — gather required info conversationally
3. **Update leads** — change phone number, name, or other lead details
4. **Add events** — add event details (Sangeet, Engagement, Wedding, etc.) with dates and city
5. **Update status** — move leads through the pipeline
6. **Set follow-up** — schedule follow-up dates
7. **Answer CRM questions** — conversion rates, pipeline health, etc.

## LEAD SCHEMA
- name (string, required) — lead/client name
- primary_phone (string, required) — Indian mobile number (default country code +91)
- source (string, required) — one of: Instagram, WhatsApp, Direct Call, Reference, Website, JustDial, Other
- source_name (string) — REQUIRED if source is WhatsApp, Direct Call, or Reference (who referred/contacted)
- bride_name, groom_name (optional strings)
- client_budget_amount (optional number in INR)
- coverage_scope (optional) — one of: photos_only, videos_only, photos_and_videos

## LEAD STATUSES
New, Contacted, Quoted, Follow Up, Negotiation, Awaiting Advance, Converted, Rejected, Lost

## HEAT LEVELS
Hot, Warm, Cold

## COMMON EVENT TYPES
Engagement, Sangeet, Mehendi, Haldi, Wedding, Reception, Pre-Wedding, Cocktail, Other

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
      "followup_due": "today" | "this_week" | "this_month" | "overdue" | null,
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
    "intent": "create_lead" | "update_status" | "set_followup" | "update_lead" | "add_event" | "log_note",
    "params": { ... all required params ... }
  }
}

For create_lead params: { name, primary_phone, source, source_name?, bride_name?, groom_name?, client_budget_amount?, coverage_scope? }
For update_status params: { search_name, new_status }
For set_followup params: { search_name, date (YYYY-MM-DD) }
For update_lead params: { search_name, updates: { primary_phone?, name?, bride_name?, groom_name? } }
For add_event params: { search_name, event_type, event_date (YYYY-MM-DD), city? }
For log_note params: { search_name, note (string, summarizing call/document/etc) }

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
- For phone numbers: accept any format. If no country code is provided, assume +91 (India). MUST INCLUDE country code.
- If a user provides an obviously invalid number (e.g., heavily missing digits like "756 000899" which is only 9 digits), politely ask them to check the number instead of executing the action. Indian numbers must be exactly 10 digits (excluding country code).
- For dates: interpret relative dates like "tomorrow", "next Tuesday", "Dec 15", "21st April" relative to today
- For source: if user says "insta" → Instagram, "WA" → WhatsApp, "ref" → Reference, "website"/"web" → Website
- When creating a lead, if source is missing, ASK (don't assume)
- If user says something ambiguous, ask for clarification
- Keep messages concise and professional but warm
- Today's date is: {{TODAY}}
- Use Indian number formatting (lakhs, crores) for amounts
- For queries about follow-up dates ("follow ups due this week", "follow ups this month"), use the "followup_due" filter with value "this_week", "this_month", "overdue", or "today"
- When user asks to update a lead's phone number, name, or other details, use the "update_lead" intent
- When user asks to add an event (like Sangeet, Engagement, Wedding) for a lead, use the "add_event" intent with event_type, event_date, and optionally city
- You ABSOLUTELY CAN update phone numbers, names, and add events for existing leads! Use the "update_lead" or "add_event" intents without hesitating.
- If an audio file, document, or image (WhatsApp screenshot/handwritten note) is provided, analyze its content thoroughly. Extract pricing, notes, timeline changes, and log them using the "log_note" intent. If the content implies directly creating or modifying an event or lead, construct the exact "add_event" or "create_lead" payload required.
- IMPORTANT: Always output raw JSON. Never wrap in markdown code fences.`

module.exports = async function aiRoutes(fastify, opts) {
  const {
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
  } = opts

  const apiKey = process.env.GEMINI_API_KEY
  let genAI = null

  if (apiKey) {
    try {
      genAI = new GoogleGenerativeAI(apiKey)
      console.log('✅ MistyAI: Gemini model initialized successfully')
    } catch (initErr) {
      console.error('❌ MistyAI: Failed to initialize Gemini model:', initErr.message)
    }
  } else {
    console.log('⚠️ MistyAI: GEMINI_API_KEY not set, AI features disabled')
  }

  // Helper: call Gemini with retry on 503
  async function callGeminiWithRetry(chatModel, chatHistory, finalPrompt, maxRetries = 2) {
    let lastError
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const chat = chatModel.startChat({ history: chatHistory })
        const result = await chat.sendMessage(finalPrompt)
        return result.response.text()
      } catch (err) {
        lastError = err
        const status = err?.status || err?.statusCode || ''
        const msg = String(err?.message || '')
        if ((String(status) === '503' || msg.includes('503') || msg.includes('Model is overloaded')) && attempt < maxRetries) {
          // Wait gracefully before retry
          await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
          continue
        }
        throw err
      }
    }
    throw lastError
  }

  // ── Chat endpoint ──
  fastify.post('/ai/chat', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    if (!genAI) {
      return reply.code(503).send({
        type: 'answer',
        message: 'AI assistant is not configured. Please add GEMINI_API_KEY to your environment.',
      })
    }

    const { message, history = [], pageContext, file } = req.body || {}
    if ((!message || !String(message).trim()) && !file) {
      return reply.code(400).send({ error: 'Message or file is required' })
    }

    const isAdmin = (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin')
    const userId = auth.sub
    const today = toISTDateString(new Date())

    const systemPrompt = SYSTEM_PROMPT.replace('{{TODAY}}', today)

    // Build conversation history for Gemini
    // IMPORTANT: Ensure history starts with a user message and roles strictly alternate
    const sanitizedHistory = []
    let expectUser = true
    
    for (const msg of history) {
      if (!msg.content || !String(msg.content).trim()) continue
      
      const role = msg.role === 'user' ? 'user' : 'model'
      
      if (expectUser && role === 'user') {
        sanitizedHistory.push({ role: 'user', parts: [{ text: msg.content }] })
        expectUser = false
      } else if (!expectUser && role === 'model') {
        sanitizedHistory.push({ role: 'model', parts: [{ text: msg.content }] })
        expectUser = true
      } else if (role === 'user' && !expectUser) {
        // We expected a model message but got consecutive user messages → merge them
        if (sanitizedHistory.length > 0) {
          sanitizedHistory[sanitizedHistory.length - 1].parts[0].text += '\n' + msg.content
        }
      } else if (role === 'model' && expectUser) {
        // We expected a user message but got consecutive model messages → merge them
        if (sanitizedHistory.length > 0) {
          sanitizedHistory[sanitizedHistory.length - 1].parts[0].text += '\n' + msg.content
        }
      }
    }

    // Ensure history ends with model (not user), since we're about to send a new user message
    if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === 'user') {
      sanitizedHistory.pop()
    }

    try {
      // Create per-request model with dynamic system instruction (today's date)
      const chatModel = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: { parts: [{ text: systemPrompt }] },
      })

      let promptText = String(message || '').trim() || 'Please analyze this input.'
      if (pageContext && pageContext.url) {
        promptText = `[User Screen Context: Viewing ${pageContext.title || 'page'} at URL: ${pageContext.url}]\n\n${promptText}`
      }

      let finalPrompt = []
      if (promptText) {
        finalPrompt.push({ text: promptText })
      }
      if (file && file.data && file.mimeType) {
        let actualMime = file.mimeType
        
        // Gemini specifically white-lists certain exact MIME types. Browsers often output video/mpeg or audio/mpeg for mp3/whatsapp files.
        if (actualMime.includes('mpeg')) {
          actualMime = 'audio/mp3'
        } else if (actualMime.includes('m4a') || actualMime.includes('mp4')) {
          // If they upload a pure audio mp4 (like Voice Memos), tell Gemini it's raw AAC to prevent the 0-frame video crash.
          actualMime = 'audio/aac'
        }
        
        const base64Data = file.data.includes('base64,') ? file.data.split('base64,')[1] : file.data
        finalPrompt.push({ inlineData: { data: base64Data, mimeType: actualMime } })
      }

      const responseText = await callGeminiWithRetry(
        chatModel,
        sanitizedHistory,
        finalPrompt
      )

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
          return {
            type: 'confirm_action',
            message: parsed.message,
            action: parsed.action,
            rawResponse: JSON.stringify(parsed),
          }
        }
        if (parsed.action.intent === 'update_status') {
          const result = await executeStatusUpdate(parsed.action.params, userId, isAdmin, pool, true)
          if (!result.success) return { type: 'answer', message: result.message }
          return {
            type: 'confirm_action',
            message: result.message,
            action: parsed.action,
            rawResponse: JSON.stringify(parsed),
          }
        }
        if (parsed.action.intent === 'set_followup') {
          const result = await executeSetFollowup(parsed.action.params, userId, isAdmin, pool, true)
          if (!result.success) return { type: 'answer', message: result.message }
          return {
            type: 'confirm_action',
            message: result.message,
            action: parsed.action,
            rawResponse: JSON.stringify(parsed),
          }
        }
        if (parsed.action.intent === 'update_lead') {
          const result = await executeUpdateLead(parsed.action.params, userId, isAdmin, auth, pool, true)
          if (!result.success) return { type: 'answer', message: result.message }
          return {
            type: 'confirm_action',
            message: result.message,
            action: parsed.action,
            rawResponse: JSON.stringify(parsed),
          }
        }
        if (parsed.action.intent === 'add_event') {
          const result = await executeAddEvent(parsed.action.params, userId, isAdmin, auth, pool, true)
          if (!result.success) return { type: 'answer', message: result.message }
          return {
            type: 'confirm_action',
            message: result.message,
            action: parsed.action,
            rawResponse: JSON.stringify(parsed),
          }
        }
        if (parsed.action.intent === 'log_note') {
          const result = await executeLogNote(parsed.action.params, userId, isAdmin, auth, pool, true)
          if (!result.success) return { type: 'answer', message: result.message }
          return {
            type: 'confirm_action',
            message: result.message,
            action: parsed.action,
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
      const errMsg = err?.message || err?.toString() || 'Unknown error'
      const errStatus = err?.status || err?.statusCode || ''
      console.error(`AI chat error [${errStatus}]:`, errMsg)
      if (err?.errorDetails) console.error('Error details:', JSON.stringify(err.errorDetails))

      let userMessage = 'Please try again.'
      if (String(errStatus) === '429') userMessage = 'Rate limit reached — please wait a moment.'
      if (String(errStatus) === '503') userMessage = 'The AI service is temporarily busy. Please try again in a few seconds.'

      return reply.code(500).send({
        type: 'answer',
        message: `Sorry, I had trouble processing that. ${userMessage}`,
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
      if (action.intent === 'create_lead') return await executeCreateLead(action.params, userId, isAdmin, auth, pool)
      if (action.intent === 'update_status') return await executeStatusUpdate(action.params, userId, isAdmin, pool)
      if (action.intent === 'set_followup') return await executeSetFollowup(action.params, userId, isAdmin, pool)
      if (action.intent === 'update_lead') return await executeUpdateLead(action.params, userId, isAdmin, auth, pool)
      if (action.intent === 'add_event') return await executeAddEvent(action.params, userId, isAdmin, auth, pool)
      if (action.intent === 'log_note') return await executeLogNote(action.params, userId, isAdmin, auth, pool)
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

    try {
      const where = []
      const params = []
      const addParam = (v) => { params.push(v); return `$${params.length}` }

      // User-level filtering
      if (!isAdmin) {
        where.push(`l.assigned_user_id = ${addParam(userId)}`)
      }

      if (filters.status) {
        const list = String(filters.status).split(',').map(s => s.trim()).filter(Boolean)
        if (list.length === 1) where.push(`l.status = ${addParam(list[0])}`)
        else if (list.length > 1) where.push(`l.status = ANY(${addParam(list)})`)
      }
      if (filters.heat) {
        const list = String(filters.heat).split(',').map(s => s.trim()).filter(Boolean)
        if (list.length === 1) where.push(`l.heat = ${addParam(list[0])}`)
        else if (list.length > 1) where.push(`l.heat = ANY(${addParam(list)})`)
      }
      if (filters.source) {
        const list = String(filters.source).split(',').map(s => s.trim()).filter(Boolean)
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

      if (filters.followup_due) {
        const istNow = `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date`
        if (filters.followup_due === 'today') {
          where.push(`l.next_followup_date = ${istNow}`)
        } else if (filters.followup_due === 'this_week') {
          where.push(`l.next_followup_date >= ${istNow} AND l.next_followup_date <= ${istNow} + interval '7 days'`)
        } else if (filters.followup_due === 'this_month') {
          where.push(`l.next_followup_date >= date_trunc('month', ${istNow}) AND l.next_followup_date <= (date_trunc('month', ${istNow}) + interval '1 month' - interval '1 day')::date`)
        } else if (filters.followup_due === 'overdue') {
          where.push(`l.next_followup_date < ${istNow}`)
        }
        where.push(`l.status NOT IN ('Converted','Lost','Rejected')`)
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

      if (filters.event_in_days) {
        // Special query: leads with events in next N days
        const days = Math.max(1, Math.min(365, Number(filters.event_in_days) || 45))
        const eventWhere = where.length ? where.join(' AND ') + ' AND ' : ''
        const q = `
          SELECT DISTINCT ON (l.id, e.id) l.id, l.name, l.status, l.heat, l.source, l.phone_primary,
                 l.bride_name, l.groom_name,
                 COALESCE(l.amount_quoted, l.client_budget_amount) as deal_value,
                 e.event_date, e.event_type, e.venue, c.name as city
          FROM leads l
          JOIN lead_events e ON e.lead_id = l.id
          LEFT JOIN cities c ON c.id = e.city_id
          WHERE ${eventWhere}
                e.event_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
            AND e.event_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + make_interval(days => ${addParam(days)})
          ORDER BY l.id, e.id, e.event_date ASC
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
    } catch (queryErr) {
      console.error('AI query execution error:', queryErr.message)
      return { intent: 'search', count: 0, leads: [], error: 'Query failed: ' + queryErr.message }
    }
  }

  // ── Create lead executor ──
  async function executeCreateLead(params, userId, isAdmin, auth, pool) {
    const { name, primary_phone, source, source_name, bride_name, groom_name, client_budget_amount, coverage_scope } = params || {}

    if (!name) return { success: false, message: 'Name is required' }
    if (!primary_phone) return { success: false, message: 'Phone number is required' }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Use the proper lead number generator (with advisory lock)
      const leadNumber = await getNextLeadNumber(client)

      // Get assigned user via round-robin
      let assignedUserId = userId
      if (isAdmin) {
        const rrId = await getRoundRobinSalesUserId(client)
        if (rrId) assignedUserId = rrId
      }

      // Properly normalize phone with +91 default
      const phone = canonicalizePhone(primary_phone)

      const r = await client.query(`
        INSERT INTO leads (lead_number, name, source, source_name, phone_primary, bride_name, groom_name, client_budget_amount, coverage_scope, assigned_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, lead_number, name, phone_primary
      `, [
        leadNumber,
        formatName(name),
        source || 'Other',
        source_name || null,
        phone,
        formatName(bride_name) || null,
        formatName(groom_name) || null,
        client_budget_amount || null,
        coverage_scope || 'Both Sides',
        assignedUserId,
      ])

      await logLeadActivity(
        r.rows[0].id,
        'lead_created',
        {
          log_type: 'activity',
          source: source || 'Other',
          assigned_user_id: assignedUserId,
        },
        auth?.sub || null,
        client
      )

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
  async function executeStatusUpdate(params, userId, isAdmin, pool, dryRun = false) {
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
    if (dryRun) {
      return { success: true, message: `**Ready to update status for ${lead.name}:**\n${lead.status} ➔ ${new_status}\n\nShould I go ahead?` }
    }

    await pool.query('UPDATE leads SET status = $1 WHERE id = $2', [new_status, lead.id])
    return { success: true, message: `✅ ${lead.name} moved from ${lead.status} → ${new_status}` }
  }

  // ── Set follow-up executor ──
  async function executeSetFollowup(params, userId, isAdmin, pool, dryRun = false) {
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
    if (dryRun) {
      return { success: true, message: `**Ready to set follow-up for ${lead.name}:**\nNew follow-up date: ${date}\n\nShould I go ahead?` }
    }

    await pool.query('UPDATE leads SET next_followup_date = $1 WHERE id = $2', [date, lead.id])
    return { success: true, message: `✅ Follow-up for ${lead.name} set to ${date}` }
  }

  // ── Update lead executor ──
  async function executeUpdateLead(params, userId, isAdmin, auth, pool, dryRun = false) {
    const { search_name, updates } = params || {}
    if (!search_name) return { success: false, message: 'Missing lead name to search' }
    if (!updates || Object.keys(updates).length === 0) return { success: false, message: 'No updates specified' }

    const userFilter = isAdmin ? '' : `AND assigned_user_id = $2`
    const searchParams = isAdmin ? [`%${search_name}%`] : [`%${search_name}%`, userId]

    const r = await pool.query(`
      SELECT id, name, phone_primary, bride_name, groom_name FROM leads
      WHERE name ILIKE $1 ${userFilter}
      ORDER BY created_at DESC LIMIT 5
    `, searchParams)

    if (!r.rows.length) return { success: false, message: `No lead found matching "${search_name}"` }
    if (r.rows.length > 1) {
      const names = r.rows.map(l => `• ${l.name}`).join('\n')
      return { success: false, message: `Multiple leads found:\n${names}\nPlease be more specific.` }
    }

    const lead = r.rows[0]
    const changes = []
    const setClauses = []
    const queryParams = []
    let paramIdx = 1

    if (updates.primary_phone) {
      const newPhone = canonicalizePhone(updates.primary_phone)
      if (newPhone) {
        setClauses.push(`phone_primary = $${paramIdx++}`)
        queryParams.push(newPhone)
        changes.push(`Phone: ${lead.phone_primary || '—'} ➔ ${newPhone}`)
      }
    }

    if (updates.name) {
      const newName = formatName(updates.name)
      if (newName) {
        setClauses.push(`name = $${paramIdx++}`)
        queryParams.push(newName)
        changes.push(`Name: ${lead.name} ➔ ${newName}`)
      }
    }

    if (updates.bride_name !== undefined) {
      const newBride = formatName(updates.bride_name)
      setClauses.push(`bride_name = $${paramIdx++}`)
      queryParams.push(newBride)
      changes.push(`Bride: ${lead.bride_name || '—'} ➔ ${newBride || '—'}`)
    }

    if (updates.groom_name !== undefined) {
      const newGroom = formatName(updates.groom_name)
      setClauses.push(`groom_name = $${paramIdx++}`)
      queryParams.push(newGroom)
      changes.push(`Groom: ${lead.groom_name || '—'} ➔ ${newGroom || '—'}`)
    }

    if (setClauses.length === 0) return { success: false, message: 'No valid updates to apply' }

    if (dryRun) {
      return { success: true, message: `**Ready to update details for ${lead.name}:**\n${changes.join('\n')}\n\nShould I go ahead?` }
    }

    setClauses.push(`updated_at = NOW()`)
    queryParams.push(lead.id)

    await pool.query(
      `UPDATE leads SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      queryParams
    )

    await logLeadActivity(
      lead.id,
      'lead_field_change',
      { log_type: 'activity', section: 'details', changes: changes.join(', '), source: 'ai_assistant' },
      auth?.sub || null
    )

    return { success: true, message: `✅ Updated ${lead.name}:\n${changes.join('\n')}` }
  }

  // ── Add event executor ──
  async function executeAddEvent(params, userId, isAdmin, auth, pool, dryRun = false) {
    const { search_name, event_type, event_date, city } = params || {}
    if (!search_name) return { success: false, message: 'Missing lead name' }
    if (!event_type) return { success: false, message: 'Event type is required (e.g. Sangeet, Engagement, Wedding)' }
    if (!event_date) return { success: false, message: 'Event date is required' }

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

    if (lead.status === 'Converted') {
      return { success: false, message: `Cannot add events to converted lead "${lead.name}".` }
    }

    if (dryRun) {
      let displayCity = city || 'TBD (Not specified)'
      return { success: true, message: `**Ready to add new event for ${lead.name}:**\n• Event: ${event_type}\n• Date: ${event_date}\n• City: ${displayCity}\n\nShould I go ahead?` }
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Resolve city to city_id if provided
      let cityId = null
      let cityName = null
      if (city && String(city).trim()) {
        cityName = String(city).trim()
        cityId = await getOrCreateCity({
          name: cityName,
          state: '',
          country: 'India',
        }, client)

        // Also ensure city is linked to the lead via lead_cities
        const existingLink = await client.query(
          `SELECT 1 FROM lead_cities WHERE lead_id = $1 AND city_id = $2 LIMIT 1`,
          [lead.id, cityId]
        )
        if (!existingLink.rows.length) {
          // Check if lead has any primary city
          const hasPrimary = await client.query(
            `SELECT 1 FROM lead_cities WHERE lead_id = $1 AND is_primary = true LIMIT 1`,
            [lead.id]
          )
          const isPrimary = hasPrimary.rows.length === 0 // First city becomes primary
          await client.query(
            `INSERT INTO lead_cities (lead_id, city_id, is_primary) VALUES ($1, $2, $3)`,
            [lead.id, cityId, isPrimary]
          )
        }
      } else {
        // Try to use existing primary city
        const primaryCityRes = await client.query(
          `SELECT city_id FROM lead_cities WHERE lead_id = $1 AND is_primary = true LIMIT 1`,
          [lead.id]
        )
        if (primaryCityRes.rows.length) {
          cityId = primaryCityRes.rows[0].city_id
          const cn = await client.query('SELECT name FROM cities WHERE id = $1', [cityId])
          cityName = cn.rows[0]?.name || null
        }
      }

      // Get next position
      const posRes = await client.query(
        `SELECT COALESCE(MAX(position), 0) + 1 AS p FROM lead_events WHERE lead_id = $1`,
        [lead.id]
      )

      // Normalize event date
      let normalizedDate = null
      if (event_date) {
        const d = new Date(event_date)
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear()
          const m = String(d.getMonth() + 1).padStart(2, '0')
          const day = String(d.getDate()).padStart(2, '0')
          normalizedDate = `${y}-${m}-${day}`
        } else if (/^\d{4}-\d{2}-\d{2}/.test(String(event_date))) {
          normalizedDate = String(event_date).slice(0, 10)
        }
      }

      if (!normalizedDate) {
        await client.query('ROLLBACK')
        return { success: false, message: 'Could not parse event date. Use format YYYY-MM-DD.' }
      }

      // Insert event
      const eventRes = await client.query(`
        INSERT INTO lead_events (lead_id, event_date, event_type, city_id, position, date_status)
        VALUES ($1, $2, $3, $4, $5, 'confirmed')
        RETURNING *
      `, [lead.id, normalizedDate, event_type, cityId, posRes.rows[0].p])

      await logLeadActivity(
        lead.id,
        'event_create',
        {
          log_type: 'activity',
          event_id: eventRes.rows[0]?.id || null,
          event_date: normalizedDate,
          event_name: event_type,
          city_name: cityName,
          source: 'ai_assistant',
        },
        auth?.sub || null,
        client
      )

      await client.query('COMMIT')

      const parts = [`${event_type} on ${normalizedDate}`]
      if (cityName) parts.push(`in ${cityName}`)
      return { success: true, message: `✅ Event added for ${lead.name}: ${parts.join(' ')}` }
    } catch (err) {
      await client.query('ROLLBACK')
      console.error('AI add event error:', err)
      return { success: false, message: 'Failed to add event. Please try again.' }
    } finally {
      client.release()
    }
  }

  // ── Log Note executor ──
  async function executeLogNote(params, userId, isAdmin, auth, pool, dryRun = false) {
    const { search_name, note } = params || {}
    if (!search_name || !note) return { success: false, message: 'Missing lead name or note' }

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
    if (dryRun) {
      return { success: true, message: `**Ready to log note for ${lead.name}:**\n"${note}"\n\nShould I go ahead?` }
    }

    await logLeadActivity(
      lead.id,
      'custom_note',
      { log_type: 'note', text: note, source: 'ai_assistant' },
      userId,
      pool
    )
    return { success: true, message: `✅ Note logged for ${lead.name}` }
  }
}
