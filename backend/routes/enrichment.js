module.exports = async function(api, opts) {
  const {
    formatName,
    normalizePhone,
    getAuthFromRequest,
    logLeadActivity,
    boolToYesNo,
    yesNoToBool,
    COVERAGE_SCOPES,
    pool,
  } = opts;

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


}
