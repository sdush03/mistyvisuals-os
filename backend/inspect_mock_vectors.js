const fs = require('fs');
const path = require('path');

const mockDbPath = path.join(__dirname, 'db', 'mock_vectors.json');

console.log('=== INSPECT MOCK VECTORS ===\n');

if (!fs.existsSync(mockDbPath)) {
  console.log(`❌ Mock DB file not found at: ${mockDbPath}`);
  process.exit(0);
}

try {
  const data = fs.readFileSync(mockDbPath, 'utf8');
  const cache = JSON.parse(data);
  console.log(`Total vectors in mock DB file: ${cache.length}`);
  
  const eventGroups = {};
  cache.forEach((item, idx) => {
    const key = `eventId=${item.eventId}`;
    if (!eventGroups[key]) eventGroups[key] = [];
    eventGroups[key].push(item);
  });

  console.log('\nGrouped by event ID:');
  Object.keys(eventGroups).forEach(key => {
    console.log(`- ${key}: ${eventGroups[key].length} vectors`);
    const samples = eventGroups[key].slice(0, 3).map(item => `photoId=${item.photoId}, faceId=${item.faceId}`);
    console.log(`  Samples: ${samples.join(' | ')}`);
  });
} catch (e) {
  console.error('Error reading mock DB:', e);
}

console.log('\n=== END INSPECT ===');
