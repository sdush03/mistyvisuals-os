const fs = require('fs');
const path = require('path');
const { prisma } = require('../../modules/quotation/prisma');
const qdrant = require('../../utils/qdrant');
const { uploadAsset, deleteAsset, getPresignedUploadUrl, isR2Enabled } = require('../../utils/r2');
const { deletePhotosAssets } = require('./helpers');

module.exports = async function registerPhotoRoutes(fastify, opts) {
  const { pool, requireAdmin } = opts;

  // Get photos for an event (Admin only) — used by the Electron uploader
  fastify.get('/api/gallery/events/:id/photos', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    if (isNaN(eventId)) {
      return reply.code(400).send({ error: 'Invalid event ID' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
      if (!event) {
        return reply.code(404).send({ error: 'Gallery event not found' });
      }

      const offset = Math.max(0, parseInt(req.query.offset) || 0);
      const limit  = Math.min(50000, Math.max(1, parseInt(req.query.limit) || 50000));
      const tabFilter = (req.query.tab || '').trim();

      const whereClause = { eventId };
      if (tabFilter && tabFilter !== 'ALL') {
        whereClause.tabName = tabFilter;
      }

      const [total, photos] = await Promise.all([
        prisma.photo.count({ where: whereClause }),
        prisma.photo.findMany({
          where: whereClause,
          select: {
            id: true,
            r2Url: true,
            filename: true,
            originalFileSize: true,
            tabName: true,
            capturedAt: true,
            width: true,
            height: true
          },
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
        filename: p.filename,
        originalSize: p.originalFileSize,
        tabName: p.tabName,
        capturedAt: p.capturedAt,
        width: p.width,
        height: p.height
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

  // Delete multiple photos by ID (admin only)
  fastify.delete('/api/gallery/events/:id/photos', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { photoIds } = req.body;

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return reply.code(400).send({ error: 'Missing or invalid photoIds' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
      const slug = event ? event.slug.toLowerCase().trim() : null;

      const photosToDelete = await prisma.photo.findMany({
        where: {
          id: { in: photoIds },
          eventId: eventId
        }
      });

      const deleted = await prisma.photo.deleteMany({
        where: {
          id: { in: photosToDelete.map(p => p.id) },
          eventId: eventId
        }
      });

      await prisma.galleryEvent.update({
        where: { id: eventId },
        data: { clustersDirty: true }
      });

      if (slug) {
        deletePhotosAssets(photosToDelete, slug, req.log).catch((err) => {
          req.log.error(`[deletePhotosAssets] Non-blocking cleanup error:`, err);
        });
      }

      return { success: true, count: deleted.count };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to delete photos' });
    }
  });

  // Move multiple photos to another tab (admin only)
  fastify.patch('/api/gallery/events/:id/photos/move', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { photoIds, targetTab } = req.body;

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0 || !targetTab) {
      return reply.code(400).send({ error: 'Missing or invalid parameters' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({
        where: { id: eventId }
      });

      if (!event) {
        return reply.code(404).send({ error: 'Gallery event not found' });
      }

      if (!event.tabs.includes(targetTab)) {
        return reply.code(400).send({ error: `Target tab '${targetTab}' does not exist in this event` });
      }

      const updated = await prisma.photo.updateMany({
        where: {
          id: { in: photoIds },
          eventId: eventId
        },
        data: {
          tabName: targetTab
        }
      });

      return { success: true, count: updated.count };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to move photos' });
    }
  });

  // Generate pre-signed R2 upload URLs for photo metadata (Admin only)
  fastify.post('/api/gallery/events/:id/generate-upload-urls', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { uploads } = req.body;

    if (!uploads || !Array.isArray(uploads)) {
      return reply.code(400).send({ error: 'Missing or invalid uploads array' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
      if (!event) {
        return reply.code(404).send({ error: 'Event not found' });
      }

      const slug = event.slug.toLowerCase().trim();
      let publicDomain = '';
      if (isR2Enabled && process.env.R2_PUBLIC_DOMAIN_URL) {
        publicDomain = process.env.R2_PUBLIC_DOMAIN_URL.trim();
        if (publicDomain.startsWith('http://')) publicDomain = publicDomain.substring(7);
        if (publicDomain.startsWith('https://')) publicDomain = publicDomain.substring(8);
      }

      const results = [];
      for (const item of uploads) {
        const ext = path.extname(item.filename);
        const base = path.basename(item.filename, ext);
        const uniqueFilename = `${base}_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}${ext}`;

        const photoKey = `events/${slug}/photos/${uniqueFilename}`;

        const r2Url = isR2Enabled ? `https://${publicDomain}/${photoKey}` : `/api/photos/file/${photoKey}`;

        const photoPutUrl = await getPresignedUploadUrl(photoKey, 'image/jpeg');

        results.push({
          filename: item.filename,
          photoPutUrl,
          r2Url,
          faces: []
        });
      }

      return { uploads: results };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to generate pre-signed upload URLs' });
    }
  });

  // Generate pre-signed PUT URLs for face crops only
  fastify.post('/api/gallery/events/:id/generate-face-upload-urls', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { faceIds, eventSlug } = req.body;

    if (!faceIds || !Array.isArray(faceIds) || faceIds.length === 0) {
      return reply.code(400).send({ error: 'Missing or invalid faceIds array' });
    }

    try {
      let slug = eventSlug;
      if (!slug) {
        const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
        if (!event) return reply.code(404).send({ error: 'Event not found' });
        slug = event.slug;
      }
      slug = slug.toLowerCase().trim();

      let publicDomain = '';
      if (isR2Enabled && process.env.R2_PUBLIC_DOMAIN_URL) {
        publicDomain = process.env.R2_PUBLIC_DOMAIN_URL.trim();
        if (publicDomain.startsWith('http://')) publicDomain = publicDomain.substring(7);
        if (publicDomain.startsWith('https://')) publicDomain = publicDomain.substring(8);
      }

      const faces = [];
      for (const faceId of faceIds) {
        const faceKey = `events/${slug}/faces/${faceId}.jpg`;
        const putUrl = await getPresignedUploadUrl(faceKey, 'image/jpeg');
        const r2Url = isR2Enabled ? `https://${publicDomain}/${faceKey}` : `/api/photos/file/${faceKey}`;
        faces.push({ faceId, putUrl, r2Url });
      }

      return { faces };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to generate face upload URLs' });
    }
  });

  // Direct file upload endpoint
  fastify.post('/api/gallery/upload-photo-file', { bodyLimit: 50 * 1024 * 1024 }, async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const { filename, fileContent, eventId, eventSlug, isFaceCrop } = req.body;
    if (!filename || !fileContent) {
      return reply.code(400).send({ error: 'Missing filename or fileContent' });
    }

    try {
      const buffer = Buffer.from(fileContent, 'base64');

      let slug = 'general';
      if (eventSlug) {
        slug = eventSlug.toLowerCase().trim();
      } else if (eventId) {
        const event = await prisma.galleryEvent.findUnique({
          where: { id: parseInt(eventId, 10) }
        });
        if (event && event.slug) {
          slug = event.slug.toLowerCase().trim();
        }
      }

      let subfolder = `events/${slug}/photos`;
      if (filename.startsWith('face-') || isFaceCrop) {
        subfolder = `events/${slug}/faces`;
      }

      let finalFilename = filename;
      const isSpecialFile = filename.startsWith('face-') || isFaceCrop || filename.startsWith('temp_') || filename.startsWith('verify_') || filename.startsWith('guest_');
      if (!isSpecialFile) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        finalFilename = `${base}_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}${ext}`;
      }

      const r2Url = await uploadAsset(buffer, finalFilename, subfolder, 'image/jpeg');

      return { r2Url };
    } catch (err) {
      req.log.error(err);
      if (err.message && err.message.includes('R2 storage')) {
        return reply.code(500).send({ error: err.message });
      }
      return reply.code(500).send({ error: 'Failed to save uploaded file' });
    }
  });

  // Update gallery event details
  fastify.patch('/api/gallery/events/:id', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { title, date, slug, active, allowDownloads, allowBulkDownloads, bulkDownloadPin } = req.body;

    try {
      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (date !== undefined) {
        updateData.date = date ? new Date(date) : null;
      }
      if (active !== undefined) updateData.active = Boolean(active);
      if (allowDownloads !== undefined) updateData.allowDownloads = Boolean(allowDownloads);
      if (allowBulkDownloads !== undefined) updateData.allowBulkDownloads = Boolean(allowBulkDownloads);
      if (bulkDownloadPin !== undefined) updateData.bulkDownloadPin = bulkDownloadPin;

      if (slug !== undefined && slug !== null) {
        const normalizedSlug = slug.toLowerCase().trim();
        const existing = await prisma.galleryEvent.findFirst({
          where: {
            slug: normalizedSlug,
            id: { not: eventId }
          }
        });
        if (existing) {
          return reply.code(400).send({ error: 'Slug is already taken by another gallery.' });
        }
        updateData.slug = normalizedSlug;
        updateData.qrToken = `${normalizedSlug}_qr`;
      }

      const event = await prisma.galleryEvent.update({
        where: { id: eventId },
        data: updateData
      });

      return { success: true, event };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to update gallery details' });
    }
  });

  // Get detailed information of a single gallery event by ID (Admin only)
  fastify.get('/api/gallery/events/:id', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return reply.code(400).send({ error: 'Invalid gallery ID' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({
        where: { id },
        include: {
          guests: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
              hasFullAccess: true,
              isBlocked: true,
              createdAt: true
            }
          }
        }
      });

      if (!event) {
        return reply.code(404).send({ error: 'Gallery not found' });
      }

      let crmName = null;
      let crmSlug = null;
      if (event.projectId) {
        const projRes = await pool.query(
          `SELECT name, slug FROM projects WHERE id = $1 LIMIT 1`,
          [event.projectId]
        );
        if (projRes.rows.length > 0) {
          crmName = projRes.rows[0].name;
          crmSlug = projRes.rows[0].slug;
        }
      }

      return {
        ...event,
        crmName,
        crmSlug,
        passcode: event.fullCode || null,
        partialPasscode: event.partialCode || null
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve gallery details' });
    }
  });

  // Generate preview URL with secure token
  fastify.get('/api/gallery/events/:id/preview-url', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    if (isNaN(eventId)) {
      return reply.code(400).send({ error: 'Invalid event ID' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({
        where: { id: eventId }
      });

      if (!event) {
        return reply.code(404).send({ error: 'Gallery event not found' });
      }

      const passcode = event.fullCode || '';
      const domain = 'https://mycircle.mistyvisuals.com';
      const previewUrl = passcode 
        ? `${domain}/${event.slug}/gallery?code=${passcode}`
        : `${domain}/${event.slug}/gallery`;

      return { url: previewUrl };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to generate preview URL' });
    }
  });

  // Delete wedding gallery event
  fastify.delete('/api/gallery/events/:id', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    if (isNaN(eventId)) {
      return reply.code(400).send({ error: 'Invalid gallery ID' });
    }

    try {
      const dbEvent = await prisma.galleryEvent.findUnique({
        where: { id: eventId },
        include: {
          guests: true,
          photos: true
        }
      });

      if (!dbEvent) {
        return reply.code(404).send({ error: 'Gallery event not found' });
      }

      const slug = dbEvent.slug;

      if (dbEvent.coverPhotoUrl) await deleteAsset(dbEvent.coverPhotoUrl).catch(() => {});
      if (dbEvent.coverPhotoSquareUrl) await deleteAsset(dbEvent.coverPhotoSquareUrl).catch(() => {});
      if (dbEvent.coverPhotoMobileUrl) await deleteAsset(dbEvent.coverPhotoMobileUrl).catch(() => {});

      const selfiesDir = path.join(__dirname, '..', '..', 'uploads', 'photos', 'selfies');
      for (const guest of dbEvent.guests) {
        const selfiePath = path.join(selfiesDir, `guest_${guest.id}.jpg`);
        const vectorPath = path.join(selfiesDir, `guest_${guest.id}.json`);
        if (fs.existsSync(selfiePath)) {
          try { fs.unlinkSync(selfiePath); } catch (e) {}
        }
        if (fs.existsSync(vectorPath)) {
          try { fs.unlinkSync(vectorPath); } catch (e) {}
        }
      }

      if (dbEvent.photos && dbEvent.photos.length > 0) {
        await deletePhotosAssets(dbEvent.photos, slug, req.log).catch((err) => {
          req.log.error(`[deletePhotosAssets] Non-blocking cleanup error during gallery deletion:`, err);
        });
      }

      await prisma.galleryEvent.delete({
        where: { id: eventId }
      });

      return { success: true, message: 'Gallery event deleted successfully' };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to delete gallery event' });
    }
  });

  // Upload and set cover photo
  fastify.post('/api/gallery/events/:id/covers', { bodyLimit: 50 * 1024 * 1024 }, async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { type, filename, fileContent } = req.body;
    if (!type || !filename || !fileContent) {
      return reply.code(400).send({ error: 'Missing type, filename, or fileContent' });
    }
    if (!['horizontal', 'vertical', 'square32'].includes(type)) {
      return reply.code(400).send({ error: 'Invalid type. Must be horizontal, vertical, or square32' });
    }

    try {
      const dbEvent = await prisma.galleryEvent.findUnique({
        where: { id: eventId }
      });
      if (!dbEvent) {
        return reply.code(404).send({ error: 'Gallery event not found' });
      }
      const slug = dbEvent.slug.toLowerCase().trim();

      const buffer = Buffer.from(fileContent, 'base64');
      const subfolder = `events/${slug}/covers`;

      const updateData = {};
      const sharp = require('sharp');

      if (type === 'horizontal') {
        const buffer169 = await sharp(buffer)
          .resize(1920, 1080, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 82 })
          .toBuffer();
        const filename169 = `cover_${eventId}_horizontal_${Date.now()}_${filename}`;
        const r2Url169 = await uploadAsset(buffer169, filename169, subfolder, 'image/jpeg');
        updateData.coverPhotoUrl = r2Url169;

        const buffer32 = await sharp(buffer)
          .resize(1200, 800, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 82 })
          .toBuffer();
        const filename32 = `cover_${eventId}_square32_${Date.now()}_${filename}`;
        const r2Url32 = await uploadAsset(buffer32, filename32, subfolder, 'image/jpeg');
        updateData.coverPhotoSquareUrl = r2Url32;
      } else if (type === 'square32') {
        const buffer32 = await sharp(buffer)
          .resize(1200, 800, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 82 })
          .toBuffer();
        const filename32 = `cover_${eventId}_square32_${Date.now()}_${filename}`;
        const r2Url32 = await uploadAsset(buffer32, filename32, subfolder, 'image/jpeg');
        updateData.coverPhotoSquareUrl = r2Url32;
      } else {
        const filenameMobile = `cover_${eventId}_vertical_${Date.now()}_${filename}`;
        const r2UrlMobile = await uploadAsset(buffer, filenameMobile, subfolder, 'image/jpeg');
        updateData.coverPhotoMobileUrl = r2UrlMobile;
      }

      if (type === 'horizontal') {
        if (dbEvent.coverPhotoUrl) await deleteAsset(dbEvent.coverPhotoUrl).catch(() => {});
        if (dbEvent.coverPhotoSquareUrl) await deleteAsset(dbEvent.coverPhotoSquareUrl).catch(() => {});
      } else if (type === 'square32') {
        if (dbEvent.coverPhotoSquareUrl) await deleteAsset(dbEvent.coverPhotoSquareUrl).catch(() => {});
      } else {
        if (dbEvent.coverPhotoMobileUrl) await deleteAsset(dbEvent.coverPhotoMobileUrl).catch(() => {});
      }

      const updatedEvent = await prisma.galleryEvent.update({
        where: { id: eventId },
        data: updateData
      });

      const primaryUrl = type === 'horizontal' ? updateData.coverPhotoUrl : (type === 'square32' ? updateData.coverPhotoSquareUrl : updateData.coverPhotoMobileUrl);
      return { success: true, url: primaryUrl, event: updatedEvent };
    } catch (err) {
      req.log.error(err);
      if (err.message && err.message.includes('R2 storage')) {
        return reply.code(500).send({ error: err.message });
      }
      return reply.code(500).send({ error: 'Failed to upload cover photo' });
    }
  });

  // Bulk upload photo metadata and face vectors
  fastify.post('/api/gallery/events/:id/photos/bulk', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { photos, isFaceScannerOffline } = req.body;

    if (!photos || !Array.isArray(photos)) {
      return reply.code(400).send({ error: 'Invalid photos array payload' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
      if (!event) {
        return reply.code(404).send({ error: 'Event not found' });
      }

      const results = [];
      const facesScanned = isFaceScannerOffline ? false : true;

      // Map existing photos for this incoming batch to avoid creating duplicate database rows on re-runs/retries
      const incomingFilenames = photos.map(p => p.filename).filter(Boolean);
      const existingPhotosMap = new Map();
      const existingPhotosList = await prisma.photo.findMany({
        where: {
          eventId,
          filename: { in: incomingFilenames }
        },
        select: { id: true, filename: true, tabName: true }
      });
      existingPhotosList.forEach(ep => {
        const key = `${(ep.tabName || '').toLowerCase().trim()}::${(ep.filename || '').toLowerCase().trim()}`;
        existingPhotosMap.set(key, ep.id);
      });

      const vectorBatch = [];

      for (const p of photos) {
        const lookupKey = `${(p.tabName || '').toLowerCase().trim()}::${(p.filename || '').toLowerCase().trim()}`;
        const existingPhotoId = existingPhotosMap.get(lookupKey);

        let photo;
        if (existingPhotoId) {
          photo = await prisma.photo.update({
            where: { id: existingPhotoId },
            data: {
              r2Url: p.r2Url,
              fileSize: p.fileSize,
              originalFileSize: p.originalSize || undefined,
              exif: p.exif || undefined,
              capturedAt: p.capturedAt ? new Date(p.capturedAt) : undefined,
              facesScanned,
              width: p.width || undefined,
              height: p.height || undefined
            }
          });
        } else {
          photo = await prisma.photo.create({
            data: {
              eventId,
              r2Url: p.r2Url,
              filename: p.filename,
              fileSize: p.fileSize,
              originalFileSize: p.originalSize || null,
              tabName: p.tabName || null,
              exif: p.exif || null,
              capturedAt: p.capturedAt ? new Date(p.capturedAt) : null,
              facesScanned,
              width: p.width || null,
              height: p.height || null
            }
          });
          existingPhotosMap.set(lookupKey, photo.id);
        }

        if (p.faces && p.faces.length > 0) {
          vectorBatch.push({ photoId: photo.id, faces: p.faces });
        }

        results.push(photo);
      }

      if (vectorBatch.length > 0) {
        try {
          await qdrant.upsertBulkPhotoVectors(eventId, vectorBatch);
        } catch (vErr) {
          console.warn('[Bulk Photos] Qdrant bulk vector upsert warning:', vErr.message);
        }
      }

      const newTabs = [...new Set(photos.map(p => p.tabName).filter(Boolean))];
      const existingTabs = event.tabs || [];
      const mergedTabs = [...new Set([...existingTabs, ...newTabs])];

      const updateData = { clustersDirty: true, tabs: mergedTabs };
      if (isFaceScannerOffline) {
        updateData.galleryFacesComplete = false;
      }
      await prisma.galleryEvent.update({
        where: { id: eventId },
        data: updateData
      });

      return { status: 'success', count: results.length };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to upload photo metadata' });
    }
  });

  // Integrity check for a batch of photos
  fastify.post('/api/gallery/events/:id/integrity-check', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { photoIds = [] } = req.body || {};

    try {
      const where = photoIds.length > 0
        ? { id: { in: photoIds.map(Number) }, eventId }
        : { eventId };

      const [total, facesUnscanned, localUrls, dimensionsMissing, exifMissing, tabCounts] = await Promise.all([
        prisma.photo.count({ where }),
        prisma.photo.count({ where: { ...where, facesScanned: false } }),
        prisma.photo.count({ where: { ...where, r2Url: { startsWith: '/api/' } } }),
        prisma.photo.count({ where: { ...where, OR: [{ width: null }, { height: null }] } }),
        prisma.photo.count({ where: { ...where, exif: null } }),
        prisma.photo.groupBy({
          by: ['tabName'],
          where,
          _count: { _all: true }
        })
      ]);

      let vectorCount = 0;
      const qdrantMock = qdrant.isMockMode();
      try {
        if (qdrantMock) {
          const mockVectors = qdrant.mockCache || [];
          vectorCount = mockVectors.filter(v => v.eventId === eventId).length;
        } else if (qdrant.client) {
          await qdrant.init();
          const res = await qdrant.client.count('event_faces', {
            filter: { must: [{ key: 'event_id', match: { value: eventId } }] }
          });
          vectorCount = res ? res.count : 0;
        }
      } catch (qErr) {
        console.warn('Qdrant vector count failed during health check:', qErr.message);
      }

      return {
        registered: total,
        expected: photoIds.length || total,
        facesUnscanned,
        localUrlsFound: localUrls,
        dimensionsMissing,
        exifMissing,
        vectorCount,
        tabCounts: tabCounts.map(t => ({ tabName: t.tabName || 'Uncategorized', count: t._count._all })),
        qdrantMode: qdrantMock ? 'mock_fallback' : 'connected',
        qdrantWarning: qdrant.getMockWarning() || null
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Integrity check failed' });
    }
  });

  // Fetch distinct tab names for a gallery event
  fastify.get('/api/gallery/events/:id/tabs', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    try {
      const rows = await prisma.photo.findMany({
        where: { eventId, tabName: { not: null } },
        select: { tabName: true },
        distinct: ['tabName']
      });
      const tabs = rows.map(r => r.tabName).filter(Boolean);
      return { tabs };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch tabs' });
    }
  });

  // Fetch unscanned photos for an event
  fastify.get('/api/gallery/events/:id/photos/unscanned', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    try {
      const totalUnscanned = await prisma.photo.count({
        where: {
          eventId,
          facesScanned: false
        }
      });
      const photos = await prisma.photo.findMany({
        where: {
          eventId,
          facesScanned: false
        },
        select: {
          id: true,
          r2Url: true,
          filename: true
        },
        take: 100
      });
      return { totalUnscanned, photos };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch unscanned photos' });
    }
  });
};
