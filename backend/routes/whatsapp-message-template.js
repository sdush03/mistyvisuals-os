module.exports = async function(api, opts) {
  const {
    getAuthFromRequest,
    pool,
  } = opts;

  /* ===================== WHATSAPP MESSAGE TEMPLATE ===================== */
  api.get('/leads/:id/whatsapp-message', async (req, reply) => {
    const { id } = req.params
    const auth = getAuthFromRequest(req)

    const lead = await pool.query(
      `SELECT name, status FROM leads WHERE id=$1`,
      [id]
    )

    if (!lead.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }

    const tpl = await pool.query(
      `SELECT message FROM whatsapp_templates WHERE stage=$1`,
      [lead.rows[0].status]
    )

    const raw =
      tpl.rows[0]?.message ||
      'Hey {{name}}, I am {{user}}. Let me know a good time to connect.'

    let userName = 'Misty Visuals Team'
    if (auth?.sub) {
      const userRes = await pool.query(
        `SELECT name FROM users WHERE id=$1`,
        [auth.sub]
      )
      if (userRes.rows[0]?.name) {
        userName = userRes.rows[0].name
      }
    }

    const resolved = raw
      .replace('{{name}}', lead.rows[0].name || '')
      .replace('{{user}}', userName)
      .replace('{{quote_link}}', 'https://mistyvisuals.in/quote')

    return { message: resolved }
  })


}
