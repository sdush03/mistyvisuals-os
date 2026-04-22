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
    const where = ["l.source = 'FB Ads'"];
    const params = [];
    const addParam = (v) => { params.push(v); return '$' + params.length };

    const date_from = "2026-03-20";
    const date_to = "2026-04-25";

    if (date_from) where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= ${addParam(date_from)}`)
    if (date_to) where.push(`(l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= ${addParam(date_to)}`)
    where.push(`(l.fb_is_spam = false OR l.fb_is_spam IS NULL)`) // 'hide'

    const query = `
        SELECT
          l.id, l.lead_number, l.name, l.phone_primary, l.email,
          l.status, l.source_name, l.city, l.event_type,
          l.client_budget_amount, l.amount_quoted,
          l.fb_lead_quality, l.fb_is_spam,
          l.created_at, l.updated_at,
          u.name AS assigned_user_name,
          (
            SELECT la.metadata
            FROM lead_activities la
            WHERE la.lead_id = l.id AND la.activity_type = 'lead_created'
            ORDER BY la.created_at ASC LIMIT 1
          ) AS creation_metadata,
          (
            SELECT min(la.created_at)
            FROM lead_activities la
            WHERE la.lead_id = l.id AND la.user_id IS NOT NULL 
            AND la.activity_type IN ('status_change', 'followup_done', 'note_added', 'proposal_sent')
          ) AS first_contact_at
        FROM leads l
        LEFT JOIN users u ON u.id = l.assigned_user_id
        WHERE ${where.join(' AND ')}
        ORDER BY l.created_at DESC
        LIMIT 10
    `;
    
    console.log("Running exactly the API query...");
    const rows = (await pool.query(query, params)).rows;
    console.log(`Endpoint query returned ${rows.length} rows.`);
    
    // Simulate mapping
    const leads = rows.map(row => {
      const meta = row.creation_metadata || {}
      const sm = meta.source_meta || {}
      const ctx = sm.ad_context || {}
      
      let response_minutes = null
      if (row.first_contact_at && row.created_at) {
         const diff = new Date(row.first_contact_at).getTime() - new Date(row.created_at).getTime()
         response_minutes = Math.max(0, Math.floor(diff / 60000))
      }

      return {
        id: row.id,
        name: row.name,
        campaign_name: ctx.campaign_name || null,
        ad_name: ctx.ad_name || null,
      }
    })
    
    for (const l of leads) {
      console.log(`- ID: ${l.id} | Name: ${l.name} | Campaign: ${l.campaign_name}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
