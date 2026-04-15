const fs = require('fs');
const file = '/Users/dushyantsaini/Documents/mistyvisuals-os/backend/server.js';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `  api.get('/dashboard/metrics', async () => {
    const r = await pool.query(
      \`
    WITH status_counts AS (
      SELECT status, COUNT(*)::int AS count
      FROM leads`;

const replaceStr = `  api.get('/dashboard/metrics', async (req) => {
    const auth = getAuthFromRequest(req)
    const isAdmin = auth ? (Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []).includes('admin') : false
    let leadFilter = ""
    let params = []
    if (!isAdmin && auth && auth.sub) {
       params.push(auth.sub)
       leadFilter = \`WHERE assigned_user_id = $1\`
    }

    const r = await pool.query(
      \`
    WITH auth_leads AS (SELECT * FROM leads \${leadFilter}),
    status_counts AS (
      SELECT status, COUNT(*)::int AS count
      FROM auth_leads`;

content = content.replace(targetStr, replaceStr);

// Globally replace "FROM leads" with "FROM auth_leads" ONLY within the /dashboard/metrics CTE query
// We can do this safely because after our replacement, we know where it starts.
// Actually, it's easier to just do explicit string replaces for all the dashboard queries.

// 1. the FROM leads inside heat_counts, followups, priority, source_counts
content = content.replace(/FROM leads\n      WHERE status NOT IN/g, "FROM auth_leads\n      WHERE status NOT IN");
content = content.replace(/FROM leads\n      GROUP BY COALESCE/g, "FROM auth_leads\n      GROUP BY COALESCE");

// 2. today_activity join
content = content.replace(/FROM lead_activities\n      WHERE created_at::date = CURRENT_DATE/g, "FROM lead_activities\n      JOIN auth_leads ON auth_leads.id = lead_activities.lead_id\n      WHERE created_at::date = CURRENT_DATE");

// 3. proposal_stats logic needs auth_leads joining
const oldProps = `        (SELECT COUNT(*)::int FROM proposal_views WHERE created_at::date = CURRENT_DATE) as views_logged_today
      FROM proposal_snapshots
    )
    SELECT`;
const newProps = `        (SELECT COUNT(*)::int FROM proposal_views pv JOIN quote_versions qqv ON pv.version_id = qqv.id JOIN auth_leads ccl ON ccl.id = qqv.lead_id WHERE pv.created_at::date = CURRENT_DATE) as views_logged_today
      FROM proposal_snapshots ps
      JOIN quote_versions qv ON ps.version_id = qv.id
      JOIN auth_leads sl ON sl.id = qv.lead_id
    )
    SELECT`;
content = content.replace(oldProps, newProps);

