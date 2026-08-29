/**
 * clean_r2_orphan_photos.js
 *
 * Scans Cloudflare R2 storage for photo files under `events/` that do not exist
 * in the PostgreSQL/SQLite database (e.g., from previously timed-out uploads).
 *
 * Usage:
 *   node scripts/clean_r2_orphan_photos.js           # Dry-run (scans and reports orphans only)
 *   node scripts/clean_r2_orphan_photos.js --delete  # Scans and deletes orphans from R2
 */

require('dotenv').config();
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { prisma } = require('../modules/quotation/prisma');

const isR2Enabled = !!(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME
);

if (!isR2Enabled) {
  console.error('❌ Cloudflare R2 is not configured. Missing R2_* environment variables in .env');
  process.exit(1);
}

const r2Client = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  },
  region: 'auto'
});

const isDeleteMode = process.argv.includes('--delete') || process.argv.includes('--execute');

function extractKeyFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.substring(1));
  } catch (e) {
    return decodeURIComponent(url.replace(/^\/?api\/photos\/file\//, ''));
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function getAllDbKeys() {
  console.log('📦 Loading all registered photo and event keys from database...');
  const dbKeys = new Set();

  const photos = await prisma.photo.findMany({
    select: { r2Url: true }
  });
  photos.forEach(p => {
    const key = extractKeyFromUrl(p.r2Url);
    if (key) dbKeys.add(key);
  });

  const events = await prisma.galleryEvent.findMany({
    select: { coverPhotoUrl: true, desktopCoverPhotoUrl: true }
  });
  events.forEach(e => {
    const k1 = extractKeyFromUrl(e.coverPhotoUrl);
    const k2 = extractKeyFromUrl(e.desktopCoverPhotoUrl);
    if (k1) dbKeys.add(k1);
    if (k2) dbKeys.add(k2);
  });

  console.log(`✓ Loaded ${dbKeys.size} active photo/cover keys from database.\n`);
  return dbKeys;
}

async function listR2Objects(prefix = 'events/') {
  console.log(`🔍 Scanning Cloudflare R2 bucket "${process.env.R2_BUCKET_NAME}" (prefix: "${prefix}")...`);
  const objects = [];
  let continuationToken = undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken
    });

    const response = await r2Client.send(command);
    if (response.Contents) {
      objects.push(...response.Contents);
      process.stdout.write(`\r  Found ${objects.length} objects in R2...`);
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log(`\n✓ Scan complete. Total objects found: ${objects.length}\n`);
  return objects;
}

async function run() {
  try {
    const dbKeys = await getAllDbKeys();
    const r2Objects = await listR2Objects('events/');

    const orphans = [];
    let orphanTotalBytes = 0;
    let validCount = 0;

    for (const obj of r2Objects) {
      const key = obj.Key;
      if (!key) continue;

      if (dbKeys.has(key)) {
        validCount++;
      } else {
        orphans.push(obj);
        orphanTotalBytes += obj.Size || 0;
      }
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('📊 R2 Orphan Photos Scan Results');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Total R2 Objects in "events/": ${r2Objects.length}`);
    console.log(`Valid Linked Objects in DB:    ${validCount}`);
    console.log(`Orphan Objects in R2:          ${orphans.length} (${formatBytes(orphanTotalBytes)})`);
    console.log('═══════════════════════════════════════════════════\n');

    if (orphans.length === 0) {
      console.log('🎉 Clean! No orphaned photos found in Cloudflare R2.');
      await prisma.$disconnect();
      return;
    }

    console.log('Top orphan examples:');
    orphans.slice(0, 10).forEach(o => console.log(`  - ${o.Key} (${formatBytes(o.Size || 0)})`));
    if (orphans.length > 10) {
      console.log(`  ... and ${orphans.length - 10} more.`);
    }
    console.log('');

    if (!isDeleteMode) {
      console.log('ℹ️  This was a DRY-RUN. No files were deleted.');
      console.log('👉 To permanently remove these orphan files from R2, run:');
      console.log('   node scripts/clean_r2_orphan_photos.js --delete\n');
      await prisma.$disconnect();
      return;
    }

    console.log(`🚀 Starting deletion of ${orphans.length} orphan files from R2...`);

    const BATCH_SIZE = 1000;
    let deletedCount = 0;

    for (let i = 0; i < orphans.length; i += BATCH_SIZE) {
      const batch = orphans.slice(i, i + BATCH_SIZE);
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Delete: {
          Objects: batch.map(o => ({ Key: o.Key })),
          Quiet: true
        }
      });

      await r2Client.send(deleteCommand);
      deletedCount += batch.length;
      console.log(`  Deleted ${deletedCount}/${orphans.length} orphan files...`);
    }

    console.log(`\n✅ Successfully removed ${deletedCount} orphan files from Cloudflare R2 storage!`);
    console.log(`   Reclaimed storage: ${formatBytes(orphanTotalBytes)}\n`);

    await prisma.$disconnect();
  } catch (err) {
    console.error('❌ Error during orphan cleanup:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

run();
