/**
 * Website Image Optimization Pipeline
 * Uses Sharp to generate responsive WebP variants + blur placeholder.
 *
 * Media directory structure:
 *   /media/website/stories/{slug}/desktop/{hash}.webp   (1920px, quality 82) — PUBLIC
 *   /media/website/stories/{slug}/mobile/{hash}.webp    ( 800px, quality 78) — PUBLIC
 *   /media/website/stories/{slug}/thumbs/{hash}.webp    ( 400px, quality 70) — PUBLIC
 *   /media/website/stories/{slug}/originals/{hash}.jpg  (archival, NOT publicly served)
 *
 *   /media/website/homepage/hero/{ts}-desktop.webp      (2560px) — PUBLIC
 *   /media/website/homepage/hero/{ts}-mobile.webp       (1080px) — PUBLIC
 *
 *   /media/website/films/{id}/thumb/{ts}.webp            — PUBLIC
 */

const path = require('path')
const fs   = require('fs')
const crypto = require('crypto')
const { isR2Enabled, uploadWebsiteAsset } = require('./r2')

let sharp
try {
  sharp = require('sharp')
} catch {
  console.error('[website-images] FATAL: sharp is not installed. Run: npm install sharp')
  process.exit(1)
}

const WEBSITE_MEDIA_DIR = process.env.WEBSITE_MEDIA_DIR
  || path.join(process.cwd(), 'media', 'website')

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

/**
 * Generate a tiny base64 blur placeholder (~10px wide).
 * @param {Buffer} inputBuffer
 * @returns {Promise<string>} data:image/webp;base64,....
 */
async function generateBlurPlaceholder(inputBuffer) {
  const tinyBuf = await sharp(inputBuffer)
    .resize(16, null, { fit: 'inside' })
    .webp({ quality: 20 })
    .toBuffer()
  return `data:image/webp;base64,${tinyBuf.toString('base64')}`
}

/**
 * Process a story photo upload.
 * Saves archival JPEG + three WebP variants + blur placeholder.
 *
 * @param {Buffer} inputBuffer   Raw file buffer from multipart upload
 * @param {string} slug          Story slug (used for directory path)
 * @param {string} [originalFilename]
 * @returns {Promise<{
 *   fileUrl: string,
 *   fileUrlMobile: string,
 *   fileUrlThumb: string,
 *   blurDataUrl: string,
 *   hash: string,
 * }>}
 */
async function processStoryPhoto(inputBuffer, slug, originalFilename = '') {
  const hash = crypto
    .createHash('sha256')
    .update(inputBuffer)
    .digest('hex')
    .slice(0, 24)

  const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase()

  const dirs = {
    desktop:   path.join(WEBSITE_MEDIA_DIR, 'stories', safeSlug, 'desktop'),
    mobile:    path.join(WEBSITE_MEDIA_DIR, 'stories', safeSlug, 'mobile'),
    thumbs:    path.join(WEBSITE_MEDIA_DIR, 'stories', safeSlug, 'thumbs'),
  }

  const metadata = await sharp(inputBuffer).metadata()
  const isPortrait = metadata.height > metadata.width

  // Resolve dimensions — never upscale
  const desktopWidth  = Math.min(1920, metadata.width)
  const mobileWidth   = Math.min(800, metadata.width)
  const thumbWidth    = Math.min(400, metadata.width)

  const sharpOpts = { fit: 'inside', withoutEnlargement: true }

  const desktopFile = `${hash}.webp`
  const mobileFile = `${hash}.webp`
  const thumbFile = `${hash}.webp`

  let fileUrl, fileUrlMobile, fileUrlThumb

  if (!isR2Enabled && process.env.NODE_ENV === 'production') {
    throw new Error('R2 storage is not configured/enabled. Local fallback is disabled in production.');
  }

  if (isR2Enabled) {
    const desktopBuffer = await sharp(inputBuffer)
      .resize(desktopWidth, null, sharpOpts)
      .webp({ quality: 82, effort: 4 })
      .toBuffer()
    fileUrl = await uploadWebsiteAsset(desktopBuffer, desktopFile, `stories/${safeSlug}/desktop`, 'image/webp')

    const mobileBuffer = await sharp(inputBuffer)
      .resize(mobileWidth, null, sharpOpts)
      .webp({ quality: 78, effort: 4 })
      .toBuffer()
    fileUrlMobile = await uploadWebsiteAsset(mobileBuffer, mobileFile, `stories/${safeSlug}/mobile`, 'image/webp')

    const thumbBuffer = await sharp(inputBuffer)
      .resize(thumbWidth, null, sharpOpts)
      .webp({ quality: 70, effort: 4 })
      .toBuffer()
    fileUrlThumb = await uploadWebsiteAsset(thumbBuffer, thumbFile, `stories/${safeSlug}/thumbs`, 'image/webp')
  } else {
    for (const dir of Object.values(dirs)) ensureDir(dir)

    const desktopPath = path.join(dirs.desktop, desktopFile)
    if (!fs.existsSync(desktopPath)) {
      await sharp(inputBuffer)
        .resize(desktopWidth, null, sharpOpts)
        .webp({ quality: 82, effort: 4 })
        .toFile(desktopPath)
    }

    const mobilePath = path.join(dirs.mobile, mobileFile)
    if (!fs.existsSync(mobilePath)) {
      await sharp(inputBuffer)
        .resize(mobileWidth, null, sharpOpts)
        .webp({ quality: 78, effort: 4 })
        .toFile(mobilePath)
    }

    const thumbPath = path.join(dirs.thumbs, thumbFile)
    if (!fs.existsSync(thumbPath)) {
      await sharp(inputBuffer)
        .resize(thumbWidth, null, sharpOpts)
        .webp({ quality: 70, effort: 4 })
        .toFile(thumbPath)
    }

    fileUrl       = `/media/website/stories/${safeSlug}/desktop/${desktopFile}`
    fileUrlMobile = `/media/website/stories/${safeSlug}/mobile/${mobileFile}`
    fileUrlThumb  = `/media/website/stories/${safeSlug}/thumbs/${thumbFile}`
  }

  // Blur placeholder
  const blurDataUrl = await generateBlurPlaceholder(inputBuffer)

  return {
    hash,
    fileUrl,
    fileUrlMobile,
    fileUrlThumb,
    blurDataUrl,
  }
}

