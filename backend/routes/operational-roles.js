module.exports = async function(api, opts) {
  const {
    ALLOWED_COMPOUND_TLDS, ALLOWED_EMAIL_TLDS, ALLOWED_ORIGINS, AUTH_COOKIE, AUTH_SECRET, COMMON_EMAIL_DOMAINS, COVERAGE_SCOPES, DEV_ORIGINS, EMAIL_TYPO_MAP, FOLLOWUP_TYPES, HEAT_VALUES, LEAD_STATUSES, PHOTO_UPLOAD_DIR, PROD_ORIGIN, PROTECTED_ADMIN_EMAIL, PUBLIC_API_PATHS, UPLOADS_DIR, VIDEO_UPLOAD_DIR, addDaysToYMD, addDaysYMD, apiRoutes, assignReferenceCode, boolToYesNo, canonicalizeEmail, canonicalizeInstagram, canonicalizePhone, classifyDeviceType, clearAuthCookie, createNotification, dateToYMD, detectBrowser, detectPlatform, ensureDirectory, fetchProfitProjectRows, formatName, formatRefDate, getAuthFromRequest, getAvailableFyLabels, getClientInfo, getCurrentFyLabel, getDateRange, getFirstName, getFyLabelFromDate, getFyRange, getImageContentType, getNextLeadNumber, getOrCreateCity, getRoundRobinSalesUserId, getUserDisplayName, hasAllEventTimes, hasAnyEvent, hasEventInPrimaryCity, hasEventsForAllCities, hasPrimaryCity, hashPassword, isProtectedAdminUser, isValidInstagramUsername, listFyLabelsBetween, logAdminAudit, logLeadActivity, normalizeDateValue, normalizeEmailInput, normalizeInstagramUrl, normalizeLeadRow, normalizeLeadRows, normalizeNickname, normalizePhone, normalizeYMD, parseCookies, parseDataUrl, parseFyLabel, recalculateAccountBalances, recomputeLeadMetrics, recomputeUserMetrics, recomputeUserMetricsRange, requireAdmin, requireAuth, requireVendor, resolveUserDisplayName, runMetricsJob, sanitizeTags, setAuthCookie, signToken, startOfDay, toISTDateString, validateEmail, verifyPassword, verifyToken, yesNoToBool, pool
  } = opts;

  /* ===================== OPERATIONAL ROLES ===================== */
  const mapOperationalRole = (row) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    active: row.active,
    createdAt: row.createdAt,
  })

  api.get('/operational-roles', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const rows = await pool.query(
      `SELECT id, category, name, active, created_at AS "createdAt"
       FROM operational_roles
       ORDER BY active DESC, category, name`
    )
    return rows.rows.map(mapOperationalRole)
  })

  api.post('/operational-roles', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const category = String(req.body?.category || '').trim()
    const name = String(req.body?.name || '').trim()
    const active = req.body?.active !== undefined ? Boolean(req.body.active) : true
    if (!category) return reply.code(400).send({ error: 'Category is required' })
    if (!name) return reply.code(400).send({ error: 'Name is required' })
    const exists = await pool.query(
      `SELECT id FROM operational_roles WHERE LOWER(name) = LOWER($1)`,
      [name]
    )
    if (exists.rows.length) {
      return reply.code(400).send({ error: 'Role already exists' })
    }
    const r = await pool.query(
      `INSERT INTO operational_roles (category, name, active)
       VALUES ($1, $2, $3)
       RETURNING id, category, name, active, created_at AS "createdAt"`,
      [category, name, active]
    )
    const role = mapOperationalRole(r.rows[0])
    await pool.query(
      `INSERT INTO team_role_catalog (name, price, unit_type, active, created_at, operational_role_id)
       VALUES ($1, 0, 'PER_DAY', $2, NOW(), $3)
       ON CONFLICT DO NOTHING`,
      [role.name, role.active, role.id]
    )
    return role
  })

  api.patch('/operational-roles/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const fields = []
    const values = []
    if (req.body?.category !== undefined) {
      const category = String(req.body.category || '').trim()
      if (!category) return reply.code(400).send({ error: 'Category is required' })
      values.push(category)
      fields.push(`category=$${values.length}`)
    }
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim()
      if (!name) return reply.code(400).send({ error: 'Name is required' })
      values.push(name)
      fields.push(`name=$${values.length}`)
    }
    if (req.body?.active !== undefined) {
      values.push(Boolean(req.body.active))
      fields.push(`active=$${values.length}`)
    }
    if (!fields.length) return reply.code(400).send({ error: 'No fields to update' })
    values.push(Number(req.params.id))
    const r = await pool.query(
      `UPDATE operational_roles
       SET ${fields.join(', ')}
       WHERE id=$${values.length}
       RETURNING id, category, name, active, created_at AS "createdAt"`,
      values
    )
    if (!r.rows.length) return reply.code(404).send({ error: 'Role not found' })
    const updatedRole = mapOperationalRole(r.rows[0])
    const updates = []
    const params = []
    if (req.body?.name !== undefined) {
      params.push(updatedRole.name)
      updates.push(`name=$${params.length}`)
    }
    if (req.body?.active !== undefined) {
      params.push(updatedRole.active)
      updates.push(`active=$${params.length}`)
    }
    if (updates.length) {
      params.push(updatedRole.id)
      await pool.query(
        `UPDATE team_role_catalog
         SET ${updates.join(', ')}
         WHERE operational_role_id=$${params.length}`,
        params
      )
    }
    return updatedRole
  })


}
