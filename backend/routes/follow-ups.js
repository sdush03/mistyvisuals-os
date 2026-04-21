module.exports = async function(api, opts) {
  const {
    getAuthFromRequest,
    FOLLOWUP_TYPES,
    pool,
  } = opts;

  /* ===================== FOLLOW UPS ===================== */

  api.get('/leads/:id/followups', async (req) =>
    (await pool.query(
      `SELECT * FROM lead_followups
     WHERE lead_id=$1
     ORDER BY follow_up_at ASC`,
      [req.params.id]
    )).rows
  )

  api.post('/leads/:id/followups', async (req, reply) => {
    const { followUpAt, type, note } = req.body
    const auth = getAuthFromRequest(req)
    if (!followUpAt || !FOLLOWUP_TYPES.includes(type))
      return reply.code(400).send({ error: 'Invalid follow-up' })

    const leadRes = await pool.query(`SELECT status FROM leads WHERE id=$1`, [req.params.id])
    if (!leadRes.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }
    if (['Converted', 'Lost', 'Rejected'].includes(leadRes.rows[0].status)) {
      return reply.code(400).send({ error: 'Follow-up not allowed for this status' })
    }

    const r = await pool.query(
      `INSERT INTO lead_followups (lead_id, follow_up_at, type, note, user_id)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
      [req.params.id, followUpAt, type, note || null, auth?.sub || null]
    )

    await pool.query(
      `UPDATE leads
     SET heat = CASE WHEN heat='Cold' THEN 'Warm' ELSE heat END,
         updated_at=NOW()
     WHERE id=$1 AND status NOT IN ('Lost','Converted','Rejected')`,
      [req.params.id]
    )

    return r.rows[0]
  })


}
