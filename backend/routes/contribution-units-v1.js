module.exports = async function(api, opts) {
  const {
    requireAdmin,
    logAdminAudit,
    dateToYMD,
    pool,
  } = opts;

  /* ===================== CONTRIBUTION UNITS v1 ===================== */

  const CU_CATEGORIES = ['sales', 'planning', 'execution', 'post_production']
  const CU_ELIGIBLE_EMPLOYMENT_TYPES = ['salaried', 'stipend', 'salaried_plus_variable']

  const normalizeMonthStart = (value) => {
    if (!value) return null
    const trimmed = String(value).trim()
    if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return `${trimmed.slice(0, 7)}-01`
    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) return null
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    return `${parsed.getFullYear()}-${month}-01`
  }

  api.post('/contribution-units', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { user_id, lead_id, category, month, notes } = req.body || {}

    if (!user_id || !lead_id || !category || !month) {
      return reply.code(400).send({ error: 'user_id, lead_id, category, and month are required' })
    }

    if (!CU_CATEGORIES.includes(String(category))) {
      return reply.code(400).send({ error: 'Invalid category' })
    }

    const monthStart = normalizeMonthStart(month)
    if (!monthStart) return reply.code(400).send({ error: 'Invalid month' })

    const now = new Date()
    const currentMonthStart = dateToYMD(new Date(now.getFullYear(), now.getMonth(), 1))
    if (monthStart > currentMonthStart) {
      return reply.code(400).send({ error: 'Cannot log CU for a future month' })
    }

    try {
      const leadR = await pool.query(`SELECT id, name FROM leads WHERE id = $1`, [lead_id])
      if (!leadR.rows.length) return reply.code(404).send({ error: 'Lead not found' })

      const userR = await pool.query(
        `
        SELECT u.id, u.name, u.is_active, ecp.employment_type, ecp.is_active as profile_active
        FROM users u
        JOIN employee_compensation_profiles ecp ON ecp.user_id = u.id
        WHERE u.id = $1
        `,
        [user_id]
      )
      if (!userR.rows.length) return reply.code(400).send({ error: 'User is not eligible for CU logging' })
      const userRow = userR.rows[0]
      if (!userRow.is_active || !userRow.profile_active) {
        return reply.code(400).send({ error: 'User is not active' })
      }
      if (!CU_ELIGIBLE_EMPLOYMENT_TYPES.includes(userRow.employment_type)) {
        return reply.code(400).send({ error: 'User is not eligible for CU logging' })
      }

      const { rows } = await pool.query(
        `
        INSERT INTO contribution_units (user_id, lead_id, category, month, notes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [user_id, lead_id, category, monthStart, notes || null]
      )
      const newCu = rows[0]

      const countR = await pool.query(
        `SELECT COUNT(*)::int as count FROM contribution_units WHERE user_id = $1 AND month = $2`,
        [user_id, monthStart]
      )
      const cuCount = countR.rows[0]?.count || 0
      const warning = cuCount > 40 ? 'CU count exceeds recommended threshold for this month' : null

      await logAdminAudit(req, 'create', 'contribution_unit', newCu.id, null, newCu, auth.user?.id)

      return reply.send({
        ...newCu,
        user_name: userRow.name,
        lead_name: leadR.rows[0]?.name || null,
        warning
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to create contribution unit' })
    }
  })

  api.get('/contribution-units', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const leadId = parseId(req.query?.lead_id)
    const userId = parseId(req.query?.user_id)
    const monthStart = normalizeMonthStart(req.query?.month)

    const where = []
    const values = []
    let i = 1
    if (leadId) { where.push(`cu.lead_id = $${i++}`); values.push(leadId) }
    if (userId) { where.push(`cu.user_id = $${i++}`); values.push(userId) }
    if (monthStart) { where.push(`cu.month = $${i++}`); values.push(monthStart) }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    try {
      const { rows } = await pool.query(
        `
        SELECT cu.*, u.name as user_name, l.name as lead_name
        FROM contribution_units cu
        JOIN users u ON u.id = cu.user_id
        JOIN leads l ON l.id = cu.lead_id
        ${whereSql}
        ORDER BY cu.month DESC, cu.created_at DESC
        `,
        values
      )
      return reply.send(rows)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch contribution units' })
    }
  })

  api.delete('/contribution-units/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    const deleteReason = String(req.body?.delete_reason || '').trim()
    if (!deleteReason) return reply.code(400).send({ error: 'delete_reason is required' })

    try {
      const existingR = await pool.query(
        `
        SELECT cu.*, u.name as user_name, l.name as lead_name
        FROM contribution_units cu
        JOIN users u ON u.id = cu.user_id
        JOIN leads l ON l.id = cu.lead_id
        WHERE cu.id = $1
        `,
        [id]
      )
      if (!existingR.rows.length) return reply.code(404).send({ error: 'Contribution unit not found' })

      const existing = existingR.rows[0]
      await pool.query(`DELETE FROM contribution_units WHERE id = $1`, [id])
      await logAdminAudit(
        req,
        'delete',
        'contribution_unit',
        id,
        existing,
        { delete_reason: deleteReason },
        auth.user?.id
      )

      return reply.send({ success: true })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to delete contribution unit' })
    }
  })

  // List payouts for a month
  api.get('/payroll/payouts', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const month = req.query?.month
    if (!month) return reply.code(400).send({ error: 'month query param is required' })

    try {
      const { rows } = await pool.query(`
        SELECT ep.*, u.name as user_name
        FROM employee_payouts ep
        JOIN users u ON u.id = ep.user_id
        WHERE ep.month = $1
        ORDER BY u.name ASC
      `, [month])
      return reply.send(rows)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch payouts' })
    }
  })

  // Record payout
  api.post('/payroll/payouts', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { user_id, month, total_payable, total_paid, payout_date } = req.body || {}
    if (!user_id || !month) return reply.code(400).send({ error: 'user_id and month are required' })

    try {
      const result = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO employee_payouts (user_id, month, total_payable, total_paid, payout_date, finance_transaction_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, month) DO UPDATE SET
             total_payable = EXCLUDED.total_payable,
             total_paid = EXCLUDED.total_paid,
             payout_date = EXCLUDED.payout_date,
             finance_transaction_id = EXCLUDED.finance_transaction_id
           RETURNING *`,
          [user_id, month, Number(total_payable) || 0, Number(total_paid) || 0, payout_date || null, null]
        )

        return rows[0]
      })

      return reply.send(result)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to record payout' })
    }
  })


}
