const path = require('path');
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

const qdrant = require('./utils/qdrant');

async function run() {
  console.log('Fetching all vectors from Qdrant...');
  const vectors = await qdrant.getAllVectorsForEvent(1);
  console.log(`Found ${vectors.length} vectors in Qdrant.`);

  if (vectors.length === 0) {
    console.log('No vectors found in Qdrant!');
    return;
  }

  const { execSync } = require('child_process');
  const scriptPath = path.join(__dirname, 'utils', 'face_rec.py');
  
  const dbDir = path.join(__dirname, 'db');
  if (!require('fs').existsSync(dbDir)) {
    require('fs').mkdirSync(dbDir, { recursive: true });
  }
  const tempDbJsonPath = path.join(dbDir, `temp_test_cluster.json`);
  const fs = require('fs');

  fs.writeFileSync(tempDbJsonPath, JSON.stringify(vectors), 'utf8');

  try {
    console.log('Running python face_rec.py cluster...');
    const output = execSync(`python3 "${scriptPath}" cluster "${tempDbJsonPath}"`).toString();
    const result = JSON.parse(output);
    console.log('Clustering completed successfully!');
    console.log('Number of clusters generated:', result.clusters ? result.clusters.length : 0);
    if (result.clusters && result.clusters.length > 0) {
      console.log('Sample cluster:', JSON.stringify(result.clusters[0]));
    }
  } catch (err) {
    console.error('Clustering script failed with error:', err.message);
    if (err.stdout) console.log('Stdout:', err.stdout.toString());
    if (err.stderr) console.log('Stderr:', err.stderr.toString());
  } finally {
    if (fs.existsSync(tempDbJsonPath)) fs.unlinkSync(tempDbJsonPath);
  }
}

run();
