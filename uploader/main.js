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

// Global error catchers to prevent silent app crashes on startup or async tasks
process.on('uncaughtException', (err) => {
  console.error('[Main Process Uncaught Exception]:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Main Process Unhandled Rejection]:', reason);
});

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

// Handle macOS open-url event for deep linking
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url && url.startsWith('mistyuploader://')) {
    const slug = url.replace('mistyuploader://event/', '').replace(/\/$/, '');
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('deep-link', slug);
    } else {
      pendingDeepLinkSlug = slug;
    }
  }
});

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
  // Enforce single instance lock after app is ready
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    console.warn('[SingleInstance] Another instance is already running. Quitting duplicate instance.');
    app.quit();
    return;
  }

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
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

// IPC Handler: Get Hardware Specs (CPU cores count and RAM memory specs)
ipcMain.handle('get-hardware-specs', async () => {
  const os = require('os');
  return {
    cores: os.cpus().length,
    totalMemoryGb: Math.round(os.totalmem() / (1024 * 1024 * 1024))
  };
});

// Helper: Run commands asynchronously
function runCommandAsync(command) {
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

// Helper: Download file using Axios to support redirects (302) and track real-time progress
async function downloadFileWithProgress(url, destPath, onProgress) {
  const axios = require('axios');
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'stream'
  });

  const totalSize = parseInt(response.headers['content-length'], 10) || 0;
  let downloaded = 0;
  const fileStream = fs.createWriteStream(destPath);

  response.data.on('data', (chunk) => {
    downloaded += chunk.length;
    onProgress(downloaded, totalSize);
  });

  response.data.pipe(fileStream);

  return new Promise((resolve, reject) => {
    fileStream.on('finish', () => {
      fileStream.close(resolve);
    });
    fileStream.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
    response.data.on('error', (err) => {
      fileStream.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// IPC Handler: Check, create python environment, and download models on demand
ipcMain.handle('trigger-setup', async (event) => {
  const userEnvPath = path.join(app.getPath('userData'), 'face_rec_env');
  const pythonBin = process.platform === 'win32'
    ? path.join(userEnvPath, 'Scripts', 'python.exe')
    : path.join(userEnvPath, 'bin', 'python3');
  
  const modelsDir = path.join(app.getPath('userData'), 'models');
  const yunetPath = path.join(modelsDir, 'face_detection_yunet_2023mar.onnx');
  const sfacePath = path.join(modelsDir, 'face_recognition_sface_2021dec.onnx');
  const arcfacePath = path.join(modelsDir, 'w600k_r50.onnx');

  const checkFilesExist = () => {
    return fs.existsSync(pythonBin) &&
           fs.existsSync(yunetPath) &&
           fs.existsSync(sfacePath) &&
           fs.existsSync(arcfacePath);
  };

  if (checkFilesExist()) {
    return { status: 'ready' };
  }

  const sendProgress = (statusText, percent, fileCount = '', fileProgress = '') => {
    event.sender.send('setup-progress', { status: statusText, progress: percent, fileCount, fileProgress });
  };

  try {
    // 1. Create Virtualenv (if missing)
    if (!fs.existsSync(pythonBin)) {
      sendProgress('Creating local Python isolation environment...', 10, '0/3 models', '0.0 MB');
      console.log('[Setup] Creating virtual environment at:', userEnvPath);
      await runCommandAsync(`python3 -m venv "${userEnvPath}"`);
    }

    // 2. Install Dependencies (OpenCV & Numpy)
    sendProgress('Installing face scanning packages (OpenCV / Numpy)...', 25, '0/3 models', '0.0 MB');
    const pipBin = process.platform === 'win32'
      ? path.join(userEnvPath, 'Scripts', 'pip.exe')
      : path.join(userEnvPath, 'bin', 'pip');
    console.log('[Setup] Installing packages inside virtual environment...');
    await runCommandAsync(`"${pipBin}" install opencv-python numpy`);

    // 3. Ensure Models Directory exists
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }

    // 4. Download Models with live download updates
    const yunetUrl = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx";
    const sfaceUrl = "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx";
    const arcfaceUrl = "https://huggingface.co/maze/faceX/resolve/main/w600k_r50.onnx";

    const formatSize = (bytes) => {
      return (bytes / (1024 * 1024)).toFixed(1);
    };

    if (!fs.existsSync(yunetPath)) {
      await downloadFileWithProgress(yunetUrl, yunetPath, (dl, total) => {
        const pct = total ? Math.round((dl / total) * 100) : 0;
        const progressStr = `${formatSize(dl)} MB / ${formatSize(total)} MB`;
        sendProgress('Downloading Face Detector model...', 30 + Math.round(pct * 0.15), '1/3 models', progressStr);
      });
    }

    if (!fs.existsSync(sfacePath)) {
      await downloadFileWithProgress(sfaceUrl, sfacePath, (dl, total) => {
        const pct = total ? Math.round((dl / total) * 100) : 0;
        const progressStr = `${formatSize(dl)} MB / ${formatSize(total)} MB`;
        sendProgress('Downloading Landmarks Alignment helper...', 45 + Math.round(pct * 0.25), '2/3 models', progressStr);
      });
    }

    if (!fs.existsSync(arcfacePath)) {
      await downloadFileWithProgress(arcfaceUrl, arcfacePath, (dl, total) => {
        const pct = total ? Math.round((dl / total) * 100) : 0;
        const progressStr = `${formatSize(dl)} MB / ${formatSize(total)} MB`;
        sendProgress('Downloading AI Embeddings engine (ArcFace)...', 70 + Math.round(pct * 0.28), '3/3 models', progressStr);
      });
    }

    sendProgress('Finalizing face recognition engine...', 99, '3/3 models', 'Completed');
    console.log('[Setup] Environment installation successful!');
    return { status: 'success' };
  } catch (err) {
    console.error('[Setup] Local installation failed:', err.message);
    return { status: 'error', error: err.message };
  }
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
  let startError = '';

  const userEnvPath = path.join(app.getPath('userData'), 'face_rec_env');
  const pythonBin = process.platform === 'win32'
    ? path.join(userEnvPath, 'Scripts', 'python.exe')
    : path.join(userEnvPath, 'bin', 'python3');

  try {
    pythonDaemon = spawn(pythonBin, [pythonScriptPath, 'daemon']);
    pythonDaemon.on('error', (err) => {
      console.warn('[FaceRec] Python daemon spawn error:', err.message);
      startError += `Spawn error: ${err.message}\n`;
      isDaemonReady = false;
    });
    if (pythonDaemon.stderr) {
      pythonDaemon.stderr.on('data', (data) => {
        const str = data.toString();
        console.warn('[FaceRec Daemon Startup stderr]:', str);
        startError += str;
      });
    }
  } catch (err) {
    console.warn('[FaceRec] Python daemon spawn caught exception:', err.message);
    startError += `Spawn exception: ${err.message}\n`;
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
          console.warn('[FaceRec] Python daemon ready check timed out after 30s. Skipping local face recognition.');
          if (pythonDaemon) {
            pythonDaemon.stdout.off('data', onDaemonReady);
            killDaemon();
          }
          resolve();
        }
      }, 30000);

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
  const isBusy = () => isDaemonProcessing;

  return { isDaemonReady, getFacesFromDaemon, killDaemon, isBusy, getStartError: () => startError };
}

// Spawns `count` Python daemon instances and load-balances jobs across them
async function initDaemonPool(count = 2) {
  const instances = [];
  for (let i = 0; i < count; i++) {
    const inst = await initFaceRecDaemon();
    instances.push({ inst, pending: 0 });
  }

  const readyInstances = instances.filter(d => d.inst.isDaemonReady);
  if (readyInstances.length === 0) {
    console.warn('[DaemonPool] No daemon instances started successfully.');
  } else {
    console.log(`[DaemonPool] ${readyInstances.length}/${count} daemon(s) ready.`);
  }

  // Route each job to the daemon with the fewest pending jobs (min-queue)
  const getFacesFromPool = (imagePath) => {
    const target = instances.reduce((min, d) => d.pending < min.pending ? d : min, instances[0]);
    target.pending++;
    return target.inst.getFacesFromDaemon(imagePath).finally(() => {
      target.pending = Math.max(0, target.pending - 1);
    });
  };

  const killAllDaemons = () => {
    for (const { inst } of instances) {
      if (inst.killDaemon) inst.killDaemon();
    }
  };

  const getActiveCount = () => {
    return readyInstances.filter(d => d.inst.isBusy()).length;
  };

  const getErrors = () => {
    return instances.map((d, i) => `Daemon #${i + 1}:\n${d.inst.getStartError() || 'Unknown error'}`).join('\n\n');
  };

  return { readyInstances, getFacesFromPool, killAllDaemons, getActiveCount, getErrors };
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
    const { resolvedFiles = [], eventId, eventSlug, backendUrl, token, uploadQuality = '4k', applyWatermark = true, concurrency = 6, daemons = 2 } = config;
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

  // Initialize daemon pool using helper (dynamically sized)
  const daemon = await initDaemonPool(daemons);
  const getFacesFromDaemon = daemon.getFacesFromPool;
  const killDaemon = daemon.killAllDaemons;
  const isDaemonReady = daemon.readyInstances.length > 0;

  if (!isDaemonReady) {
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
  let processedCount = 0;
  let currentIndex = 0;
  const CONCURRENCY = concurrency; // Bounded concurrency dynamically set from UI

  let activeUploads = 0;
  const sendPerfStats = () => {
    mainWindow.webContents.send('upload-progress', {
      status: 'perf-stats',
      activeUploads,
      activeScans: daemon.getActiveCount()
    });
  };

  const processPhoto = async (index) => {
    activeUploads++;
    sendPerfStats();

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

    if (isUploadCancelled) {
      activeUploads--;
      sendPerfStats();
      return;
    }

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
      activeScans++;
      sendPerfStats();
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
      }).finally(() => {
        activeScans--;
        sendPerfStats();
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

      if (isUploadCancelled) {
        activeUploads--;
        sendPerfStats();
        return;
      }

      // 4. Await face extraction coordinates
      const faces = await facePromise;

      if (isUploadCancelled) {
        activeUploads--;
        sendPerfStats();
        return;
      }

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
    } finally {
      activeUploads--;
      sendPerfStats();
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
  if (killDaemon) killDaemon();

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
  const { eventId, eventSlug, backendUrl, token, concurrency = 6, daemons = 3 } = config;
  if (!eventId || !backendUrl || !token) {
    return { success: false, error: 'Missing parameters' };
  }

  // If already running, skip!
  if (isBackfillRunning) {
    return { success: false, reason: 'Already running' };
  }

  isBackfillRunning = true;
  mainWindow.webContents.send('backfill-status', { eventId, status: 'starting' });

  let activeBackfillDownloads = 0;
  const sendBackfillPerfStats = () => {
    mainWindow.webContents.send('backfill-status', {
      eventId,
      status: 'perf-stats',
      activeDownloads: activeBackfillDownloads,
      activeScans: daemon ? daemon.getActiveCount() : 0
    });
  };

  let daemon = null;
  let totalInitial = null;
  let scannedSoFar = 0;

  try {
    const tempDir = path.join(app.getPath('temp'), 'misty_uploader_backfills');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    while (true) {
      // 1. Fetch unscanned photos batch from server
      const res = await axios.get(`${backendUrl}/api/gallery/events/${eventId}/photos/unscanned`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const unscannedPhotos = res.data.photos || [];
      const totalUnscanned = res.data.totalUnscanned !== undefined ? res.data.totalUnscanned : unscannedPhotos.length;

      if (totalInitial === null) {
        totalInitial = totalUnscanned;
      }

      console.log(`[Backfill] Batch retrieved ${unscannedPhotos.length} photos (total unscanned remaining: ${totalUnscanned}) for event ${eventId}`);

      if (unscannedPhotos.length === 0) {
        break;
      }

      // Initialize Python daemon pool once per backfill session (dynamically sized)
      if (!daemon) {
        daemon = await initDaemonPool(daemons);
        mainWindow.webContents.send('backfill-status', { eventId, status: 'processing', total: totalInitial, index: scannedSoFar });
      }

      const getFacesFromPool = daemon.getFacesFromPool;

      // 2. Process current batch concurrently with a bounded worker queue
      const BACKFILL_CONCURRENCY = concurrency;
      let batchIndex = 0;
      let completedInBatch = 0;

      const processBackfillPhoto = async (photo, overallIndex) => {
        const tempFilePath = path.join(tempDir, `temp_backfill_${photo.id}_${photo.filename}`);
        console.log(`[Backfill] [${overallIndex}/${totalInitial}] Processing photoId ${photo.id}: ${photo.filename}`);

        try {
          // Download photo from R2
          activeBackfillDownloads++;
          sendBackfillPerfStats();
          await downloadFileHelper(photo.r2Url, tempFilePath);
          activeBackfillDownloads--;
          sendBackfillPerfStats();

          // Run face scanner (routed to least-busy daemon in the pool)
          activeBackfillScans++;
          sendBackfillPerfStats();
          let faces = await getFacesFromPool(tempFilePath).catch(() => []);
          activeBackfillScans--;
          sendBackfillPerfStats();
          faces = faces.map(f => {
            if (f.faceId && f.faceId.includes('temp_backfill_')) {
              const prefix = `temp_backfill_${photo.id}_`;
              f.faceId = f.faceId.replace(prefix, '');
            }
            return f;
          });
          if (faces && faces.length > 0) {
            const facesToUpload = [];

            // Get pre-signed PUT URLs for all face crops in one request
            const faceIdsToUpload = faces.filter(f => f.box).map(f => f.faceId);
            let faceUrlMap = {};
            if (faceIdsToUpload.length > 0) {
              const urlRes = await axios.post(`${backendUrl}/api/gallery/events/${eventId}/generate-face-upload-urls`, {
                faceIds: faceIdsToUpload,
                eventSlug
              }, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
              });
              for (const f of urlRes.data.faces) {
                faceUrlMap[f.faceId] = f.putUrl;
              }
            }

            // Crop all faces and PUT directly to R2 in parallel (no base64, no backend middleman)
            const cropAndUploadPromises = faces
              .filter(face => face.box && faceUrlMap[face.faceId])
              .map(async face => {
                const [fx, fy, ffw, ffh] = face.box;
                const faceBuffer = await sharp(tempFilePath)
                  .extract({ left: fx, top: fy, width: ffw, height: ffh })
                  .toBuffer();

                await axios.put(faceUrlMap[face.faceId], faceBuffer, {
                  headers: {
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'public, max-age=31536000, immutable'
                  }
                });

                facesToUpload.push({ faceId: face.faceId, vector: face.vector });
              });
            await Promise.all(cropAndUploadPromises);

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
            // If no faces found, still mark as scanned (no-op vector upload)
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
      };

      const backfillWorker = async () => {
        while (batchIndex < unscannedPhotos.length) {
          const i = batchIndex++;
          const photo = unscannedPhotos[i];
          const overallIndex = scannedSoFar + i + 1;
          await processBackfillPhoto(photo, overallIndex);
          completedInBatch++;
          mainWindow.webContents.send('backfill-status', {
            eventId,
            status: 'progress',
            index: scannedSoFar + completedInBatch,
            total: Math.max(totalInitial, scannedSoFar + completedInBatch)
          });
        }
      };

      const backfillWorkers = [];
      for (let w = 0; w < BACKFILL_CONCURRENCY; w++) {
        backfillWorkers.push(backfillWorker());
      }
      await Promise.all(backfillWorkers);

      scannedSoFar += unscannedPhotos.length;
    }

    if (daemon && daemon.killAllDaemons) {
      daemon.killAllDaemons();
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

    // Only trigger another check if we actually processed photos this session
    // (avoids infinite loop when event was already fully scanned)
    if (scannedSoFar > 0) {
      setTimeout(() => {
        mainWindow.webContents.send('trigger-backfill-check');
      }, 1000);
    }

    return { success: true, count: scannedSoFar };

  } catch (err) {
    if (daemon && daemon.killAllDaemons) {
      daemon.killAllDaemons();
    }
    isBackfillRunning = false;
    mainWindow.webContents.send('backfill-status', { status: 'error', error: err.message });
    console.error('[Backfill] Error in backfill loop:', err.message);
    return { success: false, error: err.message };
  }
});
