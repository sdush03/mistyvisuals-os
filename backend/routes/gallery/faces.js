const fs = require('fs');
const path = require('path');
const { prisma } = require('../../modules/quotation/prisma');
const qdrant = require('../../utils/qdrant');
const faceRecManager = require('../../utils/faceRecManager');

// Background purging helper for orphaned face crop files
function purgeOrphanedFacesBackground(log) {
  setTimeout(async () => {
    try {
      const facesDir = path.join(__dirname, '..', '..', 'uploads', 'photos', 'faces');
      if (!fs.existsSync(facesDir)) return;
      const files = fs.readdirSync(facesDir);
      for (const file of files) {
        if (file.endsWith('.jpg')) {
          const faceId = path.basename(file, '.jpg');
          const photoId = await qdrant.getPhotoIdForFace(faceId);
          if (!photoId) {
            try { fs.unlinkSync(path.join(facesDir, file)); } catch (e) {}
          }
        }
      }
    } catch (err) {
      if (log) log.error('[purgeOrphanedFaces] Purge error:', err);
    }
  }, 1000);
}

module.exports = async function registerFaceRoutes(fastify, opts) {
  const { requireAdmin } = opts;

  // Save backfilled face crops and vectors for a photo
  fastify.post('/api/gallery/events/:id/photos/:photoId/vectors', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const photoId = parseInt(req.params.photoId, 10);
    const { faces } = req.body;

    try {
      if (faces && faces.length > 0) {
        await qdrant.upsertVectors(eventId, photoId, faces);
      }

      await prisma.photo.update({
        where: { id: photoId },
        data: { facesScanned: true }
      });

      const unscannedCount = await prisma.photo.count({
        where: {
          eventId,
          facesScanned: false
        }
      });

      if (unscannedCount === 0) {
        await prisma.galleryEvent.update({
          where: { id: eventId },
          data: {
            galleryFacesComplete: true,
            clustersDirty: true
          }
        });
      }

      return { success: true, remaining: unscannedCount };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to save backfilled vectors' });
    }
  });

  // Explicitly mark cluster cache as dirty
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

  // Get clustered people from the event photos — ADMIN ONLY
  fastify.get('/api/gallery/public/events/:slug/people', async (req, reply) => {
    const auth = requireAdmin(req, reply);
    if (!auth) return;

    const slug = req.params.slug.toLowerCase().trim();
    try {
      const event = await prisma.galleryEvent.findUnique({ where: { slug } });
      if (!event) return reply.code(404).send({ error: 'Event not found' });

      if (!event.clustersDirty && event.clustersCache) {
        return { people: event.clustersCache, fromCache: true };
      }

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
      } else {
        const allVectors = await qdrant.getAllVectorsForEvent(event.id);
        dbVectors = allVectors.filter(item => validPhotoIds.has(item.photoId));
      }

      if (dbVectors.length === 0) {
        await prisma.galleryEvent.update({
          where: { id: event.id },
          data: { clustersCache: [], clustersDirty: false }
        });
        return { people: [] };
      }

      const res = await faceRecManager.clusterFaces(dbVectors);
      
      purgeOrphanedFacesBackground(req.log);

      if (!res.clusters) {
        await prisma.galleryEvent.update({
          where: { id: event.id },
          data: { clustersCache: [], clustersDirty: false }
        });
        return { people: [] };
      }

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
            if (photosInCluster[0].r2Url && photosInCluster[0].r2Url.startsWith('http')) {
              const urlParts = photosInCluster[0].r2Url.split('/');
              urlParts[urlParts.length - 2] = 'faces';
              urlParts[urlParts.length - 1] = encodeURIComponent(`${firstFaceId}.jpg`);
              coverPhotoUrl = urlParts.join('/');
            } else {
              coverPhotoUrl = `/api/photos/file/events/${slug}/faces/${encodeURIComponent(firstFaceId)}.jpg`;
            }
          }
          people.push({
            id: cluster.id,
            photoCount: cluster.photoCount,
            coverPhotoUrl,
            photos: photosInCluster
          });
        }
      }

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
};
