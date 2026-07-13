const { app, BrowserWindow, dialog, ipcMain, shell, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const sharp = require('sharp');
const exifr = require('exifr');
const axios = require('axios');
const https = require('https');

function downloadFileHelper(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: Status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// Prevent main process crashes when stdout/stderr pipes are closed/broken
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') {
    // Silently ignore broken pipe errors
  }
});
process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') {
    // Silently ignore broken pipe errors
  }
});

let mainWindow;
let pendingDeepLinkSlug = null;

// Enforce single instance lock for deep-linking protocol
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Parse deep link slug from argument
    const url = commandLine.find(arg => arg.startsWith('mistyuploader://'));
    if (url) {
      const slug = url.replace('mistyuploader://event/', '').replace(/\/$/, '');
      if (mainWindow) {
        mainWindow.webContents.send('deep-link', slug);
      } else {
        pendingDeepLinkSlug = slug;
      }
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0c0c0e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    try {
      console.log(`[RENDERER CONSOLE] [LVL:${level}] ${message} (${path.basename(sourceId)}:${line})`);
    } catch (e) {
      // Ignore pipe/stream write errors
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingDeepLinkSlug) {
      mainWindow.webContents.send('deep-link', pendingDeepLinkSlug);
      pendingDeepLinkSlug = null;
    }
  });
}

// Register protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('mistyuploader', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('mistyuploader');
}
app.whenReady().then(() => {
  // Parse deep link if opened with protocol on startup
  const url = process.argv.find(arg => arg.startsWith('mistyuploader://'));
  if (url) {
    pendingDeepLinkSlug = url.replace('mistyuploader://event/', '').replace(/\/$/, '');
  }

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler: Directory Selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// IPC Handler: Get Folder Stats (photo count and size in bytes)
ipcMain.handle('get-folder-stats', async (event, paths) => {
  let count = 0;
  let sizeBytes = 0;

  const processPath = (itemPath) => {
    if (!fs.existsSync(itemPath)) return;
    const stats = fs.statSync(itemPath);

    if (stats.isDirectory()) {
      try {
        const items = fs.readdirSync(itemPath);
        for (const item of items) {
          processPath(path.join(itemPath, item));
        }
      } catch (err) {
        console.error(`Failed to read folder stats for ${itemPath}:`, err.message);
      }
    } else {
      const ext = path.extname(itemPath).toLowerCase();
      if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
        count++;
        sizeBytes += stats.size;
      }
    }
  };

  for (const p of paths) {
    processPath(p);
  }

  return { count, sizeBytes };
});

// IPC Handler: Get Folder Files details (returns flat list of images with sizes and tabs)
ipcMain.handle('get-folder-files', async (event, config) => {
  const { paths } = config;
  const fileList = [];

  const scanDir = (dirPath, rootPath, topSubDir) => {
    if (!fs.existsSync(dirPath)) return;
    try {
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        try {
          const stats = fs.statSync(itemPath);
          if (stats.isDirectory()) {
            // Determine the top-level subdirectory under root
            let currentTopSubDir = topSubDir;
            if (dirPath === rootPath) {
              currentTopSubDir = item;
            }
            scanDir(itemPath, rootPath, currentTopSubDir);
          } else {
            const ext = path.extname(item).toLowerCase();
            if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
              fileList.push({
                path: itemPath,
                name: item,
                sizeBytes: stats.size,
                parentDir: path.basename(dirPath),
                topSubDir: topSubDir || null,
                rootFolder: path.basename(rootPath)
              });
            }
          }
        } catch (e) {
          console.warn(`Failed to process item ${itemPath}:`, e.message);
        }
      }
    } catch (err) {
      console.warn(`Failed to read directory ${dirPath}:`, err.message);
    }
  };

  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    try {
      const stats = fs.statSync(p);
      if (stats.isDirectory()) {
        scanDir(p, p, null);
      } else {
        const ext = path.extname(p).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
          fileList.push({
            path: p,
            name: path.basename(p),
            sizeBytes: stats.size,
            parentDir: path.basename(path.dirname(p)),
            topSubDir: null,
            rootFolder: null // Direct file drag — use tab dropdown selection, not disk folder name
          });
        }
      }
    } catch (e) {
      console.error(`Error statting path ${p}:`, e.message);
    }
  }

  return fileList;
});

// IPC Handler: Open External URLs
ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

