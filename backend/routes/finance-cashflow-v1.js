module.exports = async function(api, opts) {
  const {
    requireAdmin,
    normalizeDateValue,
    dateToYMD,
    pool,
  } = opts;

  /* ===================== FINANCE — CASHFLOW v1 ===================== */

  api.get('/finance/cashflow', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const parseMonthStart = (value) => {
      if (!value) return null
      const trimmed = String(value).trim()
      let candidate = trimmed
      if (/^\d{4}-\d{2}$/.test(trimmed)) {
        candidate = `${trimmed}-01`
      } else if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        candidate = trimmed.slice(0, 10)
      } else {
        return null
      }
      const parsed = new Date(`${candidate}T00:00:00`)
      if (Number.isNaN(parsed.getTime())) return null
      const start = new Date(parsed.getFullYear(), parsed.getMonth(), 1)
      return dateToYMD(start)
    }

    const addMonths = (ymd, months) => {
      const base = new Date(`${ymd}T00:00:00`)
      if (Number.isNaN(base.getTime())) return null
      const next = new Date(base.getFullYear(), base.getMonth() + months, 1)
      return dateToYMD(next)
    }

    const buildMonthRange = (fromYmd, toYmd) => {
      const months = []
      const cursor = new Date(`${fromYmd}T00:00:00`)
      const end = new Date(`${toYmd}T00:00:00`)
      if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return months
      while (cursor <= end) {
        const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
        months.push(ym)
        cursor.setMonth(cursor.getMonth() + 1, 1)
      }
      return months
    }

    try {
      const sourceId = parseId(req.query?.money_source_id)
      const now = new Date()
      const defaultTo = dateToYMD(new Date(now.getFullYear(), now.getMonth(), 1))

      const fromParam = parseMonthStart(req.query?.from_month)
      const toParam = parseMonthStart(req.query?.to_month) || defaultTo
      const toStart = toParam

      const fromStart =
        fromParam ||
        dateToYMD(new Date(new Date(`${toStart}T00:00:00`).getFullYear(), new Date(`${toStart}T00:00:00`).getMonth() - 5, 1))

      if (!fromStart || !toStart) {
        return reply.code(400).send({ error: 'Invalid from_month or to_month' })
      }

      const rangeStart = fromStart
      const rangeEndExclusive = addMonths(toStart, 1)
      if (!rangeEndExclusive) return reply.code(400).send({ error: 'Invalid range' })

      const params = [rangeStart, rangeEndExclusive]
      let sourceFilter = ''
      if (sourceId) {
        params.push(sourceId)
        sourceFilter = ` AND money_source_id = $${params.length}`
      }

      const { rows } = await pool.query(
        `
        SELECT to_char(date_trunc('month', date), 'YYYY-MM') as month,
               SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END) as total_in,
               SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END) as total_out
        FROM finance_transactions
        WHERE is_deleted = false AND is_transfer = false AND date >= $1 AND date < $2${sourceFilter}
        GROUP BY month
        ORDER BY month DESC
        `,
        params
      )

      const dataByMonth = {}
      rows.forEach(r => {
        dataByMonth[r.month] = {
          month: r.month,
          total_in: Number(r.total_in || 0),
          total_out: Number(r.total_out || 0),
          net: Number(r.total_in || 0) - Number(r.total_out || 0)
        }
      })

      const monthList = buildMonthRange(rangeStart, toStart).reverse()
      const resultRows = monthList.map(month => {
        if (dataByMonth[month]) return dataByMonth[month]
        return { month, total_in: 0, total_out: 0, net: 0 }
      })

      const rowsWithData = rows
        .map(r => ({ month: r.month, total_out: Number(r.total_out || 0) }))
        .sort((a, b) => (a.month < b.month ? 1 : -1))

      const lastThree = rowsWithData.slice(0, 3)
      const avgMonthlyOut =
        lastThree.length === 0
          ? 0
          : lastThree.reduce((sum, r) => sum + r.total_out, 0) / lastThree.length

      return reply.send({
        rows: resultRows,
        summary: {
          avg_monthly_out: avgMonthlyOut
        }
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch cashflow' })
    }
  })

  api.get('/finance/expected-payments', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const parseMonthStart = (value) => {
      if (!value) return null
      const trimmed = String(value).trim()
      let candidate = trimmed
      if (/^\d{4}-\d{2}$/.test(trimmed)) {
        candidate = `${trimmed}-01`
      } else if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        candidate = trimmed.slice(0, 10)
      } else {
        return null
      }
      const parsed = new Date(`${candidate}T00:00:00`)
      if (Number.isNaN(parsed.getTime())) return null
      const start = new Date(parsed.getFullYear(), parsed.getMonth(), 1)
      return dateToYMD(start)
    }

    const addMonths = (ymd, months) => {
      const base = new Date(`${ymd}T00:00:00`)
      if (Number.isNaN(base.getTime())) return null
      const next = new Date(base.getFullYear(), base.getMonth() + months, 1)
      return dateToYMD(next)
    }

    try {
      const now = new Date()
      const defaultTo = dateToYMD(new Date(now.getFullYear(), now.getMonth(), 1))

      const fromParam = parseMonthStart(req.query?.from_month)
      const toParam = parseMonthStart(req.query?.to_month) || defaultTo
      if (!toParam) return reply.code(400).send({ error: 'Invalid to_month' })

      const fromStart = fromParam || dateToYMD(new Date(new Date(`${toParam}T00:00:00`).getFullYear(), new Date(`${toParam}T00:00:00`).getMonth() - 5, 1))
      if (!fromStart) return reply.code(400).send({ error: 'Invalid from_month' })

      const rangeStart = fromStart
      const rangeEndExclusive = addMonths(toParam, 1)
      if (!rangeEndExclusive) return reply.code(400).send({ error: 'Invalid range' })

      const { rows } = await pool.query(
        `
        WITH schedule_rows AS (
          SELECT s.invoice_id, s.due_date, s.amount
          FROM invoice_payment_schedule s
          JOIN invoices i ON i.id = s.invoice_id
          WHERE i.status NOT IN ('draft', 'cancelled')
        ),
        fallback_rows AS (
          SELECT i.id as invoice_id, i.due_date, i.total_amount as amount
          FROM invoices i
          WHERE i.status NOT IN ('draft', 'cancelled')
            AND i.due_date IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM invoice_payment_schedule s WHERE s.invoice_id = i.id
            )
        )
        SELECT to_char(date_trunc('month', due_date), 'YYYY-MM') as month,
               SUM(amount) as expected_total
        FROM (
          SELECT * FROM schedule_rows
          UNION ALL
          SELECT * FROM fallback_rows
        ) x
        WHERE due_date >= $1 AND due_date < $2
        GROUP BY month
        ORDER BY month
        `,
        [rangeStart, rangeEndExclusive]
      )

      const normalized = rows.map(r => ({
        month: r.month,
        expected_total: Number(r.expected_total || 0)
      }))

      return reply.send({ rows: normalized })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch expected payments' })
    }
  })

  api.get('/finance/expected-payments/range', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fromDate = normalizeDateValue(req.query?.from_date)
    const toDate = normalizeDateValue(req.query?.to_date)
    if (!fromDate || !toDate) {
      return reply.code(400).send({ error: 'from_date and to_date are required (YYYY-MM-DD)' })
    }

    try {
      const { rows } = await pool.query(
        `
        WITH schedule_rows AS (
          SELECT s.invoice_id, s.due_date, s.amount
          FROM invoice_payment_schedule s
          JOIN invoices i ON i.id = s.invoice_id
          WHERE i.status NOT IN ('draft', 'cancelled')
        ),
        fallback_rows AS (
          SELECT i.id as invoice_id, i.due_date, i.total_amount as amount
          FROM invoices i
          WHERE i.status NOT IN ('draft', 'cancelled')
            AND i.due_date IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM invoice_payment_schedule s WHERE s.invoice_id = i.id
            )
        )
        SELECT COALESCE(SUM(amount), 0) as total
        FROM (
          SELECT * FROM schedule_rows
          UNION ALL
          SELECT * FROM fallback_rows
        ) x
        WHERE due_date >= $1 AND due_date <= $2
        `,
        [fromDate, toDate]
      )

      return reply.send({ total: Number(rows[0]?.total || 0) })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch expected payments range' })
    }
  })

  api.post('/finance/cashflow/runway', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const balanceRaw = req.body?.current_cash_balance
    const balance = Number(balanceRaw)
    if (!Number.isFinite(balance) || balance < 0) {
      return reply.code(400).send({ error: 'current_cash_balance must be a valid number' })
    }

    try {
      const { rows } = await pool.query(
        `
        SELECT to_char(date_trunc('month', date), 'YYYY-MM') as month,
               SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END) as total_out
        FROM finance_transactions
        WHERE is_deleted = false AND is_transfer = false
        GROUP BY month
        ORDER BY month DESC
        LIMIT 3
        `
      )

      const totals = rows.map(r => Number(r.total_out || 0))
      const avgMonthlyOut = totals.length === 0 ? 0 : totals.reduce((a, b) => a + b, 0) / totals.length
      const runwayMonths = avgMonthlyOut > 0 ? balance / avgMonthlyOut : null

      return reply.send({
        avg_monthly_out: avgMonthlyOut,
        runway_months: runwayMonths
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to calculate runway' })
    }
  })


}
