const fs = require('fs');
const path = require('path');
const { prisma } = require('../../modules/quotation/prisma');
const qdrant = require('../../utils/qdrant');
const { deleteAsset, isR2Enabled } = require('../../utils/r2');

// In-memory cache for guest anchor vectors and extra vectors from Option B.
const guestAnchors = {}; // key: "email_eventId", value: { anchorVector: [...], extraVectors: [[...], ...] }

const checkGuestSelfie = (guestId) => {
  const selfiePath = path.join(__dirname, '..', '..', 'uploads', 'photos', 'selfies', `guest_${guestId}.jpg`);
  return fs.existsSync(selfiePath);
};

function logTelemetry(entry) {
  const telemetryPath = path.join(__dirname, '..', '..', 'db', 'telemetry.json');
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

// Middleware helper generator to verify guest JWT token
function createVerifyGuestAuth(fastify) {
  return async function verifyGuestAuth(req, reply) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Missing or invalid token' });
      }
      const token = authHeader.split(' ')[1];
      const decoded = fastify.jwt.verify(token);

      // Handle Admin Preview / Admin tokens
      if (decoded.isAdminPreview || decoded.role === 'admin' || (decoded.roles && decoded.roles.includes('admin'))) {
        if (req.params.slug) {
          const event = await prisma.galleryEvent.findUnique({
            where: { slug: req.params.slug.toLowerCase().trim() }
          });
          if (event) req.event = event;
        }
        req.guest = {
          guestId: 0,
          eventId: req.event?.id || decoded.eventId || 0,
          role: 'admin',
          hasFullAccess: true,
          isAdminPreview: true,
          email: decoded.email || 'admin@preview.local',
          phoneNumber: '+910000000000',
          hasSelfie: false
        };
        return;
      }

      if (decoded.role !== 'guest') {
        return reply.code(403).send({ error: 'Access denied' });
      }
      // Validate JWT eventId matches the URL slug to prevent cross-event access
      if (req.params.slug) {
        const event = await prisma.galleryEvent.findUnique({
          where: { slug: req.params.slug.toLowerCase().trim() }
        });
        if (!event || (decoded.eventId && event.id !== decoded.eventId)) {
          return reply.code(403).send({ error: 'Token does not match this event' });
        }
        req.event = event; // Cache the event for downstream handlers
      }
      // Fetch guest status from database to get the real-time access level
      let dbGuest = null;
      if (decoded.guestId) {
        dbGuest = await prisma.guest.findUnique({
          where: { id: decoded.guestId }
        });
      }
      if (!dbGuest) {
        return reply.code(403).send({ error: 'Access denied: Participant removed from gallery' });
      }
      if (dbGuest.isBlocked) {
        return reply.code(403).send({ error: 'Access denied: blocked user' });
      }
      req.guest = {
        ...decoded,
        hasFullAccess: dbGuest.hasFullAccess
      };
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized session' });
    }
  };
}

// Helper function to delete photo assets and database/Qdrant records in parallel chunks
async function deletePhotosAssets(photos, slug, log) {
  let publicDomain = '';
  if (isR2Enabled && process.env.R2_PUBLIC_DOMAIN_URL) {
    publicDomain = process.env.R2_PUBLIC_DOMAIN_URL.trim();
    if (publicDomain.startsWith('http://')) publicDomain = publicDomain.substring(7);
    if (publicDomain.startsWith('https://')) publicDomain = publicDomain.substring(8);
  }

  const chunkSize = 15; // concurrency level
  for (let i = 0; i < photos.length; i += chunkSize) {
    const chunk = photos.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (p) => {
      try {
        // Delete associated face crops from R2 if R2 is enabled
        const faceIds = await qdrant.getFaceIdsForPhoto(p.id);
        await Promise.all(faceIds.map(async (faceId) => {
          if (isR2Enabled && publicDomain && slug) {
            const faceUrl = `https://${publicDomain}/events/${slug}/photos/${faceId}.jpg`;
            await deleteAsset(faceUrl).catch(() => {});
            const faceUrlAlt = `https://${publicDomain}/events/${slug}/faces/${faceId}.jpg`;
            await deleteAsset(faceUrlAlt).catch(() => {});
          } else {
            const targetDir = path.join(__dirname, '..', '..', 'uploads', 'photos');
            const localFacePath = path.join(targetDir, `${faceId}.jpg`);
            if (fs.existsSync(localFacePath)) {
              try { fs.unlinkSync(localFacePath); } catch (e) {}
            }
          }
        }));

        // Delete from Qdrant
        await qdrant.deleteVectorsForPhoto(p.id);

        // Delete thumbnail from R2
        if (p.thumbnailUrl) {
          await deleteAsset(p.thumbnailUrl).catch(() => {});
        } else if (isR2Enabled && publicDomain && slug && p.filename) {
          const thumbFilename = `thumb_${p.filename}`;
          const thumbSubfolder = `events/${slug}/thumbnails`;
          const thumbKey = `${thumbSubfolder}/${thumbFilename}`;
          const thumbUrl = `https://${publicDomain}/${thumbKey}`;
          await deleteAsset(thumbUrl).catch(() => {});
        }

        // Delete from R2 (or local disk fallback)
        if (p.r2Url) {
          await deleteAsset(p.r2Url).catch(() => {});
        }

        // Delete from disk (legacy local fallback)
        if (p.filename) {
          const targetDir = path.join(__dirname, '..', '..', 'uploads', 'photos');
          const filePath = path.join(targetDir, p.filename);
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
          }

          // Delete grid thumbnail (dev/legacy only — in production thumbnails are in R2)
          if (process.env.NODE_ENV !== 'production') {
            const thumbPath = path.join(targetDir, `thumb_${p.filename}`);
            if (fs.existsSync(thumbPath)) {
              try { fs.unlinkSync(thumbPath); } catch (e) {}
            }

            // Delete associated face crop thumbnails (dev/legacy only)
            try {
              const files = fs.readdirSync(targetDir);
              const baseWithoutExt = path.parse(p.filename).name;
              for (const file of files) {
                if (file.startsWith('face-') && file.includes(baseWithoutExt)) {
                  fs.unlinkSync(path.join(targetDir, file));
                }
              }
            } catch (e) {
              log.error(e);
            }
          }
        }
      } catch (err) {
        log.error(`[deletePhotosAssets] Error deleting assets for photo ID ${p.id}:`, err);
      }
    }));
  }
}

module.exports = {
  guestAnchors,
  checkGuestSelfie,
  logTelemetry,
  createVerifyGuestAuth,
  deletePhotosAssets
};
