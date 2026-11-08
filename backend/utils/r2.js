const { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const { PHOTO_UPLOAD_DIR } = require('../config/constants');

// Load environment variables for local testing
const isR2Enabled = !!(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME
);

let r2Client = null;
if (isR2Enabled) {
  r2Client = new S3Client({
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    },
    region: 'auto'
  });
}

/**
 * Uploads a file buffer to Cloudflare R2 if configured, or saves it to local disk in development mode.
 * @param {Buffer} buffer - File data buffer
 * @param {string} filename - Target filename
 * @param {string} subfolder - Organized subdirectory path (e.g. 'events/slug/photos')
 * @param {string} contentType - Mime type of the file
 * @returns {Promise<string>} The public URL of the uploaded asset
 */
async function uploadAsset(buffer, filename, subfolder, contentType = 'image/jpeg') {
  const key = subfolder ? `${subfolder}/${filename}` : filename;

  if (isR2Enabled) {
    const uploadParams = {
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable'
    };
    await r2Client.send(new PutObjectCommand(uploadParams));
    
    // Remove protocol double-slashes in custom domain if user provided https:// prefix in env
    let publicDomain = (process.env.R2_PUBLIC_DOMAIN_URL || process.env.R2_PUBLIC_DOMAIN || 'gallery.mistyvisuals.com').trim();
    if (publicDomain.startsWith('http://')) publicDomain = publicDomain.substring(7);
    if (publicDomain.startsWith('https://')) publicDomain = publicDomain.substring(8);
    publicDomain = publicDomain.replace(/\/$/, '');
    
    return `https://${publicDomain}/${key}`;
  } else {
    // Only allow local disk fallback in development mode
    if (process.env.NODE_ENV === 'production') {
      throw new Error('R2 storage is not configured/enabled. Local fallback is disabled in production.');
    }

    const targetDir = path.join(PHOTO_UPLOAD_DIR, subfolder || '');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const destPath = path.join(targetDir, filename);
    fs.writeFileSync(destPath, buffer);
    return `/api/photos/file/${key}`;
  }
}

/**
 * Deletes an asset from Cloudflare R2, or removes it from local disk in development mode.
 * @param {string} fileUrl - Public URL or local routing path
 * @returns {Promise<void>}
 */
