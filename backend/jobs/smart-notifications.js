/**
 * smart-notifications.js
 * Daily background job that fires contextual notifications:
 *
 *  1. Lead has had no follow-up for >= 10 days (Sales owner + Admin)
 *  2. Follow-up date is today or overdue (Sales owner)
 *  3. Non-admin user hasn't logged in for >= 2 days (Admin)
 *  4. Lead's first event date has passed but status is still not Converted or Lost (Admin + Sales owner)
 *
 * Uses a dedup guard (smart_notification_log table) so the same alert
 * is never sent twice on the same calendar day for the same subject.
 */

module.exports = function installSmartNotifications({ pool, createNotification }) {
  let running = false

  // ─── Dedup helper ────────────────────────────────────────────────────────────
  // Returns true if we already fired this notif today for this key.
  async function alreadySentToday(key) {
    try {
      const r = await pool.query(
        `SELECT 1 FROM smart_notification_log
         WHERE notif_key = $1
           AND sent_date = CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'`,
        [key]
      )
      return r.rows.length > 0
    } catch {
      return false
    }
  }

  async function markSent(key) {
    try {
      await pool.query(
        `INSERT INTO smart_notification_log (notif_key, sent_date)
         VALUES ($1, CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')
         ON CONFLICT (notif_key, sent_date) DO NOTHING`,
        [key]
      )
    } catch {}
  }

  // ─── Helper: fire a notification + mark dedup ─────────────────────────────
  async function sendOnce(key, notifArgs) {
    if (await alreadySentToday(key)) return
    await createNotification(notifArgs)
    await markSent(key)
  }

  // ─── 1. No follow-up in >= 10 days ───────────────────────────────────────
  async function checkNoFollowupFor10Days() {
    // Active leads (not Converted / Lost / Rejected) where last_note_at or
    // last_followup_done_at is > 10 days ago (or never).
    const { rows } = await pool.query(`
      SELECT
        l.id,
        l.name,
        l.bride_name,
        l.groom_name,
        l.assigned_user_id,
        GREATEST(
          l.updated_at,
          (SELECT MAX(created_at) FROM lead_notes WHERE lead_id = l.id),
          (SELECT MAX(created_at) FROM lead_activities
           WHERE lead_id = l.id AND activity_type = 'followup_done')
        ) AS last_activity_at
      FROM leads l
      WHERE l.status NOT IN ('Converted','Lost','Rejected')
        AND l.assigned_user_id IS NOT NULL
      HAVING GREATEST(
        l.updated_at,
        (SELECT MAX(created_at) FROM lead_notes WHERE lead_id = l.id),
        (SELECT MAX(created_at) FROM lead_activities
         WHERE lead_id = l.id AND activity_type = 'followup_done')
      ) < NOW() - INTERVAL '10 days'
      OR GREATEST(
        l.updated_at,
        (SELECT MAX(created_at) FROM lead_notes WHERE lead_id = l.id),
        (SELECT MAX(created_at) FROM lead_activities
         WHERE lead_id = l.id AND activity_type = 'followup_done')
      ) IS NULL
      GROUP BY l.id
    `)

    for (const lead of rows) {
      const clientName = lead.name ||
        [lead.bride_name, lead.groom_name].filter(Boolean).join(' & ') ||
        `Lead #${lead.id}`

      // Notify sales owner
      const salesKey = `no_followup_10d_sales_${lead.id}`
      await sendOnce(salesKey, {
        userId: lead.assigned_user_id,
        title: '⏰ No Follow-Up in 10 Days',
        message: `${clientName} hasn't had any follow-up in over 10 days. Time to reach out!`,
        category: 'LEAD',
        type: 'WARNING',
        linkUrl: `/leads/${lead.id}`,
      })

      // Notify admin
      const adminKey = `no_followup_10d_admin_${lead.id}`
      await sendOnce(adminKey, {
        roleTarget: 'admin',
        title: '⏰ Lead Idle for 10+ Days',
        message: `${clientName} (Lead #${lead.id}) has had no activity for 10+ days.`,
        category: 'LEAD',
        type: 'WARNING',
        linkUrl: `/leads/${lead.id}`,
      })
    }
  }

  // ─── 2. Follow-up date is today or overdue ────────────────────────────────
  async function checkOverdueFollowups() {
    const { rows } = await pool.query(`
      SELECT
        l.id,
        l.name,
        l.bride_name,
        l.groom_name,
        l.assigned_user_id,
        l.next_followup_date
      FROM leads l
      WHERE l.status NOT IN ('Converted','Lost','Rejected')
        AND l.assigned_user_id IS NOT NULL
        AND l.next_followup_date IS NOT NULL
        AND l.next_followup_date <= (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')
    `)

    for (const lead of rows) {
      const clientName = lead.name ||
        [lead.bride_name, lead.groom_name].filter(Boolean).join(' & ') ||
        `Lead #${lead.id}`

      const followupDateStr = lead.next_followup_date
        ? new Date(lead.next_followup_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : 'today'

      const isOverdue = lead.next_followup_date &&
        new Date(lead.next_followup_date) < new Date(new Date().toDateString())

      const key = `overdue_followup_${lead.id}`
      await sendOnce(key, {
        userId: lead.assigned_user_id,
        title: isOverdue ? '🔴 Overdue Follow-Up' : '📅 Follow-Up Due Today',
        message: isOverdue
          ? `Follow-up for ${clientName} was due on ${followupDateStr} and is still pending.`
          : `Your follow-up with ${clientName} is scheduled for today.`,
        category: 'LEAD',
        type: 'WARNING',
        linkUrl: `/leads/${lead.id}`,
      })
    }
  }

  // ─── 3. Non-admin user inactive for >= 2 days ─────────────────────────────
  async function checkInactiveUsers() {
    const { rows } = await pool.query(`
      SELECT
        u.id,
        COALESCE(u.name, u.email) AS display_name,
        u.email,
        MAX(s.login_at) AS last_login_at
      FROM users u
      LEFT JOIN user_sessions s ON s.user_id = u.id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id AND r.key = 'admin'
      WHERE r.key IS NULL  -- not an admin
      GROUP BY u.id, u.name, u.email
      HAVING MAX(s.login_at) < NOW() - INTERVAL '2 days'
         OR MAX(s.login_at) IS NULL
    `)

    for (const user of rows) {
      const key = `inactive_user_${user.id}`
      const lastSeen = user.last_login_at
        ? new Date(user.last_login_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : 'never'

      await sendOnce(key, {
        roleTarget: 'admin',
        title: '👤 Inactive Team Member',
        message: `${user.display_name} hasn't logged in since ${lastSeen}.`,
        category: 'TEAM',
        type: 'INFO',
        linkUrl: `/admin/users`,
      })
    }
  }

  // ─── 4. Event date passed, lead not Converted or Lost ─────────────────────
  async function checkEventDatePassedNotConverted() {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (l.id)
        l.id,
        l.name,
        l.bride_name,
        l.groom_name,
        l.assigned_user_id,
        l.status,
        MIN(e.event_date) AS first_event_date
      FROM leads l
      JOIN lead_events e ON e.lead_id = l.id
      WHERE l.status NOT IN ('Converted','Lost','Rejected')
        AND e.event_date < CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'
      GROUP BY l.id, l.name, l.bride_name, l.groom_name, l.assigned_user_id, l.status
    `)

    for (const lead of rows) {
      const clientName = lead.name ||
        [lead.bride_name, lead.groom_name].filter(Boolean).join(' & ') ||
        `Lead #${lead.id}`

      const eventDateStr = new Date(lead.first_event_date).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric'
      })

      // Admin
      const adminKey = `event_passed_admin_${lead.id}`
      await sendOnce(adminKey, {
        roleTarget: 'admin',
        title: '📋 Event Passed — Awaiting Update',
        message: `${clientName}'s event was on ${eventDateStr} but the lead is still "${lead.status}". Update needed.`,
        category: 'LEAD',
        type: 'WARNING',
        linkUrl: `/leads/${lead.id}`,
      })

      // Sales owner
      if (lead.assigned_user_id) {
        const salesKey = `event_passed_sales_${lead.id}`
        await sendOnce(salesKey, {
          userId: lead.assigned_user_id,
          title: '📋 Event Passed — Update Required',
          message: `${clientName}'s event was on ${eventDateStr}. Please mark the lead as Converted or Lost.`,
          category: 'LEAD',
          type: 'WARNING',
          linkUrl: `/leads/${lead.id}`,
        })
      }
    }
  }

  // ─── Main runner ──────────────────────────────────────────────────────────
  async function runSmartNotifications() {
    if (running) return
    running = true
    try {
      console.log('[smart-notifs] Running daily notification checks...')
      await checkNoFollowupFor10Days()
      await checkOverdueFollowups()
      await checkInactiveUsers()
      await checkEventDatePassedNotConverted()
      console.log('[smart-notifs] Done.')
    } catch (err) {
      console.error('[smart-notifs] Job error:', err?.message || err)
    } finally {
      running = false
    }
  }

  return { runSmartNotifications }
}
