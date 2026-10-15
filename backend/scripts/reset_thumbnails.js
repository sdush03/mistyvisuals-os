/**
 * reset_thumbnails.js
 * Deletes all 400px thumbnail assets from Cloudflare R2 and sets thumbnailUrl = null in the database.
 * The desktop uploader's backfill engine will then automatically regenerate crisp 600px thumbnails.
 *
 * Usage:
 *   node backend/scripts/reset_thumbnails.js
 *   node backend/scripts/reset_thumbnails.js --dry-run
 *   node backend/scripts/reset_thumbnails.js --event <eventId_or_slug>
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { prisma } = require('../modules/quotation/prisma');
const { deleteAssetsBatch } = require('../utils/r2');

const isDryRun = process.argv.includes('--dry-run');
const eventArgIndex = process.argv.indexOf('--event');
const eventTarget = eventArgIndex !== -1 ? process.argv[eventArgIndex + 1] : null;

async function resetThumbnails() {
  console.log('====================================================');
  console.log(`[Thumbnail Reset] Starting ${isDryRun ? 'DRY RUN' : 'RESET'} (Preparing for 600px Backfill)...`);
  if (eventTarget) {
    console.log(`Targeting single event: ${eventTarget}`);
  }
  console.log('====================================================');

  const whereClause = {
    thumbnailUrl: { not: null }
  };

  if (eventTarget) {
    const numericId = parseInt(eventTarget, 10);
    if (!isNaN(numericId)) {
      whereClause.eventId = numericId;
    } else {
      const event = await prisma.galleryEvent.findUnique({ where: { slug: eventTarget } });
      if (!event) {
        console.error(`Event with slug "${eventTarget}" not found.`);
        process.exit(1);
      }
      whereClause.eventId = event.id;
    }
  }

  const photos = await prisma.photo.findMany({
    where: whereClause,
    select: {
      id: true,
      eventId: true,
      thumbnailUrl: true
    }
  });

  console.log(`Found ${photos.length} photos with existing thumbnails.`);

  if (photos.length === 0) {
    console.log('No thumbnails need to be reset. All clear!');
    return;
  }

  const thumbUrls = photos.map(p => p.thumbnailUrl).filter(Boolean);

  if (isDryRun) {
    console.log(`[DRY RUN] Would delete ${thumbUrls.length} thumbnail files from R2.`);
    console.log(`[DRY RUN] Would reset thumbnailUrl to null for ${photos.length} database records.`);
    return;
  }

  console.log(`Deleting ${thumbUrls.length} thumbnails from Cloudflare R2...`);
  await deleteAssetsBatch(thumbUrls);
  console.log('R2 deletion complete.');

  console.log('Updating database records (setting thumbnailUrl = null)...');
  const updateResult = await prisma.photo.updateMany({
    where: whereClause,
    data: {
      thumbnailUrl: null
    }
  });

  console.log(`Successfully reset ${updateResult.count} database records.`);
  console.log('\n====================================================');
  console.log('✅ Thumbnails reset complete! The uploader backfill will now regenerate 600px thumbnails.');
  console.log('====================================================');
}

resetThumbnails()
  .catch(err => {
    console.error('Fatal error resetting thumbnails:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
