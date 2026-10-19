const fs = require('fs');
const path = require('path');
const { prisma } = require('../../modules/quotation/prisma');
const { Prisma } = require('@prisma/client');
const qdrant = require('../../utils/qdrant');
const { uploadAsset, deleteAsset, deleteAssetsBatch, getPresignedUploadUrl, isR2Enabled } = require('../../utils/r2');
const { deletePhotosAssets, canEditGallery } = require('./helpers');

const recentIntegrityPushes = new Map();

/**
 * Resolves the cinema category for a photo/video using explicit metadata,
 * falling back to filename and title keyword heuristics if unset or default.
 */
function resolveCinemaCategory(explicitCat, filename, title) {
  const cat = String(explicitCat || '').toUpperCase().trim();
  if (cat.includes('CANDID') || cat.includes('REEL') || cat.includes('DIAR')) return 'CANDID';
  if (cat.includes('STAGE') || cat.includes('SPOTLIGHT') || cat.includes('PERFORMANCE') || cat.includes('DANCE')) return 'STAGE';
  if (cat.includes('EXTENDED') || cat.includes('CUTS') || cat.includes('CHAPTER')) return 'EXTENDED';

  // Heuristic detection based on filename and title (same keywords as mobile client)
  const clean = `${filename || ''} ${title || ''}`.toLowerCase();
  if (clean.includes('dance') || clean.includes('performance') || clean.includes('stage') || clean.includes('solo') || clean.includes('squad') || clean.includes('choreo') || clean.includes('duet') || clean.includes('flashmob')) {
    return 'STAGE';
  }
  if (clean.includes('reel') || clean.includes('candid') || clean.includes('vertical') || clean.includes('short')) {
    return 'CANDID';
  }
  if (clean.includes('extended') || clean.includes('chapter') || clean.includes('ceremony') || clean.includes('sangeet') || clean.includes('haldi') || clean.includes('mehendi') || clean.includes('wedding') || clean.includes('reception') || clean.includes('varmala') || clean.includes('baraat') || clean.includes('vidai') || clean.includes('phera')) {
    return 'EXTENDED';
  }
  return 'DIRECTORS_CUT';
}

