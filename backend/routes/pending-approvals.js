module.exports = async function(api, opts) {
  const {
    requireAuth,
    pool,
  } = opts;

  /* ===================== PENDING APPROVALS ===================== */

  api.get('/pending-approvals', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return
    const isAdmin = Array.isArray(auth.roles) ? auth.roles.includes('admin') : auth.role === 'admin'
    let userFilter = ""
    let params = []
    if (!isAdmin) {
       params.push(auth.sub)
       userFilter = `AND l.assigned_user_id = $1`
    }

    const baseSelect = `
        qv.id AS version_id,
        qv.version_number,
        qv.status,
        qv.calculated_price,
        qv.sales_override_price,
        qv.draft_data_json,
        to_char((qv.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+05:30"') AS submitted_at,
        qg.id AS group_id,
        qg.title AS quote_title,
        qg.lead_id,
        l.name AS lead_name,
        l.email AS lead_email
    `

    // 1. Pending approval
    const { rows: pending } = await pool.query(`
      SELECT ${baseSelect}
      FROM quote_versions qv
      JOIN quote_groups qg ON qg.id = qv.quote_group_id
      JOIN leads l ON l.id = qg.lead_id
      WHERE qv.status = 'PENDING_APPROVAL' ${userFilter}
      ORDER BY qv.created_at DESC
    `, params)

    // 2. Approved but NOT yet sent (disappears once a proposal_snapshot exists)
    const { rows: approved } = await pool.query(`
      SELECT ${baseSelect},
        to_char((qa.approved_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+05:30"') AS approved_at
      FROM quote_versions qv
      JOIN quote_groups qg ON qg.id = qv.quote_group_id
      JOIN leads l ON l.id = qg.lead_id
      LEFT JOIN quote_approvals qa ON qa.quote_version_id = qv.id
      WHERE qv.status = 'APPROVED' ${userFilter}
        AND qv.is_latest = true
        AND NOT EXISTS (
          SELECT 1 FROM proposal_snapshots ps WHERE ps.quote_version_id = qv.id
        )
      ORDER BY qa.approved_at DESC NULLS LAST, qv.created_at DESC
    `, params)

    // 3. Admin rejected — disappears once sales resubmits for approval (status changes to PENDING_APPROVAL)
    const { rows: rejected } = await pool.query(`
      SELECT ${baseSelect}
      FROM quote_versions qv
      JOIN quote_groups qg ON qg.id = qv.quote_group_id
      JOIN leads l ON l.id = qg.lead_id
      WHERE qv.status = 'ADMIN_REJECTED' ${userFilter}
      ORDER BY qv.created_at DESC
    `, params)

    return { pending, approved, rejected }
  })


}
