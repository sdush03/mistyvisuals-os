module.exports = async function(api, opts) {
  const {
    getFyRange,
    requireAdmin,
    getAvailableFyLabels,
    getCurrentFyLabel,
    fetchProfitProjectRows,
    addDaysToYMD,
    pool,
  } = opts;

  /* ===================== REPORTING v1 ===================== */

  api.get('/reports/leads', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fyLabel = String(req.query?.fy || getCurrentFyLabel() || '').trim()
    const fyRange = getFyRange(fyLabel)
    if (!fyRange) return reply.code(400).send({ error: 'Invalid FY' })

    const status = req.query?.status ? String(req.query.status) : null
    const eventType = req.query?.event_type ? String(req.query.event_type) : null
    const cityName = req.query?.city ? String(req.query.city) : null
    const profitMin = req.query?.profit_min ? Number(req.query.profit_min) : null
    const profitMax = req.query?.profit_max ? Number(req.query.profit_max) : null

    try {
      const rows = await fetchProfitProjectRows({
        fyStart: fyRange.startDate,
        fyEndExclusive: addDaysToYMD(fyRange.endDate, 1),
        filters: {}
      })

      const leadIds = rows.map(r => r.lead_id)
      let metaMap = {}
      if (leadIds.length) {
        const metaR = await pool.query(
          `
          SELECT l.id,
                 l.event_type,
                 l.status,
                 COALESCE(primary_city.name, any_city.name) as city
          FROM leads l
          LEFT JOIN LATERAL (
            SELECT c.name
            FROM lead_cities lc
            JOIN cities c ON c.id = lc.city_id
            WHERE lc.lead_id = l.id AND lc.is_primary = true
            LIMIT 1
          ) primary_city ON true
          LEFT JOIN LATERAL (
            SELECT c.name
            FROM lead_cities lc
            JOIN cities c ON c.id = lc.city_id
            WHERE lc.lead_id = l.id
            ORDER BY lc.is_primary DESC, c.name ASC
            LIMIT 1
          ) any_city ON true
          WHERE l.id = ANY($1)
          `,
          [leadIds]
        )
        metaMap = metaR.rows.reduce((acc, row) => {
          acc[row.id] = row
          return acc
        }, {})
      }

      let leads = rows.map(row => {
        const revenue = Number(row.revenue || 0)
        const vendor = Number(row.vendor_cost || 0)
        const payroll = Number(row.payroll_overhead || 0)
        const infra = Number(row.infra_overhead || 0)
        const net = revenue - vendor - payroll - infra
        const profitPercent = revenue > 0 ? (net / revenue) * 100 : null
        const meta = metaMap[row.lead_id] || {}
        return {
          lead_id: row.lead_id,
          lead_number: row.lead_number,
          name: row.name,
          bride_name: row.bride_name,
          groom_name: row.groom_name,
          status: meta.status || row.status,
          event_type: meta.event_type || null,
          city: meta.city || null,
          revenue,
          vendor_cost: vendor,
          payroll_overhead: payroll,
          infra_overhead: infra,
          net_profit: net,
          profit_percent: profitPercent
        }
      })

      if (status) {
        leads = leads.filter(item => item.status === status)
      }
      if (eventType) {
        leads = leads.filter(item => item.event_type === eventType)
      }
      if (cityName) {
        leads = leads.filter(item => item.city && String(item.city).toLowerCase() === cityName.toLowerCase())
      }
      if (Number.isFinite(profitMin)) {
        leads = leads.filter(item => item.net_profit >= profitMin)
      }
      if (Number.isFinite(profitMax)) {
        leads = leads.filter(item => item.net_profit <= profitMax)
      }

      const availableFys = await getAvailableFyLabels()

      return reply.send({
        fy: fyRange.label,
        fy_range: { start: fyRange.startDate, end: fyRange.endDate },
        available_fys: availableFys,
        leads
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load lead report' })
    }
  })

  api.get('/reports/vendors', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fyLabel = String(req.query?.fy || getCurrentFyLabel() || '').trim()
    const fyRange = getFyRange(fyLabel)
    if (!fyRange) return reply.code(400).send({ error: 'Invalid FY' })

    try {
      const summaryR = await pool.query(
        `
        WITH paid_vendor AS (
          SELECT vb.id, vb.vendor_id, vb.lead_id, vb.bill_amount, vb.bill_category, MAX(ft.date)::date as paid_date
          FROM vendor_bills vb
          JOIN finance_transactions ft ON ft.vendor_bill_id = vb.id AND ft.is_deleted = false AND ft.is_transfer = false
          WHERE vb.status = 'paid'
          GROUP BY vb.id
        )
        SELECT v.id as vendor_id,
               v.name as vendor_name,
               v.vendor_type,
               SUM(pv.bill_amount) as total_paid,
               COUNT(pv.id) as bills_paid,
               COUNT(DISTINCT pv.lead_id) as projects_count
        FROM paid_vendor pv
        JOIN vendors v ON v.id = pv.vendor_id
        WHERE pv.paid_date >= $1 AND pv.paid_date < $2
        GROUP BY v.id, v.name, v.vendor_type
        ORDER BY total_paid DESC
        `,
        [fyRange.startDate, addDaysToYMD(fyRange.endDate, 1)]
      )

      const billsR = await pool.query(
        `
        WITH paid_vendor AS (
          SELECT vb.id, vb.vendor_id, vb.lead_id, vb.bill_amount, vb.bill_category, MAX(ft.date)::date as paid_date
          FROM vendor_bills vb
          JOIN finance_transactions ft ON ft.vendor_bill_id = vb.id AND ft.is_deleted = false AND ft.is_transfer = false
          WHERE vb.status = 'paid'
          GROUP BY vb.id
        )
        SELECT pv.vendor_id,
               pv.id as bill_id,
               pv.lead_id,
               pv.bill_amount,
               pv.bill_category,
               pv.paid_date,
               l.lead_number,
               l.name as lead_name
        FROM paid_vendor pv
        LEFT JOIN leads l ON l.id = pv.lead_id
        WHERE pv.paid_date >= $1 AND pv.paid_date < $2
        ORDER BY pv.paid_date DESC
        `,
        [fyRange.startDate, addDaysToYMD(fyRange.endDate, 1)]
      )

      const billMap = billsR.rows.reduce((acc, row) => {
        if (!acc[row.vendor_id]) acc[row.vendor_id] = []
        acc[row.vendor_id].push({
          bill_id: row.bill_id,
          lead_id: row.lead_id,
          lead_number: row.lead_number,
          lead_name: row.lead_name,
          amount: Number(row.bill_amount || 0),
          category: row.bill_category,
          paid_date: row.paid_date
        })
        return acc
      }, {})

      const vendors = summaryR.rows.map(row => {
        const totalPaid = Number(row.total_paid || 0)
        const billsPaid = Number(row.bills_paid || 0)
        return {
          vendor_id: row.vendor_id,
          vendor_name: row.vendor_name,
          vendor_type: row.vendor_type,
          total_paid: totalPaid,
          bills_paid: billsPaid,
          avg_bill_value: billsPaid > 0 ? totalPaid / billsPaid : 0,
          projects_count: Number(row.projects_count || 0),
          bills: billMap[row.vendor_id] || []
        }
      })

      const availableFys = await getAvailableFyLabels()

      return reply.send({
        fy: fyRange.label,
        fy_range: { start: fyRange.startDate, end: fyRange.endDate },
        available_fys: availableFys,
        vendors
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load vendor report' })
    }
  })

  api.get('/reports/employees', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fyLabel = String(req.query?.fy || getCurrentFyLabel() || '').trim()
    const fyRange = getFyRange(fyLabel)
    if (!fyRange) return reply.code(400).send({ error: 'Invalid FY' })

    const fyStart = fyRange.startDate
    const fyEndExclusive = addDaysToYMD(fyRange.endDate, 1)

    try {
      const summaryR = await pool.query(
        `
        WITH payouts AS (
          SELECT user_id, SUM(total_paid) as total_paid
          FROM employee_payouts
          WHERE total_paid > 0
            AND COALESCE(payout_date, month) >= $1
            AND COALESCE(payout_date, month) < $2
          GROUP BY user_id
        ),
        cu AS (
          SELECT user_id,
                 COUNT(*) as total_cu,
                 COUNT(DISTINCT lead_id) as projects_count,
                 COUNT(DISTINCT date_trunc('month', month)) as months_with_cu
          FROM contribution_units
          WHERE month >= $1 AND month < $2
          GROUP BY user_id
        ),
        base AS (
          SELECT user_id FROM payouts
          UNION
          SELECT user_id FROM cu
          UNION
          SELECT user_id FROM employee_compensation_profiles
        )
        SELECT u.id as user_id,
               u.name,
               u.email,
               u.role,
               u.job_title,
               u.is_active,
               ecp.employment_type,
               ecp.is_active as profile_active,
               COALESCE(p.total_paid, 0) as total_paid,
               COALESCE(c.total_cu, 0) as total_cu,
               COALESCE(c.projects_count, 0) as projects_count,
               COALESCE(c.months_with_cu, 0) as months_with_cu
        FROM base b
        JOIN users u ON u.id = b.user_id
        LEFT JOIN employee_compensation_profiles ecp ON ecp.user_id = u.id
        LEFT JOIN payouts p ON p.user_id = u.id
        LEFT JOIN cu c ON c.user_id = u.id
        ORDER BY u.name ASC
        `,
        [fyStart, fyEndExclusive]
      )

      const monthlyR = await pool.query(
        `
        SELECT user_id,
               to_char(date_trunc('month', month), 'YYYY-MM') as month,
               COUNT(*) as cu_count
        FROM contribution_units
        WHERE month >= $1 AND month < $2
        GROUP BY user_id, month
        ORDER BY month ASC
        `,
        [fyStart, fyEndExclusive]
      )

      const projectR = await pool.query(
        `
        SELECT cu.user_id,
               cu.lead_id,
               l.lead_number,
               l.name as lead_name,
               COUNT(*) as cu_count
        FROM contribution_units cu
        JOIN leads l ON l.id = cu.lead_id
        WHERE cu.month >= $1 AND cu.month < $2
        GROUP BY cu.user_id, cu.lead_id, l.lead_number, l.name
        ORDER BY cu_count DESC
        `,
        [fyStart, fyEndExclusive]
      )

      const monthlyMap = monthlyR.rows.reduce((acc, row) => {
        if (!acc[row.user_id]) acc[row.user_id] = []
        acc[row.user_id].push({ month: row.month, cu_count: Number(row.cu_count || 0) })
        return acc
      }, {})

      const projectMap = projectR.rows.reduce((acc, row) => {
        if (!acc[row.user_id]) acc[row.user_id] = []
        acc[row.user_id].push({
          lead_id: row.lead_id,
          lead_number: row.lead_number,
          lead_name: row.lead_name,
          cu_count: Number(row.cu_count || 0)
        })
        return acc
      }, {})

      const employees = summaryR.rows.map(row => {
        const totalCu = Number(row.total_cu || 0)
        const monthsWithCu = Number(row.months_with_cu || 0)
        return {
          user_id: row.user_id,
          name: row.name,
          email: row.email,
          role: row.role,
          job_title: row.job_title,
          is_active: row.is_active,
          employment_type: row.employment_type,
          profile_active: row.profile_active,
          total_paid: Number(row.total_paid || 0),
          projects_count: Number(row.projects_count || 0),
          total_cu: totalCu,
          avg_cu_per_month: monthsWithCu > 0 ? totalCu / monthsWithCu : 0,
          monthly_cu: monthlyMap[row.user_id] || [],
          project_cu: projectMap[row.user_id] || []
        }
      })

      const availableFys = await getAvailableFyLabels()

      return reply.send({
        fy: fyRange.label,
        fy_range: { start: fyRange.startDate, end: fyRange.endDate },
        available_fys: availableFys,
        employees
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load employee report' })
    }
  })

  api.delete('/finance/invoices/:id/payments/:payment_id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const invoiceId = parseId(req.params.id)
    const paymentId = parseId(req.params.payment_id)
    if (!invoiceId || !paymentId) return reply.code(400).send({ error: 'Invalid IDs' })

    try {
      const r = await pool.query(
        `DELETE FROM invoice_payments WHERE id = $1 AND invoice_id = $2 RETURNING id`,
        [paymentId, invoiceId]
      )
      if (!r.rows.length) return reply.code(404).send({ error: 'Payment mapping not found' })

      await updateInvoiceStatusAsync(invoiceId)
      return { success: true }
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to remove payment mapping' })
    }
  })


}
