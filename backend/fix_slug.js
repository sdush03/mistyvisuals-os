const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Use the shared prisma module which correctly constructs DATABASE_URL
// from individual DB_HOST/DB_USER/DB_NAME/DB_PASSWORD env vars
const { prisma } = require('./modules/quotation/prisma');
console.log('DATABASE_URL resolved:', process.env.DATABASE_URL ? 'YES' : 'NO');

async function main() {
  // Diagnostic: List all gallery events with their slugs
  const allEvents = await prisma.galleryEvent.findMany({
    select: { id: true, slug: true, title: true, active: true, coverPhotoUrl: true, projectId: true }
  });
  console.log('\n=== All Gallery Events ===');
  allEvents.forEach(e => {
    console.log(`  id=${e.id} | slug="${e.slug}" | title="${e.title}" | active=${e.active} | hasCover=${!!e.coverPhotoUrl} | projectId=${e.projectId || 'null'}`);
  });
  console.log(`  Total: ${allEvents.length} events\n`);

  // Check if target slug already exists
  const existing = allEvents.find(e => e.slug === 'drishti-vaibhav-jun26');
  if (existing) {
    console.log('Gallery event with slug "drishti-vaibhav-jun26" already exists (id=' + existing.id + '). No update needed.');
    return;
  }

  // Update the slug of the gallery event in the database
  const result = await prisma.galleryEvent.updateMany({
    where: { slug: 'drishtivaibhav-jun26' },
    data: { slug: 'drishti-vaibhav-jun26' }
  });
  
  if (result.count > 0) {
    console.log('SUCCESS: Updated gallery_events slug from "drishtivaibhav-jun26" to "drishti-vaibhav-jun26"!');
    
    // Also sync the slug in the projects table if the gallery event has a projectId
    const updatedEvent = await prisma.galleryEvent.findUnique({
      where: { slug: 'drishti-vaibhav-jun26' },
      select: { projectId: true }
    });
    if (updatedEvent?.projectId) {
      const { pool } = require('./db');
      await pool.query('UPDATE projects SET slug = $1 WHERE id = $2', ['drishti-vaibhav-jun26', updatedEvent.projectId]);
      console.log('SUCCESS: Also synced slug to projects table for project ' + updatedEvent.projectId);
    }
  } else {
    console.log('NOTICE: No matching gallery event with slug "drishtivaibhav-jun26" was found.');
    console.log('  Existing slugs:', allEvents.map(e => `"${e.slug}"`).join(', '));
  }
}

main()
  .catch(err => console.error('ERROR:', err))
  .finally(() => prisma.$disconnect());
