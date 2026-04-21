module.exports = async function(api, opts) {
  const {
    requireAdmin,
    normalizeDateValue,
    dateToYMD,
    pool,
  } = opts;

  /* ===================== FINANCE — ACCOUNT BALANCES v1 ===================== */

  api.get('/finance/balances', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const asOf = normalizeDateValue(req.query?.as_of) || dateToYMD(new Date())
    const today = dateToYMD(new Date())
    try {
      if (asOf === today) {
        try {
          const { rows } = await pool.query(
            `
            SELECT
              ms.id as money_source_id,
              ms.name,
              ms.type as account_type,
              COALESCE(fab.balance, 0) as balance,
              (
                SELECT MAX(t.date)
                FROM finance_transactions t
                WHERE t.money_source_id = ms.id
                  AND t.is_deleted = false
                  AND t.date <= $1
              ) as last_transaction_date
            FROM money_sources ms
            LEFT JOIN finance_account_balances fab ON fab.money_source_id = ms.id
            ORDER BY balance DESC, ms.name ASC
            `,
            [asOf]
          )
          return rows
        } catch (err) {
          if (err?.code !== '42P01') throw err
        }
      }
      const queryWithType = `
        SELECT
          ms.id as money_source_id,
          ms.name,
          ms.type as account_type,
          COALESCE(SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE -t.amount END), 0) as balance,
          MAX(t.date) as last_transaction_date
        FROM money_sources ms
        LEFT JOIN finance_transactions t
          ON t.money_source_id = ms.id
         AND t.is_deleted = false
         AND t.date <= $1
        GROUP BY ms.id, ms.name, ms.type
        ORDER BY balance DESC, ms.name ASC
      `
      const { rows } = await pool.query(queryWithType, [asOf])
      return rows
    } catch (err) {
      if (err?.code === '42703') {
        const fallback = await pool.query(
          `
          SELECT
            ms.id as money_source_id,
            ms.name,
            NULL::text as account_type,
            COALESCE(SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE -t.amount END), 0) as balance,
            MAX(t.date) as last_transaction_date
          FROM money_sources ms
          LEFT JOIN finance_transactions t
            ON t.money_source_id = ms.id
           AND t.is_deleted = false
           AND t.date <= $1
          GROUP BY ms.id, ms.name
          ORDER BY balance DESC, ms.name ASC
          `,
          [asOf]
        )
        return fallback.rows
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load balances' })
    }
  })

  api.get('/finance/balances/:money_source_id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const sourceId = parseId(req.params?.money_source_id)
    if (!sourceId) return reply.code(400).send({ error: 'Invalid money source id' })
    const fromDate = normalizeDateValue(req.query?.from_date)
    const toDate = normalizeDateValue(req.query?.to_date)
    const where = ['t.money_source_id = $1', 't.is_deleted = false']
    const params = [sourceId]
    if (fromDate) {
      params.push(fromDate)
      where.push(`t.date >= $${params.length}`)
    }
    if (toDate) {
      params.push(toDate)
      where.push(`t.date <= $${params.length}`)
    }
    try {
      let accountRow = null
      try {
        const accountR = await pool.query(
          `SELECT id, name, type FROM money_sources WHERE id = $1`,
          [sourceId]
        )
        if (!accountR.rows.length) return reply.code(404).send({ error: 'Money source not found' })
        accountRow = accountR.rows[0]
      } catch (err) {
        if (err?.code === '42703') {
          const fallback = await pool.query(
            `SELECT id, name FROM money_sources WHERE id = $1`,
            [sourceId]
          )
          if (!fallback.rows.length) return reply.code(404).send({ error: 'Money source not found' })
          accountRow = { ...fallback.rows[0], type: null }
        } else {
          throw err
        }
      }

      const ledgerR = await pool.query(
        `
        SELECT
          t.id,
          t.date,
          t.direction,
          t.amount,
          t.note,
          t.is_transfer,
          t.transfer_group_id,
          t.created_at,
          cp.name as counterparty_name
        FROM finance_transactions t
        LEFT JOIN finance_transactions t2
          ON t.is_transfer = true
         AND t.transfer_group_id IS NOT NULL
         AND t2.transfer_group_id = t.transfer_group_id
         AND t2.money_source_id <> t.money_source_id
         AND t2.is_deleted = false
        LEFT JOIN money_sources cp ON cp.id = t2.money_source_id
        WHERE ${where.join(' AND ')}
        ORDER BY t.date ASC, t.created_at ASC, t.id ASC
        `,
        params
      )

      let running = 0
      const ledger = ledgerR.rows.map(row => {
        const amt = Number(row.amount || 0)
        if (row.direction === 'in') running += amt
        else running -= amt
        return {
          date: row.date,
          direction: row.direction,
          amount: row.amount,
          note: row.note,
          is_transfer: row.is_transfer,
          transfer_group_id: row.transfer_group_id,
          counterparty_name: row.counterparty_name,
          running_balance: running
        }
      })

      return {
        account: {
          money_source_id: accountRow.id,
          name: accountRow.name,
          account_type: accountRow.type || null
        },
        ledger
      }
    } catch (err) {
      if (err?.code === '42703') {
        req.log.error(err)
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load ledger' })
    }
  })

  api.get('/finance/ledger-audit', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const missingTypeR = await pool.query(
        `SELECT COUNT(*)::int as count FROM finance_transactions WHERE is_deleted = false AND transaction_type IS NULL`
      )

      const orphanR = await pool.query(
        `
        SELECT COUNT(*)::int as count
        FROM finance_transactions
        WHERE is_deleted = false
          AND (
            transaction_type IS NULL
            OR (transaction_type = 'invoice_payment' AND lead_id IS NULL)
            OR (transaction_type = 'vendor_payment' AND vendor_bill_id IS NULL)
            OR (transaction_type = 'payroll' AND user_id IS NULL)
            OR (transaction_type = 'overhead' AND (is_overhead = false OR category_id IS NULL))
            OR (transaction_type = 'transfer' AND transfer_group_id IS NULL)
          )
        `
      )

      const duplicateInvoiceR = await pool.query(
        `
        SELECT ip.invoice_id, ft.date, ft.amount, COUNT(*)::int as count
        FROM invoice_payments ip
        JOIN finance_transactions ft ON ft.id = ip.finance_transaction_id
        WHERE ft.is_deleted = false
        GROUP BY ip.invoice_id, ft.date, ft.amount
        HAVING COUNT(*) > 1
        ORDER BY count DESC, ft.date DESC
        LIMIT 20
        `
      )

      const duplicateVendorR = await pool.query(
        `
        SELECT vendor_bill_id, date, amount, COUNT(*)::int as count
        FROM finance_transactions
        WHERE vendor_bill_id IS NOT NULL
          AND is_deleted = false
        GROUP BY vendor_bill_id, date, amount
        HAVING COUNT(*) > 1
        ORDER BY count DESC, date DESC
        LIMIT 20
        `
      )

      const transferMismatchR = await pool.query(
        `
        SELECT transfer_group_id, COUNT(*)::int as count
        FROM finance_transactions
        WHERE is_transfer = true
          AND is_deleted = false
          AND transfer_group_id IS NOT NULL
        GROUP BY transfer_group_id
        HAVING COUNT(*) != 2
        ORDER BY count DESC
        LIMIT 20
        `
      )

      return reply.send({
        missing_transaction_type: missingTypeR.rows[0]?.count || 0,
        orphan_transactions: orphanR.rows[0]?.count || 0,
        duplicate_invoice_payments: duplicateInvoiceR.rows || [],
        duplicate_vendor_payments: duplicateVendorR.rows || [],
        transfer_group_mismatches: transferMismatchR.rows || [],
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to run ledger audit' })
    }
  })


}
