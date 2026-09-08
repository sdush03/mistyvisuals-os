const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const exifr = require('exifr');
const axios = require('axios');
const https = require('https');
const { dialog, powerSaveBlocker } = require('electron');

// Configure Sharp for high-concurrency batch processing
sharp.concurrency(1);
sharp.cache(false);

// Enable Keep-Alive to reuse TCP/TLS connections and avoid handshake delays
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  keepAliveMsecs: 30000
});
axios.defaults.httpsAgent = keepAliveAgent;

let isUploadCancelled = false;
let activeVideoChildProcess = null;

function cancelUpload() {
  isUploadCancelled = true;
  if (activeVideoChildProcess) {
    try {
      activeVideoChildProcess.kill('SIGKILL');
    } catch (_) {}
    activeVideoChildProcess = null;
  }
}

function getFfmpegPath() {
  try {
    let p = require('@ffmpeg-installer/ffmpeg').path;
    if (p && p.includes('app.asar')) {
      p = p.replace('app.asar', 'app.asar.unpacked');
    }
    if (p && fs.existsSync(p)) return p;
  } catch (e) {
    console.warn('Could not load @ffmpeg-installer/ffmpeg:', e.message);
  }
  return null;
}

/**
 * Probe video dimensions, duration, and bitrate using ffmpeg -i.
 */
function probeVideoMetadata(ffmpeg, filePath) {
  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    execFile(ffmpeg, ['-i', filePath], (err, stdout, stderr) => {
      const output = (stderr || '') + (stdout || '');
      let width = 0;
      let height = 0;
      let bitrateKbps = 0;
      let durationSec = 0;

      // Parse duration & overall container bitrate
      const durMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*).*?bitrate:\s*(\d+)\s*kb\/s/i);
      if (durMatch) {
        durationSec = parseInt(durMatch[1], 10) * 3600 + parseInt(durMatch[2], 10) * 60 + parseFloat(durMatch[3]);
        bitrateKbps = parseInt(durMatch[4], 10);
      }

      // Parse video stream resolution
      const streamMatch = output.match(/Stream.*Video:.*?,\s*(\d+)x(\d+)/i);
      if (streamMatch) {
        width = parseInt(streamMatch[1], 10);
        height = parseInt(streamMatch[2], 10);
      }

      // Check stream-level video bitrate if present
      const vBitrateMatch = output.match(/Stream.*Video:.*?,\s*(\d+)\s*kb\/s/i);
      if (vBitrateMatch) {
        const vb = parseInt(vBitrateMatch[1], 10);
        if (vb > bitrateKbps) bitrateKbps = vb;
      }

      const isVertical = height > width;

      resolve({
        width: width || 1920,
        height: height || 1080,
        durationSec,
        bitrateKbps: bitrateKbps || 0,
        isVertical
      });
    });
  });
}

/**
 * Maps video dimensions & orientation to target bitrate caps.
 * Rule: Only downsamples if current bitrate exceeds the max cap. Never upsamples.
 */
function getVideoTargetSettings(width, height, bitrateKbps) {
  const isVertical = height > width;
  const maxDim = Math.max(width, height);

  let targetBitrateKbps = 0;
  let maxBitrateKbps = 0;
  let bufsizeKbps = 0;
  let tier = '1080p';

  if (maxDim >= 3840 || width >= 3840 || height >= 2160) {
    // 4K UHD
    tier = isVertical ? '4K Vertical' : '4K Horizontal';
    targetBitrateKbps = isVertical ? 16000 : 20000; // 16M / 20M
    maxBitrateKbps = isVertical ? 18000 : 22000;    // 18M / 22M cap
    bufsizeKbps = isVertical ? 24000 : 30000;
  } else if (maxDim >= 1920 || width >= 1920 || height >= 1080) {
    // 1080p Full HD
    tier = isVertical ? '1080p Vertical Reel' : '1080p Full HD';
    targetBitrateKbps = isVertical ? 6500 : 8500;  // 6.5M / 8.5M
    maxBitrateKbps = isVertical ? 8000 : 10000;    // 8M / 10M cap
    bufsizeKbps = isVertical ? 10000 : 14000;
  } else {
    // 720p or lower
    tier = isVertical ? '720p Vertical' : '720p HD';
    targetBitrateKbps = isVertical ? 3500 : 4500;
    maxBitrateKbps = isVertical ? 4500 : 5500;
    bufsizeKbps = isVertical ? 6000 : 8000;
  }

  const shouldDownsample = bitrateKbps > maxBitrateKbps;

  return {
    tier,
    isVertical,
    targetBitrateKbps,
    maxBitrateKbps,
    bufsizeKbps,
    shouldDownsample
  };
}

/**
 * Optimizes video:
 * - If shouldDownsample: Transcodes using macOS hardware acceleration (h264_videotoolbox)
 *   with fallback to libx264, capping bitrate and applying faststart.
 * - If !shouldDownsample: Streams copy with faststart (-c copy -movflags +faststart) without re-encoding.
 */
