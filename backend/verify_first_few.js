/**
 * verify_first_few.js
 * Check the sort order and backfill status of the photos.
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

  // Get the first 20 photos in the gallery sorted order
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
      thumbnailUrl: true
    }
  });

  console.log('First 20 photos in gallery order:');
  photos.forEach((p, index) => {
    console.log(`${index + 1}. ID: ${p.id} | Filename: ${p.filename} | Thumbnail: ${p.thumbnailUrl}`);
  });

  await prisma.$disconnect();
}

run().catch(console.error);