let isUploadCancelled = false;
ipcMain.on('cancel-upload', () => {
  isUploadCancelled = true;
});

// IPC Handler: Image Processing & Upload Queue
// Helper to initialize and manage face recognition daemon
async function initFaceRecDaemon() {
  let pythonScriptPath = path.join(__dirname, 'face_rec.py');
  if (!fs.existsSync(pythonScriptPath)) {
    pythonScriptPath = path.join(process.resourcesPath, 'face_rec.py');
  }

  const { spawn } = require('child_process');
  let pythonDaemon = null;
  let isDaemonReady = false;

  try {
    pythonDaemon = spawn('python3', [pythonScriptPath, 'daemon']);
    pythonDaemon.on('error', (err) => {
      console.warn('[FaceRec] Python daemon spawn error:', err.message);
      isDaemonReady = false;
    });
  } catch (err) {
    console.warn('[FaceRec] Python daemon spawn caught exception:', err.message);
  }

  const killDaemon = () => {
    if (!pythonDaemon) return;
    try {
      pythonDaemon.stdin.write(JSON.stringify({ action: 'exit' }) + '\n');
      pythonDaemon.kill();
    } catch (e) {}
  };

  process.on('exit', killDaemon);

  let daemonQueue = [];
  let isDaemonProcessing = false;

  const processNextDaemonJob = () => {
    if (!pythonDaemon || daemonQueue.length === 0 || isDaemonProcessing) return;
    
    isDaemonProcessing = true;
    const { imagePath, resolve, reject } = daemonQueue.shift();
    
    try {
      pythonDaemon.stdin.write(JSON.stringify({ action: 'extract', image_path: imagePath }) + '\n');
    } catch (err) {
      isDaemonProcessing = false;
      reject(err);
      processNextDaemonJob();
      return;
    }
    
    const onData = (data) => {
      onData.buffer = (onData.buffer || '') + data.toString();
      const lines = onData.buffer.split('\n');
      onData.buffer = lines.pop();
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const result = JSON.parse(line);
            if (result.image_path === imagePath) {
              pythonDaemon.stdout.off('data', onData);
              pythonDaemon.stderr.off('data', onErr);
              isDaemonProcessing = false;
              resolve(result.faces || []);
              processNextDaemonJob();
              return;
            }
          } catch (e) {
            console.error('Failed to parse Python line:', line, e);
          }
        }
      }
    };
    
    const onErr = (data) => {
      console.warn('Python Daemon stderr:', data.toString());
    };
    
    pythonDaemon.stdout.on('data', onData);
    pythonDaemon.stderr.on('data', onErr);
  };

  const getFacesFromDaemon = (imagePath) => {
    if (!isDaemonReady) {
      return Promise.resolve([]);
    }
    const tStart = Date.now();
    return new Promise((resolve, reject) => {
      daemonQueue.push({ 
        imagePath, 
        resolve: (faces) => {
          console.log(`[BENCHMARK-PYTHON] ${path.basename(imagePath)}: ${Date.now() - tStart}ms`);
          resolve(faces);
        }, 
        reject 
      });
      processNextDaemonJob();
    });
  };

  if (pythonDaemon) {
    await new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('[FaceRec] Python daemon ready check timed out after 10s. Skipping local face recognition.');
          if (pythonDaemon) {
            pythonDaemon.stdout.off('data', onDaemonReady);
            killDaemon();
          }
          resolve();
        }
      }, 10000);

      let buffer = '';
      const onDaemonReady = (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim()) {
            try {
              const res = JSON.parse(line);
              if (res.status === 'ready') {
                clearTimeout(timeout);
                if (!resolved) {
                  resolved = true;
                  isDaemonReady = true;
                  console.log('[FaceRec] Python daemon is ready.');
                  if (pythonDaemon) {
                    pythonDaemon.stdout.off('data', onDaemonReady);
                  }
                  resolve();
                  return;
                }
              }
            } catch (e) {
              console.error('Failed to parse ready line:', line, e);
            }
          }
        }
      };

      pythonDaemon.stdout.on('data', onDaemonReady);
    });
  }

  return { isDaemonReady, getFacesFromDaemon, killDaemon };
}

let activeBlockerId = null;

