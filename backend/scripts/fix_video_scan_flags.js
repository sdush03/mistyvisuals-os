/**
 * fix_video_scan_flags.js
 * Ensures that video files, video covers, and cinema tab items always have faces_scanned = true.
 * Also synchronizes gallery_faces_complete to true for any galleries with zero pending backfill items.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  console.log('[Fix Video Flags] Running database synchronization...');

  // 1. Mark all video files, cinema items, and baked covers as faces_scanned = true
  const photosRes = await pool.query(`
    UPDATE photos 
    SET faces_scanned = true 
    WHERE (
      filename ILIKE '%.mp4' OR 
      filename ILIKE '%.mov' OR 
      filename ILIKE '%.m4v' OR 
      filename ILIKE '%.webm' OR 
      r2_url ILIKE '%.mp4' OR 
      r2_url ILIKE '%.mov' OR 
      r2_url ILIKE '%.m4v' OR 
      r2_url ILIKE '%.webm' OR 
      LOWER(tab_name) = 'cinema' OR
      (exif IS NOT NULL AND (exif->>'hasBakedCover' = 'true' OR exif->>'isCoverBaked' = 'true'))
    ) AND faces_scanned = false
  `);
  console.log(`[Fix Video Flags] Updated ${photosRes.rowCount} video/cover photos to faces_scanned = true.`);

  // 2. Synchronize gallery_faces_complete for events with zero pending photos
  const eventsRes = await pool.query(`
    UPDATE gallery_events
    SET gallery_faces_complete = true
    WHERE id NOT IN (
      SELECT DISTINCT event_id
      FROM photos
      WHERE (faces_scanned = false OR thumbnail_url IS NULL)
        AND (tab_name IS NULL OR LOWER(tab_name) != 'cinema')
        AND filename NOT ILIKE '%.mp4'
        AND filename NOT ILIKE '%.mov'
        AND filename NOT ILIKE '%.m4v'
        AND filename NOT ILIKE '%.webm'
        AND (r2_url IS NULL OR (
          r2_url NOT ILIKE '%.mp4' AND
          r2_url NOT ILIKE '%.mov' AND
          r2_url NOT ILIKE '%.m4v' AND
          r2_url NOT ILIKE '%.webm'
        ))
    ) AND gallery_faces_complete = false
  `);
  console.log(`[Fix Video Flags] Marked ${eventsRes.rowCount} complete galleries as gallery_faces_complete = true.`);

  await pool.end();
  console.log('[Fix Video Flags] Done.');
}

main().catch(err => {
  console.error('[Fix Video Flags] Error:', err);
  process.exit(1);
});