module.exports = async function registerPhotoRoutes(fastify, opts) {
  const { pool, requireAdmin, requireAuth, getAuthFromRequest } = opts;

  // Get photos for an event — used by the Electron uploader and web UI
  fastify.get('/api/gallery/events/:id/photos', async (req, reply) => {
    const auth = requireAuth(req, reply);
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
      if (tabFilter && tabFilter.toUpperCase() !== 'ALL') {
        if (tabFilter.toLowerCase() === 'highlights') {
          whereClause.OR = [
            { tabName: { equals: 'Highlights', mode: 'insensitive' } },
            { exif: { path: ['isHighlight'], equals: true } }
          ];
        } else {
          whereClause.tabName = { equals: tabFilter, mode: 'insensitive' };
        }
      }

      const [total, photos] = await Promise.all([
        prisma.photo.count({ where: whereClause }),
        prisma.photo.findMany({
          where: whereClause,
          select: {
            id: true,
            r2Url: true,
            thumbnailUrl: true,
            filename: true,
            fileSize: true,
            originalFileSize: true,
            tabName: true,
            exif: true,
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

      const mappedPhotos = photos.map(p => {
        const ext = path.extname(p.filename || p.r2Url || '').toLowerCase();
        const isVideo = ['.mp4', '.mov', '.m4v'].includes(ext);
        const isPhotoOnlyCinema = (p.tabName || '').toLowerCase() === 'cinema' && !isVideo;
        const isComingSoon = Boolean(p.exif?.isComingSoon || isPhotoOnlyCinema);
        const hasBakedCover = Boolean(p.exif?.hasBakedCover || p.exif?.isCoverBaked);

        return {
          id: p.id,
          r2Url: p.r2Url,
          thumbnailUrl: p.thumbnailUrl,
          filename: p.filename,
          fileSize: p.fileSize || (typeof p.exif?.fileSize === 'number' ? p.exif.fileSize : (p.originalFileSize || 0)),
          originalSize: p.originalFileSize || p.fileSize || 0,
          tabName: p.tabName,
          exif: p.exif,
          isFeatured: Boolean(p.exif && p.exif.isFeatured),
          isComingSoon,
          hasBakedCover,
          isCoverBaked: hasBakedCover,
          videoReplacedAt: p.exif?.videoReplacedAt || null,
          version: p.exif?.version || 1,
          capturedAt: p.capturedAt,
          width: p.width,
          height: p.height
        };
      });

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

  // Cache R2 scan results for 3 minutes per event to prevent hammering R2 API on repeated calls
  const r2ScanCache = new Map(); // key: eventId, value: { timestamp, data }

  async function scanEventR2Storage(event, options = {}) {
    const { minAgeHours = 1, forceRefresh = false, log } = options;
    const eventId = event.id;

    if (!forceRefresh) {
      const cached = r2ScanCache.get(eventId);
      if (cached && (Date.now() - cached.timestamp < 180000)) { // 3 minutes
        return cached.data;
      }
    }

    if (!isR2Enabled || !process.env.R2_ACCOUNT_ID || !process.env.R2_BUCKET_NAME) {
      return {
        enabled: false,
        reason: 'R2 not configured on this server',
        totalR2Objects: 0,
        totalR2Bytes: 0,
        activeObjects: 0,
        activeBytes: 0,
        orphanObjects: 0,
        orphanBytes: 0,
        reasonsSummary: {},
        orphans: []
      };
    }

    const slug = (event.slug || '').toLowerCase().trim();
    if (!slug) {
      return { enabled: false, reason: 'Event has no valid slug' };
    }
    const prefix = `events/${slug}/`;

    // 1. Gather all active DB URLs and filenames
    const [photos, eventCovers] = await Promise.all([
      prisma.photo.findMany({
        where: { eventId },
        select: { id: true, r2Url: true, thumbnailUrl: true, filename: true, tabName: true, exif: true }
      }),
      prisma.galleryEvent.findUnique({
        where: { id: eventId },
        select: { coverPhotoUrl: true, coverPhotoMobileUrl: true, coverPhotoSquareUrl: true }
      })
    ]);

    const activeKeys = new Set();
    const activeFilenames = new Set();

    function addUrlKey(rawUrl) {
      if (!rawUrl) return;
      try {
        const parsed = new URL(rawUrl);
        activeKeys.add(decodeURIComponent(parsed.pathname.substring(1)));
      } catch (_) {
        activeKeys.add(decodeURIComponent(rawUrl.replace(/^\/?api\/photos\/file\//, '')));
      }
    }

    photos.forEach(p => {
      addUrlKey(p.r2Url);
      addUrlKey(p.thumbnailUrl);
      if (p.exif && typeof p.exif === 'object' && p.exif.posterUrl) {
        addUrlKey(p.exif.posterUrl);
      }
      if (p.filename) {
        activeFilenames.add(p.filename.toLowerCase().trim());
      }
    });

    if (eventCovers) {
      addUrlKey(eventCovers.coverPhotoUrl);
      addUrlKey(eventCovers.coverPhotoMobileUrl);
      addUrlKey(eventCovers.coverPhotoSquareUrl);
    }

    // 2. Paginate all objects in R2 under events/${slug}/
    const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
    const client = new S3Client({
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      },
      region: 'auto'
    });

    let continuationToken = null;
    const allObjects = [];
    do {
      const listCmd = new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken
      });
      const res = await client.send(listCmd);
      if (res.Contents && res.Contents.length > 0) {
        allObjects.push(...res.Contents);
      }
      continuationToken = res.NextContinuationToken;
    } while (continuationToken);

    let totalR2Bytes = 0;
    let activeBytes = 0;
    let orphanBytes = 0;
    let protectedBytes = 0;

    const orphans = [];
    const active = [];
    const now = Date.now();

    const reasonsSummary = {
      REPLACED_ASSET: { count: 0, bytes: 0, label: 'Replaced Media (Old Version)' },
      ABORTED_UPLOAD: { count: 0, bytes: 0, label: 'Aborted / Interrupted Upload' },
      DANGLING_THUMBNAIL: { count: 0, bytes: 0, label: 'Unlinked Thumbnail' },
      STALE_COVER: { count: 0, bytes: 0, label: 'Stale Cover Photo' },
      LEGACY_FACE_CROP: { count: 0, bytes: 0, label: 'Legacy Face Crop' },
      PROTECTED_IN_FLIGHT: { count: 0, bytes: 0, label: 'In-Flight Upload (< 1h)' }
    };

    for (const item of allObjects) {
      if (!item.Key) continue;
      const size = item.Size || 0;
      totalR2Bytes += size;

      if (activeKeys.has(item.Key)) {
        activeBytes += size;
        active.push({ key: item.Key, size, lastModified: item.LastModified });
        continue;
      }

      // It's not in active DB keys! Classify reason
      const ageHours = item.LastModified ? (now - new Date(item.LastModified).getTime()) / (1000 * 60 * 60) : 999;

      // In-flight upload (< minAgeHours) is protected from deletion
      if (ageHours < minAgeHours) {
        protectedBytes += size;
        reasonsSummary.PROTECTED_IN_FLIGHT.count++;
        reasonsSummary.PROTECTED_IN_FLIGHT.bytes += size;
        continue;
      }

      orphanBytes += size;
      const keyLower = item.Key.toLowerCase();
      let reason = 'ABORTED_UPLOAD';
      let reasonLabel = 'Aborted / Interrupted Upload';
      let reasonDescription = 'File uploaded to R2 but never finalized or registered in database.';

      const filenameFromKey = path.basename(item.Key);

      if (keyLower.includes('/thumbnails/') || filenameFromKey.includes('thumb_')) {
        reason = 'DANGLING_THUMBNAIL';
        reasonLabel = 'Unlinked Thumbnail';
        reasonDescription = 'Thumbnail image file not linked to any active gallery photo or film.';
      } else if (keyLower.includes('/covers/')) {
        reason = 'STALE_COVER';
        reasonLabel = 'Stale Cover Photo';
        reasonDescription = 'Old cover image replaced by a new gallery cover.';
      } else if (keyLower.includes('/faces/')) {
        reason = 'LEGACY_FACE_CROP';
        reasonLabel = 'Legacy Face Crop';
        reasonDescription = 'Face crop from an older face recognition pipeline.';
      } else {
        // Check if original base name matches an active photo in this gallery
        const parts = filenameFromKey.split('_');
        const ext = path.extname(filenameFromKey);
        const baseCandidate = parts.length > 2 ? parts.slice(0, parts.length - 2).join('_') : parts[0];
        const possibleOrigFilename = `${baseCandidate}${ext}`.toLowerCase().trim();

        if (activeFilenames.has(possibleOrigFilename) || activeFilenames.has(filenameFromKey.toLowerCase().trim())) {
          reason = 'REPLACED_ASSET';
          reasonLabel = 'Replaced Media (Old Version)';
          reasonDescription = 'Old media file abandoned in R2 after a re-upload or video cut replacement.';
        }
      }

      if (reasonsSummary[reason]) {
        reasonsSummary[reason].count++;
        reasonsSummary[reason].bytes += size;
      }

      let publicDomain = process.env.R2_PUBLIC_DOMAIN_URL || 'gallery.mistyvisuals.com';
      if (publicDomain.startsWith('http://')) publicDomain = publicDomain.substring(7);
      if (publicDomain.startsWith('https://')) publicDomain = publicDomain.substring(8);
      const fileUrl = isR2Enabled ? `https://${publicDomain}/${item.Key}` : `/api/photos/file/${item.Key}`;
      const ext = path.extname(filenameFromKey).toLowerCase();
      const isImg = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
      const isVid = ['.mp4', '.mov', '.m4v', '.webm'].includes(ext);

      orphans.push({
        key: item.Key,
        filename: filenameFromKey,
        url: fileUrl,
        size,
        lastModified: item.LastModified,
        ageHours: Math.round(ageHours * 10) / 10,
        reason,
        reasonLabel,
        reasonDescription,
        isImage: isImg,
        isVideo: isVid
      });
    }

    const result = {
      enabled: true,
      scannedAt: new Date().toISOString(),
      slug,
      totalR2Objects: allObjects.length,
      totalR2Bytes,
      activeObjects: active.length,
      activeBytes,
      orphanObjects: orphans.length,
      orphanBytes,
      protectedObjects: reasonsSummary.PROTECTED_IN_FLIGHT.count,
      protectedBytes,
      reasonsSummary,
      orphans,
      activeCount: active.length
    };

    r2ScanCache.set(eventId, { timestamp: Date.now(), data: result });
    return result;
  }

  // Storage summary for an event (total size, photo size, tab size breakdown, video sizes, physical R2 metrics)
  fastify.get('/api/gallery/events/:id/storage-summary', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    if (isNaN(eventId)) {
      return reply.code(400).send({ error: 'Invalid event ID' });
    }

    try {
      const event = await prisma.galleryEvent.findUnique({
        where: { id: eventId },
        select: { id: true, title: true, slug: true }
      });
      if (!event) {
        return reply.code(404).send({ error: 'Gallery event not found' });
      }

      const query = `
        SELECT 
          COALESCE(tab_name, 'Uncategorized') AS tab_name,
          COUNT(*)::int AS count,
          COALESCE(SUM(
            CASE 
              WHEN exif->>'fileSize' ~ '^[0-9]+$' THEN (exif->>'fileSize')::bigint
              WHEN file_size > 0 THEN file_size::bigint
              WHEN original_file_size > 0 THEN original_file_size::bigint
              ELSE 0
            END
          ), 0)::bigint AS total_bytes,
          COUNT(*) FILTER (
            WHERE filename ILIKE '%.mp4' OR filename ILIKE '%.mov' OR filename ILIKE '%.m4v' OR filename ILIKE '%.webm' 
               OR r2_url ILIKE '%.mp4' OR r2_url ILIKE '%.mov' OR r2_url ILIKE '%.m4v' OR r2_url ILIKE '%.webm'
          )::int AS video_count,
          COALESCE(SUM(
            CASE 
              WHEN exif->>'fileSize' ~ '^[0-9]+$' THEN (exif->>'fileSize')::bigint
              WHEN file_size > 0 THEN file_size::bigint
              WHEN original_file_size > 0 THEN original_file_size::bigint
              ELSE 0
            END
          ) FILTER (
            WHERE filename ILIKE '%.mp4' OR filename ILIKE '%.mov' OR filename ILIKE '%.m4v' OR filename ILIKE '%.webm' 
               OR r2_url ILIKE '%.mp4' OR r2_url ILIKE '%.mov' OR r2_url ILIKE '%.m4v' OR r2_url ILIKE '%.webm'
          ), 0)::bigint AS video_bytes,
          COUNT(*) FILTER (
            WHERE filename NOT ILIKE '%.mp4' AND filename NOT ILIKE '%.mov' AND filename NOT ILIKE '%.m4v' AND filename NOT ILIKE '%.webm' 
              AND (r2_url IS NULL OR (r2_url NOT ILIKE '%.mp4' AND r2_url NOT ILIKE '%.mov' AND r2_url NOT ILIKE '%.m4v' AND r2_url NOT ILIKE '%.webm'))
          )::int AS photo_count,
          COALESCE(SUM(
            CASE 
              WHEN exif->>'fileSize' ~ '^[0-9]+$' THEN (exif->>'fileSize')::bigint
              WHEN file_size > 0 THEN file_size::bigint
              WHEN original_file_size > 0 THEN original_file_size::bigint
              ELSE 0
            END
          ) FILTER (
            WHERE filename NOT ILIKE '%.mp4' AND filename NOT ILIKE '%.mov' AND filename NOT ILIKE '%.m4v' AND filename NOT ILIKE '%.webm' 
              AND (r2_url IS NULL OR (r2_url NOT ILIKE '%.mp4' AND r2_url NOT ILIKE '%.mov' AND r2_url NOT ILIKE '%.m4v' AND r2_url NOT ILIKE '%.webm'))
          ), 0)::bigint AS photo_bytes
        FROM photos
        WHERE event_id = $1
        GROUP BY tab_name
        ORDER BY tab_name ASC;
      `;

      const res = await pool.query(query, [eventId]);

      let totalGalleryBytes = 0;
      let totalGalleryCount = 0;
      let allPhotosBytes = 0;
      let allPhotosCount = 0;
      let allVideosBytes = 0;
      let allVideosCount = 0;
      let cinemaBytes = 0;
      let cinemaCount = 0;

      const tabs = res.rows.map(row => {
        const tBytes = Number(row.total_bytes || 0);
        const tCount = Number(row.count || 0);
        const pBytes = Number(row.photo_bytes || 0);
        const pCount = Number(row.photo_count || 0);
        const vBytes = Number(row.video_bytes || 0);
        const vCount = Number(row.video_count || 0);

        totalGalleryBytes += tBytes;
        totalGalleryCount += tCount;
        allPhotosBytes += pBytes;
        allPhotosCount += pCount;
        allVideosBytes += vBytes;
        allVideosCount += vCount;

        if ((row.tab_name || '').trim().toUpperCase() === 'CINEMA') {
          cinemaBytes += tBytes;
          cinemaCount += tCount;
        }

        return {
          tabName: row.tab_name,
          count: tCount,
          totalBytes: tBytes,
          photoCount: pCount,
          photoBytes: pBytes,
          videoCount: vCount,
          videoBytes: vBytes
        };
      });

      let physicalR2 = null;
      if (isR2Enabled) {
        try {
          const scan = await scanEventR2Storage(event, { forceRefresh: req.query.scanR2 === 'true', log: req.log });
          if (scan && scan.enabled) {
            physicalR2 = {
              totalR2Bytes: scan.totalR2Bytes,
              totalR2Objects: scan.totalR2Objects,
              activeBytes: scan.activeBytes,
              activeObjects: scan.activeObjects,
              orphanBytes: scan.orphanBytes,
              orphanObjects: scan.orphanObjects,
              protectedObjects: scan.protectedObjects,
              protectedBytes: scan.protectedBytes,
              reasonsSummary: scan.reasonsSummary
            };
          }
        } catch (r2Err) {
          req.log.warn({ err: r2Err }, '[storage-summary] Failed to scan physical R2');
        }
      }

      return {
        eventId,
        totalGalleryBytes,
        totalGalleryCount,
        allPhotosBytes,
        allPhotosCount,
        allVideosBytes,
        allVideosCount,
        cinemaBytes,
        cinemaCount,
        tabs,
        physicalR2
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve storage summary' });
    }
  });

  // Delete multiple photos by ID
  fastify.delete('/api/gallery/events/:id/photos', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

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

      if (slug && photosToDelete.length > 0) {
        await deletePhotosAssets(photosToDelete, slug, req.log).catch((err) => {
          req.log.error(`[deletePhotosAssets] Cleanup error:`, err);
        });
      }

      return { success: true, count: deleted.count };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to delete photos' });
    }
  });

  // Move multiple photos to another tab
  fastify.patch('/api/gallery/events/:id/photos/move', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

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

  // Generate pre-signed R2 upload URLs for photo metadata
  fastify.post('/api/gallery/events/:id/generate-upload-urls', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

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
        const ext = path.extname(item.filename).toLowerCase();
        const base = path.basename(item.filename, ext);
        const uniqueFilename = `${base}_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}${ext}`;

        const isVideo = ext === '.mp4' || ext === '.mov' || ext === '.m4v';
        const contentType = ext === '.mp4' ? 'video/mp4' : ext === '.mov' ? 'video/quicktime' : 'image/jpeg';
        const folder = isVideo ? 'videos' : 'photos';
        const photoKey = `events/${slug}/${folder}/${uniqueFilename}`;

        const r2Url = isR2Enabled ? `https://${publicDomain}/${photoKey}` : `/api/photos/file/${photoKey}`;
        const photoPutUrl = await getPresignedUploadUrl(photoKey, contentType);

        let thumbnailPutUrl = null;
        let thumbnailUrl = null;
        if (isVideo) {
          const thumbKey = `events/${slug}/videos/thumbnails/${base}_${Date.now()}_thumb.jpg`;
          thumbnailUrl = isR2Enabled ? `https://${publicDomain}/${thumbKey}` : `/api/photos/file/${thumbKey}`;
          thumbnailPutUrl = await getPresignedUploadUrl(thumbKey, 'image/jpeg');
        } else {
          const thumbKey = `events/${slug}/thumbnails/${base}_${Date.now()}_thumb.jpg`;
          thumbnailUrl = isR2Enabled ? `https://${publicDomain}/${thumbKey}` : `/api/photos/file/${thumbKey}`;
          thumbnailPutUrl = await getPresignedUploadUrl(thumbKey, 'image/jpeg');
        }

        results.push({
          filename: item.filename,
          photoPutUrl,
          r2Url,
          thumbnailPutUrl,
          thumbPutUrl: thumbnailPutUrl,
          thumbnailUrl,
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
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

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
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const { filename, fileContent, eventId, eventSlug, isFaceCrop } = req.body;
    if (!filename || !fileContent) {
      return reply.code(400).send({ error: 'Missing filename or fileContent' });
    }

    const targetEvent = eventId || eventSlug;
    if (targetEvent) {
      const canEdit = await canEditGallery(auth, targetEvent, pool);
      if (!canEdit) {
        return reply.code(403).send({ error: 'Access denied: You do not have permission to upload to this gallery.' });
      }
    } else {
      const isAdmin = Array.isArray(auth.roles) ? auth.roles.includes('admin') : auth.role === 'admin';
      if (!isAdmin) {
        return reply.code(403).send({ error: 'Access denied: Gallery target must be specified.' });
      }
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
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

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

  // Get detailed information of a single gallery event by ID
  fastify.get('/api/gallery/events/:id', async (req, reply) => {
    const auth = requireAuth(req, reply);
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
      let assignedUserId = null;
      let assignedUserName = null;
      if (event.projectId) {
        const projRes = await pool.query(
          `SELECT p.name, p.slug, l.assigned_user_id, COALESCE(u.name, pm.name) AS assigned_user_name
           FROM projects p
           LEFT JOIN leads l ON l.id = p.lead_id
           LEFT JOIN users u ON u.id = l.assigned_user_id
           LEFT JOIN users pm ON pm.id = p.project_manager_id
           WHERE p.id::text = $1 OR p.slug = $1 LIMIT 1`,
          [event.projectId]
        );
        if (projRes.rows.length > 0) {
          crmName = projRes.rows[0].name;
          crmSlug = projRes.rows[0].slug;
          assignedUserId = projRes.rows[0].assigned_user_id;
          assignedUserName = projRes.rows[0].assigned_user_name;
        }
      } else if (event.leadId) {
        const leadRes = await pool.query(
          `SELECT l.assigned_user_id, u.name AS assigned_user_name
           FROM leads l
           LEFT JOIN users u ON u.id = l.assigned_user_id
           WHERE l.id = $1 LIMIT 1`,
          [event.leadId]
        );
        if (leadRes.rows.length > 0) {
          assignedUserId = leadRes.rows[0].assigned_user_id;
          assignedUserName = leadRes.rows[0].assigned_user_name;
        }
      }

      const canEdit = await canEditGallery(auth, id, pool);

      return {
        ...event,
        crmName,
        crmSlug,
        assignedUserId,
        assignedUserName,
        can_edit: canEdit,
        canEdit: canEdit,
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
    const auth = requireAuth(req, reply);
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

  // Delete wedding gallery event (Admin only)
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
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

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

  // Upload and update cover/poster for an uploaded video photo
  fastify.post('/api/gallery/events/:id/photos/:photoId/cover', { bodyLimit: 50 * 1024 * 1024 }, async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const eventId = parseInt(req.params.id, 10);
    const photoId = parseInt(req.params.photoId, 10);
    const { filename, fileContent } = req.body;

    if (!fileContent) {
      return reply.code(400).send({ error: 'Missing fileContent (base64 image)' });
    }

    try {
      const dbEvent = await prisma.galleryEvent.findUnique({
        where: { id: eventId }
      });
      if (!dbEvent) {
        return reply.code(404).send({ error: 'Gallery event not found' });
      }

      const photo = await prisma.photo.findFirst({
        where: { id: photoId, eventId }
      });
      if (!photo) {
        return reply.code(404).send({ error: 'Photo/video not found' });
      }

      const slug = dbEvent.slug.toLowerCase().trim();
      const buffer = Buffer.from(fileContent, 'base64');
      const sharp = require('sharp');

      // Determine orientation:
      // For cinema videos (or vertical covers), always use 3:4 portrait (1080 x 1440)
      const coverMeta = await sharp(buffer).metadata();
      let cWidth = coverMeta.width || 1080;
      let cHeight = coverMeta.height || 1440;
      if (coverMeta.orientation && coverMeta.orientation >= 5) {
        cWidth = coverMeta.height;
        cHeight = coverMeta.width;
      }

      const isCinema = (photo.tabName && photo.tabName.toUpperCase() === 'CINEMA');
      const isVertical = isCinema || (cHeight >= cWidth);

      const targetW = isVertical ? 1080 : 1920;
      const targetH = isVertical ? 1440 : 1080; // 3:4 portrait (1080 x 1440) for cinema posters

      let posterBuffer;
      // If the incoming cover is already at or near target aspect ratio (e.g. baked by Poster Studio), don't crop or zoom!
      const aspectDiff = Math.abs((cWidth / cHeight) - (targetW / targetH));
      if (aspectDiff < 0.04) {
        posterBuffer = await sharp(buffer)
          .rotate()
          .resize(targetW, targetH, { fit: 'fill' })
          .jpeg({ quality: 88, mozjpeg: true })
          .toBuffer();
      } else {
        posterBuffer = await sharp(buffer)
          .rotate()
          .resize(targetW, targetH, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 88, mozjpeg: true })
          .toBuffer();
      }

      const baseName = path.basename(photo.filename, path.extname(photo.filename));
      const thumbFilename = `thumb_${baseName}_${Date.now()}.jpg`;
      const subfolder = `events/${slug}/thumbnails`;

      const newThumbnailUrl = await uploadAsset(posterBuffer, thumbFilename, subfolder, 'image/jpeg');

      // Delete old thumbnail asset from R2 if one existed
      if (photo.thumbnailUrl) {
        await deleteAsset(photo.thumbnailUrl).catch(() => {});
      }

      const curExif = (photo.exif && typeof photo.exif === 'object') ? photo.exif : {};
      const updatedPhoto = await prisma.photo.update({
        where: { id: photoId },
        data: {
          thumbnailUrl: newThumbnailUrl,
          facesScanned: true,
          exif: {
            ...curExif,
            hasBakedCover: true
          }
        }
      });

      return {
        success: true,
        thumbnailUrl: newThumbnailUrl,
        photo: updatedPhoto
      };
    } catch (err) {
      req.log.error(err);
      if (err.message && err.message.includes('R2 storage')) {
        return reply.code(500).send({ error: err.message });
      }
      return reply.code(500).send({ error: 'Failed to update video cover' });
    }
  });

  // Attach or replace video for an existing photo/film record (e.g. converting a Coming Soon poster to a full active video)
  fastify.post('/api/gallery/events/:id/photos/:photoId/attach-video', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const eventId = parseInt(req.params.id, 10);
    const photoId = parseInt(req.params.photoId, 10);
    const { r2Url, filename, fileSize, width, height, duration, cinemaCategory } = req.body || {};

    if (!r2Url || !filename) {
      return reply.code(400).send({ error: 'Missing r2Url or filename' });
    }

    try {
      const photo = await prisma.photo.findFirst({
        where: { id: photoId, eventId }
      });
      if (!photo) {
        return reply.code(404).send({ error: 'Photo/film not found' });
      }

      // If previous record had an actual video at r2Url, delete old video asset from R2
      const isOldVideo = ['.mp4', '.mov', '.m4v'].some(ext => (photo.filename || photo.r2Url || '').toLowerCase().endsWith(ext));
      if (isOldVideo && photo.r2Url && photo.r2Url !== r2Url) {
        await deleteAsset(photo.r2Url).catch(() => {});
      }

      const currentExif = (photo.exif && typeof photo.exif === 'object') ? photo.exif : {};
      const wasComingSoon = Boolean(currentExif.isComingSoon || !isOldVideo);
      const detectedCat = resolveCinemaCategory(cinemaCategory || currentExif.cinemaCategory, filename, currentExif.title);

      const categoryLabelMap = {
        'CANDID': 'CANDID DIARIES',
        'STAGE': 'STAGE & SPOTLIGHT',
        'EXTENDED': 'THE EXTENDED CUTS',
        'DIRECTORS_CUT': 'THE DIRECTORS’ CUT'
      };

      const updatedExif = {
        ...currentExif,
        isComingSoon: false, // Automatically remove Coming Soon!
        fileSize: typeof fileSize === 'number' ? fileSize : (currentExif.fileSize || photo.fileSize),
        videoWidth: width || currentExif.videoWidth,
        videoHeight: height || currentExif.videoHeight,
        duration: duration || currentExif.duration,
        cinemaCategory: (currentExif.cinemaCategory && currentExif.cinemaCategory !== 'THE DIRECTORS’ CUT')
          ? currentExif.cinemaCategory
          : (categoryLabelMap[detectedCat] || 'THE DIRECTORS’ CUT')
      };

      // When replacing an existing active video (not just fulfilling a Coming Soon placeholder)
      if (isOldVideo && photo.r2Url && photo.r2Url !== r2Url && !wasComingSoon) {
        updatedExif.videoReplacedAt = new Date().toISOString();
        updatedExif.version = (currentExif.version || 1) + 1;
      }

      // If subtitle was 'COMING SOON • TEASER POSTER', update it to chapter duration if available
      if (updatedExif.subtitle === 'COMING SOON • TEASER POSTER') {
        const mins = duration ? Math.round(duration / 60) : 0;
        updatedExif.subtitle = mins > 0 ? `CHAPTER I • ${mins} MIN` : 'THE WEDDING FILM';
      }

      const dataToUpdate = {
        r2Url,
        filename,
        fileSize: typeof fileSize === 'number' ? Math.min(Math.round(fileSize), 2147483647) : photo.fileSize,
        width: width || photo.width,
        height: height || photo.height,
        exif: updatedExif
      };
      if (!photo.thumbnailUrl && !isOldVideo && photo.r2Url) {
        dataToUpdate.thumbnailUrl = photo.r2Url;
      }

      const updatedPhoto = await prisma.photo.update({
        where: { id: photoId },
        data: dataToUpdate
      });
      r2ScanCache.delete(eventId);

      // Dispatch push notification for video releases (Coming Soon conversion or re-edit version update)
      setImmediate(async () => {
        try {
          const pushService = require('../../services/pushNotificationService');
          const effectiveCat = updatedExif.cinemaCategory || categoryLabelMap[detectedCat];

          if (isOldVideo && photo.r2Url !== r2Url && !wasComingSoon) {
            // 3F: Updated Version / Re-upload on the same poster
            await pushService.notifyUpdatedVideoVersion({
              eventId,
              videoTitle: updatedExif.title || photo.filename,
              videoId: photoId,
              category: effectiveCat
            });
          } else if (wasComingSoon) {
            // Converted from Coming Soon -> Dispatch corresponding category notification
            if (detectedCat === 'CANDID') {
              await pushService.notifyCandidReels({ eventId });
            } else if (detectedCat === 'STAGE') {
              await pushService.notifyDancePerformances({ eventId });
            } else if (detectedCat === 'EXTENDED') {
              await pushService.notifyExtendedCuts({ eventId });
            } else {
              await pushService.notifyCinemaHighlight({ eventId });
            }
          }
        } catch (pushErr) {
          req.log.warn('Video release push notification error:', pushErr?.message || pushErr);
        }
      });

      return {
        success: true,
        photo: {
          ...updatedPhoto,
          isComingSoon: false,
          hasBakedCover: Boolean(updatedExif.hasBakedCover || updatedExif.isCoverBaked),
          isCoverBaked: Boolean(updatedExif.hasBakedCover || updatedExif.isCoverBaked),
          videoReplacedAt: updatedExif.videoReplacedAt || null,
          version: updatedExif.version || 1
        }
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to attach video to film' });
    }
  });

  // Inspect orphaned files in R2 with root-cause categorization
  fastify.get('/api/gallery/events/:id/r2-orphans', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
    if (!event) return reply.code(404).send({ error: 'Event not found' });

    try {
      const forceRefresh = req.query.refresh === 'true';
      const scan = await scanEventR2Storage(event, { forceRefresh, log: req.log });
      return {
        success: true,
        eventId,
        ...scan
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to inspect R2 orphans: ' + err.message });
    }
  });

  // 1-Click Purge of orphaned files in R2
  fastify.post('/api/gallery/events/:id/r2-orphans/cleanup', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
    if (!event) return reply.code(404).send({ error: 'Event not found' });

    const canEdit = await canEditGallery(auth, eventId, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to delete assets from this gallery.' });
    }

    try {
      // Force a fresh scan to ensure no active or protected in-flight files are touched
      const scan = await scanEventR2Storage(event, { forceRefresh: true, log: req.log });
      if (!scan.enabled) {
        return reply.code(400).send({ error: scan.reason || 'R2 not available' });
      }

      const availableOrphanKeys = new Map(scan.orphans.map(o => [o.key, o]));
      const requestedKeys = Array.isArray(req.body?.keys) ? req.body.keys : null;

      const keysToDelete = [];
      let totalBytesFreed = 0;

      if (requestedKeys && requestedKeys.length > 0) {
        for (const k of requestedKeys) {
          if (availableOrphanKeys.has(k)) {
            keysToDelete.push(k);
            totalBytesFreed += availableOrphanKeys.get(k).size;
          }
        }
      } else {
        // Default: Purge all confirmed orphans (protected in-flight files are safely excluded)
        for (const orphan of scan.orphans) {
          keysToDelete.push(orphan.key);
          totalBytesFreed += orphan.size;
        }
      }

      if (keysToDelete.length === 0) {
        return {
          success: true,
          deletedCount: 0,
          freedBytes: 0,
          message: 'No eligible orphaned files found to delete.'
        };
      }

      let publicDomain = process.env.R2_PUBLIC_DOMAIN_URL || 'gallery.mistyvisuals.com';
      if (publicDomain.startsWith('http://')) publicDomain = publicDomain.substring(7);
      if (publicDomain.startsWith('https://')) publicDomain = publicDomain.substring(8);
      const urlsToDelete = keysToDelete.map(k => `https://${publicDomain}/${k}`);

      await deleteAssetsBatch(urlsToDelete);

      // Invalidate scan cache
      r2ScanCache.delete(eventId);

      return {
        success: true,
        deletedCount: keysToDelete.length,
        freedBytes: totalBytesFreed,
        message: `Successfully purged ${keysToDelete.length} orphaned file(s) (${(totalBytesFreed / (1024 * 1024)).toFixed(2)} MB freed).`
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to clean R2 orphans: ' + err.message });
    }
  });

  // Rescue / Adopt unlinked orphaned photos into the gallery
  fastify.post('/api/gallery/events/:id/r2-orphans/adopt', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
    if (!event) return reply.code(404).send({ error: 'Event not found' });

    const canEdit = await canEditGallery(auth, eventId, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const { keys, tabName = 'Uncategorized' } = req.body || {};
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return reply.code(400).send({ error: 'Missing or invalid keys array' });
    }

    const slug = (event.slug || '').toLowerCase().trim();
    let publicDomain = process.env.R2_PUBLIC_DOMAIN_URL || 'gallery.mistyvisuals.com';
    if (publicDomain.startsWith('http://')) publicDomain = publicDomain.substring(7);
    if (publicDomain.startsWith('https://')) publicDomain = publicDomain.substring(8);

    let adoptedCount = 0;
    const createdPhotos = [];

    for (const key of keys) {
      // Security check: Must belong to this event's slug
      if (!key.startsWith(`events/${slug}/`)) continue;

      const r2Url = `https://${publicDomain}/${key}`;
      const existing = await prisma.photo.findFirst({
        where: { eventId, r2Url }
      });
      if (existing) continue; // Already in DB

      const filename = path.basename(key);
      const ext = path.extname(filename).toLowerCase();
      const isVideo = ['.mp4', '.mov', '.m4v', '.webm'].includes(ext);
      const assignedTab = isVideo ? 'Cinema' : tabName;

      // Extract a clean display filename from the unique timestamped key
      const parts = filename.split('_');
      const baseClean = parts.length > 2 ? parts.slice(0, parts.length - 2).join('_') : parts[0];
      const cleanFilename = `${baseClean}${ext}`;

      const photo = await prisma.photo.create({
        data: {
          eventId,
          r2Url,
          thumbnailUrl: isVideo ? null : r2Url,
          filename: cleanFilename,
          fileSize: 0,
          tabName: assignedTab,
          facesScanned: isVideo ? true : false,
          exif: {
            adoptedFromOrphan: true,
            adoptedAt: new Date().toISOString(),
            originalR2Key: key
          }
        }
      });

      createdPhotos.push(photo);
      adoptedCount++;
    }

    // Invalidate scan cache
    r2ScanCache.delete(eventId);

    return {
      success: true,
      adoptedCount,
      message: `Successfully rescued ${adoptedCount} photo(s) into tab "${tabName}".`,
      photos: createdPhotos
    };
  });

  // Inspect and optionally clean up orphaned video files in R2 (legacy compatibility endpoint)
  fastify.get('/api/gallery/events/:id/cinema-r2-orphans', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
    if (!event) return reply.code(404).send({ error: 'Event not found' });

    try {
      const scan = await scanEventR2Storage(event, { forceRefresh: req.query.refresh === 'true', log: req.log });
      if (!scan.enabled) {
        return reply.code(400).send({ error: scan.reason || 'R2 not configured' });
      }

      // Filter to video orphans
      const videoOrphans = scan.orphans.filter(o => {
        const k = o.key.toLowerCase();
        return k.includes('/videos/') || k.endsWith('.mp4') || k.endsWith('.mov') || k.endsWith('.m4v') || k.endsWith('.webm');
      });

      const shouldDelete = req.query.delete === 'true';
      if (shouldDelete && videoOrphans.length > 0) {
        const canEdit = await canEditGallery(auth, eventId, pool);
        if (!canEdit) {
          return reply.code(403).send({ error: 'Access denied: You do not have permission to delete assets from this gallery.' });
        }
        let publicDomain = process.env.R2_PUBLIC_DOMAIN_URL || 'gallery.mistyvisuals.com';
        if (publicDomain.startsWith('http://')) publicDomain = publicDomain.substring(7);
        if (publicDomain.startsWith('https://')) publicDomain = publicDomain.substring(8);
        const urlsToDelete = videoOrphans.map(o => `https://${publicDomain}/${o.key}`);
        await deleteAssetsBatch(urlsToDelete);
        r2ScanCache.delete(eventId);
        return {
          success: true,
          message: `Cleaned up ${videoOrphans.length} orphaned video file(s) from R2 storage.`,
          deletedOrphans: videoOrphans
        };
      }

      return {
        success: true,
        orphansCount: videoOrphans.length,
        orphans: videoOrphans,
        metrics: scan
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to inspect cinema R2 orphans: ' + err.message });
    }
  });

  // Set or toggle featured video for a gallery (at most 1 featured video per gallery)
  fastify.post('/api/gallery/events/:id/photos/:photoId/feature', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const eventId = parseInt(req.params.id, 10);
    const photoId = parseInt(req.params.photoId, 10);
    const requestedState = req.body?.isFeatured;

    try {
      const photo = await prisma.photo.findFirst({
        where: { id: photoId, eventId }
      });
      if (!photo) {
        return reply.code(404).send({ error: 'Photo/video not found in this gallery' });
      }

      const isCurrentlyFeatured = Boolean(photo.exif && photo.exif.isFeatured);
      const newFeaturedState = typeof requestedState === 'boolean' ? requestedState : !isCurrentlyFeatured;

      if (newFeaturedState) {
        // Enforce at most 1 featured video per gallery: unfeature any other photos in this gallery
        const existingFeatured = await prisma.photo.findMany({
          where: { eventId, exif: { path: ['isFeatured'], equals: true } }
        });
        for (const ef of existingFeatured) {
          if (ef.id !== photoId) {
            await prisma.photo.update({
              where: { id: ef.id },
              data: { exif: { ...(ef.exif || {}), isFeatured: false } }
            });
          }
        }

        const updated = await prisma.photo.update({
          where: { id: photoId },
          data: { exif: { ...(photo.exif || {}), isFeatured: true } }
        });

        return {
          success: true,
          photoId,
          isFeatured: true,
          photo: updated
        };
      } else {
        const updated = await prisma.photo.update({
          where: { id: photoId },
          data: { exif: { ...(photo.exif || {}), isFeatured: false } }
        });

        return {
          success: true,
          photoId,
          isFeatured: false,
          photo: updated
        };
      }
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to update featured status' });
    }
  });

  // Update photo/video metadata (title, description, cinemaCategory, sortOrder, isFeatured)
  const handleUpdatePhotoMetadata = async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const eventId = parseInt(req.params.id, 10);
    const photoId = parseInt(req.params.photoId, 10);
    const { title, subtitle, description, cinemaCategory, sortOrder, isFeatured, tabName } = req.body || {};

    try {
      const photo = await prisma.photo.findFirst({
        where: { id: photoId, eventId }
      });
      if (!photo) {
        return reply.code(404).send({ error: 'Photo/video not found in this gallery' });
      }

      const curExif = (photo.exif && typeof photo.exif === 'object') ? photo.exif : {};
      const updatedExif = { ...curExif };

      if (title !== undefined) updatedExif.title = title ? String(title).trim() : null;
      if (subtitle !== undefined) updatedExif.subtitle = subtitle ? String(subtitle).trim() : null;
      if (description !== undefined) updatedExif.description = description ? String(description).trim() : null;
      if (cinemaCategory !== undefined) updatedExif.cinemaCategory = cinemaCategory ? String(cinemaCategory).trim() : null;
      if (sortOrder !== undefined) updatedExif.sortOrder = typeof sortOrder === 'number' ? sortOrder : parseInt(sortOrder, 10) || 0;
      if (isFeatured !== undefined) updatedExif.isFeatured = Boolean(isFeatured);
      if (req.body && req.body.isComingSoon !== undefined) updatedExif.isComingSoon = Boolean(req.body.isComingSoon);

      // If marked as featured, unfeature any other video in this gallery (at most 1 featured video per gallery)
      if (isFeatured) {
        const existingFeatured = await prisma.photo.findMany({
          where: { eventId, exif: { path: ['isFeatured'], equals: true } }
        });
        for (const ef of existingFeatured) {
          if (ef.id !== photoId) {
            await prisma.photo.update({
              where: { id: ef.id },
              data: { exif: { ...(ef.exif || {}), isFeatured: false } }
            });
          }
        }
      }

      const updateData = { exif: updatedExif };
      if (tabName !== undefined && typeof tabName === 'string') {
        updateData.tabName = tabName.trim();
      }

      const updated = await prisma.photo.update({
        where: { id: photoId },
        data: updateData
      });

      return {
        success: true,
        photoId,
        photo: {
          ...updated,
          title: updatedExif.title,
          subtitle: updatedExif.subtitle,
          description: updatedExif.description,
          cinemaCategory: updatedExif.cinemaCategory,
          sortOrder: updatedExif.sortOrder,
          isFeatured: Boolean(updatedExif.isFeatured),
          isComingSoon: Boolean(updatedExif.isComingSoon),
          hasBakedCover: Boolean(updatedExif.hasBakedCover || updatedExif.isCoverBaked)
        }
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to update photo/video metadata' });
    }
  };

  fastify.patch('/api/gallery/events/:id/photos/:photoId', handleUpdatePhotoMetadata);
  fastify.post('/api/gallery/events/:id/photos/:photoId/metadata', handleUpdatePhotoMetadata);

  // Reorder photos/videos in batch
  fastify.post('/api/gallery/events/:id/photos/reorder', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const eventId = parseInt(req.params.id, 10);
    const { orders } = req.body || {};

    if (!Array.isArray(orders) || orders.length === 0) {
      return reply.code(400).send({ error: 'Missing or invalid orders array' });
    }

    try {
      for (const item of orders) {
        const pId = parseInt(item.photoId || item.id, 10);
        const orderNum = parseInt(item.sortOrder, 10) || 0;
        if (pId) {
          const photo = await prisma.photo.findFirst({ where: { id: pId, eventId } });
          if (photo) {
            const curExif = (photo.exif && typeof photo.exif === 'object') ? photo.exif : {};
            const nextExif = { ...curExif, sortOrder: orderNum };
            if (item.cinemaCategory && typeof item.cinemaCategory === 'string') {
              nextExif.cinemaCategory = item.cinemaCategory.trim();
            }
            await prisma.photo.update({
              where: { id: pId },
              data: { exif: nextExif }
            });
          }
        }
      }

      return { success: true, count: orders.length };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to reorder photos/videos' });
    }
  });

  // Bulk upload photo metadata and face vectors
  fastify.post('/api/gallery/events/:id/photos/bulk', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

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
      const incomingMatchedIds = photos.map(p => p.matchedPhotoId).filter(Boolean);

      const existingPhotosMap = new Map();
      const existingPhotosDetailsMap = new Map();
      const existingPhotosByIdMap = new Map();

      const orQueries = [{ eventId, filename: { in: incomingFilenames } }];
      if (incomingMatchedIds.length > 0) {
        orQueries.push({ eventId, id: { in: incomingMatchedIds } });
      }

      const existingPhotosList = await prisma.photo.findMany({
        where: {
          OR: orQueries
        },
        select: { id: true, filename: true, tabName: true, r2Url: true, thumbnailUrl: true, exif: true, capturedAt: true }
      });
      existingPhotosList.forEach(ep => {
        const key = `${(ep.tabName || '').toLowerCase().trim()}::${(ep.filename || '').toLowerCase().trim()}`;
        existingPhotosMap.set(key, ep.id);
        existingPhotosDetailsMap.set(key, ep);
        existingPhotosByIdMap.set(ep.id, ep);
      });

      const vectorBatch = [];

      for (const p of photos) {
        const isHighlightsItem = (p.tabName || '').toLowerCase() === 'highlights' || p.syncHighlights === true;

        let matchedPhoto = null;
        if (p.matchedPhotoId && existingPhotosByIdMap.has(p.matchedPhotoId)) {
          matchedPhoto = existingPhotosByIdMap.get(p.matchedPhotoId);
        } else if (isHighlightsItem && !p.duplicateAction) {
          // Check if filename matches an existing ceremony photo in any other tab
          const fNameLower = (p.filename || '').toLowerCase().trim();
          const candidate = existingPhotosList.find(ep =>
            (ep.tabName || '').toLowerCase() !== 'highlights' &&
            ep.filename.toLowerCase().trim() === fNameLower
          );
          if (candidate) {
            matchedPhoto = candidate;
          }
        }

        const lookupKey = `${(p.tabName || '').toLowerCase().trim()}::${(p.filename || '').toLowerCase().trim()}`;
        const existingPhotoId = matchedPhoto ? matchedPhoto.id : existingPhotosMap.get(lookupKey);
        const oldPhoto = matchedPhoto || existingPhotosDetailsMap.get(lookupKey);

        // If duplicateAction is 'skip', skip database changes
        if (existingPhotoId && p.duplicateAction === 'skip') {
          results.push({ id: existingPhotoId, filename: p.filename, status: 'skipped' });
          continue;
        }

        const shouldCreateAsCopy = Boolean(p.duplicateAction === 'copy' || p.duplicateAction === 'keep_both');
        const effectiveExistingPhotoId = shouldCreateAsCopy ? null : existingPhotoId;

        const ext = path.extname(p.filename || '').toLowerCase();
        const isActualVideo = ext === '.mp4' || ext === '.mov' || ext === '.m4v' || ext === '.webm';
        const isCinemaTab = (p.tabName || '').toLowerCase() === 'cinema';
        const isCover = Boolean(p.hasBakedCover || (p.exif && (p.exif.hasBakedCover || p.exif.isCoverBaked)));
        const isPhotoOnlyCinema = isCinemaTab && !isActualVideo;
        const isSoon = Boolean(p.isComingSoon || (p.exif && p.exif.isComingSoon) || isPhotoOnlyCinema);
        const itemFacesScanned = (isCinemaTab || isActualVideo || isCover) ? true : facesScanned;

        const isFeaturedItem = Boolean(p.isFeatured || (p.exif && p.exif.isFeatured));
        let effectiveFeatured = isFeaturedItem;
        if (isFeaturedItem) {
          const existingFeatured = await prisma.photo.findMany({
            where: { eventId, exif: { path: ['isFeatured'], equals: true } }
          });
          // Do not demote existing featured video unless explicitly intended or updating the same photo
          if (existingFeatured.length > 0 && !p.overrideFeatured && (!effectiveExistingPhotoId || !existingFeatured.some(ef => ef.id === effectiveExistingPhotoId))) {
            effectiveFeatured = false;
          } else {
            for (const ef of existingFeatured) {
              if (ef.id !== effectiveExistingPhotoId) {
                await prisma.photo.update({
                  where: { id: ef.id },
                  data: { exif: { ...(ef.exif || {}), isFeatured: false } }
                });
              }
            }
          }
        }

        // Clamp integer fileSize to avoid PostgreSQL 32-bit Int overflow on large files (>2.14GB)
        const safeDbFileSize = typeof p.fileSize === 'number' ? Math.min(Math.round(p.fileSize), 2147483647) : 0;
        const safeDbOriginalSize = typeof p.originalSize === 'number' ? Math.min(Math.round(p.originalSize), 2147483647) : (safeDbFileSize || undefined);

        const oldExif = (oldPhoto && oldPhoto.exif && typeof oldPhoto.exif === 'object') ? oldPhoto.exif : {};
        const isReplacingVideo = isActualVideo && oldPhoto && oldPhoto.r2Url && oldPhoto.r2Url !== p.r2Url;

        const photoExif = {
          ...oldExif,
          ...(p.exif || {}),
          fileSize: p.fileSize, // Preserve full 64-bit size in JSON
          ...(effectiveFeatured ? { isFeatured: true } : { isFeatured: false }),
          ...(isSoon ? { isComingSoon: true } : { isComingSoon: false }),
          ...(p.hasBakedCover ? { hasBakedCover: true } : {}),
          ...(isHighlightsItem || oldExif.isHighlight ? {
            isHighlight: true,
            highlightUpgradedAt: new Date().toISOString(),
            originalRawFilename: oldPhoto ? oldPhoto.filename : p.filename
          } : {}),
          ...(isReplacingVideo ? {
            videoReplacedAt: new Date().toISOString(),
            version: (oldExif.version || 1) + 1
          } : {})
        };

        const photoThumb = p.thumbnailUrl || (isPhotoOnlyCinema ? p.r2Url : null);
        const targetTabName = matchedPhoto ? matchedPhoto.tabName : (p.tabName || undefined);

        let photo;
        if (effectiveExistingPhotoId) {
          // If replacing an existing record, automatically purge obsolete R2 assets to prevent storage leaks
          if (oldPhoto) {
            const oldUrlsToDelete = [];
            if (oldPhoto.r2Url && oldPhoto.r2Url !== p.r2Url) {
              oldUrlsToDelete.push(oldPhoto.r2Url);
            }
            if (oldPhoto.thumbnailUrl && oldPhoto.thumbnailUrl !== photoThumb && oldPhoto.thumbnailUrl !== oldPhoto.r2Url && oldPhoto.thumbnailUrl !== p.r2Url) {
              oldUrlsToDelete.push(oldPhoto.thumbnailUrl);
            }
            if (oldUrlsToDelete.length > 0) {
              deleteAssetsBatch(oldUrlsToDelete).catch(delErr => {
                req.log.warn({ err: delErr, urls: oldUrlsToDelete }, '[photos/bulk] Failed to delete replaced R2 assets');
              });
            }
          }

          photo = await prisma.photo.update({
            where: { id: effectiveExistingPhotoId },
            data: {
              r2Url: p.r2Url,
              thumbnailUrl: photoThumb || undefined,
              fileSize: safeDbFileSize,
              originalFileSize: safeDbOriginalSize,
              tabName: targetTabName,
              exif: photoExif || undefined,
              capturedAt: p.capturedAt ? new Date(p.capturedAt) : undefined,
              facesScanned: itemFacesScanned,
              width: p.width || undefined,
              height: p.height || undefined
            }
          });
        } else {
          photo = await prisma.photo.create({
            data: {
              eventId,
              r2Url: p.r2Url,
              thumbnailUrl: photoThumb,
              filename: p.filename,
              fileSize: safeDbFileSize,
              originalFileSize: safeDbOriginalSize || null,
              tabName: p.tabName || null,
              exif: photoExif,
              capturedAt: p.capturedAt ? new Date(p.capturedAt) : null,
              facesScanned: itemFacesScanned,
              width: p.width || null,
              height: p.height || null
            }
          });
          if (!shouldCreateAsCopy) {
            existingPhotosMap.set(lookupKey, photo.id);
            existingPhotosDetailsMap.set(lookupKey, photo);
          }
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
      const hasUnscannedInBatch = results.some(r => r.facesScanned === false);
      if (hasUnscannedInBatch) {
        updateData.galleryFacesComplete = false;
      }
      await prisma.galleryEvent.update({
        where: { id: eventId },
        data: updateData
      });
      r2ScanCache.delete(eventId);

      return { status: 'success', count: results.length, photos: results };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to upload photo metadata' });
    }
  });

  // Integrity check for a batch of photos
  fastify.post('/api/gallery/events/:id/integrity-check', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const eventId = parseInt(req.params.id, 10);
    const { photoIds = [], checkOnly = false } = req.body || {};

    try {
      const where = photoIds.length > 0
        ? { id: { in: photoIds.map(Number) }, eventId }
        : { eventId };

      const [total, facesUnscanned, localUrls, dimensionsMissing, exifMissing, tabCounts] = await Promise.all([
        prisma.photo.count({ where }),
        prisma.photo.count({ where: { ...where, facesScanned: false } }),
        prisma.photo.count({ where: { ...where, r2Url: { startsWith: '/api/' } } }),
        prisma.photo.count({ where: { ...where, OR: [{ width: null }, { height: null }] } }),
        prisma.photo.count({ where: { ...where, exif: { equals: Prisma.DbNull } } }).catch(() => 0),
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

      // Dispatch automated post-upload notifications asynchronously
      setImmediate(async () => {
        try {
          // Guard 1: Only notify if photos were actually uploaded and it's not a read-only diagnostics/report call
          if (checkOnly || !Array.isArray(photoIds) || photoIds.length === 0) {
            return;
          }

          // Guard 2: Server-side debounce (30s cooldown per event) to prevent duplicate triggers from rapid batches/retries
          const now = Date.now();
          const lastPush = recentIntegrityPushes.get(eventId);
          if (lastPush && (now - lastPush < 30000)) {
            req.log?.info?.(`[IntegrityCheck Push] Throttled: Event ${eventId} notification already dispatched ${Math.round((now - lastPush) / 1000)}s ago. Skipping duplicate.`);
            return;
          }
          recentIntegrityPushes.set(eventId, now);

          const pushService = require('../../services/pushNotificationService');
          const event = await prisma.galleryEvent.findUnique({ where: { id: eventId } });
          if (!event || !event.active) return;

          // Find active guests for this event
          const guests = await prisma.guest.findMany({
            where: { eventId, isBlocked: false },
            include: { circleUser: { select: { id: true, selfieVector: true } } }
          });
          if (guests.length === 0) return;

          const notifiedGuestEmails = new Set();

          // 1. Check AI face matches in Qdrant for guests who have a selfie
          if (photoIds.length > 0) {
            const numericPhotoIds = new Set(photoIds.map(Number));
            for (const g of guests) {
              let vector = g.circleUser?.selfieVector;
              if (typeof vector === 'string') {
                try { vector = JSON.parse(vector); } catch (_) {}
              }
              if (Array.isArray(vector) && vector.length > 0) {
                try {
                  const matchRes = await qdrant.searchVectors(eventId, vector, 250, 0.35);
                  const matchedNewPhotos = (matchRes || []).filter(m => {
                    const pId = Number(m.photo_id || m.photoId || m.id);
                    return numericPhotoIds.has(pId);
                  });
                  if (matchedNewPhotos.length > 0) {
                    notifiedGuestEmails.add(g.email);
                    await pushService.notifyNewFaceMatches({
                      eventId,
                      email: g.email,
                      count: matchedNewPhotos.length
                    });
                  }
                } catch (matchErr) {
                  console.warn('[IntegrityCheck Push] Face match search error:', matchErr?.message || matchErr);
                }
              }
            }
          }

          // 2. For guests not notified of personal matches, notify about the ceremony/batch
          const remainingGuests = guests.filter(g => !notifiedGuestEmails.has(g.email));
          if (remainingGuests.length > 0 && tabCounts.length > 0) {
            const primaryTab = tabCounts[0]?.tabName;
            const isCinema = String(primaryTab || '').toUpperCase() === 'CINEMA';
            const excluded = Array.from(notifiedGuestEmails);

            // Check if this is the very first batch of photos ever uploaded to the celebration (Scenario 4)
            const totalEventPhotos = await prisma.photo.count({ where: { eventId } });
            const currentBatchTotal = photoIds.length || total;
            const isInitialGalleryLaunch = totalEventPhotos <= currentBatchTotal + 5;

            if (isInitialGalleryLaunch && !isCinema) {
              // 4: Initial Gallery Launch
              await pushService.notifyInitialGalleryLaunch({ eventId, excludeEmails: excluded });
            } else if (isCinema) {
              const comingSoonCount = await prisma.photo.count({
                where: { ...where, tabName: { equals: 'Cinema', mode: 'insensitive' }, exif: { path: ['isComingSoon'], equals: true } }
              });
              if (comingSoonCount > 0) {
                // 3E: Teaser poster
                await pushService.notifyComingSoonTeaser({ eventId, excludeEmails: excluded });
              } else {
                // Actual video release uploaded via desktop uploader
                const firstVideo = await prisma.photo.findFirst({
                  where: { ...where, tabName: { equals: 'Cinema', mode: 'insensitive' } },
                  select: { id: true, filename: true, exif: true },
                  orderBy: { id: 'desc' }
                });
                const cat = resolveCinemaCategory(firstVideo?.exif?.cinemaCategory, firstVideo?.filename, firstVideo?.exif?.title);
                if (cat === 'CANDID') {
                  await pushService.notifyCandidReels({ eventId, excludeEmails: excluded });
                } else if (cat === 'STAGE') {
                  await pushService.notifyDancePerformances({ eventId, excludeEmails: excluded });
                } else if (cat === 'EXTENDED') {
                  await pushService.notifyExtendedCuts({ eventId, excludeEmails: excluded });
                } else {
                  await pushService.notifyCinemaHighlight({ eventId, excludeEmails: excluded });
                }
              }
            } else if (String(primaryTab || '').trim().toLowerCase() === 'highlights') {
              const allHighlightsCount = await prisma.photo.count({
                where: {
                  eventId,
                  OR: [
                    { tabName: { equals: 'Highlights', mode: 'insensitive' } },
                    { exif: { path: ['isHighlight'], equals: true } }
                  ]
                }
              });
              const isFirstBatch = allHighlightsCount <= (tabCounts[0]?._count?._all || 0) + 10;
              await pushService.notifyHighlightsDrop({
                eventId,
                isFirstBatch,
                excludeEmails: excluded,
              });
            } else {
              const allTabPhotosCount = await prisma.photo.count({
                where: { eventId, tabName: primaryTab }
              });

              if (allTabPhotosCount <= (tabCounts[0]?._count?._all || 0) + 10) {
                // 2A: Brand new ceremony tab
                await pushService.notifyNewCeremonyTab({
                  eventId,
                  ceremonyName: primaryTab || 'Celebration',
                  excludeEmails: excluded,
                });
              } else {
                // 2B: More photos added to existing album
                await pushService.notifyMorePhotosAdded({
                  eventId,
                  ceremonyName: primaryTab || 'celebration',
                  excludeEmails: excluded,
                });
              }
            }
          }
        } catch (notifErr) {
          req.log.warn('Post-upload notification error:', notifErr?.message || notifErr);
        }
      });

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
    const auth = requireAuth(req, reply);
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

  // Update photo thumbnail URL (used by desktop backfill engine)
  fastify.patch('/api/gallery/events/:id/photos/:photoId/thumbnail', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const eventId = parseInt(req.params.id, 10);
    const photoId = parseInt(req.params.photoId, 10);
    const { thumbnailUrl } = req.body || {};

    if (!thumbnailUrl || typeof thumbnailUrl !== 'string') {
      return reply.code(400).send({ error: 'Missing or invalid thumbnailUrl' });
    }

    try {
      const photo = await prisma.photo.findFirst({
        where: { id: photoId, eventId }
      });
      if (!photo) {
        return reply.code(404).send({ error: 'Photo not found in this event' });
      }

      const updated = await prisma.photo.update({
        where: { id: photoId },
        data: { thumbnailUrl }
      });

      return { success: true, photo: updated };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to update photo thumbnail' });
    }
  });

  // Fetch unscanned photos / photos missing thumbnails for an event
  fastify.get('/api/gallery/events/:id/photos/unscanned', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const eventId = parseInt(req.params.id, 10);
    try {
      const pendingWhere = {
        eventId,
        OR: [
          { facesScanned: false },
          { thumbnailUrl: null }
        ],
        NOT: [
          { filename: { endsWith: '.mp4', mode: 'insensitive' } },
          { filename: { endsWith: '.mov', mode: 'insensitive' } },
          { filename: { endsWith: '.m4v', mode: 'insensitive' } },
          { filename: { endsWith: '.webm', mode: 'insensitive' } },
          { r2Url: { endsWith: '.mp4', mode: 'insensitive' } },
          { r2Url: { endsWith: '.mov', mode: 'insensitive' } },
          { r2Url: { endsWith: '.m4v', mode: 'insensitive' } },
          { r2Url: { endsWith: '.webm', mode: 'insensitive' } },
          { tabName: { equals: 'cinema', mode: 'insensitive' } },
          { exif: { path: ['hasBakedCover'], equals: true } },
          { exif: { path: ['isCoverBaked'], equals: true } }
        ]
      };

      const totalUnscanned = await prisma.photo.count({
        where: pendingWhere
      });
      const rawPhotos = await prisma.photo.findMany({
        where: pendingWhere,
        select: {
          id: true,
          r2Url: true,
          filename: true,
          facesScanned: true,
          thumbnailUrl: true,
          tabName: true,
          exif: true
        },
        take: 100
      });
      const photos = rawPhotos.filter(p => {
        const isCover = Boolean(p.exif && (p.exif.hasBakedCover === true || p.exif.isCoverBaked === true));
        return !isCover;
      });
      return { totalUnscanned, photos };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch unscanned photos' });
    }
  });

  // Reset thumbnails for a single event (deletes R2 thumbnail assets and sets thumbnailUrl = null)
  fastify.post('/api/gallery/events/:id/reset-thumbnails', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const canEdit = await canEditGallery(auth, req.params.id, pool);
    if (!canEdit) {
      return reply.code(403).send({ error: 'Access denied: You do not have permission to edit this gallery.' });
    }

    const eventId = parseInt(req.params.id, 10);
    try {
      const resetWhere = {
        eventId,
        thumbnailUrl: { not: null },
        NOT: [
          { filename: { endsWith: '.mp4', mode: 'insensitive' } },
          { filename: { endsWith: '.mov', mode: 'insensitive' } },
          { filename: { endsWith: '.m4v', mode: 'insensitive' } },
          { filename: { endsWith: '.webm', mode: 'insensitive' } },
          { r2Url: { endsWith: '.mp4', mode: 'insensitive' } },
          { r2Url: { endsWith: '.mov', mode: 'insensitive' } },
          { r2Url: { endsWith: '.m4v', mode: 'insensitive' } },
          { r2Url: { endsWith: '.webm', mode: 'insensitive' } },
          { tabName: { equals: 'cinema', mode: 'insensitive' } }
        ]
      };

      const photos = await prisma.photo.findMany({
        where: resetWhere,
        select: { id: true, thumbnailUrl: true }
      });

      const thumbUrls = photos.map(p => p.thumbnailUrl).filter(Boolean);
      if (thumbUrls.length > 0) {
        await deleteAssetsBatch(thumbUrls);
      }

      const updated = await prisma.photo.updateMany({
        where: resetWhere,
        data: { thumbnailUrl: null }
      });

      return { success: true, resetCount: updated.count, deletedR2Count: thumbUrls.length };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to reset thumbnails' });
    }
  });

  // Reset all thumbnails system-wide (Admin only — deletes all R2 thumbnails and sets thumbnailUrl = null)
  fastify.post('/api/gallery/reset-all-thumbnails', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    const isAdmin = Array.isArray(auth.roles) ? auth.roles.includes('admin') : auth.role === 'admin';
    if (!isAdmin) {
      return reply.code(403).send({ error: 'Admin access required' });
    }

    try {
      const resetWhere = {
        thumbnailUrl: { not: null },
        NOT: [
          { filename: { endsWith: '.mp4', mode: 'insensitive' } },
          { filename: { endsWith: '.mov', mode: 'insensitive' } },
          { filename: { endsWith: '.m4v', mode: 'insensitive' } },
          { filename: { endsWith: '.webm', mode: 'insensitive' } },
          { r2Url: { endsWith: '.mp4', mode: 'insensitive' } },
          { r2Url: { endsWith: '.mov', mode: 'insensitive' } },
          { r2Url: { endsWith: '.m4v', mode: 'insensitive' } },
          { r2Url: { endsWith: '.webm', mode: 'insensitive' } },
          { tabName: { equals: 'cinema', mode: 'insensitive' } }
        ]
      };

      const photos = await prisma.photo.findMany({
        where: resetWhere,
        select: { id: true, thumbnailUrl: true }
      });

      const thumbUrls = photos.map(p => p.thumbnailUrl).filter(Boolean);
      if (thumbUrls.length > 0) {
        await deleteAssetsBatch(thumbUrls);
      }

      const updated = await prisma.photo.updateMany({
        where: resetWhere,
        data: { thumbnailUrl: null }
      });

      return {
        success: true,
        resetDbCount: updated.count,
        deletedR2Count: thumbUrls.length
      };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Failed to reset all thumbnails' });
    }
  });
};
