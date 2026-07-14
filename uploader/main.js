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

// IPC Handler: Get Hardware Specs
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
      const ext = path.extname(itemPath).toLowerCase();
      if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
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
        const ext = path.extname(p).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
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
ipcMain.handle('scan-folder-photos', async (event, paths) => {
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
          const ext = path.extname(item).toLowerCase();
          if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
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
        const ext = path.extname(p).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
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
