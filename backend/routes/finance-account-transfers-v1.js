module.exports = async function(api, opts) {
  const {
    requireAdmin,
    logAdminAudit,
    normalizeDateValue,
    assignReferenceCode,
    recalculateAccountBalances,
    crypto,
    pool,
  } = opts;

  /* ===================== FINANCE — ACCOUNT TRANSFERS v1 ===================== */

  api.post('/finance/transfers', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const body = req.body || {}
    const fromId = parseId(body.from_money_source_id)
    const toId = parseId(body.to_money_source_id)
    if (!fromId || !toId) return reply.code(400).send({ error: 'From and To money sources are required' })
    if (fromId === toId) return reply.code(400).send({ error: 'From and To money sources must differ' })
    const amountNum = Number(body.amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return reply.code(400).send({ error: 'Valid positive amount is required' })
    }
    const date = normalizeDateValue(body.date)
    if (!date) return reply.code(400).send({ error: 'Valid date is required' })
    const note = (body.note || '').trim() || null

    try {
      const result = await withTransaction(async (client) => {
        const fromR = await client.query(`SELECT id, name FROM money_sources WHERE id = $1`, [fromId])
        if (!fromR.rows.length) throw { code: 'SOURCE_NOT_FOUND' }
        const toR = await client.query(`SELECT id, name FROM money_sources WHERE id = $1`, [toId])
        if (!toR.rows.length) throw { code: 'DEST_NOT_FOUND' }

        const transferGroupId = crypto.randomUUID()

        const outNote = note ? `Transfer to ${toR.rows[0].name} — ${note}` : `Transfer to ${toR.rows[0].name}`
        const inNote = note ? `Transfer from ${fromR.rows[0].name} — ${note}` : `Transfer from ${fromR.rows[0].name}`

        const outR = await client.query(
          `INSERT INTO finance_transactions
            (date, amount, direction, money_source_id, lead_id, is_overhead, category_id, note, is_transfer, transfer_group_id, transaction_type)
           VALUES ($1, $2, 'out', $3, NULL, false, NULL, $4, true, $5, 'transfer')
           RETURNING id`,
          [date, amountNum, fromId, outNote, transferGroupId]
        )
        const inR = await client.query(
          `INSERT INTO finance_transactions
            (date, amount, direction, money_source_id, lead_id, is_overhead, category_id, note, is_transfer, transfer_group_id, transaction_type)
           VALUES ($1, $2, 'in', $3, NULL, false, NULL, $4, true, $5, 'transfer')
           RETURNING id`,
          [date, amountNum, toId, inNote, transferGroupId]
        )

        await assignReferenceCode(client, outR.rows[0].id, `TR-${transferGroupId}`)
        await assignReferenceCode(client, inR.rows[0].id, `TR-${transferGroupId}`)

        const checkR = await client.query(
          `
          SELECT COUNT(*)::int as count
          FROM finance_transactions
          WHERE transfer_group_id = $1 AND is_transfer = true
          `,
          [transferGroupId]
        )
        if (Number(checkR.rows[0]?.count || 0) !== 2) {
          throw { code: 'TRANSFER_COUNT_MISMATCH' }
        }

        return {
          transfer_group_id: transferGroupId,
          from_account: fromR.rows[0],
          to_account: toR.rows[0],
          transaction_ids: [outR.rows[0].id, inR.rows[0].id]
        }
      })

      await logAdminAudit(
        req,
        'create',
        'finance_transfer',
        null,
        null,
        {
          transfer_group_id: result.transfer_group_id,
          from_money_source_id: fromId,
          to_money_source_id: toId,
          amount: amountNum,
          date,
          note,
          transaction_ids: result.transaction_ids
        },
        auth.sub
      )

      void recalculateAccountBalances()
      return reply.send({
        transfer_group_id: result.transfer_group_id,
        date,
        amount: amountNum,
        note,
        from_account: result.from_account.name,
        to_account: result.to_account.name,
        transaction_ids: result.transaction_ids
      })
    } catch (err) {
      if (err?.code === 'SOURCE_NOT_FOUND') {
        return reply.code(404).send({ error: 'From money source not found' })
      }
      if (err?.code === 'DEST_NOT_FOUND') {
        return reply.code(404).send({ error: 'To money source not found' })
      }
      if (err?.code === '23503') {
        return reply.code(400).send({ error: 'Invalid money source reference' })
      }
      if (err?.code === '23514') {
        return reply.code(400).send({ error: 'Transfer violates finance transaction rules. Ensure transfers migration is applied.' })
      }
      if (err?.code === 'TRANSFER_COUNT_MISMATCH') {
        return reply.code(500).send({ error: 'Transfer integrity check failed' })
      }
      if (err?.code === '42703') {
        return reply.code(500).send({ error: 'Transfer columns missing. Apply finance transfers migration.' })
      }
      console.error('TRANSFER ERROR:', err)
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to create transfer' })
    }
  })

  api.get('/finance/transfers', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const { rows } = await pool.query(
        `
        SELECT
          t.transfer_group_id,
          MAX(t.date)::date as date,
          MAX(t.amount) as amount,
          MAX(t.note) as note,
          MAX(CASE WHEN t.direction = 'out' THEN ms.name END) as from_account,
          MAX(CASE WHEN t.direction = 'in' THEN ms.name END) as to_account,
          MAX(t.created_at) as created_at,
          creator.user_id as created_by,
          creator.user_name as created_by_name
        FROM finance_transactions t
        JOIN money_sources ms ON ms.id = t.money_source_id
        LEFT JOIN LATERAL (
          SELECT aal.user_id, u.name as user_name
          FROM admin_audit_log aal
          LEFT JOIN users u ON u.id = aal.user_id
          WHERE aal.entity_type = 'finance_transfer'
            AND aal.action = 'create'
            AND (aal.after_data->>'transfer_group_id') = t.transfer_group_id
          ORDER BY aal.created_at DESC
          LIMIT 1
        ) creator ON true
        WHERE t.is_deleted = false
          AND t.is_transfer = true
          AND t.transfer_group_id IS NOT NULL
        GROUP BY t.transfer_group_id, creator.user_id, creator.user_name
        ORDER BY date DESC, created_at DESC
        `
      )
      return rows
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load transfers' })
    }
  })

  api.get('/finance/transfers/:groupId', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const groupId = String(req.params?.groupId || '').trim()
    if (!groupId) return reply.code(400).send({ error: 'Invalid transfer group id' })
    try {
      const { rows } = await pool.query(
        `
        SELECT
          t.id,
          t.date,
          t.amount,
          t.direction,
          t.note,
          t.created_at,
          ms.id as money_source_id,
          ms.name as money_source_name
        FROM finance_transactions t
        JOIN money_sources ms ON ms.id = t.money_source_id
        WHERE t.transfer_group_id = $1
          AND t.is_transfer = true
          AND t.is_deleted = false
        ORDER BY t.direction DESC, t.id ASC
        `,
        [groupId]
      )
      if (!rows.length) return reply.code(404).send({ error: 'Transfer not found' })

      const audit = await pool.query(
        `
        SELECT aal.user_id, u.name as user_name, aal.created_at
        FROM admin_audit_log aal
        LEFT JOIN users u ON u.id = aal.user_id
        WHERE aal.entity_type = 'finance_transfer'
          AND aal.action = 'create'
          AND (aal.after_data->>'transfer_group_id') = $1
        ORDER BY aal.created_at DESC
        LIMIT 1
        `,
        [groupId]
      )

      const meta = audit.rows[0] || null
      const date = rows[0].date
      const amount = rows[0].amount
      const note = rows[0].note
      const fromLeg = rows.find(r => r.direction === 'out') || null
      const toLeg = rows.find(r => r.direction === 'in') || null

      return reply.send({
        transfer_group_id: groupId,
        date,
        amount,
        note,
        from_account: fromLeg?.money_source_name || null,
        to_account: toLeg?.money_source_name || null,
        created_by: meta ? { user_id: meta.user_id, user_name: meta.user_name, created_at: meta.created_at } : null,
        legs: rows
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load transfer' })
    }
  })

  api.delete('/finance/transfers/:groupId', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const groupId = String(req.params?.groupId || '').trim()
    if (!groupId) return reply.code(400).send({ error: 'Invalid transfer group id' })
    const deleteReason = (req.body?.delete_reason || '').trim()
    if (!deleteReason) return reply.code(400).send({ error: 'delete_reason is required' })

    try {
      const result = await withTransaction(async (client) => {
        const existing = await client.query(
          `SELECT id FROM finance_transactions
           WHERE transfer_group_id = $1 AND is_transfer = true AND is_deleted = false`,
          [groupId]
        )
        if (!existing.rows.length) throw { code: 'NOT_FOUND' }

        const ids = existing.rows.map(r => r.id)

        await client.query(
          `UPDATE finance_transactions
           SET is_deleted = true, updated_at = NOW(), updated_by = $1
           WHERE transfer_group_id = $2 AND is_transfer = true`,
          [auth.user.id, groupId]
        )

        return ids
      })

      await logAdminAudit(
        req,
        'delete',
        'finance_transfer',
        null,
        { transfer_group_id: groupId, transaction_ids: result, delete_reason: deleteReason },
        null,
        auth.user.id
      )

      void recalculateAccountBalances()
      return reply.send({ success: true })
    } catch (err) {
      if (err?.code === 'NOT_FOUND') {
        return reply.code(404).send({ error: 'Transfer not found' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to delete transfer' })
    }
  })


}
