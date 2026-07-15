const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { prisma } = require('../../modules/quotation/prisma');
const qdrant = require('../../utils/qdrant');
const faceRecManager = require('../../utils/faceRecManager');
const { guestAnchors, checkGuestSelfie, logTelemetry, createVerifyGuestAuth } = require('./helpers');

module.exports = async function registerClientRoutes(fastify, opts) {
  const { requireAdmin } = opts;
  const verifyGuestAuth = createVerifyGuestAuth(fastify);

  async function verifyFamilyAuth(req, reply) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Missing or invalid token' });
      }
      const token = authHeader.split(' ')[1];
      const decoded = fastify.jwt.verify(token);
      if (decoded.role !== 'family') {
        return reply.code(403).send({ error: 'Access denied' });
      }
      req.family = decoded;
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized session' });
    }
  }

  // Guest upload verification selfie (Option B)
  fastify.post('/api/gallery/public/events/:slug/verify-anchor', { preHandler: verifyGuestAuth }, async (req, reply) => {
    const eventId = req.guest.eventId;
    const guestKey = `${req.guest.email}_${eventId}`;
    
    if (!guestAnchors[guestKey] || !guestAnchors[guestKey].anchorVector) {
      return reply.code(400).send({ error: 'No registered anchor selfie found. Please run a main search first.' });
    }

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No image uploaded' });

    try {
      const buffer = await data.toBuffer();
      const tempSelfiePath = path.join(__dirname, '..', '..', 'db', `temp_verify_${Date.now()}.jpg`);
      fs.writeFileSync(tempSelfiePath, buffer);

      try {
        const anchorVector = guestAnchors[guestKey].anchorVector;
        const res = await faceRecManager.verifyAnchor(tempSelfiePath, anchorVector);

        if (res.verified) {
          guestAnchors[guestKey].extraVectors.push(res.vector);
          
          logTelemetry({
            eventId,
            guestEmail: req.guest.email,
            actionType: 'verify_anchor_success',
            score: res.score
          });

          return { verified: true, score: res.score };
        } else {
          logTelemetry({
            eventId,
            guestEmail: req.guest.email,
            actionType: 'verify_anchor_fail',
            score: res.score,
            error: res.error
          });

          return reply.code(400).send({ error: res.error });
        }
      } finally {
        if (fs.existsSync(tempSelfiePath)) fs.unlinkSync(tempSelfiePath);
      }
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to verify face signature' });
    }
  });

  // Verify OAuth Google token globally for Family Dashboard
  fastify.post('/api/gallery/family/auth', async (req, reply) => {
    const { token, name, email } = req.body;
    if (!token) return reply.code(400).send({ error: 'Google Token is required' });

    try {
      const verifyResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
      if (!verifyResponse.ok) {
        return reply.code(400).send({ error: 'Invalid Google token' });
      }
      const ticket = await verifyResponse.json();
      const verifiedEmail = ticket.email;
      const verifiedName = ticket.name || ticket.given_name;

      const guestProfiles = await prisma.guest.findMany({
        where: { email: verifiedEmail }
      });

      let phone = null;
      let hasSelfie = false;
      let representativeGuest = null;

      for (const g of guestProfiles) {
        if (g.phoneNumber && checkGuestSelfie(g.id)) {
          phone = g.phoneNumber;
          hasSelfie = true;
          representativeGuest = g;
          break;
        }
      }

      const familyToken = fastify.jwt.sign({
        email: verifiedEmail,
        role: 'family',
        name: verifiedName
      }, { expiresIn: '7d' });

      return {
        token: familyToken,
        profile: {
          name: verifiedName,
          email: verifiedEmail,
          phoneNumber: phone,
          hasSelfie,
          selfieGuestId: representativeGuest ? representativeGuest.id : null
        }
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Global authentication failed' });
    }
  });

  // Exchange an existing event guest JWT for a family JWT
  fastify.post('/api/gallery/family/auth-from-event', async (req, reply) => {
    const { eventToken } = req.body;
    if (!eventToken) return reply.code(400).send({ error: 'Event token is required' });

    try {
      let decoded;
      try {
        decoded = fastify.jwt.verify(eventToken);
      } catch (e) {
        return reply.code(401).send({ error: 'Invalid or expired event token' });
      }

      if (decoded.role !== 'guest' || !decoded.email) {
        return reply.code(403).send({ error: 'Invalid token role' });
      }

      const { email, guestId } = decoded;

      const guest = await prisma.guest.findUnique({ where: { id: guestId } });
      if (!guest) return reply.code(404).send({ error: 'Guest not found' });

      const allGuests = await prisma.guest.findMany({ where: { email } });
      let hasSelfie = false;
      let representativeGuestId = null;
      for (const g of allGuests) {
        if (checkGuestSelfie(g.id)) {
          hasSelfie = true;
          representativeGuestId = g.id;
          break;
        }
      }

      const familyToken = fastify.jwt.sign({
        email,
        role: 'family',
        name: guest.name
      }, { expiresIn: '7d' });

      return {
        token: familyToken,
        profile: {
          name: guest.name,
          email,
          phoneNumber: guest.phoneNumber,
          hasSelfie,
          selfieGuestId: representativeGuestId
        }
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Token exchange failed' });
    }
  });

  // Get all events linked to the family guest account
  fastify.get('/api/gallery/family/events', { preHandler: verifyFamilyAuth }, async (req, reply) => {
    const email = req.family.email;

    try {
      const guestProfiles = await prisma.guest.findMany({
        where: { email },
        include: { galleryEvent: true }
      });

      let sourceGuestId = null;
      for (const g of guestProfiles) {
        if (checkGuestSelfie(g.id)) {
          sourceGuestId = g.id;
          break;
        }
      }

      const eventsList = [];
      const selfiesDir = path.join(__dirname, '..', '..', 'uploads', 'photos', 'selfies');
      const selfiePath = sourceGuestId ? path.join(selfiesDir, `guest_${sourceGuestId}.jpg`) : null;
      const vectorPath = sourceGuestId ? path.join(selfiesDir, `guest_${sourceGuestId}.json`) : null;
      let anchorVector = null;

      if (sourceGuestId && fs.existsSync(selfiePath) && fs.existsSync(vectorPath)) {
        try {
          anchorVector = JSON.parse(fs.readFileSync(vectorPath, 'utf8'));
        } catch (e) {
          req.log.error('Failed to parse anchor vector:', e);
        }
      }

      for (const g of guestProfiles) {
        const event = g.galleryEvent;
        if (!event) continue;

        let matchedCount = 0;

        if (anchorVector) {
          const validPhotos = await prisma.photo.findMany({
            where: { eventId: event.id },
            select: { id: true }
          });
          const validPhotoIds = new Set(validPhotos.map(p => p.id));

          let dbVectors = [];
          if (qdrant.isMock) {
            dbVectors = qdrant.mockCache
              .filter(item => item.eventId === event.id && validPhotoIds.has(item.photoId))
              .map(item => ({
                photoId: item.photoId,
                faceId: item.faceId,
                vector: item.vector
              }));
          }

          if (dbVectors.length > 0) {
            try {
              const res = await faceRecManager.matchSelfie(selfiePath, dbVectors, []);
              if (res.matches) {
                matchedCount = res.matches.length;
              }
            } catch (matchErr) {
              req.log.error(`Match execution failed for event ${event.id}:`, matchErr.message);
            }
          }
        }

        const eventToken = fastify.jwt.sign({
          guestId: g.id,
          eventId: event.id,
          email: g.email,
          role: 'guest',
          hasFullAccess: g.hasFullAccess
        }, { expiresIn: '7d' });

        eventsList.push({
          id: event.id,
          title: event.title,
          slug: event.slug,
          date: event.date,
          coverPhotoUrl: event.coverPhotoUrl,
          coverPhotoMobileUrl: event.coverPhotoMobileUrl,
          matchedCount,
          eventToken,
          guestInfo: {
            id: g.id,
            name: g.name,
            email: g.email,
            phoneNumber: g.phoneNumber,
            hasFullAccess: g.hasFullAccess,
            hasSelfie: checkGuestSelfie(g.id)
          }
        });
      }

      let profilePhone = null;
      let profileHasSelfie = false;
      let representativeGuest = null;

      for (const g of guestProfiles) {
        if (g.phoneNumber && checkGuestSelfie(g.id)) {
          profilePhone = g.phoneNumber;
          profileHasSelfie = true;
          representativeGuest = g;
          break;
        }
      }
      if (!representativeGuest && guestProfiles.length > 0) {
        representativeGuest = guestProfiles[0];
        profilePhone = representativeGuest.phoneNumber;
        profileHasSelfie = checkGuestSelfie(representativeGuest.id);
      }

      return {
        events: eventsList,
        selfieUrl: sourceGuestId ? `/api/gallery/family/selfie/${sourceGuestId}` : null,
        profile: representativeGuest ? {
          name: representativeGuest.name,
          email,
          phoneNumber: profilePhone,
          hasSelfie: profileHasSelfie,
          selfieGuestId: representativeGuest.id
        } : null
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch family events' });
    }
  });

  async function updateGuestProfileGlobal(email, name, phoneNumber, selfieBuffer, log) {
    const guestProfiles = await prisma.guest.findMany({
      where: { email }
    });

    if (guestProfiles.length === 0) {
      throw new Error('No guest profile found with this email');
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;

    if (Object.keys(updateData).length > 0) {
      await prisma.guest.updateMany({
        where: { email },
        data: updateData
      });
    }

    let hasSelfie = false;
    let representativeGuestId = null;

    if (selfieBuffer) {
      const selfiesDir = path.join(__dirname, '..', '..', 'uploads', 'photos', 'selfies');
      fs.mkdirSync(selfiesDir, { recursive: true });

      const tempPath = path.join(selfiesDir, `temp_profile_verify_${Date.now()}.jpg`);
      fs.writeFileSync(tempPath, selfieBuffer);

      try {
        const res = await faceRecManager.validateSelfie(tempPath);

        if (res.success && res.vector) {
          for (const g of guestProfiles) {
            const selfiePath = path.join(selfiesDir, `guest_${g.id}.jpg`);
            const vectorPath = path.join(selfiesDir, `guest_${g.id}.json`);

            fs.writeFileSync(selfiePath, selfieBuffer);
            fs.writeFileSync(vectorPath, JSON.stringify(res.vector), 'utf8');

            const guestKey = `${email}_${g.eventId}`;
            guestAnchors[guestKey] = {
              anchorVector: res.vector,
              extraVectors: []
            };

            await prisma.galleryEvent.update({
              where: { id: g.eventId },
              data: { clustersDirty: true }
            }).catch(() => {});
          }

          hasSelfie = true;
          representativeGuestId = guestProfiles[0].id;
        } else {
          throw new Error(res.error || 'Failed to validate face on selfie');
        }
      } catch (err) {
        log.error('Face validation failed: ' + err.message);
        throw new Error(err.message || 'Failed to run facial verification');
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    } else {
      for (const g of guestProfiles) {
        if (checkGuestSelfie(g.id)) {
          hasSelfie = true;
          representativeGuestId = g.id;
          break;
        }
      }
    }

    const updatedGuest = await prisma.guest.findFirst({
      where: { email }
    });

    return {
      name: updatedGuest.name,
      email,
      phoneNumber: updatedGuest.phoneNumber,
      hasSelfie,
      selfieGuestId: representativeGuestId
    };
  }

  async function parseProfileUpdateParams(req) {
    let name = undefined;
    let phoneNumber = undefined;
    let selfieBuffer = null;

    if (req.isMultipart()) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.file) {
          selfieBuffer = await part.toBuffer();
        } else {
          if (part.fieldname === 'name') name = part.value;
          if (part.fieldname === 'phoneNumber') phoneNumber = part.value;
        }
      }
    } else {
      name = req.body?.name;
      phoneNumber = req.body?.phoneNumber;
    }

    return { name, phoneNumber, selfieBuffer };
  }

  // Update profile from Circle dashboard
  fastify.post('/api/gallery/family/profile/update', { preHandler: verifyFamilyAuth }, async (req, reply) => {
    try {
      const { name, phoneNumber, selfieBuffer } = await parseProfileUpdateParams(req);
      const profile = await updateGuestProfileGlobal(req.family.email, name, phoneNumber, selfieBuffer, req.log);
      return { success: true, profile };
    } catch (err) {
      req.log.error(err);
      return reply.code(400).send({ error: err.message || 'Failed to update profile' });
    }
  });

  // Update profile from public gallery event page
  fastify.post('/api/gallery/public/events/:slug/profile/update', { preHandler: verifyGuestAuth }, async (req, reply) => {
    try {
      const { name, phoneNumber, selfieBuffer } = await parseProfileUpdateParams(req);
      const profile = await updateGuestProfileGlobal(req.guest.email, name, phoneNumber, selfieBuffer, req.log);
      return { success: true, profile };
    } catch (err) {
      req.log.error(err);
      return reply.code(400).send({ error: err.message || 'Failed to update profile' });
    }
  });

  // Get current guest profile details
  fastify.get('/api/gallery/public/events/:slug/profile', { preHandler: verifyGuestAuth }, async (req, reply) => {
    try {
      if (req.guest?.isAdminPreview || !req.guest?.guestId) {
        return {
          profile: {
            id: 0,
            name: 'Admin Preview',
            email: 'admin@preview.local',
            phoneNumber: '+910000000000',
            hasFullAccess: true,
            hasSelfie: false,
            selfieGuestId: null
          }
        };
      }

      const guest = await prisma.guest.findUnique({
        where: { id: req.guest.guestId }
      });
      if (!guest) return reply.code(404).send({ error: 'Guest not found' });

      const guestProfiles = await prisma.guest.findMany({
        where: { email: guest.email }
      });

      let hasSelfie = false;
      let selfieGuestId = null;

      for (const g of guestProfiles) {
        if (checkGuestSelfie(g.id)) {
          hasSelfie = true;
          selfieGuestId = g.id;
          break;
        }
      }

      return {
        profile: {
          id: guest.id,
          name: guest.name,
          email: guest.email,
          phoneNumber: guest.phoneNumber,
          hasFullAccess: guest.hasFullAccess,
          hasSelfie,
          selfieGuestId
        }
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch guest profile' });
    }
  });

  // Get guest selfie file
  fastify.get('/api/gallery/family/selfie/:guestId', async (req, reply) => {
    const guestId = parseInt(req.params.guestId);
    if (isNaN(guestId)) return reply.code(400).send({ error: 'Invalid guest ID' });

    let authedEmail = null;
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      let signatureVerified = false;
      try {
        const parts = token.split('.');
        if (parts.length === 2) {
          const payloadStr = Buffer.from(parts[0], 'base64url').toString('utf8');
          const signature = parts[1];
          const sharedSecret = crypto.createHash('sha256').update(process.env.DATABASE_URL || 'fallback-secret-key').digest('hex');
          const expectedSig = crypto.createHmac('sha256', sharedSecret).update(payloadStr).digest('hex');
          if (signature === expectedSig) {
            const payload = JSON.parse(payloadStr);
            if (Date.now() - payload.timestamp < 300000 && payload.guestId === guestId) {
              isAdmin = true;
              signatureVerified = true;
            }
          }
        }
      } catch (err) {
        req.log.warn(`HMAC validation error: ${err.message}`);
      }

      if (!signatureVerified) {
        try {
          const decoded = fastify.jwt.verify(token);
          if (decoded.isAdminPreview || decoded.role === 'admin' || (decoded.roles && decoded.roles.includes('admin')) || decoded.systemProxy) {
            isAdmin = true;
          } else if (decoded.role === 'guest' && decoded.email) {
            authedEmail = decoded.email;
          } else if (decoded.role === 'family' && decoded.email) {
            authedEmail = decoded.email;
          } else {
            return reply.code(403).send({ error: 'Access denied' });
          }
        } catch (err) {
          return reply.code(401).send({ error: 'Invalid or expired token' });
        }
      }
    } else {
      const adminAuth = requireAdmin(req, reply);
      if (!adminAuth) return;
      isAdmin = true;
    }

    if (!isAdmin) {
      const targetGuest = await prisma.guest.findUnique({ where: { id: guestId } });
      if (!targetGuest) {
        return reply.code(404).send({ error: 'Guest not found' });
      }
      if (targetGuest.email?.toLowerCase().trim() !== authedEmail?.toLowerCase().trim()) {
        return reply.code(403).send({ error: 'You can only view your own selfie' });
      }
    }

    const selfiePath = path.join(__dirname, '..', '..', 'uploads', 'photos', 'selfies', `guest_${guestId}.jpg`);
    if (fs.existsSync(selfiePath)) {
      reply.type('image/jpeg');
      return reply.send(fs.createReadStream(selfiePath));
    }

    // Try to resolve the user's selfie locally since they share the same uploads folder
    try {
      const dbGuest = await prisma.guest.findUnique({ where: { id: guestId } });
      if (dbGuest && dbGuest.email) {
        const linkedUsers = await prisma.$queryRawUnsafe('SELECT id FROM circle_users WHERE email = $1 LIMIT 1', dbGuest.email);
        if (linkedUsers && linkedUsers.length > 0) {
          const userId = linkedUsers[0].id;
          const userSelfiePath = path.join(__dirname, '..', '..', 'uploads', 'photos', 'selfies', `user_${userId}.jpg`);
          if (fs.existsSync(userSelfiePath)) {
            reply.type('image/jpeg');
            return reply.send(fs.createReadStream(userSelfiePath));
          }
        }
      }
    } catch (dbErr) {
      req.log.warn(`Failed to resolve user selfie locally: ${dbErr.message}`);
    }

    // Proxy request to mycircle if file doesn't exist locally
    try {
      const sharedSecret = crypto.createHash('sha256').update(process.env.DATABASE_URL || 'fallback-secret-key').digest('hex');
      const payload = JSON.stringify({ guestId, timestamp: Date.now() });
      const signature = crypto.createHmac('sha256', sharedSecret).update(payload).digest('hex');
      const systemToken = Buffer.from(payload).toString('base64url') + '.' + signature;

      const targetUrl = `https://mycircle.mistyvisuals.com/api/gallery/family/selfie/${guestId}`;
      const response = await fetch(targetUrl, {
        headers: { Authorization: `Bearer ${systemToken}` },
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        reply.type('image/jpeg');
        return reply.send(Buffer.from(buffer));
      } else {
        const errText = await response.text().catch(() => '');
        req.log.error(`Proxy selfie returned status ${response.status}: ${errText}`);
      }
    } catch (proxyErr) {
      req.log.error(`Proxy selfie failed: ${proxyErr.message}`);
    }

    return reply.code(404).send({ error: 'Selfie not found' });
  });
};
