require('dotenv').config({ path: './.env' });
const { pool } = require('./db');

async function run() {
  try {
    const eventRes = await pool.query(
      "SELECT id, slug, title FROM gallery_events WHERE slug = 'drishti-vaibhav-jun26'"
    );
    if (eventRes.rows.length === 0) {
      console.log("No event found for slug drishti-vaibhav-jun26");
      process.exit(0);
    }
    const event = eventRes.rows[0];
    console.log("Event:", event);

    const photosRes = await pool.query(
      "SELECT id, filename, \"r2Url\", \"thumbnailUrl\" FROM photos WHERE event_id = $1 ORDER BY id DESC LIMIT 20",
      [event.id]
    );
    console.log("Last 20 photos uploaded:");
    photosRes.rows.forEach(p => {
      console.log(`- ID: ${p.id} | Filename: ${p.filename} | r2Url: ${p.r2Url} | thumbnailUrl: ${p.thumbnailUrl}`);
    });
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}
run();
