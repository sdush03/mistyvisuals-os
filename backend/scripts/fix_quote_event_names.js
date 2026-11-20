/**
 * Fix quote event names in quote_versions.draft_data_json and proposal_snapshots.snapshot_json
 * Restores proper personalization:
 *   "Mehndi (Bride)" -> "Bride's Mehndi"
 *   "Mehndi (Groom)" -> "Groom's Mehndi"
 *   Joint events -> "Bride & Groom's Event"
 *
 * Usage:
 *   node backend/scripts/fix_quote_event_names.js --lead 176
 *   node backend/scripts/fix_quote_event_names.js --version 588
 *   node backend/scripts/fix_quote_event_names.js --recent (last 60 days)
 *   node backend/scripts/fix_quote_event_names.js --all
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || undefined,
});

function getFirst(name) {
  return name ? name.trim().split(/\s+/)[0] : null;
}

function personalizeEventName(rawName, lead) {
  const raw = (rawName || '').trim();
  if (!raw) return rawName;
  const lower = raw.toLowerCase();
  const cLower = (lead?.coverage_scope || 'Both Sides').toLowerCase();
  const isBrideCov = cLower.includes('bride');
  const isGroomCov = cLower.includes('groom');
  const isBothCov = !isBrideCov && !isGroomCov;

  const brideFirst = getFirst(lead?.bride_name);
  const groomFirst = getFirst(lead?.groom_name);

  const hasBride = lower.includes('bride');
  const hasGroom = lower.includes('groom');
  const bothKnown = Boolean(brideFirst && groomFirst);

  let clean = raw.replace(/\s*\([^)]*bride[^)]*\)/i, '').replace(/\s*\([^)]*groom[^)]*\)/i, '').trim();
  if (clean.toLowerCase() === 'wedding' || clean.toLowerCase() === 'the wedding') clean = 'Wedding Day';

  if (isBothCov) {
    if (hasBride && !hasGroom && brideFirst) return `${brideFirst}'s ${clean}`;
    if (hasGroom && !hasBride && groomFirst) return `${groomFirst}'s ${clean}`;
    if (!hasBride && !hasGroom && bothKnown) return `${brideFirst} & ${groomFirst}'s ${clean}`;
  } else if (isBrideCov) {
    if ((hasBride || (!hasBride && !hasGroom)) && brideFirst) return `${brideFirst}'s ${clean}`;
  } else if (isGroomCov) {
    if ((hasGroom || (!hasBride && !hasGroom)) && groomFirst) return `${groomFirst}'s ${clean}`;
  }
  return clean || raw;
}

async function run() {
  const args = process.argv.slice(2);
  let filterClause = '';
  const filterParams = [];

  if (args.includes('--lead')) {
    const leadId = Number(args[args.indexOf('--lead') + 1]);
    filterParams.push(leadId);
    filterClause = `WHERE qg.lead_id = $${filterParams.length}`;
  } else if (args.includes('--version')) {
    const vId = Number(args[args.indexOf('--version') + 1]);
    filterParams.push(vId);
    filterClause = `WHERE qv.id = $${filterParams.length}`;
  } else if (args.includes('--recent') || (!args.includes('--all') && filterParams.length === 0)) {
    filterClause = `WHERE qv.created_at >= NOW() - INTERVAL '60 days'`;
  }

  const query = `
    SELECT 
      qv.id AS version_id,
      qv.quote_group_id,
      qv.status,
      qv.draft_data_json,
      qg.lead_id,
      l.bride_name,
      l.groom_name,
      l.coverage_scope,
      l.name AS lead_name
    FROM quote_versions qv
    JOIN quote_groups qg ON qg.id = qv.quote_group_id
    JOIN leads l ON l.id = qg.lead_id
    ${filterClause}
    ORDER BY qv.id ASC
  `;

  console.log(`[fix-quote-events] Fetching quotes with filter: ${filterClause || 'ALL'}...`);
  const { rows } = await pool.query(query, filterParams);
  console.log(`[fix-quote-events] Found ${rows.length} quote versions to check.`);

  let totalUpdated = 0;

  for (const row of rows) {
    const draft = row.draft_data_json;
    if (!draft || !Array.isArray(draft.events) || draft.events.length === 0) continue;

    const leadInfo = {
      bride_name: row.bride_name,
      groom_name: row.groom_name,
      coverage_scope: row.coverage_scope,
    };

    // Also fetch the raw lead events from lead_events table to cross-reference in case originalType was lost
    const leadEvRes = await pool.query(
      `SELECT id, event_type, event_date, slot, start_time, end_time FROM lead_events WHERE lead_id = $1`,
      [row.lead_id]
    );
    const dbLeadEvents = leadEvRes.rows;

    let modified = false;
    const updatedEvents = draft.events.map((ev) => {
      // Find source event_type: 1) originalType, 2) matched DB lead event, 3) ev.name
      let sourceRaw = ev.originalType || '';
      if (!sourceRaw || (!sourceRaw.includes('(') && !sourceRaw.includes('Bride') && !sourceRaw.includes('Groom'))) {
        // Try cross-referencing with DB lead events by date and slot/time
        const match = dbLeadEvents.find(
          (le) =>
            (ev.date && String(le.event_date).slice(0, 10) === String(ev.date).slice(0, 10)) &&
            ((ev.slot && le.slot && ev.slot.toLowerCase() === le.slot.toLowerCase()) ||
             (ev.originalType && le.event_type && le.event_type.toLowerCase().includes(ev.originalType.toLowerCase())))
        );
        if (match && match.event_type) {
          sourceRaw = match.event_type;
        }
      }

      if (!sourceRaw) sourceRaw = ev.name || '';

      const personalized = personalizeEventName(sourceRaw, leadInfo);
      if (personalized && personalized !== ev.name) {
        console.log(`  Quote ${row.version_id} (Lead ${row.lead_id}): "${ev.name}" -> "${personalized}" [from "${sourceRaw}"]`);
        modified = true;
        return {
          ...ev,
          originalType: sourceRaw || ev.originalType,
          name: personalized,
        };
      }
      return ev;
    });

    if (modified) {
      const updatedDraft = { ...draft, events: updatedEvents };

      // 1. Update quote_versions
      await pool.query(
        `UPDATE quote_versions SET draft_data_json = $1 WHERE id = $2`,
        [JSON.stringify(updatedDraft), row.version_id]
      );

      // 2. Update proposal_snapshots if a snapshot exists
      const snapRes = await pool.query(
        `SELECT id, snapshot_json FROM proposal_snapshots WHERE quote_version_id = $1`,
        [row.version_id]
      );
      for (const snap of snapRes.rows) {
        if (snap.snapshot_json && snap.snapshot_json.draftData) {
          const updatedSnapJson = {
            ...snap.snapshot_json,
            draftData: {
              ...snap.snapshot_json.draftData,
              events: updatedEvents,
            },
          };
          await pool.query(
            `UPDATE proposal_snapshots SET snapshot_json = $1 WHERE id = $2`,
            [JSON.stringify(updatedSnapJson), snap.id]
          );
        }
      }

      totalUpdated++;
      console.log(`✅ Version ${row.version_id} updated successfully.`);
    }
  }

  console.log(`\n[fix-quote-events] Done! Total quote versions updated: ${totalUpdated}`);
  await pool.end();
}

run().catch((err) => {
  console.error('[fix-quote-events] Error:', err);
  process.exit(1);
});
