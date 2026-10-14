// Trigger backend redeploy to apply migrations and backfill in OS
const { prisma } = require('../../modules/quotation/prisma');
const qdrant = require('../../utils/qdrant');
const { deletePhotosAssets, canEditGallery } = require('./helpers');

module.exports = async function registerEventRoutes(fastify, opts) {
  const { pool, requireAdmin, requireAuth, getAuthFromRequest } = opts;

  // Helper to generate a unique 6-character alphanumeric code
  async function generateUniqueCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    while (true) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await prisma.galleryEvent.findFirst({
        where: {
          OR: [
            { fullCode: code },
            { partialCode: code }
          ]
        }
      });
      if (!existing) return code;
    }
  }

  // Get all wedding gallery events (Accessible to all authenticated users; can_edit indicates write permission)
  fastify.get('/api/gallery/events', async (req, reply) => {
    const auth = requireAuth(req, reply);
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
          `SELECT p.id, p.lead_id, p.slug, p.name, p.project_manager_id,
                  l.assigned_user_id,
                  COALESCE(u.name, pm.name) AS assigned_user_name
           FROM projects p
           LEFT JOIN leads l ON l.id = p.lead_id
           LEFT JOIN users u ON u.id = l.assigned_user_id
           LEFT JOIN users pm ON pm.id = p.project_manager_id
           WHERE p.lead_id = ANY($1::int[]) OR p.id::text = ANY($2::text[]) OR p.slug = ANY($2::text[])`,
          [leadIds, projectIds]
        );
        projRes.rows.forEach(p => {
          const item = {
            uuid: p.id,
            slug: p.slug,
            name: p.name,
            lead_id: p.lead_id,
            project_manager_id: p.project_manager_id,
            assigned_user_id: p.assigned_user_id,
            assigned_user_name: p.assigned_user_name
          };
          if (p.lead_id) {
            projectsMap[`lead_${p.lead_id}`] = item;
          }
          projectsMap[`id_${p.id}`] = item;
          if (p.slug) {
            projectsMap[`slug_${p.slug}`] = item;
          }
        });
      }

      const unmappedLeadIds = leadIds.filter(lid => !projectsMap[`lead_${lid}`]);
      let leadsMap = {};
      if (unmappedLeadIds.length > 0) {
        const leadRes = await pool.query(
          `SELECT l.id, l.assigned_user_id, u.name AS assigned_user_name
           FROM leads l
           LEFT JOIN users u ON u.id = l.assigned_user_id
           WHERE l.id = ANY($1::int[])`,
          [unmappedLeadIds]
        );
        leadRes.rows.forEach(l => {
          leadsMap[`lead_${l.id}`] = {
            assigned_user_id: l.assigned_user_id,
            assigned_user_name: l.assigned_user_name
          };
        });
      }

      const isAdmin = Array.isArray(auth.roles) ? auth.roles.includes('admin') : auth.role === 'admin';

      const enrichedEvents = events.map(e => {
        const match = (e.leadId ? projectsMap[`lead_${e.leadId}`] : null) || 
                      (e.projectId ? (projectsMap[`id_${e.projectId}`] || projectsMap[`slug_${e.projectId}`]) : null) || {};
        const leadMatch = e.leadId ? leadsMap[`lead_${e.leadId}`] : null;

        const assignedUserId = match.assigned_user_id || leadMatch?.assigned_user_id || match.project_manager_id || null;
        const assignedUserName = match.assigned_user_name || leadMatch?.assigned_user_name || null;
        const canEdit = isAdmin || (!!auth.sub && (auth.sub === assignedUserId || auth.sub === match.project_manager_id));

        return {
          ...e,
          projectUuid: match.uuid || null,
          crmSlug: match.slug || null,
          crmName: match.name || null,
          passcode: e.fullCode || null,
          partial_passcode: e.partialCode || null,
          can_edit: canEdit,
          canEdit: canEdit,
          assigned_user_id: assignedUserId,
          assigned_user_name: assignedUserName
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
    const auth = requireAuth(req, reply);
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
    const auth = requireAuth(req, reply);
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
          qrToken: true,
          fullCode: true,
          partialCode: true
        }
      });

      const isAdmin = Array.isArray(auth.roles) ? auth.roles.includes('admin') : auth.role === 'admin';
      let isProjectAssigned = false;
      if (!isAdmin && auth.sub) {
        const projRes = await pool.query(
          `SELECT l.assigned_user_id, p.project_manager_id 
           FROM projects p 
           LEFT JOIN leads l ON l.id = p.lead_id 
           WHERE p.id::text = $1 OR p.slug = $1`,
          [projectId]
        );
        if (projRes.rows.length > 0) {
          const row = projRes.rows[0];
          if (row.assigned_user_id === auth.sub || row.project_manager_id === auth.sub) {
            isProjectAssigned = true;
          }
        }
      }
      const canEdit = isAdmin || isProjectAssigned;

      const mappedEvents = events.map(e => ({
        ...e,
        passcode: e.fullCode || null,
        partial_passcode: e.partialCode || null,
        can_edit: canEdit,
        canEdit: canEdit
      }));

      return mappedEvents;
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve gallery events' });
    }
  });

  // Get CRM project_events for a given gallery event slug
  fastify.get('/api/gallery/events/:slug/project-events', async (req, reply) => {
    const auth = requireAuth(req, reply);
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
      if (!mergedTabs.includes('Cinema') || !mergedTabs.includes('Highlights')) {
        const others = mergedTabs.filter(e => e !== 'Highlights' && e !== 'Cinema');
        mergedTabs = ['Highlights', 'Cinema', ...others];
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
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const { slug, title, date, qrToken, coverPhotoUrl, leadId, projectId } = req.body;
    if (!slug || !title || !date) {
      return reply.code(400).send({ error: 'Missing required fields' });
    }

    const isAdmin = Array.isArray(auth.roles) ? auth.roles.includes('admin') : auth.role === 'admin';
    if (!isAdmin) {
      if (!leadId && !projectId) {
        return reply.code(403).send({ error: 'Access denied: You must link the gallery to a project or lead assigned to you.' });
      }
      let hasAccess = false;
      if (leadId) {
        const leadRes = await pool.query(
          `SELECT assigned_user_id FROM leads WHERE id = $1`,
          [parseInt(leadId, 10)]
        );
        if (leadRes.rows.length > 0 && leadRes.rows[0].assigned_user_id === auth.sub) {
          hasAccess = true;
        }
      }
      if (!hasAccess && projectId) {
        const projRes = await pool.query(
          `SELECT l.assigned_user_id, p.project_manager_id 
           FROM projects p 
           LEFT JOIN leads l ON l.id = p.lead_id 
           WHERE p.id::text = $1 OR p.slug = $1`,
          [projectId]
        );
        if (projRes.rows.length > 0) {
          const row = projRes.rows[0];
          if (row.assigned_user_id === auth.sub || row.project_manager_id === auth.sub) {
            hasAccess = true;
          }
        }
      }
      if (!hasAccess) {
        return reply.code(403).send({ error: 'Access denied: You can only create galleries for projects or leads assigned to you.' });
      }
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
      const tabsWithHighlights = ['Highlights', 'Cinema', ...initialTabs.filter(t => t !== 'Highlights' && t !== 'Cinema')];

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
      const fullCode = await generateUniqueCode();
      let partialCode = null;
      while (true) {
        const candidate = await generateUniqueCode();
        if (candidate !== fullCode) {
          partialCode = candidate;
          break;
        }
      }

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
          bulkDownloadPin,
          fullCode,
          partialCode
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
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

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
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const eventId = parseInt(req.params.id, 10);
    const { oldName, newName } = req.body;

    if (!oldName || !newName) {
      return reply.code(400).send({ error: 'Missing oldName or newName' });
    }

    if (oldName === 'Highlights' || oldName === 'Cinema') {
      return reply.code(403).send({ error: `The "${oldName}" tab cannot be renamed.` });
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
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const eventId = parseInt(req.params.id, 10);
    const { tabName } = req.body;

    if (!tabName) {
      return reply.code(400).send({ error: 'Missing tabName' });
    }

    if (tabName === 'Highlights' || tabName === 'Cinema') {
      return reply.code(403).send({ error: `The "${tabName}" tab cannot be deleted.` });
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

      if (slug && photosToDelete.length > 0) {
        await deletePhotosAssets(photosToDelete, slug, req.log).catch((err) => {
          req.log.error(`[deletePhotosAssets] Cleanup error during tab deletion:`, err);
        });
      }

      return { success: true, tabs: updatedTabs };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to delete tab' });
    }
  });

  // Reorder tabs/folders in a gallery event
  fastify.post('/api/gallery/events/:id/tabs/reorder', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const eventId = parseInt(req.params.id, 10);
    if (isNaN(eventId)) {
      return reply.code(400).send({ error: 'Invalid event ID' });
    }

    const { tabs } = req.body;
    if (!Array.isArray(tabs)) {
      return reply.code(400).send({ error: 'Missing or invalid tabs array' });
    }

    try {
      const sanitizedTabs = ['Highlights', 'Cinema', ...tabs.filter(t => t !== 'Highlights' && t !== 'Cinema')];
      const updated = await prisma.galleryEvent.update({
        where: { id: eventId },
        data: { tabs: sanitizedTabs }
      });
      return { success: true, tabs: updated.tabs };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to reorder tabs' });
    }
  });

  // Get summary of guest likes for a specific event
  fastify.get('/api/gallery/events/:id/likes-summary', async (req, reply) => {
    const auth = requireAuth(req, reply);
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

      // Fetch status via raw SQL — Prisma client may not have this field yet
      const statusRows = await prisma.$queryRaw`SELECT id, status FROM guests WHERE event_id = ${eventId}`;
      const statusMap = new Map(statusRows.map(r => [r.id, r.status]));

      const fs = require('fs');
      const path = require('path');

      const summary = await Promise.all(guests.map(async guest => {
        const osSelfiesDir = path.join(__dirname, '..', '..', 'uploads', 'photos', 'selfies');
        const mycircleSelfiesDir = path.join(__dirname, '..', '..', '..', '..', 'mistyvisuals-mycircle', 'backend', 'uploads', 'photos', 'selfies');

        const fileExists = (filename) => {
          return fs.existsSync(path.join(osSelfiesDir, filename)) || fs.existsSync(path.join(mycircleSelfiesDir, filename));
        };

        let hasSelfie = !!(guest.selfieUrl);

        if (!hasSelfie) {
          hasSelfie = fileExists(`guest_${guest.id}.jpg`);
        }

        if (!hasSelfie && guest.email) {
          try {
            const linkedUsers = await prisma.$queryRawUnsafe('SELECT id, selfie_url FROM circle_users WHERE email = $1 LIMIT 1', guest.email);
            if (linkedUsers && linkedUsers.length > 0) {
              const u = linkedUsers[0];
              if (u.selfie_url || fileExists(`user_${u.id}.jpg`) || fileExists(`guest_${u.id}.jpg`)) {
                hasSelfie = true;
              }
            }
          } catch (e) {
            // circle_users table may not exist/be initialized in clean db, ignore
          }
        }

        return {
          id: guest.id,
          name: guest.name,
          email: guest.email,
          phoneNumber: guest.phoneNumber,
          hasFullAccess: guest.hasFullAccess,
          isBlocked: guest.isBlocked,
          displayRole: guest.displayRole,
          status: statusMap.get(guest.id) || guest.status || 'ACTIVE',
          hasSelfie,
          likesCount: guest.likes.filter(like => like.photo).length,
          likedPhotos: guest.likes.filter(like => like.photo).map(like => ({
            id: like.photo.id,
            r2Url: like.photo.r2Url,
            filename: like.photo.filename,
            fileSize: like.photo.fileSize,
            tabName: like.photo.tabName
          }))
        };
      }));

      // Sort by likesCount desc to show active guests first
      summary.sort((a, b) => b.likesCount - a.likesCount);

      return { guests: summary };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve likes summary' });
    }
  });

  // Get gallery analytics
  fastify.get('/api/gallery/events/:id/analytics', async (req, reply) => {
    const auth = requireAuth(req, reply);
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
          provider: true,
          impressions: true,
          matchCount: true,
          downloadCount: true,
          displayRole: true,
          circleUser: {
            select: {
              id: true,
              email: true,
              selfieUrl: true
            }
          }
        },
        orderBy: { impressions: 'desc' }
      });

      // Query video analytics events for this event (ordered chronologically)
      const videoEvents = await prisma.galleryAnalyticsEvent.findMany({
        where: { eventId, eventType: 'VIDEO_PLAYBACK' },
        select: {
          id: true,
          mediaId: true,
          mediaUrl: true,
          action: true,
          source: true,
          watchTimeSeconds: true,
          totalDurationSeconds: true,
          completionRatio: true,
          guestEmail: true,
          guestName: true,
          createdAt: true
        },
        orderBy: { createdAt: 'asc' }
      });

      const guestEmails = guests.map(g => g.email?.toLowerCase()?.trim()).filter(Boolean);
      const guestIds = guests.map(g => g.id).filter(Boolean);
      const circleUserIds = guests.map(g => g.circleUser?.id).filter(Boolean);
      const circleUserEmails = guests.map(g => g.circleUser?.email?.toLowerCase()?.trim()).filter(Boolean);
      const allLookupEmails = Array.from(new Set([...guestEmails, ...circleUserEmails]));

      // Fetch push tokens to identify iOS/Android mobile app users (even if notifications are toggled off)
      const pushTokens = (allLookupEmails.length > 0 || guestIds.length > 0 || circleUserIds.length > 0)
        ? await prisma.userPushToken.findMany({
            where: {
              OR: [
                ...(allLookupEmails.length > 0 ? [{ email: { in: allLookupEmails, mode: 'insensitive' } }] : []),
                ...(guestIds.length > 0 ? [{ guestId: { in: guestIds } }] : []),
                ...(circleUserIds.length > 0 ? [{ userId: { in: circleUserIds } }] : [])
              ]
            },
            select: {
              userId: true,
              guestId: true,
              email: true,
              platform: true
            }
          }).catch(() => [])
        : [];

      // Fetch distinct telemetry sources per guest to classify App vs Web interaction
      const platformSources = await prisma.galleryAnalyticsEvent.groupBy({
        by: ['guestEmail', 'source'],
        where: { eventId, guestEmail: { not: null } }
      }).catch(() => []);

      const platformSourcesById = await prisma.galleryAnalyticsEvent.groupBy({
        by: ['guestId', 'source'],
        where: { eventId, guestId: { not: null } }
      }).catch(() => []);

      const pushTokenMap = new Map();
      pushTokens.forEach(pt => {
        const normEmail = pt.email?.toLowerCase()?.trim();
        const platform = (pt.platform || 'app').toLowerCase();
        if (normEmail) {
          if (!pushTokenMap.has(normEmail)) pushTokenMap.set(normEmail, new Set());
          pushTokenMap.get(normEmail).add(platform);
        }
        if (pt.guestId) {
          const gKey = `id_${pt.guestId}`;
          if (!pushTokenMap.has(gKey)) pushTokenMap.set(gKey, new Set());
          pushTokenMap.get(gKey).add(platform);
        }
        if (pt.userId) {
          const uKey = `user_${pt.userId}`;
          if (!pushTokenMap.has(uKey)) pushTokenMap.set(uKey, new Set());
          pushTokenMap.get(uKey).add(platform);
        }
      });

      const guestSourcesMap = new Map();
      const addGuestSource = (key, src) => {
        if (!key || !src) return;
        const normKey = String(key).toLowerCase().trim();
        if (!guestSourcesMap.has(normKey)) guestSourcesMap.set(normKey, new Set());
        guestSourcesMap.get(normKey).add(String(src).toUpperCase());
      };

      platformSources.forEach(ps => addGuestSource(ps.guestEmail, ps.source));
      platformSourcesById.forEach(ps => addGuestSource(`id_${ps.guestId}`, ps.source));

      const guestPlatformMap = new Map();
      guests.forEach(g => {
        const gEmail = g.email?.toLowerCase()?.trim();
        const gIdKey = `id_${g.id}`;
        const uKey = g.circleUser?.id ? `user_${g.circleUser.id}` : null;
        const cuEmail = g.circleUser?.email?.toLowerCase()?.trim();

        const userTokens = new Set([
          ...(gEmail ? pushTokenMap.get(gEmail) || [] : []),
          ...(cuEmail ? pushTokenMap.get(cuEmail) || [] : []),
          ...(pushTokenMap.get(gIdKey) || []),
          ...(uKey ? pushTokenMap.get(uKey) || [] : [])
        ]);
        const hasPushToken = userTokens.size > 0;

        const allSources = new Set([
          ...(gEmail ? guestSourcesMap.get(gEmail) || [] : []),
          ...(cuEmail ? guestSourcesMap.get(cuEmail) || [] : []),
          ...(guestSourcesMap.get(gIdKey) || [])
        ]);

        let hasAppEvent = false;
        let hasWebEvent = false;
        allSources.forEach(src => {
          if (src.startsWith('WEB') || src.startsWith('DESKTOP') || src.startsWith('PORTAL')) {
            hasWebEvent = true;
          } else {
            hasAppEvent = true;
          }
        });

        const hasAppFootprint = hasPushToken || g.provider === 'app' || hasAppEvent;
        const isWeb = hasWebEvent;
        const isApp = hasAppFootprint || !hasWebEvent;

        let platform = 'WEB';
        let platformLabel = 'Web Browser';
        let platformIcon = '🌐';
        let platformOS = 'web';

        if (isApp && isWeb) {
          platform = 'BOTH';
          platformLabel = userTokens.has('ios') ? 'iOS App & Web' : (userTokens.has('android') ? 'Android App & Web' : 'App & Web');
          platformIcon = '📱+🌐';
          platformOS = 'both';
        } else if (isApp) {
          platform = 'APP';
          if (userTokens.has('ios')) {
            platformLabel = 'iOS App';
            platformOS = 'ios';
          } else if (userTokens.has('android')) {
            platformLabel = 'Android App';
            platformOS = 'android';
          } else {
            platformLabel = 'Mobile App';
            platformOS = 'app';
          }
          platformIcon = '📱';
        } else {
          platform = 'WEB';
          platformLabel = 'Web Browser';
          platformIcon = '🌐';
          platformOS = 'web';
        }

        const info = { platform, platformLabel, platformIcon, platformOS, isApp, isWeb };
        if (gEmail) guestPlatformMap.set(gEmail, info);
        if (cuEmail) guestPlatformMap.set(cuEmail, info);
        guestPlatformMap.set(gIdKey, info);
        if (uKey) guestPlatformMap.set(uKey, info);
      });

      // Fetch photos in this gallery to match titles and thumbnails
      const galleryPhotos = await prisma.photo.findMany({
        where: { eventId },
        select: {
          id: true,
          filename: true,
          r2Url: true,
          thumbnailUrl: true,
          tabName: true,
          exif: true
        }
      });
      const photoMap = new Map();
      galleryPhotos.forEach((p) => {
        photoMap.set(String(p.id), p);
        if (p.r2Url) photoMap.set(p.r2Url, p);
      });

      // Also fetch any numeric mediaIds that weren't in galleryPhotos
      const missingNumericIds = [];
      videoEvents.forEach((ve) => {
        if (ve.mediaId && /^\d+$/.test(String(ve.mediaId))) {
          const numId = parseInt(ve.mediaId, 10);
          if (!photoMap.has(String(numId)) && !missingNumericIds.includes(numId)) {
            missingNumericIds.push(numId);
          }
        }
      });
      if (missingNumericIds.length > 0) {
        try {
          const extraPhotos = await prisma.photo.findMany({
            where: { id: { in: missingNumericIds } },
            select: {
              id: true,
              filename: true,
              r2Url: true,
              thumbnailUrl: true,
              tabName: true,
              exif: true
            }
          });
          extraPhotos.forEach((p) => {
            photoMap.set(String(p.id), p);
            if (p.r2Url) photoMap.set(p.r2Url, p);
          });
        } catch (e) {
          req.log.warn({ err: e }, 'Failed to fetch extra photos for video analytics');
        }
      }

      let totalVideoPlays = 0;
      let completedVideoCount = 0;
      const allUniqueViewers = new Set();
      const allCompletedViewers = new Set();
      const videoStatsMap = {};
      const guestVideoStatsMap = {};
      // Active sessions keyed by `${guestEmail || 'anonymous'}_${videoKey}`
      const activeSessions = new Map();

      let totalAppWatchTimeSec = 0;
      let totalWebWatchTimeSec = 0;

      videoEvents.forEach((ve) => {
        const watchSec = Number(ve.watchTimeSeconds || 0);
        const totalDurSec = Number(ve.totalDurationSeconds || 0);
        const compRatio = Number(ve.completionRatio || 0);
        const key = ve.mediaId || ve.mediaUrl || 'Unknown Video';
        const gEmail = (ve.guestEmail || 'anonymous').toLowerCase().trim();
        const gName = ve.guestName || (gEmail !== 'anonymous' ? gEmail.split('@')[0] : 'Guest');
        const sKey = `${gEmail}_${key}`;

        if (!videoStatsMap[key]) {
          videoStatsMap[key] = {
            mediaId: key,
            mediaUrl: ve.mediaUrl || null,
            durationSec: 0,
            plays: 0,
            replays: 0,
            completions: 0,
            totalWatchSec: 0,
            viewerEmails: new Set(),
            completedViewerEmails: new Set(),
            milestones: {
              start: new Set(),
              p25: new Set(),
              p50: new Set(),
              p75: new Set(),
              complete: new Set()
            },
            viewersMap: {}
          };
        }

        const vStat = videoStatsMap[key];
        if (totalDurSec > vStat.durationSec) {
          vStat.durationSec = totalDurSec;
        }

        if (gEmail && gEmail !== 'anonymous') {
          allUniqueViewers.add(gEmail);
          if (!guestVideoStatsMap[gEmail]) {
            guestVideoStatsMap[gEmail] = {
              watchedMediaIds: new Set(),
              totalWatchTimeSec: 0,
              appWatchTimeSec: 0,
              webWatchTimeSec: 0
            };
          }
        }

        if (!vStat.viewersMap[gEmail]) {
          vStat.viewersMap[gEmail] = {
            email: gEmail,
            name: gName,
            plays: 0,
            maxWatchSec: 0,
            maxDurationSec: 0,
            maxRatio: 0,
            isCompleted: false,
            lastWatchedAt: ve.createdAt
          };
        }
        const viewerProg = vStat.viewersMap[gEmail];
        if (ve.createdAt && (!viewerProg.lastWatchedAt || new Date(ve.createdAt) > new Date(viewerProg.lastWatchedAt))) {
          viewerProg.lastWatchedAt = ve.createdAt;
        }
        if (totalDurSec > viewerProg.maxDurationSec) {
          viewerProg.maxDurationSec = totalDurSec;
        }
        if (watchSec > viewerProg.maxWatchSec) {
          viewerProg.maxWatchSec = watchSec;
        }
        if (compRatio > viewerProg.maxRatio) {
          viewerProg.maxRatio = compRatio;
        }

        if (ve.action === 'START') {
          totalVideoPlays++;
          vStat.plays++;
          viewerProg.plays++;
          vStat.milestones.start.add(gEmail);
          if (gEmail && gEmail !== 'anonymous') {
            vStat.viewerEmails.add(gEmail);
            guestVideoStatsMap[gEmail].watchedMediaIds.add(key);
          }
        } else if (ve.action === 'REPLAY') {
          vStat.replays++;
          viewerProg.plays++;
          vStat.milestones.start.add(gEmail);
          if (gEmail && gEmail !== 'anonymous') {
            vStat.viewerEmails.add(gEmail);
            guestVideoStatsMap[gEmail].watchedMediaIds.add(key);
          }
        } else if (ve.action === 'COMPLETE') {
          completedVideoCount++;
          vStat.completions++;
          vStat.completedViewerEmails.add(gEmail);
          vStat.milestones.complete.add(gEmail);
          viewerProg.isCompleted = true;
          viewerProg.maxRatio = Math.max(viewerProg.maxRatio, 1.0);
          if (gEmail && gEmail !== 'anonymous') {
            allCompletedViewers.add(gEmail);
          }
        }

        // Milestone reach tracking (cascading reach)
        if (ve.action === 'MILESTONE_25' || compRatio >= 0.25) {
          vStat.milestones.start.add(gEmail);
          vStat.milestones.p25.add(gEmail);
        }
        if (ve.action === 'MILESTONE_50' || compRatio >= 0.50) {
          vStat.milestones.start.add(gEmail);
          vStat.milestones.p25.add(gEmail);
          vStat.milestones.p50.add(gEmail);
        }
        if (ve.action === 'MILESTONE_75' || compRatio >= 0.75) {
          vStat.milestones.start.add(gEmail);
          vStat.milestones.p25.add(gEmail);
          vStat.milestones.p50.add(gEmail);
          vStat.milestones.p75.add(gEmail);
        }
        if (ve.action === 'COMPLETE' || compRatio >= 0.95) {
          vStat.milestones.start.add(gEmail);
          vStat.milestones.p25.add(gEmail);
          vStat.milestones.p50.add(gEmail);
          vStat.milestones.p75.add(gEmail);
          vStat.milestones.complete.add(gEmail);
          vStat.completedViewerEmails.add(gEmail);
          viewerProg.isCompleted = true;
          if (gEmail && gEmail !== 'anonymous') {
            allCompletedViewers.add(gEmail);
          }
        }

        if (watchSec > 0 || compRatio > 0) {
          vStat.milestones.start.add(gEmail);
          if (gEmail && gEmail !== 'anonymous') {
            vStat.viewerEmails.add(gEmail);
            guestVideoStatsMap[gEmail].watchedMediaIds.add(key);
          }
        }

        // Determine whether this event/session was from Web or App
        const evSource = (ve.source || '').toUpperCase();
        let evPlatform = evSource ? (evSource.startsWith('WEB') ? 'web' : 'app') : null;
        if (!evPlatform) {
          const gp = guestPlatformMap.get(gEmail);
          evPlatform = (gp?.platform === 'APP') ? 'app' : 'web';
        }

        // Session delimited by START or REPLAY
        let curSession = activeSessions.get(sKey);
        if (ve.action === 'START' || ve.action === 'REPLAY' || !curSession) {
          if (curSession) {
            const watchAmount = curSession.maxWatch;
            vStat.totalWatchSec += watchAmount;
            if (curSession.platform === 'app') {
              totalAppWatchTimeSec += watchAmount;
            } else {
              totalWebWatchTimeSec += watchAmount;
            }
            if (gEmail && guestVideoStatsMap[gEmail]) {
              guestVideoStatsMap[gEmail].totalWatchTimeSec += watchAmount;
              if (curSession.platform === 'app') {
                guestVideoStatsMap[gEmail].appWatchTimeSec += watchAmount;
              } else {
                guestVideoStatsMap[gEmail].webWatchTimeSec += watchAmount;
              }
            }
          }
          curSession = { maxWatch: watchSec, platform: evPlatform };
          activeSessions.set(sKey, curSession);
        } else {
          curSession.maxWatch = Math.max(curSession.maxWatch, watchSec);
        }
      });

      // Commit remaining active sessions
      for (const [sKey, curSession] of activeSessions.entries()) {
        const lastUnderscore = sKey.lastIndexOf('_');
        const gEmail = sKey.substring(0, lastUnderscore);
        const key = sKey.substring(lastUnderscore + 1);
        const watchAmount = curSession.maxWatch;
        if (videoStatsMap[key]) {
          videoStatsMap[key].totalWatchSec += watchAmount;
        }
        if (curSession.platform === 'app') {
          totalAppWatchTimeSec += watchAmount;
        } else {
          totalWebWatchTimeSec += watchAmount;
        }
        if (gEmail && guestVideoStatsMap[gEmail]) {
          guestVideoStatsMap[gEmail].totalWatchTimeSec += watchAmount;
          if (curSession.platform === 'app') {
            guestVideoStatsMap[gEmail].appWatchTimeSec += watchAmount;
          } else {
            guestVideoStatsMap[gEmail].webWatchTimeSec += watchAmount;
          }
        }
      }

      let totalWatchTimeSec = 0;
      const videoPerformance = Object.values(videoStatsMap).map((v) => {
        totalWatchTimeSec += v.totalWatchSec;
        const photo = photoMap.get(String(v.mediaId)) || (v.mediaUrl ? photoMap.get(v.mediaUrl) : null);
        let rawTitle = photo?.exif?.title || photo?.filename || (v.mediaId ? `Video #${v.mediaId}` : 'Cinema Video');
        if (typeof rawTitle === 'string' && (rawTitle.startsWith('http://') || rawTitle.startsWith('https://'))) {
          try {
            const parsed = new URL(rawTitle);
            rawTitle = decodeURIComponent(parsed.pathname.split('/').pop() || rawTitle);
          } catch {}
        }
        const displayTitle = typeof rawTitle === 'string'
          ? rawTitle.replace(/\.(mp4|mov|m4v|webm)$/i, '')
          : (v.mediaId ? `Video #${v.mediaId}` : 'Cinema Video');

        const uniqueViewers = v.viewerEmails.size;
        const completedViewers = v.completedViewerEmails.size;
        const viewerCompletionRate = uniqueViewers > 0
          ? Math.round((completedViewers / uniqueViewers) * 100)
          : (v.plays > 0 && v.completions > 0 ? 100 : 0);
        const playCompletionRate = v.plays > 0
          ? Math.round((v.completions / v.plays) * 100)
          : 0;

        const baseViewers = Math.max(uniqueViewers, v.milestones.start.size, 1);
        const retention = {
          start: v.milestones.start.size,
          p25: v.milestones.p25.size,
          p50: v.milestones.p50.size,
          p75: v.milestones.p75.size,
          complete: v.milestones.complete.size,
          startPct: v.milestones.start.size > 0 ? 100 : 0,
          p25Pct: Math.round((v.milestones.p25.size / baseViewers) * 100),
          p50Pct: Math.round((v.milestones.p50.size / baseViewers) * 100),
          p75Pct: Math.round((v.milestones.p75.size / baseViewers) * 100),
          completePct: Math.round((v.milestones.complete.size / baseViewers) * 100)
        };

        return {
          mediaId: v.mediaId,
          mediaUrl: v.mediaUrl || photo?.r2Url || null,
          title: displayTitle,
          filename: photo?.filename || null,
          thumbnailUrl: photo?.thumbnailUrl || null,
          tabName: photo?.tabName || 'Cinema',
          durationSec: Math.round(v.durationSec),
          plays: v.plays,
          replays: v.replays,
          completions: v.completions,
          uniqueViewers,
          completedViewers,
          completionRate: viewerCompletionRate,
          viewerCompletionRate,
          playCompletionRate,
          totalWatchSec: Math.round(v.totalWatchSec),
          avgWatchSec: v.plays > 0 ? Math.round(v.totalWatchSec / v.plays) : 0,
          retention,
          viewers: Object.values(v.viewersMap).sort((a, b) => b.maxWatchSec - a.maxWatchSec)
        };
      });

      let appOnlyCount = 0;
      let webOnlyCount = 0;
      let bothPeopleCount = 0;

      const enhancedGuests = guests.map((g) => {
        const gEmail = g.email?.toLowerCase()?.trim();
        const stats = guestVideoStatsMap[gEmail] || {
          watchedMediaIds: new Set(),
          totalWatchTimeSec: 0,
          appWatchTimeSec: 0,
          webWatchTimeSec: 0
        };
        const cuEmail = g.circleUser?.email?.toLowerCase()?.trim();
        const pInfo = (gEmail && guestPlatformMap.get(gEmail)) ||
          (cuEmail && guestPlatformMap.get(cuEmail)) ||
          guestPlatformMap.get(`id_${g.id}`) ||
          (g.circleUser?.id && guestPlatformMap.get(`user_${g.circleUser.id}`)) || {
          platform: 'WEB',
          platformLabel: 'Web Browser',
          platformIcon: '🌐',
          platformOS: 'web',
          isApp: false,
          isWeb: true
        };

        if (pInfo.platform === 'APP') {
          appOnlyCount++;
        } else if (pInfo.platform === 'WEB') {
          webOnlyCount++;
        } else if (pInfo.platform === 'BOTH') {
          bothPeopleCount++;
        }

        return {
          ...g,
          platform: pInfo.platform,
          platformLabel: pInfo.platformLabel,
          platformIcon: pInfo.platformIcon,
          platformOS: pInfo.platformOS,
          videosWatched: stats.watchedMediaIds.size,
          appWatchTimeSec: Math.round(stats.appWatchTimeSec),
          webWatchTimeSec: Math.round(stats.webWatchTimeSec),
          totalWatchTimeSec: Math.round(stats.totalWatchTimeSec)
        };
      });

      const appPeopleCount = appOnlyCount + bothPeopleCount;
      const webPeopleCount = webOnlyCount + bothPeopleCount;
      const totalPeople = enhancedGuests.length || registeredUsers || 0;

      const appPeoplePercentage = totalPeople > 0 ? Math.round((appPeopleCount / totalPeople) * 100) : 0;
      const webPeoplePercentage = totalPeople > 0
        ? (bothPeopleCount === 0 ? (100 - appPeoplePercentage) : Math.round((webPeopleCount / totalPeople) * 100))
        : 0;
      const bothPeoplePercentage = totalPeople > 0 ? Math.round((bothPeopleCount / totalPeople) * 100) : 0;

      const appOnlyPercentage = totalPeople > 0 ? Math.round((appOnlyCount / totalPeople) * 100) : 0;
      const bothPercentage = bothPeoplePercentage;
      const webOnlyPercentage = totalPeople > 0 ? Math.max(0, 100 - appOnlyPercentage - bothPercentage) : 0;

      const totalEngagementTimeSec = totalAppWatchTimeSec + totalWebWatchTimeSec;
      const appTimePercentage = totalEngagementTimeSec > 0
        ? Math.round((totalAppWatchTimeSec / totalEngagementTimeSec) * 100)
        : 0;
      const webTimePercentage = totalEngagementTimeSec > 0
        ? (100 - appTimePercentage)
        : 0;

      let comparisonInsight = '';
      if (totalEngagementTimeSec > 0 && totalPeople > 0) {
        if (webPeoplePercentage >= appPeoplePercentage && appTimePercentage > webTimePercentage) {
          comparisonInsight = `${webPeoplePercentage}% of people use Web, but ${appTimePercentage}% of time spent is on the Mobile App.`;
        } else if (appPeoplePercentage >= webPeoplePercentage && webTimePercentage > appTimePercentage) {
          comparisonInsight = `${appPeoplePercentage}% of people use the Mobile App, but ${webTimePercentage}% of time spent is on Web.`;
        } else if (appTimePercentage >= 60) {
          comparisonInsight = `${appTimePercentage}% of engagement time happens on the Mobile App (${appPeoplePercentage}% of participants).`;
        } else if (webTimePercentage >= 60) {
          comparisonInsight = `${webTimePercentage}% of engagement time happens on Web (${webPeoplePercentage}% of participants).`;
        } else {
          comparisonInsight = `Audience engagement is balanced: ${appTimePercentage}% on Mobile App vs ${webTimePercentage}% on Web.`;
        }
      } else if (totalPeople > 0) {
        comparisonInsight = `${appPeoplePercentage}% of participants are on the Mobile App and ${webPeoplePercentage}% are on Web.`;
      } else {
        comparisonInsight = 'No audience platform activity recorded yet.';
      }

      const platformBreakdown = {
        people: {
          appCount: appPeopleCount,
          webCount: webPeopleCount,
          bothCount: bothPeopleCount,
          appOnlyCount,
          webOnlyCount,
          totalCount: totalPeople,
          appPercentage: appPeoplePercentage,
          webPercentage: webPeoplePercentage,
          bothPercentage: bothPeoplePercentage,
          appOnlyPercentage,
          webOnlyPercentage
        },
        timeSpent: {
          appTimeSec: Math.round(totalAppWatchTimeSec),
          webTimeSec: Math.round(totalWebWatchTimeSec),
          totalTimeSec: Math.round(totalEngagementTimeSec),
          appPercentage: appTimePercentage,
          webPercentage: webTimePercentage
        },
        insight: comparisonInsight
      };

      const totalUniqueViewers = allUniqueViewers.size;
      const totalCompletedUniqueViewers = allCompletedViewers.size;
      const overallViewerCompletionRate = totalUniqueViewers > 0
        ? Math.round((totalCompletedUniqueViewers / totalUniqueViewers) * 100)
        : (totalVideoPlays > 0 && completedVideoCount > 0 ? 100 : 0);

      return {
        summary: {
          totalImpressions,
          photosDiscovered: `${discoveredCount}/${totalPhotos}`,
          photosDownloaded: totalDownloads,
          registeredUsers,
          totalVideoPlays,
          totalWatchTimeSec: Math.round(totalWatchTimeSec),
          completedVideoCount,
          uniqueVideoViewers: totalUniqueViewers,
          completedVideoViewers: totalCompletedUniqueViewers,
          viewerCompletionRate: overallViewerCompletionRate,
          platformBreakdown
        },
        videoPerformance,
        guests: enhancedGuests
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve analytics' });
    }
  });

  // Download a participant's likes as a ZIP folder of images
  fastify.get('/api/gallery/events/:id/guests/:guestId/download-likes', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const guestId = parseInt(req.params.guestId, 10);
    if (isNaN(eventId) || isNaN(guestId)) {
      return reply.code(400).send({ error: 'Invalid event or guest ID' });
    }

    try {
      const guest = await prisma.guest.findFirst({
        where: { id: guestId, eventId },
        include: {
          likes: {
            include: {
              photo: true
            }
          }
        }
      });

      if (!guest) {
        return reply.code(404).send({ error: 'Guest not found in this event' });
      }

      const photos = guest.likes.map(l => l.photo).filter(Boolean);
      if (photos.length === 0) {
        return reply.code(400).send({ error: 'No liked photos found for this guest' });
      }

      const archiver = require('archiver');
      const archive = archiver('zip', { zlib: { level: 5 } });

      const safeGuestName = (guest.name || guest.email || 'guest').replace(/[^a-z0-9_-]/gi, '_');
      reply.raw.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeGuestName}_liked_photos.zip"`
      });

      archive.pipe(reply.raw);

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        try {
          const photoRes = await fetch(photo.r2Url);
          if (photoRes.ok) {
            const buffer = Buffer.from(await photoRes.arrayBuffer());
            const ext = photo.filename.includes('.') ? photo.filename.split('.').pop() : 'jpg';
            const filenameInZip = `${String(i + 1).padStart(3, '0')}_${photo.id}.${ext}`;
            archive.append(buffer, { name: filenameInZip });
          }
        } catch (e) {
          req.log.error(`Failed to fetch photo ${photo.id} for ZIP:`, e);
        }
      }

      await archive.finalize();
    } catch (err) {
      req.log.error(err);
      if (!reply.raw.headersSent) {
        return reply.code(500).send({ error: 'Failed to generate ZIP download' });
      }
    }
  });

  // Remove guest access from an event
  fastify.delete('/api/gallery/events/:id/guests/:guestId', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

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
        return reply.code(404).send({ error: 'Guest not found in this event' });
      }

      await prisma.guest.delete({
        where: { id: guestId }
      });

      return { success: true, message: 'Guest deleted successfully' };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to delete guest' });
    }
  });

  // Update guest access level and display role
  fastify.post('/api/gallery/events/:id/guests/:guestId/access', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const eventId = parseInt(req.params.id, 10);
    const guestId = parseInt(req.params.guestId, 10);
    if (isNaN(eventId) || isNaN(guestId)) {
      return reply.code(400).send({ error: 'Invalid event or guest ID' });
    }

    const { hasFullAccess, displayRole } = req.body || {};
    if (typeof hasFullAccess !== 'boolean') {
      return reply.code(400).send({ error: 'Invalid or missing hasFullAccess' });
    }

    try {
      const guest = await prisma.guest.findFirst({
        where: { id: guestId, eventId }
      });

      if (!guest) {
        return reply.code(404).send({ error: 'Guest not found in this event' });
      }

      // If assigning BRIDE or GROOM, clear any previous guest with that displayRole in this event
      if (displayRole === 'BRIDE' || displayRole === 'GROOM') {
        await prisma.guest.updateMany({
          where: { eventId, displayRole },
          data: { displayRole: null }
        });
      }

      const updated = await prisma.guest.update({
        where: { id: guestId },
        data: {
          hasFullAccess,
          displayRole: displayRole !== undefined ? displayRole : guest.displayRole
        }
      });

      return { success: true, guest: updated };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to update guest access' });
    }
  });

  // Toggle guest block status
  fastify.post('/api/gallery/events/:id/guests/:guestId/block', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const eventId = parseInt(req.params.id, 10);
    const guestId = parseInt(req.params.guestId, 10);
    if (isNaN(eventId) || isNaN(guestId)) {
      return reply.code(400).send({ error: 'Invalid event or guest ID' });
    }

    const { isBlocked } = req.body || {};
    if (typeof isBlocked !== 'boolean') {
      return reply.code(400).send({ error: 'Invalid or missing isBlocked' });
    }

    try {
      const guest = await prisma.guest.findFirst({
        where: { id: guestId, eventId }
      });

      if (!guest) {
        return reply.code(404).send({ error: 'Guest not found in this event' });
      }

      const updated = await prisma.guest.update({
        where: { id: guestId },
        data: { isBlocked }
      });

      return { success: true, guest: updated };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to update guest block status' });
    }
  });
};
// deploy-trigger-2
