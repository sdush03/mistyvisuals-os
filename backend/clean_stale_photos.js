/**
 * clean_stale_photos.js
 * Run on production to clean up stale duplicate rows in the database.
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

  // Fetch all photos for this event
  const photos = await prisma.photo.findMany({
    where: { eventId: event.id },
    orderBy: { id: 'desc' } // Newest first
  });

  console.log(`Found ${photos.length} database records for this event.`);

  const seen = new Set();
  const toDelete = [];

  for (const photo of photos) {
    if (seen.has(photo.filename)) {
      toDelete.push(photo.id);
    } else {
      seen.add(photo.filename);
    }
  }

  if (toDelete.length === 0) {
    console.log('No duplicate photo records found in the database.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Deleting ${toDelete.length} stale duplicate records from the database...`);
  
  // Delete stale records
  const result = await prisma.photo.deleteMany({
    where: {
      id: { in: toDelete }
    }
  });

  console.log(`Successfully deleted ${result.count} stale photo records.`);
  
  // Re-verify count
  const newTotal = await prisma.photo.count({ where: { eventId: event.id } });
  console.log(`Remaining database records: ${newTotal}`);

  await prisma.$disconnect();
}

run().catch(console.error);
