module.exports = async function(api, opts) {
  const {
    ALLOWED_COMPOUND_TLDS, ALLOWED_EMAIL_TLDS, ALLOWED_ORIGINS, AUTH_COOKIE, AUTH_SECRET, COMMON_EMAIL_DOMAINS, COVERAGE_SCOPES, DEV_ORIGINS, EMAIL_TYPO_MAP, FOLLOWUP_TYPES, HEAT_VALUES, LEAD_STATUSES, PHOTO_UPLOAD_DIR, PROD_ORIGIN, PROTECTED_ADMIN_EMAIL, PUBLIC_API_PATHS, UPLOADS_DIR, VIDEO_UPLOAD_DIR, addDaysToYMD, addDaysYMD, apiRoutes, assignReferenceCode, boolToYesNo, canonicalizeEmail, canonicalizeInstagram, canonicalizePhone, classifyDeviceType, clearAuthCookie, createNotification, dateToYMD, detectBrowser, detectPlatform, ensureDirectory, fetchProfitProjectRows, formatName, formatRefDate, getAuthFromRequest, getAvailableFyLabels, getClientInfo, getCurrentFyLabel, getDateRange, getFirstName, getFyLabelFromDate, getFyRange, getImageContentType, getNextLeadNumber, getOrCreateCity, getRoundRobinSalesUserId, getUserDisplayName, hasAllEventTimes, hasAnyEvent, hasEventInPrimaryCity, hasEventsForAllCities, hasPrimaryCity, hashPassword, isProtectedAdminUser, isValidInstagramUsername, listFyLabelsBetween, logAdminAudit, logLeadActivity, normalizeDateValue, normalizeEmailInput, normalizeInstagramUrl, normalizeLeadRow, normalizeLeadRows, normalizeNickname, normalizePhone, normalizeYMD, parseCookies, parseDataUrl, parseFyLabel, recalculateAccountBalances, recomputeLeadMetrics, recomputeUserMetrics, recomputeUserMetricsRange, requireAdmin, requireAuth, requireVendor, resolveUserDisplayName, runMetricsJob, sanitizeTags, setAuthCookie, signToken, startOfDay, toISTDateString, validateEmail, verifyPassword, verifyToken, yesNoToBool, pool
  } = opts;

  /* ===================== FINANCE — PROJECT P&L v1 ===================== */

  api.get('/finance/projects/:leadId/pnl', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const leadId = parseId(req.params.leadId)
    if (!leadId) return reply.code(400).send({ error: 'Invalid lead id' })

    try {
      const leadCheck = await pool.query(`SELECT id FROM leads WHERE id = $1`, [leadId])
      if (!leadCheck.rows.length) return reply.code(404).send({ error: 'Lead not found' })

      const dateFrom = normalizeDateValue(req.query?.date_from)
      const dateTo = normalizeDateValue(req.query?.date_to)
      const toMonthStart = (ymd) => (ymd ? `${String(ymd).slice(0, 7)}-01` : null)
      const monthStartFrom = toMonthStart(dateFrom)
      const monthStartTo = toMonthStart(dateTo)
      const allocationVersion = 'v2.2'

      const revenueParams = [leadId]
      let revenueWhere = `i.lead_id = $1 AND i.status = 'paid'`
      let revenueIdx = 2
      if (dateFrom || dateTo) {
        revenueWhere += ` AND paid.paid_date IS NOT NULL`
      }
      if (dateFrom) {
        revenueWhere += ` AND paid.paid_date >= $${revenueIdx++}`
        revenueParams.push(dateFrom)
      }
      if (dateTo) {
        revenueWhere += ` AND paid.paid_date <= $${revenueIdx++}`
        revenueParams.push(dateTo)
      }

      const revenueR = await pool.query(
        `
        SELECT i.id as invoice_id,
               i.total_amount as amount,
               paid.paid_date
        FROM invoices i
        LEFT JOIN (
          SELECT invoice_id, MAX(created_at)::date as paid_date
          FROM invoice_payments
          GROUP BY invoice_id
        ) paid ON paid.invoice_id = i.id
        WHERE ${revenueWhere}
        ORDER BY i.id DESC
        `,
        revenueParams
      )

      const vendorParams = [leadId]
      let vendorWhere = `
        vb.lead_id = $1
        AND vb.status = 'paid'
        AND NOT (
          vb.is_billable_to_client = true
          AND EXISTS (
            SELECT 1 FROM invoice_line_items ili
            WHERE ili.vendor_bill_id = vb.id
          )
        )
      `
      let vendorIdx = 2
      if (dateFrom || dateTo) {
        vendorWhere += ` AND paid.paid_date IS NOT NULL`
      }
      if (dateFrom) {
        vendorWhere += ` AND paid.paid_date >= $${vendorIdx++}`
        vendorParams.push(dateFrom)
      }
      if (dateTo) {
        vendorWhere += ` AND paid.paid_date <= $${vendorIdx++}`
        vendorParams.push(dateTo)
      }

      const vendorCostR = await pool.query(
        `
        SELECT vb.id as vendor_bill_id,
               v.name as vendor_name,
               vb.bill_category as category,
               vb.bill_amount as amount,
               paid.paid_date
        FROM vendor_bills vb
        JOIN vendors v ON v.id = vb.vendor_id
        LEFT JOIN (
          SELECT vendor_bill_id, MAX(date)::date as paid_date
          FROM finance_transactions
          WHERE vendor_bill_id IS NOT NULL AND is_deleted = false AND is_transfer = false
          GROUP BY vendor_bill_id
        ) paid ON paid.vendor_bill_id = vb.id
        WHERE ${vendorWhere}
        ORDER BY vb.id DESC
        `,
        vendorParams
      )

      const payrollParams = [leadId]
      let payrollWhere = `
        ece.lead_id = $1
        AND cc.component_type = 'earning'
        AND cc.is_variable = true
      `
      let payrollIdx = 2
      if (dateFrom) {
        payrollWhere += ` AND ece.month >= $${payrollIdx++}`
        payrollParams.push(dateFrom)
      }
      if (dateTo) {
        payrollWhere += ` AND ece.month <= $${payrollIdx++}`
        payrollParams.push(dateTo)
      }

      const payrollR = await pool.query(
        `
        SELECT ece.id,
               u.name as user_name,
               cc.name as component_name,
               ece.amount,
               ece.month
        FROM employee_compensation_entries ece
        JOIN users u ON u.id = ece.user_id
        JOIN compensation_components cc ON cc.id = ece.component_id
        WHERE ${payrollWhere}
        ORDER BY ece.month DESC, u.name ASC, cc.id ASC
        `,
        payrollParams
      )

      // Overhead allocation v2.2 (read-only) using Contribution Units
      const cuParams = []
      let cuIdx = 1
      let cuWhere = `cu.lead_id IS NOT NULL`
      if (monthStartFrom) {
        cuWhere += ` AND cu.month >= $${cuIdx++}`
        cuParams.push(monthStartFrom)
      }
      if (monthStartTo) {
        cuWhere += ` AND cu.month <= $${cuIdx++}`
        cuParams.push(monthStartTo)
      }

      const cuEntriesR = await pool.query(
        `
        SELECT cu.user_id,
               cu.lead_id,
               date_trunc('month', cu.month)::date as month_start,
               COUNT(*) as cu_count
        FROM contribution_units cu
        WHERE ${cuWhere}
        GROUP BY cu.user_id, cu.lead_id, month_start
        `,
        cuParams
      )
      const cuEntries = cuEntriesR.rows

      const profilesR = await pool.query(
        `
        SELECT ecp.user_id,
               ecp.base_amount,
               ecp.employment_type,
               u.name as user_name
        FROM employee_compensation_profiles ecp
        JOIN users u ON u.id = ecp.user_id
        WHERE ecp.is_active = true AND ecp.base_amount IS NOT NULL
        `
      )

      const salaryMap = {}
      const userNameMap = {}
      profilesR.rows.forEach(row => {
        const base = Number(row.base_amount || 0)
        if (!Number.isFinite(base) || base <= 0) return
        if (row.employment_type === 'salaried' || row.employment_type === 'salaried_plus_variable' || row.employment_type === 'stipend') {
          salaryMap[row.user_id] = base
          userNameMap[row.user_id] = row.user_name
        }
      })

      const totalCuByUserMonth = {}
      cuEntries.forEach(row => {
        const key = `${row.user_id}-${dateToYMD(row.month_start)}`
        const cu = Number(row.cu_count || 0)
        if (!Number.isFinite(cu) || cu <= 0) return
        totalCuByUserMonth[key] = (totalCuByUserMonth[key] || 0) + cu
      })

      const peopleOverheadBreakdown = []
      cuEntries.forEach(row => {
        if (Number(row.lead_id) !== Number(leadId)) return
        const monthKey = dateToYMD(row.month_start)
        const cu = Number(row.cu_count || 0)
        if (!Number.isFinite(cu) || cu <= 0) return
        const totalCu = totalCuByUserMonth[`${row.user_id}-${monthKey}`] || 0
        if (!totalCu || totalCu <= 0) return
        const base = salaryMap[row.user_id]
        if (!base) return
        const allocated = (cu / totalCu) * base
        peopleOverheadBreakdown.push({
          employee_name: userNameMap[row.user_id] || `User ${row.user_id}`,
          month: monthKey,
          cu_count: cu,
          allocated_amount: allocated
        })
      })

      const peopleOverheadTotal = peopleOverheadBreakdown.reduce((sum, r) => sum + Number(r.allocated_amount || 0), 0)

      const infraParams = []
      let infraIdx = 1
      let infraWhere = `
        ft.transaction_type = 'overhead'
        AND ft.is_deleted = false
        AND ft.is_transfer = false
      `
      if (monthStartFrom) {
        infraWhere += ` AND date_trunc('month', ft.date)::date >= $${infraIdx++}`
        infraParams.push(monthStartFrom)
      }
      if (monthStartTo) {
        infraWhere += ` AND date_trunc('month', ft.date)::date <= $${infraIdx++}`
        infraParams.push(monthStartTo)
      }

      const infraR = await pool.query(
        `
        SELECT date_trunc('month', ft.date)::date as month_start,
               SUM(ft.amount) as total_infra
        FROM finance_transactions ft
        WHERE ${infraWhere}
        GROUP BY month_start
        ORDER BY month_start DESC
        `,
        infraParams
      )

      const activeParams = [leadId]
      let activeIdx = 2
      let activeMonthFilter = ''
      if (monthStartFrom) {
        activeMonthFilter += ` AND month_start >= $${activeIdx++}`
        activeParams.push(monthStartFrom)
      }
      if (monthStartTo) {
        activeMonthFilter += ` AND month_start <= $${activeIdx++}`
        activeParams.push(monthStartTo)
      }

      const activeR = await pool.query(
        `
        WITH active_events AS (
          SELECT cu.lead_id, date_trunc('month', cu.month)::date as month_start
          FROM contribution_units cu
          WHERE cu.lead_id IS NOT NULL
          UNION
          SELECT vb.lead_id, date_trunc('month', ft.date)::date as month_start
          FROM finance_transactions ft
          JOIN vendor_bills vb ON vb.id = ft.vendor_bill_id
          WHERE ft.vendor_bill_id IS NOT NULL AND ft.is_deleted = false AND ft.is_transfer = false AND vb.lead_id IS NOT NULL
          UNION
          SELECT la.lead_id, date_trunc('month', la.created_at)::date as month_start
          FROM lead_activities la
          WHERE la.lead_id IS NOT NULL
          UNION
          SELECT lul.lead_id, date_trunc('month', lul.entered_at)::date as month_start
          FROM lead_usage_logs lul
          WHERE lul.lead_id IS NOT NULL
        )
        SELECT month_start,
               COUNT(DISTINCT lead_id) as active_projects,
               MAX(CASE WHEN lead_id = $1 THEN 1 ELSE 0 END) as lead_active
        FROM active_events
        WHERE lead_id IS NOT NULL ${activeMonthFilter}
        GROUP BY month_start
        ORDER BY month_start DESC
        `,
        activeParams
      )

      const activeMonthMap = {}
      activeR.rows.forEach(row => {
        const key = dateToYMD(row.month_start)
        activeMonthMap[key] = {
          active_projects: Number(row.active_projects || 0),
          lead_active: Number(row.lead_active || 0)
        }
      })

      const infraBreakdown = []
      infraR.rows.forEach(row => {
        const monthKey = dateToYMD(row.month_start)
        const infraTotal = Number(row.total_infra || 0)
        const activeInfo = activeMonthMap[monthKey]
        if (!activeInfo || !activeInfo.lead_active) return
        if (!infraTotal || infraTotal <= 0) return
        const activeCount = Number(activeInfo.active_projects || 0)
        if (!activeCount) return
        infraBreakdown.push({
          month: monthKey,
          total_infra: infraTotal,
          active_projects: activeCount,
          allocated_amount: infraTotal / activeCount
        })
      })

      const infraOverheadTotal = infraBreakdown.reduce((sum, r) => sum + Number(r.allocated_amount || 0), 0)

      const activeMonths = Object.keys(activeMonthMap)
        .filter(m => activeMonthMap[m]?.lead_active)
        .sort()
      const activePeriod = activeMonths.length
        ? { start_month: activeMonths[0], end_month: activeMonths[activeMonths.length - 1] }
        : { start_month: null, end_month: null }

      const revenueBreakdown = revenueR.rows.map(r => ({
        invoice_id: r.invoice_id,
        amount: Number(r.amount || 0),
        paid_date: r.paid_date
      }))

      const vendorCostBreakdown = vendorCostR.rows.map(r => ({
        vendor_bill_id: r.vendor_bill_id,
        vendor_name: r.vendor_name,
        category: r.category,
        amount: Number(r.amount || 0),
        paid_date: r.paid_date
      }))

      const payrollBreakdown = payrollR.rows.map(r => ({
        user_name: r.user_name,
        component_name: r.component_name,
        amount: Number(r.amount || 0),
        month: r.month
      }))

      const revenueTotal = revenueBreakdown.reduce((sum, r) => sum + Number(r.amount || 0), 0)
      const vendorCostTotal = vendorCostBreakdown.reduce((sum, r) => sum + Number(r.amount || 0), 0)
      const payrollCostTotal = payrollBreakdown.reduce((sum, r) => sum + Number(r.amount || 0), 0)
      const overheadTotal = peopleOverheadTotal + infraOverheadTotal
      const netProfit = revenueTotal - vendorCostTotal - payrollCostTotal - overheadTotal

      req.log.info({ leadId, allocationVersion }, 'P&L overhead allocation version')

      return reply.send({
        revenue_total: revenueTotal,
        vendor_cost_total: vendorCostTotal,
        payroll_cost_total: payrollCostTotal,
        people_overhead_total: peopleOverheadTotal,
        infra_overhead_total: infraOverheadTotal,
        overhead_total: overheadTotal,
        net_profit: netProfit,
        revenue_breakdown: revenueBreakdown,
        vendor_cost_breakdown: vendorCostBreakdown,
        payroll_breakdown: payrollBreakdown,
        overhead_breakdown: {
          people: peopleOverheadBreakdown,
          infra: infraBreakdown
        },
        project_active_period: activePeriod,
        allocation_version: allocationVersion
      })
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch project P&L' })
    }
  })


}