async function deleteAsset(fileUrl) {
  if (!fileUrl) return;

  if (isR2Enabled) {
    // Extract key from public URL (everything after domain)
    let key = '';
    try {
      const parsed = new URL(fileUrl);
      key = decodeURIComponent(parsed.pathname.substring(1)); // strip leading slash and decode
    } catch (e) {
      // Fallback: parse relative path if not a valid URL
      key = decodeURIComponent(fileUrl.replace(/^\/?api\/photos\/file\//, ''));
    }
    if (key) {
      const deleteParams = {
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key
      };
      try {
        await r2Client.send(new DeleteObjectCommand(deleteParams));
      } catch (err) {
        console.error(`[R2 Delete Error] Failed to delete asset: ${key}`, err);
      }
    }
  } else {
    // Only allow local disk fallback in development mode
    if (process.env.NODE_ENV === 'production') {
      throw new Error('R2 storage is not configured/enabled. Local fallback is disabled in production.');
    }

    const relativePath = decodeURIComponent(fileUrl.replace(/^\/?api\/photos\/file\//, ''));
    const filePath = path.normalize(path.join(PHOTO_UPLOAD_DIR, relativePath));
    if (filePath.startsWith(PHOTO_UPLOAD_DIR) && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`[Local Delete Error] Failed to delete file: ${filePath}`, err);
      }
    }
  }
}

/**
 * Deletes multiple assets from Cloudflare R2 in high-speed batches of 1000.
 * @param {string[]} fileUrls - Array of public URLs or local routing paths
 * @returns {Promise<void>}
 */
async function deleteAssetsBatch(fileUrls) {
  if (!fileUrls || !Array.isArray(fileUrls) || fileUrls.length === 0) return;

  if (isR2Enabled) {
    const keys = [];
    for (const url of fileUrls) {
      if (!url) continue;
      let key = '';
      try {
        const parsed = new URL(url);
        key = decodeURIComponent(parsed.pathname.substring(1));
      } catch (e) {
        key = decodeURIComponent(url.replace(/^\/?api\/photos\/file\//, ''));
      }
      if (key) keys.push(key);
    }

    if (keys.length === 0) return;

    const BATCH_SIZE = 1000;
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);
      const deleteParams = {
        Bucket: process.env.R2_BUCKET_NAME,
        Delete: {
          Objects: batch.map(k => ({ Key: k })),
          Quiet: true
        }
      };
      try {
        await r2Client.send(new DeleteObjectsCommand(deleteParams));
      } catch (err) {
        console.error('[R2 Batch Delete Error] Failed to delete assets batch:', err);
      }
    }
  } else {
    for (const fileUrl of fileUrls) {
      await deleteAsset(fileUrl);
    }
  }
}

async function getPresignedUploadUrl(key, contentType = 'image/jpeg') {
  if (isR2Enabled) {
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable'
    });
    return await getSignedUrl(r2Client, command, { expiresIn: 3600 });
  } else {
    // ── FIX: In production, a missing R2 config is a hard error.
    // Returning a fake local path would create broken URLs in the DB that
    // guests can never access — better to fail loudly now than silently later.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'R2 storage is not configured (missing R2_* env vars). ' +
        'Cannot generate upload URLs in production. ' +
        'Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_DOMAIN_URL in .env.'
      );
    }
    // Dev only: return a local path stub so the uploader can still test without R2
    return `/api/photos/file/${key}`;
  }
}

async function getObjectStream(key) {
  if (isR2Enabled) {
    const response = await r2Client.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key
    }));
    return response.Body; // Readable stream
  } else {
    // development fallback
    const relativePath = decodeURIComponent(key.replace(/^\/?api\/photos\/file\//, ''));
    const targetPath = path.normalize(path.join(PHOTO_UPLOAD_DIR, relativePath));
    if (fs.existsSync(targetPath)) {
      return fs.createReadStream(targetPath);
    }
    throw new Error('File not found');
  }
}

/**
 * Uploads a website asset buffer to Cloudflare R2 if configured, or saves it to local disk under media/website in development mode.
 * @param {Buffer} buffer - File data buffer
 * @param {string} filename - Target filename
 * @param {string} subfolder - Organized subdirectory path (e.g. 'stories/slug/desktop')
 * @param {string} contentType - Mime type of the file
 * @returns {Promise<string>} The public URL of the uploaded asset
 */
async function uploadWebsiteAsset(buffer, filename, subfolder, contentType = 'image/webp') {
  const key = subfolder ? `website/${subfolder}/${filename}` : `website/${filename}`;

  if (isR2Enabled) {
    const uploadParams = {
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable'
    };
    await r2Client.send(new PutObjectCommand(uploadParams));
    
    let publicDomain = (process.env.R2_PUBLIC_DOMAIN_URL || process.env.R2_PUBLIC_DOMAIN || 'gallery.mistyvisuals.com').trim();
    if (publicDomain.startsWith('http://')) publicDomain = publicDomain.substring(7);
    if (publicDomain.startsWith('https://')) publicDomain = publicDomain.substring(8);
    publicDomain = publicDomain.replace(/\/$/, '');
    
    return `https://${publicDomain}/${key}`;
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('R2 storage is not configured/enabled. Local fallback is disabled in production.');
    }

    const WEBSITE_MEDIA_DIR = process.env.WEBSITE_MEDIA_DIR || path.join(process.cwd(), 'media', 'website');
    const targetDir = path.join(WEBSITE_MEDIA_DIR, subfolder || '');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const destPath = path.join(targetDir, filename);
    fs.writeFileSync(destPath, buffer);
    return `/media/website/${subfolder ? `${subfolder}/${filename}` : filename}`;
  }
}

