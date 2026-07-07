const fs = require('fs');
const path = require('path');
const { prisma } = require('../modules/quotation/prisma');
const qdrant = require('../utils/qdrant');

module.exports = async function galleryRoutes(fastify, opts) {
  const { pool, requireAdmin, requireAuth } = opts;

  // In-memory cache for guest anchor vectors and extra vectors from Option B.
  const guestAnchors = {}; // key: "email_eventId", value: { anchorVector: [...], extraVectors: [[...], ...] }

  function logTelemetry(entry) {
    const telemetryPath = path.join(__dirname, '..', 'db', 'telemetry.json');
    let data = [];
    try {
      if (fs.existsSync(telemetryPath)) {
        data = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));
      }
    } catch (err) {
      // Ignore
    }
    data.push({
      timestamp: new Date().toISOString(),
      ...entry
    });
    try {
      const dir = path.dirname(telemetryPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(telemetryPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      // Ignore
    }
  }

  // Middleware helper to verify guest JWT token
  async function verifyGuestAuth(req, reply) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Missing or invalid token' });
      }
      const token = authHeader.split(' ')[1];
      const decoded = fastify.jwt.verify(token);
      if (decoded.role !== 'guest') {
        return reply.code(403).send({ error: 'Access denied' });
      }
      req.guest = decoded;
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized session' });
    }
  }

  /* ========================================================================= */
  /* ADMIN API ROUTINGS                                                        */
  /* ========================================================================= */

  // Create a new wedding gallery event
  fastify.post('/api/gallery/events', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const { slug, title, date, qrToken, coverPhotoUrl } = req.body;
    if (!slug || !title || !date || !qrToken) {
      return reply.code(400).send({ error: 'Missing required fields' });
    }

    try {
      const existing = await prisma.galleryEvent.findFirst({
        where: { OR: [{ slug }, { qrToken }] }
      });
      if (existing) {
        return reply.code(400).send({ error: 'Slug or QR Token already exists' });
      }

      const event = await prisma.galleryEvent.create({
        data: {
          slug: slug.toLowerCase().trim(),
          title,
          date: new Date(date),
          qrToken,
          coverPhotoUrl
        }
      });

      return event;
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to create gallery event' });
    }
  });

  // Bulk upload photo metadata and face vectors
  fastify.post('/api/gallery/events/:id/photos/bulk', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { photos } = req.body; // photos: [{ filename, r2Url, fileSize, faces: [{ faceId, vector }] }]

    if (!photos || !Array.isArray(photos)) {
      return reply.code(400).send({ error: 'Invalid photos array payload' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
      if (!event) {
        return reply.code(404).send({ error: 'Event not found' });
      }

      const results = [];
      for (const p of photos) {
        // Create photo record in PostgreSQL
        const photo = await prisma.photo.create({
          data: {
            eventId,
            r2Url: p.r2Url,
            filename: p.filename,
            fileSize: p.fileSize
          }
        });

        // Insert vectors to Qdrant (or mock fallback)
        if (p.faces && p.faces.length > 0) {
          await qdrant.upsertVectors(eventId, photo.id, p.faces);
        }

        results.push(photo);
      }

      return { status: 'success', count: results.length };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to upload photo metadata' });
    }
  });

  /* ========================================================================= */
  /* PUBLIC / GUEST API ROUTINGS                                               */
  /* ========================================================================= */

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
          active: true
        }
      });

      if (!event || !event.active) {
        return reply.code(404).send({ error: 'Gallery not found or inactive' });
      }

      return event;
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Server error retrieving event details' });
    }
  });

  // Load all public photos of the event
  fastify.get('/api/gallery/public/events/:slug/photos', async (req, reply) => {
    const slug = req.params.slug.toLowerCase().trim();
    try {
      const event = await prisma.galleryEvent.findUnique({ where: { slug } });
      if (!event || !event.active) {
        return reply.code(404).send({ error: 'Gallery not found' });
      }

      const photos = await prisma.photo.findMany({
        where: { eventId: event.id },
        select: {
          r2Url: true,
          filename: true
        }
      });

      return { photos };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve gallery photos' });
    }
  });

  // Get clustered people from the event photos
  fastify.get('/api/gallery/public/events/:slug/people', async (req, reply) => {
    const slug = req.params.slug.toLowerCase().trim();
    try {
      const event = await prisma.galleryEvent.findUnique({ where: { slug } });
      if (!event) return reply.code(404).send({ error: 'Event not found' });

      // Fetch pre-extracted face vectors for this event
      let dbVectors = [];
      if (qdrant.isMock) {
        dbVectors = qdrant.mockCache
          .filter(item => item.eventId === event.id)
          .map(item => ({
            photoId: item.photoId,
            faceId: item.faceId,
            vector: item.vector
          }));
      }

      if (dbVectors.length === 0) {
        return { people: [] };
      }

      const { execSync } = require('child_process');
      const scriptPath = path.join(__dirname, '..', 'utils', 'face_rec.py');

      // Write vectors JSON to a temp file
      const tempDbJsonPath = path.join(__dirname, '..', 'db', `temp_db_cluster_${Date.now()}.json`);
      fs.writeFileSync(tempDbJsonPath, JSON.stringify(dbVectors), 'utf8');

      // Run cluster command
      const output = execSync(`python3 "${scriptPath}" cluster "${tempDbJsonPath}"`).toString();

      // Cleanup
      if (fs.existsSync(tempDbJsonPath)) fs.unlinkSync(tempDbJsonPath);

      const res = JSON.parse(output);
      if (!res.clusters) {
        return { people: [] };
      }

      // Fetch photo details for each cluster to set cover photo and return details
      const people = [];
      for (const cluster of res.clusters) {
        const photosInCluster = await prisma.photo.findMany({
          where: { id: { in: cluster.photoIds } },
          select: {
            r2Url: true,
            filename: true
          }
        });

        if (photosInCluster.length > 0) {
          // Find the faceUrl of the first face in the cluster from the mockCache
          let coverPhotoUrl = photosInCluster[0].r2Url;
          if (cluster.faceIds && cluster.faceIds.length > 0) {
            const firstFaceId = cluster.faceIds[0];
            const cachedFace = qdrant.mockCache.find(item => item.faceId === firstFaceId);
            if (cachedFace && cachedFace.faceUrl) {
              coverPhotoUrl = cachedFace.faceUrl;
            }
          }

          people.push({
            id: cluster.id,
            photoCount: cluster.photoCount,
            coverPhotoUrl: coverPhotoUrl,
            photos: photosInCluster
          });
        }
      }

      return { people };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to cluster event faces' });
    }
  });

  // Verify OAuth tokens (Google/Apple) and register guest
  fastify.post('/api/gallery/public/events/:slug/auth', async (req, reply) => {
    const slug = req.params.slug.toLowerCase().trim();
    const { provider, token, name, email } = req.body;

    if (!provider || !token) {
      return reply.code(400).send({ error: 'Provider and token are required' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({ where: { slug } });
      if (!event) return reply.code(404).send({ error: 'Event not found' });

      let verifiedEmail = email;
      let verifiedName = name;
      let providerId = `mock-id-${Date.now()}`;

      if (token === 'mock_dev_token' || process.env.NODE_ENV === 'development') {
        // Local development bypass / mock login
        verifiedEmail = email || 'mockguest@example.com';
        verifiedName = name || 'Mock Guest';
      } else {
        // Live validation for Google Auth
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
          // Simplistic profile payload registration for Apple auth (to be integrated with full JWKS validation in prod)
          verifiedEmail = email;
          verifiedName = name;
          providerId = token; // Treat the identifier token as unique providerId
          if (!verifiedEmail) {
            return reply.code(400).send({ error: 'Apple Auth requires email for first-time login' });
          }
        }
      }

      // Find or create guest
      let guest = await prisma.guest.findFirst({
        where: { eventId: event.id, email: verifiedEmail }
      });

      if (!guest) {
        guest = await prisma.guest.create({
          data: {
            eventId: event.id,
            email: verifiedEmail,
            name: verifiedName,
            provider,
            providerId
          }
        });
      }

      // Generate secure guest JWT session
      const sessionToken = fastify.jwt.sign({
        guestId: guest.id,
        eventId: event.id,
        email: guest.email,
        role: 'guest'
      }, { expiresIn: '7d' });

      return {
        token: sessionToken,
        guest: {
          id: guest.id,
          name: guest.name,
          email: guest.email,
          phoneNumber: guest.phoneNumber
        }
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Authentication failed' });
    }
  });

  // Store/update guest phone number (Optional, post-login collection)
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

  // Guest upload selfie and search matching event photos
  fastify.post('/api/gallery/public/events/:slug/search', { preHandler: verifyGuestAuth }, async (req, reply) => {
    const eventId = req.guest.eventId;
    const guestKey = `${req.guest.email}_${eventId}`;
    
    // Parse uploaded image using fastify-multipart
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No image uploaded' });

    try {
      const buffer = await data.toBuffer();
      
      // Save selfie temporarily to run face recognition
      const tempSelfiePath = path.join(__dirname, '..', 'db', `temp_selfie_${Date.now()}.jpg`);
      fs.writeFileSync(tempSelfiePath, buffer);

      let photoIds = [];

      try {
        const { execSync } = require('child_process');
        const scriptPath = path.join(__dirname, '..', 'utils', 'face_rec.py');

        // Fetch pre-extracted face vectors for this event
        let dbVectors = [];
        if (qdrant.isMock) {
          dbVectors = qdrant.mockCache
            .filter(item => item.eventId === eventId)
            .map(item => ({
              photoId: item.photoId,
              faceId: item.faceId,
              vector: item.vector
            }));
        }

        if (dbVectors.length > 0) {
          // Write dbJson to a temp file to avoid command argument limit errors
          const tempDbJsonPath = path.join(__dirname, '..', 'db', `temp_db_json_${Date.now()}.json`);
          fs.writeFileSync(tempDbJsonPath, JSON.stringify(dbVectors), 'utf8');

          // Fetch extra vectors for query matching if present
          const extraVectors = guestAnchors[guestKey] ? guestAnchors[guestKey].extraVectors : [];
          let tempExtraJsonPath = '';
          let command = `python3 "${scriptPath}" match "${tempSelfiePath}" "${tempDbJsonPath}"`;
          
          if (extraVectors && extraVectors.length > 0) {
            tempExtraJsonPath = path.join(__dirname, '..', 'db', `temp_extra_json_${Date.now()}.json`);
            fs.writeFileSync(tempExtraJsonPath, JSON.stringify(extraVectors), 'utf8');
            command += ` "${tempExtraJsonPath}"`;
          }

          const output = execSync(command).toString();
          
          // Cleanup temp JSON files
          if (fs.existsSync(tempDbJsonPath)) fs.unlinkSync(tempDbJsonPath);
          if (tempExtraJsonPath && fs.existsSync(tempExtraJsonPath)) fs.unlinkSync(tempExtraJsonPath);

          const res = JSON.parse(output);
          
          // Update in-memory anchor vector
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
            req.log.info(`Real SFace matching found ${photoIds.length} photos.`);
            
            // Log search telemetry details
            logTelemetry({
              eventId,
              guestEmail: req.guest.email,
              actionType: 'selfie_search',
              queryExpanded: res.query_expanded || false,
              seeds: res.seeds || [],
              matchesCount: photoIds.length,
              highestScore: res.matches.length > 0 ? res.matches[0].score : null
            });
          } else if (res.error) {
            req.log.error(`FaceRec script error: ${res.error}`);
          }
        }
      } catch (err) {
        req.log.error('Real face matching failed, falling back to mock query:', err.message);
      } finally {
        // Cleanup temp selfie
        if (fs.existsSync(tempSelfiePath)) fs.unlinkSync(tempSelfiePath);
      }

      // Fallback: If no real matches found or extraction failed, return a random photo subset in dev mode
      if (photoIds.length === 0 && (process.env.NODE_ENV === 'development' || process.env.MOCK_AI === 'true')) {
        const fallbackPhotos = await prisma.photo.findMany({
          where: { eventId },
          take: 3
        });
        photoIds = fallbackPhotos.map(p => p.id);
      }

      // Fetch matching photo urls from PostgreSQL
      const photos = await prisma.photo.findMany({
        where: { id: { in: photoIds } },
        select: {
          r2Url: true,
          filename: true
        }
      });

      return { photos };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to execute facial search' });
    }
  });

  // Guest upload verification selfie (Option B)
  fastify.post('/api/gallery/public/events/:slug/verify-anchor', { preHandler: verifyGuestAuth }, async (req, reply) => {
    const eventId = req.guest.eventId;
    const guestKey = `${req.guest.email}_${eventId}`;
    
    // Check if the user has an anchor vector registered
    if (!guestAnchors[guestKey] || !guestAnchors[guestKey].anchorVector) {
      return reply.code(400).send({ error: 'No registered anchor selfie found. Please run a main search first.' });
    }

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No image uploaded' });

    try {
      const buffer = await data.toBuffer();
      const tempSelfiePath = path.join(__dirname, '..', 'db', `temp_verify_${Date.now()}.jpg`);
      fs.writeFileSync(tempSelfiePath, buffer);

      try {
        const { execSync } = require('child_process');
        const scriptPath = path.join(__dirname, '..', 'utils', 'face_rec.py');

        const anchorVector = guestAnchors[guestKey].anchorVector;
        const anchorVectorJson = JSON.stringify(anchorVector);

        // Execute verify command in python script
        const output = execSync(`python3 "${scriptPath}" verify "${tempSelfiePath}" '${anchorVectorJson}'`).toString();
        const res = JSON.parse(output);

        if (res.verified) {
          // Push this verified vector as an extra seed for future query matches
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
};
