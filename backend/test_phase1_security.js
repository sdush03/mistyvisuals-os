const Fastify = require('fastify');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '.env') });
process.env.NODE_ENV = 'test';

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/postgres' });

async function runPhase1SecurityTests() {
  console.log('================================================================');
  console.log('--- PHASE 1 CRITICAL SECURITY AUDIT & FIXES TEST SUITE ---');
  console.log('================================================================');

  const fastify = Fastify({
    logger: false,
    trustProxy: ['127.0.0.1', '::1']
  });

  await fastify.register(require('@fastify/cookie'));
  await fastify.register(require('@fastify/jwt'), {
    secret: process.env.JWT_SECRET || 'test-jwt-secret-misty-visuals-12345'
  });
  await fastify.register(require('@fastify/multipart'), {
    limits: { fileSize: 50 * 1024 * 1024 }
  });

  const getAuthFromRequest = (req) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
      return fastify.jwt.verify(authHeader.split(' ')[1]);
    } catch {
      return null;
    }
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
    prefix: '/api',
    pool,
    getAuthFromRequest,
    requireAuth
  });

  await fastify.register(require('./routes/weddingVision'), {
    prefix: '/api',
    pool,
    getAuthFromRequest,
    requireAuth
  });

  await fastify.ready();
  console.log('✓ Fastify test app ready with secure trustProxy & updated routes');

  const timestamp = Date.now();
  const slugA = `sec-proj-a-${timestamp}`;
  const slugB = `sec-proj-b-${timestamp}`;
  const passcodeA = '1111';
  const passcodeB = '2222';

  let projAId, projBId;

  try {
    // Setup Project A
    const leadA = await pool.query(
      `INSERT INTO leads (name, source, status, phone_primary, bride_name, groom_name)
       VALUES ($1, 'Website', 'Booked', '+919876500011', 'Bride A', 'Groom A')
       RETURNING id`,
      [slugA]
    );
    const pA = await pool.query(
      `INSERT INTO projects (lead_id, name, slug, passcode, status)
       VALUES ($1, 'Project A', $2, $3, 'upcoming')
       RETURNING id`,
      [leadA.rows[0].id, slugA, passcodeA]
    );
    projAId = pA.rows[0].id;

    // Setup Project B
    const leadB = await pool.query(
      `INSERT INTO leads (name, source, status, phone_primary, bride_name, groom_name)
       VALUES ($1, 'Website', 'Booked', '+919876500022', 'Bride B', 'Groom B')
       RETURNING id`,
      [slugB]
    );
    const pB = await pool.query(
      `INSERT INTO projects (lead_id, name, slug, passcode, status)
       VALUES ($1, 'Project B', $2, $3, 'upcoming')
       RETURNING id`,
      [leadB.rows[0].id, slugB, passcodeB]
    );
    projBId = pB.rows[0].id;

    const tokenA = fastify.jwt.sign({ projectId: projAId, slug: slugA });
    const cookieA = `mv_client_auth=${tokenA}`;

    const tokenB = fastify.jwt.sign({ projectId: projBId, slug: slugB });
    const cookieB = `mv_client_auth=${tokenB}`;

    console.log(`✓ Created Project A (${projAId}) and Project B (${projBId})`);

    // ────────────────────────────────────────────────────────────────
    // TEST 1: Cross-Project Invitation Deletion & Storage Key Scope IDOR
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 1: Invitation Deletion IDOR & Scope Enforcement ---');

    // 1. Project A adds an invitation with its own valid prefix
    const addInvA = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${slugA}/questionnaire/invitations`,
      headers: { cookie: cookieA },
      payload: {
        file_url: `https://r2.mistyvisuals.com/portals/${projAId}/questionnaire/invitations/invite_a.jpg`,
        storage_key: `portals/${projAId}/questionnaire/invitations/invite_a.jpg`,
        filename: 'invite_a.jpg',
        file_type: 'image',
        file_size: 100000
      }
    });
    if (addInvA.statusCode !== 200) throw new Error(`Failed to add invite A: ${addInvA.payload}`);
    const invAId = JSON.parse(addInvA.payload).invitation.id;
    console.log('✓ Project A successfully added valid invitation');

    // 2. Project A attempts to add an invitation with Project B's storage key scope -> MUST fail with 403
    const maliciousAdd = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${slugA}/questionnaire/invitations`,
      headers: { cookie: cookieA },
      payload: {
        file_url: `https://r2.mistyvisuals.com/portals/${projBId}/questionnaire/invitations/stolen.jpg`,
        storage_key: `portals/${projBId}/questionnaire/invitations/stolen.jpg`,
        filename: 'stolen.jpg',
        file_type: 'image',
        file_size: 100000
      }
    });
    if (maliciousAdd.statusCode !== 403) {
      throw new Error(`Expected 403 when injecting Project B storage key, got ${maliciousAdd.statusCode}: ${maliciousAdd.payload}`);
    }
    console.log('✓ Cross-project storage key injection on invitation creation successfully blocked (403)');

    // 3. Project B attempts to delete Project A's invitation by ID -> MUST fail (404 because query scopes by project_id)
    const crossDelete = await fastify.inject({
      method: 'DELETE',
      url: `/api/client-portal/${slugB}/questionnaire/invitations/${invAId}`,
      headers: { cookie: cookieB }
    });
    if (crossDelete.statusCode !== 404) {
      throw new Error(`Expected 404 when deleting other project's invitation, got ${crossDelete.statusCode}`);
    }
    console.log('✓ Cross-project invitation deletion successfully blocked (IDOR protected)');

    // ────────────────────────────────────────────────────────────────
    // TEST 2: Couple Photo Storage Key Scope Enforcement
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 2: Couple Photo Storage Key Scope Enforcement ---');
    const maliciousPhoto = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${slugA}/questionnaire/couple-photo`,
      headers: { cookie: cookieA },
      payload: {
        role: 'bride',
        name: 'Hacker Bride',
        photo_url: 'https://r2.mistyvisuals.com/private/portals/evil/selfie.jpg',
        storage_key: `private/portals/${projBId}/selfies/hijacked.jpg`
      }
    });
    if (maliciousPhoto.statusCode !== 403) {
      throw new Error(`Expected 403 when submitting foreign storage key in couple-photo, got ${maliciousPhoto.statusCode}: ${maliciousPhoto.payload}`);
    }
    console.log('✓ Cross-project storage key in couple-photo successfully blocked (403)');

    // ────────────────────────────────────────────────────────────────
    // TEST 3: Passcode Lockout IP Spoofing Prevention
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 3: Passcode Lockout & IP Spoofing Prevention ---');
    // Send 5 incorrect passcodes with spoofed X-Forwarded-For headers from the SAME remote IP.
    // Because trustProxy is configured and we use req.ip, spoofing X-Forwarded-For cannot bypass lockout for the client IP.
    for (let i = 1; i <= 5; i++) {
      const wrongVerify = await fastify.inject({
        method: 'POST',
        url: `/api/client-portal/${slugA}/verify`,
        headers: {
          'x-forwarded-for': `192.168.1.${i}` // Attempting IP rotation via header spoofing
        },
        payload: { passcode: '9999' }
      });
      console.log(`  Attempt ${i}: status ${wrongVerify.statusCode}`);
    }

    // 6th attempt from same connection IP must be rate-limited (429) regardless of X-Forwarded-For header rotation
    const rateLimitedVerify = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${slugA}/verify`,
      headers: {
        'x-forwarded-for': '192.168.1.99'
      },
      payload: { passcode: '9999' }
    });
    if (rateLimitedVerify.statusCode !== 429) {
      throw new Error(`Expected 429 Too Many Requests after 5 failed passcode attempts, got ${rateLimitedVerify.statusCode}`);
    }
    console.log('✓ Passcode lockout successfully triggered (429) — X-Forwarded-For spoofing prevented');

    // ────────────────────────────────────────────────────────────────
    // TEST 4: Legitimate Authorized Workflows Remain Fully Functional
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 4: Legitimate Authorized Workflow ---');
    const validVerify = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${slugA}/verify`,
      payload: { passcode: passcodeA }
    });
    if (validVerify.statusCode !== 200) {
      throw new Error(`Valid passcode verification failed: ${validVerify.payload}`);
    }
    console.log('✓ Legitimate passcode verification succeeded with correct passcode');

    // Valid deletion of Project A's own invitation
    const validDelete = await fastify.inject({
      method: 'DELETE',
      url: `/api/client-portal/${slugA}/questionnaire/invitations/${invAId}`,
      headers: { cookie: cookieA }
    });
    if (validDelete.statusCode !== 200) {
      throw new Error(`Legitimate invitation deletion failed: ${validDelete.payload}`);
    }
    console.log('✓ Authorized client successfully deleted their own invitation asset');

    console.log('\n================================================================');
    console.log('🎉 ALL PHASE 1 SECURITY TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');

  } finally {
    if (projAId) await pool.query('DELETE FROM projects WHERE id = $1', [projAId]).catch(() => {});
    if (projBId) await pool.query('DELETE FROM projects WHERE id = $1', [projBId]).catch(() => {});
    await pool.end();
  }
}

runPhase1SecurityTests().catch(err => {
  console.error('\n❌ PHASE 1 SECURITY TEST FAILURE:', err);
  process.exit(1);
});
