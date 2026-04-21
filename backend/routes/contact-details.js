module.exports = async function(api, opts) {
  const {
    formatName,
    normalizePhone,
    normalizeLeadRow,
    getAuthFromRequest,
    logLeadActivity,
    normalizeInstagramUrl,
    validateEmail,
    isValidInstagramUsername,
    resolveUserDisplayName,
    pool,
  } = opts;

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


}
