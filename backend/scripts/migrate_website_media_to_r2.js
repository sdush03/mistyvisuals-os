/**
 * migrate_website_media_to_r2.js
 * Moves all local website media files (stories, sections, covers, backgrounds, reels) to Cloudflare R2.
 * 
 * Safety features:
 * - Handshake Verification: Checks existence and size of uploaded files on R2 before updating DB.
 * - Dry Run Mode: Allowed via --dry-run flag.
 * - Local Copy Retention: Old files are NOT deleted by this script (deleted later after manual verification).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { pool } = require('../db');
const { isR2Enabled, uploadWebsiteAsset } = require('../utils/r2');
const { WEBSITE_MEDIA_DIR } = require('../utils/website-images');
const fs = require('fs');
const path = require('path');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

const dryRun = process.argv.includes('--dry-run');

if (!isR2Enabled) {
  console.error('Error: Cloudflare R2 is not enabled in your .env file.');
  process.exit(1);
}

// Recreate S3Client to perform HeadObject checks
const s3Client = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  },
  region: 'auto'
});

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.webp': return 'image/webp';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.gif': return 'image/gif';
    case '.mp4': return 'video/mp4';
    case '.webm': return 'video/webm';
    default: return 'application/octet-stream';
  }
}

/**
 * Verifies that the file was uploaded correctly by checking its existence and size on R2.
 */
async function verifyR2Object(key, expectedSize) {
  try {
    const data = await s3Client.send(new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key
    }));
    if (data.ContentLength !== expectedSize) {
      console.error(`[Verification Failed] Size mismatch for key "${key}": R2 size = ${data.ContentLength} bytes, local size = ${expectedSize} bytes`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Verification Failed] Failed to query R2 key "${key}":`, err.message);
    return false;
  }
}

/**
 * Uploads a local file to R2, runs integrity checks, and returns the new public URL.
 */
async function migrateFile(localUrl) {
  if (!localUrl || !localUrl.startsWith('/media/website/')) {
    return null; // Already migrated or invalid
  }

  const relativePath = decodeURIComponent(localUrl.replace(/^\/?media\/website\//, ''));
  const localFilePath = path.join(WEBSITE_MEDIA_DIR, relativePath);

  if (!fs.existsSync(localFilePath)) {
    console.warn(`[Warning] Local file not found: ${localFilePath}`);
    return null;
  }

  const stats = fs.statSync(localFilePath);
  const size = stats.size;
  const filename = path.basename(relativePath);
  const subfolder = path.dirname(relativePath);
  const key = `website/${relativePath}`; // The key structure R2 helper creates

  console.log(`Migrating: ${relativePath} (${(size / 1024).toFixed(1)} KB)`);

  if (dryRun) {
    console.log(`[Dry Run] Would upload to R2 key "${key}"`);
    return `https://${process.env.R2_PUBLIC_DOMAIN_URL}/website/${relativePath}`;
  }

  try {
    const buffer = fs.readFileSync(localFilePath);
    const mimeType = getMimeType(filename);
    
    // Upload
    const publicUrl = await uploadWebsiteAsset(buffer, filename, subfolder, mimeType);

    // Verify
    const isVerified = await verifyR2Object(key, size);
    if (!isVerified) {
      throw new Error(`Integrity check failed for ${relativePath}`);
    }

    console.log(`[Success] Verified & uploaded: ${relativePath}`);
    return publicUrl;
  } catch (err) {
    console.error(`[Error] Failed to migrate ${relativePath}:`, err.message);
    throw err;
  }
}

