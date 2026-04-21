module.exports = async function(api, opts) {
  const {
    ALLOWED_COMPOUND_TLDS, ALLOWED_EMAIL_TLDS, ALLOWED_ORIGINS, AUTH_COOKIE, AUTH_SECRET, COMMON_EMAIL_DOMAINS, COVERAGE_SCOPES, DEV_ORIGINS, EMAIL_TYPO_MAP, FOLLOWUP_TYPES, HEAT_VALUES, LEAD_STATUSES, PHOTO_UPLOAD_DIR, PROD_ORIGIN, PROTECTED_ADMIN_EMAIL, PUBLIC_API_PATHS, UPLOADS_DIR, VIDEO_UPLOAD_DIR, addDaysToYMD, addDaysYMD, apiRoutes, assignReferenceCode, boolToYesNo, canonicalizeEmail, canonicalizeInstagram, canonicalizePhone, classifyDeviceType, clearAuthCookie, createNotification, dateToYMD, detectBrowser, detectPlatform, ensureDirectory, fetchProfitProjectRows, formatName, formatRefDate, getAuthFromRequest, getAvailableFyLabels, getClientInfo, getCurrentFyLabel, getDateRange, getFirstName, getFyLabelFromDate, getFyRange, getImageContentType, getNextLeadNumber, getOrCreateCity, getRoundRobinSalesUserId, getUserDisplayName, hasAllEventTimes, hasAnyEvent, hasEventInPrimaryCity, hasEventsForAllCities, hasPrimaryCity, hashPassword, isProtectedAdminUser, isValidInstagramUsername, listFyLabelsBetween, logAdminAudit, logLeadActivity, normalizeDateValue, normalizeEmailInput, normalizeInstagramUrl, normalizeLeadRow, normalizeLeadRows, normalizeNickname, normalizePhone, normalizeYMD, parseCookies, parseDataUrl, parseFyLabel, recalculateAccountBalances, recomputeLeadMetrics, recomputeUserMetrics, recomputeUserMetricsRange, requireAdmin, requireAuth, requireVendor, resolveUserDisplayName, runMetricsJob, sanitizeTags, setAuthCookie, signToken, startOfDay, toISTDateString, validateEmail, verifyPassword, verifyToken, yesNoToBool, pool
  } = opts;

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
    let normalizedEventDate = normalizeEventDate(event_date)
    if (!normalizedEventDate) {
      if (validDateStatus === 'tba') {
        normalizedEventDate = '2099-01-01'
      } else {
        return reply.code(400).send({ error: 'Event date is required' })
      }
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
     
     let nextEventDate = event_date !== undefined ? event_date : e.event_date
     if (!nextEventDate && validDateStatus === 'tba') {
       nextEventDate = '2099-01-01'
     }
     
     const nextValues = {
      event_date: nextEventDate,
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


}