// 4. Update the r.rows[0] params
content = content.replace(/    \`\)\n    const baseMetrics = r\.rows\[0\]/, "    \`, params)\n    const baseMetrics = r.rows[0]");

// 5. revQuery
const oldRevQuery = `    const revQuery = await pool.query(\`
      SELECT 
        SUM(CASE WHEN status IN ('Quoted', 'Negotiation', 'Follow Up') THEN COALESCE(amount_quoted, client_budget_amount, 0) ELSE 0 END)::float as projected_revenue,
        SUM(CASE WHEN status = 'Converted' THEN COALESCE(amount_quoted, client_budget_amount, 0) ELSE 0 END)::float as converted_revenue
      FROM leads
      WHERE status IN ('Quoted', 'Negotiation', 'Follow Up', 'Converted')
    \`)`;
const newRevQuery = `    const revQuery = await pool.query(\`
      WITH auth_leads AS (SELECT * FROM leads \${leadFilter})
      SELECT 
        SUM(CASE WHEN status IN ('Quoted', 'Negotiation', 'Follow Up') THEN COALESCE(amount_quoted, client_budget_amount, 0) ELSE 0 END)::float as projected_revenue,
        SUM(CASE WHEN status = 'Converted' THEN COALESCE(amount_quoted, client_budget_amount, 0) ELSE 0 END)::float as converted_revenue
      FROM auth_leads
      WHERE status IN ('Quoted', 'Negotiation', 'Follow Up', 'Converted')
    \`, params)`;
content = content.replace(oldRevQuery, newRevQuery);

// 6. feedQuery
const oldFeedQuery = `    const feedQuery = await pool.query(\`
      SELECT 
        a.id,
        a.activity_type,
        a.metadata,
        a.created_at,
        l.id as lead_id,
        l.name as lead_name
      FROM lead_activities a
      JOIN leads l ON l.id = a.lead_id
      ORDER BY a.created_at DESC
      LIMIT 12
    \`)`;
const newFeedQuery = `    const feedQuery = await pool.query(\`
      WITH auth_leads AS (SELECT * FROM leads \${leadFilter})
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
    \`, params)`;
content = content.replace(oldFeedQuery, newFeedQuery);

// 7. dealSizeQuery
const oldDealSizeQuery = `    const dealSizeQuery = await pool.query(\`
      SELECT
        COALESCE(AVG(CASE WHEN status NOT IN ('Lost','Rejected') AND COALESCE(amount_quoted, client_budget_amount) > 0
          THEN COALESCE(amount_quoted, client_budget_amount) END), 0)::float AS avg_deal_size,
        COALESCE(AVG(CASE WHEN status = 'Converted' AND COALESCE(amount_quoted, client_budget_amount) > 0
          THEN COALESCE(amount_quoted, client_budget_amount) END), 0)::float AS avg_closed_deal_size
      FROM leads
    \`)`;
const newDealSizeQuery = `    const dealSizeQuery = await pool.query(\`
      WITH auth_leads AS (SELECT * FROM leads \${leadFilter})
      SELECT
        COALESCE(AVG(CASE WHEN status NOT IN ('Lost','Rejected') AND COALESCE(amount_quoted, client_budget_amount) > 0
          THEN COALESCE(amount_quoted, client_budget_amount) END), 0)::float AS avg_deal_size,
        COALESCE(AVG(CASE WHEN status = 'Converted' AND COALESCE(amount_quoted, client_budget_amount) > 0
          THEN COALESCE(amount_quoted, client_budget_amount) END), 0)::float AS avg_closed_deal_size
      FROM auth_leads
    \`, params)`;
content = content.replace(oldDealSizeQuery, newDealSizeQuery);

// 8. leadsVolumeQuery
const oldLeadsVolumeQuery = `    const leadsVolumeQuery = await pool.query(\`
      SELECT
        SUM(CASE WHEN created_at >= date_trunc('week', CURRENT_DATE) THEN 1 ELSE 0 END)::int AS this_week,
        SUM(CASE WHEN created_at >= date_trunc('week', CURRENT_DATE) - interval '7 days'
                  AND created_at < date_trunc('week', CURRENT_DATE) THEN 1 ELSE 0 END)::int AS last_week,
        SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int AS this_month,
        SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) - interval '1 month'
                  AND created_at < date_trunc('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int AS last_month
      FROM leads
    \`)`;
const newLeadsVolumeQuery = `    const leadsVolumeQuery = await pool.query(\`
      WITH auth_leads AS (SELECT * FROM leads \${leadFilter})
      SELECT
        SUM(CASE WHEN created_at >= date_trunc('week', CURRENT_DATE) THEN 1 ELSE 0 END)::int AS this_week,
        SUM(CASE WHEN created_at >= date_trunc('week', CURRENT_DATE) - interval '7 days'
                  AND created_at < date_trunc('week', CURRENT_DATE) THEN 1 ELSE 0 END)::int AS last_week,
        SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int AS this_month,
        SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) - interval '1 month'
                  AND created_at < date_trunc('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int AS last_month
      FROM auth_leads
    \`, params)`;
content = content.replace(oldLeadsVolumeQuery, newLeadsVolumeQuery);

// 9. staleQuery
const oldStaleQuery = `    const staleQuery = await pool.query(\`
      SELECT l.id, l.name, l.status, l.heat,
        COALESCE(amount_quoted, client_budget_amount) as deal_value,
        (SELECT MAX(a.created_at) FROM lead_activities a WHERE a.lead_id = l.id) as last_activity
      FROM leads l
      WHERE l.status NOT IN ('Converted', 'Lost', 'Rejected')
        AND NOT EXISTS (
          SELECT 1 FROM lead_activities a
          WHERE a.lead_id = l.id AND a.created_at >= CURRENT_DATE - interval '7 days'
        )
      ORDER BY COALESCE(amount_quoted, client_budget_amount, 0) DESC
      LIMIT 5
    \`)`;
const newStaleQuery = `    const staleQuery = await pool.query(\`
      WITH auth_leads AS (SELECT * FROM leads \${leadFilter})
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
    \`, params)`;
content = content.replace(oldStaleQuery, newStaleQuery);

// 10. monthlyTrendQuery
const oldMonthlyTrendQuery = `    const monthlyTrendQuery = await pool.query(\`
      SELECT
        to_char(date_trunc('month', converted_at), 'YYYY-MM') AS month,
        SUM(COALESCE(amount_quoted, client_budget_amount, 0))::float AS revenue,
        COUNT(*)::int AS deals
      FROM leads
      WHERE status = 'Converted'
        AND converted_at IS NOT NULL
        AND converted_at >= CURRENT_DATE - interval '6 months'
      GROUP BY date_trunc('month', converted_at)
      ORDER BY date_trunc('month', converted_at) ASC
    \`)`;
const newMonthlyTrendQuery = `    const monthlyTrendQuery = await pool.query(\`
      WITH auth_leads AS (SELECT * FROM leads \${leadFilter})
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
    \`, params)`;
content = content.replace(oldMonthlyTrendQuery, newMonthlyTrendQuery);

fs.writeFileSync(file, content);
console.log('Successfully patched dashboard metrics endpoint');