/**
 * Process a hero image upload.
 * Generates desktop (2560px) and mobile (1080px) WebP variants.
 *
 * @param {Buffer} inputBuffer
 * @returns {Promise<{mediaUrl: string, mobileUrl: string, blurDataUrl: string}>}
 */
async function processHeroImage(inputBuffer) {
  const ts = Date.now()
  const meta = await sharp(inputBuffer).metadata()

  const desktopW = Math.min(2560, meta.width)
  const mobileW  = Math.min(1080, meta.width)
  const sharpOpts = { fit: 'inside', withoutEnlargement: true }

  let mediaUrl, mobileUrl

  if (!isR2Enabled && process.env.NODE_ENV === 'production') {
    throw new Error('R2 storage is not configured/enabled. Local fallback is disabled in production.');
  }

  if (isR2Enabled) {
    const desktopBuffer = await sharp(inputBuffer)
      .resize(desktopW, null, sharpOpts)
      .webp({ quality: 85, effort: 4 })
      .toBuffer()
    mediaUrl = await uploadWebsiteAsset(desktopBuffer, `${ts}-desktop.webp`, 'homepage/hero', 'image/webp')

    const mobileBuffer = await sharp(inputBuffer)
      .resize(mobileW, null, sharpOpts)
      .webp({ quality: 80, effort: 4 })
      .toBuffer()
    mobileUrl = await uploadWebsiteAsset(mobileBuffer, `${ts}-mobile.webp`, 'homepage/hero', 'image/webp')
  } else {
    const dir = path.join(WEBSITE_MEDIA_DIR, 'homepage', 'hero')
    ensureDir(dir)

    await sharp(inputBuffer)
      .resize(desktopW, null, sharpOpts)
      .webp({ quality: 85, effort: 4 })
      .toFile(path.join(dir, `${ts}-desktop.webp`))

    await sharp(inputBuffer)
      .resize(mobileW, null, sharpOpts)
      .webp({ quality: 80, effort: 4 })
      .toFile(path.join(dir, `${ts}-mobile.webp`))

    mediaUrl  = `/media/website/homepage/hero/${ts}-desktop.webp`
    mobileUrl = `/media/website/homepage/hero/${ts}-mobile.webp`
  }

  const blurDataUrl = await generateBlurPlaceholder(inputBuffer)

  return {
    mediaUrl,
    mobileUrl,
    blurDataUrl,
  }
}

/**
 * Process a film thumbnail upload.
 * Generates 1280px WebP thumbnail + blur placeholder.
 *
 * @param {Buffer} inputBuffer
 * @param {number|string} filmId
 * @returns {Promise<{thumbnailUrl: string, thumbnailBlur: string}>}
 */
async function processFilmThumbnail(inputBuffer, filmId) {
  const ts  = Date.now()
  const meta = await sharp(inputBuffer).metadata()
  const w    = Math.min(1280, meta.width)
  const sharpOpts = { fit: 'inside', withoutEnlargement: true }

  let thumbnailUrl

  if (!isR2Enabled && process.env.NODE_ENV === 'production') {
    throw new Error('R2 storage is not configured/enabled. Local fallback is disabled in production.');
  }

  if (isR2Enabled) {
    const thumbBuffer = await sharp(inputBuffer)
      .resize(w, null, sharpOpts)
      .webp({ quality: 82, effort: 4 })
      .toBuffer()
    thumbnailUrl = await uploadWebsiteAsset(thumbBuffer, `${ts}.webp`, `films/${filmId}/thumb`, 'image/webp')
  } else {
    const dir = path.join(WEBSITE_MEDIA_DIR, 'films', String(filmId), 'thumb')
    ensureDir(dir)

    await sharp(inputBuffer)
      .resize(w, null, sharpOpts)
      .webp({ quality: 82, effort: 4 })
      .toFile(path.join(dir, `${ts}.webp`))

    thumbnailUrl = `/media/website/films/${filmId}/thumb/${ts}.webp`
  }

  const blurDataUrl = await generateBlurPlaceholder(inputBuffer)

  return {
    thumbnailUrl,
    thumbnailBlur: blurDataUrl,
  }
}

module.exports = {
  processStoryPhoto,
  processHeroImage,
  processFilmThumbnail,
  generateBlurPlaceholder,
  WEBSITE_MEDIA_DIR,
}
