module.exports = async function(api, opts) {
  const {
    requireAdmin,
    logAdminAudit,
    normalizeDateValue,
    assignReferenceCode,
    recalculateAccountBalances,
    dateToYMD,
    pool,
  } = opts;

  /* ===================== FINANCE v1 INVOICES ===================== */

  const generateInvoiceNumber = async (client = pool) => {
    // Basic format: INV-YYYYMMDD-XXXX
    const dateStr = dateToYMD(new Date()).replace(/-/g, '')
    const prefix = `INV-${dateStr}-`
    const r = await client.query(
      `SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1 ORDER BY invoice_number DESC LIMIT 1`,
      [`${prefix}%`]
    )
    let nextNum = 1
    if (r.rows.length > 0) {
      const lastNum = parseInt(r.rows[0].invoice_number.split('-')[2], 10)
      if (!isNaN(lastNum)) nextNum = lastNum + 1
    }
    return `${prefix}${String(nextNum).padStart(4, '0')}`
  }

  api.get('/finance/invoices', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const leadId = parseId(req.query.lead_id)
    const status = req.query.status ? String(req.query.status) : null

    let query = `
      SELECT i.*, 
             l.name as lead_name, 
             l.lead_number,
             COALESCE((SELECT SUM(amount_applied) FROM invoice_payments WHERE invoice_id = i.id), 0) as paid_amount
      FROM invoices i
      JOIN leads l ON l.id = i.lead_id
      WHERE 1=1
    `
    const params = []

    if (leadId) {
      params.push(leadId)
      query += ` AND i.lead_id = $${params.length}`
    }
    if (status) {
      params.push(status)
      query += ` AND i.status = $${params.length}`
    }

    query += ` ORDER BY i.created_at DESC`

    try {
      const r = await pool.query(query, params)
      return r.rows
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch invoices' })
    }
  })

  api.get('/finance/invoices/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid invoice id' })

    try {
      const invR = await pool.query(
        `SELECT i.*, l.name as lead_name, l.lead_number 
         FROM invoices i JOIN leads l ON l.id = i.lead_id 
         WHERE i.id = $1`,
        [id]
      )
      if (!invR.rows.length) return reply.code(404).send({ error: 'Invoice not found' })
      const invoice = invR.rows[0]

      const itemsR = await pool.query(`SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY id ASC`, [id])
      invoice.line_items = itemsR.rows

      const paymentsR = await pool.query(
        `SELECT ip.*, ft.date as transaction_date, ft.amount as transaction_amount, ms.name as money_source_name
         FROM invoice_payments ip
         JOIN finance_transactions ft ON ft.id = ip.finance_transaction_id
         LEFT JOIN money_sources ms ON ms.id = ft.money_source_id
         WHERE ip.invoice_id = $1
         ORDER BY ip.created_at ASC`,
        [id]
      )
      invoice.payments = paymentsR.rows

      if (invoice.payment_structure_id) {
        const stepsR = await pool.query(
          `SELECT * FROM payment_structure_steps WHERE payment_structure_id = $1 ORDER BY step_order ASC`,
          [invoice.payment_structure_id]
        )
        invoice.payment_steps = stepsR.rows
      }

      const scheduleR = await pool.query(
        `SELECT id, invoice_id, label, percentage, amount, due_date, step_order
         FROM invoice_payment_schedule
         WHERE invoice_id = $1
         ORDER BY step_order ASC, id ASC`,
        [id]
      )
      invoice.payment_schedule = scheduleR.rows

      return invoice
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch invoice details' })
    }
  })

  api.put('/finance/invoices/:id/schedule', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid invoice id' })

    const scheduleInput = Array.isArray(req.body?.schedule) ? req.body.schedule : []
    if (scheduleInput.length === 0) {
      return reply.code(400).send({ error: 'Schedule is required' })
    }

    try {
      const invR = await pool.query(`SELECT id, total_amount, status FROM invoices WHERE id = $1`, [id])
      if (!invR.rows.length) return reply.code(404).send({ error: 'Invoice not found' })
      if (invR.rows[0].status === 'cancelled') {
        return reply.code(400).send({ error: 'Cannot update schedule for cancelled invoice' })
      }

      const totalAmount = Number(invR.rows[0].total_amount || 0)

      const normalized = scheduleInput.map((item, index) => {
        const dueDate = normalizeDateValue(item?.due_date)
        if (!dueDate) throw new Error('Each schedule item must have a due_date')
        const percentageRaw = item?.percentage
        const amountRaw = item?.amount
        const percentage = percentageRaw !== undefined && percentageRaw !== null && percentageRaw !== '' ? Number(percentageRaw) : null
        let amount = amountRaw !== undefined && amountRaw !== null && amountRaw !== '' ? Number(amountRaw) : null
        if (amount === null) {
          if (!percentage || !Number.isFinite(percentage)) {
            throw new Error('Each schedule item must have amount or percentage')
          }
          amount = (percentage / 100) * totalAmount
        }
        if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid schedule amount')
        const stepOrder = Number.isFinite(Number(item?.step_order)) ? Number(item.step_order) : index + 1
        return {
          label: item?.label ? String(item.label).trim() : null,
          percentage: Number.isFinite(percentage) ? percentage : null,
          amount,
          due_date: dueDate,
          step_order: stepOrder
        }
      })

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(`DELETE FROM invoice_payment_schedule WHERE invoice_id = $1`, [id])
        for (const row of normalized) {
          await client.query(
            `INSERT INTO invoice_payment_schedule (invoice_id, label, percentage, amount, due_date, step_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, row.label, row.percentage, row.amount, row.due_date, row.step_order]
          )
        }
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      return reply.send({ schedule: normalized })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: err.message || 'Failed to update schedule' })
    }
  })

  api.post('/finance/invoices', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const body = req.body || {}

    const leadId = parseId(body.lead_id)
    if (!leadId) return reply.code(400).send({ error: 'Lead ID is required' })

    const invoiceType = ['gst', 'non_gst'].includes(body.invoice_type) ? body.invoice_type : 'non_gst'
    const issueDate = normalizeDateValue(body.issue_date) || normalizeDateValue(new Date())
    const dueDate = normalizeDateValue(body.due_date)
    const notes = (body.notes || '').trim() || null
    const lineItems = Array.isArray(body.line_items) ? body.line_items : []
    const scheduleInput = Array.isArray(body.payment_schedule) ? body.payment_schedule : []

    let subtotal = 0
    let taxAmount = Number(body.tax_amount) || 0
    let totalAmount = Number(body.total_amount) || 0

    // Compute basic totals safely, totalAmount is authoritative
    lineItems.forEach(item => {
      const qty = Number(item.quantity) || 1
      const price = Number(item.unit_price) || 0
      subtotal += (qty * price)
    })

    if (!body.total_amount) {
      // Auto-compute but respect frontend override
      totalAmount = subtotal + taxAmount
    }

    let client
    try {
      client = await pool.connect()
      await client.query('BEGIN')

      // Auto-fetch default payment structure
      let paymentStructureId = null;
      const defaultStruct = await client.query(`SELECT id FROM payment_structures WHERE is_default = true LIMIT 1`)
      if (defaultStruct.rows.length) {
        paymentStructureId = defaultStruct.rows[0].id
      }

      const invoiceNumber = await generateInvoiceNumber(client)

      const r = await client.query(
        `INSERT INTO invoices (invoice_number, lead_id, invoice_type, payment_structure_id, subtotal, tax_amount, total_amount, status, issue_date, due_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9, $10)
         RETURNING *`,
        [invoiceNumber, leadId, invoiceType, paymentStructureId, subtotal, taxAmount, totalAmount, issueDate, dueDate, notes]
      )
      const newInvoice = r.rows[0]

      const scheduleRows = []
      if (scheduleInput.length > 0) {
        scheduleInput.forEach((item, index) => {
          const due = normalizeDateValue(item?.due_date)
          if (!due) throw new Error('Each schedule item must have a due_date')
          const percentageRaw = item?.percentage
          const amountRaw = item?.amount
          const percentage = percentageRaw !== undefined && percentageRaw !== null && percentageRaw !== '' ? Number(percentageRaw) : null
          let amount = amountRaw !== undefined && amountRaw !== null && amountRaw !== '' ? Number(amountRaw) : null
          if (amount === null) {
            if (!percentage || !Number.isFinite(percentage)) {
              throw new Error('Each schedule item must have amount or percentage')
            }
            amount = (percentage / 100) * totalAmount
          }
          if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid schedule amount')
          const stepOrder = Number.isFinite(Number(item?.step_order)) ? Number(item.step_order) : index + 1
          scheduleRows.push({
            label: item?.label ? String(item.label).trim() : null,
            percentage: Number.isFinite(percentage) ? percentage : null,
            amount,
            due_date: due,
            step_order: stepOrder
          })
        })
      } else if (dueDate) {
        scheduleRows.push({
          label: 'Due',
          percentage: null,
          amount: totalAmount,
          due_date: dueDate,
          step_order: 1
        })
      }

      for (const item of lineItems) {
        const qty = Number(item.quantity) || 1
        const price = Number(item.unit_price) || 0
        const lineTotal = qty * price

        let vendorBillId = item.vendor_bill_id ? Number(item.vendor_bill_id) : null
        if (vendorBillId) {
          const checkLink = await client.query(`SELECT id FROM invoice_line_items WHERE vendor_bill_id = $1`, [vendorBillId])
          if (checkLink.rows.length > 0) {
            throw new Error(`Vendor bill #${vendorBillId} is already linked to another invoice line item.`)
          }
        }

        await client.query(
          `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, line_total, is_billable_expense, vendor_bill_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [newInvoice.id, (item.description || '').trim() || 'Item', qty, price, lineTotal, !!item.is_billable_expense, vendorBillId]
        )
      }

      for (const row of scheduleRows) {
        await client.query(
          `INSERT INTO invoice_payment_schedule (invoice_id, label, percentage, amount, due_date, step_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [newInvoice.id, row.label, row.percentage, row.amount, row.due_date, row.step_order]
        )
      }

      await client.query('COMMIT')

      // Respond immediately after commit; audit logging should never block or fail the response.
      const invoiceToReturn = newInvoice
      reply.code(201).send(invoiceToReturn)

      setImmediate(async () => {
        try {
          await logAdminAudit(req, 'create', 'invoice', newInvoice.id, null, newInvoice, auth?.user?.id || null)
        } catch (auditErr) {
          console.warn('Failed to write admin audit log for invoice create', auditErr?.message || auditErr)
        }
      })
      return
    } catch (err) {
      if (client) await client.query('ROLLBACK')
      req.log.error(err)
      return reply.code(500).send({ error: err.message || 'Failed to create invoice' })
    } finally {
      if (client) client.release()
    }
  })

  // We abstract the status calculation so applying/removing payments and editing totals auto-updates status.
  const updateInvoiceStatusAsync = async (invoiceId) => {
    const invR = await pool.query(`SELECT status, total_amount FROM invoices WHERE id = $1`, [invoiceId])
    if (!invR.rows.length) return
    const invoice = invR.rows[0]

    // Cancelled is terminal
    if (invoice.status === 'cancelled') return

    const payR = await pool.query(`SELECT COALESCE(SUM(amount_applied), 0) as paid FROM invoice_payments WHERE invoice_id = $1`, [invoiceId])
    const paid = Number(payR.rows[0].paid)
    const total = Number(invoice.total_amount)

    let newStatus = invoice.status
    if (paid > 0) {
      if (paid >= total) newStatus = 'paid'
      else newStatus = 'partially_paid'
    } else {
      if (invoice.status === 'paid' || invoice.status === 'partially_paid') {
        newStatus = 'issued' // fallback to issued if payments removed
      }
    }

    if (newStatus !== invoice.status) {
      await pool.query(`UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, invoiceId])
    }
  }

  api.patch('/finance/invoices/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid invoice id' })

    const body = req.body || {}
    let client
    try {
      const curR = await pool.query(`SELECT * FROM invoices WHERE id = $1`, [id])
      if (!curR.rows.length) return reply.code(404).send({ error: 'Invoice not found' })
      const existing = curR.rows[0]

      const updates = []
      const values = []
      const addVal = (val) => {
        values.push(val)
        return `$${values.length}`
      }

      if (body.status && ['draft', 'issued', 'partially_paid', 'paid', 'cancelled'].includes(body.status)) {
        updates.push(`status = ${addVal(body.status)}`)
      }
      if (body.invoice_type && ['gst', 'non_gst'].includes(body.invoice_type)) {
        updates.push(`invoice_type = ${addVal(body.invoice_type)}`)
      }
      if (body.issue_date !== undefined) {
        updates.push(`issue_date = ${addVal(normalizeDateValue(body.issue_date))}`)
      }
      if (body.due_date !== undefined) {
        updates.push(`due_date = ${addVal(normalizeDateValue(body.due_date))}`)
      }
      if (body.notes !== undefined) {
        updates.push(`notes = ${addVal(String(body.notes || '').trim() || null)}`)
      }
      if (body.tax_amount !== undefined) {
        updates.push(`tax_amount = ${addVal(Number(body.tax_amount) || 0)}`)
      }
      if (body.total_amount !== undefined) {
        updates.push(`total_amount = ${addVal(Number(body.total_amount) || 0)}`)
      }
      if (body.subtotal !== undefined) {
        updates.push(`subtotal = ${addVal(Number(body.subtotal) || 0)}`)
      }

      client = await pool.connect()
      await client.query('BEGIN')

      let updatedInvoice = existing
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`)
        const q = `UPDATE invoices SET ${updates.join(', ')} WHERE id = ${addVal(id)} RETURNING *`
        const r = await client.query(q, values)
        updatedInvoice = r.rows[0]
      }

      // If line items passed in array, replace completely
      if (Array.isArray(body.line_items)) {
        await client.query(`DELETE FROM invoice_line_items WHERE invoice_id = $1`, [id])
        for (const item of body.line_items) {
          const qty = Number(item.quantity) || 1
          const price = Number(item.unit_price) || 0
          const lineTotal = qty * price

          let vendorBillId = item.vendor_bill_id ? Number(item.vendor_bill_id) : null
          if (vendorBillId) {
            const checkLink = await client.query(`SELECT id FROM invoice_line_items WHERE vendor_bill_id = $1`, [vendorBillId])
            if (checkLink.rows.length > 0) {
              // Since we deleted all line items for this invoice before inserting, 
              // any existing matches here belong to a different invoice, or are duplicates in this payload.
              throw new Error(`Vendor bill #${vendorBillId} is already linked to another invoice line item.`)
            }
          }

          await client.query(
            `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, line_total, is_billable_expense, vendor_bill_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, (item.description || '').trim() || 'Item', qty, price, lineTotal, !!item.is_billable_expense, vendorBillId]
          )
        }
      }

      await client.query('COMMIT')

      // Auto calc status just in case total_amount changed to less than paid amount
      await updateInvoiceStatusAsync(id)

      await logAdminAudit(req, 'update', 'invoice', id, existing, updatedInvoice, auth.user.id, client)
      return updatedInvoice
    } catch (err) {
      if (client) await client.query('ROLLBACK')
      req.log.error(err)
      return reply.code(500).send({ error: err.message || 'Failed to update invoice' })
    } finally {
      if (client) client.release()
    }
  })

  api.post('/finance/invoices/:id/payments', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const invoiceId = parseId(req.params.id)
    if (!invoiceId) return reply.code(400).send({ error: 'Invalid invoice id' })

    const { amount_applied, money_source_id, date, note, category_id } = req.body || {}
    const moneySourceId = parseId(money_source_id)
    if (!moneySourceId) return reply.code(400).send({ error: 'money_source_id is required' })

    const amount = Number(amount_applied)
    if (!Number.isFinite(amount) || amount <= 0) return reply.code(400).send({ error: 'Valid positive amount_applied is required' })

    try {
      const invR = await pool.query(`SELECT id, status, lead_id FROM invoices WHERE id = $1`, [invoiceId])
      if (!invR.rows.length) return reply.code(404).send({ error: 'Invoice not found' })
      if (invR.rows[0].status === 'cancelled') return reply.code(400).send({ error: 'Cannot apply payments to cancelled invoice' })

      const txDate = normalizeDateValue(date) || dateToYMD(new Date())
      const categoryId = parseId(category_id) || null
      const txNote = (note || '').trim() || null

      const dupR = await pool.query(
        `
        SELECT 1
        FROM invoice_payments ip
        JOIN finance_transactions ft ON ft.id = ip.finance_transaction_id
        WHERE ip.invoice_id = $1
          AND ft.date = $2
          AND ft.amount = $3
          AND ft.money_source_id = $4
          AND ft.is_deleted = false
        LIMIT 1
        `,
        [invoiceId, txDate, amount, moneySourceId]
      )
      if (dupR.rows.length) {
        return reply.code(400).send({ error: 'Duplicate payment detected' })
      }

      await withTransaction(async (client) => {
        const txR = await client.query(
          `INSERT INTO finance_transactions (date, amount, direction, money_source_id, lead_id, is_overhead, category_id, note, transaction_type)
           VALUES ($1, $2, 'in', $3, $4, false, $5, $6, 'invoice_payment')
           RETURNING id`,
          [txDate, amount, moneySourceId, invR.rows[0].lead_id, categoryId, txNote]
        )
        const trxId = txR.rows[0].id

        const paymentR = await client.query(
          `INSERT INTO invoice_payments (invoice_id, finance_transaction_id, amount_applied)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [invoiceId, trxId, amount]
        )

        const paymentId = paymentR.rows[0]?.id
        if (paymentId) {
          const base = `INV-${invR.rows[0].lead_id}-P${paymentId}`
          await assignReferenceCode(client, trxId, base)
        }
      })

      await updateInvoiceStatusAsync(invoiceId)
      void recalculateAccountBalances()
      return { success: true }
    } catch (err) {
      if (err?.code === '23505') {
        return reply.code(400).send({ error: 'This transaction is already mapped to this invoice' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to apply payment' })
    }
  })


}
