module.exports = async function(api, opts) {
  const {
    getDateRange,
    LEAD_STATUSES,
    pool,
  } = opts;

  /* ===================== REPORTS ===================== */

  api.get('/reports/funnel', async (req) => {
    const { from, to } = getDateRange(req.query)
    const r = await pool.query(
      `SELECT status, COUNT(*)::int count
     FROM leads
     WHERE created_at BETWEEN $1 AND $2
     GROUP BY status`,
      [from, to]
    )

    const map = Object.fromEntries(r.rows.map(x => [x.status, x.count]))
    return LEAD_STATUSES.map(s => ({ stage: s, count: map[s] || 0 }))
  })


}
