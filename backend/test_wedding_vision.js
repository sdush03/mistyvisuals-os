const Fastify = require('fastify');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '.env') });
process.env.NODE_ENV = 'test';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runWeddingVisionTests() {
  console.log('================================================================');
  console.log('--- STARTING WEDDING VISION QUESTIONNAIRE INTEGRATION TESTS ---');
  console.log('================================================================');

  const fastify = Fastify({ logger: false });

  // Register cookie, jwt, multipart
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

  // Register routes
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
  console.log('✓ Fastify app ready with clientPortal & weddingVision routes');

  // Create test lead, project, events, and deliverables
  const testSlug = 'test-vision-' + Date.now();
  const testPasscode = '4321';

  let testProjectId;
  let testEventId;
  let testDeliverableId;
  let clientCookie;
  let adminToken;

  try {
    // 1. Setup Test Project
    const leadRes = await pool.query(
      `INSERT INTO leads (name, source, status, phone_primary, bride_name, groom_name)
       VALUES ($1, 'Website', 'Booked', '+919876543210', 'Tara Sutaria', 'Aadar Jain')
       RETURNING id`,
      [testSlug]
    );
    const leadId = leadRes.rows[0].id;

    const projRes = await pool.query(
      `INSERT INTO projects (lead_id, name, slug, passcode, status)
       VALUES ($1, $2, $3, $4, 'upcoming')
       RETURNING id`,
      [leadId, 'Tara & Aadar Wedding', testSlug, testPasscode]
    );
    testProjectId = projRes.rows[0].id;

    // Create an event
    const eventRes = await pool.query(
      `INSERT INTO project_events (project_id, event_type, event_date, venue)
       VALUES ($1, 'Sangeet Ceremony', '2026-12-15', 'Umaid Bhawan Palace')
       RETURNING id`,
      [testProjectId]
    );
    testEventId = eventRes.rows[0].id;

    // Create a video deliverable
    const delivRes = await pool.query(
      `INSERT INTO project_deliverables (project_id, title, type, quantity, status)
       VALUES ($1, 'Teaser Film', 'video', 1, 'pending')
       RETURNING id`,
      [testProjectId]
    );
    testDeliverableId = delivRes.rows[0].id;

    console.log(`✓ Created test project ${testProjectId} (slug: ${testSlug})`);

    // Generate Client Auth Token & Cookie
    const token = fastify.jwt.sign({
      projectId: testProjectId,
      role: 'client',
      slug: testSlug
    });
    clientCookie = `mv_client_auth=${token}`;

    // Generate Admin Auth Token
    adminToken = fastify.jwt.sign({
      id: 999,
      email: 'admin@mistyvisuals.com',
      role: 'admin'
    });

    // ────────────────────────────────────────────────────────────────
    // TEST 1: Load Initial Questionnaire (Optional, Shared)
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 1: GET /api/client-portal/:slug/questionnaire ---');
    const getRes = await fastify.inject({
      method: 'GET',
      url: `/api/client-portal/${testSlug}/questionnaire`,
      headers: { cookie: clientCookie }
    });
    console.log(`Response status: ${getRes.statusCode}`);
    const getData = JSON.parse(getRes.payload);
    if (getRes.statusCode !== 200 || !getData.questionnaire) {
      throw new Error(`Test 1 Failed: ${getRes.payload}`);
    }
    console.log(`✓ Questionnaire loaded: status=${getData.questionnaire.status}, events=${getData.events.length}, deliverables=${getData.deliverables.length}`);
    if (getData.questionnaire.status !== 'not_started') {
      throw new Error(`Expected not_started, got ${getData.questionnaire.status}`);
    }

    // ────────────────────────────────────────────────────────────────
    // TEST 2: Save Draft (Sections 1 & 2 Answers, Progress to step 3)
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 2: POST /api/client-portal/:slug/questionnaire/draft ---');
    const draftRes = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/draft`,
      headers: { cookie: clientCookie },
      payload: {
        current_step: 3,
        story: {
          how_we_met: 'Met in college during the annual theater festival',
          proposal: 'Sunset proposal in Udaipur'
        },
        traditions: {
          celebrations: ['Haldi', 'Mehendi', 'Sangeet', 'Pheras'],
          importance_notes: 'Pheras at twilight are deeply important to us.'
        }
      }
    });
    console.log(`Response status: ${draftRes.statusCode}`);
    const draftData = JSON.parse(draftRes.payload);
    if (draftRes.statusCode !== 200 || draftData.questionnaire.status !== 'in_progress') {
      throw new Error(`Test 2 Failed: ${draftRes.payload}`);
    }
    console.log(`✓ Draft saved: status=${draftData.questionnaire.status}, has_opened=${draftData.questionnaire.has_opened}, current_step=${draftData.questionnaire.current_step}`);

    // ────────────────────────────────────────────────────────────────
    // TEST 3: Direct-to-R2 Presigned URL Validation (Matrix Check)
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 3: Presigned URL and Video Upload Restrictions ---');
    // A) Video upload in photography references MUST be rejected
    const badVideoRes = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/presigned-url`,
      headers: { cookie: clientCookie },
      payload: {
        section: 'photography',
        filename: 'inspiration.mp4',
        mimeType: 'video/mp4',
        isVideo: true
      }
    });
    if (badVideoRes.statusCode !== 400) {
      throw new Error(`Expected 400 when attempting video in photography, got ${badVideoRes.statusCode}`);
    }
    console.log('✓ Strict rule enforced: Video upload in photography section successfully rejected');

    // B) Video upload in invitations MUST be allowed
    const goodVideoRes = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/presigned-url`,
      headers: { cookie: clientCookie },
      payload: {
        section: 'invitations',
        filename: 'digital_invitation.mp4',
        mimeType: 'video/mp4',
        isVideo: true
      }
    });
    if (goodVideoRes.statusCode !== 200) {
      throw new Error(`Expected 200 when generating URL for invitation video, got ${goodVideoRes.statusCode}: ${goodVideoRes.payload}`);
    }
    const presignedData = JSON.parse(goodVideoRes.payload);
    console.log(`✓ Video in invitations allowed: storageKey=${presignedData.storageKey}`);

    // ────────────────────────────────────────────────────────────────
    // TEST 4: Add Invitations (PDF, Image, and Video)
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 4: POST /api/client-portal/:slug/questionnaire/invitations ---');
    const invRes1 = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/invitations`,
      headers: { cookie: clientCookie },
      payload: {
        file_url: 'https://r2.mistyvisuals.com/invites/card.pdf',
        storage_key: 'portals/test/invitations/card.pdf',
        filename: 'Wedding_Invite_Main.pdf',
        file_type: 'pdf',
        file_size: 1048576
      }
    });
    if (invRes1.statusCode !== 200) throw new Error(`Add invitation failed: ${invRes1.payload}`);

    const invRes2 = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/invitations`,
      headers: { cookie: clientCookie },
      payload: {
        file_url: 'https://r2.mistyvisuals.com/invites/sangeet.mp4',
        storage_key: 'portals/test/invitations/sangeet.mp4',
        filename: 'Sangeet_Video_Invite.mp4',
        file_type: 'video',
        file_size: 5242880
      }
    });
    if (invRes2.statusCode !== 200) throw new Error(`Add video invitation failed: ${invRes2.payload}`);
    console.log('✓ Uploaded invitations successfully recorded (PDF & MP4)');

    // Test Size Limits:
    // Video > 100MB rejection
    const oversizedVideoRes = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/presigned-url`,
      headers: { cookie: clientCookie },
      payload: {
        section: 'invitations',
        filename: 'heavy_video.mp4',
        mimeType: 'video/mp4',
        isVideo: true,
        fileSize: 110 * 1024 * 1024 // 110 MB
      }
    });
    if (oversizedVideoRes.statusCode !== 400) throw new Error(`Expected 400 for 110MB video, got ${oversizedVideoRes.statusCode}`);
    console.log('✓ Video size limit enforced (>100MB rejected)');

    // PDF > 30MB rejection
    const oversizedPdfRes = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/presigned-url`,
      headers: { cookie: clientCookie },
      payload: {
        section: 'invitations',
        filename: 'heavy_doc.pdf',
        mimeType: 'application/pdf',
        fileSize: 35 * 1024 * 1024 // 35 MB
      }
    });
    if (oversizedPdfRes.statusCode !== 400) throw new Error(`Expected 400 for 35MB PDF, got ${oversizedPdfRes.statusCode}`);
    console.log('✓ PDF size limit enforced (>30MB rejected)');

    // Image > 25MB rejection
    const oversizedImgRes = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/presigned-url`,
      headers: { cookie: clientCookie },
      payload: {
        section: 'invitations',
        filename: 'huge_card.png',
        mimeType: 'image/png',
        fileSize: 28 * 1024 * 1024 // 28 MB
      }
    });
    if (oversizedImgRes.statusCode !== 400) throw new Error(`Expected 400 for 28MB image, got ${oversizedImgRes.statusCode}`);
    console.log('✓ Image size limit enforced (>25MB rejected)');

    // Test Quantity Limit: Fill up to 10 invitations and verify 11th is rejected
    for (let i = 3; i <= 10; i++) {
      const fillRes = await fastify.inject({
        method: 'POST',
        url: `/api/client-portal/${testSlug}/questionnaire/invitations`,
        headers: { cookie: clientCookie },
        payload: {
          file_url: `https://r2.mistyvisuals.com/invites/card_${i}.jpg`,
          storage_key: `portals/test/invitations/card_${i}.jpg`,
          filename: `Invite_${i}.jpg`,
          file_type: 'image',
          file_size: 500000
        }
      });
      if (fillRes.statusCode !== 200) throw new Error(`Failed to add invitation #${i}: ${fillRes.payload}`);
    }

    const overflowRes = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/invitations`,
      headers: { cookie: clientCookie },
      payload: {
        file_url: 'https://r2.mistyvisuals.com/invites/card_11.jpg',
        storage_key: 'portals/test/invitations/card_11.jpg',
        filename: 'Invite_11.jpg',
        file_type: 'image',
        file_size: 500000
      }
    });
    if (overflowRes.statusCode !== 400) throw new Error(`Expected 400 for 11th invitation, got ${overflowRes.statusCode}`);
    console.log('✓ Maximum 10 invitations limit successfully enforced (11th rejected)');

    // Clean up extra 8 invitations so subsequent test assertions (e.g. Test 10 expecting 2) pass
    const invList = await fastify.inject({
      method: 'GET',
      url: `/api/client-portal/${testSlug}/questionnaire`,
      headers: { cookie: clientCookie }
    });
    const allInvs = JSON.parse(invList.payload).invitations;
    for (let i = 2; i < allInvs.length; i++) {
      await fastify.inject({
        method: 'DELETE',
        url: `/api/client-portal/${testSlug}/questionnaire/invitations/${allInvs[i].id}`,
        headers: { cookie: clientCookie }
      });
    }

    // ────────────────────────────────────────────────────────────────
    // TEST 5: Event Schedules (Text Flow for Project Event)
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 5: POST /api/client-portal/:slug/questionnaire/schedules ---');
    const schedRes = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/schedules`,
      headers: { cookie: clientCookie },
      payload: {
        project_event_id: testEventId,
        schedule_text: '06:00 PM - Guest Arrivals & Welcome Drinks\n07:30 PM - Family Flashmob\n08:30 PM - Couple Dance'
      }
    });
    if (schedRes.statusCode !== 200) throw new Error(`Update schedule text failed: ${schedRes.payload}`);
    console.log('✓ Project event custom schedule flow saved');

    // ────────────────────────────────────────────────────────────────
    // TEST 6: Family Tree - Group Photo Crop & Multiple Members
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 6: Family Tree Profiles & Crop Metadata ---');
    // Bride's Father
    const f1 = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/family`,
      headers: { cookie: clientCookie },
      payload: {
        side: 'bride',
        name: 'Sunil Sutaria',
        relationship: 'Father',
        category: 'parents',
        priority: 'high',
        photo_url: 'https://r2.mistyvisuals.com/family/crop_sunil.jpg',
        storage_key: 'family/crop_sunil.jpg',
        original_photo_url: 'https://r2.mistyvisuals.com/family/group_orig.jpg',
        original_storage_key: 'family/group_orig.jpg',
        crop_data: { x: 10, y: 15, width: 30, height: 40 }
      }
    });
    if (f1.statusCode !== 200) throw new Error(`Add father failed: ${f1.payload}`);

    // Bride's Mother (uses SAME original group photo with DIFFERENT crop)
    const f2 = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/family`,
      headers: { cookie: clientCookie },
      payload: {
        side: 'bride',
        name: 'Tina Sutaria',
        relationship: 'Mother',
        category: 'parents',
        priority: 'high',
        photo_url: 'https://r2.mistyvisuals.com/family/crop_tina.jpg',
        storage_key: 'family/crop_tina.jpg',
        original_photo_url: 'https://r2.mistyvisuals.com/family/group_orig.jpg',
        original_storage_key: 'family/group_orig.jpg',
        crop_data: { x: 45, y: 15, width: 30, height: 40 }
      }
    });
    if (f2.statusCode !== 200) throw new Error(`Add mother failed: ${f2.payload}`);

    // Groom's Mother (with photo)
    const f3 = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/family`,
      headers: { cookie: clientCookie },
      payload: {
        side: 'groom',
        name: 'Reema Jain',
        relationship: 'Mother',
        category: 'parents',
        priority: 'high',
        photo_url: 'https://r2.mistyvisuals.com/family/crop_reema.jpg',
        storage_key: 'family/crop_reema.jpg'
      }
    });
    if (f3.statusCode !== 200) throw new Error(`Add groom mother failed: ${f3.payload}`);

    console.log('✓ Added Bride Father, Mother (with multiple crop metadata), and Groom Mother');

    // ────────────────────────────────────────────────────────────────
    // TEST 6b: Family Groups & Member Association
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 6b: Family Groups ---');
    const groupRes = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/family-groups`,
      headers: { cookie: clientCookie },
      payload: {
        side: 'groom',
        name: "Ramesh Chacha's Family",
        relationship: 'Chacha & Chachi',
        priority: 'medium'
      }
    });
    if (groupRes.statusCode !== 200) throw new Error(`Create family group failed: ${groupRes.payload}`);
    const groupData = JSON.parse(groupRes.payload);
    const testGroupId = groupData.familyGroup.id;

    // Add Chachi to this group as head/spouse
    const memberInGroup = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/family`,
      headers: { cookie: clientCookie },
      payload: {
        side: 'groom',
        name: 'Sunita Chachi',
        relationship: 'Chachi',
        category: 'extended',
        priority: 'medium',
        family_group_id: testGroupId,
        role_in_family: 'spouse',
        photo_url: 'https://r2.mistyvisuals.com/family/crop_sunita.jpg',
        storage_key: 'family/crop_sunita.jpg'
      }
    });
    if (memberInGroup.statusCode !== 200) throw new Error(`Add member to family group failed: ${memberInGroup.payload}`);

    // Add Cousin to this group as child
    const cousinInGroup = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/family`,
      headers: { cookie: clientCookie },
      payload: {
        side: 'groom',
        name: 'Aman',
        relationship: 'Cousin',
        category: 'extended',
        priority: 'medium',
        family_group_id: testGroupId,
        role_in_family: 'child',
        photo_url: 'https://r2.mistyvisuals.com/family/crop_aman.jpg',
        storage_key: 'family/crop_aman.jpg'
      }
    });
    if (cousinInGroup.statusCode !== 200) throw new Error(`Add cousin to family group failed: ${cousinInGroup.payload}`);
    console.log('✓ Family group created with Chachi (spouse) and Cousin (child) correctly linked');

    // ────────────────────────────────────────────────────────────────
    // TEST 7: Mandatory Parent Validation Gate on Submit
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 7: Verify Mandatory Parent Gate on Submit ---');
    // Attempting submit while Groom Father is missing MUST fail with 400
    const failSubmitRes = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/submit`,
      headers: { cookie: clientCookie }
    });
    if (failSubmitRes.statusCode !== 400) {
      throw new Error(`Expected 400 when missing Groom Father, got ${failSubmitRes.statusCode}: ${failSubmitRes.payload}`);
    }
    const failSubmitData = JSON.parse(failSubmitRes.payload);
    console.log(`✓ Submit correctly blocked by mandatory parent gate: "${failSubmitData.error}"`);
    console.log(`  Missing: ${failSubmitData.missingRequirements?.join('; ')}`);

    // Add Groom's Father marked "Remembering someone" (NO photo required)
    const f4 = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/family`,
      headers: { cookie: clientCookie },
      payload: {
        side: 'groom',
        name: 'Manoj Jain',
        relationship: 'Father',
        category: 'parents',
        priority: 'high',
        is_remembering: true,
        notes: 'Late Manoj Jain. In loving memory.'
      }
    });
    if (f4.statusCode !== 200) throw new Error(`Add remembering father failed: ${f4.payload}`);
    console.log('✓ Added Groom Father marked as remembering someone (no photo needed)');

    // ────────────────────────────────────────────────────────────────
    // TEST 8: Music References mapped to Video Deliverables
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 8: POST /api/client-portal/:slug/questionnaire/music-references ---');
    const musicRes = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/music-references`,
      headers: { cookie: clientCookie },
      payload: {
        url: 'https://open.spotify.com/track/123456789',
        reference_type: 'exact_song',
        deliverable_ids: [testDeliverableId],
        deliverable_names: ['Teaser Film'],
        notes: 'Use this specific acoustic track for our entrance teaser.'
      }
    });
    if (musicRes.statusCode !== 200) throw new Error(`Add music reference failed: ${musicRes.payload}`);
    console.log('✓ Music reference successfully linked to Teaser Film deliverable');

    // ────────────────────────────────────────────────────────────────
    // TEST 9: Submit Questionnaire (Should now succeed)
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 9: Complete and Submit Questionnaire ---');
    const submitRes = await fastify.inject({
      method: 'POST',
      url: `/api/client-portal/${testSlug}/questionnaire/submit`,
      headers: { cookie: clientCookie }
    });
    if (submitRes.statusCode !== 200) {
      throw new Error(`Expected 200 on submit, got ${submitRes.statusCode}: ${submitRes.payload}`);
    }
    const submitData = JSON.parse(submitRes.payload);
    if (submitData.status !== 'completed') {
      throw new Error(`Expected completed status, got ${submitData.status}`);
    }
    console.log('✓ Questionnaire successfully marked as completed!');

    // ────────────────────────────────────────────────────────────────
    // TEST 10: Internal Studio Team Review Endpoint
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test 10: GET /api/projects/:id/wedding-vision (Admin Review) ---');
    const reviewRes = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${testProjectId}/wedding-vision`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    if (reviewRes.statusCode !== 200) {
      throw new Error(`Review endpoint failed with status ${reviewRes.statusCode}: ${reviewRes.payload}`);
    }
    const reviewData = JSON.parse(reviewRes.payload).data;
    if (!reviewData.questionnaire || reviewData.familyMembers.length !== 6 || reviewData.familyGroups.length !== 1) {
      throw new Error(`Invalid review data payload: ${reviewRes.payload}`);
    }
    console.log(`✓ Admin review verified:`);
    console.log(`  - Project: ${reviewData.project.name}`);
    console.log(`  - Status: ${reviewData.questionnaire.status}`);
    console.log(`  - Family members: ${reviewData.familyMembers.length}`);
    console.log(`  - Family groups: ${reviewData.familyGroups.length}`);
    console.log(`  - High priority VIPs: ${reviewData.stats.bride.high_priority + reviewData.stats.groom.high_priority}`);
    console.log(`  - Invitations: ${reviewData.invitations.length}`);
    console.log(`  - Music references: ${reviewData.musicReferences.length}`);

    console.log('\n================================================================');
    console.log('🎉 ALL 10 INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================');

  } finally {
    // Cleanup test data
    if (testProjectId) {
      await pool.query('DELETE FROM projects WHERE id = $1', [testProjectId]).catch(() => {});
    }
    await pool.end();
  }
}

runWeddingVisionTests().catch(err => {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
});
