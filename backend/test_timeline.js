const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/postgres' });

async function run() {
  try {
    const res = await pool.query('SELECT id, name, delivery_timeline FROM deliverable_catalog LIMIT 3');
    console.log("DB rows:", res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
