require('/Users/dushyantsaini/Documents/mistyvisuals-os/backend/node_modules/dotenv').config({ path: '/Users/dushyantsaini/Documents/mistyvisuals-os/backend/.env' });
const { pool } = require('/Users/dushyantsaini/Documents/mistyvisuals-os/backend/db');

async function run() {
  try {
    const res = await pool.query("SELECT * FROM schema_migrations ORDER BY applied_at DESC");
    console.log("Applied migrations:");
    console.log(res.rows.map(r => r.filename));
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
