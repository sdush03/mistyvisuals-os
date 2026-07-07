/**
 * Misty Visuals Custom AI Gallery Uploader Utility (Proof-of-Concept)
 * 
 * This script runs locally on the photographer's computer.
 * It resizes local JPEGs, simulates or extracts 512-dimensional face vectors,
 * uploads the compressed JPEGs to Cloudflare R2, and sends the metadata/vectors
 * to the backend Fastify server.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// If deploying inside Electron, you would import @aws-sdk/client-s3 and @qdrant/js-client-rest or onnxruntime-node
// For this POC, we will use fetch calls and standard packages.

// Configuration (To be set by environment variables or uploader UI settings)
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJhZG1pbkBtaXN0eXZpc3VhbHMuY29tIiwicm9sZSI6ImFkbWluIiwicm9sZXMiOlsiYWRtaW4iXSwiaWF0IjoxNzgzMzY1Njg3fQ.YNyF4CHu14ovC_K9EwE4aIGtiKAGmbROWtG3SgdSIMk'; // Or your JWT token
const EVENT_ID = process.env.EVENT_ID || 1; // ID of the GalleryEvent in PostgreSQL
const UPLOAD_FOLDER = process.env.UPLOAD_FOLDER || './test_photos'; // Folder containing wedding JPEGs

// Simulated R2 Endpoint Uploader
// In production, you would configure AWS S3 SDK for Cloudflare R2 like this:
/*
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const r2Client = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  },
  region: 'auto'
});
*/

// Mock function representing Cloudflare R2 upload
async function uploadToR2(filePath, filename) {
  // In a real uploader, this streams the file to your Cloudflare R2 bucket:
  /*
  const fileStream = fs.createReadStream(filePath);
  const uploadParams = {
    Bucket: process.env.R2_BUCKET_NAME,
    Key: filename,
    Body: fileStream,
    ContentType: 'image/jpeg'
  };
  await r2Client.send(new PutObjectCommand(uploadParams));
  return `https://${process.env.R2_PUBLIC_DOMAIN_URL}/${filename}`;
  */
  
  // For local testing, we simulate the R2 URL back by pointing to a mock CDN URL or our backend uploads folder
  const targetDir = path.join(__dirname, '..', 'uploads', 'photos');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const destPath = path.join(targetDir, filename);
  fs.copyFileSync(filePath, destPath);
  
  return `http://localhost:3001/api/photos/file/${encodeURIComponent(filename)}`;
}

// Helper to generate a dummy 512-dim normalized vector for testing/simulation
function generateMockVector() {
  const vec = Array.from({ length: 512 }, () => Math.random() * 2 - 1);
  const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  return vec.map(val => val / magnitude);
}

// Main processing task
async function processAndUploadWedding() {
  console.log('=====================================================');
  console.log('  Misty Visuals Desktop AI Uploader - Starting Batch  ');
  console.log('=====================================================');
  
  if (!fs.existsSync(UPLOAD_FOLDER)) {
    console.error(`Folder "${UPLOAD_FOLDER}" not found. Creating it for testing...`);
    fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
    console.log(`Please place some JPEGs in ${UPLOAD_FOLDER} and run the script again.`);
    return;
  }

  const files = fs.readdirSync(UPLOAD_FOLDER).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
  });

  if (files.length === 0) {
    console.log(`No images found in "${UPLOAD_FOLDER}". Batch completed.`);
    return;
  }

  console.log(`Found ${files.length} images to process...`);
  const tempDir = path.join(__dirname, '..', 'db', 'temp_compressed');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const photoPayloads = [];

  for (const filename of files) {
    const originalPath = path.join(UPLOAD_FOLDER, filename);
    const compressedPath = path.join(tempDir, `compressed_${filename}`);
    
    console.log(`\nProcessing: ${filename}`);

    try {
      // 1. Client-Side Image Compression (Sharp)
      // Resize to 4K (3840px max size) at 82% quality (Visually perfect, highly optimized)
      console.log('- Compressing image to 4K...');
      await sharp(originalPath)
        .resize(3840, 3840, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 82 })
        .toFile(compressedPath);

      const stats = fs.statSync(compressedPath);
      console.log(`  Size reduced: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      // 2. Client-Side Face Vector Extraction (Local AI OpenCV YuNet & SFace)
      console.log('- Extracting face vectors (Local AI)...');
      let faces = [];
      try {
        const { execSync } = require('child_process');
        const scriptPath = path.join(__dirname, '..', 'utils', 'face_rec.py');
        const output = execSync(`python3 "${scriptPath}" extract "${compressedPath}"`).toString();
        const res = JSON.parse(output);
        if (res.faces) {
          faces = res.faces;
          console.log(`  Detected ${faces.length} faces using SFace.`);
          
          // Crop and save each face thumbnail for circular avatars
          const facesDir = path.join(__dirname, '..', 'uploads', 'photos');
          if (!fs.existsSync(facesDir)) {
            fs.mkdirSync(facesDir, { recursive: true });
          }
          
          for (const face of faces) {
            if (face.box) {
              const [x, y, fw, fh] = face.box;
              const faceCropPath = path.join(facesDir, `${face.faceId}.jpg`);
              try {
                await sharp(compressedPath)
                  .extract({ left: x, top: y, width: fw, height: fh })
                  .toFile(faceCropPath);
                face.faceUrl = `http://localhost:3001/api/photos/file/${encodeURIComponent(face.faceId)}.jpg`;
              } catch (cropErr) {
                console.log(`    Failed to crop face ${face.faceId}:`, cropErr.message);
              }
            }
          }
        }
      } catch (err) {
        console.log('  Local AI extraction failed, falling back to simulation...', err.message);
        const mockFacesCount = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < mockFacesCount; i++) {
          faces.push({
            faceId: `face-uuid-${filename.replace(/\.[^/.]+$/, "")}-${i}-${Date.now()}`,
            vector: generateMockVector()
          });
        }
        console.log(`  Detected ${mockFacesCount} faces (Simulated).`);
      }

      // 3. Save Compressed Image Locally
      console.log('- Saving compressed photo locally...');
      const r2Url = await uploadToR2(compressedPath, filename);
      console.log(`  Saved URL: ${r2Url}`);

      photoPayloads.push({
        filename,
        r2Url,
        fileSize: stats.size,
        faces
      });

      // Cleanup local compressed temp file
      fs.unlinkSync(compressedPath);
    } catch (err) {
      console.error(`Error processing ${filename}:`, err);
    }
  }

  // 4. Send Photos and Vectors Metadata to Backend in Bulk
  console.log('\n-----------------------------------------------------');
  console.log('Sending metadata & face vectors to Misty Visuals API...');
  
  try {
    const res = await fetch(`${BACKEND_URL}/api/gallery/events/${EVENT_ID}/photos/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `mv_auth=${ADMIN_API_KEY}` // Using simulated session auth for local dev
      },
      body: JSON.stringify({
        photos: photoPayloads
      })
    });

    const result = await res.json();
    if (res.ok) {
      console.log(`Success! Indexed ${result.count} photos & face vectors in database.`);
    } else {
      console.error('Failed to index photos on backend:', result);
    }
  } catch (err) {
    console.error('Network error linking photos to backend:', err);
  }

  // Cleanup temp folder
  if (fs.existsSync(tempDir)) {
    fs.rmdirSync(tempDir);
  }
}

// Run the script
processAndUploadWedding().catch(console.error);
