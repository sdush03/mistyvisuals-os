const { prisma } = require('../../modules/quotation/prisma');
const qdrant = require('../../utils/qdrant');
const { deletePhotosAssets } = require('./helpers');

module.exports = async function registerEventRoutes(fastify, opts) {
  const { pool, requireAdmin } = opts;

  // Get all wedding gallery events (Admin only)
  fastify.get('/api/gallery/events', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    try {
      const events = await prisma.galleryEvent.findMany({
        orderBy: { date: 'desc' }
      });

      const leadIds = events.map(e => e.leadId).filter(Boolean);
      const projectIds = events.map(e => e.projectId).filter(Boolean);
      let projectsMap = {};
      if (leadIds.length > 0 || projectIds.length > 0) {
        const projRes = await pool.query(
          `SELECT id, lead_id, slug, name, passcode, partial_passcode FROM projects WHERE lead_id = ANY($1::int[]) OR id::text = ANY($2::text[])`,
          [leadIds, projectIds]
        );
        projRes.rows.forEach(p => {
          const item = {
            uuid: p.id,
            slug: p.slug,
            name: p.name,
            passcode: p.passcode,
            partial_passcode: p.partial_passcode
          };
          if (p.lead_id) {
            projectsMap[`lead_${p.lead_id}`] = item;
          }
          projectsMap[`id_${p.id}`] = item;
        });
      }

      const enrichedEvents = events.map(e => {
        const match = (e.leadId ? projectsMap[`lead_${e.leadId}`] : null) || (e.projectId ? projectsMap[`id_${e.projectId}`] : null) || {};
        return {
          ...e,
          projectUuid: match.uuid || null,
          crmSlug: match.slug || null,
          crmName: match.name || null,
          passcode: match.passcode || null,
          partial_passcode: match.partial_passcode || null
        };
      });

      return { events: enrichedEvents };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve gallery events' });
    }
  });

  // Storage health endpoint
  fastify.get('/api/gallery/health', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const qdrantMock = qdrant.isMockMode();
    const mockWarning = qdrant.getMockWarning();
    const status = qdrantMock ? 'degraded' : 'ok';

    return reply.code(200).send({
      status,
      storage: {
        qdrant: qdrantMock ? 'mock_fallback' : 'connected',
        warning: mockWarning || null
      },
      timestamp: new Date().toISOString()
    });
  });

  // Get gallery events for a specific project
  fastify.get('/api/gallery/events/by-project/:projectId', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const { projectId } = req.params;
    try {
      const events = await prisma.galleryEvent.findMany({
        where: { projectId },
        select: {
          id: true,
          slug: true,
          projectId: true,
          title: true,
          date: true,
          coverPhotoUrl: true,
          coverPhotoMobileUrl: true,
          coverPhotoSquareUrl: true,
          active: true,
          leadId: true,
          qrToken: true
        }
      });

      return events;
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve gallery events' });
    }
  });

  // Get CRM project_events for a given gallery event slug
  fastify.get('/api/gallery/events/:slug/project-events', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const { slug } = req.params;
    try {
      const galleryEvent = await prisma.galleryEvent.findUnique({ where: { slug } });
      if (!galleryEvent) {
        return reply.code(404).send({ error: 'Gallery event not found' });
      }

      let crmEvents = [];
      if (galleryEvent.leadId) {
        const projRes = await pool.query(
          `SELECT id FROM projects WHERE lead_id = $1 LIMIT 1`,
          [galleryEvent.leadId]
        );
        if (projRes.rows.length > 0) {
          const eventsRes = await pool.query(
            `SELECT event_type FROM project_events WHERE project_id = $1 ORDER BY event_date ASC, created_at ASC`,
            [projRes.rows[0].id]
          );
          crmEvents = [...new Set(eventsRes.rows.map(e => e.event_type).filter(Boolean))];
        }
      }

      let mergedTabs = galleryEvent.tabs || [];
      if (mergedTabs.length <= 1) {
        mergedTabs = ['Highlights', ...crmEvents.filter(e => e !== 'Highlights')];
        await prisma.galleryEvent.update({
          where: { id: galleryEvent.id },
          data: { tabs: mergedTabs }
        });
      }

      return {
        projectEvents: mergedTabs.map((tab, idx) => ({
          id: idx + 1,
          event_type: tab,
          event_date: galleryEvent.date,
          venue: '—',
          slot: '—'
        }))
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve project events' });
    }
  });

  // Create a new gallery event
  fastify.post('/api/gallery/events', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const { slug, title, date, qrToken, coverPhotoUrl, leadId, projectId } = req.body;
    if (!slug || !title || !date) {
      return reply.code(400).send({ error: 'Missing required fields' });
    }

    const normalizedSlug = slug.toLowerCase().trim();
    const resolvedQrToken = qrToken || `${normalizedSlug}_qr`;

    try {
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
      const tabsWithHighlights = ['Highlights', ...initialTabs.filter(t => t !== 'Highlights')];

      const existing = await prisma.galleryEvent.findFirst({
        where: {
          OR: [
            { slug: normalizedSlug },
            { qrToken: resolvedQrToken }
          ]
        }
      });

      if (existing) {
        return reply.code(400).send({ error: 'Slug or QR Token is already taken by another gallery.' });
      }
      const bulkDownloadPin = String(Math.floor(100000 + Math.random() * 900000));

      const event = await prisma.galleryEvent.create({
        data: {
          slug: normalizedSlug,
          projectId: projectId || null,
          title,
          date: new Date(date),
          qrToken: resolvedQrToken,
          coverPhotoUrl: coverPhotoUrl || null,
          leadId: leadId ? parseInt(leadId, 10) : null,
          active: true,
          tabs: tabsWithHighlights,
          bulkDownloadPin
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

      const slug = event.slug.toLowerCase().trim();

      await prisma.$transaction([
        prisma.galleryEvent.update({
          where: { id: eventId },
          data: {
            tabs: updatedTabs,
            clustersDirty: true
          }
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

      if (slug) {
        deletePhotosAssets(photosToDelete, slug, req.log).catch((err) => {
          req.log.error(`[deletePhotosAssets] Non-blocking cleanup error:`, err);
        });
      }

      return { success: true, tabs: updatedTabs };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to delete tab' });
    }
  });

  // Get summary of guest likes for a specific event (Admin only)
  fastify.get('/api/gallery/events/:id/likes-summary', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    if (isNaN(eventId)) {
      return reply.code(400).send({ error: 'Invalid event ID' });
    }

    try {
      // Find all guests for this event
      const guests = await prisma.guest.findMany({
        where: { eventId },
        include: {
          likes: {
            include: {
              photo: {
                select: {
                  id: true,
                  r2Url: true,
                  filename: true,
                  fileSize: true,
                  tabName: true
                }
              }
            }
          }
        }
      });

      const summary = guests.map(guest => ({
        id: guest.id,
        name: guest.name,
        email: guest.email,
        phoneNumber: guest.phoneNumber,
        hasFullAccess: guest.hasFullAccess,
        likesCount: guest.likes.filter(like => like.photo).length,
        likedPhotos: guest.likes.filter(like => like.photo).map(like => ({
          id: like.photo.id,
          r2Url: like.photo.r2Url,
          filename: like.photo.filename,
          fileSize: like.photo.fileSize,
          tabName: like.photo.tabName
        }))
      }));

      // Sort by likesCount desc to show active guests first
      summary.sort((a, b) => b.likesCount - a.likesCount);

      return { guests: summary };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve likes summary' });
    }
  });

  // Get gallery analytics (Admin only)
  fastify.get('/api/gallery/events/:id/analytics', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    if (isNaN(eventId)) {
      return reply.code(400).send({ error: 'Invalid event ID' });
    }

    try {
      const totalPhotos = await prisma.photo.count({ where: { eventId } });
      const discoveredCount = await prisma.photo.count({ where: { eventId, discovered: true } });

      const aggregates = await prisma.guest.aggregate({
        where: { eventId },
        _sum: {
          impressions: true,
          downloadCount: true
        },
        _count: {
          id: true
        }
      });

      const totalImpressions = aggregates._sum.impressions || 0;
      const totalDownloads = aggregates._sum.downloadCount || 0;
      const registeredUsers = aggregates._count.id || 0;

      const guests = await prisma.guest.findMany({
        where: { eventId },
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          impressions: true,
          matchCount: true,
          downloadCount: true
        },
        orderBy: { impressions: 'desc' }
      });

      return {
        summary: {
          totalImpressions,
          photosDiscovered: `${discoveredCount}/${totalPhotos}`,
          photosDownloaded: totalDownloads,
          registeredUsers
        },
        guests
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve analytics' });
    }
  });

  // Download a participant's likes as a ZIP folder of images (Admin only)
  fastify.get('/api/gallery/events/:id/guests/:guestId/download-likes', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const guestId = parseInt(req.params.guestId, 10);

    if (isNaN(eventId) || isNaN(guestId)) {
      return reply.code(400).send({ error: 'Invalid event or guest ID' });
    }

    try {
      const guest = await prisma.guest.findFirst({
        where: { id: guestId, eventId }
      });

      if (!guest) {
        return reply.code(404).send({ error: 'Guest not found' });
      }

      // Fetch the guest's likes with photos
      const likes = await prisma.photoLike.findMany({
        where: { guestId },
        include: {
          photo: true
        }
      });

      // Filter out likes on deleted photos
      const validLikes = likes.filter(like => like.photo);

      if (validLikes.length === 0) {
        return reply.code(400).send({ error: 'No liked photos found for this guest' });
      }

      const archiver = require('archiver');
      const path = require('path');
      const { getObjectStream } = require('../../utils/r2');

      const guestSlug = (guest.name || guest.email.split('@')[0]).replace(/[^a-zA-Z0-9]/g, '_');
      
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="favorites_${guestSlug}.zip"`);

      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      // Finalize the archive after streaming starts
      (async () => {
        try {
          for (const like of validLikes) {
            const photo = like.photo;
            let key = '';
            try {
              const parsed = new URL(photo.r2Url);
              key = decodeURIComponent(parsed.pathname.substring(1));
            } catch (e) {
              key = decodeURIComponent(photo.r2Url.replace(/^\/?api\/photos\/file\//, ''));
            }

            if (key) {
              try {
                const fileStream = await getObjectStream(key);
                const folderName = photo.tabName ? `${photo.tabName}/` : 'General/';
                archive.append(fileStream, { name: `${folderName}${photo.filename || path.basename(key)}` });
              } catch (err) {
                req.log.error(`Failed to append file ${key} to download-likes zip:`, err);
              }
            }
          }
          await archive.finalize();
        } catch (archiveErr) {
          req.log.error('Error during download-likes archive generation:', archiveErr);
          archive.destroy(archiveErr);
        }
      })();

      reply.send(archive);
      return reply;
    } catch (err) {
      req.log.error(err);
      reply.header('Content-Type', 'application/json');
      return reply.code(500).send({ error: 'Failed to generate download likes ZIP archive' });
    }
  });
};
