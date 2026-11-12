/**
 * syncProjectFromQuote.js
 *
 * Smart Sync Engine that synchronizes an active project when a revised
 * quote version (e.g. V3) is accepted/confirmed.
 *
 * Preserves:
 *  - Existing project_events IDs so questionnaire_schedules and team logs are NEVER orphaned
 *  - Live operational details on surviving events (venues, addresses, timings, notes)
 *  - Immutable payment ledger (invoice_payments & finance_transactions)
 *  - General client questionnaire (story, priorities, family tree, music, invitations)
 *  - Project slug, passcode, and public links
 *
 * Performs:
 *  - Soft-cancellation of removed events (status = 'cancelled', cancellation_reason)
 *  - Reschedule detection (updates date while keeping operational notes)
 *  - Insertion of newly contracted events
 *  - Rebalancing of invoice balances (New Total - Actual Payments Received)
 *  - Selective deliverable update (protects in-progress or delivered items)
 *  - Recalculation of project calendar bounds (start_date, end_date) and gallery dates
 */

const { pool } = require('../db')
const { sortProjectEvents } = require('./sortEvents')

function classifyDeliverableType(name) {
  if (!name) return 'other'
  const n = name.toLowerCase()
  if (n.includes('album')) return 'album'
  if (n.includes('teaser')) return 'teaser'
  if (n.includes('highlight')) return 'highlight'
  if (n.includes('reel')) return 'reels'
  if (n.includes('raw') || n.includes('data')) return 'raw_data'
  return 'other'
}

function cleanEventName(str) {
  if (!str) return ''
  return String(str)
     .replace(/^[^']+'s\s*/i, '')
     .replace(/\s*\([^)]*\)/g, '')
     .trim()
     .toLowerCase()
}

