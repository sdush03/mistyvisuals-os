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
const minAgeArg = process.argv.find(a => a.startsWith('--min-age-hours='));
const minAgeHours = minAgeArg ? parseFloat(minAgeArg.split('=')[1]) : (isDeleteMode ? 24 : 0);

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
    select: { r2Url: true, thumbnailUrl: true }
  });
  photos.forEach(p => {
    const k1 = extractKeyFromUrl(p.r2Url);
    const k2 = extractKeyFromUrl(p.thumbnailUrl);
    if (k1) dbKeys.add(k1);
    if (k2) dbKeys.add(k2);
  });

  const events = await prisma.galleryEvent.findMany({
    select: { 
      coverPhotoUrl: true, 
      coverPhotoMobileUrl: true, 
      coverPhotoSquareUrl: true 
    }
  });
  events.forEach(e => {
    const k1 = extractKeyFromUrl(e.coverPhotoUrl);
    const k2 = extractKeyFromUrl(e.coverPhotoMobileUrl);
    const k3 = extractKeyFromUrl(e.coverPhotoSquareUrl);
    if (k1) dbKeys.add(k1);
    if (k2) dbKeys.add(k2);
    if (k3) dbKeys.add(k3);
  });

  const guests = await prisma.guest.findMany({
    select: { selfieUrl: true }
  });
  guests.forEach(g => {
    const k = extractKeyFromUrl(g.selfieUrl);
    if (k) dbKeys.add(k);
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

    // Safety Guard 1: Database Sanity Check
    if (dbKeys.size === 0 && r2Objects.length > 0) {
      throw new Error(
        `🚨 SAFETY ABORT: Database query returned 0 active photo keys, but R2 contains ${r2Objects.length} objects! ` +
        `This usually indicates a database connection or schema issue. Aborting immediately to prevent accidental deletions.`
      );
    }

    const orphans = [];
    let orphanTotalBytes = 0;
    let validCount = 0;
    let recentSkippedCount = 0;

    for (const obj of r2Objects) {
      const key = obj.Key;
      if (!key) continue;

      if (dbKeys.has(key)) {
        validCount++;
      } else {
        // Safety Guard 2: Minimum Age Safety Threshold
        const lastModified = obj.LastModified ? new Date(obj.LastModified) : new Date(0);
        const ageHours = (Date.now() - lastModified.getTime()) / (1000 * 60 * 60);

        if (minAgeHours > 0 && ageHours < minAgeHours) {
          recentSkippedCount++;
        } else {
          orphans.push(obj);
          orphanTotalBytes += obj.Size || 0;
        }
      }
    }

    console.log('═══════════════════════════════════════════════════════════════════════════════════════════');
    console.log('📊 R2 Orphan Photos Scan Summary');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════');
    console.log(`Total R2 Objects in "events/":    ${r2Objects.length}`);
    console.log(`Valid Linked Objects in DB:       ${validCount}`);
    if (recentSkippedCount > 0) {
      console.log(`Protected Recent Uploads (<${minAgeHours}h): ${recentSkippedCount} (Skipped for safety)`);
    }
    console.log(`Confirmed Orphan Objects:         ${orphans.length} (${formatBytes(orphanTotalBytes)})`);
    console.log(`Safety Threshold (Min File Age):  ${minAgeHours > 0 ? `${minAgeHours} hours` : 'None (immediate)'}`);
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════\n');

    if (orphans.length === 0) {
      console.log('🎉 Clean! No orphaned photos found in Cloudflare R2.');
      await prisma.$disconnect();
      return;
    }

    // Fetch active event slugs and titles for lookup
    const allEvents = await prisma.galleryEvent.findMany({ select: { slug: true, title: true } });
    const eventTitleMap = new Map();
    allEvents.forEach(e => eventTitleMap.set(e.slug.toLowerCase().trim(), e.title));

    // Group orphans by Gallery Slug & Category
    const galleryBreakdown = {};
    let totalFaceCrops = 0;
    let totalThumbnails = 0;
    let totalPhotos = 0;
    let totalOther = 0;

    for (const o of orphans) {
      const parts = o.Key.split('/');
      const slug = (parts.length > 1 ? parts[1] : 'unknown').toLowerCase().trim();
      const filename = parts[parts.length - 1] || '';

      if (!galleryBreakdown[slug]) {
        galleryBreakdown[slug] = {
          slug,
          title: eventTitleMap.get(slug) || null,
          totalCount: 0,
          totalBytes: 0,
          faceCrops: 0,
          thumbnails: 0,
          photos: 0,
          other: 0
        };
      }

      const g = galleryBreakdown[slug];
      g.totalCount++;
      g.totalBytes += (o.Size || 0);

      if (o.Key.includes('/faces/')) {
        g.faceCrops++;
        totalFaceCrops++;
      } else if (filename.startsWith('thumb_')) {
        g.thumbnails++;
        totalThumbnails++;
      } else if (o.Key.includes('/photos/')) {
        g.photos++;
        totalPhotos++;
      } else {
        g.other++;
        totalOther++;
      }
    }

    console.log('═══════════════════════════════════════════════════════════════════════════════════════════');
    console.log('🔍 Root-Cause Classification of Orphan Files:');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════');
    console.log(`1. Unregistered / Retry Photos:  ${totalPhotos} files  (From previous timed-out upload batches or deleted photos)`);
    console.log(`2. Legacy Face Crops:             ${totalFaceCrops} files  (Face thumbnail JPEGs before face-crop removal)`);
    console.log(`3. Legacy 720p Thumbnails:        ${totalThumbnails} files  (Separate thumb_ files before thumbnail removal)`);
    if (totalOther > 0) {
      console.log(`4. Miscellaneous / Stale Covers:  ${totalOther} files`);
    }
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════\n');

    console.log('📋 Breakdown by Gallery / Event:');
    console.log('─'.repeat(95));
    console.log(
      'Gallery Title / Slug'.padEnd(45) +
      'Orphans'.padEnd(10) +
      'Size'.padEnd(12) +
      'Photos'.padEnd(10) +
      'Faces'.padEnd(8) +
      'Thumbs'.padEnd(10)
    );
    console.log('─'.repeat(95));

    const sortedGalleries = Object.values(galleryBreakdown).sort((a, b) => b.totalBytes - a.totalBytes);

    for (const g of sortedGalleries) {
      const displayName = g.title ? `${g.title} (${g.slug})` : `⚠️ [DELETED] ${g.slug}`;
      const truncatedName = displayName.length > 43 ? displayName.substring(0, 40) + '...' : displayName;

      console.log(
        truncatedName.padEnd(45) +
        String(g.totalCount).padEnd(10) +
        formatBytes(g.totalBytes).padEnd(12) +
        String(g.photos).padEnd(10) +
        String(g.faceCrops).padEnd(8) +
        String(g.thumbnails).padEnd(10)
      );
    }
    console.log('─'.repeat(95));
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
