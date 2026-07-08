module.exports = async function(api, opts) {
  const {
    createNotification,
    requireAdmin,
    logAdminAudit,
    normalizeDateValue,
    assignReferenceCode,
    recalculateAccountBalances,
    dateToYMD,
    pool,
  } = opts;

  /* ===================== FINANCE V2: VENDORS & BILLS ===================== */

  api.get('/finance/vendors', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const { rows } = await pool.query(`SELECT * FROM vendors ORDER BY name ASC`)
      return rows
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch vendors' })
    }
  })

  api.post('/finance/vendors', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { name, vendor_type, phone, email, notes } = req.body || {}
    if (!name || !vendor_type) return reply.code(400).send({ error: 'Name and Vendor Type are required' })

    try {
      const { rows } = await pool.query(
        `INSERT INTO vendors (name, vendor_type, phone, email, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, vendor_type, phone || null, email || null, notes || null]
      )
      try { await logAdminAudit(req, 'create', 'vendor', rows[0].id, null, rows[0], auth.user.id) } catch (_) { }
      return reply.send(rows[0])
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to create vendor' })
    }
  })

  api.get('/finance/vendors/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    try {
      const { rows } = await pool.query(`SELECT * FROM vendors WHERE id = $1`, [id])
      if (!rows.length) return reply.code(404).send({ error: 'Not found' })
      return rows[0]
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch' })
    }
  })

  api.patch('/finance/vendors/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    const { name, vendor_type, phone, email, notes, is_active, user_id } = req.body || {}

    try {
      const current = await pool.query(`SELECT * FROM vendors WHERE id = $1`, [id])
      if (!current.rows.length) return reply.code(404).send({ error: 'Not found' })

      const updates = []
      const values = []
      let i = 1
      if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name) }
      if (vendor_type !== undefined) { updates.push(`vendor_type = $${i++}`); values.push(vendor_type) }
      if (phone !== undefined) { updates.push(`phone = $${i++}`); values.push(phone) }
      if (email !== undefined) { updates.push(`email = $${i++}`); values.push(email) }
      if (notes !== undefined) { updates.push(`notes = $${i++}`); values.push(notes) }
      if (is_active !== undefined) { updates.push(`is_active = $${i++}`); values.push(is_active) }
      if (user_id !== undefined) { updates.push(`user_id = $${i++}`); values.push(user_id || null) }

      if (!updates.length) return current.rows[0]

      updates.push(`updated_at = NOW()`)
      values.push(id)

      const { rows } = await pool.query(
        `UPDATE vendors SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      )
      try { await logAdminAudit(req, 'update', 'vendor', id, current.rows[0], rows[0], auth.user.id) } catch (_) { }
      return reply.send(rows[0])
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to update' })
    }
  })

  api.get('/vendors/:id/rate-card', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid vendor id' })
    try {
      const vendorRes = await pool.query(`SELECT id, vendor_type FROM vendors WHERE id = $1`, [id])
      if (!vendorRes.rows.length) return reply.code(404).send({ error: 'Vendor not found' })
      if (vendorRes.rows[0].vendor_type !== 'freelancer') {
        return reply.code(400).send({ error: 'Rate cards only allowed for freelancer vendors' })
      }
      const { rows } = await pool.query(
        `SELECT * FROM vendor_rate_cards WHERE vendor_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
        [id]
      )
      return reply.send({ rate_card: rows[0] || null })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch rate card' })
    }
  })

  api.post('/vendors/:id/rate-card', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid vendor id' })

    const { rate_type, rates, effective_from } = req.body || {}
    if (!rate_type) return reply.code(400).send({ error: 'rate_type is required' })

    const parseNumber = (value) => {
      const num = Number(value)
      if (!Number.isFinite(num) || num < 0) return null
      return num
    }

    const normalizeRates = () => {
      if (!rates || typeof rates !== 'object') return null
      if (rate_type === 'per_day') {
        const half = parseNumber(rates.half_day)
        const full = parseNumber(rates.full_day)
        if (half === null || full === null) return null
        return { half_day: half, full_day: full }
      }
      if (rate_type === 'per_function') {
        const small = parseNumber(rates.small_function)
        const big = parseNumber(rates.big_function)
        const full = parseNumber(rates.full_day)
        if (small === null || big === null || full === null) return null
        return { small_function: small, big_function: big, full_day: full }
      }
      if (rate_type === 'flat') {
        const amount = parseNumber(rates.amount)
        const unit = typeof rates.unit === 'string' ? rates.unit.trim() : ''
        if (amount === null || !unit) return null
        return { amount, unit }
      }
      return null
    }

    const normalizedRates = normalizeRates()
    if (!normalizedRates) return reply.code(400).send({ error: 'Invalid rates payload for rate_type' })

    try {
      const vendorRes = await pool.query(`SELECT id, vendor_type FROM vendors WHERE id = $1`, [id])
      if (!vendorRes.rows.length) return reply.code(404).send({ error: 'Vendor not found' })
      if (vendorRes.rows[0].vendor_type !== 'freelancer') {
        return reply.code(400).send({ error: 'Rate cards only allowed for freelancer vendors' })
      }

      const effectiveDate = effective_from && normalizeDateValue(effective_from)
      const effectiveValue = effectiveDate || dateToYMD(new Date())

      await pool.query('BEGIN')
      await pool.query(
        `UPDATE vendor_rate_cards SET is_active = false, updated_at = NOW() WHERE vendor_id = $1 AND is_active = true`,
        [id]
      )
      const insertRes = await pool.query(
        `INSERT INTO vendor_rate_cards (vendor_id, rate_type, rates, is_active, effective_from)\n         VALUES ($1, $2, $3, true, $4)\n         RETURNING *`,
        [id, rate_type, normalizedRates, effectiveValue]
      )
      await pool.query('COMMIT')
      try { await logAdminAudit(req, 'create', 'vendor_rate_card', insertRes.rows[0].id, null, insertRes.rows[0], auth.user.id) } catch (_) { }
      return reply.send({ rate_card: insertRes.rows[0] })
    } catch (err) {
      await pool.query('ROLLBACK')
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to save rate card' })
    }
  })

  api.get('/finance/vendor-bills', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const where = []
      const params = []
      const addParam = (value) => {
        params.push(value)
        return `$${params.length}`
      }
      const vendorId = parseId(req.query?.vendor_id)
      if (vendorId) where.push(`vb.vendor_id = ${addParam(vendorId)}`)
      const leadId = parseId(req.query?.lead_id)
      if (leadId) where.push(`vb.lead_id = ${addParam(leadId)}`)
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

      const { rows } = await pool.query(`
        SELECT vb.*, 
               v.name as vendor_name, 
               l.lead_number as lead_number, 
               l.name as lead_name,
               COALESCE(SUM(CASE WHEN ft.is_deleted = false THEN ft.amount ELSE 0 END), 0) as paid_amount
        FROM vendor_bills vb
        JOIN vendors v ON v.id = vb.vendor_id
        LEFT JOIN leads l ON l.id = vb.lead_id
        LEFT JOIN finance_transactions ft ON ft.vendor_bill_id = vb.id
        ${whereClause}
        GROUP BY vb.id, v.name, l.lead_number, l.name
        ORDER BY vb.created_at DESC
      `, params)
      return rows
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch bills' })
    }
  })

  api.post('/finance/transactions/project-expense', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { lead_id, vendor_id, vendor_bill_id, amount, date, money_source_id, note, bill_category } = req.body || {}
    const leadId = parseId(lead_id)
    const vendorId = parseId(vendor_id)
    const vendorBillId = parseId(vendor_bill_id)
    const moneySourceId = parseId(money_source_id)
    const amt = Number(amount)

    if (!leadId && !vendorBillId) return reply.code(400).send({ error: 'lead_id is required' })
    if (!vendorId) return reply.code(400).send({ error: 'vendor_id is required' })
    if (!moneySourceId) return reply.code(400).send({ error: 'money_source_id is required' })
    if (!Number.isFinite(amt) || amt <= 0) return reply.code(400).send({ error: 'Valid positive amount is required' })
    if (!vendorBillId) {
      const allowedCategories = ['editing', 'shooting', 'travel', 'food', 'printing', 'misc']
      if (!bill_category || !allowedCategories.includes(String(bill_category))) {
        return reply.code(400).send({ error: 'Valid bill_category is required' })
      }
    }

    try {
      if (leadId) {
        const leadR = await pool.query(`SELECT id FROM leads WHERE id = $1`, [leadId])
        if (!leadR.rows.length) return reply.code(404).send({ error: 'Lead not found' })
      }

      const vendorR = await pool.query(`SELECT id, name, vendor_type FROM vendors WHERE id = $1`, [vendorId])
      if (!vendorR.rows.length) return reply.code(404).send({ error: 'Vendor not found' })
      if (vendorR.rows[0].vendor_type === 'employee') return reply.code(400).send({ error: 'Employee vendors must be paid via payroll' })

      let billRow = null
      let finalBillId = vendorBillId || null
      if (vendorBillId) {
        const billR = await pool.query(`SELECT * FROM vendor_bills WHERE id = $1`, [vendorBillId])
        if (!billR.rows.length) return reply.code(404).send({ error: 'Vendor bill not found' })
        billRow = billR.rows[0]
        if (billRow.vendor_id !== vendorId) return reply.code(400).send({ error: 'Bill does not belong to selected vendor' })
        if (leadId && billRow.lead_id && billRow.lead_id !== leadId) return reply.code(400).send({ error: 'Bill does not belong to selected project' })
        if (billRow.status === 'rejected') return reply.code(400).send({ error: 'Cannot pay a rejected bill' })
      }

      const vendorName = vendorR.rows[0].name

      const txDate = normalizeDateValue(date) || dateToYMD(new Date())

      const result = await withTransaction(async (client) => {
        if (!finalBillId) {
          const createdBill = await client.query(
            `INSERT INTO vendor_bills (vendor_id, lead_id, bill_date, bill_amount, bill_category, is_billable_to_client, notes, status)
             VALUES ($1, $2, $3, $4, $5, false, $6, 'paid')
             RETURNING *`,
            [vendorId, leadId, txDate, amt, String(bill_category), note || null]
          )
          billRow = createdBill.rows[0]
          finalBillId = billRow.id
        }

        const dupR = await client.query(
          `
          SELECT 1
          FROM finance_transactions
          WHERE vendor_bill_id = $1
            AND amount = $2
            AND date = $3
            AND is_deleted = false
          LIMIT 1
          `,
          [finalBillId, amt, txDate]
        )
        if (dupR.rows.length) {
          throw { code: 'DUPLICATE_VENDOR_PAYMENT' }
        }

        const noteParts = []
        if (note && String(note).trim()) noteParts.push(String(note).trim())
        noteParts.push(`Vendor: ${vendorName}`)
        if (finalBillId) noteParts.push(`Bill #${finalBillId}`)
        const finalNote = noteParts.join(' | ')

        const txR = await client.query(
          `INSERT INTO finance_transactions (date, amount, direction, money_source_id, lead_id, is_overhead, category_id, note, vendor_bill_id, transaction_type)
           VALUES ($1, $2, 'out', $3, $4, false, NULL, $5, $6, 'vendor_payment')
           RETURNING id`,
          [txDate, amt, moneySourceId, leadId || billRow?.lead_id || null, finalNote || null, finalBillId]
        )

        await assignReferenceCode(client, txR.rows[0].id, `VENDOR-${finalBillId}`)

        if (finalBillId) {
          const totalR = await client.query(
            `SELECT COALESCE(SUM(amount), 0) as paid
             FROM finance_transactions
             WHERE vendor_bill_id = $1 AND is_deleted = false`,
            [finalBillId]
          )
          const totalPaid = Number(totalR.rows[0].paid || 0)
          const status = totalPaid >= Number(billRow.bill_amount || 0) ? 'paid' : 'approved'
          await client.query(
            `UPDATE vendor_bills SET status = $1, updated_at = NOW() WHERE id = $2`,
            [status, finalBillId]
          )
        }

        return txR.rows[0]
      })

      void recalculateAccountBalances()
      return reply.send({ success: true, transaction_id: result.id })
    } catch (err) {
      if (err?.code === 'DUPLICATE_VENDOR_PAYMENT') {
        return reply.code(400).send({ error: 'Duplicate vendor payment detected' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to record expense' })
    }
  })

  api.post('/finance/vendor-bills', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { vendor_id, lead_id, bill_date, bill_amount, bill_category, is_billable_to_client, notes } = req.body || {}
    if (!vendor_id || !bill_amount || !bill_category) return reply.code(400).send({ error: 'Missing required fields' })

    try {
      const { rows } = await pool.query(
        `INSERT INTO vendor_bills (vendor_id, lead_id, bill_date, bill_amount, bill_category, is_billable_to_client, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted') RETURNING *`,
        [vendor_id, lead_id || null, bill_date || null, bill_amount, bill_category, !!is_billable_to_client, notes || null]
      )
      try { await logAdminAudit(req, 'create', 'vendor_bill', rows[0].id, null, rows[0], auth.user.id) } catch (_) { }
      return reply.send(rows[0])
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to create bill' })
    }
  })

  api.get('/finance/vendor-bills/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    try {
      const billR = await pool.query(`
        SELECT vb.*, v.name as vendor_name, l.lead_number as lead_number, l.name as lead_name
        FROM vendor_bills vb
        JOIN vendors v ON v.id = vb.vendor_id
        LEFT JOIN leads l ON l.id = vb.lead_id
        WHERE vb.id = $1
      `, [id])
      if (!billR.rows.length) return reply.code(404).send({ error: 'Not found' })
      let bill = billR.rows[0]

      const { rows: attachments } = await pool.query(`SELECT id, file_url, uploaded_at FROM vendor_bill_attachments WHERE vendor_bill_id = $1 ORDER BY uploaded_at DESC`, [id])
      bill.attachments = attachments

      const { rows: payments } = await pool.query(`
        SELECT t.id as transaction_id, t.date, t.amount, t.note, ms.name as money_source_name
        FROM finance_transactions t
        LEFT JOIN money_sources ms ON ms.id = t.money_source_id
        WHERE t.vendor_bill_id = $1 AND t.is_deleted = false
      `, [id])
      bill.payments = payments

      return bill
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch bill' })
    }
  })

  api.patch('/finance/vendor-bills/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    const { status, is_billable_to_client, notes } = req.body || {}

    try {
      const current = await pool.query(`SELECT * FROM vendor_bills WHERE id = $1`, [id])
      if (!current.rows.length) return reply.code(404).send({ error: 'Not found' })

      const updates = []
      const values = []
      let i = 1
      if (status !== undefined) {
        const oldStatus = current.rows[0].status
        const allowedTransitions = {
          'submitted': ['approved', 'rejected'],
          'approved': ['paid', 'submitted'],
          'rejected': ['submitted'],
          'paid': ['approved']
        }
        if (status !== oldStatus && (!allowedTransitions[oldStatus] || !allowedTransitions[oldStatus].includes(status))) {
          return reply.code(400).send({ error: `Cannot transition bill from ${oldStatus} to ${status}` })
        }
        updates.push(`status = $${i++}`); values.push(status)
      }
      if (is_billable_to_client !== undefined) { updates.push(`is_billable_to_client = $${i++}`); values.push(is_billable_to_client) }
      if (notes !== undefined) { updates.push(`notes = $${i++}`); values.push(notes) }

      if (!updates.length) return current.rows[0]
      updates.push(`updated_at = NOW()`)
      values.push(id)

      const { rows } = await pool.query(
        `UPDATE vendor_bills SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      )
      try { await logAdminAudit(req, 'update', 'vendor_bill', id, current.rows[0], rows[0], auth.user.id) } catch (_) { }
      
      const newStatus = rows[0].status
      const oldStatus = current.rows[0].status
      if (newStatus !== oldStatus) {
        if (newStatus === 'approved') {
          await createNotification({ userId: rows[0].vendor_id, title: 'Bill Approved ✅', message: `Your bill for ₹${rows[0].bill_amount} was approved by Finance.`, category: 'VENDOR', type: 'SUCCESS', linkUrl: `/vendor/bills` })
        } else if (newStatus === 'rejected') {
          await createNotification({ userId: rows[0].vendor_id, title: 'Bill Rejected ❌', message: `Your bill for ₹${rows[0].bill_amount} requires revisions. Note: ${rows[0].notes || 'None given'}`, category: 'VENDOR', type: 'ERROR', linkUrl: `/vendor/bills` })
        }
      }

      return reply.send(rows[0])
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to update bill' })
    }
  })

  api.get('/finance/vendor-bills/:id/payments', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })

    try {
      const billExists = await pool.query(`SELECT id FROM vendor_bills WHERE id = $1`, [id])
      if (!billExists.rows.length) return reply.code(404).send({ error: 'Not found' })

      const { rows } = await pool.query(`
        SELECT t.id as transaction_id, t.date, t.amount, t.note,
               ms.name as money_source_name,
               t.created_at
        FROM finance_transactions t
        LEFT JOIN money_sources ms ON ms.id = t.money_source_id
        WHERE t.vendor_bill_id = $1 AND t.is_deleted = false
        ORDER BY t.date DESC, t.id DESC
      `, [id])
      return reply.send(rows)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch bill payments' })
    }
  })

  api.post('/finance/vendor-bills/:id/attachments', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    const { file_url } = req.body || {}
    if (!file_url) return reply.code(400).send({ error: 'File URL is required' })

    try {
      const { rows } = await pool.query(
        `INSERT INTO vendor_bill_attachments (vendor_bill_id, file_url) VALUES ($1, $2) RETURNING id, file_url, uploaded_at`,
        [id, file_url]
      )
      return rows[0]
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to add attachment' })
    }
  })

  api.delete('/finance/vendor-bills/:id/attachments/:attachment_id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    const attId = parseId(req.params.attachment_id)
    if (!id || !attId) return reply.code(400).send({ error: 'Invalid IDs' })

    try {
      const { rows } = await pool.query(
        `DELETE FROM vendor_bill_attachments WHERE id = $1 AND vendor_bill_id = $2 RETURNING id`,
        [attId, id]
      )
      if (!rows.length) return reply.code(404).send({ error: 'Not found' })
      return { success: true }
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to delete attachment' })
    }
  })


}
