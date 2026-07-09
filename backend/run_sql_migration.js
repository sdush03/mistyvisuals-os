const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { pool } = require('./db');

async function run() {
  console.log('Connecting to database and running manual SQL migration...');
  
  const client = await pool.connect();
  try {
    // 1. Add gallery_faces_complete to gallery_events
    await client.query(`
      ALTER TABLE gallery_events 
      ADD COLUMN IF NOT EXISTS gallery_faces_complete BOOLEAN DEFAULT TRUE;
    `);
    console.log('Added column "gallery_faces_complete" to "gallery_events" table.');

    // 2. Add faces_scanned to photos
    await client.query(`
      ALTER TABLE photos 
      ADD COLUMN IF NOT EXISTS faces_scanned BOOLEAN DEFAULT TRUE;
    `);
    console.log('Added column "faces_scanned" to "photos" table.');

    // 3. Create index idx_photos_event_id_faces_scanned on photos(event_id, faces_scanned)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_photos_event_id_faces_scanned 
      ON photos(event_id, faces_scanned);
    `);
    console.log('Created index "idx_photos_event_id_faces_scanned" on "photos" table.');

    console.log('✅ SQL migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
