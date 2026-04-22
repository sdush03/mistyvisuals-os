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
    const r = await pool.query(
      `
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
        SUM(CASE WHEN next_followup_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 1 ELSE 0 END)::int AS due_today,
        SUM(CASE WHEN next_followup_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 1 ELSE 0 END)::int AS overdue
      FROM auth_leads
      WHERE next_followup_date IS NOT NULL
        AND status NOT IN ('New','Converted','Lost','Rejected')
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
      WHERE (lead_activities.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
    ),
    proposal_stats AS (
      SELECT
        COUNT(*)::int AS total_sent,
        SUM(CASE WHEN (ps.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 1 ELSE 0 END)::int AS sent_today,
        SUM(CASE WHEN (ps.last_viewed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 1 ELSE 0 END)::int AS viewed_today,
        SUM(CASE WHEN ps.snapshot_json->>'status' = 'ACCEPTED' THEN 1 ELSE 0 END)::int AS total_accepted,
        SUM(CASE WHEN ps.view_count > 0 THEN 1 ELSE 0 END)::int AS total_viewed,
        (SELECT COUNT(*)::int FROM proposal_views pv JOIN proposal_snapshots pss ON pv.proposal_snapshot_id = pss.id JOIN quote_versions qqv ON pss.quote_version_id = qqv.id JOIN quote_groups qqg ON qqv.quote_group_id = qqg.id JOIN auth_leads ccl ON ccl.id = qqg.lead_id WHERE (pv.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AND NOT EXISTS (SELECT 1 FROM known_internal_ips WHERE ip = pv.ip) AND NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE ip = pv.ip LIMIT 1)) as views_logged_today
      FROM proposal_snapshots ps
      JOIN quote_versions qv ON ps.quote_version_id = qv.id
      JOIN quote_groups qg ON qv.quote_group_id = qg.id
      JOIN auth_leads sl ON sl.id = qg.lead_id
    )
    SELECT
      COALESCE((SELECT json_object_agg(status, count) FROM status_counts), '{}'::json) AS status_counts,
      COALESCE((SELECT json_object_agg(heat, count) FROM heat_counts), '{}'::json) AS heat_counts,
      COALESCE((SELECT json_build_object('today', due_today, 'overdue', overdue) FROM followups), '{}'::json) AS followups,
      COALESCE((SELECT json_build_object('important', important, 'potential', potential) FROM priority), '{}'::json) AS priority,
      COALESCE((SELECT json_object_agg(source, count) FROM source_counts), '{}'::json) AS source_counts,
      COALESCE((SELECT json_build_object('followups_completed', followups_completed, 'moved_to_negotiation', moved_to_negotiation) FROM today_activity), '{}'::json) AS today_activity,
      COALESCE((SELECT row_to_json(proposal_stats.*) FROM proposal_stats), '{}'::json) AS proposal_stats
    `, params)
    console.log("Success! Returned:", r.rows[0])
    
    // Test the other queries too just in case
    console.log("Testing revQuery...")
    await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT 
        SUM(CASE WHEN status IN ('Quoted', 'Negotiation', 'Follow Up') THEN COALESCE(amount_quoted, client_budget_amount, 0) ELSE 0 END)::float as projected_revenue,
        SUM(CASE WHEN status = 'Converted' THEN COALESCE(amount_quoted, client_budget_amount, 0) ELSE 0 END)::float as converted_revenue
      FROM auth_leads
      WHERE status IN ('Quoted', 'Negotiation', 'Follow Up', 'Converted')
    `, params)
    
    console.log("Testing feedQuery...")
    await pool.query(`
      WITH auth_leads AS (SELECT * FROM leads ${leadFilter})
      SELECT 
        a.id,
        a.activity_type,
        a.metadata,
        a.created_at,
        l.id as lead_id,
        l.name as lead_name
      FROM lead_activities a
      JOIN auth_leads l ON l.id = a.lead_id
      ORDER BY a.created_at DESC
      LIMIT 12
    `, params)
    console.log("All OK!")
  } catch (err) {
    console.error("FAILED!!!", err)
  }
  process.exit(0)
}

run()
