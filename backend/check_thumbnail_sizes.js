/**
 * check_thumbnail_sizes.js
 * Run on production to check the Content-Length header of the thumbnail URLs.
 */
require('dotenv').config();
const { prisma } = require('./modules/quotation/prisma');

async function run() {
  const event = await prisma.galleryEvent.findUnique({
    where: { slug: 'drishti-vaibhav-jun26' }
  });

  if (!event) {
    console.log('Event not found.');
    await prisma.$disconnect();
    return;
  }

  const photos = await prisma.photo.findMany({
    where: { eventId: event.id },
    orderBy: [
      { capturedAt: 'asc' },
      { id: 'asc' }
    ],
    take: 20,
    select: {
      id: true,
      filename: true,
      r2Url: true,
      thumbnailUrl: true
    }
  });

  console.log('\nChecking first 20 photo thumbnail sizes in R2...');
  
  for (const p of photos) {
    if (!p.thumbnailUrl) {
      console.log(`ID: ${p.id} | ${p.filename} | Thumbnail: NULL`);
      continue;
    }
    
    try {
      const res = await fetch(p.thumbnailUrl, { method: 'HEAD' });
      const sizeBytes = res.headers.get('content-length');
      const sizeMB = sizeBytes ? (parseInt(sizeBytes, 10) / (1024 * 1024)).toFixed(2) : 'unknown';
      console.log(`ID: ${p.id} | ${p.filename} | Size: ${sizeMB} MB (${sizeBytes} bytes) | Url: ${p.thumbnailUrl}`);
    } catch (err) {
      console.log(`ID: ${p.id} | ${p.filename} | Error: ${err.message}`);
    }
  }

  await prisma.$disconnect();
}

run().catch(console.error);
