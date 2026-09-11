const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const { initDaemonPool, getPreflightDaemonPool, setPreflightDaemonPool } = require('./main/daemon_pool');
const { setupPreflightHandlers } = require('./main/preflight');
const { setupUploadHandlers } = require('./main/upload_engine');
const { setupBackfillHandlers } = require('./main/backfill_engine');

process.on('uncaughtException', (err) => {
  console.error('[Main Process Uncaught Exception]:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Main Process Unhandled Rejection]:', reason);
});

process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') {}
});
process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') {}
});

let mainWindow;
let pendingDeepLinkSlug = null;

function getMainWindow() {
  return mainWindow;
}

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
    } catch (e) {}
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingDeepLinkSlug) {
      mainWindow.webContents.send('deep-link', pendingDeepLinkSlug);
      pendingDeepLinkSlug = null;
    }
  });
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('mistyuploader', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('mistyuploader');
}

app.whenReady().then(() => {
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

// IPC Handler: Video File or Directory Selection (for Cinema tab)
ipcMain.handle('select-video-or-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Video File or Folder',
    properties: ['openFile', 'openDirectory'],
    filters: [
      { name: 'Video & Image Files', extensions: ['mp4', 'mov', 'm4v', 'jpg', 'jpeg', 'png'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// IPC Handler: Single Video Cover Selection (for Cinema tab)
ipcMain.handle('select-video-cover', async (event, videoName) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: videoName ? `Select Cover Photo for ${videoName}` : 'Select Video Cover Photo',
    properties: ['openFile'],
    filters: [
      { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// IPC Handler: Select Video File to attach to film
ipcMain.handle('select-video-file', async (event, title) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: title ? `Select Video File for "${title}"` : 'Select Video File',
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'm4v'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// IPC Handler: Inspect Cover Image (dimensions, orientation, base64 preview thumbnail)
ipcMain.handle('inspect-cover-image', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const sharp = require('sharp');
    const meta = await sharp(filePath).metadata();
    let width = meta.width || 1920;
    let height = meta.height || 1080;
    if (meta.orientation && meta.orientation >= 5) {
      width = meta.height;
      height = meta.width;
    }
    const isVertical = height > width;
    // Small UI thumbnail (crisp 180x240 for queue cards)
    const thumbBuffer = await sharp(filePath)
      .rotate()
      .resize(isVertical ? 180 : 240, isVertical ? 240 : 180, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();

    // High-Resolution data for Poster Studio canvas & baking (up to 2560px, quality 95)
    const highResBuffer = await sharp(filePath)
      .rotate()
      .resize(2560, 2560, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();

    return {
      width,
      height,
      isVertical,
      previewDataUrl: `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`,
      highResDataUrl: `data:image/jpeg;base64,${highResBuffer.toString('base64')}`,
      filePath
    };
  } catch (err) {
    console.error('Error inspecting cover image:', err.message);
    return null;
  }
});

// Helper for allowed media file extensions
const isMediaFile = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.mp4' || ext === '.mov' || ext === '.m4v';
};

// IPC Handler: Get Hardware Specs

// IPC Handler: Save Baked Cover (Base64) to a local temp file
ipcMain.handle("save-temp-baked-cover", async (event, { base64Data, filename }) => {
  try {
    const os = require("os");
    const tempDir = path.join(os.tmpdir(), "misty_baked_covers");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const safeName = `baked_${Date.now()}_${filename || "poster.jpg"}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const filePath = path.join(tempDir, safeName);
    
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error("Failed to save temp baked cover:", err);
    throw err;
  }
});

ipcMain.handle('get-hardware-specs', async () => {
  const os = require('os');
  return {
    cores: os.cpus().length,
    totalMemoryGb: Math.round(os.totalmem() / (1024 * 1024 * 1024))
  };
});

// IPC Handler: Get Folder Stats
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
      if (isMediaFile(itemPath)) {
        count++;
        sizeBytes += stats.size;
      }
    }
  };

  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    try {
      const stats = fs.statSync(p);
      if (stats.isDirectory()) {
        const scanDir = (dirPath) => {
          const items = fs.readdirSync(dirPath);
          for (const item of items) {
            processPath(path.join(dirPath, item));
          }
        };
        scanDir(p);
      } else {
        if (isMediaFile(p)) {
          count++;
          sizeBytes += stats.size;
        }
      }
    } catch (e) {
      console.error(`Error statting path ${p}:`, e.message);
    }
  }

  return { count, sizeBytes };
});

// IPC Handler: Scan Disk Photos Recursively
ipcMain.handle('get-folder-files', async (event, config) => {
  const { paths } = config || {};
  if (!paths || !Array.isArray(paths)) return [];
  const fileList = [];

  const scanDir = (dirPath, topLevelFolder, currentSubDir) => {
    try {
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          const nextSubDir = currentSubDir ? `${currentSubDir} / ${item}` : item;
          scanDir(fullPath, topLevelFolder, nextSubDir);
        } else {
          if (isMediaFile(item)) {
            fileList.push({
              path: fullPath,
              name: item,
              sizeBytes: stats.size,
              parentDir: path.basename(dirPath),
              topSubDir: currentSubDir,
              rootFolder: path.basename(topLevelFolder)
            });
          }
        }
      }
    } catch (err) {
      console.error(`Failed to read dir ${dirPath}:`, err.message);
    }
  };

  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    try {
      const stats = fs.statSync(p);
      if (stats.isDirectory()) {
        scanDir(p, p, null);
      } else {
        if (isMediaFile(p)) {
          fileList.push({
            path: p,
            name: path.basename(p),
            sizeBytes: stats.size,
            parentDir: path.basename(path.dirname(p)),
            topSubDir: null,
            rootFolder: null
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

// Setup sub-module handlers
setupPreflightHandlers({
  ipcMain,
  app,
  initDaemonPool: (daemons) => initDaemonPool(app, daemons),
  getPreflightDaemonPool,
  setPreflightDaemonPool
});

setupUploadHandlers({
  ipcMain,
  app,
  getMainWindow,
  initDaemonPool: (appRef, daemons) => initDaemonPool(appRef, daemons),
  getPreflightDaemonPool,
  setPreflightDaemonPool
});

setupBackfillHandlers({
  ipcMain,
  app,
  getMainWindow,
  initDaemonPool: (appRef, daemons) => initDaemonPool(appRef, daemons)
});
