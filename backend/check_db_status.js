const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const slug = 'drishti-vaibhav-jun26';
  try {
    const event = await prisma.galleryEvent.findUnique({
      where: { slug }
    });

    if (!event) {
      console.log(`❌ Event "${slug}" not found in database.`);
      return;
    }

    console.log(`\n=== Event Details ===`);
    console.log(`ID: ${event.id}`);
    console.log(`Title: ${event.title}`);
    console.log(`Slug: ${event.slug}`);
    console.log(`Faces Backfill Complete: ${event.galleryFacesComplete}`);

    const totalPhotos = await prisma.photo.count({
      where: { eventId: event.id }
    });

    const scannedPhotos = await prisma.photo.count({
      where: { eventId: event.id, facesScanned: true }
    });

    const unscannedPhotos = await prisma.photo.count({
      where: { eventId: event.id, facesScanned: false }
    });

    console.log(`\n=== Photo Stats ===`);
    console.log(`Total Photos: ${totalPhotos}`);
    console.log(`Faces Scanned: ${scannedPhotos}`);
    console.log(`Unscanned / Pending: ${unscannedPhotos}`);
    
    console.log(`\n=====================`);
  } catch (err) {
    console.error('Error checking database status:', err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
