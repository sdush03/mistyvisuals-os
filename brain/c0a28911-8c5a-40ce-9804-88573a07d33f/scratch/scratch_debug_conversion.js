require('/Users/dushyantsaini/Documents/mistyvisuals-os/backend/node_modules/dotenv').config({ path: '/Users/dushyantsaini/Documents/mistyvisuals-os/backend/.env' });
const { pool } = require('/Users/dushyantsaini/Documents/mistyvisuals-os/backend/db');
const { createProjectFromLead } = require('/Users/dushyantsaini/Documents/mistyvisuals-os/backend/utils/createProjectFromLead');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Find a lead that is accepted
    const leadRes = await client.query(`
      SELECT l.id, l.name
      FROM leads l
      JOIN quote_groups qg ON qg.lead_id = l.id
      JOIN quote_versions qv ON qv.quote_group_id = qg.id
      WHERE qv.status = 'ACCEPTED'
      LIMIT 1
    `);
    
    if (leadRes.rows.length === 0) {
      console.log("No accepted leads found in local DB.");
      const anyLead = await client.query("SELECT id, name FROM leads ORDER BY id DESC LIMIT 1");
      if (anyLead.rows.length === 0) {
        console.log("No leads at all.");
        return;
      }
      console.log(`Using lead ${anyLead.rows[0].id} (${anyLead.rows[0].name})`);
      await createProjectFromLead(anyLead.rows[0].id, client);
    } else {
      const leadId = leadRes.rows[0].id;
      console.log(`Attempting conversion for lead ${leadId} (${leadRes.rows[0].name})...`);
      const result = await createProjectFromLead(leadId, client);
      console.log("Success! Result:", result);
    }
  } catch (err) {
    console.error("TRANSACTION FAILED WITH ERROR:");
    console.error(err);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    pool.end();
  }
}

run();