function formatLocalYMD(dateVal) {
  if (!dateVal) return null
  const d = new Date(dateVal)
  if (isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Synchronize project with quote version
 * @param {number|string} versionId - QuoteVersion ID
 * @param {object} options
 * @param {object} [options.client] - Optional active pg transaction client
 * @param {string} [options.cancellationReason] - Optional reason for any removed events
 */
async function syncProjectFromQuote(versionId, options = {}) {
  const isExternalClient = !!options.client
  const client = options.client || (await pool.connect())

  try {
    if (!isExternalClient) {
      await client.query('BEGIN')
    }

    // 1. Fetch Quote Version
    const qvRes = await client.query(
      `SELECT qv.id, qv.quote_group_id, qv.version_number, qv.draft_data_json,
              qv.calculated_price, qv.sales_override_price, qv.target_price,
              qg.lead_id, qg.title AS quote_title
       FROM quote_versions qv
       JOIN quote_groups qg ON qg.id = qv.quote_group_id
       WHERE qv.id = $1`,
      [Number(versionId)]
    )

    if (qvRes.rows.length === 0) {
      throw new Error(`Quote version ${versionId} not found`)
    }
    const version = qvRes.rows[0]
    const leadId = version.lead_id
    const draftData = version.draft_data_json || {}

    // 2. Locate Active Project
    const projRes = await client.query(
      `SELECT id, name, start_date, end_date, project_manager_id 
       FROM projects 
       WHERE lead_id = $1 OR quote_group_id = $2 
       ORDER BY created_at DESC LIMIT 1`,
      [leadId, version.quote_group_id]
    )

    if (projRes.rows.length === 0) {
      // No project exists yet — nothing to sync (normal conversion handles initial creation)
      if (!isExternalClient) await client.query('COMMIT')
      return { synced: false, reason: 'NO_PROJECT_EXISTS' }
    }
    const project = projRes.rows[0]
    const projectId = project.id

    // 3. Locate Snapshot ID
    const snapRes = await client.query(
      `SELECT id FROM proposal_snapshots WHERE quote_version_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [version.id]
    )
    const snapshotId = snapRes.rows[0]?.id || null

    // ── 4. SMART EVENT SYNC ───────────────────────────────────────────
    // Fetch currently active project events
    const currentEventsRes = await client.query(
      `SELECT * FROM project_events 
       WHERE project_id = $1 AND (status IS NULL OR status = 'active')
       ORDER BY event_date ASC, created_at ASC`,
      [projectId]
    )
    const currentEvents = sortProjectEvents(currentEventsRes.rows)

    const rawV3Events = Array.isArray(draftData.events) ? draftData.events : []
    const v3Events = rawV3Events.map(e => {
      let startTime = e.start_time || e.startTime || null
      let endTime = e.end_time || e.endTime || null
      if (!startTime && !endTime && e.time) {
        const parts = String(e.time).split('-').map(s => s.trim())
        if (parts.length === 2) {
          startTime = parts[0]
          endTime = parts[1]
        } else {
          startTime = e.time
        }
      }

      const origType = (e.originalType || '').trim()
      const customName = (e.name || e.event_type || e.eventType || e.type || '').trim()
      let eventType = null
      if (origType) {
        const hasGroomOrBride = /\(\s*(groom|bride)\s*\)/i.test(origType)
        eventType = (hasGroomOrBride && customName) ? customName : origType
      } else {
        eventType = customName || null
      }

      const eventDate = e.date || e.event_date ? formatLocalYMD(e.date || e.event_date) : null

      return {
        id: e.id,
        project_event_id: e.project_event_id || null,
        lead_event_id: e.lead_event_id ? Number(e.lead_event_id) : null,
        event_type: eventType,
        event_date: eventDate,
        pax: e.pax ? Number(e.pax) : null,
        venue: e.venue || e.venueName || e.location || null,
        venue_address: e.venueAddress || e.venue_address || null,
        start_time: startTime,
        end_time: endTime,
        slot: e.slot || null,
        notes: e.notes || null,
      }
    })

    const matchedProjectEventIds = new Set()
    const matchedV3Indices = new Set()

    // Pass A: Match by explicit project_event_id or direct ID match
    for (let i = 0; i < v3Events.length; i++) {
      const v3 = v3Events[i]
      const match = currentEvents.find(ce => 
        (v3.project_event_id && ce.id === v3.project_event_id) || 
        (v3.id && ce.id === v3.id)
      )
      if (match && !matchedProjectEventIds.has(match.id)) {
        matchedProjectEventIds.add(match.id)
        matchedV3Indices.add(i)
        // Check date change (reschedule)
        if (v3.event_date && v3.event_date !== formatLocalYMD(match.event_date)) {
          await client.query(
            `UPDATE project_events SET event_date = $1, is_verified = false WHERE id = $2`,
            [v3.event_date, match.id]
          )
        }
      }
    }

    // Pass B: Match by lead_event_id
    for (let i = 0; i < v3Events.length; i++) {
      if (matchedV3Indices.has(i)) continue
      const v3 = v3Events[i]
      if (!v3.lead_event_id) continue
      const match = currentEvents.find(ce => !matchedProjectEventIds.has(ce.id) && ce.lead_event_id === v3.lead_event_id)
      if (match) {
        matchedProjectEventIds.add(match.id)
        matchedV3Indices.add(i)
        if (v3.event_date && v3.event_date !== formatLocalYMD(match.event_date)) {
          await client.query(
            `UPDATE project_events SET event_date = $1, is_verified = false WHERE id = $2`,
            [v3.event_date, match.id]
          )
        }
      }
    }

    // Pass C: Match by cleaned event_type
    for (let i = 0; i < v3Events.length; i++) {
      if (matchedV3Indices.has(i)) continue
      const v3 = v3Events[i]
      const v3Clean = cleanEventName(v3.event_type)
      if (!v3Clean) continue

      const match = currentEvents.find(ce => 
        !matchedProjectEventIds.has(ce.id) && 
        cleanEventName(ce.event_type) === v3Clean
      )
      if (match) {
        matchedProjectEventIds.add(match.id)
        matchedV3Indices.add(i)
        // Check if rescheduled
        if (v3.event_date && v3.event_date !== formatLocalYMD(match.event_date)) {
          await client.query(
            `UPDATE project_events SET event_date = $1, is_verified = false WHERE id = $2`,
            [v3.event_date, match.id]
          )
        }
      }
    }

    // Insert newly added events from V3
    for (let i = 0; i < v3Events.length; i++) {
      if (matchedV3Indices.has(i)) continue
      const v3 = v3Events[i]
      await client.query(
        `INSERT INTO project_events 
          (project_id, lead_event_id, event_type, event_date, pax, venue, venue_address, start_time, end_time, slot, notes, is_verified, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, 'active')`,
        [
          projectId,
          v3.lead_event_id || null,
          v3.event_type,
          v3.event_date,
          v3.pax,
          v3.venue,
          v3.venue_address,
          v3.start_time,
          v3.end_time,
          v3.slot,
          v3.notes,
        ]
      )
    }

    // Soft-cancel removed events
    const defaultReason = options.cancellationReason || `Removed in revised quote V${version.version_number}`
    const cancelledList = Array.isArray(draftData.cancelledEvents) ? draftData.cancelledEvents : []
    for (const cur of currentEvents) {
      if (!matchedProjectEventIds.has(cur.id)) {
        const found = cancelledList.find(c => 
          (c.eventId && (c.eventId === cur.id || c.eventId === cur.lead_event_id)) ||
          (c.name && cleanEventName(c.name) === cleanEventName(cur.event_type))
        )
        const reason = (found && found.reason && found.reason.trim()) ? found.reason.trim() : defaultReason

        await client.query(
          `UPDATE project_events 
           SET status = 'cancelled', cancellation_reason = $1 
           WHERE id = $2`,
          [reason, cur.id]
        )
      }
    }

    // ── 5. RECALCULATE PROJECT CALENDAR BOUNDS & GALLERY DATES ─────────
    const activeDatesRes = await client.query(
      `SELECT event_date FROM project_events 
       WHERE project_id = $1 AND (status IS NULL OR status = 'active') 
         AND event_date IS NOT NULL AND event_date != '2099-01-01'::date
       ORDER BY event_date ASC`,
      [projectId]
    )
    const validDates = activeDatesRes.rows.map(r => formatLocalYMD(r.event_date)).filter(Boolean)
    const newStartDate = validDates[0] || null
    const newEndDate = validDates[validDates.length - 1] || null

    await client.query(
      `UPDATE projects 
       SET start_date = $1, end_date = $2, quote_group_id = $3, quote_version_id = $4, proposal_snapshot_id = $5
       WHERE id = $6`,
      [newStartDate, newEndDate, version.quote_group_id, version.id, snapshotId, projectId]
    )

    if (newStartDate) {
      await client.query(
        `UPDATE gallery_events SET date = $1 WHERE project_id = $2::text`,
        [new Date(newStartDate), String(projectId)]
      ).catch(() => {})
    }

    // ── 6. DELIVERABLES SYNC ──────────────────────────────────────────
    const currentDelsRes = await client.query(
      `SELECT id, title, type, status FROM project_deliverables WHERE project_id = $1`,
      [projectId]
    )
    const currentDeliverables = currentDelsRes.rows

    // Extract V3 deliverables
    const rawPricingItems = draftData.pricingItems || []
    const v3Deliverables = []
    for (const item of rawPricingItems) {
      if (item.type === 'DELIVERABLE' || item.itemType === 'DELIVERABLE') {
        const title = item.title || item.name || item.label
        if (title) {
          v3Deliverables.push({
            title: title.trim(),
            type: classifyDeliverableType(title),
            quantity: Number(item.quantity || item.qty || 1)
          })
        }
      }
    }

    // Delete only un-started deliverables that are no longer present in V3
    for (const del of currentDeliverables) {
      const inV3 = v3Deliverables.find(d => d.title.toLowerCase() === del.title.toLowerCase())
      if (!inV3 && !['in_progress', 'delivered'].includes(del.status)) {
        await client.query(`DELETE FROM project_deliverables WHERE id = $1`, [del.id])
      }
    }

    // Insert new deliverables from V3
    for (const v3d of v3Deliverables) {
      const exists = currentDeliverables.find(cd => cd.title.toLowerCase() === v3d.title.toLowerCase())
      if (!exists) {
        await client.query(
          `INSERT INTO project_deliverables (project_id, title, type, quantity, notes)
           VALUES ($1, $2, $3, $4, null)`,
          [projectId, v3d.title, v3d.type, v3d.quantity]
        )
      }
    }

    // ── 7. FINANCIAL REBALANCING ───────────────────────────────────────
    // Calculate total amount from V3
    const activeTierId = draftData.selectedTierId || draftData.tiers?.find((t) => t.isPopular)?.id || draftData.tiers?.[0]?.id
    const selectedTier = draftData.tiers?.find((t) => t.id === activeTierId) || draftData.tiers?.[0] || null

    let totalAmount = null
    if (selectedTier) {
      if (selectedTier.discountedPrice != null && Number(selectedTier.discountedPrice) > 0) {
        totalAmount = Number(selectedTier.discountedPrice)
      } else if (selectedTier.overridePrice != null && Number(selectedTier.overridePrice) > 0) {
        totalAmount = Number(selectedTier.overridePrice)
      } else {
        totalAmount = Number(selectedTier.price ?? 0)
      }
    } else {
      totalAmount = Number(version.sales_override_price ?? version.calculated_price ?? version.target_price ?? draftData.totalAmount ?? 0)
    }
    if (!totalAmount || isNaN(totalAmount) || totalAmount < 0) totalAmount = 0

    // Resolve advance amount from V3
    let advanceAmount = 0
    const advanceCands = [draftData.advance, draftData.advanceAmount, draftData.advance_amount]
    for (const a of advanceCands) {
      const num = Number(a)
      if (!isNaN(num) && num > 0) {
        advanceAmount = num
        break
      }
    }
    if (advanceAmount === 0 && Array.isArray(draftData.paymentSchedule) && draftData.paymentSchedule.length > 0) {
      const advStep = draftData.paymentSchedule.find(s => {
        const lbl = String(s.stage || s.label || s.name || '').toLowerCase()
        return lbl.includes('advance') || lbl.includes('booking')
      }) || draftData.paymentSchedule[0]
      if (advStep) {
        const advPct = Number(advStep.percentage || advStep.percent || 0)
        if (advPct > 0 && totalAmount > 0) {
          advanceAmount = Math.round((advPct / 100) * totalAmount)
        } else if (advStep.amount) {
          advanceAmount = Number(advStep.amount) || 0
        }
      }
    }

    const invoiceRes = await client.query(
      `SELECT id, total_amount, advance_amount, balance_amount, status, metadata 
       FROM invoices WHERE project_id = $1 LIMIT 1`,
      [projectId]
    )

    if (invoiceRes.rows.length > 0) {
      const inv = invoiceRes.rows[0]
      const invoiceId = inv.id

      // Query actual money already collected via immutable ledger
      const paidRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS total_paid FROM invoice_payments WHERE invoice_id = $1`,
        [invoiceId]
      )
      const totalPaid = Number(paidRes.rows[0].total_paid || 0)

      const remainingBalance = Math.max(0, totalAmount - totalPaid)
      const isOverpaid = totalPaid > totalAmount
      const creditBalance = isOverpaid ? (totalPaid - totalAmount) : 0

      let invStatus = 'pending'
      if (remainingBalance === 0) {
        invStatus = 'paid'
      } else if (totalPaid > 0) {
        invStatus = 'partial'
      }

      let invMeta = inv.metadata || {}
      if (typeof invMeta === 'string') {
        try { invMeta = JSON.parse(invMeta) } catch {}
      }
      if (creditBalance > 0) {
        invMeta.credit_balance = creditBalance
      } else {
        delete invMeta.credit_balance
      }

      await client.query(
        `UPDATE invoices 
         SET total_amount = $1, balance_amount = $2, advance_amount = $3, 
             status = $4, is_verified = false, metadata = $5, updated_at = NOW() 
         WHERE id = $6`,
        [totalAmount, remainingBalance, advanceAmount, invStatus, JSON.stringify(invMeta), invoiceId]
      )

      // Rebuild line items from V3 pricing items
      await client.query(`DELETE FROM invoice_line_items WHERE invoice_id = $1`, [invoiceId])
      const lineItems = []
      for (const item of rawPricingItems) {
        if (item.type === 'DELIVERABLE' || item.type === 'TEAM' || item.itemType === 'DELIVERABLE' || item.itemType === 'TEAM_ROLE') {
          const amount = Number(item.price || item.rate || item.amount || item.unitPrice || item.totalPrice || 0)
          const quantity = Number(item.quantity || item.qty || 1)
          const description = item.title || item.name || item.label || 'Item'
          if (amount > 0) lineItems.push({ description, amount, quantity })
        }
      }
      const discount = Number(draftData.discount || 0)
      if (discount > 0) {
        lineItems.push({ description: 'Package Discount', amount: -discount, quantity: 1 })
      }
      for (const li of lineItems) {
        const lineTotal = Number(li.amount || 0) * Number(li.quantity || 1)
        await client.query(
          `INSERT INTO invoice_line_items (invoice_id, description, amount, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $3, $5)`,
          [invoiceId, li.description, li.amount, li.quantity, lineTotal]
        )
      }

      // Rebalance payment schedule: Preserve paid milestones, adjust unpaid milestones
      await client.query(
        `DELETE FROM invoice_payment_schedule WHERE invoice_id = $1 AND status != 'paid'`,
        [invoiceId]
      )

      if (remainingBalance > 0) {
        const maxPaidRes = await client.query(
          `SELECT COALESCE(MAX(step_order), 0) AS max_order FROM invoice_payment_schedule WHERE invoice_id = $1 AND status = 'paid'`,
          [invoiceId]
        )
        const baseStepOrder = Number(maxPaidRes.rows[0]?.max_order || 0) + 1

        const sched = Array.isArray(draftData.paymentSchedule) ? draftData.paymentSchedule : []
        const unpaidSteps = sched.filter(s => {
          const lbl = String(s.stage || s.label || s.name || '').toLowerCase()
          return !lbl.includes('advance') && !lbl.includes('booking')
        })

        if (unpaidSteps.length > 0) {
          const stepTotalPct = unpaidSteps.reduce((acc, s) => acc + (Number(s.percentage || s.percent || 0)), 0)
          let runningSum = 0
          for (let i = 0; i < unpaidSteps.length; i++) {
            const step = unpaidSteps[i]
            const label = step.stage || step.label || step.name || `Payment ${baseStepOrder + i}`
            const pct = Number(step.percentage || step.percent || 0)
            let amt
            if (i === unpaidSteps.length - 1) {
              amt = Math.max(0, remainingBalance - runningSum)
            } else {
              amt = stepTotalPct > 0
                ? Math.round((pct / stepTotalPct) * remainingBalance)
                : Math.round(remainingBalance / unpaidSteps.length)
              runningSum += amt
            }
            
            let dueDate = step.dueDate || step.due_date || null
            if (dueDate && isNaN(Date.parse(dueDate))) dueDate = null

            await client.query(
              `INSERT INTO invoice_payment_schedule (invoice_id, label, percentage, amount, due_date, step_order, status)
               VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
              [invoiceId, label, pct || null, amt, dueDate, baseStepOrder + i]
            )
          }
        } else {
          // Fallback balance milestone
          const balPct = totalAmount > 0 ? Math.round((remainingBalance / totalAmount) * 100) : 0
          await client.query(
            `INSERT INTO invoice_payment_schedule (invoice_id, label, percentage, amount, due_date, step_order, status)
             VALUES ($1, 'Balance Payment', $2, $3, NULL, $4, 'pending')`,
            [invoiceId, balPct, remainingBalance, baseStepOrder]
          )
        }
      }
    }

    // ── 8. SYNC LEAD PRICING & STATUS ─────────────────────────────────
    if (leadId && totalAmount > 0) {
      const quotedBaseAmount = selectedTier
        ? Number((selectedTier.overridePrice != null && Number(selectedTier.overridePrice) > 0)
            ? selectedTier.overridePrice
            : (selectedTier.price ?? totalAmount))
        : totalAmount
      const discountedAmount = (selectedTier?.discountedPrice != null && Number(selectedTier.discountedPrice) > 0)
        ? Number(selectedTier.discountedPrice)
        : null
      await client.query(
        `UPDATE leads 
         SET amount_quoted = $1, discounted_amount = $2, status = 'Converted', updated_at = NOW() 
         WHERE id = $3`,
        [quotedBaseAmount, discountedAmount, leadId]
      )
    }

    // ── 9. CREATE NOTIFICATION ─────────────────────────────────────────
    if (project.project_manager_id) {
      await client.query(
        `INSERT INTO notifications (user_id, title, message, category, type, is_action_required, link_url, created_at)
         VALUES ($1, $2, $3, 'PROJECT', 'WARNING', true, $4, NOW())`,
        [
          project.project_manager_id,
          'Project Scope Updated 🔄',
          `The project for ${project.name} was synchronized with revised quote V${version.version_number}.`,
          `/projects/${projectId}`
        ]
      ).catch(() => {})
    }

    if (!isExternalClient) {
      await client.query('COMMIT')
    }

    return { 
      synced: true, 
      projectId, 
      versionNumber: version.version_number,
      totalAmount,
      matchedEventsCount: matchedProjectEventIds.size,
      newEventsCount: v3Events.length - matchedV3Indices.size,
      cancelledEventsCount: currentEvents.length - matchedProjectEventIds.size
    }

  } catch (err) {
    if (!isExternalClient) {
      await client.query('ROLLBACK').catch(() => {})
    }
    console.error('[syncProjectFromQuote] Sync failed:', err)
    throw err
  } finally {
    if (!isExternalClient) {
      client.release()
    }
  }
}

module.exports = { syncProjectFromQuote }
