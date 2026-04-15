const { GoogleGenerativeAI } = require('@google/generative-ai')
const quotationService = require('../modules/quotation/quotation.service')
const quotationRepo = require('../modules/quotation/quotation.repository')

const SYSTEM_PROMPT = `You are MistyAI, an intelligent CRM assistant for MistyVisuals — a premium wedding photography company in India. You help the sales team manage leads efficiently through natural conversation.

## YOUR CAPABILITIES
1. **Query leads** — search, filter, count, find upcoming events
2. **Create leads** — gather required info conversationally
3. **Update leads** — change phone number, name, bride/groom name, budget, heat, or other lead details
4. **Add events** — add event details (Sangeet, Engagement, Wedding, etc.) with dates and city
5. **Update status** — move leads through the pipeline
6. **Set follow-up** — schedule follow-up dates
7. **Answer CRM questions** — conversion rates, pipeline health, etc.
8. **Modify quotes** — change team members (photographers, cinematographers), quantities, deliverables, and pricing on quotes
9. **Read quotes** — view current quote details, pricing items, and team composition

When the user is viewing a quote page, the system will automatically inject the current quote state (events, team, deliverables, pricing) into the context. Use this to understand exactly what is currently configured.

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
    "intent": "create_lead" | "update_status" | "set_followup" | "update_lead" | "add_event" | "log_note" | "modify_quote",
    "params": { ... all required params ... }
  }
}

For create_lead params: { name, primary_phone, source, source_name?, bride_name?, groom_name?, client_budget_amount?, coverage_scope? }
For update_status params: { search_name, new_status }
For set_followup params: { search_name, date (YYYY-MM-DD) }
For update_lead params: { search_name, updates: { primary_phone?, name?, bride_name?, groom_name?, client_budget_amount?, heat? } }
For add_event params: { search_name, event_type, event_date (YYYY-MM-DD), city? }
For log_note params: { search_name, note (string, summarizing call/document/etc) }
For modify_quote params: { quote_version_id (number, from page context), changes: [{ action: "set_quantity" | "remove_item" | "add_item", event_name?: string, role_name?: string, deliverable_name?: string, quantity?: number }] }
  - "set_quantity": change quantity of a team role/deliverable for a specific event (e.g. change candid photographer from 2 to 1 for Haldi)
  - "remove_item": remove a team role/deliverable entirely from an event
  - "add_item": add a new team role/deliverable to an event with a quantity

### 2b. Multi-Action — when an audio file or document contains MULTIPLE actionable items (e.g. add 3 events + log a note + update budget)
{
  "type": "multi_action",
  "message": "Summary of all proposed changes",
  "actions": [
    { "intent": "add_event", "params": { ... } },
    { "intent": "log_note", "params": { ... } },
    { "intent": "update_lead", "params": { ... } }
  ]
}
Use multi_action ONLY when there are 2+ distinct operations to perform (e.g. from parsing a call recording). For a single operation, always use the standard "action" type.

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

## AUDIO / IMAGE / DOCUMENT ANALYSIS (Call Intelligence)
When an audio file, image (WhatsApp screenshot, handwritten diary notes), or document is uploaded:

### Step 1: Classify the Conversation
- **New Lead:** If the caller is introducing themselves for the first time, asking about services/availability, or has never been discussed before → prepare a "create_lead" action with all details you can extract (name, phone, source, events, budget).
- **Follow-Up Call:** If the conversation references a previous discussion, existing quote, or known client → use the current page context or names mentioned to identify the existing lead. Use "update_lead", "add_event", or "log_note" linked to that lead.

### Step 2: Extract ALL Details from BOTH Sides
Listen to the ENTIRE conversation exhaustively. Extract:
- **Client name(s)** — bride, groom, family members mentioned
- **Phone number** — if mentioned in the audio
- **Event details** — for EACH event mentioned (Wedding, Sangeet, Mehendi, Haldi, Engagement, Reception, etc.), extract: event type, date, city/venue, time of day, indoor/outdoor, guest count
- **Budget** — client's stated budget, our quoted price, any negotiation or gap between the two
- **Coverage preferences** — photos only, videos only, or both; candid vs traditional; specific styles mentioned
- **Specific requests** — drone shots, pre-wedding shoot locations, album preferences, same-day edits, reels
- **Referral/source** — how did the client find us (Instagram, reference from someone, website, JustDial)

### Step 3: Analyze Voice Tone & Client Intent
Pay close attention to the emotional arc of the conversation:
- **Opening mood** — excited, cautious, just browsing?
- **Reaction to pricing** — did the tone change after hearing our rates? Did they go quiet, push back, or say "that's fine"?
- **Interest level** — Highly Interested / Interested but Negotiating / Just Exploring / Cold / Price-Shocked
- **Objections raised** — "too expensive", "will think about it", "checking other vendors"
- **Positive signals** — "sounds great", "when can we meet", "can you block the date"

### Step 4: Build the Response
Use "multi_action" when there are multiple operations. Always include a comprehensive "log_note" AND any database actions:
- For each event discussed → generate an "add_event" action
- For budget/name/details → generate an "update_lead" action
- ALWAYS generate a "log_note" containing a rich, detailed summary in this structure:
  📞 **Call Type:** New Inquiry / Follow-Up
  🎯 **Client Intent:** (Highly Interested / Exploring / Price-Sensitive / Cold)
  👤 **Client:** (names, relationship)
  📅 **Events Discussed:**
    - Event 1: [Type] — [Date], [City/Venue], [Details]
    - Event 2: [Type] — [Date], [City/Venue], [Details]
  💰 **Budget:** Client's budget vs Our quote, negotiation notes
  ❤️ **Preferences:** What they like (candid, minimal, warm tones, etc.)
  ⛔ **Dislikes:** What they don't want
  🗣️ **Tone Analysis:** (e.g. "Client was enthusiastic initially but tone shifted after hearing 2.6L price. Asked for cheaper packages. Seemed open to negotiation.")
  📋 **Action Items:** (Send revised quote, follow up on Thursday, block date, etc.)

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
        const isRetryable = String(status) === '503' || msg.includes('503') || msg.includes('Model is overloaded')
          || String(status) === '429' || msg.includes('429') || msg.includes('rate limit') || msg.includes('RESOURCE_EXHAUSTED')
        if (isRetryable && attempt < maxRetries) {
          // Wait gracefully — longer for 429 (rate limit) than 503 (overloaded)
          const isRateLimit = String(status) === '429' || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')
          const delay = isRateLimit ? 5000 * (attempt + 1) : 2000 * (attempt + 1)
          console.log(`AI retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms (${isRateLimit ? '429 rate limit' : '503 overloaded'})`)
          await new Promise(resolve => setTimeout(resolve, delay))
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
        let contextBlock = `[User Screen Context: Viewing ${pageContext.title || 'page'} at URL: ${pageContext.url}]`

        // Auto-inject quote state when user is on a quote page
        const quoteMatch = String(pageContext.url).match(/\/quotes\/(\d+)/)
        if (quoteMatch) {
          try {
            const qvId = Number(quoteMatch[1])
            const version = await quotationService.getQuoteVersion(qvId)
            if (version && version.draftDataJson) {
              const draft = version.draftDataJson
              const items = draft.pricingItems || []
              const events = draft.events || []
              const tiers = draft.tiers || []

              // Build human-readable quote state
              const eventSummary = events.map(e => `  - ${e.name || e.eventType || 'Event'} (${e.date || 'no date'})`).join('\n')

              // Group pricing items by event
              const itemsByEvent = {}
              for (const item of items) {
                const evName = item.eventName || item.eventLabel || 'General'
                if (!itemsByEvent[evName]) itemsByEvent[evName] = []
                itemsByEvent[evName].push(`${item.label || item.itemType} x${item.quantity || 1} @ ₹${item.unitPrice || 0}`)
              }
              const itemSummary = Object.entries(itemsByEvent).map(([ev, roles]) => `  ${ev}:\n    ${roles.join('\n    ')}`).join('\n')

              const tierSummary = tiers.map(t => `  ${t.name}: ₹${t.price}${t.overridePrice ? ` (override: ₹${t.overridePrice})` : ''}${t.discountedPrice ? ` (discounted: ₹${t.discountedPrice})` : ''}`).join('\n')

              contextBlock += `\n\n[CURRENT QUOTE STATE — Quote Version #${qvId}, Status: ${version.status}]\nEvents:\n${eventSummary || '  (none)'}\n\nTeam & Deliverables by Event:\n${itemSummary || '  (none)'}\n\nPricing Tiers:\n${tierSummary || '  (none)'}\n\nCalculated Price: ₹${version.calculatedPrice || 0}\nSales Override: ${version.salesOverridePrice ? '₹' + version.salesOverridePrice : 'None'}`
            }
          } catch (qErr) {
            console.warn('AI: Could not inject quote context:', qErr?.message)
          }
        }

        promptText = `${contextBlock}\n\n${promptText}`
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
        // AI might have output conversational text before/after JSON — extract the JSON block
        try {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0])
          } else {
            parsed = { type: 'answer', message: responseText }
          }
        } catch {
          parsed = { type: 'answer', message: responseText }
        }
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

        // Generic dry-run for all other single actions
        const dryResult = await dryRunAction(parsed.action, userId, isAdmin, auth, pool)

        // AUTO-RESOLVE: If multiple leads found, feed context back to AI to pick the right one
        if (!dryResult.success && dryResult.message && dryResult.message.includes('Multiple leads found')) {
          const retryPrompt = [{ text: `The system found multiple matching leads when trying to execute your action. Here is the disambiguation context:\n\n${dryResult.message}\n\nBased on everything you know from the conversation and the uploaded file, pick the EXACT correct lead full name and re-issue your original JSON action with the corrected "search_name". If you truly cannot determine which lead, respond with type "need_info" asking the user.` }]
          
          // Add the file again if it was part of this request
          if (file && file.data && file.mimeType) {
            let actualMime = file.mimeType
            if (actualMime.includes('mpeg')) actualMime = 'audio/mp3'
            else if (actualMime.includes('m4a') || actualMime.includes('mp4')) actualMime = 'audio/aac'
            const base64Data = file.data.includes('base64,') ? file.data.split('base64,')[1] : file.data
            retryPrompt.push({ inlineData: { data: base64Data, mimeType: actualMime } })
          }

          try {
            const retryText = await callGeminiWithRetry(chatModel, sanitizedHistory, retryPrompt, 1)
            const retryCleaned = retryText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
            const retryParsed = JSON.parse(retryCleaned)

            if (retryParsed.type === 'action' && retryParsed.action) {
              const retryDry = await dryRunAction(retryParsed.action, userId, isAdmin, auth, pool)
              if (retryDry.success) {
                return {
                  type: 'confirm_action',
                  message: retryDry.message,
                  action: retryParsed.action,
                  rawResponse: JSON.stringify(retryParsed),
                }
              }
            }
            // If retry also couldn't resolve, fall through to show disambiguation to user
          } catch (retryErr) {
            console.warn('AI auto-resolve retry failed:', retryErr?.message)
          }
        }

        if (!dryResult.success) return { type: 'answer', message: dryResult.message }
        return {
          type: 'confirm_action',
          message: dryResult.message,
          action: parsed.action,
          rawResponse: JSON.stringify(parsed),
        }
      }

      // Handle multi_action (batched operations from audio/document analysis)
      if (parsed.type === 'multi_action' && Array.isArray(parsed.actions) && parsed.actions.length > 0) {
        const summaryParts = []
        const validActions = []
        let hasAmbiguity = false
        for (const act of parsed.actions) {
          let result = { success: false, message: 'Unknown intent' }
          try {
            if (act.intent === 'create_lead') { result = { success: true, message: `Create lead: ${act.params?.name}` }; }
            else { result = await dryRunAction(act, userId, isAdmin, auth, pool) }
          } catch (e) {
            result = { success: false, message: e?.message || 'Error' }
          }
          if (result.success) {
            summaryParts.push(result.message)
            validActions.push(act)
          } else {
            summaryParts.push(`⚠️ ${act.intent}: ${result.message}`)
            if (result.message && result.message.includes('Multiple leads found')) hasAmbiguity = true
          }
        }

        // AUTO-RESOLVE for multi_action: if any action had ambiguity, let AI retry
        if (hasAmbiguity) {
          const retryPrompt = [{ text: `Some of your actions matched multiple leads. Here is the disambiguation context:\n\n${summaryParts.join('\n\n')}\n\nBased on everything you know from the conversation and the uploaded file, pick the EXACT correct lead full name for each action and re-issue your complete multi_action JSON with corrected "search_name" values. If you truly cannot determine, respond with type "need_info".` }]

          try {
            const retryText = await callGeminiWithRetry(chatModel, sanitizedHistory, retryPrompt, 1)
            const retryCleaned = retryText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
            const retryParsed = JSON.parse(retryCleaned)

            if (retryParsed.type === 'multi_action' && Array.isArray(retryParsed.actions)) {
              // Re-run dry-runs with corrected names
              const retrySummary = []
              const retryValid = []
              for (const act of retryParsed.actions) {
                let r = act.intent === 'create_lead'
                  ? { success: true, message: `Create lead: ${act.params?.name}` }
                  : await dryRunAction(act, userId, isAdmin, auth, pool)
                if (r.success) { retrySummary.push(r.message); retryValid.push(act) }
                else { retrySummary.push(`⚠️ ${act.intent}: ${r.message}`) }
              }
              if (retryValid.length > 0) {
                return {
                  type: 'confirm_action',
                  message: `**${retryValid.length} action(s) extracted:**\n\n${retrySummary.join('\n\n')}\n\nShould I go ahead with all of these?`,
                  action: { intent: 'multi_action', actions: retryValid },
                  rawResponse: JSON.stringify(retryParsed),
                }
              }
            }
          } catch (retryErr) {
            console.warn('AI multi_action auto-resolve failed:', retryErr?.message)
          }
        }

        return {
          type: 'confirm_action',
          message: `**${validActions.length} action(s) extracted:**\n\n${summaryParts.join('\n\n')}\n\nShould I go ahead with all of these?`,
          action: { intent: 'multi_action', actions: validActions },
          rawResponse: JSON.stringify(parsed),
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
      // Handle multi_action batch execution
      if (action.intent === 'multi_action' && Array.isArray(action.actions)) {
        const results = []
        for (const act of action.actions) {
          let result = { success: false, message: 'Unknown intent' }
          try {
            if (act.intent === 'create_lead') result = await executeCreateLead(act.params, userId, isAdmin, auth, pool)
            else if (act.intent === 'update_status') result = await executeStatusUpdate(act.params, userId, isAdmin, pool)
            else if (act.intent === 'set_followup') result = await executeSetFollowup(act.params, userId, isAdmin, pool)
            else if (act.intent === 'update_lead') result = await executeUpdateLead(act.params, userId, isAdmin, auth, pool)
            else if (act.intent === 'add_event') result = await executeAddEvent(act.params, userId, isAdmin, auth, pool)
            else if (act.intent === 'log_note') result = await executeLogNote(act.params, userId, isAdmin, auth, pool)
            else if (act.intent === 'modify_quote') result = await executeModifyQuote(act.params)
          } catch (e) {
            result = { success: false, message: e?.message || 'Error' }
          }
          results.push(result)
        }
        const successCount = results.filter(r => r.success).length
        const messages = results.map(r => r.message).join('\n')
        return { success: successCount > 0, message: `✅ ${successCount}/${results.length} actions completed:\n${messages}` }
      }

      if (action.intent === 'create_lead') return await executeCreateLead(action.params, userId, isAdmin, auth, pool)
      if (action.intent === 'update_status') return await executeStatusUpdate(action.params, userId, isAdmin, pool)
      if (action.intent === 'set_followup') return await executeSetFollowup(action.params, userId, isAdmin, pool)
      if (action.intent === 'update_lead') return await executeUpdateLead(action.params, userId, isAdmin, auth, pool)
      if (action.intent === 'add_event') return await executeAddEvent(action.params, userId, isAdmin, auth, pool)
      if (action.intent === 'log_note') return await executeLogNote(action.params, userId, isAdmin, auth, pool)
      if (action.intent === 'modify_quote') return await executeModifyQuote(action.params)
      return reply.code(400).send({ error: 'Unknown action' })
    } catch (err) {
      console.error('AI execute error:', err)
      return reply.code(500).send({ error: 'Failed to execute action' })
    }
  })

  // ── Helper: dry-run any single action ──
  async function dryRunAction(action, userId, isAdmin, auth, pool) {
    if (action.intent === 'update_status') return await executeStatusUpdate(action.params, userId, isAdmin, pool, true)
    if (action.intent === 'set_followup') return await executeSetFollowup(action.params, userId, isAdmin, pool, true)
    if (action.intent === 'update_lead') return await executeUpdateLead(action.params, userId, isAdmin, auth, pool, true)
    if (action.intent === 'add_event') return await executeAddEvent(action.params, userId, isAdmin, auth, pool, true)
    if (action.intent === 'log_note') return await executeLogNote(action.params, userId, isAdmin, auth, pool, true)
    if (action.intent === 'modify_quote') return await executeModifyQuote(action.params, true)
    return { success: false, message: `Unknown intent: ${action.intent}` }
  }

  // ── Helper: Enrich multiple leads with event context for smart disambiguation ──
  async function enrichLeadContext(leads, pool) {
    const ids = leads.map(l => l.id)
    const eventsR = await pool.query(`
      SELECT le.lead_id, le.event_type, le.event_date,
             c.name as city_name
      FROM lead_events le
      LEFT JOIN cities c ON c.id = le.city_id
      WHERE le.lead_id = ANY($1)
      ORDER BY le.event_date ASC
    `, [ids])

    const evMap = {}
    for (const ev of eventsR.rows) {
      if (!evMap[ev.lead_id]) evMap[ev.lead_id] = []
      const parts = [ev.event_type]
      if (ev.event_date) parts.push(String(ev.event_date).slice(0, 10))
      if (ev.city_name) parts.push(ev.city_name)
      evMap[ev.lead_id].push(parts.join(', '))
    }

    return leads.map(l => {
      const events = evMap[l.id]
      const eventStr = events ? ` — Events: ${events.join(' | ')}` : ''
      const extra = []
      if (l.bride_name) extra.push(`Bride: ${l.bride_name}`)
      if (l.groom_name) extra.push(`Groom: ${l.groom_name}`)
      if (l.status) extra.push(l.status)
      const extraStr = extra.length ? ` (${extra.join(', ')})` : ''
      return `• ${l.name}${extraStr}${eventStr}`
    }).join('\n')
  }

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
    const searchParams = isAdmin ? [search_name, `%${search_name}%`] : [search_name, `%${search_name}%`, userId]
    const uf = isAdmin ? '' : `AND assigned_user_id = $3`

    const r = await pool.query(`
      SELECT id, name, status, bride_name, groom_name FROM leads
      WHERE (name ~* ('\m' || $1 || '\M') OR bride_name ~* ('\m' || $1 || '\M') OR groom_name ~* ('\m' || $1 || '\M') OR primary_phone ILIKE $2 OR lead_number::text ILIKE $2 OR id::text = $1) ${uf}
      ORDER BY created_at DESC LIMIT 5
    `, searchParams)

    if (!r.rows.length) return { success: false, message: `No lead found matching "${search_name}"` }
    if (r.rows.length > 1) {
      const names = await enrichLeadContext(r.rows, pool)
      return { success: false, message: `Multiple leads found:\n${names}\nPlease pick the correct one based on the details above.` }
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
    const searchParams = isAdmin ? [search_name, `%${search_name}%`] : [search_name, `%${search_name}%`, userId]
    const uf = isAdmin ? '' : `AND assigned_user_id = $3`

    const r = await pool.query(`
      SELECT id, name, bride_name, groom_name FROM leads
      WHERE (name ~* ('\m' || $1 || '\M') OR bride_name ~* ('\m' || $1 || '\M') OR groom_name ~* ('\m' || $1 || '\M') OR primary_phone ILIKE $2 OR lead_number::text ILIKE $2 OR id::text = $1) ${uf}
      ORDER BY created_at DESC LIMIT 5
    `, searchParams)

    if (!r.rows.length) return { success: false, message: `No lead found matching "${search_name}"` }
    if (r.rows.length > 1) {
      const names = await enrichLeadContext(r.rows, pool)
      return { success: false, message: `Multiple leads found:\n${names}\nPlease pick the correct one based on the details above.` }
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
    const searchParams = isAdmin ? [search_name, `%${search_name}%`] : [search_name, `%${search_name}%`, userId]
    const uf = isAdmin ? '' : `AND assigned_user_id = $3`

    const r = await pool.query(`
      SELECT id, name, phone_primary, bride_name, groom_name FROM leads
      WHERE (name ~* ('\m' || $1 || '\M') OR bride_name ~* ('\m' || $1 || '\M') OR groom_name ~* ('\m' || $1 || '\M') OR primary_phone ILIKE $2 OR lead_number::text ILIKE $2 OR id::text = $1) ${uf}
      ORDER BY created_at DESC LIMIT 5
    `, searchParams)

    if (!r.rows.length) return { success: false, message: `No lead found matching "${search_name}"` }
    if (r.rows.length > 1) {
      const names = await enrichLeadContext(r.rows, pool)
      return { success: false, message: `Multiple leads found:\n${names}\nPlease pick the correct one based on the details above.` }
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

    if (updates.client_budget_amount !== undefined) {
      const budget = Number(updates.client_budget_amount)
      if (!isNaN(budget)) {
        setClauses.push(`client_budget_amount = $${paramIdx++}`)
        queryParams.push(budget)
        changes.push(`Budget: ₹${budget.toLocaleString('en-IN')}`)
      }
    }

    if (updates.heat) {
      const validHeats = ['Hot', 'Warm', 'Cold']
      const h = validHeats.find(v => v.toLowerCase() === String(updates.heat).toLowerCase())
      if (h) {
        setClauses.push(`heat = $${paramIdx++}`)
        queryParams.push(h)
        changes.push(`Heat: ➔ ${h}`)
      }
    }

    if (updates.email) {
      setClauses.push(`email = $${paramIdx++}`)
      queryParams.push(String(updates.email).trim())
      changes.push(`Email: ➔ ${updates.email}`)
    }

    if (updates.coverage_scope) {
      const valid = ['photos_only', 'videos_only', 'photos_and_videos']
      if (valid.includes(updates.coverage_scope)) {
        setClauses.push(`coverage_scope = $${paramIdx++}`)
        queryParams.push(updates.coverage_scope)
        changes.push(`Coverage: ➔ ${updates.coverage_scope}`)
      }
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
    const searchParams = isAdmin ? [search_name, `%${search_name}%`] : [search_name, `%${search_name}%`, userId]
    const uf = isAdmin ? '' : `AND assigned_user_id = $3`

    const r = await pool.query(`
      SELECT id, name, status, bride_name, groom_name FROM leads
      WHERE (name ~* ('\m' || $1 || '\M') OR bride_name ~* ('\m' || $1 || '\M') OR groom_name ~* ('\m' || $1 || '\M') OR primary_phone ILIKE $2 OR lead_number::text ILIKE $2 OR id::text = $1) ${uf}
      ORDER BY created_at DESC LIMIT 5
    `, searchParams)

    if (!r.rows.length) return { success: false, message: `No lead found matching "${search_name}"` }
    if (r.rows.length > 1) {
      const names = await enrichLeadContext(r.rows, pool)
      return { success: false, message: `Multiple leads found:\n${names}\nPlease pick the correct one based on the details above.` }
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
    const searchParams = isAdmin ? [search_name, `%${search_name}%`] : [search_name, `%${search_name}%`, userId]
    const uf = isAdmin ? '' : `AND assigned_user_id = $3`

    const r = await pool.query(`
      SELECT id, name, bride_name, groom_name FROM leads
      WHERE (name ~* ('\m' || $1 || '\M') OR bride_name ~* ('\m' || $1 || '\M') OR groom_name ~* ('\m' || $1 || '\M') OR primary_phone ILIKE $2 OR lead_number::text ILIKE $2 OR id::text = $1) ${uf}
      ORDER BY created_at DESC LIMIT 5
    `, searchParams)

    if (!r.rows.length) return { success: false, message: `No lead found matching "${search_name}"\n\n*(I have your note ready: "${note}" - just tell me which lead to attach it to!)*` }
    if (r.rows.length > 1) {
      const names = await enrichLeadContext(r.rows, pool)
      return { success: false, message: `Multiple leads found:\n${names}\nPlease pick the correct one based on the details above.\n\n*(I have your note ready: "${note}" - just tell me which lead!)*` }
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

  // ── Modify Quote executor ──
  async function executeModifyQuote(params, dryRun = false) {
    const { quote_version_id, changes } = params || {}
    if (!quote_version_id) return { success: false, message: 'Missing quote_version_id. Make sure you are viewing a quote page.' }
    if (!Array.isArray(changes) || !changes.length) return { success: false, message: 'No changes specified.' }

    try {
      const version = await quotationService.getQuoteVersion(Number(quote_version_id))
      if (!version) return { success: false, message: `Quote version #${quote_version_id} not found.` }
      if (!version.draftDataJson) return { success: false, message: 'This quote has no draft data to modify.' }

      const draft = JSON.parse(JSON.stringify(version.draftDataJson)) // deep clone
      const items = draft.pricingItems || []
      const changeSummary = []

      for (const change of changes) {
        const action = change.action
        const eventName = (change.event_name || '').trim().toLowerCase()
        const roleName = (change.role_name || change.deliverable_name || '').trim().toLowerCase()

        if (action === 'set_quantity') {
          const qty = Number(change.quantity)
          if (!qty || qty < 0) { changeSummary.push(`⚠️ Invalid quantity: ${change.quantity}`); continue }

          // Find matching item
          const idx = items.findIndex(item => {
            const itemEvent = (item.eventName || item.eventLabel || '').toLowerCase()
            const itemLabel = (item.label || '').toLowerCase()
            return (!eventName || itemEvent.includes(eventName)) && itemLabel.includes(roleName)
          })

          if (idx === -1) {
            changeSummary.push(`⚠️ Could not find "${change.role_name || change.deliverable_name}" in ${change.event_name || 'any event'}`)
            continue
          }

          const oldQty = items[idx].quantity || 1
          items[idx].quantity = qty
          changeSummary.push(`${items[idx].label} (${items[idx].eventName || items[idx].eventLabel || 'General'}): ${oldQty} → ${qty}`)
        }

        else if (action === 'remove_item') {
          const idx = items.findIndex(item => {
            const itemEvent = (item.eventName || item.eventLabel || '').toLowerCase()
            const itemLabel = (item.label || '').toLowerCase()
            return (!eventName || itemEvent.includes(eventName)) && itemLabel.includes(roleName)
          })

          if (idx === -1) {
            changeSummary.push(`⚠️ Could not find "${change.role_name || change.deliverable_name}" to remove`)
            continue
          }

          const removed = items.splice(idx, 1)[0]
          changeSummary.push(`🗑️ Removed ${removed.label} from ${removed.eventName || removed.eventLabel || 'General'}`)
        }

        else if (action === 'add_item') {
          const qty = Number(change.quantity) || 1
          const nameToFind = roleName

          // Try to find in team role catalog first, then deliverables
          let catalog = await quotationRepo.findTeamRoleByName(nameToFind)
          let itemType = 'TEAM_ROLE'
          if (!catalog) {
            catalog = await quotationRepo.findDeliverableByName(nameToFind)
            itemType = 'DELIVERABLE'
          }
          if (!catalog) {
            changeSummary.push(`⚠️ Could not find "${change.role_name || change.deliverable_name}" in the catalog`)
            continue
          }

          // Find the event to attach to
          const events = draft.events || []
          let targetEvent = events.find(e => (e.name || e.eventType || '').toLowerCase().includes(eventName))
          const evLabel = targetEvent ? (targetEvent.name || targetEvent.eventType) : (change.event_name || 'General')

          items.push({
            itemType,
            catalogId: catalog.id,
            label: catalog.name,
            quantity: qty,
            unitPrice: Number(catalog.price) || 0,
            eventId: targetEvent?.id || null,
            eventName: evLabel,
            eventLabel: evLabel,
          })
          changeSummary.push(`➕ Added ${catalog.name} x${qty} to ${evLabel} @ ₹${catalog.price}`)
        }
      }

      if (!changeSummary.length) return { success: false, message: 'No valid changes could be applied.' }

      draft.pricingItems = items

      if (dryRun) {
        return {
          success: true,
          message: `**Ready to modify Quote #${quote_version_id}:**\n${changeSummary.join('\n')}\n\nShould I go ahead?`
        }
      }

      // Actually save the draft
      await quotationService.updateDraft(Number(quote_version_id), draft)
      // Recalculate pricing
      try {
        await quotationService.calculatePricing(Number(quote_version_id))
      } catch (calcErr) {
        console.warn('AI: Price recalculation warning:', calcErr?.message)
      }

      return {
        success: true,
        message: `✅ Quote #${quote_version_id} updated:\n${changeSummary.join('\n')}\n\n💡 Pricing has been recalculated. Refresh the page to see changes.`
      }
    } catch (err) {
      console.error('AI modify quote error:', err)
      return { success: false, message: `Failed to modify quote: ${err?.message || 'Unknown error'}` }
    }
  }
}
