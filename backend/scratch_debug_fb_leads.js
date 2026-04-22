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
          l.id, l.name, l.source,
          (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') as created_local,
          l.created_at as created_utc,
          la.metadata->'source_meta'->>'leadgen_id' as leadgen
        FROM leads l
        LEFT JOIN lead_activities la ON la.lead_id = l.id AND la.activity_type = 'lead_created'
        WHERE l.source = 'FB Ads' OR l.source = 'Facebook' OR l.id IN (129, 130, 131)
        ORDER BY l.created_at DESC
        LIMIT 5;
    `);
    
    console.log('Recent FB Leads / Target Leads:');
    for (const r of res.rows) {
      console.log(`ID: ${r.id} | Name: ${r.name} | Source: '${r.source}' | Created local: ${r.created_local} | UTC: ${r.created_utc} | Leadgen: ${r.leadgen}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