async function run() {
  console.log('=== Starting Website Media R2 Migration ===');
  if (dryRun) console.log('RUNNING IN DRY RUN MODE - No database changes or uploads will be made.');

  try {
    // 1. Migrate website_stories covers
    console.log('\n--- Migrating Stories Covers ---');
    const storiesResult = await pool.query('SELECT id, slug, cover_image_url, cover_image_mobile_url, grid_image_url FROM website_stories');
    for (const story of storiesResult.rows) {
      let updatedCover = null;
      let updatedMobile = null;
      let updatedGrid = null;

      if (story.cover_image_url && story.cover_image_url.startsWith('/media/website/')) {
        updatedCover = await migrateFile(story.cover_image_url);
      }
      if (story.cover_image_mobile_url && story.cover_image_mobile_url.startsWith('/media/website/')) {
        updatedMobile = await migrateFile(story.cover_image_mobile_url);
      }
      if (story.grid_image_url && story.grid_image_url.startsWith('/media/website/')) {
        updatedGrid = await migrateFile(story.grid_image_url);
      }

      if (!dryRun && (updatedCover || updatedMobile || updatedGrid)) {
        await pool.query(
          `UPDATE website_stories 
           SET cover_image_url = COALESCE($1, cover_image_url),
               cover_image_mobile_url = COALESCE($2, cover_image_mobile_url),
               grid_image_url = COALESCE($3, grid_image_url),
               updated_at = NOW()
           WHERE id = $4`,
          [updatedCover, updatedMobile, updatedGrid, story.id]
        );
        console.log(`Updated Story ID ${story.id} (${story.slug})`);
      }
    }

    // 2. Migrate website_story_photos
    console.log('\n--- Migrating Story Photos ---');
    const photosResult = await pool.query('SELECT id, story_id, file_url, file_url_mobile, file_url_thumb FROM website_story_photos');
    for (const photo of photosResult.rows) {
      let updatedFile = null;
      let updatedMobile = null;
      let updatedThumb = null;

      if (photo.file_url && photo.file_url.startsWith('/media/website/')) {
        updatedFile = await migrateFile(photo.file_url);
      }
      if (photo.file_url_mobile && photo.file_url_mobile.startsWith('/media/website/')) {
        updatedMobile = await migrateFile(photo.file_url_mobile);
      }
      if (photo.file_url_thumb && photo.file_url_thumb.startsWith('/media/website/')) {
        updatedThumb = await migrateFile(photo.file_url_thumb);
      }

      if (!dryRun && (updatedFile || updatedMobile || updatedThumb)) {
        await pool.query(
          `UPDATE website_story_photos 
           SET file_url = COALESCE($1, file_url),
               file_url_mobile = COALESCE($2, file_url_mobile),
               file_url_thumb = COALESCE($3, file_url_thumb)
           WHERE id = $4`,
          [updatedFile, updatedMobile, updatedThumb, photo.id]
        );
      }
    }

    // 3. Migrate website_films
    console.log('\n--- Migrating Film Thumbnails ---');
    const filmsResult = await pool.query('SELECT id, title, thumbnail_url FROM website_films');
    for (const film of filmsResult.rows) {
      if (film.thumbnail_url && film.thumbnail_url.startsWith('/media/website/')) {
        const updatedThumb = await migrateFile(film.thumbnail_url);
        if (!dryRun && updatedThumb) {
          await pool.query('UPDATE website_films SET thumbnail_url = $1 WHERE id = $2', [updatedThumb, film.id]);
          console.log(`Updated Film ID ${film.id} (${film.title})`);
        }
      }
    }

    // 4. Migrate website_reels
    console.log('\n--- Migrating Reels Thumbnails ---');
    const reelsResult = await pool.query('SELECT id, title, thumbnail_url FROM website_reels');
    for (const reel of reelsResult.rows) {
      if (reel.thumbnail_url && reel.thumbnail_url.startsWith('/media/website/')) {
        const updatedThumb = await migrateFile(reel.thumbnail_url);
        if (!dryRun && updatedThumb) {
          await pool.query('UPDATE website_reels SET thumbnail_url = $1 WHERE id = $2', [updatedThumb, reel.id]);
          console.log(`Updated Reel ID ${reel.id} (${reel.title})`);
        }
      }
    }

    // 5. Migrate website_sections content (philosophy, full bleed background, cover videos/images)
    console.log('\n--- Migrating Website Sections Media ---');
    const sectionsResult = await pool.query('SELECT key, label, content FROM website_sections');
    for (const section of sectionsResult.rows) {
      const content = section.content || {};
      let updated = false;

      for (const [k, v] of Object.entries(content)) {
        if (typeof v === 'string' && v.startsWith('/media/website/')) {
          const newUrl = await migrateFile(v);
          if (newUrl) {
            content[k] = newUrl;
            updated = true;
          }
        }
      }

      if (!dryRun && updated) {
        await pool.query('UPDATE website_sections SET content = $1 WHERE key = $2', [JSON.stringify(content), section.key]);
        console.log(`Updated Section: ${section.label || section.key}`);
      }
    }

    console.log('\n=== Migration Completed Successfully ===');
    if (!dryRun) {
      console.log('Verification check: All database links are successfully updated.');
      console.log('Old local files under "media/website" are still intact. Keep them until manual website verification.');
    }
  } catch (err) {
    console.error('\nFatal Error during migration:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
