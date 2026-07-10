require('/Users/dushyantsaini/Documents/mistyvisuals-os/backend/node_modules/dotenv').config({ path: '/Users/dushyantsaini/Documents/mistyvisuals-os/backend/.env' });
const { pool } = require('/Users/dushyantsaini/Documents/mistyvisuals-os/backend/db');
const { prisma } = require('/Users/dushyantsaini/Documents/mistyvisuals-os/backend/modules/quotation/prisma');

async function run() {
  const client = await pool.connect();
  try {
    // Find an accepted proposal snapshot that joins completely
    const snapRes = await pool.query(`
      SELECT ps.id
      FROM proposal_snapshots ps
      JOIN quote_versions qv ON qv.id = ps.quote_version_id
      JOIN quote_groups qg ON qg.id = qv.quote_group_id
      WHERE qv.status = 'ACCEPTED'
      LIMIT 1
    `);
    
    if (snapRes.rows.length === 0) {
      console.log("No accepted proposal snapshot with a valid quote group found.");
      return;
    }
    
    const id = snapRes.rows[0].id;
    console.log(`Testing with proposal snapshot ID: ${id}`);
    
    // Begin transaction
    await client.query('BEGIN');
    
    const { rows: [proposal] } = await client.query(`
      SELECT ps.proposal_token, ps.quote_version_id, qv.status, qg.lead_id, qg.title AS quote_title
      FROM proposal_snapshots ps
      JOIN quote_versions qv ON qv.id = ps.quote_version_id
      JOIN quote_groups qg ON qg.id = qv.quote_group_id
      WHERE ps.id = $1
    `, [id]);
    
    if (!proposal) {
      console.log("Proposal snapshot not found");
      return;
    }

    // Clean up existing projects and invoices to force full creation path
    await client.query("UPDATE projects SET invoice_id = NULL WHERE lead_id = $1", [proposal.lead_id]);
    await client.query("DELETE FROM invoices WHERE lead_id = $1", [proposal.lead_id]);
    await client.query("DELETE FROM projects WHERE lead_id = $1", [proposal.lead_id]);
    
    await client.query(`UPDATE leads SET status = 'Converted', converted_at = COALESCE(converted_at, NOW()), updated_at = NOW() WHERE id = $1`, [proposal.lead_id]);

    const { createProjectFromLead } = require('/Users/dushyantsaini/Documents/mistyvisuals-os/backend/utils/createProjectFromLead');
    const { invoiceResult } = await createProjectFromLead(proposal.lead_id, client);

    // If there is an advance amount, register it on the new invoice
    console.log("Querying quoteVersion with prisma...");
    const version = await prisma.quoteVersion.findUnique({
      where: { id: proposal.quote_version_id }
    });
    console.log("QuoteVersion found:", version ? "yes" : "no");

    if (invoiceResult && invoiceResult.invoiceId && invoiceResult.advanceAmount > 0) {
      await client.query(
        `INSERT INTO invoice_payments (invoice_id, amount, paid_at, method, note)
         VALUES ($1, $2, NOW(), 'manual', 'Advance payment confirmation')`,
        [invoiceResult.invoiceId, invoiceResult.advanceAmount]
      );
      await client.query(
        `UPDATE invoices SET advance_paid = TRUE, status = 'partial' WHERE id = $1`,
        [invoiceResult.invoiceId]
      );

      const desc = 'Advance payment - ' + (proposal.quote_title || `Lead ${proposal.lead_id}`);
      const catRes = await client.query(`SELECT id FROM finance_categories WHERE name = 'Package Advance' AND type = 'income' LIMIT 1`);
      const catId = catRes.rows.length ? catRes.rows[0].id : null;

      await client.query(
        `INSERT INTO finance_transactions (amount, type, direction, category_id, description, date, project_uuid, metadata)
         VALUES ($1, 'income', 'in', $2, $3, NOW()::date, $4, $5)`,
        [
          invoiceResult.advanceAmount,
          catId,
          desc,
          invoiceResult.projectId || null,
          JSON.stringify({ source: 'manual', invoice_id: invoiceResult.invoiceId })
        ]
      );
    }

    await client.query(
      `INSERT INTO lead_activities (lead_id, activity_type, metadata, created_at)
       VALUES ($1, 'status_change', $2, NOW())`,
      [proposal.lead_id, JSON.stringify({ notes: 'Lead converted manually. Project created.', log_type: 'activity' })]
    );

    console.log("Committing transaction...");
    await client.query('COMMIT');
    console.log("Transaction COMMITTED successfully!");
    
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
