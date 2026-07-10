/**
 * backfill_thumbnails.js
 * Run on the server from the /backend directory:
 *   node backfill_thumbnails.js
 *
 * What it does:
 *  1. Finds all photos in the DB where thumbnail_url IS NULL
 *  2. Downloads each photo from R2 (via its r2Url)
 *  3. Generates a 900px thumbnail using sharp
 *  4. Uploads the thumbnail to R2 under events/<slug>/thumbnails/
 *  5. Updates the DB row with the new thumbnailUrl
 *
 * Safe to re-run: already-filled photos (thumbnailUrl != null) are skipped.
 */

require('dotenv').config();
const sharp = require('sharp');
const { prisma } = require('./modules/quotation/prisma');
const { uploadAsset } = require('./utils/r2');

// ---- Config ----
const BATCH_SIZE = 20;     // photos processed in parallel per batch
const THUMB_MAX_PX = 720;  // max width/height of thumbnail
// ----------------

async function fetchBuffer(url) {
  // url is either a full https:// URL or a relative /api/... path
  // On the server the R2 url should be a full CDN URL like https://...
  // Adjust this if your r2Url is stored differently.
  const fullUrl = url.startsWith('http') ? url : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${url}`;
  const res = await fetch(fullUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

async function run() {
  // Count total photos needing backfill
  const total = await prisma.photo.count({ where: { thumbnailUrl: null } });
  console.log(`Found ${total} photos with no thumbnail. Starting backfill...`);

  let done = 0;
  let failed = 0;
  let skip = 0;

  // Process in pages so we don't load everything into memory
  let cursor = undefined;

  while (true) {
    const photos = await prisma.photo.findMany({
      where: { thumbnailUrl: null },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        r2Url: true,
        filename: true,
        galleryEvent: { select: { slug: true } }
      }
    });

    if (photos.length === 0) break;
    cursor = photos[photos.length - 1].id;

    // Process batch in parallel
    await Promise.all(photos.map(async (photo) => {
      try {
        if (!photo.r2Url) { skip++; return; }

        const buffer = await fetchBuffer(photo.r2Url);

        const thumbBuffer = await sharp(buffer)
          .rotate()  // respect EXIF orientation
          .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85, progressive: true, mozjpeg: true })
          .toBuffer();

        const slug = photo.galleryEvent?.slug || 'general';
        const thumbFilename = `thumb_${photo.filename || `photo_${photo.id}.jpg`}`;
        const thumbSubfolder = `events/${slug}/thumbnails`;

        const thumbnailUrl = await uploadAsset(thumbBuffer, thumbFilename, thumbSubfolder, 'image/jpeg');

        await prisma.photo.update({
          where: { id: photo.id },
          data: { thumbnailUrl }
        });

        done++;
        if (done % 20 === 0 || done === total) {
          console.log(`  ✓ ${done}/${total} done, ${failed} failed, ${skip} skipped`);
        }
      } catch (err) {
        failed++;
        console.error(`  ✗ Photo ${photo.id} (${photo.filename}): ${err.message}`);
      }
    }));
  }

  console.log(`\nBackfill complete: ${done} updated, ${failed} failed, ${skip} skipped.`);
  await prisma.$disconnect();
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
