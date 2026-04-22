const { Pool } = require('pg')
require('dotenv').config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function run() {
  const params = []
  let leadFilter = ""
  console.log("Running query...")
  try {
    console.log("Testing dealSizeQuery...")
    await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT
        COALESCE(AVG(CASE WHEN status NOT IN ('Lost','Rejected') AND COALESCE(amount_quoted, client_budget_amount) > 0
          THEN COALESCE(amount_quoted, client_budget_amount) END), 0)::float AS avg_deal_size,
        COALESCE(AVG(CASE WHEN status = 'Converted' AND COALESCE(amount_quoted, client_budget_amount) > 0
          THEN COALESCE(amount_quoted, client_budget_amount) END), 0)::float AS avg_closed_deal_size
      FROM auth_leads
    `, params)

    console.log("Testing leadsVolumeQuery...")
    await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT
        SUM(CASE WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) THEN 1 ELSE 0 END)::int AS this_week,
        SUM(CASE WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) - interval '7 days'
                  AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') < date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) THEN 1 ELSE 0 END)::int AS last_week,
        SUM(CASE WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) THEN 1 ELSE 0 END)::int AS this_month,
        SUM(CASE WHEN (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) - interval '1 month'
                  AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') < date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) THEN 1 ELSE 0 END)::int AS last_month
      FROM auth_leads
    `, params)

    console.log("Testing staleQuery...")
    await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT l.id, l.name, l.status, l.heat,
        COALESCE(amount_quoted, client_budget_amount) as deal_value,
        (SELECT MAX(a.created_at) FROM lead_activities a WHERE a.lead_id = l.id) as last_activity
      FROM auth_leads l
      WHERE l.status NOT IN ('Converted', 'Lost', 'Rejected')
        AND NOT EXISTS (
          SELECT 1 FROM lead_activities a
          WHERE a.lead_id = l.id AND (a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - interval '7 days'
        )
      ORDER BY COALESCE(amount_quoted, client_budget_amount, 0) DESC
      LIMIT 5
    `, params)

    console.log("Testing monthlyTrendQuery...")
    await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT
        to_char(date_trunc('month', (converted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')), 'YYYY-MM') AS month,
        SUM(COALESCE(amount_quoted, client_budget_amount, 0))::float AS revenue,
        COUNT(*)::int AS deals
      FROM auth_leads
      WHERE status = 'Converted'
        AND converted_at IS NOT NULL
        AND (converted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - interval '6 months'
      GROUP BY date_trunc('month', (converted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'))
      ORDER BY date_trunc('month', (converted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')) ASC
    `, params)
    
    console.log("All OK!")
  } catch (err) {
    console.error("FAILED!!!", err)
  }
  process.exit(0)
}

run()