// IPC Handler: Image Processing & Upload Queue
ipcMain.handle('process-photos', async (event, config) => {
  isUploadCancelled = false;
    try {
    activeBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    console.log('[Uploader] Started powerSaveBlocker to prevent display sleep during upload. ID:', activeBlockerId);
  } catch (err) {
    console.error('Failed to start powerSaveBlocker:', err);
  }

  try {
    const { resolvedFiles = [], eventId, eventSlug, backendUrl, token, uploadQuality = '4k', applyWatermark = true } = config;
    const watermarkPath = path.join(__dirname, 'assets', 'watermark.png');

  // Set resolution and JPEG compression quality based on settings
  let targetWidth = null; // null means no resizing (Original Resolution)
  let targetHeight = null;
  let jpegQuality = 70; // Matches Kwikpik HQ (typically 70% quality index)

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

  // Initialize daemon using helper
  const daemon = await initFaceRecDaemon();
  const isDaemonReady = daemon.isDaemonReady;
  const getFacesFromDaemon = daemon.getFacesFromDaemon;
  const killDaemon = daemon.killDaemon;

  if (!isDaemonReady) {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Continue Upload', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Face Scanner Offline',
      message: 'The local face recognition engine is offline (Python daemon failed to start).\n\nWould you like to continue the upload without local face scanning (you can scan and backfill the faces later), or cancel to retry?',
    });
    if (choice === 1) {
      if (killDaemon) killDaemon();
      return { success: false, error: 'Cancelled by user due to offline face scanner' };
    }
  }

  let hasPromptedMidUploadCrash = false;
  const results = [];
  let processedCount = 0;
  let currentIndex = 0;
  const CONCURRENCY = 4; // Bounded concurrency to prevent RAM/CPU exhaustion

  const processPhoto = async (index) => {
    const fileItem = resolvedFiles[index];
    const filename = fileItem.name;
    const originalPath = fileItem.path;
    const tabName = fileItem.tabName;
    const tStart = Date.now();

    mainWindow.webContents.send('upload-progress', {
      status: 'row-processing',
      filename,
      index,
      total: totalPhotos
    });

    if (isUploadCancelled) return;

    try {
      // 1. Parse EXIF locally (very fast, done in parallel)
      const tExifStart = Date.now();
      let exifData = null;
      let capturedAt = null;
      try {
        const metadata = await exifr.parse(originalPath, {
          tiff: true,
          exif: true,
          device: true
        });
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
          if (metadata.DateTimeOriginal) {
            capturedAt = new Date(metadata.DateTimeOriginal).toISOString();
          }
        }
      } catch (exifErr) {
        console.warn(`Failed to parse EXIF for ${filename}:`, exifErr.message);
      }
      const tExifEnd = Date.now() - tExifStart;
      // 2. Dispatch face extraction concurrently to the warm Python daemon
      const facePromise = getFacesFromDaemon(originalPath).catch(err => {
        console.warn(`Face detection failed for ${filename}:`, err);
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
        return [];
      });
      // 3. Compress original image using sharp directly in RAM
      const tSharpStart = Date.now();

      // Generate thumbnail locally in RAM (using a dedicated sharp instance to prevent stream collision)
      const thumbnailPromise = sharp(originalPath)
        .rotate()
        .resize(720, 720, { fit: 'inside', withoutEnlargement: true })
        .sharpen()
        .jpeg({ quality: 85, progressive: true, mozjpeg: true })
        .toBuffer()
        .catch(async (err) => {
          console.warn(`Failed first thumbnail attempt for ${filename}: ${err.message}. Retrying...`);
          try {
            // Retry thumbnail generation once
            return await sharp(originalPath)
              .rotate()
              .resize(720, 720, { fit: 'inside', withoutEnlargement: true })
              .sharpen()
              .jpeg({ quality: 85, progressive: true, mozjpeg: true })
              .toBuffer();
          } catch (retryErr) {
            console.error(`Local thumbnail generation completely failed for ${filename}:`, retryErr.message);
            return null;
          }
        });

      let pipeline = sharp(originalPath).rotate();

      if (targetWidth && targetHeight) {
        pipeline = pipeline
          .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
          .sharpen();
      }

      if (applyWatermark && fs.existsSync(watermarkPath)) {
        try {
          const resizedBuffer = await pipeline.toBuffer();
          const resizedMetadata = await sharp(resizedBuffer).metadata();
          const imgWidth = resizedMetadata.width;
          const imgHeight = resizedMetadata.height;

          const shortestSide = Math.min(imgWidth, imgHeight);
          const watermarkWidth = Math.round(shortestSide * 0.15);
          const watermarkBuffer = fs.readFileSync(watermarkPath);

          const resizedWatermarkBuffer = await sharp(watermarkBuffer)
            .resize(watermarkWidth)
            .toBuffer();

          const padding = Math.max(12, Math.round(shortestSide * 0.03));
          const watermarkMetadata = await sharp(resizedWatermarkBuffer).metadata();
          const x = padding;
          const y = imgHeight - watermarkMetadata.height - padding;

          pipeline = sharp(resizedBuffer)
            .composite([{
              input: resizedWatermarkBuffer,
              left: x,
              top: y
            }]);
        } catch (wmErr) {
          console.error(`Failed to overlay watermark on ${filename}:`, wmErr.message);
          // Fall back
          pipeline = sharp(originalPath).rotate();
          if (targetWidth && targetHeight) {
            pipeline = pipeline
              .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
              .sharpen();
          }
        }
      }

      const compressedBuffer = await pipeline
        .jpeg({
          quality: jpegQuality,
          progressive: true,
          mozjpeg: true
        })
        .toBuffer();

      const cleanCompressedBuffer = await sharp(compressedBuffer)
        .withMetadata({
          orientation: 1,
          exif: {
            IFD0: {
              Copyright: 'https://www.mistyvisuals.com/'
            }
          }
        })
        .toBuffer();

      mainWindow.webContents.send('upload-progress', {
        status: 'row-uploading',
        filename,
        index,
        total: totalPhotos
      });

      const thumbnailBuffer = await thumbnailPromise;
      const tSharpEnd = Date.now() - tSharpStart;

      if (isUploadCancelled) return;

      // 4. Await face extraction coordinates
      const faces = await facePromise;

      if (isUploadCancelled) return;

      // 5. Request pre-signed R2 upload URLs from backend
      const tTicketStart = Date.now();
      const ticketRes = await axios.post(`${backendUrl}/api/gallery/events/${eventId}/generate-upload-urls`, {
        uploads: [{
          filename,
          faceIds: faces.map(f => f.faceId)
        }]
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const tTicketEnd = Date.now() - tTicketStart;

      const ticket = ticketRes.data.uploads[0];
      const r2Url = ticket.r2Url;
      const thumbnailUrl = ticket.thumbnailUrl;

      // 6. Upload photo, thumbnail, and face crops directly to R2 in parallel
      const tUploadStart = Date.now();
      const uploadPromises = [];

      // Upload main photo
      uploadPromises.push(
        axios.put(ticket.photoPutUrl, cleanCompressedBuffer, {
          headers: { 
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable'
          }
        })
      );

      // Upload thumbnail
      if (thumbnailBuffer) {
        uploadPromises.push(
          axios.put(ticket.thumbPutUrl, thumbnailBuffer, {
            headers: { 
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'public, max-age=31536000, immutable'
            }
          })
        );
      }

      // Crop and upload faces
      const tCropStart = Date.now();
      const facesToUpload = [];
      for (const face of faces) {
        if (face.box) {
          const faceTicket = ticket.faces.find(f => f.faceId === face.faceId);
          if (faceTicket) {
            try {
              const faceBuffer = await sharp(originalPath)
                .extract({ left: face.box[0], top: face.box[1], width: face.box[2], height: face.box[3] })
                .toBuffer();

              uploadPromises.push(
                axios.put(faceTicket.putUrl, faceBuffer, {
                  headers: { 
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'public, max-age=31536000, immutable'
                  }
                })
              );

              facesToUpload.push({
                faceId: face.faceId,
                vector: face.vector
              });
            } catch (cropErr) {
              console.error(`Failed to crop face ${face.faceId}:`, cropErr.message);
            }
          }
        }
      }
      const tCropEnd = Date.now() - tCropStart;

      await Promise.all(uploadPromises);
      const tUploadEnd = Date.now() - tUploadStart;
      const finalMetadata = await sharp(cleanCompressedBuffer).metadata();

      results.push({
        filename,
        r2Url,
        thumbnailUrl,
        fileSize: cleanCompressedBuffer.length,
        originalSize: fileItem.sizeBytes,
        tabName: tabName,
        exif: exifData,
        capturedAt: capturedAt,
        width: finalMetadata.width,
        height: finalMetadata.height,
        faces: facesToUpload
      });

      const tTotal = Date.now() - tStart;
      console.log(`[BENCHMARK] ${filename}: Total ${tTotal}ms | EXIF ${tExifEnd}ms | Sharp ${tSharpEnd}ms | Upload ${tUploadEnd}ms | FaceCrops ${tCropEnd}ms`);

      mainWindow.webContents.send('upload-progress', {
        status: 'row-success',
        filename,
        index,
        total: totalPhotos
      });

    } catch (err) {
      console.error(`Failed to process photo ${filename}:`, err);
      mainWindow.webContents.send('upload-progress', {
        status: 'row-error',
        filename,
        index,
        total: totalPhotos,
        error: err.message
      });
    }

    processedCount++;
    mainWindow.webContents.send('upload-progress', {
      status: 'progress',
      index: processedCount,
      total: totalPhotos
    });
  };

  const executeQueue = async () => {
    const workers = [];
    const worker = async () => {
      while (currentIndex < totalPhotos && !isUploadCancelled) {
        const index = currentIndex++;
        const fileItem = resolvedFiles[index];
        if (fileItem.isAlreadyUploaded) {
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
          continue;
        }
        await processPhoto(index);
      }
    };

    for (let w = 0; w < CONCURRENCY; w++) {
      workers.push(worker());
    }

    await Promise.all(workers);
  };

  await executeQueue();
  killDaemon();
  process.off('exit', killDaemon);

  // 6. Submit bulk metadata payload to backend
  if (results.length > 0) {
    mainWindow.webContents.send('upload-progress', { status: 'submitting' });
    try {
      await axios.post(`${backendUrl}/api/gallery/events/${eventId}/photos/bulk`, {
        photos: results,
        isFaceScannerOffline: !isDaemonReady
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (bulkErr) {
      console.error('Bulk index submission failed:', bulkErr.message);
      throw new Error(`Bulk index failed: ${bulkErr.message}`);
    }
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
      activeBlockerId = null;
    }
  }
});

// IPC Handler: Upload cover photo (horizontal/vertical)
ipcMain.handle('upload-cover-photo', async (event, config) => {
  const { filePath, type, eventId, backendUrl, token } = config;
  if (!filePath || !type || !eventId || !backendUrl || !token) {
    throw new Error('Missing config parameters for cover upload');
  }

  // Set resolution: cover photos don't need to be huge
  let targetWidth = 1920;
  let targetHeight = 1080;
  if (type === 'vertical') {
    targetWidth = 1080;
    targetHeight = 1920;
  }

  const tempDir = path.join(app.getPath('temp'), 'misty_uploader_covers');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const filename = path.basename(filePath);
  const compressedPath = path.join(tempDir, `cover_${Date.now()}_${filename}`);

  try {
    // Compress and auto-rotate
    await sharp(filePath)
      .rotate()
      .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(compressedPath);

    const fileBuffer = fs.readFileSync(compressedPath);
    const uploadRes = await axios.post(`${backendUrl}/api/gallery/events/${eventId}/covers`, {
      type,
      filename,
      fileContent: fileBuffer.toString('base64')
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    // Cleanup temp file
    if (fs.existsSync(compressedPath)) {
      fs.unlinkSync(compressedPath);
    }

    return uploadRes.data;
  } catch (err) {
    console.error('Failed to upload cover photo:', err.message);
    if (fs.existsSync(compressedPath)) {
      fs.unlinkSync(compressedPath);
    }
    throw new Error(`Failed to upload cover photo: ${err.message}`);
  }
});

let isBackfillRunning = false;

ipcMain.handle('start-backfill', async (event, config) => {
  const { eventId, eventSlug, backendUrl, token } = config;
  if (!eventId || !backendUrl || !token) {
    return { success: false, error: 'Missing parameters' };
  }

  // If already running, skip!
  if (isBackfillRunning) {
    return { success: false, reason: 'Already running' };
  }

  isBackfillRunning = true;
  mainWindow.webContents.send('backfill-status', { eventId, status: 'starting' });

  let daemon = null;
  try {
    // 1. Fetch unscanned photos from server
    const res = await axios.get(`${backendUrl}/api/gallery/events/${eventId}/photos/unscanned`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const unscannedPhotos = res.data.photos || [];
    console.log(`[Backfill] Found ${unscannedPhotos.length} unscanned photos for event ${eventId}`);

    if (unscannedPhotos.length === 0) {
      isBackfillRunning = false;
      mainWindow.webContents.send('backfill-status', { eventId, status: 'idle' });
      return { success: true, count: 0 };
    }

    // Now that we have photos to process, initialize the Python daemon
    daemon = await initFaceRecDaemon();
    const isDaemonReady = daemon.isDaemonReady;
    const getFacesFromDaemon = daemon.getFacesFromDaemon;
    const killDaemon = daemon.killDaemon;

    mainWindow.webContents.send('backfill-status', { eventId, status: 'processing', total: unscannedPhotos.length });

    // Create temp directory if missing
    const tempDir = path.join(app.getPath('temp'), 'misty_uploader_backfills');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 2. Loop through and process them
    for (let i = 0; i < unscannedPhotos.length; i++) {
      const photo = unscannedPhotos[i];
      console.log(`[Backfill] [${i+1}/${unscannedPhotos.length}] Processing photoId ${photo.id}: ${photo.filename}`);

      const tempFilePath = path.join(tempDir, `temp_backfill_${photo.id}_${photo.filename}`);

      try {
        // Download photo from R2
        await downloadFileHelper(photo.r2Url, tempFilePath);
        // Run face scanner
        let faces = await getFacesFromDaemon(tempFilePath).catch(() => []);
        faces = faces.map(f => {
          if (f.faceId && f.faceId.includes('temp_backfill_')) {
            const prefix = `temp_backfill_${photo.id}_`;
            f.faceId = f.faceId.replace(prefix, '');
          }
          return f;
        });
        if (faces && faces.length > 0) {
          const facesToUpload = [];

          // Crop and upload each face crop
          for (const face of faces) {
            if (face.box) {
              const [fx, fy, ffw, ffh] = face.box;
              const faceBuffer = await sharp(tempFilePath)
                .extract({ left: fx, top: fy, width: ffw, height: ffh })
                .toBuffer();

              // Upload face crop to R2
              await axios.post(`${backendUrl}/api/gallery/upload-photo-file`, {
                filename: `${face.faceId}.jpg`,
                fileContent: faceBuffer.toString('base64'),
                eventId,
                eventSlug,
                isFaceCrop: true
              }, {
                headers: { 'Authorization': `Bearer ${token}` }
              });

              facesToUpload.push({
                faceId: face.faceId,
                vector: face.vector
              });
            }
          }

          // Upload vectors to backend
          if (facesToUpload.length > 0) {
            await axios.post(`${backendUrl}/api/gallery/events/${eventId}/photos/${photo.id}/vectors`, {
              faces: facesToUpload
            }, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              }
            });
          }
        } else {
          // If no faces found, still call backend to mark it as scanned (no-op vector upload)
          await axios.post(`${backendUrl}/api/gallery/events/${eventId}/photos/${photo.id}/vectors`, {
            faces: []
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
        }
      } catch (err) {
        console.error(`[Backfill] Failed for photoId ${photo.id}:`, err.message);
      } finally {
        // Clean up temp file
        if (fs.existsSync(tempFilePath)) {
          try { fs.unlinkSync(tempFilePath); } catch (e) {}
        }
      }

      mainWindow.webContents.send('backfill-status', { eventId, status: 'progress', index: i + 1, total: unscannedPhotos.length });

      // Throttle (wait 2 seconds between photos to keep CPU cool)
      await new Promise(r => setTimeout(r, 2000));
    }

    if (daemon && daemon.killDaemon) {
      daemon.killDaemon();
      process.off('exit', daemon.killDaemon);
    }

    // 3. Finalize upload batch to trigger database cache refresh automatically
    try {
      await axios.post(`${backendUrl}/api/gallery/events/${eventId}/finalize-upload`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (finalizeErr) {
      console.error('[Backfill] Failed to finalize upload:', finalizeErr.message);
    }

    isBackfillRunning = false;
    mainWindow.webContents.send('backfill-status', { eventId, status: 'idle' });
    
    // Trigger another check in case there are more
    setTimeout(() => {
      mainWindow.webContents.send('trigger-backfill-check');
    }, 1000);

    return { success: true, count: unscannedPhotos.length };

  } catch (err) {
    if (daemon && daemon.killDaemon) {
      daemon.killDaemon();
      process.off('exit', daemon.killDaemon);
    }
    isBackfillRunning = false;
    mainWindow.webContents.send('backfill-status', { status: 'error', error: err.message });
    console.error('[Backfill] Error in backfill loop:', err.message);
    return { success: false, error: err.message };
  }
});
