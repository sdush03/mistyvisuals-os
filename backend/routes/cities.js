module.exports = async function(api, opts) {
  const {
    pool,
  } = opts;

  /* ===================== CITIES ===================== */

  api.get('/cities', async () =>
    (await pool.query(
      `SELECT id, name, state, country FROM cities ORDER BY name`
    )).rows
  )


}
