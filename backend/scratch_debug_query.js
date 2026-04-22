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
        SELECT
          l.id, l.lead_number, l.name,
          l.status, l.source_name,
          l.fb_lead_quality, l.fb_is_spam,
          l.created_at, l.updated_at,
          (
            SELECT la.metadata
            FROM lead_activities la
            WHERE la.lead_id = l.id AND la.activity_type = 'lead_created'
            ORDER BY la.created_at ASC LIMIT 1
          ) AS creation_metadata
        FROM leads l
        WHERE l.source = 'FB Ads'
        ORDER BY l.created_at DESC
        LIMIT 10;
    `);
    
    console.log('Query results:');
    for (const r of res.rows) {
      console.log(`ID: ${r.id} | Name: ${r.name} | Spam: ${r.fb_is_spam}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
