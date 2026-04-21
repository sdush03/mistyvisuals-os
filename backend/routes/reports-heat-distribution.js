module.exports = async function(api, opts) {
  const {
    getDateRange,
    pool,
  } = opts;

  /* ===================== REPORTS: HEAT DISTRIBUTION ===================== */
  api.get('/reports/heat-distribution', async (req) =>
    (await pool.query(
      `SELECT heat, COUNT(*)::int count
     FROM leads
     WHERE status NOT IN ('Lost','Converted')
       AND updated_at BETWEEN $1 AND $2
     GROUP BY heat`,
      Object.values(getDateRange(req.query))
    )).rows
  )


}
