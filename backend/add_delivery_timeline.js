const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/mistyvisuals' });

async function run() {
  try {
    await pool.query(`ALTER TABLE deliverable_catalog ADD COLUMN IF NOT EXISTS delivery_timeline TEXT`);
    console.log("Added delivery_timeline to deliverable_catalog");
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
