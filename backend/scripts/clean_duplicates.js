const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const qdrant = require('../utils/qdrant');
const { deleteAsset, isR2Enabled } = require('../utils/r2');

// Helper to normalize filenames and find canonical roots
function getCanonicalName(filename) {
  if (!filename) return '';
  const ext = path.extname(filename);
  const base = path.basename(filename, ext).toLowerCase().trim();
  
  // Strip trailing " copy", "_copy", "-copy", " (1)", etc.
  const cleaned = base
    .replace(/\s+copy$/gi, '')
    .replace(/_copy$/gi, '')
    .replace(/-copy$/gi, '')
    .replace(/\s+\(\d+\)$/g, '')
    .trim();
  
  return cleaned;
}

// Re-implementation of deletePhotosAssets helper from galleryRoutes
async function deletePhotosAssets(photos, slug) {
  let publicDomain = '';
  if (isR2Enabled && process.env.R2_PUBLIC_DOMAIN_URL) {
    publicDomain = process.env.R2_PUBLIC_DOMAIN_URL.trim();
    if (publicDomain.startsWith('http://')) publicDomain = publicDomain.substring(7);
    if (publicDomain.startsWith('https://')) publicDomain = publicDomain.substring(8);
  }

  const chunkSize = 15;
  for (let i = 0; i < photos.length; i += chunkSize) {
    const chunk = photos.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (p) => {
      try {
        console.log(`[Cleanup] Deleting assets for Photo ID: ${p.id} (${p.filename})`);
        
        // 1. Delete associated face crops from R2
        const faceIds = await qdrant.getFaceIdsForPhoto(p.id);
        await Promise.all(faceIds.map(async (faceId) => {
          if (isR2Enabled && publicDomain && slug) {
            const faceUrl = `https://${publicDomain}/events/${slug}/photos/${faceId}.jpg`;
            await deleteAsset(faceUrl).catch(() => {});
            const faceUrlAlt = `https://${publicDomain}/events/${slug}/faces/${faceId}.jpg`;
            await deleteAsset(faceUrlAlt).catch(() => {});
          } else {
            const targetDir = path.join(__dirname, '..', 'uploads', 'photos');
            const localFacePath = path.join(targetDir, `${faceId}.jpg`);
            if (fs.existsSync(localFacePath)) {
              try { fs.unlinkSync(localFacePath); } catch (e) {}
            }
          }
        }));

        // 2. Delete from Qdrant
        await qdrant.deleteVectorsForPhoto(p.id);

        // 3. Delete thumbnail from R2
        if (p.thumbnailUrl) {
          await deleteAsset(p.thumbnailUrl).catch(() => {});
        } else if (isR2Enabled && publicDomain && slug && p.filename) {
          const thumbFilename = `thumb_${p.filename}`;
          const thumbSubfolder = `events/${slug}/thumbnails`;
          const thumbKey = `${thumbSubfolder}/${thumbFilename}`;
          const thumbUrl = `https://${publicDomain}/${thumbKey}`;
          await deleteAsset(thumbUrl).catch(() => {});
        }

        // 4. Delete from R2
        if (p.r2Url) {
          await deleteAsset(p.r2Url).catch(() => {});
        }

        // 5. Delete from local disk
        if (p.filename) {
          const targetDir = path.join(__dirname, '..', 'uploads', 'photos');
          const filePath = path.join(targetDir, p.filename);
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
          }
        }
      } catch (err) {
        console.error(`Failed to delete assets for photo ID ${p.id}:`, err.message);
      }
    }));
  }
}

async function main() {
  const isWrite = process.argv.includes('--write');
  console.log(`Starting Duplicate Photo Clean-up Job... Mode: ${isWrite ? 'WRITE/EXECUTE' : 'DRY-RUN'}`);

  try {
    // Get all gallery events
    const events = await prisma.galleryEvent.findMany();
    console.log(`Found ${events.length} gallery events in database.`);

    let totalDuplicatesFound = 0;
    let totalCleanedCount = 0;

    for (const event of events) {
      const slug = event.slug.toLowerCase().trim();
      const photos = await prisma.photo.findMany({
        where: { eventId: event.id },
        orderBy: { createdAt: 'asc' } // Keep the oldest/first uploaded one
      });

      if (photos.length === 0) continue;

      // Group photos by (tabName, canonicalName)
      const groups = {}; // Key: "tabName|canonicalName"
      const duplicates = [];

      for (const photo of photos) {
        const canonical = getCanonicalName(photo.filename);
        const groupKey = `${photo.tabName || ''}|${canonical}`;

        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(photo);
      }

      // Identify duplicates in each group
      for (const key in groups) {
        const list = groups[key];
        if (list.length > 1) {
          // Keep the best version: prefer files NOT containing "copy" or containing smaller IDs/earlier timestamps
          let primaryPhoto = list.find(p => !p.filename.toLowerCase().includes('copy'));
          if (!primaryPhoto) {
            primaryPhoto = list[0]; // fallback to first
          }

          list.forEach(photo => {
            if (photo.id !== primaryPhoto.id) {
              duplicates.push(photo);
            }
          });
        }
      }

      if (duplicates.length > 0) {
        totalDuplicatesFound += duplicates.length;
        console.log(`\nGallery: ${event.title} (${slug}) - Found ${duplicates.length} duplicate photos.`);

        if (isWrite) {
          // Delete from DB first
          const duplicateIds = duplicates.map(d => d.id);
          await prisma.photo.deleteMany({
            where: { id: { in: duplicateIds } }
          });
          console.log(`[DB] Deleted ${duplicateIds.length} duplicate database records.`);

          // Delete assets from R2, local files and Qdrant
          await deletePhotosAssets(duplicates, slug);
          
          // Mark cluster cache dirty to trigger re-clustering
          await prisma.galleryEvent.update({
            where: { id: event.id },
            data: { clustersDirty: true }
          });
          
          totalCleanedCount += duplicates.length;
        } else {
          // Dry-run print details
          duplicates.forEach(d => {
            console.log(`  - DUPLICATE: ID=${d.id} | Filename: "${d.filename}" | Tab: "${d.tabName}" | Uploaded: ${d.createdAt.toISOString()}`);
          });
        }
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Total duplicate photos found: ${totalDuplicatesFound}`);
    if (isWrite) {
      console.log(`Total duplicate photos cleaned: ${totalCleanedCount}`);
    } else {
      console.log(`Dry-run complete. Re-run with "node backend/scripts/clean_duplicates.js --write" to perform deletions.`);
    }

  } catch (err) {
    console.error('Fatal clean-up error:', err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
