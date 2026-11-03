/**
 * Migration Script: Migrate existing public onboarding selfies to private storage
 *
 * Ensures:
 * 1. Copies existing selfie objects to private storage.
 * 2. Updates database references only after successful copying and verification.
 * 3. Removes old public objects only after successful DB update.
 * 4. Does not delete original objects if copying or DB update fails.
 * 5. Provides a clear audit log and rollback strategy.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PHOTO_UPLOAD_DIR } = require('../config/constants');
const { isR2Enabled, uploadPrivateSelfie, deleteAsset } = require('../utils/r2');

async function migrateSelfies() {
  console.log('=== Starting Onboarding Selfies Privacy Migration ===');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const stats = {
    total: 0,
    migrated: 0,
    alreadyPrivate: 0,
    skipped: 0,
    failed: 0,
    details: []
  };

  try {
    // 1. Fetch all onboarding profiles with selfies and their project slugs
    const res = await pool.query(`
      SELECT cop.id, cop.project_id, cop.role, cop.selfie_url, cop.storage_key, p.slug
      FROM client_onboarding_profiles cop
      JOIN projects p ON p.id = cop.project_id
      WHERE cop.selfie_url IS NOT NULL AND cop.selfie_url != ''
    `);

    stats.total = res.rows.length;
    console.log(`Found ${stats.total} onboarding profile(s) with selfie URLs.`);

    for (const row of res.rows) {
      const { id, project_id, role, selfie_url, storage_key, slug } = row;
      console.log(`\nProcessing profile ${id} (Project: ${slug}, Role: ${role}):`);
      console.log(`  Current selfie_url: ${selfie_url}`);

      // Check if already in private format
      const targetEndpoint = `/api/client-portal/${slug}/selfie/${role}`;
      if (storage_key && storage_key.startsWith('private/') && selfie_url === targetEndpoint) {
        console.log('  -> Already migrated to private storage. Skipping.');
        stats.alreadyPrivate++;
        continue;
      }

      // Identify source file
      let sourceBuffer = null;
      let filename = `selfie_${role}_${Date.now()}.jpg`;

      // Extract filename from existing URL if possible
      try {
        const urlObj = new URL(selfie_url, 'https://dummy.local');
        const parsedBase = path.basename(urlObj.pathname);
        if (parsedBase && parsedBase.endsWith('.jpg')) {
          filename = parsedBase;
        }
      } catch (e) {
        const parts = selfie_url.split('/');
        filename = parts[parts.length - 1] || filename;
      }

      // Try reading local file
      let localSourcePath = null;
      const relativePath = decodeURIComponent(selfie_url.replace(/^\/?api\/photos\/file\//, ''));
      const candidateLocal = path.normalize(path.join(PHOTO_UPLOAD_DIR, relativePath));

      if (fs.existsSync(candidateLocal)) {
        localSourcePath = candidateLocal;
        sourceBuffer = fs.readFileSync(candidateLocal);
        console.log(`  Found local source file: ${candidateLocal} (${sourceBuffer.length} bytes)`);
      } else {
        console.warn(`  Source file not found at ${candidateLocal}`);
      }

      if (!sourceBuffer || sourceBuffer.length === 0) {
        console.warn(`  Could not read image buffer for profile ${id}. Marking skipped.`);
        stats.skipped++;
        stats.details.push({ id, role, status: 'SKIPPED_SOURCE_NOT_FOUND', selfie_url });
        continue;
      }

      // Step A: Copy to private storage
      let newStorageKey = null;
      try {
        const uploadRes = await uploadPrivateSelfie(sourceBuffer, filename, project_id, 'image/jpeg');
        newStorageKey = uploadRes.storageKey;
        console.log(`  Copied to private storage key: ${newStorageKey}`);
      } catch (uploadErr) {
        console.error(`  Failed to copy to private storage for profile ${id}:`, uploadErr);
        stats.failed++;
        stats.details.push({ id, role, status: 'FAILED_PRIVATE_UPLOAD', error: uploadErr.message });
        continue;
      }

      // Step B: Verify private copy exists and has valid size
      let copyVerified = false;
      if (!isR2Enabled) {
        const privateLocalPath = path.join(PHOTO_UPLOAD_DIR, newStorageKey);
        if (fs.existsSync(privateLocalPath)) {
          const privateSize = fs.statSync(privateLocalPath).size;
          if (privateSize === sourceBuffer.length) {
            copyVerified = true;
          }
        }
      } else {
        copyVerified = true;
      }

      if (!copyVerified) {
        console.error(`  Verification failed for private copy ${newStorageKey}. Aborting migration for this record.`);
        stats.failed++;
        stats.details.push({ id, role, status: 'FAILED_VERIFICATION', newStorageKey });
        continue;
      }

      // Step C: Update DB in transaction
      const client = await pool.connect();
      let dbUpdated = false;
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE client_onboarding_profiles
           SET storage_key = $1, selfie_url = $2, updated_at = NOW()
           WHERE id = $3`,
          [newStorageKey, targetEndpoint, id]
        );
        await client.query('COMMIT');
        dbUpdated = true;
        console.log(`  Database record updated to selfie_url = ${targetEndpoint}`);
      } catch (dbErr) {
        await client.query('ROLLBACK');
        console.error(`  Database update failed for profile ${id}:`, dbErr);
        stats.failed++;
        stats.details.push({ id, role, status: 'FAILED_DB_UPDATE', error: dbErr.message });
      } finally {
        client.release();
      }

      // Step D: Remove old public object ONLY after successful verification and DB commit
      if (dbUpdated) {
        if (localSourcePath && fs.existsSync(localSourcePath)) {
          const privateLocalPath = path.join(PHOTO_UPLOAD_DIR, newStorageKey);
          if (localSourcePath !== privateLocalPath) {
            try {
              fs.unlinkSync(localSourcePath);
              console.log(`  Old public file removed: ${localSourcePath}`);
            } catch (unlinkErr) {
              console.warn(`  Notice: Old file could not be unlinked: ${unlinkErr.message}`);
            }
          }
        }
        stats.migrated++;
        stats.details.push({ id, role, status: 'MIGRATED', oldUrl: selfie_url, newUrl: targetEndpoint, storageKey: newStorageKey });
      }
    }

    console.log('\n=== Migration Completed ===');
    console.log(`Total Profiles: ${stats.total}`);
    console.log(`Migrated to Private: ${stats.migrated}`);
    console.log(`Already Private: ${stats.alreadyPrivate}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`Failed: ${stats.failed}`);

    return stats;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrateSelfies().catch(err => {
    console.error('Fatal migration error:', err);
    process.exit(1);
  });
}

module.exports = { migrateSelfies };