/**
 * Deletes a website asset from Cloudflare R2, or removes it from local disk in development mode.
 * @param {string} fileUrl - Public URL or local routing path
 * @returns {Promise<void>}
 */
async function deleteWebsiteAsset(fileUrl) {
  if (!fileUrl) return;

  if (isR2Enabled) {
    let key = '';
    try {
      const parsed = new URL(fileUrl);
      key = decodeURIComponent(parsed.pathname.substring(1)); // strip leading slash and decode
    } catch (e) {
      key = decodeURIComponent(fileUrl.replace(/^\/?media\/website\//, 'website/'));
    }
    if (key) {
      const deleteParams = {
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key
      };
      try {
        await r2Client.send(new DeleteObjectCommand(deleteParams));
      } catch (err) {
        console.error(`[R2 Delete Error] Failed to delete website asset: ${key}`, err);
      }
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('R2 storage is not configured/enabled. Local fallback is disabled in production.');
    }

    const relativePath = decodeURIComponent(fileUrl.replace(/^\/?media\/website\//, ''));
    const WEBSITE_MEDIA_DIR = process.env.WEBSITE_MEDIA_DIR || path.join(process.cwd(), 'media', 'website');
    const filePath = path.normalize(path.join(WEBSITE_MEDIA_DIR, relativePath));
    if (filePath.startsWith(WEBSITE_MEDIA_DIR) && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`[Local Delete Error] Failed to delete file: ${filePath}`, err);
      }
    }
  }
}

/**
 * Uploads a private client onboarding selfie.
 * Unlike public assets, this NEVER sets public cache control or returns a public CDN URL.
 * It stores under a private prefix in R2 or local disk and returns the storage key.
 * @param {Buffer} buffer - Image buffer
 * @param {string} filename - Target filename (e.g. selfie_bride_1793648851378.jpg)
 * @param {string} projectId - Project UUID
 * @param {string} contentType - Mime type (default: 'image/jpeg')
 * @returns {Promise<{ storageKey: string }>} Storage key to be stored in DB
 */
async function uploadPrivateSelfie(buffer, filename, projectId, contentType = 'image/jpeg') {
  const safeFilename = path.basename(filename);
  const key = `private/portals/${projectId}/selfies/${safeFilename}`;

  if (isR2Enabled) {
    const uploadParams = {
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'private, no-cache, no-store, must-revalidate'
    };
    await r2Client.send(new PutObjectCommand(uploadParams));
    return { storageKey: key };
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('R2 storage is not configured/enabled. Local fallback is disabled in production.');
    }
    const targetDir = path.join(PHOTO_UPLOAD_DIR, 'private', 'portals', projectId, 'selfies');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const destPath = path.join(targetDir, safeFilename);
    fs.writeFileSync(destPath, buffer);
    return { storageKey: key };
  }
}

/**
 * Streams a private selfie securely for authenticated requests.
 * @param {string} storageKey - e.g. 'private/portals/:projectId/selfies/:filename'
 * @returns {Promise<ReadableStream>}
 */
async function getPrivateSelfieStream(storageKey) {
  if (!storageKey) throw new Error('Storage key is required');

  if (isR2Enabled) {
    const response = await r2Client.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: storageKey
    }));
    return response.Body;
  } else {
    // Development local fallback
    // Normalize and prevent path traversal
    const normalizedKey = path.normalize(storageKey).replace(/^(\.\.[\/\\])+/, '');
    const targetPath = path.normalize(path.join(PHOTO_UPLOAD_DIR, normalizedKey));
    if (!targetPath.startsWith(PHOTO_UPLOAD_DIR)) {
      throw new Error('Access denied: Invalid storage path');
    }
    if (fs.existsSync(targetPath)) {
      return fs.createReadStream(targetPath);
    }
    // Backward compatibility fallback: check legacy non-private path if exists
    const legacyKey = normalizedKey.replace(/^private[\/\\]/, '');
    const legacyPath = path.normalize(path.join(PHOTO_UPLOAD_DIR, legacyKey));
    if (legacyPath.startsWith(PHOTO_UPLOAD_DIR) && fs.existsSync(legacyPath)) {
      return fs.createReadStream(legacyPath);
    }
    throw new Error('Selfie file not found');
  }
}

