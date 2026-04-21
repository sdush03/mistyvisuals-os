module.exports = async function(fastify, opts) {
  const {
    requireAdmin,
    requireAuth,
    pool,
  } = opts;

/* ===================== TESTIMONIALS ===================== */
fastify.get('/api/testimonials', async (req, reply) => {
  const auth = requireAuth(req, reply)
  if (!auth) return
  const { rows } = await pool.query(`SELECT * FROM testimonials ORDER BY created_at DESC`)
  reply.send(rows)
})

fastify.post('/api/testimonials', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { couple_names, testimonial_text, media_url, media_type } = req.body || {}
  try {
    const { rows } = await pool.query(
      `INSERT INTO testimonials (couple_names, testimonial_text, media_url, media_type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [couple_names, testimonial_text, media_url, media_type || 'photo']
    )
    reply.send(rows[0])
  } catch(err) {
    reply.code(500).send({ error: 'Failed to save testimonial.' })
  }
})

fastify.patch('/api/testimonials/:id', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { id } = req.params
  const { couple_names, testimonial_text, media_url, media_type } = req.body || {}
  try {
    const { rows } = await pool.query(
      `UPDATE testimonials 
       SET couple_names=$1, testimonial_text=$2, media_url=$3, media_type=$4, updated_at=NOW() 
       WHERE id=$5 RETURNING *`,
      [couple_names, testimonial_text, media_url, media_type, id]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Not found.' })
    reply.send(rows[0])
  } catch(err) {
    reply.code(500).send({ error: 'Failed to update testimonial.' })
  }
})

fastify.delete('/api/testimonials/:id', async (req, reply) => {
  const auth = requireAdmin(req, reply)
  if (!auth) return
  const { id } = req.params
  const numId = Number(id)
  // Check if this testimonial is referenced in any proposal snapshot
  const ref = await pool.query(
    `SELECT 1 FROM proposal_snapshots WHERE snapshot_json::text LIKE $1 LIMIT 1`,
    [`%"id":${numId}%`]
  )
  if (ref.rows.length > 0) {
    // Referenced in a proposal — cannot delete, inform admin
    return reply.code(409).send({ 
      error: 'This testimonial is used in a sent proposal and cannot be permanently deleted. It has been hidden instead.',
      action: 'archived'
    })
  }
  // Not referenced — permanent delete
  await pool.query(`DELETE FROM testimonials WHERE id = $1`, [numId])
  reply.send({ success: true, action: 'deleted' })
})



}
