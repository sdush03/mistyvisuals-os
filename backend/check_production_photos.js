/**
 * check_production_photos.js
 * Run on production to analyze the photos database rows for the event.
 */
require('dotenv').config();
const { prisma } = require('./modules/quotation/prisma');

async function run() {
  const event = await prisma.galleryEvent.findUnique({
    where: { slug: 'drishti-vaibhav-jun26' }
  });

  if (!event) {
    console.log('Event drishti-vaibhav-jun26 not found.');
    await prisma.$disconnect();
    return;
  }

  const total = await prisma.photo.count({ where: { eventId: event.id } });
  const noThumb = await prisma.photo.count({ where: { eventId: event.id, thumbnailUrl: null } });
  
  // Sample photos to check actual paths
  const samples = await prisma.photo.findMany({
    where: { eventId: event.id },
    take: 10,
    select: {
      id: true,
      filename: true,
      r2Url: true,
      thumbnailUrl: true
    }
  });

  console.log(`\nEvent: ${event.title} (ID: ${event.id})`);
  console.log(`Total Photos: ${total}`);
  console.log(`Photos with NULL thumbnailUrl: ${noThumb}`);
  console.log('\nSample photo rows from database:');
  console.log(JSON.stringify(samples, null, 2));

  await prisma.$disconnect();
}

run().catch(console.error);
