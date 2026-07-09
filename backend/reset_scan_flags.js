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

async function run() {
  console.log('Resetting face scan flags for event ID = 1...');
  try {
    const photoUpdate = await prisma.$executeRaw`
      UPDATE photos SET faces_scanned = false WHERE event_id = 1;
    `;

    const eventUpdate = await prisma.$executeRaw`
      UPDATE gallery_events SET gallery_faces_complete = false WHERE id = 1;
    `;

    console.log(`✅ Successfully reset photos to unscanned!`);
    console.log('✅ Successfully reset gallery event faces_complete flag!');
  } catch (err) {
    console.error('Error resetting flags:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
