const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

if (process.env.DB_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DB_URL;
}

const dbKeys = Object.keys(process.env).filter(k => 
  k.toLowerCase().includes('db') || 
  k.toLowerCase().includes('database') || 
  k.toLowerCase().includes('url')
);
console.log('Detected DB-related env keys:', dbKeys);
if (dbKeys.length > 0 && !process.env.DATABASE_URL) {
  // Use the first DB-related variable as the fallback database URL
  const matchedKey = dbKeys.find(k => process.env[k] && process.env[k].startsWith('postgres'));
  if (matchedKey) {
    console.log(`Mapping ${matchedKey} to DATABASE_URL...`);
    process.env.DATABASE_URL = process.env[matchedKey];
  }
}

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
