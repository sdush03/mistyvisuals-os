const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const sharp = require('sharp');
const exifr = require('exifr');
const axios = require('axios');

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
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

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
            rootFolder: path.basename(path.dirname(p))
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
ipcMain.handle('process-photos', async (event, config) => {
  isUploadCancelled = false;
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

  // Temp folder for resizing
  const tempDir = path.join(app.getPath('temp'), 'misty_uploader_compressed');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Script path to python face rec
  let pythonScriptPath = path.join(__dirname, '..', 'backend', 'utils', 'face_rec.py');
  if (!fs.existsSync(pythonScriptPath)) {
    pythonScriptPath = path.join(process.resourcesPath, 'face_rec.py');
  }

  const results = [];
  let processedCount = 0;

  for (let i = 0; i < totalPhotos; i++) {
    if (isUploadCancelled) {
      break;
    }
    const fileItem = resolvedFiles[i];
    const filename = fileItem.name;

    if (fileItem.isAlreadyUploaded) {
      mainWindow.webContents.send('upload-progress', {
        status: 'row-skipped',
        filename,
        index: i,
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

    const originalPath = fileItem.path;
    const tabName = fileItem.tabName;
    const compressedPath = path.join(tempDir, `comp_${Date.now()}_${filename}`);
    
    // Notify Renderer: Current processing step starting
    mainWindow.webContents.send('upload-progress', {
      status: 'row-processing',
      filename,
      index: i,
      total: totalPhotos
    });

      try {
        // 1. Read EXIF Metadata locally
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

        // 2. Compress Photo to target resolution using sharp
        let pipeline = sharp(originalPath)
          .rotate();

        if (targetWidth && targetHeight) {
          pipeline = pipeline
            .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
            .sharpen(); // Restore details lost from downscaling
        }

        // Apply watermark locally if checked and watermark file exists
        if (applyWatermark && fs.existsSync(watermarkPath)) {
          try {
            // Get dimensions of resized image to position overlay correctly
            const resizedBuffer = await pipeline.toBuffer();
            const resizedMetadata = await sharp(resizedBuffer).metadata();
            const imgWidth = resizedMetadata.width;
            const imgHeight = resizedMetadata.height;

            // Make the watermark size proportional to the resized image (15% of the shortest side)
            const shortestSide = Math.min(imgWidth, imgHeight);
            const watermarkWidth = Math.round(shortestSide * 0.15);

            // Load watermark file as a buffer (safely read from ASAR by Node fs)
            const watermarkBuffer = fs.readFileSync(watermarkPath);

            // Resize the watermark buffer
            const resizedWatermarkBuffer = await sharp(watermarkBuffer)
              .resize(watermarkWidth)
              .toBuffer();

            // Calculate bottom-left coordinates with dynamic padding (3% of shortest side, min 12px)
            const padding = Math.max(12, Math.round(shortestSide * 0.03));
            const watermarkMetadata = await sharp(resizedWatermarkBuffer).metadata();
            const x = padding;
            const y = imgHeight - watermarkMetadata.height - padding;

            // Overlay watermark on the resized image
            pipeline = sharp(resizedBuffer)
              .composite([{
                input: resizedWatermarkBuffer,
                left: x,
                top: y
              }]);
          } catch (wmErr) {
            console.error(`Failed to overlay watermark on ${filename}:`, wmErr.message);
            // Fall back to resized original if watermarking fails
            pipeline = sharp(originalPath)
              .rotate();
            if (targetWidth && targetHeight) {
              pipeline = pipeline
                .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
                .sharpen();
            }
          }
        }

        // Pass 1: Output clean compressed JPEG buffer without any metadata
        const cleanBuffer = await pipeline
          .jpeg({
            quality: jpegQuality,
            progressive: true,
            mozjpeg: true
          })
          .toBuffer();

        // Pass 2: Attach basic normal orientation + clean sRGB profile metadata, then save to file
        await sharp(cleanBuffer)
          .withMetadata({
            orientation: 1,
            exif: {
              IFD0: {
                Copyright: 'https://www.mistyvisuals.com/'
              }
            }
          })
          .toFile(compressedPath);

        const stats = fs.statSync(compressedPath);

        // 3. Run Face Extraction locally (Subprocess calls python)
        let faces = [];
        if (fs.existsSync(pythonScriptPath)) {
          try {
            const pyCmd = `python3 "${pythonScriptPath}" extract "${compressedPath}"`;
            const stdout = execSync(pyCmd).toString();
            const parsed = JSON.parse(stdout);
            if (parsed.faces) {
              faces = parsed.faces;
            }
          } catch (pyErr) {
            console.warn(`Local Python face extraction failed for ${filename}:`, pyErr.message);
          }
        }

        // 4. Upload photo files to server
        mainWindow.webContents.send('upload-progress', {
          status: 'row-uploading',
          filename,
          index: i,
          total: totalPhotos
        });

        const fileBuffer = fs.readFileSync(compressedPath);
        const uploadRes = await axios.post(`${backendUrl}/api/gallery/upload-photo-file`, {
          filename,
          fileContent: fileBuffer.toString('base64')
        }, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const r2Url = uploadRes.data.r2Url;

        // 5. Crop face thumbnails if faces found
        const facesToUpload = [];
        for (const face of faces) {
          if (face.box) {
            const [x, y, fw, fh] = face.box;
            const faceTempPath = path.join(tempDir, `face_${face.faceId}.jpg`);
            try {
              await sharp(compressedPath)
                .extract({ left: x, top: y, width: fw, height: fh })
                .toFile(faceTempPath);

              const faceBuffer = fs.readFileSync(faceTempPath);
              await axios.post(`${backendUrl}/api/gallery/upload-photo-file`, {
                filename: `${face.faceId}.jpg`,
                fileContent: faceBuffer.toString('base64')
              }, {
                headers: { 'Authorization': `Bearer ${token}` }
              });

              fs.unlinkSync(faceTempPath);
              facesToUpload.push({
                faceId: face.faceId,
                vector: face.vector
              });
            } catch (cropErr) {
              console.error(`Failed to crop face ${face.faceId}:`, cropErr.message);
            }
          }
        }

        // Append result payload
        results.push({
          filename,
          r2Url,
          fileSize: stats.size,
          originalSize: fileItem.sizeBytes,
          tabName: tabName, // Auto-categorized sub-event name
          exif: exifData,
          capturedAt: capturedAt,
          faces: facesToUpload
        });

        // Cleanup local temp file
        fs.unlinkSync(compressedPath);

        // Notify Renderer: Success for this row
        mainWindow.webContents.send('upload-progress', {
          status: 'row-success',
          filename,
          index: i,
          total: totalPhotos
        });
      } catch (err) {
        console.error(`Failed to process photo ${filename}:`, err);
        mainWindow.webContents.send('upload-progress', {
          status: 'row-error',
          filename,
          index: i,
          total: totalPhotos,
          error: err.message
        });
      }

      processedCount++;
      // Notify Renderer: Overall progress progress
      mainWindow.webContents.send('upload-progress', {
        status: 'progress',
        index: processedCount,
        total: totalPhotos
      });
    }

  // 6. Submit bulk metadata payload to backend
  if (results.length > 0) {
    mainWindow.webContents.send('upload-progress', { status: 'submitting' });
    try {
      await axios.post(`${backendUrl}/api/gallery/events/${eventId}/photos/bulk`, {
        photos: results
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

  // Cleanup temp folder
  if (fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (rmErr) {
      console.warn('Failed to clean up temp dir:', rmErr.message);
    }
  }

  if (isUploadCancelled) {
    return { status: 'cancelled', count: results.length };
  }

  return { status: 'success', count: results.length };
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
