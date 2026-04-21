module.exports = async function(api, opts) {
  const {
    requireVendor,
    pool,
  } = opts;

  /* ===================== VENDOR PORTAL v2.5/2.6 (READ-ONLY) ===================== */

  // Statement Dashboard
  api.get('/vendor/statement', async (req, reply) => {
    const ctx = await requireVendor(req, reply)
    if (!ctx) return
    const { date_from, date_to } = req.query || {}

    try {
      let paymentWhere = `t.direction = 'out' AND t.is_deleted = false AND vb.vendor_id = $1 AND vb.status = 'paid'`
      let billWhere = `vb.vendor_id = $1 AND vb.status IN ('approved', 'submitted')`

      const pValues = [ctx.vendor.id]
      const bValues = [ctx.vendor.id]
      let pI = 2
      let bI = 2

      if (date_from) {
        paymentWhere += ` AND t.date >= $${pI++}`
        pValues.push(date_from)
        billWhere += ` AND vb.bill_date >= $${bI++}`
        bValues.push(date_from)
      }
      if (date_to) {
        paymentWhere += ` AND t.date <= $${pI++}`
        pValues.push(date_to)
        billWhere += ` AND vb.bill_date <= $${bI++}`
        bValues.push(date_to)
      }

      // Payments
      const { rows: payments } = await pool.query(`
        SELECT t.id, t.date, t.amount,
               'payment' as record_type,
               'Paid' as status,
               l.lead_number as lead_num, l.name as lead_name
        FROM finance_transactions t
        JOIN vendor_bills vb ON vb.id = t.vendor_bill_id
        LEFT JOIN leads l ON l.id = vb.lead_id
        WHERE ${paymentWhere}
      `, pValues)

      // Bills
      const { rows: bills } = await pool.query(`
        SELECT vb.id, vb.bill_date as date, vb.bill_amount as amount,
               'bill' as record_type,
               vb.status,
               l.lead_number as lead_num, l.name as lead_name
        FROM vendor_bills vb
        LEFT JOIN leads l ON l.id = vb.lead_id
        WHERE ${billWhere}
      `, bValues)

      const history = [...payments, ...bills].sort((a, b) => {
        const d1 = new Date(a.date).getTime()
        const d2 = new Date(b.date).getTime()
        if (d1 !== d2) return d2 - d1 // latest first
        return b.id - a.id
      })

      // Calculate summary for the date range requested
      const totalPaid = payments.reduce((acc, p) => acc + Number(p.amount), 0)
      const pendingApprovedAmount = bills.filter(b => b.status === 'approved').reduce((acc, b) => acc + Number(b.amount), 0)
      const billsUnderReview = bills.filter(b => b.status === 'submitted').length

      return reply.send({
        summary: { totalPaid, pendingApprovedAmount, billsUnderReview },
        history
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch statement' })
    }
  })

  // Projects (Leads) — read-only list of unique projects this vendor has billed for
  api.get('/vendor/projects', async (req, reply) => {
    const ctx = await requireVendor(req, reply)
    if (!ctx) return
    try {
      const { rows } = await pool.query(`
        SELECT DISTINCT l.id, l.lead_number as lead_num, l.name as lead_name, l.bride_name, l.groom_name
        FROM vendor_bills vb
        JOIN leads l ON l.id = vb.lead_id
        WHERE vb.vendor_id = $1
        ORDER BY l.id DESC
      `, [ctx.vendor.id])

      const result = rows.map(r => ({
        id: r.id,
        name: `L#${r.lead_num} ${r.lead_name || ''}${r.bride_name && r.groom_name ? ` (${r.bride_name}–${r.groom_name})` : ''}`.trim()
      }))
      return reply.send(result)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch projects' })
    }
  })

  // My Payments — only transactions linked to PAID vendor bills
  api.get('/vendor/payments', async (req, reply) => {
    const ctx = await requireVendor(req, reply)
    if (!ctx) return
    const { date_from, date_to, lead_id } = req.query || {}

    try {
      let where = `vb.vendor_id = $1 AND vb.status = 'paid' AND ft.is_deleted = false AND ft.direction = 'out'`
      const values = [ctx.vendor.id]
      let i = 2

      if (date_from) { where += ` AND ft.date >= $${i++}`; values.push(date_from) }
      if (date_to) { where += ` AND ft.date <= $${i++}`; values.push(date_to) }
      if (lead_id) { where += ` AND vb.lead_id = $${i++}`; values.push(lead_id) }

      const { rows } = await pool.query(`
        SELECT ft.id, ft.date, ft.amount,
               vb.lead_id,
               l.lead_number as lead_num,
               l.name as lead_name, l.bride_name, l.groom_name
        FROM finance_transactions ft
        JOIN vendor_bills vb ON vb.id = ft.vendor_bill_id
        LEFT JOIN leads l ON l.id = vb.lead_id
        WHERE ${where}
        ORDER BY ft.date DESC
      `, values)

      const result = rows.map(r => ({
        id: r.id,
        date: r.date,
        amount: r.amount,
        project: r.lead_id ? `L#${r.lead_num} ${r.lead_name || ''}${r.bride_name && r.groom_name ? ` (${r.bride_name}–${r.groom_name})` : ''}`.trim() : null
      }))
      return reply.send(result)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch payments' })
    }
  })

  // My Bills — read-only list of the vendor's own bills
  api.get('/vendor/bills', async (req, reply) => {
    const ctx = await requireVendor(req, reply)
    if (!ctx) return
    const showRejected = req.query?.show_rejected === 'true'
    const statusFilter = req.query?.status
    const leadIdFilter = req.query?.lead_id

    try {
      let where = `vb.vendor_id = $1`
      const values = [ctx.vendor.id]
      let i = 2

      if (statusFilter) {
        where += ` AND vb.status = $${i++}`
        values.push(statusFilter)
      } else if (!showRejected) {
        where += ` AND vb.status != 'rejected'`
      }

      if (leadIdFilter) {
        where += ` AND vb.lead_id = $${i++}`
        values.push(leadIdFilter)
      }

      const { rows } = await pool.query(`
        SELECT vb.id, vb.bill_date, vb.bill_amount, vb.bill_category, vb.status, vb.notes, vb.lead_id,
               l.lead_number as lead_num,
               l.name as lead_name, l.bride_name, l.groom_name
        FROM vendor_bills vb
        LEFT JOIN leads l ON l.id = vb.lead_id
        WHERE ${where}
        ORDER BY vb.bill_date DESC NULLS LAST, vb.id DESC
      `, values)

      const result = rows.map(r => ({
        id: r.id,
        bill_date: r.bill_date,
        bill_amount: r.bill_amount,
        bill_category: r.bill_category,
        status: r.status,
        notes: r.notes,
        project: r.lead_id ? `L#${r.lead_num} ${r.lead_name || ''}${r.bride_name && r.groom_name ? ` (${r.bride_name}–${r.groom_name})` : ''}`.trim() : null
      }))
      return reply.send(result)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch bills' })
    }
  })

  // Submit Bill — vendor creates a new bill (status = submitted)
  api.post('/vendor/bills', async (req, reply) => {
    const ctx = await requireVendor(req, reply)
    if (!ctx) return
    const { bill_date, bill_amount, bill_category, lead_id, notes, receipt_url } = req.body || {}

    if (!bill_amount || Number(bill_amount) <= 0) return reply.code(400).send({ error: 'Bill amount is required' })
    if (!bill_category) return reply.code(400).send({ error: 'Bill category is required' })

    try {
      const { rows } = await pool.query(
        `INSERT INTO vendor_bills (vendor_id, lead_id, bill_date, bill_amount, bill_category, is_billable_to_client, notes, status)
         VALUES ($1, $2, $3, $4, $5, false, $6, 'submitted') RETURNING *`,
        [ctx.vendor.id, lead_id || null, bill_date || null, Number(bill_amount), bill_category, notes || null]
      )
      const newBill = rows[0]

      // If receipt URL provided, add as attachment
      if (receipt_url && String(receipt_url).trim()) {
        await pool.query(
          `INSERT INTO vendor_bill_attachments (vendor_bill_id, file_url) VALUES ($1, $2)`,
          [newBill.id, String(receipt_url).trim()]
        )
      }

      return reply.send(newBill)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to submit bill' })
    }
  })


}
