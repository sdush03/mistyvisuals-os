module.exports = async function(api, opts) {
  const {
    ALLOWED_COMPOUND_TLDS, ALLOWED_EMAIL_TLDS, ALLOWED_ORIGINS, AUTH_COOKIE, AUTH_SECRET, COMMON_EMAIL_DOMAINS, COVERAGE_SCOPES, DEV_ORIGINS, EMAIL_TYPO_MAP, FOLLOWUP_TYPES, HEAT_VALUES, LEAD_STATUSES, PHOTO_UPLOAD_DIR, PROD_ORIGIN, PROTECTED_ADMIN_EMAIL, PUBLIC_API_PATHS, UPLOADS_DIR, VIDEO_UPLOAD_DIR, addDaysToYMD, addDaysYMD, apiRoutes, assignReferenceCode, boolToYesNo, canonicalizeEmail, canonicalizeInstagram, canonicalizePhone, classifyDeviceType, clearAuthCookie, createNotification, dateToYMD, detectBrowser, detectPlatform, ensureDirectory, fetchProfitProjectRows, formatName, formatRefDate, getAuthFromRequest, getAvailableFyLabels, getClientInfo, getCurrentFyLabel, getDateRange, getFirstName, getFyLabelFromDate, getFyRange, getImageContentType, getNextLeadNumber, getOrCreateCity, getRoundRobinSalesUserId, getUserDisplayName, hasAllEventTimes, hasAnyEvent, hasEventInPrimaryCity, hasEventsForAllCities, hasPrimaryCity, hashPassword, isProtectedAdminUser, isValidInstagramUsername, listFyLabelsBetween, logAdminAudit, logLeadActivity, normalizeDateValue, normalizeEmailInput, normalizeInstagramUrl, normalizeLeadRow, normalizeLeadRows, normalizeNickname, normalizePhone, normalizeYMD, parseCookies, parseDataUrl, parseFyLabel, recalculateAccountBalances, recomputeLeadMetrics, recomputeUserMetrics, recomputeUserMetricsRange, requireAdmin, requireAuth, requireVendor, resolveUserDisplayName, runMetricsJob, sanitizeTags, setAuthCookie, signToken, startOfDay, toISTDateString, validateEmail, verifyPassword, verifyToken, yesNoToBool, pool
  } = opts;

  /* ===================== FINANCE — PROFIT DASHBOARD v1 ===================== */

  api.get('/finance/profit/projects', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fyLabel = String(req.query?.fy || getCurrentFyLabel() || '').trim()
    const fyRange = getFyRange(fyLabel)
    if (!fyRange) return reply.code(400).send({ error: 'Invalid FY' })

    const eventFrom = normalizeDateValue(req.query?.event_from)
    const eventTo = normalizeDateValue(req.query?.event_to)
    const eventType = req.query?.event_type ? String(req.query.event_type) : null
    const status = req.query?.status ? String(req.query.status) : null
    const cityId = parseId(req.query?.city_id)
    const cityName = req.query?.city ? String(req.query.city) : null
    const leadId = parseId(req.query?.lead_id)

    try {
      const rows = await fetchProfitProjectRows({
        fyStart: fyRange.startDate,
        fyEndExclusive: addDaysToYMD(fyRange.endDate, 1),
        filters: {
          leadId,
          status,
          cityId,
          cityName,
          eventType,
          eventFrom,
          eventTo
        }
      })

      const projects = rows.map(row => {
        const revenue = Number(row.revenue || 0)
        const vendor = Number(row.vendor_cost || 0)
        const payroll = Number(row.payroll_overhead || 0)
        const infra = Number(row.infra_overhead || 0)
        const net = revenue - vendor - payroll - infra
        const profitPercent = revenue > 0 ? (net / revenue) * 100 : null
        return {
          lead_id: row.lead_id,
          lead_number: row.lead_number,
          name: row.name,
          bride_name: row.bride_name,
          groom_name: row.groom_name,
          status: row.status,
          revenue,
          vendor_cost: vendor,
          payroll_overhead: payroll,
          infra_overhead: infra,
          net_profit: net,
          profit_percent: profitPercent
        }
      }).sort((a, b) => b.net_profit - a.net_profit)

      const availableFys = await getAvailableFyLabels()

      return reply.send({
        fy: fyRange.label,
        fy_range: {
          start: fyRange.startDate,
          end: fyRange.endDate
        },
        available_fys: availableFys,
        projects
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load profit projects' })
    }
  })

  api.get('/finance/profit/monthly', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fyLabel = String(req.query?.fy || getCurrentFyLabel() || '').trim()
    const fyRange = getFyRange(fyLabel)
    if (!fyRange) return reply.code(400).send({ error: 'Invalid FY' })

    const fyStart = fyRange.startDate
    const fyEndExclusive = addDaysToYMD(fyRange.endDate, 1)

    try {
      const revenueR = await pool.query(
        `
        WITH paid_invoices AS (
          SELECT i.id, i.total_amount, MAX(p.created_at)::date as paid_date
          FROM invoices i
          JOIN invoice_payments p ON p.invoice_id = i.id
          WHERE i.status = 'paid'
          GROUP BY i.id
        )
        SELECT to_char(date_trunc('month', paid_date), 'YYYY-MM') as month,
               SUM(total_amount) as total
        FROM paid_invoices
        WHERE paid_date >= $1 AND paid_date < $2
        GROUP BY month
        `,
        [fyStart, fyEndExclusive]
      )

      const vendorR = await pool.query(
        `
        WITH paid_vendor AS (
          SELECT vb.id, vb.bill_amount, vb.is_billable_to_client, MAX(ft.date)::date as paid_date
          FROM vendor_bills vb
          JOIN finance_transactions ft ON ft.vendor_bill_id = vb.id AND ft.is_deleted = false AND ft.is_transfer = false AND ft.transaction_type = 'vendor_payment'
          WHERE vb.status = 'paid'
          GROUP BY vb.id
        )
        SELECT to_char(date_trunc('month', paid_date), 'YYYY-MM') as month,
               SUM(bill_amount) as total
        FROM paid_vendor pv
        WHERE paid_date >= $1 AND paid_date < $2
          AND NOT (
            pv.is_billable_to_client = true
            AND EXISTS (
              SELECT 1 FROM invoice_line_items ili
              WHERE ili.vendor_bill_id = pv.id
            )
          )
        GROUP BY month
        `,
        [fyStart, fyEndExclusive]
      )

      const payrollR = await pool.query(
        `
        WITH cu_user_month AS (
          SELECT user_id, date_trunc('month', month)::date as month_start, COUNT(*) as cu_count
          FROM contribution_units
          WHERE month >= $1 AND month < $2
          GROUP BY user_id, month_start
        ),
        salaries AS (
          SELECT user_id, base_amount
          FROM employee_compensation_profiles
          WHERE is_active = true
            AND base_amount IS NOT NULL
            AND employment_type IN ('salaried','stipend','salaried_plus_variable')
        )
        SELECT to_char(cu.month_start, 'YYYY-MM') as month,
               SUM(s.base_amount) as total
        FROM cu_user_month cu
        JOIN salaries s ON s.user_id = cu.user_id
        GROUP BY month
        `,
        [fyStart, fyEndExclusive]
      )

      const infraR = await pool.query(
        `
        SELECT to_char(date_trunc('month', ft.date), 'YYYY-MM') as month,
               SUM(ft.amount) as total
        FROM finance_transactions ft
        WHERE ft.transaction_type = 'overhead'
          AND ft.is_deleted = false
          AND ft.is_transfer = false
          AND ft.date >= $1 AND ft.date < $2
        GROUP BY month
        `,
        [fyStart, fyEndExclusive]
      )

      const monthMap = {}
      const applyTotals = (rows, key) => {
        rows.forEach(r => {
          if (!monthMap[r.month]) monthMap[r.month] = { month: r.month, revenue: 0, vendor_cost: 0, payroll_overhead: 0, infra_overhead: 0 }
          monthMap[r.month][key] = Number(r.total || 0)
        })
      }

      applyTotals(revenueR.rows, 'revenue')
      applyTotals(vendorR.rows, 'vendor_cost')
      applyTotals(payrollR.rows, 'payroll_overhead')
      applyTotals(infraR.rows, 'infra_overhead')

      const months = []
      const start = new Date(`${fyRange.startDate}T00:00:00`)
      for (let i = 0; i < 12; i += 1) {
        const date = new Date(start.getFullYear(), start.getMonth() + i, 1)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        const row = monthMap[monthKey] || { month: monthKey, revenue: 0, vendor_cost: 0, payroll_overhead: 0, infra_overhead: 0 }
        const net = row.revenue - row.vendor_cost - row.payroll_overhead - row.infra_overhead
        months.push({ ...row, net_profit: net })
      }

      const availableFys = await getAvailableFyLabels()

      return reply.send({
        fy: fyRange.label,
        fy_range: { start: fyRange.startDate, end: fyRange.endDate },
        available_fys: availableFys,
        months
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load monthly profit' })
    }
  })

  api.get('/finance/profit/cost-mix', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return

    const fyLabel = String(req.query?.fy || getCurrentFyLabel() || '').trim()
    const fyRange = getFyRange(fyLabel)
    if (!fyRange) return reply.code(400).send({ error: 'Invalid FY' })

    const leadId = parseId(req.query?.lead_id)

    try {
      let totals = { vendor_cost: 0, payroll_overhead: 0, infra_overhead: 0 }
      let leadInfo = null

      if (leadId) {
        const rows = await fetchProfitProjectRows({
          fyStart: fyRange.startDate,
          fyEndExclusive: addDaysToYMD(fyRange.endDate, 1),
          filters: { leadId }
        })
        const row = rows[0]
        if (row) {
          totals.vendor_cost = Number(row.vendor_cost || 0)
          totals.payroll_overhead = Number(row.payroll_overhead || 0)
          totals.infra_overhead = Number(row.infra_overhead || 0)
          leadInfo = {
            lead_id: row.lead_id,
            lead_number: row.lead_number,
            name: row.name,
            bride_name: row.bride_name,
            groom_name: row.groom_name
          }
        }
      } else {
        const monthlyRes = await pool.query(
          `
          WITH paid_invoices AS (
            SELECT i.id, i.total_amount, MAX(p.created_at)::date as paid_date
            FROM invoices i
            JOIN invoice_payments p ON p.invoice_id = i.id
            WHERE i.status = 'paid'
            GROUP BY i.id
          ),
          paid_vendor AS (
            SELECT vb.id, vb.bill_amount, vb.is_billable_to_client, MAX(ft.date)::date as paid_date
            FROM vendor_bills vb
            JOIN finance_transactions ft ON ft.vendor_bill_id = vb.id AND ft.is_deleted = false AND ft.is_transfer = false AND ft.transaction_type = 'vendor_payment'
            WHERE vb.status = 'paid'
            GROUP BY vb.id
          ),
          vendor_cost AS (
            SELECT SUM(bill_amount) as total
            FROM paid_vendor pv
            WHERE pv.paid_date >= $1 AND pv.paid_date < $2
              AND NOT (
                pv.is_billable_to_client = true
                AND EXISTS (
                  SELECT 1 FROM invoice_line_items ili
                  WHERE ili.vendor_bill_id = pv.id
                )
              )
          ),
          payroll_overhead AS (
            WITH cu_user_month AS (
              SELECT user_id, date_trunc('month', month)::date as month_start, COUNT(*) as cu_count
              FROM contribution_units
              WHERE month >= $1 AND month < $2
              GROUP BY user_id, month_start
            ),
            salaries AS (
              SELECT user_id, base_amount
              FROM employee_compensation_profiles
              WHERE is_active = true
                AND base_amount IS NOT NULL
                AND employment_type IN ('salaried','stipend','salaried_plus_variable')
            )
            SELECT SUM(s.base_amount) as total
            FROM cu_user_month cu
            JOIN salaries s ON s.user_id = cu.user_id
          ),
          infra_overhead AS (
            SELECT SUM(ft.amount) as total
            FROM finance_transactions ft
            WHERE ft.transaction_type = 'overhead'
              AND ft.is_deleted = false
              AND ft.is_transfer = false
              AND ft.date >= $1 AND ft.date < $2
          )
          SELECT
            (SELECT total FROM vendor_cost) as vendor_cost,
            (SELECT total FROM payroll_overhead) as payroll_overhead,
            (SELECT total FROM infra_overhead) as infra_overhead
          `,
          [fyRange.startDate, addDaysToYMD(fyRange.endDate, 1)]
        )
        const row = monthlyRes.rows[0] || {}
        totals.vendor_cost = Number(row.vendor_cost || 0)
        totals.payroll_overhead = Number(row.payroll_overhead || 0)
        totals.infra_overhead = Number(row.infra_overhead || 0)
      }

      const totalCosts = totals.vendor_cost + totals.payroll_overhead + totals.infra_overhead
      const percentages = {
        vendor_pct: totalCosts > 0 ? (totals.vendor_cost / totalCosts) * 100 : 0,
        payroll_pct: totalCosts > 0 ? (totals.payroll_overhead / totalCosts) * 100 : 0,
        infra_pct: totalCosts > 0 ? (totals.infra_overhead / totalCosts) * 100 : 0
      }

      const availableFys = await getAvailableFyLabels()

      return reply.send({
        fy: fyRange.label,
        fy_range: { start: fyRange.startDate, end: fyRange.endDate },
        available_fys: availableFys,
        lead: leadInfo,
        totals,
        percentages
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to load cost mix' })
    }
  })


}
