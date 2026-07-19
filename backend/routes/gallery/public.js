const fs = require('fs');
const path = require('path');
const { prisma } = require('../../modules/quotation/prisma');
const qdrant = require('../../utils/qdrant');
const faceRecManager = require('../../utils/faceRecManager');
const { guestAnchors, checkGuestSelfie, logTelemetry, createVerifyGuestAuth } = require('./helpers');

module.exports = async function registerPublicRoutes(fastify, opts) {
  const { pool, requireAdmin, getAuthFromRequest } = opts;
  const verifyGuestAuth = createVerifyGuestAuth(fastify);

  // Validate face on an uploaded image without saving or changing anything
  fastify.post('/api/gallery/public/validate-face', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No image uploaded' });
    
    let tempPath = null;
    try {
      const buffer = await data.toBuffer();
      const tempDir = path.join(__dirname, '..', '..', 'uploads', 'temp');
      fs.mkdirSync(tempDir, { recursive: true });
      tempPath = path.join(tempDir, `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`);
      fs.writeFileSync(tempPath, buffer);
      
      const res = await faceRecManager.validateSelfie(tempPath);
      
      if (res.success && res.vector) {
        return { success: true };
      } else {
        return reply.code(400).send({ error: res.error || 'Failed to validate face on selfie' });
      }
    } catch (err) {
      req.log.error('Face validation failed: ' + err.message);
      return reply.code(400).send({ error: err.message || 'Failed to run facial verification' });
    } finally {
      if (tempPath && fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  });

  // Load public details of the event
  fastify.get('/api/gallery/public/events/:slug', async (req, reply) => {
    const slug = req.params.slug.toLowerCase().trim();
    try {
      const event = await prisma.galleryEvent.findUnique({
        where: { slug },
        select: {
          id: true,
          title: true,
          date: true,
          coverPhotoUrl: true,
          coverPhotoMobileUrl: true,
          coverPhotoSquareUrl: true,
          active: true,
          tabs: true,
          updatedAt: true
        }
      });

      if (!event || !event.active) {
        return reply.code(404).send({ error: 'Gallery not found or inactive' });
      }

      const activePhotoTabs = await prisma.photo.groupBy({
        by: ['tabName'],
        where: { 
          eventId: event.id, 
          tabName: { not: null } 
        },
      });
      const activeTabNames = activePhotoTabs.map(t => t.tabName);
      
      const allActiveTabs = [...new Set([...(event.tabs || []), ...activeTabNames])];
      event.tabs = allActiveTabs.filter(tab => activeTabNames.includes(tab) || tab === 'Highlights');

      return event;
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Server error retrieving event details' });
    }
  });

  // Load photos of the event (requires guest auth OR admin auth)
  fastify.get('/api/gallery/public/events/:slug/photos', async (req, reply) => {
    const slug = req.params.slug.toLowerCase().trim();
    try {
      const event = await prisma.galleryEvent.findUnique({ where: { slug } });
      if (!event || !event.active) {
        return reply.code(404).send({ error: 'Gallery not found' });
      }

      let guestId = null;
      let hasFullAccess = false;
      const authHeader = req.headers.authorization;
      let tokenProcessed = false;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const rawToken = authHeader.split(' ')[1];
        try {
          const decoded = fastify.jwt.verify(rawToken);
          tokenProcessed = true;

          if (decoded.role === 'guest' && (decoded.eventId === event.id || decoded.slug === event.slug)) {
            guestId = decoded.guestId;
            const dbGuest = await prisma.guest.findUnique({
              where: { id: guestId }
            });
            if (!dbGuest) {
              return reply.code(403).send({ error: 'Access denied: Participant removed from gallery' });
            }
            if (dbGuest.isBlocked) {
              return reply.code(403).send({ error: 'Access denied: Participant is blocked' });
            }
            hasFullAccess = dbGuest.hasFullAccess;
            if (guestId) {
               prisma.guest.update({
                 where: { id: guestId },
                 data: { impressions: { increment: 1 } }
               }).catch(err => req.log.error(`[impressions] Failed to increment on photos view: ${err.message}`));
            }
          } else if (decoded.role === 'admin' || (decoded.roles && decoded.roles.includes('admin')) || decoded.isAdminPreview || decoded.hasFullAccess || decoded.sub || decoded.email) {
            hasFullAccess = true;
          } else {
            return reply.code(403).send({ error: 'Token does not match this event' });
          }
        } catch (jwtErr) {
          // JWT verification failed (e.g. signed by different server's secret).
          // Try to decode payload without verification to detect admin-preview tokens.
          try {
            const parts = rawToken.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
              if (payload.isAdminPreview || payload.role === 'admin' || (payload.roles && payload.roles.includes('admin'))) {
                // Cross-server admin preview — grant full access
                hasFullAccess = true;
                tokenProcessed = true;
              }
            }
          } catch (_) {
            // Ignore decode errors — fall through to cookie auth or public access
          }
          if (!tokenProcessed) {
            tokenProcessed = true;
          }
        }
      }

      if (!tokenProcessed) {
        // Try cookie-based admin auth silently
        const auth = getAuthFromRequest(req);
        if (auth) {
          const roles = Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : [];
          if (roles.includes('admin')) {
            hasFullAccess = true;
          }
        }
      }

      const offset = Math.max(0, parseInt(req.query.offset) || 0);
      const limit  = Math.min(50000, Math.max(1, parseInt(req.query.limit) || 30));
      const tabFilter = (req.query.tab || '').trim();

      const whereClause = { eventId: event.id };
      if (!hasFullAccess) {
        whereClause.tabName = 'Highlights';
      } else if (tabFilter && tabFilter !== 'ALL') {
        whereClause.tabName = tabFilter;
      }

      const selectClause = {
        id: true,
        r2Url: true,
        thumbnailUrl: true,
        filename: true,
        originalFileSize: true,
        tabName: true,
        capturedAt: true,
        width: true,
        height: true,
        _count: {
          select: {
            likes: true
          }
        }
      };

      if (guestId) {
        selectClause.likes = {
          where: { guestId },
          select: { id: true }
        };
      }

      const [total, photos] = await Promise.all([
        prisma.photo.count({ where: whereClause }),
        prisma.photo.findMany({
          where: whereClause,
          select: selectClause,
          orderBy: [
            { capturedAt: 'asc' },
            { id: 'asc' }
          ],
          skip: offset,
          take: limit
        })
      ]);

      const mappedPhotos = photos.map(p => ({
        id: p.id,
        r2Url: p.r2Url,
        thumbnailUrl: p.thumbnailUrl || null,
        filename: p.filename,
        originalSize: p.originalFileSize,
        tabName: p.tabName,
        capturedAt: p.capturedAt,
        likeCount: p._count?.likes || 0,
        isLiked: guestId ? (p.likes && p.likes.length > 0) : false
      }));

      return {
        photos: mappedPhotos,
        total,
        hasMore: offset + photos.length < total
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve gallery photos' });
    }
  });

  // Toggle like status for a photo
  fastify.post('/api/gallery/public/events/:slug/photos/:photoId/like', { preHandler: verifyGuestAuth }, async (req, reply) => {
    const slug = req.params.slug.toLowerCase().trim();
    const photoId = Number(req.params.photoId);
    const guestId = req.guest.guestId;

    if (isNaN(photoId)) {
      return reply.code(400).send({ error: 'Invalid photo ID' });
    }

    try {
      const photo = await prisma.photo.findUnique({
        where: { id: photoId },
        include: { galleryEvent: true }
      });

      if (!photo || photo.galleryEvent.slug.toLowerCase().trim() !== slug) {
        return reply.code(404).send({ error: 'Photo not found in this gallery' });
      }

      const existingLike = await prisma.photoLike.findUnique({
        where: {
          photoId_guestId: {
            photoId,
            guestId
          }
        }
      });

      let liked = false;
      if (existingLike) {
        await prisma.photoLike.delete({
          where: { id: existingLike.id }
        });
        liked = false;
      } else {
        await prisma.photoLike.create({
          data: {
            photoId,
            guestId
          }
        });
        liked = true;
      }

      const likeCount = await prisma.photoLike.count({
        where: { photoId }
      });

      return { liked, likeCount };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to toggle photo like' });
    }
  });

  // Verify OAuth tokens (Google/Apple) and register guest
  fastify.post('/api/gallery/public/events/:slug/auth', async (req, reply) => {
    const slug = req.params.slug.toLowerCase().trim();
    const { provider, token, name, email, code } = req.body;

    if (!provider || !token) {
      return reply.code(400).send({ error: 'Provider and token are required' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({ where: { slug } });
      if (!event) return reply.code(404).send({ error: 'Event not found' });

      let verifiedEmail = null;
      let verifiedName = null;
      let providerId = null;

      if (provider === 'google') {
        const verifyResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
        if (!verifyResponse.ok) {
          return reply.code(400).send({ error: 'Invalid Google token' });
        }
        const ticket = await verifyResponse.json();
        verifiedEmail = ticket.email;
        verifiedName = ticket.name || ticket.given_name;
        providerId = ticket.sub;
      } else if (provider === 'apple') {
        verifiedEmail = email;
        verifiedName = name;
        providerId = token;
        if (!verifiedEmail) {
          return reply.code(400).send({ error: 'Apple Auth requires email for first-time login' });
        }
      } else {
        return reply.code(400).send({ error: 'Unsupported authentication provider' });
      }

      const dbPasscode = event.fullCode;
      const dbPartialPasscode = event.partialCode;

      let isCodeValid = false;
      
      if (dbPasscode || dbPartialPasscode) {
        if (!code) {
          return reply.code(400).send({ error: 'Passcode is required to access this gallery' });
        }
        
        const cleanCode = code.trim().toUpperCase();
        const cleanFull = dbPasscode ? dbPasscode.trim().toUpperCase() : null;
        const cleanPartial = dbPartialPasscode ? dbPartialPasscode.trim().toUpperCase() : null;

        if (cleanFull && cleanCode === cleanFull) {
          isCodeValid = true;
        } else if (cleanPartial && cleanCode === cleanPartial) {
          isCodeValid = false;
        } else {
          return reply.code(400).send({ error: 'Invalid passcode' });
        }
      }

      let guest = await prisma.guest.findFirst({
        where: { eventId: event.id, email: verifiedEmail }
      });

      if (guest && guest.isBlocked) {
        return reply.code(403).send({ error: 'Access denied: You have been blocked from this gallery' });
      }

      if (!guest) {
        guest = await prisma.guest.create({
          data: {
            eventId: event.id,
            email: verifiedEmail,
            name: verifiedName,
            provider,
            providerId,
            hasFullAccess: isCodeValid
          }
        });
      } else {
        if (isCodeValid && !guest.hasFullAccess) {
          guest = await prisma.guest.update({
            where: { id: guest.id },
            data: { hasFullAccess: true }
          });
        }
      }

      let hasSelfie = checkGuestSelfie(guest.id);
      if (!guest.phoneNumber || !hasSelfie) {
        const otherGuests = await prisma.guest.findMany({
          where: { email: verifiedEmail }
        });
        let sourceGuest = null;
        for (const g of otherGuests) {
          if (g.id !== guest.id && g.phoneNumber && checkGuestSelfie(g.id)) {
            sourceGuest = g;
            break;
          }
        }
        if (sourceGuest) {
          if (!guest.phoneNumber) {
            guest = await prisma.guest.update({
              where: { id: guest.id },
              data: { phoneNumber: sourceGuest.phoneNumber }
            });
          }
          if (!hasSelfie) {
            const selfiesDir = path.join(__dirname, '..', '..', 'uploads', 'photos', 'selfies');
            const srcSelfie = path.join(selfiesDir, `guest_${sourceGuest.id}.jpg`);
            const srcVector = path.join(selfiesDir, `guest_${sourceGuest.id}.json`);
            const destSelfie = path.join(selfiesDir, `guest_${guest.id}.jpg`);
            const destVector = path.join(selfiesDir, `guest_${guest.id}.json`);
            try {
              if (fs.existsSync(srcSelfie) && fs.existsSync(srcVector)) {
                fs.mkdirSync(selfiesDir, { recursive: true });
                fs.copyFileSync(srcSelfie, destSelfie);
                fs.copyFileSync(srcVector, destVector);
                hasSelfie = true;
                
                const guestKey = `${guest.email}_${event.id}`;
                const vectorContent = fs.readFileSync(destVector, 'utf8');
                guestAnchors[guestKey] = {
                  anchorVector: JSON.parse(vectorContent),
                  extraVectors: []
                };
              }
            } catch (copyErr) {
              req.log.error(copyErr, 'Failed to copy guest selfie from other event');
            }
          }
        }
      }

      const sessionToken = fastify.jwt.sign({
        guestId: guest.id,
        eventId: event.id,
        email: guest.email,
        role: 'guest',
        hasFullAccess: guest.hasFullAccess
      }, { expiresIn: '7d' });

      return {
        token: sessionToken,
        guest: {
          id: guest.id,
          name: guest.name,
          email: guest.email,
          phoneNumber: guest.phoneNumber,
          hasFullAccess: guest.hasFullAccess,
          hasSelfie
        }
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Authentication failed' });
    }
  });

  // Exchange a global Circle session token for a wedding-specific guest session token
  fastify.post('/api/gallery/public/events/:slug/auth-from-family', async (req, reply) => {
    const slug = req.params.slug.toLowerCase().trim();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(400).send({ error: 'Circle Authorization token is required' });
    }

    const circleToken = authHeader.split(' ')[1];
    const { code } = req.body || {};

    try {
      let decoded;
      try {
        decoded = fastify.jwt.verify(circleToken);
      } catch (jwtErr) {
        return reply.code(401).send({ error: 'Invalid or expired Circle session' });
      }

      if (decoded.role !== 'family' || !decoded.email) {
        return reply.code(403).send({ error: 'Access denied: Invalid session role' });
      }

      const event = await prisma.galleryEvent.findUnique({ where: { slug } });
      if (!event) return reply.code(404).send({ error: 'Event not found' });

      const dbPasscode = event.fullCode;
      const dbPartialPasscode = event.partialCode;

      let isCodeValid = false;
      if (dbPasscode || dbPartialPasscode) {
        if (!code) {
          return reply.code(400).send({ error: 'Passcode is required to access this gallery' });
        }
        const cleanCode = code.trim().toUpperCase();
        const cleanFull = dbPasscode ? dbPasscode.trim().toUpperCase() : null;
        const cleanPartial = dbPartialPasscode ? dbPartialPasscode.trim().toUpperCase() : null;

        if (cleanFull && cleanCode === cleanFull) {
          isCodeValid = true;
        } else if (cleanPartial && cleanCode === cleanPartial) {
          isCodeValid = false;
        } else {
          return reply.code(400).send({ error: 'Invalid passcode' });
        }
      }

      let guest = await prisma.guest.findFirst({
        where: { eventId: event.id, email: decoded.email }
      });

      if (guest && guest.isBlocked) {
        return reply.code(403).send({ error: 'Access denied: You have been blocked from this gallery' });
      }

      if (!guest) {
        guest = await prisma.guest.create({
          data: {
            eventId: event.id,
            email: decoded.email,
            name: decoded.name || '',
            provider: 'google',
            providerId: 'circle_sync_' + decoded.email,
            hasFullAccess: isCodeValid
          }
        });
      } else {
        if (isCodeValid && !guest.hasFullAccess) {
          guest = await prisma.guest.update({
            where: { id: guest.id },
            data: { hasFullAccess: true }
          });
        }
      }

      let hasSelfie = checkGuestSelfie(guest.id);
      if (!guest.phoneNumber || !hasSelfie) {
        const otherGuests = await prisma.guest.findMany({
          where: { email: decoded.email }
        });
        let sourceGuest = null;
        for (const g of otherGuests) {
          if (g.id !== guest.id && g.phoneNumber && checkGuestSelfie(g.id)) {
            sourceGuest = g;
            break;
          }
        }
        if (sourceGuest) {
          if (!guest.phoneNumber) {
            guest = await prisma.guest.update({
              where: { id: guest.id },
              data: { phoneNumber: sourceGuest.phoneNumber }
            });
          }
          if (!hasSelfie) {
            const selfiesDir = path.join(__dirname, '..', '..', 'uploads', 'photos', 'selfies');
            const srcSelfie = path.join(selfiesDir, `guest_${sourceGuest.id}.jpg`);
            const srcVector = path.join(selfiesDir, `guest_${sourceGuest.id}.json`);
            const destSelfie = path.join(selfiesDir, `guest_${guest.id}.jpg`);
            const destVector = path.join(selfiesDir, `guest_${guest.id}.json`);
            try {
              if (fs.existsSync(srcSelfie) && fs.existsSync(srcVector)) {
                fs.mkdirSync(selfiesDir, { recursive: true });
                fs.copyFileSync(srcSelfie, destSelfie);
                fs.copyFileSync(srcVector, destVector);
                hasSelfie = true;
                
                const guestKey = `${guest.email}_${event.id}`;
                const vectorContent = fs.readFileSync(destVector, 'utf8');
                guestAnchors[guestKey] = {
                  anchorVector: JSON.parse(vectorContent),
                  extraVectors: []
                };
              }
            } catch (copyErr) {
              req.log.error(copyErr, 'Failed to copy guest selfie from other event in family SSO');
            }
          }
        }
      }

      const sessionToken = fastify.jwt.sign({
        guestId: guest.id,
        eventId: event.id,
        email: guest.email,
        role: 'guest',
        hasFullAccess: guest.hasFullAccess
      }, { expiresIn: '7d' });

      return {
        token: sessionToken,
        guest: {
          id: guest.id,
          name: guest.name,
          email: guest.email,
          phoneNumber: guest.phoneNumber,
          hasFullAccess: guest.hasFullAccess,
          hasSelfie
        }
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'SSO Authentication failed' });
    }
  });

  // Upgrade guest session to Full Access
  fastify.post('/api/gallery/public/events/:slug/upgrade', { preHandler: verifyGuestAuth }, async (req, reply) => {
    const slug = req.params.slug.toLowerCase().trim();
    const { code } = req.body;

    if (!code) {
      return reply.code(400).send({ error: 'Passcode is required' });
    }

    try {
      const event = req.event || await prisma.galleryEvent.findUnique({ where: { slug } });
      if (!event) return reply.code(404).send({ error: 'Event not found' });

      const isCodeValid = event.fullCode && code.trim().toUpperCase() === event.fullCode.trim().toUpperCase();

      if (!isCodeValid) {
        return reply.code(400).send({ error: 'Invalid passcode' });
      }

      const guestId = req.guest.guestId;
      const updatedGuest = await prisma.guest.update({
        where: { id: guestId },
        data: { hasFullAccess: true }
      });

      const sessionToken = fastify.jwt.sign({
        guestId: updatedGuest.id,
        eventId: event.id,
        email: updatedGuest.email,
        role: 'guest',
        hasFullAccess: true
      }, { expiresIn: '7d' });

      return {
        success: true,
        token: sessionToken,
        guest: {
          id: updatedGuest.id,
          name: updatedGuest.name,
          email: updatedGuest.email,
          phoneNumber: updatedGuest.phoneNumber,
          hasFullAccess: true,
          hasSelfie: checkGuestSelfie(updatedGuest.id)
        }
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to upgrade access level' });
    }
  });

  // Store/update guest phone number
  fastify.post('/api/gallery/public/events/:slug/phone', { preHandler: verifyGuestAuth }, async (req, reply) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return reply.code(400).send({ error: 'Phone number is required' });

    try {
      await prisma.guest.update({
        where: { id: req.guest.guestId },
        data: { phoneNumber }
      });
      return { status: 'success' };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to update phone number' });
    }
  });

  // Guest upload and save verification selfie
  fastify.post('/api/gallery/public/events/:slug/selfie', { preHandler: verifyGuestAuth }, async (req, reply) => {
    const eventId = req.guest.eventId;
    const guestKey = `${req.guest.email}_${eventId}`;
    const guestId = req.guest.guestId;

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No image uploaded' });

    try {
      const buffer = await data.toBuffer();
      
      const selfiesDir = path.join(__dirname, '..', '..', 'uploads', 'photos', 'selfies');
      fs.mkdirSync(selfiesDir, { recursive: true });

      const selfiePath = path.join(selfiesDir, `guest_${guestId}.jpg`);
      const vectorPath = path.join(selfiesDir, `guest_${guestId}.json`);

      fs.writeFileSync(selfiePath, buffer);

      try {
        const res = await faceRecManager.validateSelfie(selfiePath);

        if (res.success && res.vector) {
          fs.writeFileSync(vectorPath, JSON.stringify(res.vector), 'utf8');

          guestAnchors[guestKey] = {
            anchorVector: res.vector,
            extraVectors: []
          };

          return { status: 'success' };
        } else {
          if (fs.existsSync(selfiePath)) fs.unlinkSync(selfiePath);
          return reply.code(400).send({ error: res.error || 'Failed to validate face on selfie' });
        }
      } catch (extractErr) {
        req.log.error('Face validation script execution failed:', extractErr.message);
        if (fs.existsSync(selfiePath)) fs.unlinkSync(selfiePath);
        return reply.code(500).send({ error: 'Failed to run facial verification' });
      }
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to upload selfie' });
    }
  });

  // Get matched photos of the guest
  fastify.get('/api/gallery/public/events/:slug/matched-photos', { preHandler: verifyGuestAuth }, async (req, reply) => {
    const eventId = req.guest.eventId;
    const guestKey = `${req.guest.email}_${eventId}`;
    const guestId = req.guest.guestId;

    try {
      if (guestId) {
        prisma.guest.update({
          where: { id: guestId },
          data: { impressions: { increment: 1 } }
        }).catch(err => req.log.error(`[impressions] Failed to increment on matches view: ${err.message}`));
      }
      const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
      if (!event) return reply.code(404).send({ error: 'Event not found' });

      const selfiePath = path.join(__dirname, '..', '..', 'uploads', 'photos', 'selfies', `guest_${guestId}.jpg`);
      const vectorPath = path.join(__dirname, '..', '..', 'uploads', 'photos', 'selfies', `guest_${guestId}.json`);

      if (!fs.existsSync(selfiePath)) {
        return { photos: [] };
      }

      if (!guestAnchors[guestKey] || !guestAnchors[guestKey].anchorVector) {
        if (fs.existsSync(vectorPath)) {
          const vector = JSON.parse(fs.readFileSync(vectorPath, 'utf8'));
          guestAnchors[guestKey] = {
            anchorVector: vector,
            extraVectors: []
          };
        } else {
          try {
            const res = await faceRecManager.validateSelfie(selfiePath);
            if (res.success && res.vector) {
              fs.writeFileSync(vectorPath, JSON.stringify(res.vector), 'utf8');
              guestAnchors[guestKey] = {
                anchorVector: res.vector,
                extraVectors: []
              };
            } else {
              return reply.code(400).send({ error: 'Face could not be parsed from saved selfie' });
            }
          } catch (extractErr) {
            req.log.error('Fallback face extraction failed:', extractErr.message);
            return reply.code(500).send({ error: 'Failed to process saved selfie' });
          }
        }
      }

      const anchorVector = guestAnchors[guestKey].anchorVector;
      const extraVectors = guestAnchors[guestKey].extraVectors || [];

      const validPhotos = await prisma.photo.findMany({
        where: { eventId },
        select: { id: true }
      });
      const validPhotoIds = new Set(validPhotos.map(p => p.id));

      let photoIds = [];
      if (qdrant.isMock) {
        let dbVectors = qdrant.mockCache
          .filter(item => item.eventId === eventId && validPhotoIds.has(item.photoId))
          .map(item => ({
            photoId: item.photoId,
            faceId: item.faceId,
            vector: item.vector
          }));

        if (dbVectors.length > 0) {
          try {
            const res = await faceRecManager.matchSelfie(selfiePath, dbVectors, extraVectors);
            if (res.matches) {
              photoIds = res.matches.map(m => m.photoId);
            }
          } catch (matchErr) {
            req.log.error('Match execution failed for saved selfie:', matchErr.message);
          }
        }
      } else {
        const mainMatches = await qdrant.searchVectors(eventId, anchorVector, 100, 0.35);
        const photoIdsSet = new Set(mainMatches.map(m => m.photo_id));
        
        for (const extraVec of extraVectors) {
          const extraMatches = await qdrant.searchVectors(eventId, extraVec, 100, 0.35);
          extraMatches.forEach(m => photoIdsSet.add(m.photo_id));
        }
        photoIds = Array.from(photoIdsSet);
      }

      if (photoIds.length === 0 && (process.env.NODE_ENV === 'development' || process.env.MOCK_AI === 'true')) {
        const fallbackPhotos = await prisma.photo.findMany({
          where: { eventId },
          take: 3
        });
        photoIds = fallbackPhotos.map(p => p.id);
      }

      const photos = await prisma.photo.findMany({
        where: { id: { in: photoIds } },
        select: {
          id: true,
          r2Url: true,
          thumbnailUrl: true,
          filename: true,
          originalFileSize: true,
          tabName: true,
          capturedAt: true,
          width: true,
          height: true,
          _count: {
            select: {
              likes: true
            }
          },
          likes: {
            where: { guestId },
            select: { id: true }
          }
        },
        orderBy: [
          { capturedAt: 'asc' },
          { id: 'asc' }
        ]
      });

      const mappedPhotos = photos.map(p => ({
        id: p.id,
        r2Url: p.r2Url,
        thumbnailUrl: p.thumbnailUrl || null,
        filename: p.filename,
        originalSize: p.originalFileSize,
        tabName: p.tabName,
        capturedAt: p.capturedAt,
        width: p.width,
        height: p.height,
        likeCount: p._count?.likes || 0,
        isLiked: p.likes && p.likes.length > 0
      }));

      return { photos: mappedPhotos };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch matched photos' });
    }
  });

  // Guest upload selfie and search matching event photos
  fastify.post('/api/gallery/public/events/:slug/search', { preHandler: verifyGuestAuth }, async (req, reply) => {
    const eventId = req.guest.eventId;
    const guestKey = `${req.guest.email}_${eventId}`;
    
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No image uploaded' });

    try {
      const buffer = await data.toBuffer();
      
      const tempSelfiePath = path.join(__dirname, '..', '..', 'db', `temp_selfie_${Date.now()}.jpg`);
      fs.writeFileSync(tempSelfiePath, buffer);

      let photoIds = [];

      try {
        const validPhotos = await prisma.photo.findMany({
          where: { eventId },
          select: { id: true }
        });
        const validPhotoIds = new Set(validPhotos.map(p => p.id));

        if (qdrant.isMock) {
          let dbVectors = qdrant.mockCache
            .filter(item => item.eventId === eventId && validPhotoIds.has(item.photoId))
            .map(item => ({
              photoId: item.photoId,
              faceId: item.faceId,
              vector: item.vector
            }));

          if (dbVectors.length > 0) {
            const extraVectors = guestAnchors[guestKey] ? guestAnchors[guestKey].extraVectors : [];
            const res = await faceRecManager.matchSelfie(tempSelfiePath, dbVectors, extraVectors);
            
            if (res.selfie_vector) {
              if (!guestAnchors[guestKey]) {
                guestAnchors[guestKey] = {
                  anchorVector: res.selfie_vector,
                  extraVectors: []
                };
              }
            }

            if (res.matches) {
              photoIds = res.matches.map(m => m.photoId);
              logTelemetry({
                type: 'selfie_search',
                eventId,
                email: req.guest.email,
                matchesFound: photoIds.length
              });
            }
          }
        } else {
          const res = await faceRecManager.validateSelfie(tempSelfiePath);
          if (res.success && res.vector) {
            const extraVectors = guestAnchors[guestKey] ? guestAnchors[guestKey].extraVectors : [];
            
            const mainMatches = await qdrant.searchVectors(eventId, res.vector, 100, 0.35);
            const photoIdsSet = new Set(mainMatches.map(m => m.photo_id));
            
            for (const extraVec of extraVectors) {
              const extraMatches = await qdrant.searchVectors(eventId, extraVec, 100, 0.35);
              extraMatches.forEach(m => photoIdsSet.add(m.photo_id));
            }
            
            photoIds = Array.from(photoIdsSet);
            logTelemetry({
              type: 'selfie_search',
              eventId,
              email: req.guest.email,
              matchesFound: photoIds.length
            });
          }
        }
      } finally {
        if (fs.existsSync(tempSelfiePath)) {
          fs.unlinkSync(tempSelfiePath);
        }
      }

      if (photoIds.length === 0 && (process.env.NODE_ENV === 'development' || process.env.MOCK_AI === 'true')) {
        const fallbackPhotos = await prisma.photo.findMany({
          where: { eventId },
          take: 3
        });
        photoIds = fallbackPhotos.map(p => p.id);
      }

      const photos = await prisma.photo.findMany({
        where: { id: { in: photoIds } },
        select: {
          id: true,
          r2Url: true,
          thumbnailUrl: true,
          filename: true,
          originalFileSize: true,
          tabName: true,
          capturedAt: true,
          width: true,
          height: true,
          _count: {
            select: {
              likes: true
            }
          },
          likes: {
            where: { guestId: req.guest.guestId },
            select: { id: true }
          }
        },
        orderBy: [
          { capturedAt: 'asc' },
          { id: 'asc' }
        ]
      });

      const mappedPhotos = photos.map(p => ({
        id: p.id,
        r2Url: p.r2Url,
        thumbnailUrl: p.thumbnailUrl || null,
        filename: p.filename,
        originalSize: p.originalFileSize,
        tabName: p.tabName,
        capturedAt: p.capturedAt,
        width: p.width,
        height: p.height,
        likeCount: p._count?.likes || 0,
        isLiked: p.likes && p.likes.length > 0
      }));

      return { photos: mappedPhotos };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Search failed' });
    }
  });
};
