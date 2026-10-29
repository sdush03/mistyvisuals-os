// Updater UI Controller

function initUpdaterUI() {
  const btn = document.getElementById('btn-restart-upgrade');
  const versionTag = document.getElementById('upgrade-version-tag');
  if (!btn) return;

  if (window.api?.onUpdateAvailable) {
    window.api.onUpdateAvailable((info) => {
      console.log('[Updater UI] Update available and downloading in background:', info?.version);
    });
  }

  if (window.api?.onUpdateDownloadProgress) {
    window.api.onUpdateDownloadProgress((progress) => {
      console.log(`[Updater UI] Background download progress: ${progress.percent}%`);
    });
  }

  if (window.api?.onUpdateReady) {
    window.api.onUpdateReady((info) => {
      console.log('[Updater UI] Update downloaded and ready to apply:', info);
      if (info?.version && versionTag) {
        versionTag.textContent = `(v${info.version})`;
      }
      btn.style.display = 'inline-flex';
    });
  }

  btn.addEventListener('click', async () => {
    try {
      btn.disabled = true;
      btn.innerHTML = `
        <span class="upgrade-pulse"></span>
        <span>Restarting...</span>
      `;
      if (window.api?.restartAndUpgrade) {
        await window.api.restartAndUpgrade();
      }
    } catch (err) {
      console.error('[Updater UI] Failed to restart and install update:', err);
      btn.disabled = false;
      btn.textContent = 'Restart Failed (Retry)';
    }
  });

  // Helpful tip for developers running unpacked dev mode
  console.log('[Updater UI] Initialized. Run `window.api.simulateUpdateDownloaded("1.4.0")` in console to preview UI.');
}
