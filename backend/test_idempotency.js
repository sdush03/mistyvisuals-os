const { pool } = require('./db');
const { createProjectFromLead } = require('./utils/createProjectFromLead');

async function run() {
  const client = await pool.connect();
  try {
    const leadRes = await client.query("SELECT id FROM leads ORDER BY created_at DESC LIMIT 1");
    if (leadRes.rows.length === 0) return console.log("No leads found");
    const leadId = leadRes.rows[0].id;
    
    console.log("Run 1:");
    const { projectId: proj1 } = await createProjectFromLead(leadId, client);
    console.log("Project 1 ID:", proj1);
    
    console.log("Run 2:");
    const { projectId: proj2 } = await createProjectFromLead(leadId, client);
    console.log("Project 2 ID:", proj2);
    
    // Clean up
    await client.query("DELETE FROM projects WHERE id = $1", [proj1]);
    console.log("Cleaned up test project");
  } finally {
    client.release();
    pool.end();
  }
}
run().catch(console.error);
