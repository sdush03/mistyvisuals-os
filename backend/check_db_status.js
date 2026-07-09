const path = require('path');
// Load env from backend folder or root
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });

if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_NAME) {
  const user = process.env.DB_USER || 'postgres';
  const pass = process.env.DB_PASSWORD || '';
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || '5432';
  const name = process.env.DB_NAME;
  process.env.DATABASE_URL = `postgresql://${user}:${pass}@${host}:${port}/${name}`;
}

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
