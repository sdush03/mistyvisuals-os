const fs = require('fs');
const path = require('path');
const { prisma } = require('../modules/quotation/prisma');
const qdrant = require('../utils/qdrant');

module.exports = async function galleryRoutes(fastify, opts) {
  const { pool, requireAdmin, requireAuth } = opts;

  // In-memory cache for guest anchor vectors and extra vectors from Option B.
  const guestAnchors = {}; // key: "email_eventId", value: { anchorVector: [...], extraVectors: [[...], ...] }

  const checkGuestSelfie = (guestId) => {
    const selfiePath = path.join(__dirname, '..', 'uploads', 'selfies', `guest_${guestId}.jpg`);
    return fs.existsSync(selfiePath);
  };

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

  // Get all wedding gallery events (Admin only)
  fastify.get('/api/gallery/events', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    try {
      const events = await prisma.galleryEvent.findMany({
        orderBy: { date: 'desc' }
      });

      // Fetch matching projects from pool to get their UUIDs and current slugs
      const leadIds = events.map(e => e.leadId).filter(Boolean);
      let projectsMap = {};
      if (leadIds.length > 0) {
        const projRes = await pool.query(
          `SELECT id, lead_id, slug, name FROM projects WHERE lead_id = ANY($1::int[])`,
          [leadIds]
        );
        projRes.rows.forEach(p => {
          projectsMap[p.lead_id] = {
            uuid: p.id,
            slug: p.slug,
            name: p.name
          };
        });
      }

      // Combine them
      const enrichedEvents = events.map(e => {
        const match = projectsMap[e.leadId] || {};
        return {
          ...e,
          projectUuid: match.uuid || null,
          crmSlug: match.slug || null,
          crmName: match.name || null
        };
      });

      return { events: enrichedEvents };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve gallery events' });
    }
  });

  // Get gallery event for a specific project (Admin only — looks up by project UUID, not slug)
  fastify.get('/api/gallery/events/by-project/:projectId', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const { projectId } = req.params;
    try {
      const event = await prisma.galleryEvent.findUnique({
        where: { projectId },
        select: {
          id: true,
          slug: true,
          projectId: true,
          title: true,
          date: true,
          coverPhotoUrl: true,
          coverPhotoMobileUrl: true,
          active: true,
          leadId: true,
          qrToken: true
        }
      });

      if (!event) {
        return reply.code(404).send({ error: 'Gallery not found for this project' });
      }

      return event;
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve gallery event' });
    }
  });

  // Get CRM project_events for a given gallery event slug (used by uploader desktop app)
  fastify.get('/api/gallery/events/:slug/project-events', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const { slug } = req.params;
    try {
      // Find the gallery event
      const galleryEvent = await prisma.galleryEvent.findUnique({ where: { slug } });
      if (!galleryEvent) {
        return reply.code(404).send({ error: 'Gallery event not found' });
      }

      // If the gallery has tabs saved, return those as virtual event objects
      if (galleryEvent.tabs && galleryEvent.tabs.length > 0) {
        return {
          projectEvents: galleryEvent.tabs.map((tab, idx) => ({
            id: idx + 1,
            event_type: tab,
            event_date: galleryEvent.date,
            venue: '—',
            slot: '—'
          }))
        };
      }

      // Fallback path: check CRM if no tabs are stored yet (legacy backfill fallback)
      if (!galleryEvent.leadId) {
        return { projectEvents: [] };
      }

      // Find the matching project by leadId
      const projRes = await pool.query(
        `SELECT id FROM projects WHERE lead_id = $1 LIMIT 1`,
        [galleryEvent.leadId]
      );

      if (!projRes.rows.length) {
        return { projectEvents: [] };
      }

      const projectId = projRes.rows[0].id;

      // Fetch project events
      const eventsRes = await pool.query(
        `SELECT id, event_type, event_date, venue, slot FROM project_events WHERE project_id = $1 ORDER BY event_date ASC, created_at ASC`,
        [projectId]
      );

      return { projectEvents: eventsRes.rows };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve project events' });
    }
  });

  // Create or return existing gallery event for a project (idempotent, keyed on projectId)
  // projectId (UUID) is the stable link — safe to call multiple times, never creates duplicates.
  fastify.post('/api/gallery/events', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const { slug, title, date, qrToken, coverPhotoUrl, leadId, projectId } = req.body;
    if (!slug || !title || !date) {
      return reply.code(400).send({ error: 'Missing required fields' });
    }

    // Deterministic qrToken: slug_qr (no random suffix — idempotent)
    const resolvedQrToken = qrToken || `${slug.toLowerCase().trim()}_qr`;

    try {
      // Helper to fetch initial tabs from CRM project_events table
      const fetchInitialTabs = async () => {
        let resolvedProjectId = projectId;
        if (!resolvedProjectId && leadId) {
          const projRes = await pool.query(
            `SELECT id FROM projects WHERE lead_id = $1 LIMIT 1`,
            [parseInt(leadId, 10)]
          );
          if (projRes.rows.length) {
            resolvedProjectId = projRes.rows[0].id;
          }
        }
        if (!resolvedProjectId) return [];
        const eventsRes = await pool.query(
          `SELECT event_type FROM project_events WHERE project_id = $1 ORDER BY event_date ASC, created_at ASC`,
          [resolvedProjectId]
        );
        return [...new Set(eventsRes.rows.map(e => e.event_type).filter(Boolean))];
      };

      const initialTabs = await fetchInitialTabs();
      // Always ensure "Highlights" is the first tab
      const tabsWithHighlights = ['Highlights', ...initialTabs.filter(t => t !== 'Highlights')];

      // If projectId is provided, use upsert on projectId — completely idempotent
      if (projectId) {
        const event = await prisma.galleryEvent.upsert({
          where: { projectId },
          update: {}, // Never overwrite an existing gallery's data on re-create
          create: {
            slug: slug.toLowerCase().trim(),
            projectId,
            title,
            date: new Date(date),
            qrToken: resolvedQrToken,
            coverPhotoUrl: coverPhotoUrl || null,
            leadId: leadId ? parseInt(leadId, 10) : null,
            active: true,
            tabs: tabsWithHighlights
          }
        });
        return event;
      }

      // Legacy path (no projectId): check slug uniqueness and create
      const existing = await prisma.galleryEvent.findFirst({
        where: { OR: [{ slug: slug.toLowerCase().trim() }, { qrToken: resolvedQrToken }] }
      });
      if (existing) {
        return existing; // Return existing instead of erroring — idempotent
      }

      const event = await prisma.galleryEvent.create({
        data: {
          slug: slug.toLowerCase().trim(),
          title,
          date: new Date(date),
          qrToken: resolvedQrToken,
          coverPhotoUrl: coverPhotoUrl || null,
          leadId: leadId ? parseInt(leadId, 10) : null,
          tabs: tabsWithHighlights
        }
      });

      return event;
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to create gallery event' });
    }
  });

  // Add a new tab/category to a gallery event
  fastify.post('/api/gallery/events/:id/tabs', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { tabName } = req.body;

    if (!tabName) {
      return reply.code(400).send({ error: 'Missing tabName' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
      if (!event) {
        return reply.code(404).send({ error: 'Gallery event not found' });
      }

      if (event.tabs.includes(tabName)) {
        return { success: true, message: 'Tab already exists' };
      }

      const updated = await prisma.galleryEvent.update({
        where: { id: eventId },
        data: {
          tabs: {
            push: tabName
          }
        }
      });
      return { success: true, tabs: updated.tabs };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to add tab' });
    }
  });

  // Rename a category/tab name in a gallery event
  fastify.patch('/api/gallery/events/:id/tabs/rename', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { oldName, newName } = req.body;

    if (!oldName || !newName) {
      return reply.code(400).send({ error: 'Missing oldName or newName' });
    }

    if (oldName === 'Highlights') {
      return reply.code(403).send({ error: 'The "Highlights" tab cannot be renamed.' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
      if (!event) {
        return reply.code(404).send({ error: 'Gallery event not found' });
      }

      // Update the tab name inside the tabs array
      const updatedTabs = event.tabs.map(tab => tab === oldName ? newName : tab);

      await prisma.$transaction([
        prisma.galleryEvent.update({
          where: { id: eventId },
          data: { tabs: updatedTabs }
        }),
        prisma.photo.updateMany({
          where: { eventId, tabName: oldName },
          data: { tabName: newName }
        })
      ]);

      return { success: true, tabs: updatedTabs };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to rename tab' });
    }
  });

  // Delete all photos belonging to a tab in a gallery event, and remove the tab from tabs list
  fastify.delete('/api/gallery/events/:id/tabs', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { tabName } = req.body;

    if (!tabName) {
      return reply.code(400).send({ error: 'Missing tabName' });
    }

    if (tabName === 'Highlights') {
      return reply.code(403).send({ error: 'The "Highlights" tab cannot be deleted.' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
      if (!event) {
        return reply.code(404).send({ error: 'Gallery event not found' });
      }

      // Remove the tab from the tabs array case-insensitively
      const updatedTabs = event.tabs.filter(tab => tab.toLowerCase() !== tabName.toLowerCase());

      const photosToDelete = await prisma.photo.findMany({
        where: {
          eventId,
          tabName: {
            equals: tabName,
            mode: 'insensitive'
          }
        }
      });

      const photoIds = photosToDelete.map(p => p.id);
      for (const photoId of photoIds) {
        await qdrant.deleteVectorsForPhoto(photoId);
      }

      const targetDir = path.join(__dirname, '..', 'uploads', 'photos');
      for (const p of photosToDelete) {
        if (p.filename) {
          const filePath = path.join(targetDir, p.filename);
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
          }

          // Delete grid thumbnail
          const thumbPath = path.join(targetDir, `thumb_${p.filename}`);
          if (fs.existsSync(thumbPath)) {
            try { fs.unlinkSync(thumbPath); } catch (e) {}
          }

          // Delete associated face crop thumbnails
          try {
            const files = fs.readdirSync(targetDir);
            const baseWithoutExt = path.parse(p.filename).name;
            for (const file of files) {
              if (file.startsWith('face-') && file.includes(baseWithoutExt)) {
                fs.unlinkSync(path.join(targetDir, file));
              }
            }
          } catch (e) {
            req.log.error(e);
          }
        }
      }

      await prisma.$transaction([
        prisma.galleryEvent.update({
          where: { id: eventId },
          data: { tabs: updatedTabs }
        }),
        prisma.photo.deleteMany({
          where: {
            eventId,
            tabName: {
              equals: tabName,
              mode: 'insensitive'
            }
          }
        })
      ]);

      return { success: true, tabs: updatedTabs };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to delete tab' });
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
      const photosToDelete = await prisma.photo.findMany({
        where: {
          id: { in: photoIds },
          eventId: eventId
        }
      });

      for (const p of photosToDelete) {
        // Delete from Qdrant
        await qdrant.deleteVectorsForPhoto(p.id);

        // Delete from disk
        if (p.filename) {
          const targetDir = path.join(__dirname, '..', 'uploads', 'photos');
          const filePath = path.join(targetDir, p.filename);
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
          }

          // Delete grid thumbnail
          const thumbPath = path.join(targetDir, `thumb_${p.filename}`);
          if (fs.existsSync(thumbPath)) {
            try { fs.unlinkSync(thumbPath); } catch (e) {}
          }

          // Delete associated face crop thumbnails
          try {
            const files = fs.readdirSync(targetDir);
            const baseWithoutExt = path.parse(p.filename).name;
            for (const file of files) {
              if (file.startsWith('face-') && file.includes(baseWithoutExt)) {
                fs.unlinkSync(path.join(targetDir, file));
              }
            }
          } catch (e) {
            req.log.error(e);
          }
        }
      }

      const deleted = await prisma.photo.deleteMany({
        where: {
          id: { in: photosToDelete.map(p => p.id) },
          eventId: eventId
        }
      });

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
      // First verify the targetTab exists on this event
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

  // Direct file upload endpoint (used by the desktop uploader app)
  fastify.post('/api/gallery/upload-photo-file', { bodyLimit: 50 * 1024 * 1024 }, async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const { filename, fileContent } = req.body;
    if (!filename || !fileContent) {
      return reply.code(400).send({ error: 'Missing filename or fileContent' });
    }

    try {
      const buffer = Buffer.from(fileContent, 'base64');
      const targetDir = path.join(__dirname, '..', 'uploads', 'photos');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const destPath = path.join(targetDir, filename);
      fs.writeFileSync(destPath, buffer);

      // Generate photographer-grade progressive thumbnail if not a face crop / temp file
      let thumbnailUrl = null;
      if (!filename.startsWith('face-') && !filename.startsWith('temp_') && !filename.startsWith('verify_')) {
        try {
          const sharp = require('sharp');
          const thumbFilename = `thumb_${filename}`;
          const thumbPath = path.join(targetDir, thumbFilename);
          await sharp(buffer)
            .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
            .withMetadata() // Preserves camera profile and sRGB mapping
            .jpeg({ quality: 85, progressive: true, mozjpeg: true })
            .toFile(thumbPath);
          thumbnailUrl = `/api/photos/file/${encodeURIComponent(thumbFilename)}`;
        } catch (thumbErr) {
          req.log.error(`Thumbnail generation failed for ${filename}: ${thumbErr.message}`);
        }
      }

      // Return public routing path (resolves locally for sandbox dev)
      const r2Url = `/api/photos/file/${encodeURIComponent(filename)}`;
      return { r2Url, thumbnailUrl };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to save uploaded file' });
    }
  });

  // Update gallery event details (title, date)
  fastify.patch('/api/gallery/events/:id', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { title, date } = req.body;

    try {
      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (date !== undefined) {
        updateData.date = date ? new Date(date) : null;
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

  // Upload and set cover photo (horizontal or vertical) for a gallery event
  fastify.post('/api/gallery/events/:id/covers', { bodyLimit: 50 * 1024 * 1024 }, async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { type, filename, fileContent } = req.body; // type is 'horizontal' or 'vertical'
    if (!type || !filename || !fileContent) {
      return reply.code(400).send({ error: 'Missing type, filename, or fileContent' });
    }

    try {
      const buffer = Buffer.from(fileContent, 'base64');
      const targetDir = path.join(__dirname, '..', 'uploads', 'photos');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      const newFilename = `cover_${eventId}_${type}_${Date.now()}_${filename}`;
      const destPath = path.join(targetDir, newFilename);
      fs.writeFileSync(destPath, buffer);

      const r2Url = `/api/photos/file/${encodeURIComponent(newFilename)}`;

      // Update the gallery event record
      const updateData = {};
      if (type === 'horizontal') {
        updateData.coverPhotoUrl = r2Url;
      } else {
        updateData.coverPhotoMobileUrl = r2Url;
      }

      const event = await prisma.galleryEvent.update({
        where: { id: eventId },
        data: updateData
      });

      return { success: true, url: r2Url, event };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to upload cover photo' });
    }
  });

  // Bulk upload photo metadata and face vectors
  fastify.post('/api/gallery/events/:id/photos/bulk', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const { photos } = req.body; // photos: [{ filename, r2Url, fileSize, tabName, exif, capturedAt, faces: [{ faceId, vector }] }]

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
        // Resolve photographer-grade grid thumbnail if exists on disk
        const hasThumbnail = fs.existsSync(path.join(__dirname, '..', 'uploads', 'photos', `thumb_${p.filename}`));
        const thumbnailUrl = hasThumbnail ? `/api/photos/file/thumb_${encodeURIComponent(p.filename)}` : null;

        // Create photo record in PostgreSQL with metadata details
        const photo = await prisma.photo.create({
          data: {
            eventId,
            r2Url: p.r2Url,
            thumbnailUrl,
            filename: p.filename,
            fileSize: p.fileSize,
            originalSize: p.originalSize || null,
            tabName: p.tabName || null,
            exif: p.exif || null,
            capturedAt: p.capturedAt ? new Date(p.capturedAt) : null
          }
        });

        // Insert vectors to Qdrant (or mock fallback)
        if (p.faces && p.faces.length > 0) {
          await qdrant.upsertVectors(eventId, photo.id, p.faces);
        }

        results.push(photo);
      }

      // Mark cluster cache as dirty — re-cluster will happen on next /people request
      await prisma.galleryEvent.update({
        where: { id: eventId },
        data: { clustersDirty: true }
      });

      return { status: 'success', count: results.length };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to upload photo metadata' });
    }
  });

  // Explicitly mark cluster cache as dirty (call this after a full upload batch is complete)
  fastify.post('/api/gallery/events/:id/finalize-upload', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    try {
      await prisma.galleryEvent.update({
        where: { id: eventId },
        data: { clustersDirty: true }
      });
      return { success: true, message: 'Upload finalized. Cluster cache marked for refresh.' };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to finalize upload' });
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
          coverPhotoMobileUrl: true,
          active: true,
          tabs: true
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
          id: true,
          r2Url: true,
          filename: true,
          originalSize: true,
          tabName: true
        }
      });

      // Filter out any photos whose tabName is not present in the event's tabs array (preventing orphan duplicates)
      const activeTabs = event.tabs || [];
      const activeTabsLower = activeTabs.map(t => t.toLowerCase());
      const filteredPhotos = photos.filter(p => {
        if (!p.tabName) return true; // Keep photos without tabName (fallback)
        return activeTabsLower.includes(p.tabName.toLowerCase());
      });

      return { photos: filteredPhotos };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve gallery photos' });
    }
  });

  // Get clustered people from the event photos (cache-first, only re-runs Python when dirty)
  fastify.get('/api/gallery/public/events/:slug/people', async (req, reply) => {
    const slug = req.params.slug.toLowerCase().trim();
    try {
      const event = await prisma.galleryEvent.findUnique({ where: { slug } });
      if (!event) return reply.code(404).send({ error: 'Event not found' });

      // --- CACHE HIT: serve stored result if cluster cache is fresh ---
      if (!event.clustersDirty && event.clustersCache) {
        return { people: event.clustersCache, fromCache: true };
      }

      // --- CACHE MISS: fetch vectors and re-cluster ---
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

      if (dbVectors.length === 0) {
        // Cache the empty result so we don't keep re-running for events with no faces
        await prisma.galleryEvent.update({
          where: { id: event.id },
          data: { clustersCache: [], clustersDirty: false }
        });
        return { people: [] };
      }

      const { execSync } = require('child_process');
      const scriptPath = path.join(__dirname, '..', 'utils', 'face_rec.py');

      // Write vectors to a temp file (in db/ which is ignored by nodemon)
      const tempDbJsonPath = path.join(__dirname, '..', 'db', `temp_db_cluster_${Date.now()}.json`);
      fs.writeFileSync(tempDbJsonPath, JSON.stringify(dbVectors), 'utf8');

      let output;
      try {
        // Run clustering
        output = execSync(`python3 "${scriptPath}" cluster "${tempDbJsonPath}"`).toString();
      } finally {
        // Cleanup temp file
        if (fs.existsSync(tempDbJsonPath)) {
          try {
            fs.unlinkSync(tempDbJsonPath);
          } catch (e) {
            req.log.error(e);
          }
        }
      }

      const res = JSON.parse(output);
      
      // Trigger background purge of orphaned face crop files
      purgeOrphanedFacesBackground(req.log);

      if (!res.clusters) {
        await prisma.galleryEvent.update({
          where: { id: event.id },
          data: { clustersCache: [], clustersDirty: false }
        });
        return { people: [] };
      }

      // Build people response from cluster results
      const people = [];
      for (const cluster of res.clusters) {
        const photosInCluster = await prisma.photo.findMany({
          where: { id: { in: cluster.photoIds } },
          select: { r2Url: true, filename: true }
        });

        if (photosInCluster.length > 0) {
          let coverPhotoUrl = photosInCluster[0].r2Url;
          if (cluster.faceIds && cluster.faceIds.length > 0) {
            const firstFaceId = cluster.faceIds[0];
            coverPhotoUrl = `/api/photos/file/${firstFaceId}.jpg`;
          }
          people.push({
            id: cluster.id,
            photoCount: cluster.photoCount,
            coverPhotoUrl,
            photos: photosInCluster
          });
        }
      }

      // Save to cache and mark clean
      await prisma.galleryEvent.update({
        where: { id: event.id },
        data: { clustersCache: people, clustersDirty: false }
      });

      return { people };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to cluster event faces' });
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

      // Enforce live validation for Google Auth
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
      } else {
        return reply.code(400).send({ error: 'Unsupported authentication provider' });
      }

      // Check if code matches the project passcode
      let isCodeValid = false;
      if (code) {
        let resolvedProjectId = event.projectId;
        if (!resolvedProjectId && event.leadId) {
          const projRes = await pool.query(
            `SELECT id FROM projects WHERE lead_id = $1 LIMIT 1`,
            [event.leadId]
          );
          if (projRes.rows.length) {
            resolvedProjectId = projRes.rows[0].id;
          }
        }
        if (resolvedProjectId) {
          const passRes = await pool.query(
            `SELECT passcode FROM projects WHERE id::text = $1 LIMIT 1`,
            [String(resolvedProjectId)]
          );
          if (passRes.rows.length) {
            const dbPasscode = passRes.rows[0].passcode;
            if (dbPasscode && code.trim().toLowerCase() === dbPasscode.trim().toLowerCase()) {
              isCodeValid = true;
            }
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
            providerId,
            hasFullAccess: isCodeValid
          }
        });
      } else {
        // If code is valid, upgrade access to true. If not, preserve whatever access they already have (never downgrade).
        if (isCodeValid && !guest.hasFullAccess) {
          guest = await prisma.guest.update({
            where: { id: guest.id },
            data: { hasFullAccess: true }
          });
        }
      }

      // Generate secure guest JWT session
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
          hasSelfie: checkGuestSelfie(guest.id)
        }
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Authentication failed' });
    }
  });

  // Upgrade guest session to Full Access by providing a valid passcode
  fastify.post('/api/gallery/public/events/:slug/upgrade', { preHandler: verifyGuestAuth }, async (req, reply) => {
    const slug = req.params.slug.toLowerCase().trim();
    const { code } = req.body;

    if (!code) {
      return reply.code(400).send({ error: 'Passcode is required' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({ where: { slug } });
      if (!event) return reply.code(404).send({ error: 'Event not found' });

      // Verify the passcode
      let resolvedProjectId = event.projectId;
      if (!resolvedProjectId && event.leadId) {
        const projRes = await pool.query(
          `SELECT id FROM projects WHERE lead_id = $1 LIMIT 1`,
          [event.leadId]
        );
        if (projRes.rows.length) {
          resolvedProjectId = projRes.rows[0].id;
        }
      }

      let isCodeValid = false;
      if (resolvedProjectId) {
        const passRes = await pool.query(
          `SELECT passcode FROM projects WHERE id::text = $1 LIMIT 1`,
          [String(resolvedProjectId)]
        );
        if (passRes.rows.length) {
          const dbPasscode = passRes.rows[0].passcode;
          if (dbPasscode && code.trim().toLowerCase() === dbPasscode.trim().toLowerCase()) {
            isCodeValid = true;
          }
        }
      }

      if (!isCodeValid) {
        return reply.code(400).send({ error: 'Invalid passcode' });
      }

      // Update the guest status in the database
      const guestId = req.user.guestId;
      const updatedGuest = await prisma.guest.update({
        where: { id: guestId },
        data: { hasFullAccess: true }
      });

      // Generate a new secure JWT session token with upgraded permissions
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

  // Store/update guest phone number (Mandatory, post-login collection)
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

  // Guest upload and save verification selfie permanently
  fastify.post('/api/gallery/public/events/:slug/selfie', { preHandler: verifyGuestAuth }, async (req, reply) => {
    const eventId = req.guest.eventId;
    const guestKey = `${req.guest.email}_${eventId}`;
    const guestId = req.guest.guestId;

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No image uploaded' });

    try {
      const buffer = await data.toBuffer();
      
      const selfiesDir = path.join(__dirname, '..', 'uploads', 'selfies');
      fs.mkdirSync(selfiesDir, { recursive: true });

      const selfiePath = path.join(selfiesDir, `guest_${guestId}.jpg`);
      const vectorPath = path.join(selfiesDir, `guest_${guestId}.json`);

      fs.writeFileSync(selfiePath, buffer);

      // Validate selfie face and extract vector
      try {
        const { execSync } = require('child_process');
        const scriptPath = path.join(__dirname, '..', 'utils', 'face_rec.py');
        const output = execSync(`python3 "${scriptPath}" validate "${selfiePath}"`).toString();
        const res = JSON.parse(output);

        if (res.success && res.vector) {
          fs.writeFileSync(vectorPath, JSON.stringify(res.vector), 'utf8');

          // Cache in memory
          guestAnchors[guestKey] = {
            anchorVector: res.vector,
            extraVectors: []
          };

          return { status: 'success' };
        } else {
          // Validation failed, clean up the saved image file
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

  // Get matched photos of the guest using their saved selfie vector
  fastify.get('/api/gallery/public/events/:slug/matched-photos', { preHandler: verifyGuestAuth }, async (req, reply) => {
    const eventId = req.guest.eventId;
    const guestKey = `${req.guest.email}_${eventId}`;
    const guestId = req.guest.guestId;

    try {
      const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
      if (!event) return reply.code(404).send({ error: 'Event not found' });

      const selfiePath = path.join(__dirname, '..', 'uploads', 'selfies', `guest_${guestId}.jpg`);
      const vectorPath = path.join(__dirname, '..', 'uploads', 'selfies', `guest_${guestId}.json`);

      if (!fs.existsSync(selfiePath)) {
        return { photos: [] }; // No selfie captured yet
      }

      // Check if we need to load anchor vector into memory
      if (!guestAnchors[guestKey] || !guestAnchors[guestKey].anchorVector) {
        if (fs.existsSync(vectorPath)) {
          const vector = JSON.parse(fs.readFileSync(vectorPath, 'utf8'));
          guestAnchors[guestKey] = {
            anchorVector: vector,
            extraVectors: []
          };
        } else {
          // Fallback: extract it if vector JSON is missing but image exists
          try {
            const { execSync } = require('child_process');
            const scriptPath = path.join(__dirname, '..', 'utils', 'face_rec.py');
            const output = execSync(`python3 "${scriptPath}" validate "${selfiePath}"`).toString();
            const res = JSON.parse(output);
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

      // Find all event photo IDs
      const validPhotos = await prisma.photo.findMany({
        where: { eventId },
        select: { id: true }
      });
      const validPhotoIds = new Set(validPhotos.map(p => p.id));

      let dbVectors = [];
      if (qdrant.isMock) {
        dbVectors = qdrant.mockCache
          .filter(item => item.eventId === eventId && validPhotoIds.has(item.photoId))
          .map(item => ({
            photoId: item.photoId,
            faceId: item.faceId,
            vector: item.vector
          }));
      }

      let photoIds = [];
      if (dbVectors.length > 0) {
        const { execSync } = require('child_process');
        const scriptPath = path.join(__dirname, '..', 'utils', 'face_rec.py');

        // Write temp dbJson
        const tempDbJsonPath = path.join(__dirname, '..', 'db', `temp_db_json_${Date.now()}.json`);
        fs.writeFileSync(tempDbJsonPath, JSON.stringify(dbVectors), 'utf8');

        // Write temp extraJson if extra vectors exist
        let tempExtraJsonPath = '';
        let command = `python3 "${scriptPath}" match "${selfiePath}" "${tempDbJsonPath}"`;
        if (extraVectors.length > 0) {
          tempExtraJsonPath = path.join(__dirname, '..', 'db', `temp_extra_json_${Date.now()}.json`);
          fs.writeFileSync(tempExtraJsonPath, JSON.stringify(extraVectors), 'utf8');
          command += ` "${tempExtraJsonPath}"`;
        }

        try {
          const output = execSync(command).toString();
          const res = JSON.parse(output);
          if (res.matches) {
            photoIds = res.matches.map(m => m.photoId);
          }
        } catch (matchErr) {
          req.log.error('Match execution failed for saved selfie:', matchErr.message);
        } finally {
          if (fs.existsSync(tempDbJsonPath)) fs.unlinkSync(tempDbJsonPath);
          if (tempExtraJsonPath && fs.existsSync(tempExtraJsonPath)) fs.unlinkSync(tempExtraJsonPath);
        }
      }

      // Fallback for dev mode
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
          r2Url: true,
          filename: true
        }
      });

      return { photos };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch matched photos' });
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

      let tempDbJsonPath = '';
      let tempExtraJsonPath = '';
      let photoIds = [];

      try {
        const { execSync } = require('child_process');
        const scriptPath = path.join(__dirname, '..', 'utils', 'face_rec.py');

        // Fetch pre-extracted face vectors for this event
        const validPhotos = await prisma.photo.findMany({
          where: { eventId },
          select: { id: true }
        });
        const validPhotoIds = new Set(validPhotos.map(p => p.id));

        let dbVectors = [];
        if (qdrant.isMock) {
          dbVectors = qdrant.mockCache
            .filter(item => item.eventId === eventId && validPhotoIds.has(item.photoId))
            .map(item => ({
              photoId: item.photoId,
              faceId: item.faceId,
              vector: item.vector
            }));
        }

        if (dbVectors.length > 0) {
          // Write dbJson to a temp file to avoid command argument limit errors
          tempDbJsonPath = path.join(__dirname, '..', 'db', `temp_db_json_${Date.now()}.json`);
          fs.writeFileSync(tempDbJsonPath, JSON.stringify(dbVectors), 'utf8');

          // Fetch extra vectors for query matching if present
          const extraVectors = guestAnchors[guestKey] ? guestAnchors[guestKey].extraVectors : [];
          let command = `python3 "${scriptPath}" match "${tempSelfiePath}" "${tempDbJsonPath}"`;
          
          if (extraVectors && extraVectors.length > 0) {
            tempExtraJsonPath = path.join(__dirname, '..', 'db', `temp_extra_json_${Date.now()}.json`);
            fs.writeFileSync(tempExtraJsonPath, JSON.stringify(extraVectors), 'utf8');
            command += ` "${tempExtraJsonPath}"`;
          }

          const output = execSync(command).toString();
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
        // Cleanup all temp files
        if (tempDbJsonPath && fs.existsSync(tempDbJsonPath)) {
          try { fs.unlinkSync(tempDbJsonPath); } catch (e) {}
        }
        if (tempExtraJsonPath && fs.existsSync(tempExtraJsonPath)) {
          try { fs.unlinkSync(tempExtraJsonPath); } catch (e) {}
        }
        if (fs.existsSync(tempSelfiePath)) {
          try { fs.unlinkSync(tempSelfiePath); } catch (e) {}
        }
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

function purgeOrphanedFacesBackground(log) {
  setTimeout(() => {
    try {
      const qdrant = require('../utils/qdrant');
      const targetDir = path.join(__dirname, '..', 'uploads', 'photos');
      if (!fs.existsSync(targetDir)) return;

      const activeFaceIds = new Set();
      if (qdrant.isMock) {
        qdrant.mockCache.forEach(item => {
          if (item.faceId) activeFaceIds.add(item.faceId);
        });
      }

      const files = fs.readdirSync(targetDir);
      let purged = 0;
      for (const file of files) {
        if (file.startsWith('face-')) {
          let faceId = path.parse(file).name;
          if (faceId.endsWith('.jpg')) {
            faceId = faceId.slice(0, -4);
          }
          if (!activeFaceIds.has(faceId)) {
            const filepath = path.join(targetDir, file);
            try {
              fs.unlinkSync(filepath);
              purged++;
            } catch (e) {}
          }
        }
      }
      if (purged > 0) {
        log.info(`Background garbage collector purged ${purged} orphaned face files.`);
      }
    } catch (e) {
      log.error('Failed to run background faces purge:', e);
    }
  }, 100);
}
