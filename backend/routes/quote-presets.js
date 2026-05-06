/**
 * quote-presets.js
 * CRUD routes for Quick Add preset bundles (team & deliverables).
 * GET is open to all authenticated users; POST/PATCH/DELETE require admin.
 */
module.exports = async function (api, opts) {
  const { requireAdmin, requireAuth, pool } = opts

  const mapPreset = (row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    items: Array.isArray(row.items_json) ? row.items_json : [],
    active: row.active,
    createdAt: row.created_at,
  })

  // ── List ──────────────────────────────────────────────────────────────────
  api.get('/catalog/presets', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    const { type } = req.query || {}
    const { rows } = await pool.query(
      type
        ? `SELECT * FROM quote_presets WHERE type = $1 ORDER BY active DESC, name`
        : `SELECT * FROM quote_presets ORDER BY active DESC, type, name`,
      type ? [type] : []
    )
    return rows.map(mapPreset)
  })

  // ── Create ────────────────────────────────────────────────────────────────
  api.post('/catalog/presets', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { name, type, items } = req.body || {}
    if (!name || !String(name).trim()) return reply.code(400).send({ error: 'Name is required' })
    if (!['TEAM', 'DELIVERABLE'].includes(type)) return reply.code(400).send({ error: 'Type must be TEAM or DELIVERABLE' })
    if (!Array.isArray(items) || items.length === 0) return reply.code(400).send({ error: 'Items array is required and cannot be empty' })

    const { rows } = await pool.query(
      `INSERT INTO quote_presets (name, type, items_json)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [String(name).trim(), type, JSON.stringify(items)]
    )
    return reply.code(201).send(mapPreset(rows[0]))
  })

  // ── Update ────────────────────────────────────────────────────────────────
  api.patch('/catalog/presets/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { name, items, active } = req.body || {}
    const setClauses = []
    const args = []
    let i = 1

    if (name !== undefined) {
      if (!String(name).trim()) return reply.code(400).send({ error: 'Name cannot be empty' })
      setClauses.push(`name=$${i++}`); args.push(String(name).trim())
    }
    if (items !== undefined) {
      if (!Array.isArray(items)) return reply.code(400).send({ error: 'Items must be an array' })
      setClauses.push(`items_json=$${i++}`); args.push(JSON.stringify(items))
    }
    if (active !== undefined) {
      setClauses.push(`active=$${i++}`); args.push(Boolean(active))
    }

    if (!setClauses.length) return reply.code(400).send({ error: 'Nothing to update' })

    setClauses.push(`updated_at=NOW()`)
    args.push(req.params.id)

    const { rows } = await pool.query(
      `UPDATE quote_presets SET ${setClauses.join(', ')} WHERE id=$${i} RETURNING *`,
      args
    )
    if (!rows.length) return reply.code(404).send({ error: 'Preset not found' })
    return mapPreset(rows[0])
  })

  // ── Delete ────────────────────────────────────────────────────────────────
  api.delete('/catalog/presets/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { rowCount } = await pool.query('DELETE FROM quote_presets WHERE id=$1', [req.params.id])
    if (!rowCount) return reply.code(404).send({ error: 'Preset not found' })
    return { success: true }
  })
}
