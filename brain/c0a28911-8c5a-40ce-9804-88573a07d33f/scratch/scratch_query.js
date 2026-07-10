require('/Users/dushyantsaini/Documents/mistyvisuals-os/backend/node_modules/dotenv').config({ path: '/Users/dushyantsaini/Documents/mistyvisuals-os/backend/.env' });
const { pool } = require('/Users/dushyantsaini/Documents/mistyvisuals-os/backend/db');

async function run() {
  try {
    const res = await pool.query(`
      SELECT ps.id AS snapshot_id, ps.quote_version_id, qv.quote_group_id, qg.id AS quote_group_table_id, qg.lead_id
      FROM proposal_snapshots ps
      LEFT JOIN quote_versions qv ON qv.id = ps.quote_version_id
      LEFT JOIN quote_groups qg ON qg.id = qv.quote_group_id
      WHERE ps.id = 36
    `);
    console.log("Joined result:", res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
