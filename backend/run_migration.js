const { pool } = require('./db');

async function run() {
  try {
    await pool.query('ALTER TABLE website_films ADD COLUMN youtube_url TEXT;');
    console.log('Added youtube_url');
  } catch (e) {
    console.error('youtube_url error:', e.message);
  }
  
  try {
    await pool.query('ALTER TABLE website_films ADD COLUMN youtube_video_id TEXT;');
    console.log('Added youtube_video_id');
  } catch (e) {
    console.error('youtube_video_id error:', e.message);
  }
  
  process.exit(0);
}

run();
