const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });
const pool = new Pool({});
async function run() {
  const result = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'next_followup_date'");
  console.log(result.rows);
  const q = await pool.query("SELECT CURRENT_DATE, CURRENT_TIMESTAMP, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AS ist_date");
  console.log(q.rows);
  process.exit();
}
run();
