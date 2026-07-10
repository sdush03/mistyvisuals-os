/**
 * check_url_anomalies.js
 * Run on production to analyze the photo URL paths.
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
    select: { id: true, filename: true, r2Url: true, thumbnailUrl: true }
  });

  let sameUrl = [];
  let missingThumbPath = [];

  for (const p of photos) {
    if (p.r2Url === p.thumbnailUrl) {
      sameUrl.push(p);
    }
    if (p.thumbnailUrl && !p.thumbnailUrl.includes('/thumbnails/')) {
      missingThumbPath.push(p);
    }
  }

  console.log(`\nEvent: ${event.title} (ID: ${event.id})`);
  console.log(`Total Photos: ${photos.length}`);
  console.log(`Photos where thumbnailUrl is EXACTLY equal to r2Url: ${sameUrl.length}`);
  console.log(`Photos where thumbnailUrl is missing '/thumbnails/': ${missingThumbPath.length}`);

  if (sameUrl.length > 0) {
    console.log('\nSample same URL photos (first 5):');
    console.log(JSON.stringify(sameUrl.slice(0, 5), null, 2));
  }
  
  if (missingThumbPath.length > 0) {
    console.log('\nSample missing "/thumbnails/" photos (first 5):');
    console.log(JSON.stringify(missingThumbPath.slice(0, 5), null, 2));
  }

  await prisma.$disconnect();
}

run().catch(console.error);
