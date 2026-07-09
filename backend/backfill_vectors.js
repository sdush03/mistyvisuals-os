const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const sharp = require('sharp');

const { prisma } = require('./modules/quotation/prisma');
const qdrant = require('./utils/qdrant');
const { uploadAsset } = require('./utils/r2');

// Helper to download an image from a URL to a local destination file
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: Status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('=== FACE RECOGNITION BACKFILL UTILITY ===\n');

  const slug = 'drishti-vaibhav-jun26';
  const event = await prisma.galleryEvent.findUnique({
    where: { slug }
  });

  if (!event) {
    console.error(`❌ Event "${slug}" not found in database.`);
    return;
  }

  console.log(`Event found: ID=${event.id}, Slug="${event.slug}", Title="${event.title}"`);

  // Fetch all photos for this event
  const photos = await prisma.photo.findMany({
    where: { eventId: event.id }
  });

  console.log(`Total photos in database for this event: ${photos.length}`);
  if (photos.length === 0) {
    console.log('No photos to process.');
    return;
  }

  const scriptPath = path.join(__dirname, 'utils', 'face_rec.py');
  const tempDir = path.join(__dirname, 'temp_backfill');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  let successCount = 0;
  let totalFacesExtracted = 0;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const indexStr = `[${i + 1}/${photos.length}]`;
    console.log(`\n${indexStr} Processing photo ID=${photo.id}, Filename="${photo.filename}"`);

    // Determine download URL
    const downloadUrl = photo.r2Url;
    if (!downloadUrl) {
      console.log(`  ⚠️ Skipping: Photo has no r2Url`);
      continue;
    }

    const tempFilePath = path.join(tempDir, `temp_${photo.id}_${photo.filename}`);

    try {
      // 1. Download photo from R2
      console.log(`  Downloading from ${downloadUrl}...`);
      await downloadFile(downloadUrl, tempFilePath);

      // 2. Run face detection and vector extraction via Python face_rec.py
      console.log(`  Running face detection on local server...`);
      const output = execSync(`python3 "${scriptPath}" extract "${tempFilePath}"`).toString();
      const res = JSON.parse(output);

      if (res.error) {
        throw new Error(res.error);
      }

      const faces = res.faces || [];
      console.log(`  Found ${faces.length} faces.`);

      if (faces.length > 0) {
        const facesToUpload = [];

        // 3. For each face, crop the image and upload to R2
        for (const face of faces) {
          const [x, y, fw, fh] = face.box;
          
          try {
            // Crop face
            const faceBuffer = await sharp(tempFilePath)
              .extract({ left: x, top: y, width: fw, height: fh })
              .toBuffer();

            // Upload cropped face to R2
            const faceFilename = `${face.faceId}.jpg`;
            const subfolder = `events/${event.slug.toLowerCase().trim()}/faces`;
            
            console.log(`    Uploading face crop ${faceFilename} to R2...`);
            await uploadAsset(faceBuffer, faceFilename, subfolder, 'image/jpeg');

            facesToUpload.push({
              faceId: face.faceId,
              vector: face.vector
            });
            totalFacesExtracted++;
          } catch (cropErr) {
            console.error(`    ❌ Failed to crop/upload face ${face.faceId}:`, cropErr.message);
          }
        }

        // 4. Save vectors to Qdrant or Mock DB
        if (facesToUpload.length > 0) {
          console.log(`    Saving ${facesToUpload.length} face vectors to vectors DB...`);
          await qdrant.upsertVectors(event.id, photo.id, facesToUpload);
        }
      }

      successCount++;
    } catch (err) {
      console.error(`  ❌ Failed processing photo:`, err.message);
    } finally {
      // Clean up local downloaded temp file
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }
    }
  }

  // Clean up temp directory
  try {
    fs.rmdirSync(tempDir);
  } catch (e) {}

  // Mark event face cluster cache as dirty so it regenerates clusters
  await prisma.galleryEvent.update({
    where: { id: event.id },
    data: { clustersDirty: true }
  });

  console.log('\n=== BACKFILL COMPLETE ===');
  console.log(`Successfully processed: ${successCount}/${photos.length} photos`);
  console.log(`Total face vectors extracted & saved: ${totalFacesExtracted}`);
}

main()
  .catch(e => console.error('Fatal error in backfill:', e))
  .finally(() => prisma.$disconnect());
