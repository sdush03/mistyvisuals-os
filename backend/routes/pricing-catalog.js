module.exports = async function(api, opts) {
  const {
    requireAdmin,
    requireAuth,
    pool,
  } = opts;

  /* ===================== PRICING CATALOG ===================== */
  const UNIT_TYPES = new Set(['PER_DAY', 'PER_UNIT', 'FLAT', 'PER_EVENT'])
  const mapCatalogRow = (row) => ({
    id: row.id,
    name: row.name,
    price: Number(row.price),
    unitType: row.unitType,
    active: row.active,
    createdAt: row.createdAt,
    category: row.category,
    description: row.description,
    deliveryTimeline: row.delivery_timeline,
    deliveryPhase: row.delivery_phase,
  })

  const mapTeamRoleRow = (row) => ({
    id: row.id,
    name: row.name,
    price: Number(row.price),
    unitType: row.unitType,
    active: row.active,
    createdAt: row.createdAt,
    operationalRoleId: row.operationalRoleId,
    category: row.category,
  })

  const listCatalog = async (table) => {
    const hasCategory = table === 'deliverable_catalog'
    const query = hasCategory 
      ? `SELECT id, name, price, unit_type AS "unitType", active, created_at AS "createdAt", category, description, delivery_timeline, delivery_phase
         FROM ${table}
         ORDER BY active DESC, category, name`
      : `SELECT id, name, price, unit_type AS "unitType", active, created_at AS "createdAt"
         FROM ${table}
         ORDER BY active DESC, name`
    
    return (await pool.query(query)).rows.map(mapCatalogRow)
  }

  const listTeamRoleCatalog = async () =>
    (await pool.query(
      `SELECT tr.id,
              COALESCE(orole.name, tr.name) AS name,
              tr.price,
              tr.unit_type AS "unitType",
              tr.active,
              tr.created_at AS "createdAt",
              tr.operational_role_id AS "operationalRoleId",
              orole.category AS category
       FROM team_role_catalog tr
       LEFT JOIN operational_roles orole ON orole.id = tr.operational_role_id
       ORDER BY tr.active DESC, COALESCE(orole.name, tr.name)`
    )).rows.map(mapTeamRoleRow)

  const createCatalogItem = async (table, payload) => {
    const name = String(payload?.name || '').trim()
    const price = Number(payload?.price)
    const unitType = String(payload?.unitType || '').trim()
    const active = payload?.active !== undefined ? Boolean(payload.active) : true
    const isDeliverable = table === 'deliverable_catalog'
    const category = payload?.category && ['PHOTO', 'VIDEO', 'OTHER', 'ADDON'].includes(payload.category) ? payload.category : 'OTHER'
    const description = payload?.description || null
    const deliveryTimeline = payload?.deliveryTimeline || null
    const deliveryPhase = payload?.deliveryPhase && ['PRE_WEDDING', 'WEDDING'].includes(payload.deliveryPhase) ? payload.deliveryPhase : 'WEDDING'

    if (!name) throw new Error('Name is required')
    if (!Number.isFinite(price) || price <= 0) throw new Error('Price must be greater than 0')
    if (!UNIT_TYPES.has(unitType)) throw new Error('Invalid unit type')

    let r;
    if (isDeliverable) {
      r = await pool.query(
        `INSERT INTO ${table} (name, price, unit_type, active, category, description, delivery_timeline, delivery_phase)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, price, unit_type AS "unitType", active, created_at AS "createdAt", category, description, delivery_timeline, delivery_phase`,
        [name, price, unitType, active, category, description, deliveryTimeline, deliveryPhase]
      )
    } else {
      r = await pool.query(
        `INSERT INTO ${table} (name, price, unit_type, active)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, price, unit_type AS "unitType", active, created_at AS "createdAt"`,
        [name, price, unitType, active]
      )
    }
    return mapCatalogRow(r.rows[0])
  }

  const updateCatalogItem = async (table, id, payload) => {
    const fields = []
    const values = []
    const isDeliverable = table === 'deliverable_catalog'

    if (payload?.name !== undefined) {
      const name = String(payload.name || '').trim()
      if (!name) throw new Error('Name is required')
      values.push(name)
      fields.push(`name=$${values.length}`)
    }
    if (payload?.price !== undefined) {
      const price = Number(payload.price)
      if (!Number.isFinite(price) || price <= 0) throw new Error('Price must be greater than 0')
      values.push(price)
      fields.push(`price=$${values.length}`)
    }
    if (payload?.unitType !== undefined) {
      const unitType = String(payload.unitType || '').trim()
      if (!UNIT_TYPES.has(unitType)) throw new Error('Invalid unit type')
      values.push(unitType)
      fields.push(`unit_type=$${values.length}`)
    }
    if (payload?.active !== undefined) {
      values.push(Boolean(payload.active))
      fields.push(`active=$${values.length}`)
    }
    if (isDeliverable && payload?.category !== undefined) {
      const cat = ['PHOTO', 'VIDEO', 'OTHER', 'ADDON'].includes(payload.category) ? payload.category : 'OTHER'
      values.push(cat)
      fields.push(`category=$${values.length}`)
    }
    if (isDeliverable && payload?.description !== undefined) {
      values.push(payload.description || null)
      fields.push(`description=$${values.length}`)
    }
    if (isDeliverable && payload?.deliveryTimeline !== undefined) {
      values.push(payload.deliveryTimeline || null)
      fields.push(`delivery_timeline=$${values.length}`)
    }
    if (isDeliverable && payload?.deliveryPhase !== undefined) {
      const p = ['PRE_WEDDING', 'WEDDING'].includes(payload.deliveryPhase) ? payload.deliveryPhase : 'WEDDING'
      values.push(p)
      fields.push(`delivery_phase=$${values.length}`)
    }
    if (!fields.length) throw new Error('No fields to update')
    values.push(Number(id))

    const returningStr = isDeliverable 
      ? 'id, name, price, unit_type AS "unitType", active, created_at AS "createdAt", category, description, delivery_timeline, delivery_phase'
      : 'id, name, price, unit_type AS "unitType", active, created_at AS "createdAt"'

    const r = await pool.query(
      `UPDATE ${table}
       SET ${fields.join(', ')}
       WHERE id=$${values.length}
       RETURNING ${returningStr}`,
      values
    )
    if (!r.rows.length) return null
    return mapCatalogRow(r.rows[0])
  }

  const smartDeleteCatalogItem = async (table, id, itemType) => {
    const numId = Number(id)
    // Check if this item is referenced in any quote
    const ref = await pool.query(
      `SELECT 1 FROM quote_pricing_items WHERE catalog_id = $1 AND item_type = $2 LIMIT 1`,
      [numId, itemType]
    )
    if (ref.rows.length > 0) {
      // Referenced — soft archive
      const r = await pool.query(`UPDATE ${table} SET active = false WHERE id = $1 RETURNING *`, [numId])
      if (!r.rows.length) return null
      return { action: 'archived', item: mapCatalogRow(r.rows[0]) }
    }
    // Not referenced — permanent delete
    const r = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [numId])
    if (!r.rows.length) return null
    return { action: 'deleted', item: { id: numId } }
  }

  
  api.get('/pricing-rules', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { rows } = await pool.query('SELECT * FROM pricing_rules ORDER BY priority DESC')
    return rows.map(r => ({
      id: r.id,
      ruleName: r.rule_name,
      conditionsJson: r.conditions_json,
      defaultTeamJson: r.default_team_json,
      defaultDeliverablesJson: r.default_deliverables_json,
      priority: r.priority,
      active: r.active,
      createdAt: r.created_at
    }))
  })

  api.post('/pricing-rules', async (req, reply) => {
    try {
      const auth = await requireAdmin(req, reply)
      if (!auth) return
      const payload = req.body || {}
      const { rows } = await pool.query(
        `INSERT INTO pricing_rules (rule_name, conditions_json, default_team_json, default_deliverables_json, priority, active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          payload.ruleName || 'New Rule',
          JSON.stringify(payload.conditionsJson || {}),
          JSON.stringify(payload.defaultTeamJson || []),
          JSON.stringify(payload.defaultDeliverablesJson || []),
          payload.priority || 0,
          payload.active !== false
        ]
      )
      return rows[0]
    } catch (err) {
      reply.code(400).send({ error: err.message })
    }
  })

  api.patch('/pricing-rules/:id', async (req, reply) => {
    try {
      const auth = await requireAdmin(req, reply)
      if (!auth) return
      const payload = req.body || {}
      let setClauses = []
      let args = []
      let i = 1
      
      if (payload.ruleName !== undefined) { setClauses.push(`rule_name=$${i++}`); args.push(payload.ruleName) }
      if (payload.conditionsJson !== undefined) { setClauses.push(`conditions_json=$${i++}`); args.push(JSON.stringify(payload.conditionsJson)) }
      if (payload.defaultTeamJson !== undefined) { setClauses.push(`default_team_json=$${i++}`); args.push(JSON.stringify(payload.defaultTeamJson)) }
      if (payload.defaultDeliverablesJson !== undefined) { setClauses.push(`default_deliverables_json=$${i++}`); args.push(JSON.stringify(payload.defaultDeliverablesJson)) }
      if (payload.priority !== undefined) { setClauses.push(`priority=$${i++}`); args.push(payload.priority) }
      if (payload.active !== undefined) { setClauses.push(`active=$${i++}`); args.push(payload.active) }
      
      if (setClauses.length === 0) return reply.code(400).send({ error: 'No fields to update' })
      args.push(req.params.id)
      
      const { rows } = await pool.query(
        `UPDATE pricing_rules SET ${setClauses.join(', ')} WHERE id=$${i} RETURNING *`,
        args
      )
      if (!rows.length) return reply.code(404).send({ error: 'Not found' })
      return rows[0]
    } catch (err) {
      reply.code(400).send({ error: err.message })
    }
  })

  api.delete('/pricing-rules/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { rowCount } = await pool.query('DELETE FROM pricing_rules WHERE id=$1', [req.params.id])
    if (!rowCount) return reply.code(404).send({ error: 'Not found' })
    return { success: true }
  })

  api.get('/catalog/team-roles', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    return listTeamRoleCatalog()
  })

  api.post('/catalog/team-roles', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    reply.code(400).send({ error: 'Team roles are managed via Operational Roles' })
  })

  api.patch('/catalog/team-roles/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const updated = await updateCatalogItem('team_role_catalog', req.params.id, {
        price: req.body?.price,
        unitType: req.body?.unitType,
        active: req.body?.active,
      })
      if (!updated) return reply.code(404).send({ error: 'Item not found' })
      return updated
    } catch (err) {
      reply.code(400).send({ error: err.message })
    }
  })

  api.delete('/catalog/team-roles/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const result = await smartDeleteCatalogItem('team_role_catalog', req.params.id, 'TEAM_ROLE')
    if (!result) return reply.code(404).send({ error: 'Item not found' })
    return result
  })

  api.get('/catalog/deliverables', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    return listCatalog('deliverable_catalog')
  })

  api.post('/catalog/deliverables', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      return await createCatalogItem('deliverable_catalog', req.body || {})
    } catch (err) {
      reply.code(400).send({ error: err.message })
    }
  })

  api.patch('/catalog/deliverables/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const updated = await updateCatalogItem('deliverable_catalog', req.params.id, req.body || {})
      if (!updated) return reply.code(404).send({ error: 'Item not found' })
      return updated
    } catch (err) {
      reply.code(400).send({ error: err.message })
    }
  })

  api.delete('/catalog/deliverables/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const result = await smartDeleteCatalogItem('deliverable_catalog', req.params.id, 'DELIVERABLE')
    if (!result) return reply.code(404).send({ error: 'Item not found' })
    return result
  })

  // NEW: Public endpoint for quote viewer to see available addons
  api.get('/catalog/addons/public', async (req, reply) => {
    try {
      const { rows } = await pool.query(`
        SELECT id, name, price, unit_type, description 
        FROM deliverable_catalog 
        WHERE category::text = 'ADDON' AND active = true 
        ORDER BY name ASC
      `)
      return rows
    } catch (err) {
      // If ADDON enum value doesn't exist yet, return empty array
      return []
    }
  })

  // NEW: Public endpoint for fetching random covers (for Editor preview & viewers)
  api.get('/public/covers', async (req, reply) => {
    const { rows } = await pool.query(`
      SELECT file_url FROM photo_library WHERE 'cover' = ANY(tags) ORDER BY random() LIMIT 2
    `)
    return rows.map(r => r.file_url)
  })


}
