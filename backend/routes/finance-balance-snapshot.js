module.exports = async function(api, opts) {
  const {
    pool,
  } = opts;

/* ===================== FINANCE — BALANCE SNAPSHOT ===================== */

let balanceRefreshRunning = false

async function recalculateAccountBalances() {
  if (balanceRefreshRunning) return
  balanceRefreshRunning = true
  try {
    await pool.query(
      `
      WITH sums AS (
        SELECT money_source_id,
               SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) as balance
        FROM finance_transactions
        WHERE is_deleted = false
        GROUP BY money_source_id
      ),
      rows AS (
        SELECT ms.id as money_source_id, COALESCE(s.balance, 0) as balance
        FROM money_sources ms
        LEFT JOIN sums s ON s.money_source_id = ms.id
      )
      INSERT INTO finance_account_balances (money_source_id, balance, last_calculated_at)
      SELECT money_source_id, balance, NOW()
      FROM rows
      ON CONFLICT (money_source_id)
      DO UPDATE SET balance = EXCLUDED.balance, last_calculated_at = EXCLUDED.last_calculated_at
      `
    )
  } catch (err) {
    if (err?.code !== '42P01') {
      console.warn('Balance refresh failed:', err?.message || err)
    }
  } finally {
    balanceRefreshRunning = false
  }
}


}
