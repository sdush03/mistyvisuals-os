const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Update the slug of the gallery event in the database
  const result = await prisma.galleryEvent.updateMany({
    where: { slug: 'drishtivaibhav-jun26' },
    data: { slug: 'drishti-vaibhav-jun26' }
  });
  
  if (result.count > 0) {
    console.log('SUCCESS: Successfully updated slug from "drishtivaibhav-jun26" to "drishti-vaibhav-jun26"!');
  } else {
    console.log('NOTICE: No matching gallery event with slug "drishtivaibhav-jun26" was found. (It might have already been updated).');
  }
}

main()
  .catch(err => console.error('ERROR:', err))
  .finally(() => prisma.$disconnect());
