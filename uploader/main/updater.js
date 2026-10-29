const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

function setupAutoUpdater(getMainWindow) {
  // Configure logging
  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    const win = getMainWindow();
    if (win && win.webContents) {
      win.webContents.send('update-available', {
        version: info.version
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] App is up to date.');
  });

  autoUpdater.on('error', (err) => {
    console.warn('[AutoUpdater] Error while checking/downloading update:', err.message);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const win = getMainWindow();
    if (win && win.webContents) {
      win.webContents.send('update-download-progress', {
        percent: Math.round(progressObj.percent || 0),
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded and ready to install:', info.version);
    const win = getMainWindow();
    if (win && win.webContents) {
      win.webContents.send('update-ready', {
        version: info.version
      });
    }
  });

  // Handle IPC request from renderer when user clicks "Restart to Upgrade"
  ipcMain.handle('restart-and-upgrade', () => {
    console.log('[AutoUpdater] Quit and install triggered by user.');
    // isSilent = false, isForceRunAfter = true
    autoUpdater.quitAndInstall(false, true);
  });

  // Manual check trigger
  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) {
      return { status: 'dev-mode', message: 'Updates disabled in unpackaged development mode' };
    }
    try {
      const res = await autoUpdater.checkForUpdates();
      return { status: 'success', updateInfo: res?.updateInfo };
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  });

  // Dev helper: trigger simulated update-ready for testing UI
  ipcMain.handle('dev-simulate-update', (event, version = '1.3.6') => {
    const win = getMainWindow();
    if (win && win.webContents) {
      win.webContents.send('update-ready', { version });
    }
    return true;
  });

  // Start checking if packaged
  if (app.isPackaged) {
    // Initial check after 5 seconds to let main window mount
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.warn('[AutoUpdater] Initial check error:', err.message);
      });
    }, 5000);

    // Recheck every 2 hours
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.warn('[AutoUpdater] Periodic check error:', err.message);
      });
    }, 2 * 60 * 60 * 1000);
  } else {
    console.log('[AutoUpdater] Dev mode detected: autoUpdater idle. Use window.api.simulateUpdateDownloaded() in renderer console to preview.');
  }
}

module.exports = { setupAutoUpdater };
