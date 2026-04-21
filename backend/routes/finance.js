module.exports = async function(api, opts) {
  const {
    ALLOWED_COMPOUND_TLDS, ALLOWED_EMAIL_TLDS, ALLOWED_ORIGINS, AUTH_COOKIE, AUTH_SECRET, COMMON_EMAIL_DOMAINS, COVERAGE_SCOPES, DEV_ORIGINS, EMAIL_TYPO_MAP, FOLLOWUP_TYPES, HEAT_VALUES, LEAD_STATUSES, PHOTO_UPLOAD_DIR, PROD_ORIGIN, PROTECTED_ADMIN_EMAIL, PUBLIC_API_PATHS, UPLOADS_DIR, VIDEO_UPLOAD_DIR, addDaysToYMD, addDaysYMD, apiRoutes, assignReferenceCode, boolToYesNo, canonicalizeEmail, canonicalizeInstagram, canonicalizePhone, classifyDeviceType, clearAuthCookie, createNotification, dateToYMD, detectBrowser, detectPlatform, ensureDirectory, fetchProfitProjectRows, formatName, formatRefDate, getAuthFromRequest, getAvailableFyLabels, getClientInfo, getCurrentFyLabel, getDateRange, getFirstName, getFyLabelFromDate, getFyRange, getImageContentType, getNextLeadNumber, getOrCreateCity, getRoundRobinSalesUserId, getUserDisplayName, hasAllEventTimes, hasAnyEvent, hasEventInPrimaryCity, hasEventsForAllCities, hasPrimaryCity, hashPassword, isProtectedAdminUser, isValidInstagramUsername, listFyLabelsBetween, logAdminAudit, logLeadActivity, normalizeDateValue, normalizeEmailInput, normalizeInstagramUrl, normalizeLeadRow, normalizeLeadRows, normalizeNickname, normalizePhone, normalizeYMD, parseCookies, parseDataUrl, parseFyLabel, recalculateAccountBalances, recomputeLeadMetrics, recomputeUserMetrics, recomputeUserMetricsRange, requireAdmin, requireAuth, requireVendor, resolveUserDisplayName, runMetricsJob, sanitizeTags, setAuthCookie, signToken, startOfDay, toISTDateString, validateEmail, verifyPassword, verifyToken, yesNoToBool, pool
  } = opts;

  /* ===================== FINANCE ===================== */
  const parseId = (value) => {
    const num = Number(value)
    if (!Number.isFinite(num) || num <= 0) return null
    return Math.floor(num)
  }

  const parseBool = (value) => {
    if (value === true || value === false) return value
    if (value === 1 || value === 0) return Boolean(value)
    const normalized = String(value || '').trim().toLowerCase()
    if (['1', 'true', 'yes', 'y'].includes(normalized)) return true
    if (['0', 'false', 'no', 'n'].includes(normalized)) return false
    return null
  }

  const normalizeName = (value) => {
    const trimmed = String(value || '').trim()
    return trimmed || null
  }

  const normalizeMoneySourceType = (value) => {
    const type = String(value || '').trim().toUpperCase()
    if (['GST', 'NON_GST', 'CASH', 'PERSONAL'].includes(type)) return type
    return null
  }

  const normalizeDirection = (value) => {
    const dir = String(value || '').trim().toLowerCase()
    return dir === 'in' || dir === 'out' ? dir : null
  }

  const getMonthStart = (value) => {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${year}-${month}-01`
  }

  const withTransaction = async (work) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      try { await client.query('ROLLBACK') } catch (_) { }
      throw err
    } finally {
      client.release()
    }
  }

  const getVendorBillInfo = async (client, billId, excludeTxId = null) => {
    const r = await client.query(
      `
      SELECT
        vb.id,
        vb.status,
        vb.bill_amount,
        COALESCE(paid.total_paid, 0) as total_paid
      FROM vendor_bills vb
      LEFT JOIN (
        SELECT vendor_bill_id, SUM(amount) as total_paid
        FROM finance_transactions
        WHERE vendor_bill_id IS NOT NULL
          AND is_deleted = false
          AND ($2::int IS NULL OR id <> $2)
        GROUP BY vendor_bill_id
      ) paid ON paid.vendor_bill_id = vb.id
      WHERE vb.id = $1
      `,
      [billId, excludeTxId]
    )
    if (!r.rows.length) return null
    const row = r.rows[0]
    return {
      id: row.id,
      status: row.status,
      bill_amount: Number(row.bill_amount),
      total_paid: Number(row.total_paid),
      remaining: Number(row.bill_amount) - Number(row.total_paid || 0),
    }
  }

  const markVendorBillPaidIfComplete = async (client, billId) => {
    const r = await client.query(
      `
      SELECT
        vb.status,
        vb.bill_amount,
        COALESCE(paid.total_paid, 0) as total_paid
      FROM vendor_bills vb
      LEFT JOIN (
        SELECT vendor_bill_id, SUM(amount) as total_paid
        FROM finance_transactions
        WHERE vendor_bill_id = $1 AND is_deleted = false
        GROUP BY vendor_bill_id
      ) paid ON paid.vendor_bill_id = vb.id
      WHERE vb.id = $1
      `,
      [billId]
    )
    if (!r.rows.length) return
    const row = r.rows[0]
    if (row.status !== 'approved') return
    if (Number(row.total_paid || 0) >= Number(row.bill_amount || 0)) {
      await client.query(`UPDATE vendor_bills SET status = 'paid' WHERE id = $1`, [billId])
    }
  }

  const formatFinanceRow = async (id) => {
    const r = await pool.query(
      `
      SELECT
        t.*,
        ms.name AS money_source_name,
        c.name AS category_name,
        l.name AS lead_name,
        l.lead_number AS lead_number
      FROM finance_transactions t
      JOIN money_sources ms ON ms.id = t.money_source_id
      LEFT JOIN finance_categories c ON c.id = t.category_id
      LEFT JOIN leads l ON l.id = t.lead_id
      WHERE t.id = $1
      `,
      [id]
    )
    return r.rows[0] || null
  }

  api.get('/finance/leads/search', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const q = (req.query.q || '').trim()
    if (!q) return []
    const limit = Number(req.query.limit) || 10
    const finalLimit = Math.min(Math.max(limit, 1), 15)

    const isNumeric = /^\\d+$/.test(q)
    let numericCondition = ''
    if (isNumeric) {
      numericCondition = `OR l.id::text ILIKE $1 OR l.lead_number::text ILIKE $1`
    }

    try {
      const r = await pool.query(
        `
          SELECT l.id, l.lead_number, l.name, l.bride_name, l.groom_name, l.phone_primary,
                 (SELECT e.event_date FROM lead_events e WHERE e.lead_id = l.id AND e.event_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date ORDER BY e.event_date ASC LIMIT 1) as next_event_date
          FROM leads l
          WHERE l.status = 'Converted' AND (
            l.name ILIKE $1 OR
            l.bride_name ILIKE $1 OR
            l.groom_name ILIKE $1 OR
            l.phone_primary ILIKE $1 OR
            l.phone_secondary ILIKE $1 OR
            l.bride_phone_primary ILIKE $1 OR
            l.bride_phone_secondary ILIKE $1 OR
            l.groom_phone_primary ILIKE $1 OR
            l.groom_phone_secondary ILIKE $1
            ${numericCondition}
          )
          ORDER BY next_event_date ASC NULLS LAST, l.created_at DESC
          LIMIT $2
          `,
        [`%${q}%`, finalLimit]
      )
      return r.rows
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to search leads' })
    }
  })

  api.get('/finance/money-sources', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const r = await pool.query(
        `SELECT id, name, type, is_active, created_at, updated_at
         FROM money_sources
         ORDER BY name ASC, id ASC`
      )
      return r.rows
    } catch (err) {
      if (err?.code === '42703') {
        const fallback = await pool.query(
          `SELECT id, name, created_at, updated_at
           FROM money_sources
           ORDER BY name ASC, id ASC`
        )
        return fallback.rows
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load money sources' })
    }
  })

  api.post('/finance/money-sources', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const name = normalizeName(req.body?.name)
    if (!name) return reply.code(400).send({ error: 'Name is required' })
    const type = normalizeMoneySourceType(req.body?.type)
    if (!type) return reply.code(400).send({ error: 'Type is required' })
    const isActive = parseBool(req.body?.is_active)
    const activeValue = isActive === null ? true : isActive
    try {
      const r = await pool.query(
        `INSERT INTO money_sources (name, type, is_active)
         VALUES ($1, $2, $3)
         RETURNING id, name, type, is_active, created_at, updated_at`,
        [name, type, activeValue]
      )
      return r.rows[0]
    } catch (err) {
      if (err?.code === '42703') {
        const fallback = await pool.query(
          `INSERT INTO money_sources (name) VALUES ($1) RETURNING id, name, created_at, updated_at`,
          [name]
        )
        return fallback.rows[0]
      }
      if (err?.code === '23505') {
        return reply.code(400).send({ error: 'Money source already exists' })
      }
      if (err?.code === '23514') {
        return reply.code(400).send({ error: 'Invalid money source type' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to add money source' })
    }
  })

  api.patch('/finance/money-sources/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params?.id)
    if (!id) return reply.code(400).send({ error: 'Invalid money source id' })
    const name = normalizeName(req.body?.name)
    const type = normalizeMoneySourceType(req.body?.type)
    const isActive = parseBool(req.body?.is_active)

    const updates = []
    const values = []
    let paramIndex = 1

    if (name) {
      updates.push(`name = $${paramIndex++}`)
      values.push(name)
    }
    if (type) {
      updates.push(`type = $${paramIndex++}`)
      values.push(type)
    }
    if (isActive !== null) {
      updates.push(`is_active = $${paramIndex++}`)
      values.push(isActive)
    }

    if (!updates.length) {
      return reply.code(400).send({ error: 'No fields to update' })
    }

    updates.push('updated_at = NOW()')
    values.push(id)

    try {
      const r = await pool.query(
        `UPDATE money_sources
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, name, type, is_active, created_at, updated_at`,
        values
      )
      if (!r.rows.length) return reply.code(404).send({ error: 'Money source not found' })
      return r.rows[0]
    } catch (err) {
      if (err?.code === '42703') {
        if (!name) return reply.code(400).send({ error: 'Name is required' })
        const fallback = await pool.query(
          `UPDATE money_sources
           SET name = $1, updated_at = NOW()
           WHERE id = $2
           RETURNING id, name, created_at, updated_at`,
          [name, id]
        )
        if (!fallback.rows.length) return reply.code(404).send({ error: 'Money source not found' })
        return fallback.rows[0]
      }
      if (err?.code === '23505') {
        return reply.code(400).send({ error: 'Money source already exists' })
      }
      if (err?.code === '23514') {
        return reply.code(400).send({ error: 'Invalid money source type' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to update money source' })
    }
  })

  api.get('/finance/categories', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const r = await pool.query(
      `SELECT id, name, created_at, updated_at
       FROM finance_categories
       ORDER BY name ASC, id ASC`
    )
    return r.rows
  })

  api.post('/finance/categories', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const name = normalizeName(req.body?.name)
    if (!name) return reply.code(400).send({ error: 'Name is required' })
    const r = await pool.query(
      `INSERT INTO finance_categories (name) VALUES ($1) RETURNING id, name, created_at, updated_at`,
      [name]
    )
    return r.rows[0]
  })

  api.patch('/finance/categories/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params?.id)
    if (!id) return reply.code(400).send({ error: 'Invalid category id' })
    const name = normalizeName(req.body?.name)
    if (!name) return reply.code(400).send({ error: 'Name is required' })
    const r = await pool.query(
      `UPDATE finance_categories
       SET name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, created_at, updated_at`,
      [name, id]
    )
    if (!r.rows.length) return reply.code(404).send({ error: 'Category not found' })
    return r.rows[0]
  })

  api.get('/finance/transactions', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const q = req.query || {}
    const where = []
    const params = []
    const addParam = (value) => {
      params.push(value)
      return `$${params.length}`
    }
    const leadId = parseId(q.lead_id)
    if (leadId) where.push(`t.lead_id = ${addParam(leadId)}`)
    const sourceId = parseId(q.money_source_id)
    if (sourceId) where.push(`t.money_source_id = ${addParam(sourceId)}`)
    const vendorId = parseId(q.vendor_id)
    if (vendorId) where.push(`t.vendor_bill_id IN (SELECT id FROM vendor_bills WHERE vendor_id = ${addParam(vendorId)})`)
    const categoryId = parseId(q.category_id)
    if (categoryId) where.push(`t.category_id = ${addParam(categoryId)}`)
    const dir = normalizeDirection(q.direction)
    if (dir) where.push(`t.direction = ${addParam(dir)}`)
    const overheadFlag = parseBool(q.is_overhead)
    if (overheadFlag !== null) where.push(`t.is_overhead = ${addParam(overheadFlag)}`)
    const includeTransfers = parseBool(q.include_transfers)
    if (includeTransfers !== true) where.push(`t.is_transfer = false`)
    const showDeletedFlag = parseBool(q.show_deleted)
    if (showDeletedFlag !== true) where.push(`t.is_deleted = false`)
    const referenceQuery = q.reference_code ? String(q.reference_code).trim() : ''
    if (referenceQuery) where.push(`t.reference_code ILIKE ${addParam(`%${referenceQuery}%`)}`)

    const dateFrom = normalizeDateValue(q.date_from)
    if (dateFrom) where.push(`t.date >= ${addParam(dateFrom)}`)
    const dateTo = normalizeDateValue(q.date_to)
    if (dateTo) where.push(`t.date <= ${addParam(dateTo)}`)
    const limit = parseId(q.limit)
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const limitClause = limit ? `LIMIT ${addParam(limit)}` : ''
    const r = await pool.query(
      `
      SELECT
        t.*,
        ms.name AS money_source_name,
        c.name AS category_name,
        l.name AS lead_name,
        l.lead_number AS lead_number
      FROM finance_transactions t
      JOIN money_sources ms ON ms.id = t.money_source_id
      LEFT JOIN finance_categories c ON c.id = t.category_id
      LEFT JOIN leads l ON l.id = t.lead_id
      ${whereClause}
      ORDER BY t.date DESC, t.created_at DESC
      ${limitClause}
      `,
      params
    )
    return r.rows
  })

  api.get('/finance/totals', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { group_by } = req.query || {}
    try {
      if (group_by === 'lead') {
        const r = await pool.query(`
          SELECT 
            t.lead_id, 
            l.name AS lead_name, 
            l.lead_number,
            SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE 0 END) as total_in,
            SUM(CASE WHEN t.direction = 'out' THEN t.amount ELSE 0 END) as total_out
          FROM finance_transactions t
          JOIN leads l ON l.id = t.lead_id
          WHERE t.is_deleted = false AND t.is_transfer = false AND t.lead_id IS NOT NULL
          GROUP BY t.lead_id, l.name, l.lead_number
          ORDER BY l.name ASC
        `);
        return r.rows
      } else if (group_by === 'source') {
        const r = await pool.query(`
          SELECT 
            t.money_source_id, 
            ms.name AS source_name,
            SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE 0 END) as total_in,
            SUM(CASE WHEN t.direction = 'out' THEN t.amount ELSE 0 END) as total_out
          FROM finance_transactions t
          JOIN money_sources ms ON ms.id = t.money_source_id
          WHERE t.is_deleted = false AND t.is_transfer = false
          GROUP BY t.money_source_id, ms.name
          ORDER BY ms.name ASC
        `);
        return r.rows
      } else if (group_by === 'month') {
        const r = await pool.query(`
          SELECT 
            TO_CHAR(DATE_TRUNC('month', t.date), 'YYYY-MM') AS month,
            SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE 0 END) as total_in,
            SUM(CASE WHEN t.direction = 'out' THEN t.amount ELSE 0 END) as total_out,
            SUM(CASE WHEN t.transaction_type = 'overhead' AND t.direction = 'in' THEN t.amount ELSE 0 END) as overhead_in,
            SUM(CASE WHEN t.transaction_type = 'overhead' AND t.direction = 'out' THEN t.amount ELSE 0 END) as overhead_out
          FROM finance_transactions t
          WHERE t.is_deleted = false AND t.is_transfer = false
          GROUP BY DATE_TRUNC('month', t.date)
          ORDER BY month DESC
        `);
        return r.rows
      }
      return reply.code(400).send({ error: 'Invalid group_by parameter' })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch totals' })
    }
  })

  api.post('/finance/transactions', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const body = req.body || {}
    const date = normalizeDateValue(body.date)
    if (!date) return reply.code(400).send({ error: 'Valid date is required' })
    const amountNum = Number(body.amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return reply.code(400).send({ error: 'Valid positive amount is required' })
    }
    const direction = normalizeDirection(body.direction)
    if (!direction) return reply.code(400).send({ error: 'Direction in or out is required' })
    const moneySourceId = parseId(body.money_source_id)
    if (!moneySourceId) return reply.code(400).send({ error: 'Money source is required' })
    let leadId = parseId(body.lead_id) || null
    let isOverhead = parseBool(body.is_overhead) || false
    if (!leadId && !isOverhead) {
      return reply.code(400).send({ error: 'Provide a lead or check overhead' })
    }
    if (leadId && isOverhead) {
      return reply.code(400).send({ error: 'Cannot specify both lead and overhead' })
    }
    let categoryId = parseId(body.category_id) || null
    const note = (body.note || '').trim() || null
    const isTransferFlag = parseBool(body.is_transfer)
    if (isTransferFlag) {
      return reply.code(400).send({ error: 'Use transfers endpoint for internal transfers' })
    }

    const vendorBillIdRaw = body.vendor_bill_id
    const vendorBillId = vendorBillIdRaw !== undefined ? parseId(vendorBillIdRaw) : null
    if (vendorBillIdRaw !== undefined && !vendorBillId) {
      return reply.code(400).send({ error: 'Invalid vendor_bill_id' })
    }
    if (body.employee_payout_id !== undefined) {
      return reply.code(400).send({ error: 'employee_payout_id is not supported in finance transactions' })
    }
    if (vendorBillId && direction !== 'out') {
      return reply.code(400).send({ error: 'Only OUT transactions can be linked to vendor bills' })
    }
    if (isOverhead && !categoryId) {
      return reply.code(400).send({ error: 'Category is required for overhead transactions' })
    }

    let transactionType = null
    let referenceBase = null
    if (vendorBillId) {
      transactionType = 'vendor_payment'
      referenceBase = `VENDOR-${vendorBillId}`
    } else if (isOverhead) {
      transactionType = 'overhead'
      referenceBase = `OH-${categoryId}-${formatRefDate(date)}`
    } else if (direction === 'in' && leadId) {
      return reply.code(400).send({ error: 'Use invoice payment flow for client payments' })
    } else {
      return reply.code(400).send({ error: 'Unsupported transaction type' })
    }

    try {
      if (vendorBillId) {
        const dupR = await pool.query(
          `
          SELECT 1
          FROM finance_transactions
          WHERE vendor_bill_id = $1
            AND amount = $2
            AND date = $3
            AND is_deleted = false
          LIMIT 1
          `,
          [vendorBillId, amountNum, date]
        )
        if (dupR.rows.length) {
          return reply.code(400).send({ error: 'Duplicate vendor payment detected' })
        }
      }

      const result = await withTransaction(async (client) => {
        if (vendorBillId) {
          const billInfo = await getVendorBillInfo(client, vendorBillId, null)
          if (!billInfo) throw { code: 'BILL_NOT_FOUND' }
          if (billInfo.status !== 'approved') throw { code: 'BILL_NOT_APPROVED' }
          if (amountNum > billInfo.remaining) throw { code: 'BILL_AMOUNT_EXCEEDS' }
        }
        const r = await client.query(
          `INSERT INTO finance_transactions (date, amount, direction, money_source_id, lead_id, is_overhead, category_id, note, vendor_bill_id, transaction_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [date, amountNum, direction, moneySourceId, leadId, isOverhead, categoryId, note, vendorBillId || null, transactionType]
        )
        const tx = r.rows[0]

        if (referenceBase) {
          await assignReferenceCode(client, tx.id, referenceBase)
        }

        if (vendorBillId) {
          await client.query(
            `INSERT INTO finance_transaction_audits (transaction_id, field, old_value, new_value, edited_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [tx.id, 'vendor_bill_id', null, String(vendorBillId), auth.user.id]
          )
          await markVendorBillPaidIfComplete(client, vendorBillId)

          const billVendorRes = await client.query('SELECT vendor_id FROM vendor_bills WHERE id = $1', [vendorBillId])
          if (billVendorRes.rows.length) {
            await createNotification({
              userId: billVendorRes.rows[0].vendor_id,
              title: 'Payment Recorded 💸',
              message: `A payment of ₹${amountNum} was recorded for your bill.`,
              category: 'VENDOR',
              type: 'SUCCESS',
              linkUrl: '/vendor/payments'
            }, client)
          }
        }

        return tx
      })

      void recalculateAccountBalances()
      return result
    } catch (err) {
      if (err?.code === '23503') {
        return reply.code(400).send({ error: 'Invalid money source, category, or lead' })
      }
      if (err?.code === '23514') {
        return reply.code(400).send({ error: 'Lead and overhead selection is invalid' })
      }
      if (err?.code === 'BILL_NOT_FOUND') {
        return reply.code(404).send({ error: 'Bill not found' })
      }
      if (err?.code === 'BILL_NOT_APPROVED') {
        return reply.code(400).send({ error: 'Bill must be approved before linking' })
      }
      if (err?.code === 'BILL_AMOUNT_EXCEEDS') {
        return reply.code(400).send({ error: 'Amount exceeds remaining bill amount' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to create transaction' })
    }
  })

  api.patch('/finance/transactions/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params?.id)
    if (!id) return reply.code(400).send({ error: 'Invalid transaction id' })

    const body = req.body || {}
    const amountNum = body.amount !== undefined ? Number(body.amount) : undefined
    if (amountNum !== undefined && (!Number.isFinite(amountNum) || amountNum <= 0)) {
      return reply.code(400).send({ error: 'Valid positive amount is required' })
    }
    if (body.vendor_bill_id !== undefined || body.employee_payout_id !== undefined) {
      return reply.code(400).send({ error: 'Editing bill/payout links is not supported' })
    }
    let categoryId = body.category_id !== undefined ? (parseId(body.category_id) || null) : undefined
    let note = body.note !== undefined ? ((body.note || '').trim() || null) : undefined

    try {
      const result = await withTransaction(async (client) => {
        const currentTx = await client.query(
          `SELECT * FROM finance_transactions WHERE id = $1 AND is_deleted = false FOR UPDATE`,
          [id]
        )
        if (!currentTx.rows.length) {
          const err = new Error('Not found')
          err.code = 'TX_NOT_FOUND'
          throw err
        }

        const oldValues = currentTx.rows[0]
        if (oldValues.is_transfer) {
          const err = new Error('Transfer transactions cannot be edited')
          err.code = 'TX_IS_TRANSFER'
          throw err
        }
        const oldAmount = Number(oldValues.amount)
        const nextAmount = amountNum !== undefined ? amountNum : oldAmount

        const updates = []
        const values = []
        const audits = []

        if (amountNum !== undefined && amountNum !== oldAmount) {
          audits.push({ field: 'amount', old: String(oldValues.amount), new: String(amountNum) })
          values.push(amountNum)
          updates.push(`amount = $${values.length}`)
        }
        if (categoryId !== undefined && categoryId !== oldValues.category_id) {
          audits.push({ field: 'category_id', old: oldValues.category_id !== null ? String(oldValues.category_id) : 'null', new: categoryId !== null ? String(categoryId) : 'null' })
          values.push(categoryId)
          updates.push(`category_id = $${values.length}`)
        }
        if (note !== undefined && note !== oldValues.note) {
          audits.push({ field: 'note', old: oldValues.note || 'null', new: note || 'null' })
          values.push(note)
          updates.push(`note = $${values.length}`)
        }

        if (oldValues.vendor_bill_id) {
          const billInfo = await getVendorBillInfo(client, oldValues.vendor_bill_id, id)
          if (billInfo && nextAmount > billInfo.remaining) {
            const err = new Error('Amount exceeds remaining')
            err.code = 'BILL_AMOUNT_EXCEEDS'
            throw err
          }
        }

        if (updates.length) {
          values.push(id)
          values.push(auth.user.id)
          updates.push(`updated_at = NOW()`)
          updates.push(`updated_by = $${values.length}`)

          await client.query(
            `UPDATE finance_transactions
             SET ${updates.join(', ')}
             WHERE id = $${values.length - 1}`,
            values
          )
        }

        if (oldValues.vendor_bill_id) {
          await markVendorBillPaidIfComplete(client, oldValues.vendor_bill_id)
        }

        for (const audit of audits) {
          await client.query(
            `INSERT INTO finance_transaction_audits (transaction_id, field, old_value, new_value, edited_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, audit.field, audit.old, audit.new, auth.user.id]
          )
        }

        const refreshed = await client.query(`SELECT * FROM finance_transactions WHERE id = $1`, [id])
        return refreshed.rows[0]
      })

      return result
    } catch (err) {
      if (err?.code === 'TX_NOT_FOUND') {
        return reply.code(404).send({ error: 'Transaction not found or deleted' })
      }
      if (err?.code === 'TX_IS_TRANSFER') {
        return reply.code(400).send({ error: 'Transfer transactions cannot be edited' })
      }
      if (err?.code === 'BILL_NOT_FOUND') {
        return reply.code(404).send({ error: 'Bill not found' })
      }
      if (err?.code === 'BILL_NOT_APPROVED') {
        return reply.code(400).send({ error: 'Bill must be approved before linking' })
      }
      if (err?.code === 'BILL_AMOUNT_EXCEEDS') {
        return reply.code(400).send({ error: 'Amount exceeds remaining bill amount' })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to update transaction' })
    }
  })

  api.delete('/finance/transactions/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params?.id)
    if (!id) return reply.code(400).send({ error: 'Invalid transaction id' })

    try {
      const existing = await pool.query(`SELECT id, is_transfer FROM finance_transactions WHERE id = $1`, [id])
      if (!existing.rows.length) return reply.code(404).send({ error: 'Transaction not found' })
      if (existing.rows[0].is_transfer) {
        return reply.code(400).send({ error: 'Use transfer delete for transfer transactions' })
      }
      const r = await pool.query(
        `UPDATE finance_transactions 
         SET is_deleted = true, updated_at = NOW(), updated_by = $1
         WHERE id = $2
         RETURNING id, is_deleted`,
        [auth.user.id, id]
      )
      if (!r.rows.length) return reply.code(404).send({ error: 'Transaction not found' })
      void recalculateAccountBalances()
      return { success: true }
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to delete transaction' })
    }
  })


}
