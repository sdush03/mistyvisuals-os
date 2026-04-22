const { Pool } = require('pg');
const pool = new Pool();
async function run() {
  try {
    const res = await pool.query(`
      SELECT tc.table_name, kcu.column_name, rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND kcu.table_name != 'leads'
        AND EXISTS (
           SELECT 1 FROM information_schema.constraint_column_usage ccu
           WHERE ccu.constraint_name = tc.constraint_name AND ccu.table_name = 'leads'
        );
    `);
    console.table(res.rows);
  } finally { pool.end(); }
}
run();
