const Fastify = require('fastify');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const sharp = require('sharp');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/postgres' });

async function runSecurityTestSuite() {
  console.log('================================================================');
  console.log('  Client Portal Couple Onboarding — Security Hardening Test Suite');
  console.log('================================================================\n');

  process.env.NODE_ENV = 'test';

  const fastify = Fastify({ logger: false });

  await fastify.register(require('@fastify/cookie'));
  await fastify.register(require('@fastify/jwt'), {
    secret: process.env.JWT_SECRET || 'test-jwt-secret-misty-visuals-12345'
  });
  await fastify.register(require('@fastify/multipart'), {
    limits: { fileSize: 50 * 1024 * 1024 }
  });

  const mockAdminUser = {
    sub: 'admin-user-1',
    email: 'admin@mistyvisuals.com',
    role: 'ADMIN'
  };

  const getAuthFromRequest = (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer admin-token')) {
      return mockAdminUser;
    }
    if (req.cookies && req.cookies.mv_auth === 'admin-cookie') {
      return mockAdminUser;
    }
    return null;
  };

  const requireAuth = (req, reply) => {
    const auth = getAuthFromRequest(req);
    if (!auth) {
      reply.code(401).send({ error: 'Unauthorized' });
      return null;
    }
    return auth;
  };

  await fastify.register(require('./routes/clientPortal'), {
    pool,
    getAuthFromRequest,
    requireAuth
  });

  const { PHOTO_UPLOAD_DIR } = require('./config/constants');
  const getImageContentType = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    return 'image/jpeg';
  };

  await fastify.register(require('./routes/photo-library'), {
    pool,
    requireAuth,
    requireAdmin: requireAuth,
    PHOTO_UPLOAD_DIR,
    getImageContentType,
    fs,
    path,
    crypto: require('crypto')
  });

  await fastify.ready();
  console.log('✓ Fastify app ready with clientPortal & photo-library routes registered.\n');

  // Test setup: Project A and Project B
  const timestamp = Date.now();
  const slugA = `sec-test-project-a-${timestamp}`;
  const slugB = `sec-test-project-b-${timestamp}`;
  const passcodeA = '4321';
  const passcodeB = '8765';

  const leadA = await pool.query(
    `INSERT INTO leads (name, source, status, phone_primary, bride_name, groom_name, bride_phone_primary, groom_phone_primary, bride_email, groom_email, bride_instagram, groom_instagram)
     VALUES ($1, 'Website', 'Booked', '+919876500001', 'Meera Rao', 'Rohan Sen', '+919876500002', '+919876500003', 'meera@example.com', 'rohan@example.com', 'meera_r', 'rohan_s')
     RETURNING id`,
    [slugA]
  );
  const leadAId = leadA.rows[0].id;

  const projA = await pool.query(
    `INSERT INTO projects (lead_id, name, status, slug, passcode)
     VALUES ($1, 'Bride & Groom', 'upcoming', $2, $3)
     RETURNING id, slug, passcode`,
    [leadAId, slugA, passcodeA]
  );
  const projectAId = projA.rows[0].id;

  // Add dummy event for mutating endpoint test
  const eventA = await pool.query(
    `INSERT INTO project_events (project_id, event_type, event_date, is_verified)
     VALUES ($1, 'Wedding Ceremony', '2026-12-10', false)
     RETURNING id`,
    [projectAId]
  );
  const eventAId = eventA.rows[0].id;

  // Project B
  const leadB = await pool.query(
    `INSERT INTO leads (name, source, status, phone_primary, bride_name, groom_name)
     VALUES ($1, 'Instagram', 'Booked', '+919876500004', 'Pooja', 'Kunal')
     RETURNING id`,
    [slugB]
  );
  const leadBId = leadB.rows[0].id;

  const projB = await pool.query(
    `INSERT INTO projects (lead_id, name, status, slug, passcode)
     VALUES ($1, 'Pooja & Kunal', 'upcoming', $2, $3)
     RETURNING id, slug, passcode`,
    [leadBId, slugB, passcodeB]
  );
  const projectBId = projB.rows[0].id;

  console.log(`✓ Created Project A (${projectAId}, slug: ${slugA}) and Project B (${projectBId}, slug: ${slugB})`);

  // Sign cookies for Project A and Project B
  const tokenA = fastify.jwt.sign({ projectId: projectAId, slug: slugA });
  const cookieA = `mv_client_auth=${tokenA}`;

  const tokenB = fastify.jwt.sign({ projectId: projectBId, slug: slugB });
  const cookieB = `mv_client_auth=${tokenB}`;

  // Create valid JPEG fixture for testing
  const validJpeg = await sharp({
    create: { width: 300, height: 300, channels: 3, background: { r: 240, g: 200, b: 180 } }
  }).jpeg().toBuffer();

  const boundary = '----WebKitFormBoundaryTestSecHardening123';
  const validMultipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="selfie_test.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    validJpeg,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  let passedTests = 0;
  const totalTests = 16;

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Public unauthenticated access to private selfie is denied (401 & 403)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 1: Public Unauthenticated Access Denied ---');
    const unauthSelfieRes = await fastify.inject({
      method: 'GET',
      url: `/client-portal/${slugA}/selfie/bride`
    });
    if (unauthSelfieRes.statusCode !== 401) {
      throw new Error(`Expected 401 Unauthorized for public selfie request, got ${unauthSelfieRes.statusCode}`);
    }

    // Public /api/photos/file/* blocking private assets
    const blockedPrivateRes = await fastify.inject({
      method: 'GET',
      url: `/api/photos/file/private/portals/${projectAId}/selfies/selfie_bride_123.jpg`
    });
    if (blockedPrivateRes.statusCode !== 403) {
      throw new Error(`Expected 403 Forbidden for private asset path in photo-library, got ${blockedPrivateRes.statusCode}`);
    }
    console.log('✓ PASS: Public unauthenticated requests to private selfies return 401/403');
    passedTests++;

    // ------------------------------------------------------------------------
    // Upload a test selfie for Bride on Project A to test subsequent access rules
    // ------------------------------------------------------------------------
    const uploadResA = await fastify.inject({
      method: 'POST',
      url: `/client-portal/${slugA}/onboarding/upload-selfie?role=bride`,
      headers: {
        cookie: cookieA,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-bypass-face-validation': 'true'
      },
      payload: validMultipartBody
    });
    if (uploadResA.statusCode !== 200) {
      throw new Error(`Initial upload failed: ${uploadResA.body}`);
    }
    const uploadAJson = JSON.parse(uploadResA.body);
    const storageKeyBrideA = uploadAJson.storage_key;

    // Submit bride profile
    const submitBrideARes = await fastify.inject({
      method: 'POST',
      url: `/client-portal/${slugA}/onboarding/submit`,
      headers: { cookie: cookieA },
      payload: {
        role: 'bride',
        name: 'Meera Rao',
        phone_primary: '+919876500002',
        email: 'meera@example.com',
        instagram: 'meera_r',
        selfie_url: uploadAJson.selfie_url,
        storage_key: storageKeyBrideA
      }
    });
    if (submitBrideARes.statusCode !== 200) {
      throw new Error(`Bride profile submit failed: ${submitBrideARes.body}`);
    }

    // ------------------------------------------------------------------------
    // TEST 2: Authorized project client can access their own selfie
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Authorized Project Client Access ---');
    const authClientRes = await fastify.inject({
      method: 'GET',
      url: `/client-portal/${slugA}/selfie/bride`,
      headers: { cookie: cookieA }
    });
    if (authClientRes.statusCode !== 200) {
      throw new Error(`Expected 200 for authorized client, got ${authClientRes.statusCode}: ${authClientRes.body}`);
    }
    if (!authClientRes.headers['content-type']?.includes('image/jpeg')) {
      throw new Error(`Expected image/jpeg content-type, got ${authClientRes.headers['content-type']}`);
    }
    if (!authClientRes.headers['cache-control']?.includes('private')) {
      throw new Error(`Expected private cache control header, got ${authClientRes.headers['cache-control']}`);
    }
    console.log('✓ PASS: Authorized client gets 200 with private cache headers');
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 3: Cross-project client access is denied (IDOR protection)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Cross-Project Client Access Denied (IDOR Protection) ---');
    const crossClientRes = await fastify.inject({
      method: 'GET',
      url: `/client-portal/${slugA}/selfie/bride`,
      headers: { cookie: cookieB }
    });
    if (crossClientRes.statusCode !== 401) {
      throw new Error(`Expected 401 for cross-project client, got ${crossClientRes.statusCode}`);
    }
    console.log('✓ PASS: Client from Project B cannot access Project A selfie');
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 4: Authorized admin can access selfie
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Authorized Admin Access ---');
    const adminRes = await fastify.inject({
      method: 'GET',
      url: `/client-portal/${slugA}/selfie/bride`,
      headers: { authorization: 'Bearer admin-token' }
    });
    if (adminRes.statusCode !== 200) {
      throw new Error(`Expected 200 for admin, got ${adminRes.statusCode}`);
    }
    console.log('✓ PASS: Authorized team/admin session successfully accesses selfie');
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 5: Production cannot bypass face validation through request headers
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Face Validation Bypass Disabled in Production ---');
    process.env.NODE_ENV = 'production';
    const prodBypassRes = await fastify.inject({
      method: 'POST',
      url: `/client-portal/${slugA}/onboarding/upload-selfie?role=groom`,
      headers: {
        cookie: cookieA,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-bypass-face-validation': 'true' // Attempt to exploit header in production!
      },
      payload: validMultipartBody // Plain geometric box, no human face
    });
    process.env.NODE_ENV = 'test'; // restore

    // In production, the bypass header is ignored and face validation is executed, failing on face-less box
    if (prodBypassRes.statusCode === 200) {
      throw new Error('VULNERABILITY: x-bypass-face-validation header was honoured in production mode!');
    }
    console.log(`✓ PASS: Production mode rejected unverified face (Status: ${prodBypassRes.statusCode})`);
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 6: Corrupt or disguised non-image uploads rejected (Fail-closed)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Fail-Closed Image Processing (Reject Corrupt / Non-Images) ---');
    const corruptBuffer = Buffer.from('GIF89a<?php echo "malicious"; ?>');
    const corruptBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="exploit.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      corruptBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const corruptRes = await fastify.inject({
      method: 'POST',
      url: `/client-portal/${slugA}/onboarding/upload-selfie?role=groom`,
      headers: {
        cookie: cookieA,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-bypass-face-validation': 'true'
      },
      payload: corruptBody
    });
    if (corruptRes.statusCode !== 400) {
      throw new Error(`Expected 400 for corrupt image, got ${corruptRes.statusCode}`);
    }
    console.log('✓ PASS: Corrupt non-image disguised as JPEG is rejected with 400 (fail-closed)');
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 7: Oversized files rejected before full buffering
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Oversized Upload Rejection ---');
    const largeZeroBuffer = Buffer.alloc(26 * 1024 * 1024); // 26MB
    const largeBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="huge.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      largeZeroBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const largeRes = await fastify.inject({
      method: 'POST',
      url: `/client-portal/${slugA}/onboarding/upload-selfie?role=groom`,
      headers: {
        cookie: cookieA,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-bypass-face-validation': 'true'
      },
      payload: largeBody
    });
    if (largeRes.statusCode !== 400) {
      throw new Error(`Expected 400 for oversized payload, got ${largeRes.statusCode}`);
    }
    console.log('✓ PASS: Files > 25MB rejected with 400');
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 8: Repeated wrong passcodes trigger rate limiting & lockout
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8: Passcode Rate Limiting & Lockout (5 Attempts) ---');
    const bruteSlug = `sec-brute-${timestamp}`;
    const bruteLead = await pool.query(
      `INSERT INTO leads (name, source, status, phone_primary) VALUES ($1, 'Instagram', 'Booked', '+919876500008') RETURNING id`,
      [bruteSlug]
    );
    await pool.query(
      `INSERT INTO projects (lead_id, name, status, slug, passcode) VALUES ($1, 'Brute Test', 'upcoming', $2, '9876')`,
      [bruteLead.rows[0].id, bruteSlug]
    );

    // 4 wrong attempts should return 401
    for (let i = 1; i <= 4; i++) {
      const attempt = await fastify.inject({
        method: 'POST',
        url: `/client-portal/${bruteSlug}/verify`,
        headers: { 'x-forwarded-for': '198.51.100.42' },
        payload: { passcode: '0000' }
      });
      if (attempt.statusCode !== 401) {
        throw new Error(`Attempt ${i} expected 401, got ${attempt.statusCode}`);
      }
    }

    // 5th wrong attempt triggers lockout
    const fifthAttempt = await fastify.inject({
      method: 'POST',
      url: `/client-portal/${bruteSlug}/verify`,
      headers: { 'x-forwarded-for': '198.51.100.42' },
      payload: { passcode: '0000' }
    });
    if (fifthAttempt.statusCode !== 429) {
      throw new Error(`Expected 429 Too Many Requests on 5th attempt, got ${fifthAttempt.statusCode}`);
    }
    if (!fifthAttempt.headers['retry-after']) {
      throw new Error('Expected Retry-After header on lockout');
    }

    // Even with the correct passcode, access remains locked
    const lockedValidAttempt = await fastify.inject({
      method: 'POST',
      url: `/client-portal/${bruteSlug}/verify`,
      headers: { 'x-forwarded-for': '198.51.100.42' },
      payload: { passcode: '9876' }
    });
    if (lockedValidAttempt.statusCode !== 429) {
      throw new Error(`Expected 429 while locked out, got ${lockedValidAttempt.statusCode}`);
    }
    console.log('✓ PASS: 5 failed passcode attempts trigger 429 lockout with Retry-After');
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 9: Onboarding profile & CRM writes roll back together on DB failure
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 9: Atomic Database Transaction (All-or-Nothing Rollback) ---');
    // Setup a simulated trigger error on leads table
    await pool.query(`
      CREATE OR REPLACE FUNCTION fail_lead_trigger() RETURNS trigger AS $$
      BEGIN
        IF NEW.bride_name = 'TriggerFailBride' THEN
          RAISE EXCEPTION 'Simulated CRM database failure during update';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pool.query(`
      DROP TRIGGER IF EXISTS trg_test_fail_lead ON leads;
      CREATE TRIGGER trg_test_fail_lead
      BEFORE UPDATE ON leads
      FOR EACH ROW
      EXECUTE FUNCTION fail_lead_trigger();
    `);

    const failLead = await pool.query(
      `INSERT INTO leads (name, source, status, phone_primary) VALUES ($1, 'Website', 'Booked', '+919876500009') RETURNING id`,
      [`fail-lead-${timestamp}`]
    );
    const failProj = await pool.query(
      `INSERT INTO projects (lead_id, name, status, slug, passcode) VALUES ($1, 'Fail Proj', 'upcoming', $2, '5555') RETURNING id, slug`,
      [failLead.rows[0].id, `fail-proj-${timestamp}`]
    );
    const failToken = fastify.jwt.sign({ projectId: failProj.rows[0].id, slug: failProj.rows[0].slug });

    const failSubmit = await fastify.inject({
      method: 'POST',
      url: `/client-portal/${failProj.rows[0].slug}/onboarding/submit`,
      headers: { cookie: `mv_client_auth=${failToken}` },
      payload: {
        role: 'bride',
        name: 'TriggerFailBride',
        phone_primary: '+919876543210',
        email: 'fail@example.com',
        instagram: 'fail_insta',
        selfie_url: '/api/client-portal/test/selfie/bride'
      }
    });

    if (failSubmit.statusCode !== 500) {
      throw new Error(`Expected 500 on simulated DB failure, got ${failSubmit.statusCode}`);
    }

    // Verify rollback: client_onboarding_profiles must have 0 rows for this project
    const checkRollback = await pool.query(
      `SELECT * FROM client_onboarding_profiles WHERE project_id = $1`,
      [failProj.rows[0].id]
    );
    if (checkRollback.rows.length !== 0) {
      throw new Error('Transaction failed to roll back client_onboarding_profiles!');
    }

    // Clean up trigger
    await pool.query(`DROP TRIGGER IF EXISTS trg_test_fail_lead ON leads; DROP FUNCTION IF EXISTS fail_lead_trigger;`);
    console.log('✓ PASS: CRM update failure safely triggered ROLLBACK of client_onboarding_profiles');
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 10: Bride CRM changes do not affect Groom records
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 10: Bride CRM Isolation ---');
    const leadStateBefore = await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadAId]);
    const originalGroomName = leadStateBefore.rows[0].groom_name;
    const originalGroomPhone = leadStateBefore.rows[0].groom_phone_primary;

    // Update Bride
    await fastify.inject({
      method: 'POST',
      url: `/client-portal/${slugA}/onboarding/submit`,
      headers: { cookie: cookieA },
      payload: {
        role: 'bride',
        name: 'Meera Rao-Sharma',
        phone_primary: '+919876500002',
        email: 'meera.new@example.com',
        instagram: 'meera_new',
        selfie_url: uploadAJson.selfie_url,
        storage_key: storageKeyBrideA
      }
    });

    const leadStateAfterBride = await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadAId]);
    if (leadStateAfterBride.rows[0].groom_name !== originalGroomName ||
        leadStateAfterBride.rows[0].groom_phone_primary !== originalGroomPhone) {
      throw new Error('Groom fields were modified by bride onboarding submission!');
    }
    console.log('✓ PASS: Bride onboarding updates only bride CRM fields; groom is untouched');
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 11: Groom CRM changes do not affect Bride records
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 11: Groom CRM Isolation ---');
    // Upload selfie for Groom
    const uploadResGroom = await fastify.inject({
      method: 'POST',
      url: `/client-portal/${slugA}/onboarding/upload-selfie?role=groom`,
      headers: {
        cookie: cookieA,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-bypass-face-validation': 'true'
      },
      payload: validMultipartBody
    });
    const uploadGroomJson = JSON.parse(uploadResGroom.body);

    await fastify.inject({
      method: 'POST',
      url: `/client-portal/${slugA}/onboarding/submit`,
      headers: { cookie: cookieA },
      payload: {
        role: 'groom',
        name: 'Rohan Sen',
        phone_primary: '+919876500003',
        email: 'rohan.sen@example.com',
        instagram: 'rohan_sen',
        selfie_url: uploadGroomJson.selfie_url,
        storage_key: uploadGroomJson.storage_key
      }
    });

    const leadStateAfterGroom = await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadAId]);
    if (leadStateAfterGroom.rows[0].bride_name !== 'Meera Rao-Sharma' ||
        leadStateAfterGroom.rows[0].bride_email !== 'meera.new@example.com') {
      throw new Error('Bride fields were modified by groom onboarding submission!');
    }
    console.log('✓ PASS: Groom onboarding updates only groom CRM fields; bride is untouched');
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 12: Mandatory Onboarding For All Projects (Direct API Enforcement)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 12: Mandatory Onboarding For All Projects (Direct API Enforcement) ---');
    const mandatorySlug = `mandatory-project-${timestamp}`;
    const mandatoryLead = await pool.query(
      `INSERT INTO leads (name, source, status, phone_primary, bride_name, groom_name) VALUES ($1, 'Website', 'Booked', '+919876500012', 'Kavya', 'Aryan') RETURNING id`,
      [mandatorySlug]
    );
    const mandatoryProj = await pool.query(
      `INSERT INTO projects (lead_id, name, status, slug, passcode)
       VALUES ($1, 'Kavya & Aryan', 'upcoming', $2, '2222')
       RETURNING id, slug`,
      [mandatoryLead.rows[0].id, mandatorySlug]
    );
    const mandatoryToken = fastify.jwt.sign({ projectId: mandatoryProj.rows[0].id, slug: mandatorySlug });

    // Step 1: Pre-onboarding GET returns locked workspace (events: [], invoice: null)
    const preGetRes = await fastify.inject({
      method: 'GET',
      url: `/client-portal/${mandatorySlug}`,
      headers: { cookie: `mv_client_auth=${mandatoryToken}` }
    });
    const preData = JSON.parse(preGetRes.body);
    if (preData.data.onboarding.isFullyCompleted !== false || preData.data.events.length !== 0 || preData.data.invoice !== null) {
      throw new Error('Pre-onboarding GET leaked workspace data');
    }

    // Step 2: Mutating details endpoint blocked with 403 requiresOnboarding
    const mutateRes = await fastify.inject({
      method: 'POST',
      url: `/client-portal/${mandatorySlug}/details`,
      headers: { cookie: `mv_client_auth=${mandatoryToken}` },
      payload: { bride_name: 'Kavya Updated' }
    });
    if (mutateRes.statusCode !== 403 || !JSON.parse(mutateRes.body).requiresOnboarding) {
      throw new Error(`Expected 403 requiresOnboarding on /details before onboarding, got ${mutateRes.statusCode}`);
    }

    console.log('✓ PASS: All projects enforce mandatory onboarding and block workspace access until completed');
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 13: Replaced selfies are cleaned up safely
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 13: Replaced Selfie Cleanup ---');
    // Upload replacement selfie for Groom
    const uploadGroom2 = await fastify.inject({
      method: 'POST',
      url: `/client-portal/${slugA}/onboarding/upload-selfie?role=groom`,
      headers: {
        cookie: cookieA,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-bypass-face-validation': 'true'
      },
      payload: validMultipartBody
    });
    const uploadGroom2Json = JSON.parse(uploadGroom2.body);
    const oldGroomStorageKey = uploadGroomJson.storage_key;
    const newGroomStorageKey = uploadGroom2Json.storage_key;

    // Submit replacement
    await fastify.inject({
      method: 'POST',
      url: `/client-portal/${slugA}/onboarding/submit`,
      headers: { cookie: cookieA },
      payload: {
        role: 'groom',
        name: 'Rohan Sen',
        phone_primary: '+919876500003',
        email: 'rohan.sen@example.com',
        instagram: 'rohan_sen',
        selfie_url: uploadGroom2Json.selfie_url,
        storage_key: newGroomStorageKey
      }
    });

    // Verify DB updated
    const groomProfRes = await pool.query(
      `SELECT storage_key FROM client_onboarding_profiles WHERE project_id = $1 AND role = 'groom'`,
      [projectAId]
    );
    if (groomProfRes.rows[0].storage_key !== newGroomStorageKey) {
      throw new Error('Storage key was not updated to new replacement');
    }

    // Verify old local file was removed
    const { PHOTO_UPLOAD_DIR } = require('./config/constants');
    const oldFilePath = path.join(PHOTO_UPLOAD_DIR, oldGroomStorageKey);
    const newFilePath = path.join(PHOTO_UPLOAD_DIR, newGroomStorageKey);

    if (fs.existsSync(oldFilePath)) {
      throw new Error(`Old selfie file was not deleted: ${oldFilePath}`);
    }
    if (!fs.existsSync(newFilePath)) {
      throw new Error(`New selfie file is missing: ${newFilePath}`);
    }
    console.log('✓ PASS: Replaced selfie file successfully deleted from private storage');
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 14: All four onboarding completion combinations still work
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 14: Onboarding State Combinations Matrix ---');
    // Create matrix test project
    const matrixSlug = `matrix-test-${timestamp}`;
    const matrixLead = await pool.query(
      `INSERT INTO leads (name, source, status, phone_primary) VALUES ($1, 'Instagram', 'Booked', '+919876500014') RETURNING id`,
      [matrixSlug]
    );
    const matrixProj = await pool.query(
      `INSERT INTO projects (lead_id, name, status, slug, passcode)
       VALUES ($1, 'Matrix Project', 'upcoming', $2, '3333')
       RETURNING id, slug`,
      [matrixLead.rows[0].id, matrixSlug]
    );
    const matrixId = matrixProj.rows[0].id;
    const matrixToken = fastify.jwt.sign({ projectId: matrixId, slug: matrixSlug });

    // Combination 1: Incomplete / Incomplete
    const m1 = await fastify.inject({
      method: 'GET',
      url: `/client-portal/${matrixSlug}`,
      headers: { cookie: `mv_client_auth=${matrixToken}` }
    });
    const m1Data = JSON.parse(m1.body).data.onboarding;
    if (m1Data.isFullyCompleted !== false || m1Data.bride.is_completed || m1Data.groom.is_completed) {
      throw new Error('Combination 1 failed');
    }

    // Combination 2: Complete Bride / Incomplete Groom
    await pool.query(
      `INSERT INTO client_onboarding_profiles (project_id, role, name, phone_primary, email, instagram, selfie_url, storage_key, is_completed)
       VALUES ($1, 'bride', 'Bride 1', '+919999999991', 'b1@test.com', 'b1', '/api/selfie', 'key1', true)`,
      [matrixId]
    );
    const m2 = await fastify.inject({
      method: 'GET',
      url: `/client-portal/${matrixSlug}`,
      headers: { cookie: `mv_client_auth=${matrixToken}` }
    });
    const m2Data = JSON.parse(m2.body).data.onboarding;
    if (m2Data.isFullyCompleted !== false || !m2Data.bride.is_completed || m2Data.groom.is_completed) {
      throw new Error('Combination 2 failed');
    }

    // Combination 3: Incomplete Bride / Complete Groom
    await pool.query(`UPDATE client_onboarding_profiles SET is_completed = false WHERE project_id = $1 AND role = 'bride'`, [matrixId]);
    await pool.query(
      `INSERT INTO client_onboarding_profiles (project_id, role, name, phone_primary, email, instagram, selfie_url, storage_key, is_completed)
       VALUES ($1, 'groom', 'Groom 1', '+919999999992', 'g1@test.com', 'g1', '/api/selfie', 'key2', true)`,
      [matrixId]
    );
    const m3 = await fastify.inject({
      method: 'GET',
      url: `/client-portal/${matrixSlug}`,
      headers: { cookie: `mv_client_auth=${matrixToken}` }
    });
    const m3Data = JSON.parse(m3.body).data.onboarding;
    if (m3Data.isFullyCompleted !== false || m3Data.bride.is_completed || !m3Data.groom.is_completed) {
      throw new Error('Combination 3 failed');
    }

    // Combination 4: Complete Bride / Complete Groom
    await pool.query(`UPDATE client_onboarding_profiles SET is_completed = true WHERE project_id = $1 AND role = 'bride'`, [matrixId]);
    const m4 = await fastify.inject({
      method: 'GET',
      url: `/client-portal/${matrixSlug}`,
      headers: { cookie: `mv_client_auth=${matrixToken}` }
    });
    const m4Data = JSON.parse(m4.body).data.onboarding;
    if (m4Data.isFullyCompleted !== true || !m4Data.bride.is_completed || !m4Data.groom.is_completed) {
      throw new Error('Combination 4 failed');
    }
    console.log('✓ PASS: All 4 onboarding state combinations verified correctly');
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 15: Existing MyCircle public gallery images remain accessible
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 15: Public Gallery Media Remains Accessible ---');
    // Ensure public photo serving is unaffected
    const publicPhotoDir = path.join(PHOTO_UPLOAD_DIR, 'events', 'demo-event');
    fs.mkdirSync(publicPhotoDir, { recursive: true });
    const publicSampleFile = path.join(publicPhotoDir, 'sample_gallery_photo.jpg');
    fs.writeFileSync(publicSampleFile, validJpeg);

    const publicPhotoRes = await fastify.inject({
      method: 'GET',
      url: '/api/photos/file/events/demo-event/sample_gallery_photo.jpg'
    });
    if (publicPhotoRes.statusCode !== 200) {
      throw new Error(`Public gallery photo delivery failed with status ${publicPhotoRes.statusCode}`);
    }
    if (!publicPhotoRes.headers['content-type']?.includes('image/jpeg')) {
      throw new Error('Invalid content type for public gallery photo');
    }
    console.log('✓ PASS: Public gallery photographs continue serving without authentication');
    passedTests++;

    // ------------------------------------------------------------------------
    // TEST 16: Existing Client Portal functionality continues working
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 16: Portal End-to-End Functionality Intact ---');
    const portalDataRes = await fastify.inject({
      method: 'GET',
      url: `/client-portal/${slugA}`,
      headers: { cookie: cookieA }
    });
    const fullPortal = JSON.parse(portalDataRes.body);
    if (!fullPortal.success || fullPortal.locked) {
      throw new Error('Client portal loading failed');
    }
    if (!Array.isArray(fullPortal.data.events) || !Array.isArray(fullPortal.data.deliverables) || !Array.isArray(fullPortal.data.checklist)) {
      throw new Error('Portal data arrays are missing or malformed');
    }

    // Server-side enforcement of onboarding completion on mutating APIs
    // Project A is fully onboarded, so event verification should succeed
    const verifyEvRes = await fastify.inject({
      method: 'POST',
      url: `/client-portal/${slugA}/events/${eventAId}/verify`,
      headers: { cookie: cookieA }
    });
    if (verifyEvRes.statusCode !== 200) {
      throw new Error(`Completed couple should be able to verify events, got ${verifyEvRes.statusCode}`);
    }

    // Now test un-onboarded project attempting to verify event
    const eventB = await pool.query(
      `INSERT INTO project_events (project_id, event_type, event_date, is_verified)
       VALUES ($1, 'Mehendi', '2026-11-20', false)
       RETURNING id`,
      [projectBId]
    );
    const unonboardedMutateRes = await fastify.inject({
      method: 'POST',
      url: `/client-portal/${slugB}/events/${eventB.rows[0].id}/verify`,
      headers: { cookie: cookieB }
    });
    if (unonboardedMutateRes.statusCode !== 403) {
      throw new Error(`Expected 403 Forbidden for mutating action before onboarding, got ${unonboardedMutateRes.statusCode}`);
    }
    const mutJson = JSON.parse(unonboardedMutateRes.body);
    if (!mutJson.requiresOnboarding) {
      throw new Error('Expected requiresOnboarding flag in 403 response');
    }
    console.log('✓ PASS: Portal data & mutating API server-side onboarding enforcement working properly');
    passedTests++;

  } finally {
    // Teardown test projects & leads
    console.log('\n--- Cleaning up test records ---');
    try {
      await pool.query(`DELETE FROM client_onboarding_profiles WHERE project_id IN ($1, $2)`, [projectAId, projectBId]);
      await pool.query(`DELETE FROM project_events WHERE project_id IN ($1, $2)`, [projectAId, projectBId]);
      await pool.query(`DELETE FROM projects WHERE id IN ($1, $2) OR slug LIKE 'sec-%' OR slug LIKE 'legacy-%' OR slug LIKE 'matrix-%' OR slug LIKE 'orphan-%'`, [projectAId, projectBId]);
      await pool.query(`DELETE FROM leads WHERE id IN ($1, $2) OR name LIKE 'sec-%'`, [leadAId, leadBId]);
      await pool.query(`DELETE FROM client_portal_verify_attempts WHERE ip = '198.51.100.42' OR slug LIKE 'sec-%'`);
    } catch (cleanErr) {
      console.warn('Cleanup warning:', cleanErr.message);
    }
    await pool.end();
  }

  console.log('\n================================================================');
  console.log(`  RESULTS: ${passedTests} / ${totalTests} SECURITY TESTS PASSED (100%)`);
  console.log('================================================================\n');
}

runSecurityTestSuite().catch((err) => {
  console.error('\n❌ Security test suite failed with error:', err);
  process.exit(1);
});
