require('/Users/dushyantsaini/Documents/mistyvisuals-os/backend/node_modules/dotenv').config({ path: '/Users/dushyantsaini/Documents/mistyvisuals-os/backend/.env' });
const { pool } = require('/Users/dushyantsaini/Documents/mistyvisuals-os/backend/db');

async function run() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'invoice_line_items'
    `);
    console.log("invoice_line_items columns:");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
