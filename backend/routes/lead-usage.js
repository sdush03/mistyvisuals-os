module.exports = async function(api, opts) {
  const {
    getAuthFromRequest,
    pool,
  } = opts;

  /* ===================== LEAD USAGE ===================== */

  api.post('/leads/:id/usage/start', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
    const { id } = req.params

    const r = await pool.query(
      `INSERT INTO lead_usage_logs (user_id, lead_id, entered_at)
     VALUES ($1,$2,NOW())
     RETURNING id, entered_at`,
      [auth.sub, id]
    )

    return r.rows[0]
  })

  api.post('/leads/:id/usage/end', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
    const { id } = req.params
    const usageId = req.body?.usage_id ? Number(req.body.usage_id) : null

    if (usageId) {
      const r = await pool.query(
        `
      UPDATE lead_usage_logs
      SET left_at=NOW(),
          duration_seconds=EXTRACT(EPOCH FROM (NOW() - entered_at))::int
      WHERE id=$1 AND user_id=$2 AND lead_id=$3 AND left_at IS NULL
      RETURNING id
      `,
        [usageId, auth.sub, id]
      )
      if (r.rows.length) return { success: true }
    }

    await pool.query(
      `
    WITH target AS (
      SELECT id FROM lead_usage_logs
      WHERE user_id=$1 AND lead_id=$2 AND left_at IS NULL
      ORDER BY entered_at DESC
      LIMIT 1
    )
    UPDATE lead_usage_logs
    SET left_at=NOW(),
        duration_seconds=EXTRACT(EPOCH FROM (NOW() - entered_at))::int
    WHERE id IN (SELECT id FROM target)
    `,
      [auth.sub, id]
    )

    return { success: true }
  })


}