function optimizeVideoAsync({ ffmpeg, inputPath, outputPath, settings }) {
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process');

    const executeFfmpeg = (args) => {
      return new Promise((res, rej) => {
        const child = execFile(ffmpeg, args, (err) => {
          activeVideoChildProcess = null;
          if (err) {
            return rej(err);
          }
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            return res(outputPath);
          }
          rej(new Error('Optimized video file is missing or empty.'));
        });
        activeVideoChildProcess = child;
      });
    };

    if (!settings.shouldDownsample) {
      console.log(`[Video Optimizer] Bitrate is below cap (${settings.currentBitrateMbps || 0} Mbps <= ${settings.maxBitrateKbps / 1000} Mbps). Applying Faststart remux only.`);
      executeFfmpeg(['-y', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outputPath])
        .then(resolve)
        .catch(reject);
      return;
    }

    console.log(`[Video Optimizer] Downsampling ${settings.tier}: capping from ${settings.currentBitrateMbps} Mbps to ${settings.targetBitrateKbps / 1000} Mbps.`);

    // If macOS, use hardware acceleration (Apple Silicon Media Engine)
    const tryHardware = process.platform === 'darwin';
    if (tryHardware) {
      const hwArgs = [
        '-y',
        '-i', inputPath,
        '-c:v', 'h264_videotoolbox',
        '-b:v', `${settings.targetBitrateKbps}k`,
        '-maxrate', `${settings.maxBitrateKbps}k`,
        '-bufsize', `${settings.bufsizeKbps}k`,
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        outputPath
      ];

      executeFfmpeg(hwArgs)
        .then(resolve)
        .catch((hwErr) => {
          console.warn('[Video Optimizer] Hardware videotoolbox failed, falling back to libx264:', hwErr.message);
          const swArgs = [
            '-y',
            '-i', inputPath,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '21',
            '-maxrate', `${settings.maxBitrateKbps}k`,
            '-bufsize', `${settings.bufsizeKbps}k`,
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            outputPath
          ];
          executeFfmpeg(swArgs).then(resolve).catch(reject);
        });
    } else {
      const swArgs = [
        '-y',
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '21',
        '-maxrate', `${settings.maxBitrateKbps}k`,
        '-bufsize', `${settings.bufsizeKbps}k`,
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        outputPath
      ];
      executeFfmpeg(swArgs).then(resolve).catch(reject);
    }
  });
}

