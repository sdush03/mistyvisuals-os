module.exports = async function(api, opts) {
  const {
    ALLOWED_COMPOUND_TLDS, ALLOWED_EMAIL_TLDS, ALLOWED_ORIGINS, AUTH_COOKIE, AUTH_SECRET, COMMON_EMAIL_DOMAINS, COVERAGE_SCOPES, DEV_ORIGINS, EMAIL_TYPO_MAP, FOLLOWUP_TYPES, HEAT_VALUES, LEAD_STATUSES, PHOTO_UPLOAD_DIR, PROD_ORIGIN, PROTECTED_ADMIN_EMAIL, PUBLIC_API_PATHS, UPLOADS_DIR, VIDEO_UPLOAD_DIR, addDaysToYMD, addDaysYMD, apiRoutes, assignReferenceCode, boolToYesNo, canonicalizeEmail, canonicalizeInstagram, canonicalizePhone, classifyDeviceType, clearAuthCookie, createNotification, dateToYMD, detectBrowser, detectPlatform, ensureDirectory, fetchProfitProjectRows, formatName, formatRefDate, getAuthFromRequest, getAvailableFyLabels, getClientInfo, getCurrentFyLabel, getDateRange, getFirstName, getFyLabelFromDate, getFyRange, getImageContentType, getNextLeadNumber, getOrCreateCity, getRoundRobinSalesUserId, getUserDisplayName, hasAllEventTimes, hasAnyEvent, hasEventInPrimaryCity, hasEventsForAllCities, hasPrimaryCity, hashPassword, isProtectedAdminUser, isValidInstagramUsername, listFyLabelsBetween, logAdminAudit, logLeadActivity, normalizeDateValue, normalizeEmailInput, normalizeInstagramUrl, normalizeLeadRow, normalizeLeadRows, normalizeNickname, normalizePhone, normalizeYMD, parseCookies, parseDataUrl, parseFyLabel, recalculateAccountBalances, recomputeLeadMetrics, recomputeUserMetrics, recomputeUserMetricsRange, requireAdmin, requireAuth, requireVendor, resolveUserDisplayName, runMetricsJob, sanitizeTags, setAuthCookie, signToken, startOfDay, toISTDateString, validateEmail, verifyPassword, verifyToken, yesNoToBool, pool
  } = opts;

  /* ===================== FINANCE — PAYROLL INTENT v1 ===================== */

  api.get('/finance/payroll/summary', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const month = normalizePayrollMonth(req.query?.month)
    if (!month) return reply.code(400).send({ error: 'month query param is required (YYYY-MM-01)' })

    try {
      const profilesR = await pool.query(`
        SELECT ecp.*, u.name as user_name, u.email as user_email, u.job_title
        FROM employee_compensation_profiles ecp
        JOIN users u ON u.id = ecp.user_id
        WHERE ecp.is_active = true
        ORDER BY u.name ASC
      `)

      const incentivesR = await pool.query(
        `
        SELECT ece.user_id, SUM(ece.amount) as total
        FROM employee_compensation_entries ece
        JOIN compensation_components cc ON cc.id = ece.component_id
        WHERE ece.month = $1 AND cc.component_type = 'earning' AND cc.is_variable = true
        GROUP BY ece.user_id
        `,
        [month]
      )

      const payoutMapR = await pool.query(
        `
        SELECT user_id, amount_paid, payout_date, leave_deduction, manual_adjustment, carry_forward_next, advance_next
        FROM employee_payouts
        WHERE month = $1
        `,
        [month]
      )

      const nextMonthDate = new Date(`${month}T00:00:00`)
      nextMonthDate.setMonth(nextMonthDate.getMonth() + 1)
      const nextMonth = dateToYMD(new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), 1))

      const nextPayoutR = await pool.query(
        `
        SELECT user_id, carry_forward_prev, carry_forward_next
        FROM employee_payouts
        WHERE month = $1
        `,
        [nextMonth]
      )

      const prevCarryR = await pool.query(
        `
        SELECT DISTINCT ON (user_id)
          user_id,
          carry_forward_next,
          advance_next
        FROM employee_payouts
        WHERE month < $1
        ORDER BY user_id, month DESC
        `,
        [month]
      )

      const incentiveMap = {}
      for (const row of incentivesR.rows) {
        incentiveMap[row.user_id] = Number(row.total || 0)
      }

      const paidMap = {}
      for (const row of payoutMapR.rows) {
        paidMap[row.user_id] = row
      }

      const nextMap = {}
      for (const row of nextPayoutR.rows) {
        nextMap[row.user_id] = row
      }

      const carryMap = {}
      for (const row of prevCarryR.rows) {
        const carryForwardNext = Number(row.carry_forward_next || 0)
        const advanceNext = Number(row.advance_next || 0)
        carryMap[row.user_id] = carryForwardNext - advanceNext
      }

      const summary = profilesR.rows.map((profile) => {
        const baseSalary = Number(profile.base_amount || 0)
        const incentives = Number(incentiveMap[profile.user_id] || 0)
        const payout = paidMap[profile.user_id]
        const nextPayout = nextMap[profile.user_id]
        const leaveDeduction = payout ? Number(payout.leave_deduction || 0) : 0
        const manualAdjustment = payout ? Number(payout.manual_adjustment || 0) : 0
        const carryForwardPrev = Number(carryMap[profile.user_id] || 0)
        const gross = baseSalary + incentives - leaveDeduction + manualAdjustment
        const netDue = gross + carryForwardPrev
        const carryForwardNext = payout ? Number(payout.carry_forward_next || 0) : 0
        const carrySettled = carryForwardNext > 0 && nextPayout
          ? Number(nextPayout.carry_forward_prev || 0) >= carryForwardNext && Number(nextPayout.carry_forward_next || 0) === 0
          : false

        return {
          user_id: profile.user_id,
          user_name: profile.user_name,
          role: profile.job_title || null,
          employment_type: profile.employment_type,
          base_salary: baseSalary,
          incentives,
          leave_deduction: leaveDeduction,
          manual_adjustment: manualAdjustment,
          carry_forward: carryForwardPrev,
          net_due: netDue,
          amount_paid: payout ? Number(payout.amount_paid || 0) : 0,
          carry_forward_next: carryForwardNext,
          advance_next: payout ? Number(payout.advance_next || 0) : 0,
          payout_exists: !!payout,
          carry_settled: carrySettled,
          payout_date: payout?.payout_date || null,
        }
      })

      return reply.send(summary)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to compute payroll summary' })
    }
  })

  api.post('/finance/payroll/draft', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const body = req.body || {}
    const userId = parseId(body.user_id)
    const month = normalizePayrollMonth(body.month)
    const leaveDeduction = Number(body.leave_deduction || 0)
    const manualAdjustment = Number(body.manual_adjustment || 0)

    if (!userId) return reply.code(400).send({ error: 'user_id is required' })
    if (!month) return reply.code(400).send({ error: 'month is required (YYYY-MM-01)' })
    if (!Number.isFinite(leaveDeduction) || leaveDeduction < 0) {
      return reply.code(400).send({ error: 'Leave deduction must be 0 or greater' })
    }
    if (!Number.isFinite(manualAdjustment)) {
      return reply.code(400).send({ error: 'Manual adjustment must be a number' })
    }

    try {
      const result = await withTransaction(async (client) => {
        const userR = await client.query(
          `
          SELECT u.id, u.name, ecp.base_amount
          FROM users u
          JOIN employee_compensation_profiles ecp ON ecp.user_id = u.id
          WHERE u.id = $1
          `,
          [userId]
        )
        if (!userR.rows.length) throw { code: 'USER_NOT_FOUND' }
        const userName = userR.rows[0].name
        const baseSalary = Number(userR.rows[0].base_amount || 0)

        const incentivesR = await client.query(
          `
          SELECT SUM(ece.amount) as total
          FROM employee_compensation_entries ece
          JOIN compensation_components cc ON cc.id = ece.component_id
          WHERE ece.month = $1 AND ece.user_id = $2 AND cc.component_type = 'earning' AND cc.is_variable = true
          `,
          [month, userId]
        )
        const incentives = Number(incentivesR.rows[0]?.total || 0)

        const prevCarryR = await client.query(
          `
          SELECT carry_forward_next, advance_next
          FROM employee_payouts
          WHERE user_id = $1 AND month < $2
          ORDER BY month DESC
          LIMIT 1
          `,
          [userId, month]
        )
        const carryForwardPrev = prevCarryR.rows.length
          ? Number(prevCarryR.rows[0].carry_forward_next || 0) - Number(prevCarryR.rows[0].advance_next || 0)
          : 0

        const gross = baseSalary + incentives - leaveDeduction + manualAdjustment
        const netDue = gross + carryForwardPrev

        const existingR = await client.query(
          `SELECT amount_paid FROM employee_payouts WHERE user_id = $1 AND month = $2`,
          [userId, month]
        )
        if (existingR.rows.length && Number(existingR.rows[0].amount_paid || 0) > 0) {
          throw { code: 'PAYMENT_ALREADY_RECORDED' }
        }

        const payoutR = await client.query(
          `INSERT INTO employee_payouts (
             user_id, month, total_payable, total_paid, payout_date, finance_transaction_id,
             base_salary, incentives, leave_deduction, manual_adjustment, carry_forward_prev,
             amount_paid, carry_forward_next, advance_next
           )
           VALUES ($1, $2, $3, 0, NULL, NULL, $4, $5, $6, $7, $8, 0, 0, 0)
           ON CONFLICT (user_id, month) DO UPDATE SET
             total_payable = EXCLUDED.total_payable,
             total_paid = 0,
             payout_date = NULL,
             finance_transaction_id = NULL,
             base_salary = EXCLUDED.base_salary,
             incentives = EXCLUDED.incentives,
             leave_deduction = EXCLUDED.leave_deduction,
             manual_adjustment = EXCLUDED.manual_adjustment,
             carry_forward_prev = EXCLUDED.carry_forward_prev,
             amount_paid = 0,
             carry_forward_next = 0,
             advance_next = 0
           RETURNING *`,
          [userId, month, netDue, baseSalary, incentives, leaveDeduction, manualAdjustment, carryForwardPrev]
        )

        await logAdminAudit(
          req,
          'create',
          'payroll_draft',
          payoutR.rows[0].id,
          null,
          {
            user_id: userId,
            user_name: userName,
            month,
            base_salary: baseSalary,
            incentives,
            leave_deduction: leaveDeduction,
            manual_adjustment: manualAdjustment,
            carry_forward_prev: carryForwardPrev,
            net_due: netDue,
          },
          auth.sub
        )

        return payoutR.rows[0]
      })

      return reply.send(result)
    } catch (err) {
      if (err?.code === 'USER_NOT_FOUND') return reply.code(404).send({ error: 'User not found' })
      if (err?.code === 'PAYMENT_ALREADY_RECORDED') return reply.code(400).send({ error: 'Payment already recorded for this month' })
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to save draft' })
    }
  })

  api.post('/finance/payroll/payouts', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const body = req.body || {}
    const userId = parseId(body.user_id)
    const month = normalizePayrollMonth(body.month)
    const paymentDate = normalizeDateValue(body.date)
    const moneySourceId = parseId(body.money_source_id)
    const amountPaid = Number(body.amount_paid)
    const leaveDeduction = Number(body.leave_deduction || 0)
    const manualAdjustment = Number(body.manual_adjustment || 0)
    const deductionReason = String(body.leave_deduction_reason || '').trim()
    const adjustmentReason = String(body.manual_adjustment_reason || '').trim()
    const advanceReason = String(body.advance_reason || '').trim()

    if (!userId) return reply.code(400).send({ error: 'user_id is required' })
    if (!month) return reply.code(400).send({ error: 'month is required (YYYY-MM-01)' })
    if (!paymentDate) return reply.code(400).send({ error: 'Valid date is required' })
    if (!moneySourceId) return reply.code(400).send({ error: 'Money source is required' })
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) return reply.code(400).send({ error: 'Valid amount is required' })
    if (leaveDeduction > 0 && !deductionReason) {
      return reply.code(400).send({ error: 'Leave deduction reason is required' })
    }
    if (manualAdjustment !== 0 && !adjustmentReason) {
      return reply.code(400).send({ error: 'Manual adjustment reason is required' })
    }

    try {
      const dupR = await pool.query(
        `
        SELECT 1
        FROM finance_transactions
        WHERE user_id = $1
          AND transaction_type = 'payroll'
          AND date = $2
          AND is_deleted = false
        LIMIT 1
        `,
        [userId, paymentDate]
      )
      if (dupR.rows.length) {
        return reply.code(400).send({ error: 'Duplicate payroll payment detected' })
      }

      const result = await withTransaction(async (client) => {
        const userR = await client.query(
          `
          SELECT u.id, u.name, ecp.base_amount
          FROM users u
          JOIN employee_compensation_profiles ecp ON ecp.user_id = u.id
          WHERE u.id = $1
          `,
          [userId]
        )
        if (!userR.rows.length) throw { code: 'USER_NOT_FOUND' }
        const userName = userR.rows[0].name
        const baseSalary = Number(userR.rows[0].base_amount || 0)

        const incentivesR = await client.query(
          `
          SELECT SUM(ece.amount) as total
          FROM employee_compensation_entries ece
          JOIN compensation_components cc ON cc.id = ece.component_id
          WHERE ece.month = $1 AND ece.user_id = $2 AND cc.component_type = 'earning' AND cc.is_variable = true
          `,
          [month, userId]
        )
        const incentives = Number(incentivesR.rows[0]?.total || 0)

        const prevCarryR = await client.query(
          `
          SELECT carry_forward_next, advance_next
          FROM employee_payouts
          WHERE user_id = $1 AND month < $2
          ORDER BY month DESC
          LIMIT 1
          `,
          [userId, month]
        )
        const carryForwardPrev = prevCarryR.rows.length
          ? Number(prevCarryR.rows[0].carry_forward_next || 0) - Number(prevCarryR.rows[0].advance_next || 0)
          : 0

        const gross = baseSalary + incentives - leaveDeduction + manualAdjustment
        const netDue = gross + carryForwardPrev

        const advanceNext = amountPaid > netDue ? amountPaid - netDue : 0
        const carryForwardNext = amountPaid < netDue ? netDue - amountPaid : 0

        if (advanceNext > 0 && !advanceReason) {
          throw { code: 'ADVANCE_REASON_REQUIRED' }
        }

        const categoryId = await getPayrollCategoryId(client)
        const monthLabel = new Date(month).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
        const fullNote = `Salary – ${userName} – ${monthLabel}`

        const txR = await client.query(
          `INSERT INTO finance_transactions (date, amount, direction, money_source_id, lead_id, is_overhead, category_id, note, user_id, transaction_type)
           VALUES ($1, $2, 'out', $3, NULL, true, $4, $5, $6, 'payroll')
           RETURNING id`,
          [paymentDate, amountPaid, moneySourceId, categoryId, fullNote, userId]
        )

        const ym = formatRefDate(paymentDate).slice(0, 6)
        await assignReferenceCode(client, txR.rows[0].id, `PAYROLL-${userId}-${ym}`)

        const payoutR = await client.query(
          `INSERT INTO employee_payouts (
             user_id, month, total_payable, total_paid, payout_date, finance_transaction_id,
             base_salary, incentives, leave_deduction, manual_adjustment, carry_forward_prev,
             amount_paid, carry_forward_next, advance_next
           )
           VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (user_id, month) DO UPDATE SET
             total_payable = EXCLUDED.total_payable,
             total_paid = EXCLUDED.total_paid,
             payout_date = EXCLUDED.payout_date,
             finance_transaction_id = NULL,
             base_salary = EXCLUDED.base_salary,
             incentives = EXCLUDED.incentives,
             leave_deduction = EXCLUDED.leave_deduction,
             manual_adjustment = EXCLUDED.manual_adjustment,
             carry_forward_prev = EXCLUDED.carry_forward_prev,
             amount_paid = EXCLUDED.amount_paid,
             carry_forward_next = EXCLUDED.carry_forward_next,
             advance_next = EXCLUDED.advance_next
           RETURNING *`,
          [
            userId,
            month,
            netDue,
            amountPaid,
            paymentDate,
            baseSalary,
            incentives,
            leaveDeduction,
            manualAdjustment,
            carryForwardPrev,
            amountPaid,
            carryForwardNext,
            advanceNext,
          ]
        )

        await logAdminAudit(
          req,
          'create',
          'payroll_payment',
          payoutR.rows[0].id,
          null,
          {
            user_id: userId,
            month,
            base_salary: baseSalary,
            incentives,
            leave_deduction: leaveDeduction,
            manual_adjustment: manualAdjustment,
            carry_forward_prev: carryForwardPrev,
            net_due: netDue,
            amount_paid: amountPaid,
            carry_forward_next: carryForwardNext,
            advance_next: advanceNext,
            leave_deduction_reason: deductionReason || null,
            manual_adjustment_reason: adjustmentReason || null,
            advance_reason: advanceReason || null,
          },
          auth.sub
        )

        return { payout: payoutR.rows[0] }
      })

      void recalculateAccountBalances()
      return reply.send(result)
    } catch (err) {
      if (err?.code === 'USER_NOT_FOUND') return reply.code(404).send({ error: 'User not found' })
      if (err?.code === 'ADVANCE_REASON_REQUIRED') return reply.code(400).send({ error: 'Advance reason is required when payment exceeds net due' })
      if (err?.code === '23503') return reply.code(400).send({ error: 'Invalid money source' })
      if (err?.code === '23514') return reply.code(400).send({ error: 'Payroll payment violates finance rules' })
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to record payroll payment' })
    }
  })

  // Create compensation profile
  api.post('/payroll/profiles', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { user_id, employment_type, base_amount } = req.body || {}
    if (!user_id || !employment_type) return reply.code(400).send({ error: 'user_id and employment_type are required' })

    try {
      const { rows } = await pool.query(
        `INSERT INTO employee_compensation_profiles (user_id, employment_type, base_amount)
         VALUES ($1, $2, $3) RETURNING *`,
        [user_id, employment_type, base_amount || null]
      )
      return reply.send(rows[0])
    } catch (err) {
      if (err?.code === '23505') return reply.code(400).send({ error: 'Profile already exists for this user' })
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to create profile' })
    }
  })

  // Update compensation profile
  api.patch('/payroll/profiles/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const id = parseId(req.params.id)
    if (!id) return reply.code(400).send({ error: 'Invalid ID' })
    const { employment_type, base_amount, is_active } = req.body || {}

    try {
      const updates = []
      const values = []
      let i = 1
      if (employment_type !== undefined) { updates.push(`employment_type = $${i++}`); values.push(employment_type) }
      if (base_amount !== undefined) { updates.push(`base_amount = $${i++}`); values.push(base_amount) }
      if (is_active !== undefined) { updates.push(`is_active = $${i++}`); values.push(is_active) }
      if (!updates.length) return reply.code(400).send({ error: 'Nothing to update' })
      updates.push(`updated_at = NOW()`)
      values.push(id)

      const { rows } = await pool.query(
        `UPDATE employee_compensation_profiles SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      )
      if (!rows.length) return reply.code(404).send({ error: 'Profile not found' })
      return reply.send(rows[0])
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to update profile' })
    }
  })

  // List compensation components
  api.get('/payroll/components', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    try {
      const { rows } = await pool.query(`SELECT id, name, component_type, is_variable, rule_type, calculation_note FROM compensation_components ORDER BY id ASC`)
      return reply.send(rows)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch components' })
    }
  })

  // List entries for a month
  api.get('/payroll/entries', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const month = req.query?.month
    if (!month) return reply.code(400).send({ error: 'month query param is required (YYYY-MM-01)' })

    try {
      const { rows } = await pool.query(`
        SELECT ece.*, u.name as user_name, cc.name as component_name, cc.component_type,
               l.name as lead_name, l.bride_name, l.groom_name
        FROM employee_compensation_entries ece
        JOIN users u ON u.id = ece.user_id
        JOIN compensation_components cc ON cc.id = ece.component_id
        LEFT JOIN leads l ON l.id = ece.lead_id
        WHERE ece.month = $1
        ORDER BY u.name ASC, cc.id ASC
      `, [month])
      return reply.send(rows)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to fetch entries' })
    }
  })

  // Add compensation entry
  api.post('/payroll/entries', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { user_id, component_id, amount, month, lead_id, notes } = req.body || {}
    if (!user_id || !component_id || !amount || !month) {
      return reply.code(400).send({ error: 'user_id, component_id, amount, and month are required' })
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO employee_compensation_entries (user_id, component_id, amount, month, lead_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [user_id, component_id, Number(amount), month, lead_id || null, notes || null]
      )
      return reply.send(rows[0])
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to add entry' })
    }
  })

  // Monthly summary — per-user breakdown: base + variable − deductions = payable
  api.get('/payroll/summary', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const month = req.query?.month
    if (!month) return reply.code(400).send({ error: 'month query param is required (YYYY-MM-01)' })

    try {
      // Get all active profiles
      const profilesR = await pool.query(`
        SELECT ecp.*, u.name as user_name, u.email as user_email
        FROM employee_compensation_profiles ecp
        JOIN users u ON u.id = ecp.user_id
        WHERE ecp.is_active = true
        ORDER BY u.name ASC
      `)

      // Get all entries up to this month to compute carry-forward
      const allEntriesR = await pool.query(`
        SELECT ece.user_id, ece.month, cc.component_type, cc.is_variable, SUM(ece.amount) as total
        FROM employee_compensation_entries ece
        JOIN compensation_components cc ON cc.id = ece.component_id
        WHERE ece.month <= $1
        GROUP BY ece.user_id, ece.month, cc.component_type, cc.is_variable
      `, [month])

      const entryMap = {} // user_id -> current month data
      const historyMap = {} // user_id -> all past months data

      for (const e of allEntriesR.rows) {
        // e.month is a Javascript Date object. Convert to YYYY-MM-01 format string to match `month`.
        const eMonthStr = toISTDateString(e.month)

        if (eMonthStr === month) {
          if (!entryMap[e.user_id]) entryMap[e.user_id] = { base_earnings: 0, var_earnings: 0, deductions: 0 }
          const amount = Number(e.total)
          if (e.component_type === 'earning') {
            if (e.is_variable) entryMap[e.user_id].var_earnings += amount
            else entryMap[e.user_id].base_earnings += amount
          } else {
            entryMap[e.user_id].deductions += amount
          }
        } else {
          // Accumulate history to find carry forward
          if (!historyMap[e.user_id]) historyMap[e.user_id] = {}
          if (!historyMap[e.user_id][eMonthStr]) historyMap[e.user_id][eMonthStr] = { e: 0, d: 0 }

          if (e.component_type === 'earning') historyMap[e.user_id][eMonthStr].e += Number(e.total)
          else historyMap[e.user_id][eMonthStr].d += Number(e.total)
        }
      }

      // Calculate carry forward per user
      const carryForwardMap = {}
      for (const userId in historyMap) {
        // Sort months ascending
        const pastMonths = Object.keys(historyMap[userId]).sort()
        let runningBalance = 0

        for (const m of pastMonths) {
          const mData = historyMap[userId][m]
          const profile = profilesR.rows.find(p => p.user_id === Number(userId))
          const bAmount = profile?.employment_type === 'salaried' ? Number(profile.base_amount || 0) : 0

          const monthEarnings = mData.e + bAmount
          const monthDeductions = mData.d

          // Net for that month: Add to running balance. 
          // If they made more than deductions, it "pays off" negative running balance.
          runningBalance += (monthEarnings - monthDeductions)
          if (runningBalance > 0) runningBalance = 0
        }

        if (runningBalance < 0) {
          carryForwardMap[userId] = Math.abs(runningBalance)
        }
      }

      const payoutsR = await pool.query(`SELECT * FROM employee_payouts WHERE month = $1`, [month])

      const payoutMap = {}
      for (const p of payoutsR.rows) {
        payoutMap[p.user_id] = p
      }

      const summary = profilesR.rows.map(profile => {
        const entry = entryMap[profile.user_id] || { base_earnings: 0, var_earnings: 0, deductions: 0 }
        const payout = payoutMap[profile.user_id] || null
        const carryForward = carryForwardMap[profile.user_id] || 0

        const baseAmount = profile.employment_type === 'salaried' ? Number(profile.base_amount || 0) : 0

        // Automatically include the employee's base salary in their earnings.
        // If there are also manual base adjustments (entry.base_earnings), add them.
        const totalEarnings = baseAmount + entry.var_earnings + entry.base_earnings
        const totalDeductions = entry.deductions
        const payable = totalEarnings - totalDeductions - carryForward

        return {
          user_id: profile.user_id,
          user_name: profile.user_name,
          user_email: profile.user_email,
          employment_type: profile.employment_type,
          base_amount: profile.base_amount,
          base_earnings: entry.base_earnings, // explicit base entries
          var_earnings: entry.var_earnings,
          earnings: totalEarnings,
          deductions: totalDeductions,
          carry_forward: carryForward,
          payable,
          total_paid: payout ? Number(payout.total_paid) : 0,
          payout_id: payout?.id || null,
          payout_date: payout?.payout_date || null,
        }
      })

      return reply.send(summary)
    } catch (err) {
      req.log.error(err)
      return reply.code(500).send({ error: 'Failed to compute summary' })
    }
  })


}
