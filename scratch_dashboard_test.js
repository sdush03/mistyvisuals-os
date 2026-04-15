require('dotenv').config({ path: 'backend/.env' });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function run() {
  try {
    const leadFilter = '';
    const params = [];
    const r = await pool.query(`
    WITH auth_leads AS (SELECT * FROM leads ${leadFilter}),
    status_counts AS (
      SELECT status, COUNT(*)::int AS count
      FROM auth_leads
      GROUP BY status
    ),
    heat_counts AS (
      SELECT heat, COUNT(*)::int AS count
      FROM auth_leads
      WHERE status NOT IN ('Converted','Lost','Rejected')
      GROUP BY heat
    ),
    followups AS (
      SELECT
        SUM(CASE WHEN next_followup_date::date = CURRENT_DATE THEN 1 ELSE 0 END)::int AS due_today,
        SUM(CASE WHEN next_followup_date::date < CURRENT_DATE THEN 1 ELSE 0 END)::int AS overdue
      FROM auth_leads
      WHERE next_followup_date IS NOT NULL
        AND status NOT IN ('Converted','Lost','Rejected')
    ),
    priority AS (
      SELECT
        SUM(CASE WHEN important = true THEN 1 ELSE 0 END)::int AS important,
        SUM(CASE WHEN potential = true THEN 1 ELSE 0 END)::int AS potential
      FROM auth_leads
      WHERE status NOT IN ('Converted','Lost','Rejected')
    ),
    source_counts AS (
      SELECT COALESCE(NULLIF(source, ''), 'Unknown') AS source, COUNT(*)::int AS count
      FROM auth_leads
      GROUP BY COALESCE(NULLIF(source, ''), 'Unknown')
    ),
    today_activity AS (
      SELECT
        SUM(CASE WHEN activity_type = 'followup_done' THEN 1 ELSE 0 END)::int AS followups_completed,
        SUM(CASE WHEN activity_type = 'status_change' AND metadata->>'to' = 'Negotiation' THEN 1 ELSE 0 END)::int AS moved_to_negotiation
      FROM lead_activities
      JOIN auth_leads ON auth_leads.id = lead_activities.lead_id
      WHERE lead_activities.created_at::date = CURRENT_DATE
    ),
    proposal_stats AS (
      SELECT
        COUNT(*)::int AS total_sent,
        SUM(CASE WHEN ps.created_at::date = CURRENT_DATE THEN 1 ELSE 0 END)::int AS sent_today,
        SUM(CASE WHEN ps.last_viewed_at::date = CURRENT_DATE THEN 1 ELSE 0 END)::int AS viewed_today,
        SUM(CASE WHEN ps.snapshot_json->>'status' = 'ACCEPTED' THEN 1 ELSE 0 END)::int AS total_accepted,
        SUM(CASE WHEN ps.view_count > 0 THEN 1 ELSE 0 END)::int AS total_viewed,
        (SELECT COUNT(*)::int FROM proposal_views pv JOIN proposal_snapshots pss ON pv.proposal_snapshot_id = pss.id JOIN quote_versions qqv ON pss.quote_version_id = qqv.id JOIN auth_leads ccl ON ccl.id = qqv.lead_id WHERE pv.created_at::date = CURRENT_DATE) as views_logged_today
      FROM proposal_snapshots ps
      JOIN quote_versions qv ON ps.quote_version_id = qv.id
      JOIN auth_leads sl ON sl.id = qv.lead_id
    )
    SELECT
      COALESCE((SELECT json_object_agg(status, count) FROM status_counts), '{}'::json) AS status_counts,
      COALESCE((SELECT json_object_agg(heat, count) FROM heat_counts), '{}'::json) AS heat_counts,
      COALESCE((SELECT json_build_object('today', due_today, 'overdue', overdue) FROM followups), '{}'::json) AS followups,
      COALESCE((SELECT json_build_object('important', important, 'potential', potential) FROM priority), '{}'::json) AS priority,
      COALESCE((SELECT json_object_agg(source, count) FROM source_counts), '{}'::json) AS source_counts,
      COALESCE((SELECT json_build_object('followups_completed', followups_completed, 'moved_to_negotiation', moved_to_negotiation) FROM today_activity), '{}'::json) AS today_activity,
      COALESCE((SELECT row_to_json(proposal_stats.*) FROM proposal_stats), '{}'::json) AS proposal_stats
    `, params);
    console.log("Success! baseMetrics done.");
  } catch (e) {
    console.error("Error in baseMetrics:");
    console.error(e.message);
  }
  
  try {
    const params = [];
    const staleQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads)
      SELECT l.id, l.name, l.status, l.heat,
        COALESCE(amount_quoted, client_budget_amount) as deal_value,
        (SELECT MAX(a.created_at) FROM lead_activities a WHERE a.lead_id = l.id) as last_activity
      FROM auth_leads l
      WHERE l.status NOT IN ('Converted', 'Lost', 'Rejected')
        AND NOT EXISTS (
          SELECT 1 FROM lead_activities a
          WHERE a.lead_id = l.id AND a.created_at >= CURRENT_DATE - interval '7 days'
        )
      ORDER BY COALESCE(amount_quoted, client_budget_amount, 0) DESC
      LIMIT 5
    `, params);
    console.log("Success! stale done.");
  } catch (e) {
    console.error("Error in staleQuery:");
    console.error(e.message);
  }

  try {
    const params = [];
    const monthlyTrendQuery = await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads)
      SELECT
        to_char(date_trunc('month', converted_at), 'YYYY-MM') AS month,
        SUM(COALESCE(amount_quoted, client_budget_amount, 0))::float AS revenue,
        COUNT(*)::int AS deals
      FROM auth_leads
      WHERE status = 'Converted'
        AND converted_at IS NOT NULL
        AND converted_at >= CURRENT_DATE - interval '6 months'
      GROUP BY date_trunc('month', converted_at)
      ORDER BY date_trunc('month', converted_at) ASC
    `, params)
    console.log("Success! monthlyTrendQuery.");
  } catch (e) {
    console.error("Error in monthlyTrendQuery:");
    console.error(e.message);
  }

  process.exit();
}
run();
