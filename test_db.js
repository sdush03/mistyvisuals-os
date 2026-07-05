const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });
const pool = new Pool({});
async function run() {
  const result = await pool.query("SELECT * FROM lead_quotes WHERE lead_id = 4");
  console.log("Quotes rows:", result.rows);
  const v = await pool.query("SELECT * FROM lead_quote_versions WHERE quote_id IN (SELECT id FROM lead_quotes WHERE lead_id = 4)");
  console.log("Versions rows:", v.rows);
  process.exit();
}
run();
