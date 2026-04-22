require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});
async function run() {
  try {
    const res = await pool.query(`
        SELECT la.metadata, l.name
        FROM lead_activities la
        JOIN leads l ON l.id = la.lead_id
        WHERE la.activity_type = 'lead_created' AND l.source = 'FB Ads'
        ORDER BY la.created_at DESC
        LIMIT 3;
    `);
    
    for (const r of res.rows) {
      console.log('Lead:', r.name);
      console.log('Metadata Keys:', Object.keys(r.metadata || {}));
      console.log('Source Meta:', r.metadata?.source_meta);
      console.log('---');
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
