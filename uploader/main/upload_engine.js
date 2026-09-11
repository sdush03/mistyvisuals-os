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
function getVideoTargetSettings(width, height, bitrateKbps, sizeBytes = 0, durationSec = 0, videoQuality = '14mbps') {
  const isVertical = height > width;
  const maxDim = Math.max(width, height);

  let targetBitrateKbps = 0;
  let maxBitrateKbps = 0;
  let bufsizeKbps = 0;
  let tier = '1080p';

  const is20M = videoQuality === '20mbps';
  const is10M = videoQuality === '10mbps';

  if (maxDim >= 3840 || width >= 3840 || height >= 2160) {
    // 4K UHD
    tier = isVertical ? '4K Vertical' : '4K Horizontal';
    if (is20M) {
      targetBitrateKbps = isVertical ? 16000 : 20000; // 16M / 20M
      maxBitrateKbps = isVertical ? 18000 : 22000;
      bufsizeKbps = isVertical ? 24000 : 30000;
    } else if (is10M) {
      targetBitrateKbps = isVertical ? 8000 : 10000;  // 8M / 10M
      maxBitrateKbps = isVertical ? 9500 : 12000;
      bufsizeKbps = isVertical ? 12000 : 15000;
    } else {
      // 14mbps default
      targetBitrateKbps = isVertical ? 11000 : 14000; // 11M / 14M
      maxBitrateKbps = isVertical ? 13000 : 16000;
      bufsizeKbps = isVertical ? 17000 : 21000;
    }
  } else if (maxDim >= 1920 || width >= 1920 || height >= 1080) {
    // 1080p Full HD
    tier = isVertical ? '1080p Vertical Reel' : '1080p Full HD';
    if (is20M) {
      targetBitrateKbps = isVertical ? 6500 : 8500;  // 6.5M / 8.5M
      maxBitrateKbps = isVertical ? 8000 : 10000;
      bufsizeKbps = isVertical ? 10000 : 14000;
    } else if (is10M) {
      targetBitrateKbps = isVertical ? 3800 : 4500;  // 3.8M / 4.5M
      maxBitrateKbps = isVertical ? 4800 : 5500;
      bufsizeKbps = isVertical ? 6000 : 7500;
    } else {
      // 14mbps relative profile
      targetBitrateKbps = isVertical ? 5000 : 6000;  // 5M / 6M
      maxBitrateKbps = isVertical ? 6500 : 7500;
      bufsizeKbps = isVertical ? 8000 : 10000;
    }
  } else {
    // 720p or lower
    tier = isVertical ? '720p Vertical' : '720p HD';
    if (is20M) {
      targetBitrateKbps = isVertical ? 3500 : 4500;
      maxBitrateKbps = isVertical ? 4500 : 5500;
      bufsizeKbps = isVertical ? 6000 : 8000;
    } else if (is10M) {
      targetBitrateKbps = isVertical ? 2000 : 2500;
      maxBitrateKbps = isVertical ? 2600 : 3200;
      bufsizeKbps = isVertical ? 3500 : 4500;
    } else {
      // 14mbps relative profile
      targetBitrateKbps = isVertical ? 2800 : 3500;
      maxBitrateKbps = isVertical ? 3500 : 4500;
      bufsizeKbps = isVertical ? 4500 : 6000;
    }
  }

  let shouldDownsample = bitrateKbps > maxBitrateKbps;

  // Cloudflare R2 single-part PUT limit is 5 GiB.
  // If the raw video exceeds 4.5 GB, enforce transcoding to ensure ready video is comfortably < 4.7 GB.
  const MAX_SINGLE_PUT_BYTES = 4.5 * 1024 * 1024 * 1024;
  if (sizeBytes > MAX_SINGLE_PUT_BYTES) {
    shouldDownsample = true;
    if (durationSec > 0) {
      // Calculate max bitrate to guarantee the final file fits within 4.5 GB
      const safeBitrateKbps = Math.floor((MAX_SINGLE_PUT_BYTES * 8) / (durationSec * 1000));
      if (safeBitrateKbps < targetBitrateKbps) {
        targetBitrateKbps = Math.max(safeBitrateKbps, 3000);
        maxBitrateKbps = targetBitrateKbps + 1000;
        bufsizeKbps = targetBitrateKbps * 1.5;
      }
    }
  }

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
function optimizeVideoAsync({ ffmpeg, inputPath, outputPath, settings, durationSec = 0, onProgress = null }) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');

    const executeFfmpeg = (args) => {
      return new Promise((res, rej) => {
        const cleanArgs = args.filter(a => a !== '-y');
        const ffmpegArgs = onProgress
          ? ['-y', '-nostats', '-progress', 'pipe:1', ...cleanArgs]
          : ['-y', ...cleanArgs];

        const child = spawn(ffmpeg, ffmpegArgs);
        activeVideoChildProcess = child;

        let stderrBuffer = '';
        let lastPct = -1;

        if (child.stdout) {
          let stdoutBuffer = '';
          child.stdout.on('data', (chunk) => {
            stdoutBuffer += chunk.toString();
            const lines = stdoutBuffer.split(/\r?\n/);
            stdoutBuffer = lines.pop();

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              let currentSec = null;
              if (trimmed.startsWith('out_time_us=')) {
                const us = parseInt(trimmed.substring(12), 10);
                if (!isNaN(us) && us >= 0) {
                  currentSec = us / 1000000;
                }
              } else if (trimmed.startsWith('out_time=')) {
                const timeStr = trimmed.substring(9).trim();
                const parts = timeStr.split(':');
                if (parts.length === 3) {
                  const s = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
                  if (!isNaN(s) && s >= 0) {
                    currentSec = s;
                  }
                }
              }

              if (currentSec !== null && durationSec > 0) {
                const pct = Math.min(Math.max(Math.round((currentSec / durationSec) * 100), 1), 99);
                if (pct !== lastPct) {
                  lastPct = pct;
                  if (onProgress) onProgress(pct);
                }
              } else if (trimmed === 'progress=end') {
                if (lastPct !== 100) {
                  lastPct = 100;
                  if (onProgress) onProgress(100);
                }
              }
            }
          });
        }

        if (child.stderr) {
          child.stderr.on('data', (chunk) => {
            stderrBuffer += chunk.toString();
          });
        }

        child.on('error', (err) => {
          activeVideoChildProcess = null;
          rej(err);
        });

        child.on('close', (code) => {
          activeVideoChildProcess = null;
          if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            if (onProgress && lastPct < 100) {
              onProgress(100);
            }
            return res(outputPath);
          }
          rej(new Error(`FFmpeg process exited with code ${code}: ${stderrBuffer.slice(-300)}`));
        });
      });
    };

    if (!settings.shouldDownsample) {
      console.log(`[Video Optimizer] Bitrate is below cap (${settings.currentBitrateMbps || 0} Mbps <= ${settings.maxBitrateKbps / 1000} Mbps). Applying Faststart remux only.`);
      executeFfmpeg(['-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outputPath])
        .then(resolve)
        .catch(reject);
      return;
    }

    console.log(`[Video Optimizer] Downsampling ${settings.tier}: capping from ${settings.currentBitrateMbps} Mbps to ${settings.targetBitrateKbps / 1000} Mbps.`);

    // If macOS, use hardware acceleration (Apple Silicon Media Engine)
    const tryHardware = process.platform === 'darwin';
    if (tryHardware) {
      const hwArgs = [
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
      const { resolvedFiles = [], eventId, eventSlug, backendUrl, token, uploadQuality = '4k', videoQuality = '14mbps', applyWatermark = true, concurrency = 6, daemons = 2 } = config;
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
      } else {
        // Automatically purge any leftover files from past failed or aborted sessions
        try {
          const staleFiles = fs.readdirSync(tempDir);
          for (const file of staleFiles) {
            try {
              const fullPath = path.join(tempDir, file);
              if (fs.statSync(fullPath).isFile()) {
                fs.unlinkSync(fullPath);
              }
            } catch (_) {}
          }
        } catch (_) {}
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
        bakedCoverPhotoIds: [],
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
            const isVideoExt = ext === '.mp4' || ext === '.mov' || ext === '.m4v';
            const isVideo = isVideoExt && !fileItem.isComingSoon;

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
                // Enforce 10GB max limit
                const MAX_VIDEO_SIZE = 10 * 1024 * 1024 * 1024;
                if (fileItem.sizeBytes > MAX_VIDEO_SIZE) {
                  const sizeGb = (fileItem.sizeBytes / (1024 * 1024 * 1024)).toFixed(2);
                  const err = new Error(`Video size (${sizeGb} GB) exceeds 10GB limit.`);
                  err.userAction = 'Re-export a shorter cut or lower export bitrate in Premiere/DaVinci under 10GB.';
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

                // 2. Determine target bitrate settings (ensuring Cloudflare R2 5GiB single PUT compatibility)
                const currentBitrateKbps = meta ? meta.bitrateKbps : Math.round((fileItem.sizeBytes * 8) / (1024 * 180));
                const videoDurationSec = meta ? (meta.durationSec || 0) : 0;
                const settings = getVideoTargetSettings(videoWidth, videoHeight, currentBitrateKbps, fileItem.sizeBytes, videoDurationSec, videoQuality);
                settings.currentBitrateMbps = (currentBitrateKbps / 1000).toFixed(1);

                const targetMbpsStr = (settings.targetBitrateKbps / 1000).toFixed(0);
                const progressDetail = settings.shouldDownsample
                  ? `Compressing ${settings.tier} (${settings.currentBitrateMbps} Mbps ➔ ${targetMbpsStr} Mbps)...`
                  : `Faststart remuxing ${settings.tier}...`;

                mainWindow.webContents.send('upload-progress', {
                  status: 'row-processing',
                  filename,
                  percent: 1,
                  overallPercent: 1,
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
                    settings,
                    durationSec: videoDurationSec,
                    onProgress: (compressPct) => {
                      const rowPct = Math.min(Math.max(Math.round((compressPct / 100) * 40), 1), 40);
                      const detailMsg = settings.shouldDownsample
                        ? `Compressing (${compressPct}% - ${targetMbpsStr} Mbps)...`
                        : `Faststart remuxing (${compressPct}%)...`;

                      mainWindow.webContents.send('upload-progress', {
                        status: 'row-processing',
                        filename,
                        percent: compressPct,
                        overallPercent: rowPct,
                        detail: detailMsg,
                        index,
                        total: totalPhotos
                      });
                    }
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
                  if (fs.existsSync(optimizedDest)) {
                    try { fs.unlinkSync(optimizedDest); } catch (_) {}
                  }
                  const isDiskFull = optErr.message && (
                    optErr.message.includes('ENOSPC') ||
                    optErr.message.includes('space') ||
                    optErr.message.includes('Conversion failed') ||
                    optErr.message.includes('No space left on device')
                  );
                  const err = new Error(isDiskFull ? 'Your Mac hard drive is out of disk space.' : `Video optimization failed: ${optErr.message}`);
                  err.userAction = isDiskFull
                    ? 'Hard drive is completely full (0 MB free). Empty your Trash or delete unused files to free up at least 5-10 GB of disk space on your Mac, then retry.'
                    : 'Re-export the film as a standard H.264 MP4 (AAC audio) in Premiere/Final Cut/DaVinci, then re-upload.';
                  throw err;
                }

                // 4. Custom Cover Art Processing or FFmpeg Poster Extraction (Strict 3:4 Portrait / 4:3 Vertical Poster)
                let customCoverApplied = false;
                const targetW = 1080;
                const targetH = 1440; // 3:4 Portrait (4:3 Vertical) Movie Poster Aspect Ratio

                if (fileItem.customCoverPath && fs.existsSync(fileItem.customCoverPath)) {
                  try {
                    // Pass 1: Smart crop with attention strategy (subject & face aware) in 2:3 portrait
                    posterBuffer = await sharp(fileItem.customCoverPath)
                      .rotate() // Respect EXIF camera orientation
                      .resize(targetW, targetH, {
                        fit: 'cover',
                        position: 'centre'
                      })
                      .jpeg({ quality: 92, mozjpeg: true, progressive: true })
                      .toBuffer();

                    customCoverApplied = true;
                    uploadReport.customCoversApplied.push({
                      filename,
                      coverName: path.basename(fileItem.customCoverPath),
                      aspectRatio: '3:4 (4:3 Vertical Poster)'
                    });
                    console.log(`[Video Optimizer] Custom 4:3 portrait cover applied for ${filename} (${posterBuffer.length} bytes)`);
                  } catch (coverErr) {
                    console.warn(`[Video Optimizer] Custom cover processing error for ${filename}:`, coverErr.message);
                  }
                }
                else if (fileItem.customCoverBase64 || (fileItem.customCoverPreview && fileItem.customCoverPreview.startsWith("data:image"))) {
                  try {
                    const b64 = (fileItem.customCoverBase64 || fileItem.customCoverPreview).replace(/^data:image\/\w+;base64,/, "");
                    const buf = Buffer.from(b64, "base64");
                    posterBuffer = await sharp(buf)
                      .resize(targetW, targetH, { fit: "cover", position: "centre" })
                      .jpeg({ quality: 92, mozjpeg: true, progressive: true })
                      .toBuffer();
                    customCoverApplied = true;
                    uploadReport.customCoversApplied.push({
                      filename,
                      coverName: "custom_baked_poster.jpg",
                      aspectRatio: "3:4 (4:3 Vertical Poster)"
                    });
                    console.log(`[Video Optimizer] Custom 4:3 portrait cover applied from base64 for ${filename} (${posterBuffer.length} bytes)`);
                  } catch (b64Err) {
                    console.warn(`[Video Optimizer] Base64 cover processing failed for ${filename}:`, b64Err.message);
                  }
                }

                // If no custom cover or custom cover failed, fall back to FFmpeg frame extraction at 1s / 0s
                if (!posterBuffer) {
                  const extractPoster = (seekTime) => {
                    return new Promise((resolve) => {
                      const { execFile } = require('child_process');
                      const posterSource = readyVideoPath || originalPath;
                      execFile(ffmpeg, ['-y', '-ss', seekTime, '-i', posterSource, '-vframes', '1', '-q:v', '2', tempThumbPath], async (err) => {
                        if (!err && fs.existsSync(tempThumbPath) && fs.statSync(tempThumbPath).size > 0) {
                          try {
                            const rawFrame = fs.readFileSync(tempThumbPath);
                            // Crop extracted frame into 2:3 portrait movie poster
                            posterBuffer = await sharp(rawFrame)
                              .resize(targetW, targetH, { fit: 'cover', position: sharp.strategy.attention })
                              .jpeg({ quality: 90 })
                              .toBuffer();
                          } catch (_) {
                            try { posterBuffer = fs.readFileSync(tempThumbPath); } catch (_) {}
                          }
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

              // Support custom baked covers for coming soon posters
              const inputPhotoPath = (fileItem.isComingSoon && fileItem.hasBakedCover && fileItem.customCoverPath && fs.existsSync(fileItem.customCoverPath))
                ? fileItem.customCoverPath
                : originalPath;

              // Get original metadata header first (fast header-only check, does not decompress pixels)
              const meta = await sharp(inputPhotoPath).metadata();
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
              let pipeline = sharp(inputPhotoPath).rotate();
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
                percent: 1,
                overallPercent: 41,
                detail: isVideo ? `Starting upload (${(item.videoSize / (1024 * 1024)).toFixed(0)} MB)...` : 'Uploading...',
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
                const { PassThrough } = require('stream');
                const videoStream = fs.createReadStream(item.readyVideoPath);
                const progressStream = new PassThrough();
                videoStream.on('error', (err) => progressStream.emit('error', err));

                let uploadedBytes = 0;
                let lastReportedUploadPct = -1;
                const totalVideoBytes = item.videoSize;
                const totalMb = (totalVideoBytes / (1024 * 1024)).toFixed(0);

                const reportUploadProgress = (loaded) => {
                  if (typeof loaded === 'number' && loaded > uploadedBytes) {
                    uploadedBytes = loaded;
                  }
                  const pct = totalVideoBytes > 0
                    ? Math.min(Math.max(Math.round((uploadedBytes / totalVideoBytes) * 100), 1), 99)
                    : 50;
                  if (pct !== lastReportedUploadPct) {
                    lastReportedUploadPct = pct;
                    const rowPct = Math.min(Math.max(40 + Math.round((pct / 100) * 59), 41), 99);
                    const uploadedMb = (uploadedBytes / (1024 * 1024)).toFixed(0);
                    const detailMsg = `Uploading (${pct}% - ${uploadedMb}/${totalMb} MB)...`;

                    mainWindow.webContents.send('upload-progress', {
                      status: 'row-uploading',
                      filename,
                      percent: pct,
                      overallPercent: rowPct,
                      detail: detailMsg,
                      index,
                      total: totalPhotos
                    });
                  }
                };

                progressStream.on('data', (chunk) => {
                  uploadedBytes += chunk.length;
                  reportUploadProgress(uploadedBytes);
                });

                videoStream.pipe(progressStream);

                uploadPromises.push(
                  axios.put(ticket.photoPutUrl, progressStream, {
                    headers: {
                      'Content-Type': 'video/mp4',
                      'Content-Length': totalVideoBytes,
                      'Cache-Control': 'public, max-age=31536000, immutable'
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    onUploadProgress: (progressEvent) => {
                      if (progressEvent && progressEvent.loaded) {
                        reportUploadProgress(progressEvent.loaded);
                      }
                    }
                  })
                );

                const putThumbUrl = ticket.thumbnailPutUrl || ticket.thumbPutUrl;
                if (putThumbUrl && item.posterBuffer) {
                  uploadPromises.push(
                    axios.put(putThumbUrl, item.posterBuffer, {
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
                    },
                    onUploadProgress: (progressEvent) => {
                      if (progressEvent && progressEvent.total) {
                        const pct = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                        const rowPct = Math.min(Math.max(40 + Math.round((pct / 100) * 59), 41), 99);
                        mainWindow.webContents.send('upload-progress', {
                          status: 'row-uploading',
                          filename,
                          percent: pct,
                          overallPercent: rowPct,
                          detail: `Uploading (${pct}%)...`,
                          index,
                          total: totalPhotos
                        });
                      }
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

              const isCinema = (tabName || '').trim().toUpperCase() === 'CINEMA';
              const effectiveComingSoon = Boolean(fileItem.isComingSoon || (isCinema && !isVideo));
              const hasBaked = Boolean(fileItem.hasBakedCover || fileItem.isCoverBaked);

              const finalExif = {
                ...(exifData || {}),
                hasBakedCover: hasBaked,
                isCoverBaked: hasBaked,
                isFeatured: Boolean(fileItem.isFeatured),
                isComingSoon: effectiveComingSoon,
                ...(fileItem.subtitle ? { subtitle: fileItem.subtitle } : (effectiveComingSoon ? { subtitle: 'COMING SOON • TEASER POSTER' } : {})),
                originalFileSize: fileItem.sizeBytes,
                fileSize: isVideo ? item.videoSize : cleanCompressedBuffer.length,
                ...(fileItem.title ? { title: fileItem.title } : {}),
                ...(fileItem.description ? { description: fileItem.description } : {}),
                ...(fileItem.cinemaCategory ? { cinemaCategory: fileItem.cinemaCategory } : {}),
                ...(typeof fileItem.sortOrder === 'number' ? { sortOrder: fileItem.sortOrder } : { sortOrder: index + 1 }),
              };

              results.push({
                filename: uploadFilename,
                r2Url,
                thumbnailUrl: (isVideo && !item.posterBuffer) ? null : (ticket.thumbnailUrl || null),
                hasBakedCover: hasBaked,
                isCoverBaked: hasBaked,
                fileSize: Math.min(isVideo ? item.videoSize : cleanCompressedBuffer.length, 2147483647),
                originalSize: Math.min(fileItem.sizeBytes, 2147483647),
                tabName: tabName,
                title: fileItem.title || null,
                subtitle: fileItem.subtitle || (effectiveComingSoon ? 'COMING SOON • TEASER POSTER' : null),
                description: fileItem.description || null,
                cinemaCategory: fileItem.cinemaCategory || null,
                sortOrder: typeof fileItem.sortOrder === 'number' ? fileItem.sortOrder : (index + 1),
                exif: finalExif,
                isFeatured: Boolean(fileItem.isFeatured),
                isComingSoon: effectiveComingSoon,
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
                percent: 100,
                overallPercent: 100,
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
              const baked = bulkRes.data.photos
                .filter(p => p.exif?.hasBakedCover || p.exif?.isCoverBaked || p.hasBakedCover || p.isCoverBaked)
                .map(p => p.id)
                .filter(Boolean);
              if (baked.length > 0) {
                if (!uploadReport.bakedCoverPhotoIds) uploadReport.bakedCoverPhotoIds = [];
                uploadReport.bakedCoverPhotoIds.push(...baked);
              }
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
    let { filePath, eventId, photoId, backendUrl, token, base64Content, filename } = config;
    if ((!filePath && !base64Content) || !eventId || !photoId || !backendUrl || !token) {
      throw new Error('Missing config parameters for video cover update');
    }

    try {
      if (filePath && !base64Content) {
        if (!fs.existsSync(filePath)) {
          throw new Error(`Cover photo file not found at path: ${filePath}`);
        }
        const fileBuffer = await fs.promises.readFile(filePath);
        base64Content = fileBuffer.toString('base64');
        filename = filename || path.basename(filePath);
      }

      if (base64Content && base64Content.includes('base64,')) {
        base64Content = base64Content.split('base64,')[1];
      }
      filename = filename || 'poster.jpg';

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

  // Update photo/video metadata (title, subtitle, description, cinemaCategory, sortOrder, isFeatured, isComingSoon)
  ipcMain.handle('update-video-metadata', async (event, config) => {
    const { eventId, photoId, title, subtitle, description, cinemaCategory, sortOrder, isFeatured, isComingSoon, backendUrl, token } = config || {};
    const finalBackendUrl = backendUrl || 'http://localhost:5001';
    if (!token) throw new Error('Authentication required');
    if (!eventId || !photoId) throw new Error('Missing eventId or photoId');

    try {
      const res = await axios.patch(`${finalBackendUrl}/api/gallery/events/${eventId}/photos/${photoId}`, {
        title,
        subtitle,
        description,
        cinemaCategory,
        sortOrder,
        isFeatured,
        isComingSoon
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 15000
      });
      return res.data;
    } catch (err) {
      console.error('Update video metadata error:', err);
      const msg = err.response && err.response.data && err.response.data.error ? err.response.data.error : err.message;
      throw new Error(msg);
    }
  });

  // Reorder photos/videos in batch
  ipcMain.handle('reorder-videos', async (event, config) => {
    const { eventId, orders, backendUrl, token } = config || {};
    const finalBackendUrl = backendUrl || 'http://localhost:5001';
    if (!token) throw new Error('Authentication required');
    if (!eventId || !Array.isArray(orders)) throw new Error('Missing eventId or orders');

    try {
      const res = await axios.post(`${finalBackendUrl}/api/gallery/events/${eventId}/photos/reorder`, {
        orders
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 15000
      });
      return res.data;
    } catch (err) {
      console.error('Reorder videos error:', err);
      const msg = err.response && err.response.data && err.response.data.error ? err.response.data.error : err.message;
      throw new Error(msg);
    }
  });

  // Attach or replace video for an existing photo/film record
  ipcMain.handle('attach-video-to-film', async (event, config) => {
    const {
      eventId,
      photoId,
      videoPath,
      videoQuality = '14mbps',
      backendUrl,
      token
    } = config || {};

    const mainWindow = typeof getMainWindow === 'function' ? getMainWindow() : null;

    if (!eventId || !photoId || !videoPath || !backendUrl || !token) {
      throw new Error('Missing parameters to attach video to film');
    }

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found at: ${videoPath}`);
    }

    const sendProgress = (data) => {
      if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('attach-video-progress', data);
      }
    };

    let tempOptimizedPath = null;
    try {
      const ffmpeg = getFfmpegPath();
      if (!ffmpeg) {
        throw new Error('FFmpeg binary not found on your system.');
      }

      const filename = path.basename(videoPath);
      const fileStats = fs.statSync(videoPath);
      const fileSizeBytes = fileStats.size;

      sendProgress({
        stage: 'probing',
        percent: 5,
        detail: `Inspecting ${filename}...`
      });

      // 1. Probe video
      let meta = null;
      try {
        meta = await probeVideoMetadata(ffmpeg, videoPath);
      } catch (probeErr) {
        throw new Error(`Cannot inspect video metadata: ${probeErr.message}`);
      }

      const videoWidth = meta ? meta.width : 1920;
      const videoHeight = meta ? meta.height : 1080;
      const currentBitrateKbps = meta ? meta.bitrateKbps : Math.round((fileSizeBytes * 8) / (1024 * 180));
      const videoDurationSec = meta ? (meta.durationSec || 0) : 0;

      // 2. Determine target bitrate & faststart settings
      const settings = getVideoTargetSettings(videoWidth, videoHeight, currentBitrateKbps, fileSizeBytes, videoDurationSec, videoQuality);
      settings.currentBitrateMbps = (currentBitrateKbps / 1000).toFixed(1);

      const targetMbpsStr = (settings.targetBitrateKbps / 1000).toFixed(0);
      const tempDir = path.join(os.tmpdir(), 'misty_attach_video');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      tempOptimizedPath = path.join(tempDir, `opt_${Date.now()}_${path.basename(videoPath, path.extname(videoPath))}.mp4`);

      sendProgress({
        stage: 'optimizing',
        percent: 10,
        detail: settings.shouldDownsample
          ? `Compressing ${settings.tier} (${settings.currentBitrateMbps} Mbps ➔ ${targetMbpsStr} Mbps)...`
          : `Faststart remuxing ${settings.tier}...`
      });

      // 3. Optimize with Faststart
      await optimizeVideoAsync({
        ffmpeg,
        inputPath: videoPath,
        outputPath: tempOptimizedPath,
        settings,
        durationSec: videoDurationSec,
        onProgress: (compressPct) => {
          const overallPct = Math.min(Math.max(Math.round((compressPct / 100) * 45), 10), 45);
          const detailMsg = settings.shouldDownsample
            ? `Compressing (${compressPct}% - ${targetMbpsStr} Mbps)...`
            : `Faststart remuxing (${compressPct}%)...`;
          sendProgress({
            stage: 'optimizing',
            percent: overallPct,
            detail: detailMsg
          });
        }
      });

      if (!fs.existsSync(tempOptimizedPath) || fs.statSync(tempOptimizedPath).size === 0) {
        throw new Error('Optimized video file was not created or is empty.');
      }

      const optimizedStats = fs.statSync(tempOptimizedPath);
      const optimizedSize = optimizedStats.size;
      const uploadFilename = `${path.basename(videoPath, path.extname(videoPath))}.mp4`;

      sendProgress({
        stage: 'uploading',
        percent: 48,
        detail: 'Requesting upload URL...'
      });

      // 4. Request presigned upload URL from backend
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
      const photoPutUrl = ticket.photoPutUrl;

      // 5. Stream upload to R2
      const { PassThrough } = require('stream');
      const videoStream = fs.createReadStream(tempOptimizedPath);
      const progressStream = new PassThrough();
      videoStream.on('error', (err) => progressStream.emit('error', err));

      let uploadedBytes = 0;
      let lastReportedUploadPct = -1;
      const totalMb = (optimizedSize / (1024 * 1024)).toFixed(0);

      progressStream.on('data', (chunk) => {
        uploadedBytes += chunk.length;
        const uploadPct = optimizedSize > 0 ? Math.min(Math.max(Math.round((uploadedBytes / optimizedSize) * 100), 1), 99) : 50;
        if (uploadPct !== lastReportedUploadPct) {
          lastReportedUploadPct = uploadPct;
          const overallPct = Math.min(Math.max(50 + Math.round((uploadPct / 100) * 45), 50), 96);
          const uploadedMb = (uploadedBytes / (1024 * 1024)).toFixed(0);
          sendProgress({
            stage: 'uploading',
            percent: overallPct,
            detail: `Uploading (${uploadPct}% - ${uploadedMb}/${totalMb} MB)...`
          });
        }
      });

      videoStream.pipe(progressStream);

      await axios.put(photoPutUrl, progressStream, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': optimizedSize,
          'Cache-Control': 'public, max-age=31536000, immutable'
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      sendProgress({
        stage: 'linking',
        percent: 98,
        detail: 'Linking video to film and updating status...'
      });

      // 6. Call backend to attach video to photo record
      const attachRes = await axios.post(`${backendUrl}/api/gallery/events/${eventId}/photos/${photoId}/attach-video`, {
        r2Url,
        filename: uploadFilename,
        fileSize: optimizedSize,
        width: videoWidth,
        height: videoHeight,
        duration: videoDurationSec
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      sendProgress({
        stage: 'complete',
        percent: 100,
        detail: 'Complete!'
      });

      return attachRes.data;
    } catch (err) {
      console.error('attach-video-to-film error:', err);
      sendProgress({
        stage: 'error',
        percent: 0,
        detail: err.message
      });
      throw err;
    } finally {
      if (tempOptimizedPath && fs.existsSync(tempOptimizedPath)) {
        try { fs.unlinkSync(tempOptimizedPath); } catch (_) {}
      }
    }
  });
}

module.exports = {
  setupUploadHandlers,
  cancelUpload
};