/**
 * Deletes a private selfie asset from R2 or local disk.
 * @param {string} storageKey - Private storage key or legacy public URL
 */
async function deletePrivateSelfie(storageKey) {
  if (!storageKey) return;

  if (isR2Enabled) {
    let key = storageKey;
    try {
      if (storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
        const parsed = new URL(storageKey);
        key = decodeURIComponent(parsed.pathname.substring(1));
      }
    } catch {}
    try {
      await r2Client.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key
      }));
    } catch (err) {
      console.error(`[R2 Private Delete Error] Failed to delete: ${key}`, err);
    }
  } else {
    const normalizedKey = path.normalize(storageKey.replace(/^\/?api\/photos\/file\//, '')).replace(/^(\.\.[\/\\])+/, '');
    const targetPath = path.normalize(path.join(PHOTO_UPLOAD_DIR, normalizedKey));
    if (targetPath.startsWith(PHOTO_UPLOAD_DIR) && fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch (err) {
        console.error(`[Local Private Delete Error] Failed to delete: ${targetPath}`, err);
      }
    }
    // Also try without private prefix if legacy
    const legacyKey = normalizedKey.replace(/^private[\/\\]/, '');
    const legacyPath = path.normalize(path.join(PHOTO_UPLOAD_DIR, legacyKey));
    if (legacyPath !== targetPath && legacyPath.startsWith(PHOTO_UPLOAD_DIR) && fs.existsSync(legacyPath)) {
      try {
        fs.unlinkSync(legacyPath);
      } catch {}
    }
  }
}

/**
 * Generates presigned URL for direct questionnaire media uploads (browser-to-R2)
 * @param {string} key - S3/R2 object storage key
 * @param {string} contentType - File MIME type
 * @param {boolean} isPrivate - If true, family photos omit public cache headers
 */
async function getQuestionnaireUploadPresignedUrl(key, contentType = 'image/jpeg', isPrivate = false) {
  if (isR2Enabled) {
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      ...(isPrivate ? {} : { CacheControl: 'public, max-age=31536000, immutable' })
    });
    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
    let publicDomain = (process.env.R2_PUBLIC_DOMAIN_URL || 'gallery.mistyvisuals.com').trim();
    if (publicDomain.startsWith('http://')) publicDomain = publicDomain.substring(7);
    if (publicDomain.startsWith('https://')) publicDomain = publicDomain.substring(8);
    publicDomain = publicDomain.replace(/\/$/, '');
    const publicUrl = `https://${publicDomain}/${key}`;
    return {
      uploadUrl,
      publicUrl,
      fileUrl: publicUrl,
      storageKey: key,
      isR2: true
    };
  } else {
    // Development fallback when R2 is not configured
    const fileUrl = `/api/photos/file/${key}`;
    return {
      uploadUrl: null,
      publicUrl: fileUrl,
      fileUrl,
      storageKey: key,
      isR2: false
    };
  }
}

module.exports = {
  isR2Enabled,
  uploadAsset,
  deleteAsset,
  deleteAssetsBatch,
  getPresignedUploadUrl,
  getQuestionnaireUploadPresignedUrl,
  getObjectStream,
  uploadWebsiteAsset,
  deleteWebsiteAsset,
  uploadPrivateSelfie,
  getPrivateSelfieStream,
  deletePrivateSelfie
};
