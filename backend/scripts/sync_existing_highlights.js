require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { prisma } = require('../modules/quotation/prisma');
const { deleteAssetsBatch } = require('../utils/r2');

const isExecuteMode = process.argv.includes('--execute') || process.argv.includes('--delete');

async function run() {
  const targetProjectArg = process.argv.find(a => a.startsWith('--project='));
  const targetProjectName = targetProjectArg ? targetProjectArg.split('=')[1] : 'Akash Bhavika';

  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log(`🔍 Highlights Duplication Sync Script [${isExecuteMode ? '🔴 EXECUTE MODE' : '🛡️ DRY-RUN MODE'}]`);
  console.log(`🎯 Target Project: "${targetProjectName}"`);
  console.log('════════════════════════════════════════════════════════════════════════════════\n');

  const events = await prisma.galleryEvent.findMany({
    where: {
      title: { contains: targetProjectName, mode: 'insensitive' }
    },
    select: { id: true, title: true, slug: true }
  });

  if (events.length === 0) {
    console.log(`❌ No gallery event found matching title containing "${targetProjectName}".`);
    await prisma.$disconnect();
    return;
  }

  console.log(`✓ Found ${events.length} matching gallery event(s): ${events.map(e => e.title).join(', ')}\n`);

  let totalCandidates = 0;
  let totalMerged = 0;
  let totalOrphansPurged = 0;
  let totalLikesTransferred = 0;

  for (const event of events) {
    const photos = await prisma.photo.findMany({
      where: { eventId: event.id },
      select: { id: true, filename: true, tabName: true, r2Url: true, thumbnailUrl: true, exif: true, capturedAt: true }
    });

    const highlightsPhotos = photos.filter(p => (p.tabName || '').toLowerCase().trim() === 'highlights');
    const ceremonyPhotos = photos.filter(p => {
      const t = (p.tabName || '').toLowerCase().trim();
      return t && t !== 'highlights' && t !== 'cinema';
    });

    if (highlightsPhotos.length === 0 || ceremonyPhotos.length === 0) continue;

    // Index ceremony photos by filename and capture timestamp
    const ceremonyByFilename = new Map();
    ceremonyPhotos.forEach(p => {
      const fName = (p.filename || '').toLowerCase().trim();
      const capTime = p.capturedAt ? new Date(p.capturedAt).toISOString().substring(0, 19) : null;

      if (fName) {
        if (!ceremonyByFilename.has(fName)) ceremonyByFilename.set(fName, []);
        ceremonyByFilename.get(fName).push(p);
      }
      if (capTime) {
        const timeKey = `time_${capTime}`;
        if (!ceremonyByFilename.has(timeKey)) ceremonyByFilename.set(timeKey, []);
        ceremonyByFilename.get(timeKey).push(p);
      }
    });

    for (const hPhoto of highlightsPhotos) {
      totalCandidates++;
      const hName = (hPhoto.filename || '').toLowerCase().trim();
      const hExif = (hPhoto.exif && typeof hPhoto.exif === 'object') ? hPhoto.exif : {};
      const hCapTime = hPhoto.capturedAt ? new Date(hPhoto.capturedAt).toISOString().substring(0, 19) : null;

      let match = null;

      // 1. Try matching by exact filename first
      const nameMatches = ceremonyByFilename.get(hName) || [];
      if (nameMatches.length === 1) {
        match = nameMatches[0];
      } else if (nameMatches.length > 1 && hCapTime) {
        // Disambiguate by capture timestamp
        match = nameMatches.find(m => m.capturedAt && new Date(m.capturedAt).toISOString().substring(0, 19) === hCapTime);
      }

      // 2. If no filename match, try matching strictly by capture timestamp (Optical Fingerprint)
      if (!match && hCapTime) {
        const timeMatches = ceremonyByFilename.get(`time_${hCapTime}`) || [];
        if (timeMatches.length === 1) {
          match = timeMatches[0];
        }
      }

      if (match && match.id !== hPhoto.id) {
        console.log(`[Gallery: "${event.title}"]`);
        console.log(`  ➔ Duplicate Highlight found: "${hPhoto.filename}" (ID: ${hPhoto.id})`);
        console.log(`  ➔ Matches Ceremony Photo:   "${match.filename}" (ID: ${match.id}, Tab: ${match.tabName})`);

        const oldExif = (match.exif && typeof match.exif === 'object') ? match.exif : {};
        const updatedExif = {
          ...oldExif,
          isHighlight: true,
          highlightUpgradedAt: new Date().toISOString(),
          originalRawFilename: match.filename
        };

        const urlsToDelete = [];
        if (match.r2Url && match.r2Url !== hPhoto.r2Url) urlsToDelete.push(match.r2Url);
        if (match.thumbnailUrl && match.thumbnailUrl !== hPhoto.thumbnailUrl && match.thumbnailUrl !== hPhoto.r2Url) urlsToDelete.push(match.thumbnailUrl);

        if (isExecuteMode) {
          // 1. Transfer likes & favorites from duplicate highlight photo to ceremony photo
          const likesToMove = await prisma.photoLike.findMany({ where: { photoId: hPhoto.id } });
          for (const like of likesToMove) {
            try {
              await prisma.photoLike.upsert({
                where: { photoId_guestId: { photoId: match.id, guestId: like.guestId } },
                update: {},
                create: { photoId: match.id, guestId: like.guestId }
              });
              totalLikesTransferred++;
            } catch (_) {}
          }
          await prisma.photoLike.deleteMany({ where: { photoId: hPhoto.id } });

          // 2. Update ceremony photo with highlight asset and isHighlight flag
          await prisma.photo.update({
            where: { id: match.id },
            data: {
              r2Url: hPhoto.r2Url,
              thumbnailUrl: hPhoto.thumbnailUrl || match.thumbnailUrl,
              exif: updatedExif
            }
          });

          // 3. Delete duplicate standalone highlights row from DB
          await prisma.photo.delete({
            where: { id: hPhoto.id }
          });

          // 4. Purge old raw asset from R2
          if (urlsToDelete.length > 0) {
            await deleteAssetsBatch(urlsToDelete).catch(() => {});
            totalOrphansPurged += urlsToDelete.length;
          }
        }

        totalMerged++;
        console.log('    [Action]: ' + (isExecuteMode ? '✅ MERGED & LIKES TRANSFERRED' : '🔍 [DRY RUN] Would merge & transfer likes') + '\n');
      }
    }
  }

  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log(`📊 Summary (${isExecuteMode ? 'EXECUTED' : 'DRY RUN'})`);
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log(`Total Highlights Scanned:    ${totalCandidates}`);
  console.log(`Duplicate Pairs Identified:  ${totalMerged}`);
  console.log(`Likes/Favorites Transferred: ${totalLikesTransferred}`);
  console.log(`Obsolete R2 Assets Purged:   ${totalOrphansPurged}`);
  console.log('════════════════════════════════════════════════════════════════════════════════\n');

  if (!isExecuteMode && totalMerged > 0) {
    console.log('💡 To perform the actual sync and clean up R2, run:');
    console.log('   node scripts/sync_existing_highlights.js --execute\n');
  }

  await prisma.$disconnect();
}

run().catch(err => {
  console.error('Migration script failed:', err);
  process.exit(1);
});
