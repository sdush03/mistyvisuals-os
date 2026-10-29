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
    if (!app.isPackaged) {
      console.log('[AutoUpdater] Dev mode: relaunching app via app.relaunch() + app.exit(0)');
      app.relaunch();
      app.exit(0);
      return true;
    }
    try {
      // isSilent = false, isForceRunAfter = true
      autoUpdater.quitAndInstall(false, true);
    } catch (err) {
      console.error('[AutoUpdater] quitAndInstall failed, fallback to relaunch:', err.message);
      app.relaunch();
      app.exit(0);
    }
    return true;
  });

  ipcMain.handle('get-is-packaged', () => app.isPackaged);

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

  // Dev helper: trigger simulated mandatory update for testing UI
  ipcMain.handle('dev-simulate-update', (event, version = '1.4.0') => {
    const win = getMainWindow();
    if (win && win.webContents) {
      win.webContents.send('update-available', { version });
      let p = 0;
      const interval = setInterval(() => {
        p += 20;
        if (p <= 100) {
          win.webContents.send('update-download-progress', {
            percent: p,
            bytesPerSecond: 1024 * 1024 * 2.5,
            transferred: p * 1024 * 1024,
            total: 100 * 1024 * 1024
          });
        }
        if (p >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            win.webContents.send('update-ready', { version });
          }, 400);
        }
      }, 350);
    }
    return true;
  });

  // Start checking if packaged
  if (app.isPackaged) {
    // Check quickly on app launch (1.5s) to block if an update is required
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.warn('[AutoUpdater] Initial check error:', err.message);
      });
    }, 1500);

    // Recheck periodically every hour
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.warn('[AutoUpdater] Periodic check error:', err.message);
      });
    }, 60 * 60 * 1000);
  } else {
    console.log('[AutoUpdater] Dev mode detected: autoUpdater idle. Use window.api.simulateUpdateDownloaded() in renderer console to preview.');
  }
}

module.exports = { setupAutoUpdater };
