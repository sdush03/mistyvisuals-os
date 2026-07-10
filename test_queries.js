const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });
const pool = new Pool();

async function run() {
  const queries = [
    `SELECT l.id, l.name, l.bride_name, l.groom_name, l.assigned_user_id FROM leads l WHERE l.status NOT IN ('Converted','Lost','Rejected') AND l.assigned_user_id IS NOT NULL AND (GREATEST(l.updated_at, (SELECT MAX(created_at) FROM lead_notes WHERE lead_id = l.id), (SELECT MAX(created_at) FROM lead_activities WHERE lead_id = l.id AND activity_type = 'followup_done')) < NOW() - INTERVAL '10 days' OR GREATEST(l.updated_at, (SELECT MAX(created_at) FROM lead_notes WHERE lead_id = l.id), (SELECT MAX(created_at) FROM lead_activities WHERE lead_id = l.id AND activity_type = 'followup_done')) IS NULL)`,
    `SELECT l.id, l.name, l.bride_name, l.groom_name, l.assigned_user_id, l.next_followup_date FROM leads l WHERE l.status NOT IN ('Converted','Lost','Rejected') AND l.assigned_user_id IS NOT NULL AND l.next_followup_date IS NOT NULL AND l.next_followup_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date`,
    `SELECT l.id, l.name, l.bride_name, l.groom_name, l.assigned_user_id, l.awaiting_advance_since FROM leads l WHERE l.status = 'Awaiting Advance' AND l.awaiting_advance_since IS NOT NULL AND l.awaiting_advance_since < NOW() - INTERVAL '48 hours'`,
    `SELECT qv.id AS version_id, qv.created_at AS submitted_at, qg.lead_id, qg.title AS quote_title, l.name, l.bride_name, l.groom_name FROM quote_versions qv JOIN quote_groups qg ON qg.id = qv.quote_group_id JOIN leads l ON l.id = qg.lead_id WHERE qv.status = 'PENDING_APPROVAL' AND qv.created_at < NOW() - INTERVAL '24 hours'`,
    `SELECT l.id, l.name, l.bride_name, l.groom_name, l.assigned_user_id, l.negotiation_since FROM leads l WHERE l.status = 'Negotiation' AND l.negotiation_since IS NOT NULL AND l.negotiation_since < NOW() - INTERVAL '7 days'`
  ];
  for (let i = 0; i < queries.length; i++) {
    try {
      await pool.query(queries[i]);
      console.log(`Query ${i} passed`);
    } catch (e) {
      console.error(`Query ${i} failed:`, e.message);
    }
  }
  process.exit(0);
}
run();
