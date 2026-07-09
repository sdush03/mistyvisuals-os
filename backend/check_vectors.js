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

const { prisma } = require('./modules/quotation/prisma');
const qdrant = require('./utils/qdrant');

async function main() {
  console.log('=== VECTOR & PHOTO STATUS CHECK ===\n');

  // 1. Check Qdrant configuration
  console.log(`QDRANT_URL: ${process.env.QDRANT_URL || 'NOT SET'}`);
  console.log(`Qdrant Service isMock: ${qdrant.isMock}`);

  // 2. Find the Drishti Vaibhav event
  const event = await prisma.galleryEvent.findUnique({
    where: { slug: 'drishti-vaibhav-jun26' }
  });

  if (!event) {
    console.log('❌ Event "drishti-vaibhav-jun26" not found in database.');
    return;
  }

  console.log(`✅ Event found: ID=${event.id}, Title="${event.title}"`);

  // 3. Count photos
  const photoCount = await prisma.photo.count({
    where: { eventId: event.id }
  });
  console.log(`Total photos in database for this event: ${photoCount}`);

  // 4. Count vectors in Qdrant/Mock cache
  let vectorCount = 0;
  if (qdrant.isMock) {
    const mockCache = qdrant.mockCache || [];
    const eventVectors = mockCache.filter(item => item.eventId === event.id);
    vectorCount = eventVectors.length;
    console.log(`Total vectors in Mock DB for this event: ${vectorCount}`);
    if (eventVectors.length > 0) {
      console.log(`Sample vector photo IDs: ${[...new Set(eventVectors.map(v => v.photoId))].join(', ')}`);
    }
  } else {
    try {
      await qdrant.init();
      const res = await qdrant.client.getCollection('event_faces');
      console.log(`\u2705 Qdrant collection status:`, res);
      
      // Let's scroll to count points for this event
      const points = await qdrant.client.scroll('event_faces', {
        filter: {
          must: [
            {
              key: 'event_id',
              match: { value: event.id }
            }
          ]
        },
        limit: 1000,
        with_payload: true
      });
      vectorCount = points.points.length;
      console.log(`Total points in Qdrant for this event: ${vectorCount}`);
    } catch (e) {
      console.log(`❌ Failed to query Qdrant: ${e.message}`);
    }
  }

  if (photoCount > 0 && vectorCount === 0) {
    console.log('\n⚠️ WARNING: Photos exist in the database, but no face vectors were extracted or uploaded!');
    console.log('This means face matching cannot work. You may need to re-upload these photos using the uploader desktop app so it runs face extraction and uploads the vectors.');
  }

  console.log('\n=== END CHECK ===');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
