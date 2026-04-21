module.exports = async function(api, opts) {
  const {
    getAuthFromRequest,
    logLeadActivity,
    pool,
  } = opts;

  /* ===================== QUOTES ===================== */
  api.get('/leads/:id/quotes', async (req, reply) => {
    const r = await pool.query(
      `SELECT
       q.id,
       q.lead_id,
       q.quote_number,
       q.generated_text,
       q.amount_quoted,
       q.discounted_amount,
       q.created_at,
       q.created_by,
       u.name AS created_by_name,
       u.nickname AS created_by_nickname,
       u.email AS created_by_email
     FROM lead_quotes q
     LEFT JOIN users u ON u.id = q.created_by
     WHERE q.lead_id = $1
     ORDER BY q.created_at DESC`,
      [req.params.id]
    )
    return r.rows
  })

  api.post('/leads/:id/quotes', async (req, reply) => {
    const { id } = req.params
    const { generated_text, amount_quoted, discounted_amount } = req.body || {}
    if (!generated_text || !String(generated_text).trim()) {
      return reply.code(400).send({ error: 'Generated text is required' })
    }
    const auth = getAuthFromRequest(req)
    const createdBy = auth?.sub || null

    const lastRes = await pool.query(
      `SELECT id, lead_id, quote_number, generated_text, amount_quoted, discounted_amount, created_at, created_by
     FROM lead_quotes
     WHERE lead_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
      [id]
    )
    if (lastRes.rows.length) {
      const last = lastRes.rows[0]
      const sameText = String(last.generated_text || '').trim() === String(generated_text || '').trim()
      const sameQuoted = String(last.amount_quoted ?? '') === String(amount_quoted ?? '')
      const sameDiscounted = String(last.discounted_amount ?? '') === String(discounted_amount ?? '')
      if (sameText && sameQuoted && sameDiscounted) {
        return { ...last, reused: true }
      }
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM lead_quotes WHERE lead_id = $1`,
      [id]
    )
    const nextIncrement = (countRes.rows[0]?.count || 0) + 1
    const quoteNumber = `MV-${id}-${nextIncrement}`

    const r = await pool.query(
      `INSERT INTO lead_quotes (
        lead_id,
        quote_number,
        generated_text,
        amount_quoted,
        discounted_amount,
        created_by
      )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, lead_id, quote_number, generated_text, amount_quoted, discounted_amount, created_at, created_by`,
      [
        id,
        quoteNumber,
        String(generated_text).trim(),
        amount_quoted ?? null,
        discounted_amount ?? null,
        createdBy,
      ]
    )

    if (!r.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }

    await logLeadActivity(
      id,
      'quote_generated',
      {
        log_type: 'activity',
        quote_id: r.rows[0].id,
        quote_number: r.rows[0].quote_number,
        amount_quoted: r.rows[0].amount_quoted ?? null,
        discounted_amount: r.rows[0].discounted_amount ?? null,
      },
      createdBy
    )

    return r.rows[0]
  })

  api.post('/leads/:id/quotes/share', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
    const { id } = req.params
    const { channel, quote_id, quote_number } = req.body || {}
    const safeChannel = channel || 'whatsapp'

    await logLeadActivity(
      id,
      'quote_shared_whatsapp',
      {
        log_type: 'activity',
        channel: safeChannel,
        quote_id: quote_id ?? null,
        quote_number: quote_number ?? null,
      },
      auth.sub || null
    )

    return { success: true }
  })

  api.patch('/leads/:id/proposal-draft', async (req, reply) => {
    const { id } = req.params
    const { proposal_draft } = req.body || {}
    if (proposal_draft !== null && typeof proposal_draft !== 'object') {
      return reply.code(400).send({ error: 'Invalid proposal draft' })
    }
    const r = await pool.query(
      `UPDATE leads
     SET proposal_draft = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING proposal_draft`,
      [proposal_draft ?? null, id]
    )
    if (!r.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }
    return r.rows[0]
  })


}