function setupUploadHandlers({ ipcMain, app, getMainWindow, initDaemonPool, getPreflightDaemonPool, setPreflightDaemonPool }) {
  ipcMain.on('cancel-upload', () => {
    isUploadCancelled = true;
  });

  ipcMain.handle('process-photos', async (event, config) => {
    isUploadCancelled = false;
    let activeBlockerId = null;
    try {
      activeBlockerId = powerSaveBlocker.start('prevent-display-sleep');
      console.log('[Uploader] Started powerSaveBlocker to prevent display sleep during upload. ID:', activeBlockerId);
    } catch (err) {
      console.error('Failed to start powerSaveBlocker:', err);
    }

    const mainWindow = getMainWindow();

    try {
      const { resolvedFiles = [], eventId, eventSlug, backendUrl, token, uploadQuality = '4k', applyWatermark = true, concurrency = 6, daemons = 2 } = config;
      const watermarkPath = path.join(__dirname, '..', 'assets', 'watermark.png');

      let targetWidth = null;
      let targetHeight = null;
      let jpegQuality = 70;

      if (uploadQuality === '4k') {
        targetWidth = 3840;
        targetHeight = 3840;
        jpegQuality = 75;
      } else if (uploadQuality === '2k') {
        targetWidth = 2160;
        targetHeight = 2160;
        jpegQuality = 68;
      }
      
      const totalPhotos = resolvedFiles.length;
      if (totalPhotos === 0) {
        return { count: 0 };
      }

      const tempDir = path.join(app.getPath('temp'), 'misty_uploader_uploads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      let daemon;
      if (daemons === 0) {
        console.log('[Upload] Face scanning explicitly offline/skipped.');
        daemon = {
          readyInstances: [],
          getFacesFromPool: () => Promise.resolve([]),
          killAllDaemons: () => {},
          getActiveCount: () => 0,
          getErrors: () => 'Offline by user request'
        };
      } else {
        const preflightPool = getPreflightDaemonPool();
        if (preflightPool && preflightPool.readyInstances.length > 0) {
          console.log('[Upload] Reusing daemon pool from preflight.');
          daemon = preflightPool;
          setPreflightDaemonPool(null);
        } else {
          console.log('[Upload] No preflight daemon pool found, initializing fresh pool.');
          daemon = await initDaemonPool(app, daemons);
        }
      }
      const getFacesFromDaemon = daemon.getFacesFromPool;
      const killDaemon = daemon.killAllDaemons;
      const isDaemonReady = daemon.readyInstances.length > 0;

      if (!isDaemonReady && daemons > 0) {
        const errorDetails = daemon.getErrors();
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: 'warning',
          buttons: ['Continue Upload', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          title: 'Face Scanner Offline',
          message: `The local face recognition engine is offline (Python daemons failed to start).\n\nError details:\n${errorDetails}\n\nWould you like to continue the upload without local face scanning, or cancel to fix the issues?`,
        });
        if (choice === 1) {
          if (killDaemon) killDaemon();
          return { success: false, error: 'Cancelled by user due to offline face scanner' };
        }
      }

      let hasPromptedMidUploadCrash = false;
      const results = [];

      const uploadReport = {
        total: totalPhotos,
        failed:          [],
        watermarkMissed: [],
        exifMissed:      [],
        faceScanSkipped: [],
        faceScanErrored: [],
        faceCropsDropped:[],
        duplicatesSkipped:[],
        videosOptimized: [],
        videoThumbnailsFailed: [],
        customCoversApplied: [],
        photoIds:        [],
      };

      let processedCount = 0;
      let currentIndex = 0;
      const CONCURRENCY = concurrency;

      let activeUploads = 0;
      const sendPerfStats = () => {
        mainWindow.webContents.send('upload-progress', {
          status: 'perf-stats',
          activeUploads,
          activeScans: daemon.getActiveCount()
        });
      };

      const executeQueue = async () => {
        const compressedQueue = [];
        const scannedQueue = [];

        // Read watermark file into buffer with retries
        let cachedWatermarkBuffer = null;
        if (applyWatermark) {
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              if (fs.existsSync(watermarkPath)) {
                cachedWatermarkBuffer = fs.readFileSync(watermarkPath);
                if (cachedWatermarkBuffer && cachedWatermarkBuffer.length > 0) break;
              }
            } catch (e) {
              console.warn(`[Upload] Watermark preload attempt ${attempt} failed:`, e.message);
            }
          }
          if (!cachedWatermarkBuffer || cachedWatermarkBuffer.length === 0) {
            const err = new Error(`Watermark enabled, but watermark asset is missing or unreadable at ${watermarkPath}`);
            err.userAction = 'Please ensure assets/watermark.png exists and is readable, or uncheck Apply Watermark before uploading.';
            throw err;
          }
        }

        let compressIndex = 0;
        let compressesCompleted = 0;
        let scansCompleted = 0;
        let uploadsCompleted = 0;

        // 1. Compress Producer
        const compressWorker = async () => {
          while (compressIndex < totalPhotos && !isUploadCancelled) {
            const index = compressIndex++;
            if (index >= totalPhotos) break;

            const fileItem = resolvedFiles[index];
            if (fileItem.isAlreadyUploaded) {
              uploadReport.duplicatesSkipped.push({ filename: fileItem.name });
              mainWindow.webContents.send('upload-progress', {
                status: 'row-skipped',
                filename: fileItem.name,
                index,
                total: totalPhotos
              });
              processedCount++;
              mainWindow.webContents.send('upload-progress', {
                status: 'progress',
                index: processedCount,
                total: totalPhotos
              });
              compressesCompleted++;
              scansCompleted++;
              uploadsCompleted++;
              continue;
            }

            // Throttling: limit size of compressedQueue to avoid memory/temp file bloat
            while (compressedQueue.length > CONCURRENCY * 2 && !isUploadCancelled) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (isUploadCancelled) break;

            const filename = fileItem.name;
            const originalPath = fileItem.path;
            const tabName = fileItem.tabName;
            const ext = path.extname(filename).toLowerCase();
            const isVideo = ext === '.mp4' || ext === '.mov' || ext === '.m4v' || tabName === 'Cinema';

            mainWindow.webContents.send('upload-progress', {
              status: 'row-processing',
              filename,
              index,
              total: totalPhotos
            });

            const tempUploadPath = path.join(tempDir, `temp_upload_${index}_${filename}`);
            const tCompressStart = performance.now();
            try {
              if (isVideo) {
                // Enforce 4GB max limit
                const MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024;
                if (fileItem.sizeBytes > MAX_VIDEO_SIZE) {
                  const sizeGb = (fileItem.sizeBytes / (1024 * 1024 * 1024)).toFixed(2);
                  const err = new Error(`Video size (${sizeGb} GB) exceeds 4GB limit.`);
                  err.userAction = 'Re-export a shorter cut or lower export bitrate in Premiere/DaVinci under 4GB.';
                  throw err;
                }

                let readyVideoPath = originalPath;
                let posterBuffer = null;
                let tempThumbPath = null;
                let videoWidth = 1920;
                let videoHeight = 1080;

                const ffmpeg = getFfmpegPath();
                if (!ffmpeg) {
                  const err = new Error('Video Optimizer Engine (FFmpeg) not found on system.');
                  err.userAction = 'Restart the uploader or grant permission in macOS System Settings > Privacy & Security.';
                  throw err;
                }

                const optimizedDest = path.join(tempDir, `optimized_${index}_${path.basename(filename, ext)}.mp4`);
                tempThumbPath = path.join(tempDir, `thumb_${index}_${path.basename(filename, ext)}.jpg`);

                // 1. Probe video metadata (resolution, duration, bitrate)
                let meta = null;
                try {
                  meta = await probeVideoMetadata(ffmpeg, originalPath);
                  if (meta && meta.width > 0 && meta.height > 0) {
                    videoWidth = meta.width;
                    videoHeight = meta.height;
                  }
                } catch (probeErr) {
                  const err = new Error(`Cannot inspect video metadata: ${probeErr.message}`);
                  err.userAction = 'Re-export the video as standard H.264 MP4 with Rec.709 color in Premiere/DaVinci.';
                  throw err;
                }

                // 2. Determine target bitrate settings
                const currentBitrateKbps = meta ? meta.bitrateKbps : Math.round((fileItem.sizeBytes * 8) / (1024 * 180));
                const settings = getVideoTargetSettings(videoWidth, videoHeight, currentBitrateKbps);
                settings.currentBitrateMbps = (currentBitrateKbps / 1000).toFixed(1);

                const progressDetail = settings.shouldDownsample
                  ? `Optimizing ${settings.tier} (${settings.currentBitrateMbps} Mbps ➔ ${(settings.targetBitrateKbps / 1000).toFixed(1)} Mbps)...`
                  : `Faststart remuxing ${settings.tier}...`;

                mainWindow.webContents.send('upload-progress', {
                  status: 'row-processing',
                  filename,
                  detail: progressDetail,
                  index,
                  total: totalPhotos
                });

                // 3. Optimize video (hardware downsample if > cap, or faststart copy if <= cap)
                try {
                  await optimizeVideoAsync({
                    ffmpeg,
                    inputPath: originalPath,
                    outputPath: optimizedDest,
                    settings
                  });
                  if (fs.existsSync(optimizedDest) && fs.statSync(optimizedDest).size > 0) {
                    readyVideoPath = optimizedDest;
                    const origMb = (fileItem.sizeBytes / (1024 * 1024)).toFixed(1);
                    const optMb = (fs.statSync(readyVideoPath).size / (1024 * 1024)).toFixed(1);
                    console.log(`[Video Optimizer] Video ready: ${readyVideoPath} (${origMb} MB ➔ ${optMb} MB)`);
                    if (settings.shouldDownsample) {
                      uploadReport.videosOptimized.push({
                        filename,
                        fromMbps: settings.currentBitrateMbps,
                        toMbps: (settings.targetBitrateKbps / 1000).toFixed(1),
                        origMb,
                        optMb
                      });
                    }
                  } else {
                    throw new Error('Optimized video file was not created or is 0 bytes.');
                  }
                } catch (optErr) {
                  console.error(`[Video Optimizer] Optimization failed for ${filename}:`, optErr.message);
                  const isDiskFull = optErr.message && (optErr.message.includes('ENOSPC') || optErr.message.includes('space'));
                  const err = new Error(`Video optimization failed: ${optErr.message}`);
                  err.userAction = isDiskFull
                    ? 'Hard drive is full. Free up at least 5GB of free space on your computer and retry.'
                    : 'Re-export the film as a standard H.264 MP4 (AAC audio) in Premiere/Final Cut/DaVinci, then re-upload.';
                  throw err;
                }

                // 4. Custom Cover Art Processing or FFmpeg Poster Extraction
                let customCoverApplied = false;
                if (fileItem.customCoverPath && fs.existsSync(fileItem.customCoverPath)) {
                  try {
                    const isVerticalVideo = videoHeight > videoWidth;
                    const targetW = isVerticalVideo ? 1080 : 1920;
                    const targetH = isVerticalVideo ? 1920 : 1080;

                    // Pass 1: Smart crop with attention strategy (subject & face aware)
                    posterBuffer = await sharp(fileItem.customCoverPath)
                      .rotate() // Respect EXIF camera orientation
                      .resize(targetW, targetH, {
                        fit: 'cover',
                        position: sharp.strategy.attention
                      })
                      .jpeg({ quality: 92, mozjpeg: true, progressive: true })
                      .toBuffer();

                    customCoverApplied = true;
                    uploadReport.customCoversApplied.push({
                      filename,
                      coverName: path.basename(fileItem.customCoverPath),
                      aspectRatio: isVerticalVideo ? '9:16 (Vertical)' : '16:9 (Horizontal)'
                    });
                    console.log(`[Video Optimizer] Custom cover applied for ${filename} (${isVerticalVideo ? '9:16' : '16:9'}, ${posterBuffer.length} bytes)`);
                  } catch (coverErr) {
                    console.warn(`[Video Optimizer] Custom cover attention crop failed for ${filename}, retrying center crop:`, coverErr.message);
                    try {
                      const isVerticalVideo = videoHeight > videoWidth;
                      const targetW = isVerticalVideo ? 1080 : 1920;
                      const targetH = isVerticalVideo ? 1920 : 1080;
                      posterBuffer = await sharp(fileItem.customCoverPath)
                        .rotate()
                        .resize(targetW, targetH, { fit: 'cover', position: 'centre' })
                        .jpeg({ quality: 90 })
                        .toBuffer();
                      customCoverApplied = true;
                      uploadReport.customCoversApplied.push({
                        filename,
                        coverName: path.basename(fileItem.customCoverPath),
                        aspectRatio: isVerticalVideo ? '9:16 (Vertical)' : '16:9 (Horizontal)'
                      });
                    } catch (retryErr) {
                      console.error(`[Video Optimizer] Custom cover processing failed completely for ${filename}, falling back to video frame:`, retryErr.message);
                    }
                  }
                }

                // If no custom cover or custom cover failed, fall back to FFmpeg frame extraction at 1s / 0s
                if (!posterBuffer) {
                  const extractPoster = (seekTime) => {
                    return new Promise((resolve) => {
                      const { execFile } = require('child_process');
                      const posterSource = readyVideoPath || originalPath;
                      execFile(ffmpeg, ['-y', '-ss', seekTime, '-i', posterSource, '-vframes', '1', '-q:v', '2', tempThumbPath], (err) => {
                        if (!err && fs.existsSync(tempThumbPath) && fs.statSync(tempThumbPath).size > 0) {
                          try {
                            posterBuffer = fs.readFileSync(tempThumbPath);
                          } catch (_) {}
                        }
                        resolve();
                      });
                    });
                  };

                  try {
                    const initialSeek = (meta && meta.durationSec > 0 && meta.durationSec < 1) ? '00:00:00.100' : '00:00:01';
                    await extractPoster(initialSeek);
                    if (!posterBuffer) {
                      console.warn(`[FFmpeg] Poster empty at ${initialSeek}, retrying at 00:00:00.000 for ${filename}...`);
                      await extractPoster('00:00:00.000');
                    }
                    if (!posterBuffer) {
                      console.warn(`[FFmpeg] Poster extraction failed after retries for ${filename}`);
                      uploadReport.videoThumbnailsFailed.push({ filename, reason: 'Could not extract poster frame at 1s or 0s' });
                    }
                  } catch (thumbErr) {
                    console.warn(`[FFmpeg] Thumbnail extraction error:`, thumbErr.message);
                    uploadReport.videoThumbnailsFailed.push({ filename, reason: thumbErr.message });
                  }
                }

                const videoStats = fs.statSync(readyVideoPath);
                const videoSize = videoStats.size;

                let capturedAt = null;
                try {
                  const fallbackDate = videoStats.birthtime && videoStats.birthtime.getFullYear() > 1970
                    ? videoStats.birthtime
                    : videoStats.mtime;
                  capturedAt = fallbackDate.toISOString();
                } catch (_) {}

                const tCompressEnd = performance.now() - tCompressStart;
                if (!isUploadCancelled) {
                  compressedQueue.push({
                    index,
                    fileItem,
                    isVideo: true,
                    readyVideoPath,
                    videoSize,
                    posterBuffer,
                    tempThumbPath,
                    videoWidth,
                    videoHeight,
                    exifData: null,
                    capturedAt,
                    cleanCompressedBuffer: null,
                    tempUploadPath: null,
                    tCompress: tCompressEnd
                  });
                }
                continue;
              }

              // Parse EXIF (with retry)
              let exifData = null;
              let capturedAt = null;
              try {
                let metadata = null;
                try {
                  metadata = await exifr.parse(originalPath, {
                    tiff: true,
                    exif: true,
                    device: true
                  });
                } catch (e1) {
                  // Retry with permissive parse
                  try {
                    metadata = await exifr.parse(originalPath);
                  } catch (e2) {
                    console.warn(`[EXIF] Retry parse failed for ${filename}:`, e2.message);
                  }
                }

                if (metadata) {
                  exifData = {
                    make: metadata.Make || null,
                    model: metadata.Model || null,
                    lens: metadata.LensModel || null,
                    iso: metadata.ISO || null,
                    aperture: metadata.FNumber || null,
                    shutterSpeed: metadata.ExposureTime ? `1/${Math.round(1/metadata.ExposureTime)}` : null,
                    focalLength: metadata.FocalLength || null
                  };
                  // Check EXIF date tags in priority order
                  const exifDateFields = [
                    'DateTimeOriginal',
                    'CreateDate',
                    'ModifyDate',
                    'DateCreated',
                    'DateTimeDigitized'
                  ];
                  for (const field of exifDateFields) {
                    if (metadata[field]) {
                      try {
                        const parsed = new Date(metadata[field]);
                        if (!isNaN(parsed.getTime())) {
                          capturedAt = parsed.toISOString();
                          break;
                        }
                      } catch (_) { /* skip invalid date value */ }
                    }
                  }
                } else {
                  uploadReport.exifMissed.push({ filename, reason: 'No camera EXIF metadata present' });
                }
              } catch (exifErr) {
                console.warn(`Failed to parse EXIF for ${filename}:`, exifErr.message);
                uploadReport.exifMissed.push({ filename, reason: exifErr.message });
              }
              // Fallback: use file system timestamps if no EXIF date was found
              if (!capturedAt) {
                try {
                  const fileStat = fs.statSync(originalPath);
                  const fallbackDate = fileStat.birthtime && fileStat.birthtime.getFullYear() > 1970
                    ? fileStat.birthtime
                    : fileStat.mtime;
                  capturedAt = fallbackDate.toISOString();
                } catch (statErr) {
                  console.warn(`Failed to read file stat for ${filename}:`, statErr.message);
                }
              }

              // Get original metadata header first (fast header-only check, does not decompress pixels)
              const meta = await sharp(originalPath).metadata();
              let origWidth = meta.width || 0;
              let origHeight = meta.height || 0;

              // If EXIF orientation indicates 90° or 270° rotation (values 5, 6, 7, 8), swap width & height
              if (meta.orientation && meta.orientation >= 5 && meta.orientation <= 8) {
                origWidth = meta.height || 0;
                origHeight = meta.width || 0;
              }

              let imgWidth = origWidth;
              let imgHeight = origHeight;
              if (targetWidth && targetHeight) {
                const scale = Math.min(1, targetWidth / origWidth, targetHeight / origHeight);
                imgWidth = Math.round(origWidth * scale);
                imgHeight = Math.round(origHeight * scale);
              }

              // Build composite array if watermark is enabled
              const composite = [];
              if (applyWatermark && cachedWatermarkBuffer) {
                const applyOverlay = async () => {
                  const watermarkMetadata = await sharp(cachedWatermarkBuffer).metadata();
                  const shortestSide = Math.min(imgWidth, imgHeight);
                  const watermarkWidth = Math.round(shortestSide * 0.15);
                  const watermarkHeight = Math.round(watermarkMetadata.height * (watermarkWidth / watermarkMetadata.width));
                  const padding = Math.max(12, Math.round(shortestSide * 0.03));
                  const wx = padding;
                  const wy = imgHeight - watermarkHeight - padding;

                  const watermarkResizedBuffer = await sharp(cachedWatermarkBuffer)
                    .resize(watermarkWidth)
                    .toBuffer();

                  composite.push({
                    input: watermarkResizedBuffer,
                    left: wx,
                    top: wy
                  });
                };

                try {
                  await applyOverlay();
                } catch (wmErr1) {
                  console.warn(`[Watermark] Overlay attempt 1 failed for ${filename}:`, wmErr1.message);
                  try {
                    await applyOverlay();
                  } catch (wmErr2) {
                    const err = new Error(`Failed to apply watermark: ${wmErr2.message}`);
                    err.userAction = 'Please ensure assets/watermark.png is a standard sRGB PNG, or uncheck Apply Watermark before uploading.';
                    throw err;
                  }
                }
              }

              // Single pass execution: Resize, composite watermark, reset orientation, and inject Copyright EXIF tag
              let pipeline = sharp(originalPath).rotate();
              if (targetWidth && targetHeight) {
                pipeline = pipeline
                  .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
                  .sharpen();
              }
              if (composite.length > 0) {
                pipeline = pipeline.composite(composite);
              }

              const cleanCompressedBuffer = await pipeline
                .withMetadata({
                  orientation: 1,
                  exif: {
                    IFD0: {
                      Copyright: 'https://www.mistyvisuals.com/'
                    }
                  }
                })
                .jpeg({
                  quality: jpegQuality,
                  progressive: true
                })
                .toBuffer();

              await fs.promises.writeFile(tempUploadPath, cleanCompressedBuffer);

              const tCompressEnd = performance.now() - tCompressStart;
              if (!isUploadCancelled) {
                compressedQueue.push({
                  index,
                  fileItem,
                  tempUploadPath,
                  exifData,
                  capturedAt,
                  cleanCompressedBuffer,
                  tCompress: tCompressEnd
                });
              } else {
                if (fs.existsSync(tempUploadPath)) {
                  try { fs.unlinkSync(tempUploadPath); } catch (e) {}
                }
              }
            } catch (err) {
              console.error(`Failed to compress/process ${isVideo ? 'video' : 'photo'} ${filename}:`, err);
              const action = err.userAction || 'Check file integrity and retry.';
              uploadReport.failed.push({ filename, error: err.message, action, originalPath });
              mainWindow.webContents.send('upload-progress', {
                status: 'row-error',
                filename,
                index,
                total: totalPhotos,
                error: err.message,
                action
              });
              processedCount++;
              mainWindow.webContents.send('upload-progress', {
                status: 'progress',
                index: processedCount,
                total: totalPhotos
              });
              scansCompleted++;
              uploadsCompleted++;
            } finally {
              compressesCompleted++;
            }
          }
        };

        // 2. Scan Consumer
        const scanWorker = async () => {
          while (scansCompleted < totalPhotos && !isUploadCancelled) {
            if (compressedQueue.length === 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
              continue;
            }

            const item = compressedQueue.shift();
            if (!item) continue;

            const { index, fileItem, isVideo, tempUploadPath, exifData, capturedAt, cleanCompressedBuffer, tCompress } = item;
            let faces = [];
            let faceScanFailed = false;
            let scanError = '';

            const tScanStart = performance.now();
            try {
              if (isVideo) {
                faces = [];
              } else if (isDaemonReady) {
                faces = await getFacesFromDaemon(tempUploadPath);
                faces = faces.map(f => {
                  if (f.faceId) {
                    const prefix = `temp_upload_${index}_`;
                    if (f.faceId.includes(prefix)) {
                      f.faceId = f.faceId.replace(prefix, '');
                    }
                  }
                  return f;
                });
              }
            } catch (err) {
              console.warn(`Face detection failed for ${fileItem.name}:`, err);
              faceScanFailed = true;
              scanError = err.message;
              uploadReport.faceScanErrored.push({ filename: fileItem.name });
              if (!hasPromptedMidUploadCrash) {
                hasPromptedMidUploadCrash = true;
                const choice = dialog.showMessageBoxSync(mainWindow, {
                  type: 'warning',
                  buttons: ['Continue Upload', 'Cancel Upload'],
                  defaultId: 1,
                  cancelId: 1,
                  title: 'Face Scanner Stopped',
                  message: 'The local face recognition scanner stopped running in the middle of this upload.\n\nWould you like to continue uploading the remaining photos without face scanning, or cancel/abort the upload?',
                });
                if (choice === 1) {
                  isUploadCancelled = true;
                }
              }
            }

            const tScanEnd = performance.now() - tScanStart;
            if (!isUploadCancelled) {
              scannedQueue.push({
                ...item,
                faces,
                faceScanFailed,
                scanError,
                tScan: tScanEnd
              });
            } else {
              if (tempUploadPath && fs.existsSync(tempUploadPath)) {
                try { fs.unlinkSync(tempUploadPath); } catch (e) {}
              }
            }
            scansCompleted++;
          }
        };

        // 3. Upload & Crop Consumer
        const uploadWorker = async () => {
          while (uploadsCompleted < totalPhotos && !isUploadCancelled) {
            if (scannedQueue.length === 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
              continue;
            }

            const item = scannedQueue.shift();
            if (!item) continue;

            const {
              index,
              fileItem,
              tempUploadPath,
              exifData,
              capturedAt,
              cleanCompressedBuffer,
              faces,
              faceScanFailed,
              scanError,
              tCompress,
              tScan
            } = item;

            const filename = fileItem.name;
            const originalPath = fileItem.path;
            const tabName = fileItem.tabName;
            const isVideo = item.isVideo;

            try {
              const tUploadStart = performance.now();
              if (faceScanFailed && isUploadCancelled) {
                throw new Error(scanError || 'Scanning stage aborted');
              }

              activeUploads++;
              sendPerfStats();

              mainWindow.webContents.send('upload-progress', {
                status: 'row-uploading',
                filename,
                index,
                total: totalPhotos
              });

              // Request upload ticket
              const uploadFilename = isVideo ? `${path.basename(filename, path.extname(filename))}.mp4` : filename;
              const ticketRes = await axios.post(`${backendUrl}/api/gallery/events/${eventId}/generate-upload-urls`, {
                uploads: [{
                  filename: uploadFilename
                }]
              }, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                }
              });

              const ticket = ticketRes.data.uploads[0];
              const r2Url = ticket.r2Url;

              const uploadPromises = [];
              if (isVideo) {
                const videoStream = fs.createReadStream(item.readyVideoPath);
                uploadPromises.push(
                  axios.put(ticket.photoPutUrl, videoStream, {
                    headers: {
                      'Content-Type': 'video/mp4',
                      'Content-Length': item.videoSize,
                      'Cache-Control': 'public, max-age=31536000, immutable'
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity
                  })
                );

                if (ticket.thumbnailPutUrl && item.posterBuffer) {
                  uploadPromises.push(
                    axios.put(ticket.thumbnailPutUrl, item.posterBuffer, {
                      headers: {
                        'Content-Type': 'image/jpeg',
                        'Cache-Control': 'public, max-age=31536000, immutable'
                      }
                    })
                  );
                }
              } else {
                uploadPromises.push(
                  axios.put(ticket.photoPutUrl, cleanCompressedBuffer, {
                    headers: { 
                      'Content-Type': 'image/jpeg',
                      'Cache-Control': 'public, max-age=31536000, immutable'
                    }
                  })
                );
              }

              // Keep face vector embeddings for search, but skip cropping and uploading face JPEGs to R2
              const facesToUpload = faces.map(f => ({
                faceId: f.faceId,
                vector: f.vector
              }));

              await Promise.all(uploadPromises);

              let finalWidth = 1920;
              let finalHeight = 1080;
              if (!isVideo && cleanCompressedBuffer) {
                const finalMetadata = await sharp(cleanCompressedBuffer).metadata();
                finalWidth = finalMetadata.width;
                finalHeight = finalMetadata.height;
              } else if (isVideo) {
                finalWidth = item.videoWidth || 1920;
                finalHeight = item.videoHeight || 1080;
              }

              if (!isDaemonReady && !isVideo) {
                uploadReport.faceScanSkipped.push({ filename });
              }

              const finalExif = {
                ...(exifData || {}),
                isFeatured: Boolean(fileItem.isFeatured)
              };

              results.push({
                filename: uploadFilename,
                r2Url,
                thumbnailUrl: (isVideo && !item.posterBuffer) ? null : (ticket.thumbnailUrl || null),
                fileSize: isVideo ? item.videoSize : cleanCompressedBuffer.length,
                originalSize: fileItem.sizeBytes,
                tabName: tabName,
                exif: finalExif,
                isFeatured: Boolean(fileItem.isFeatured),
                capturedAt: capturedAt,
                width: finalWidth,
                height: finalHeight,
                faces: facesToUpload
              });

              const tUploadEnd = performance.now() - tUploadStart;
              console.log(`[BENCHMARK] ${filename} (#${index + 1}/${totalPhotos}): Compress (Sharp) = ${tCompress.toFixed(0)}ms | Scan (GPU) = ${tScan.toFixed(0)}ms | Upload/Crops (Network) = ${tUploadEnd.toFixed(0)}ms | Total = ${(tCompress + tScan + tUploadEnd).toFixed(0)}ms`);

              mainWindow.webContents.send('upload-progress', {
                status: 'row-success',
                filename,
                index,
                total: totalPhotos
              });
            } catch (err) {
              console.error(`Failed to upload/post ${isVideo ? 'video' : 'photo'} ${filename}:`, err);
              const action = err.userAction || 'Check file integrity and internet connection, then retry.';
              uploadReport.failed.push({ filename, error: err.message, action, originalPath });
              mainWindow.webContents.send('upload-progress', {
                status: 'row-error',
                filename,
                index,
                total: totalPhotos,
                error: err.message,
                action
              });
            } finally {
              if (isVideo) {
                if (item.readyVideoPath && item.readyVideoPath !== originalPath && fs.existsSync(item.readyVideoPath)) {
                  try { fs.unlinkSync(item.readyVideoPath); } catch (_) {}
                }
                if (item.tempThumbPath && fs.existsSync(item.tempThumbPath)) {
                  try { fs.unlinkSync(item.tempThumbPath); } catch (_) {}
                }
              } else if (tempUploadPath && fs.existsSync(tempUploadPath)) {
                try { fs.unlinkSync(tempUploadPath); } catch (e) {}
              }
              activeUploads--;
              sendPerfStats();

              processedCount++;
              mainWindow.webContents.send('upload-progress', {
                status: 'progress',
                index: processedCount,
                total: totalPhotos
              });
              uploadsCompleted++;
            }
          }
        };

        const workers = [];
        const compressConcurrency = CONCURRENCY;
        const scanConcurrency = Math.min(daemons || 2, CONCURRENCY);
        const uploadConcurrency = CONCURRENCY;

        for (let c = 0; c < compressConcurrency; c++) {
          workers.push(compressWorker());
        }
        for (let s = 0; s < scanConcurrency; s++) {
          workers.push(scanWorker());
        }
        for (let u = 0; u < uploadConcurrency; u++) {
          workers.push(uploadWorker());
        }

        await Promise.all(workers);
      };

      await executeQueue();
      if (killDaemon) killDaemon();

      if (results.length > 0) {
        const CHUNK_SIZE = 100;
        uploadReport.photoIds = [];
        const totalChunks = Math.ceil(results.length / CHUNK_SIZE);
        try {
          for (let i = 0; i < results.length; i += CHUNK_SIZE) {
            const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
            mainWindow.webContents.send('upload-progress', {
              status: 'submitting',
              detail: `Syncing metadata & face indexes (${chunkIndex}/${totalChunks})...`
            });
            const chunk = results.slice(i, i + CHUNK_SIZE);
            const bulkRes = await axios.post(`${backendUrl}/api/gallery/events/${eventId}/photos/bulk`, {
              photos: chunk,
              isFaceScannerOffline: !isDaemonReady
            }, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              timeout: 120000
            });

            if (bulkRes.data && Array.isArray(bulkRes.data.photos)) {
              uploadReport.photoIds.push(...bulkRes.data.photos.map(p => p.id).filter(Boolean));
            }
          }
        } catch (bulkErr) {
          console.error('Bulk index submission failed:', bulkErr.message);
          throw new Error(`Bulk index failed: ${bulkErr.message}`);
        }
      }

      uploadReport.successCount = results.length - uploadReport.failed.length;
      mainWindow.webContents.send('upload-report', uploadReport);
      console.log('[Upload] Report:', JSON.stringify({
        total: uploadReport.total,
        success: uploadReport.successCount,
        failed: uploadReport.failed.length,
        watermarkMissed: uploadReport.watermarkMissed.length,
        exifMissed: uploadReport.exifMissed.length,
        faceScanSkipped: uploadReport.faceScanSkipped.length,
        faceScanErrored: uploadReport.faceScanErrored.length,
        faceCropsDropped: uploadReport.faceCropsDropped.length,
        duplicates: uploadReport.duplicatesSkipped.length
      }));

      const preflightPool = getPreflightDaemonPool();
      if (preflightPool) {
        try { preflightPool.killAllDaemons(); } catch (_) {}
        setPreflightDaemonPool(null);
      }

      if (isUploadCancelled) {
        return { status: 'cancelled', count: results.length };
      }

      return { status: 'success', count: results.length };
    } finally {
      if (activeBlockerId !== null) {
        try {
          powerSaveBlocker.stop(activeBlockerId);
          console.log('[Uploader] Stopped powerSaveBlocker, system sleep allowed. ID:', activeBlockerId);
        } catch (err) {
          console.error('Failed to stop powerSaveBlocker:', err);
        }
      }
    }
  });

  // Cover photo upload handler
  ipcMain.handle('upload-cover-photo', async (event, config) => {
    const { filePath, type, eventId, backendUrl, token } = config;
    if (!filePath || !type || !eventId || !backendUrl || !token) {
      throw new Error('Missing config parameters for cover upload');
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`Cover photo file not found at path: ${filePath}`);
    }

    try {
      const fileBuffer = await fs.promises.readFile(filePath);
      const base64Content = fileBuffer.toString('base64');
      const filename = path.basename(filePath);

      const res = await axios.post(`${backendUrl}/api/gallery/events/${eventId}/covers`, {
        type,
        filename,
        fileContent: base64Content
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      return res.data;
    } catch (err) {
      console.error('Cover upload error:', err);
      const msg = err.response && err.response.data && err.response.data.error
        ? err.response.data.error
        : err.message;
      throw new Error(msg);
    }
  });

  // Update video cover / poster handler
  ipcMain.handle('update-video-cover', async (event, config) => {
    const { filePath, eventId, photoId, backendUrl, token } = config;
    if (!filePath || !eventId || !photoId || !backendUrl || !token) {
      throw new Error('Missing config parameters for video cover update');
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`Cover photo file not found at path: ${filePath}`);
    }

    try {
      const fileBuffer = await fs.promises.readFile(filePath);
      const base64Content = fileBuffer.toString('base64');
      const filename = path.basename(filePath);

      const res = await axios.post(`${backendUrl}/api/gallery/events/${eventId}/photos/${photoId}/cover`, {
        filename,
        fileContent: base64Content
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      return res.data;
    } catch (err) {
      console.error('Update video cover error:', err);
      const msg = err.response && err.response.data && err.response.data.error
        ? err.response.data.error
        : err.message;
      throw new Error(msg);
    }
  });

  ipcMain.handle('set-video-featured', async (event, config) => {
    const { eventId, photoId, isFeatured, backendUrl, token } = config || {};
    const finalBackendUrl = backendUrl || 'http://localhost:5001';

    if (!token) {
      throw new Error('Authentication required');
    }
    if (!eventId || !photoId) {
      throw new Error('Missing eventId or photoId');
    }

    try {
      const res = await axios.post(`${finalBackendUrl}/api/gallery/events/${eventId}/photos/${photoId}/feature`, {
        isFeatured
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 15000
      });

      return res.data;
    } catch (err) {
      console.error('Set video featured error:', err);
      const msg = err.response && err.response.data && err.response.data.error
        ? err.response.data.error
        : err.message;
      throw new Error(msg);
    }
  });
}

module.exports = {
  setupUploadHandlers,
  cancelUpload
};
