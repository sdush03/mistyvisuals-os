// Updater UI Controller (Supports Antigravity Top-Bar Pill + Mandatory Blocking Modal)

function initUpdaterUI() {
  const headerBtn = document.getElementById('btn-restart-upgrade');
  const headerVersionTag = document.getElementById('upgrade-version-tag');

  // Mandatory Modal Elements
  const modal = document.getElementById('mandatory-update-modal');
  const modalIcon = document.getElementById('update-modal-icon');
  const modalTitle = document.getElementById('update-modal-title');
  const modalSub = document.getElementById('update-modal-sub');
  const modalVer = document.getElementById('update-modal-ver');
  const modalProgressWrap = document.getElementById('update-modal-progress-wrap');
  const modalBar = document.getElementById('update-modal-bar');
  const modalStatus = document.getElementById('update-modal-status');
  const modalPct = document.getElementById('update-modal-pct');
  const modalActionWrap = document.getElementById('update-modal-action-wrap');
  const modalRestartBtn = document.getElementById('update-modal-restart-btn');
  const modalCountdown = document.getElementById('update-modal-countdown');
  const modalDevClose = document.getElementById('update-modal-dev-close');

  let restartTriggered = false;
  let countdownTimer = null;
  let isDevMode = false;

  // Determine if running in unpacked dev mode
  window.api?.getIsPackaged?.().then((packaged) => {
    isDevMode = !packaged;
  }).catch(() => { isDevMode = true; });

  function closeDevPreview() {
    if (countdownTimer) clearInterval(countdownTimer);
    restartTriggered = false;
    if (modal) modal.style.display = 'none';
    if (modalRestartBtn) {
      modalRestartBtn.disabled = false;
      modalRestartBtn.textContent = '🔄 Restart & Apply Update Now';
    }
  }

  modalDevClose?.addEventListener('click', closeDevPreview);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isDevMode && modal && modal.style.display === 'flex') {
      closeDevPreview();
    }
  });

  async function triggerRestart() {
    if (restartTriggered) return;
    restartTriggered = true;
    if (countdownTimer) clearInterval(countdownTimer);

    if (modalRestartBtn) {
      modalRestartBtn.disabled = true;
      modalRestartBtn.textContent = 'Restarting now...';
    }
    if (headerBtn) {
      headerBtn.disabled = true;
      headerBtn.innerHTML = `
        <span class="upgrade-pulse"></span>
        <span>Restarting...</span>
      `;
    }

    try {
      if (window.api?.restartAndUpgrade) {
        await window.api.restartAndUpgrade();
      }
    } catch (err) {
      console.error('[Updater UI] Failed to restart and install update:', err);
      restartTriggered = false;
      if (modalRestartBtn) {
        modalRestartBtn.disabled = false;
        modalRestartBtn.textContent = 'Restart Failed (Click to Retry)';
      }
    }
  }

  // 1. When an update is detected (Mandatory mode triggers immediately)
  if (window.api?.onUpdateAvailable) {
    window.api.onUpdateAvailable((info) => {
      console.log('[Updater UI] Mandatory update detected:', info?.version);
      const verText = info?.version ? `v${info.version}` : 'latest';

      if (modal) {
        if (modalVer) modalVer.textContent = verText;
        if (modalBar) modalBar.style.width = '0%';
        if (modalPct) modalPct.textContent = '0%';
        if (modalStatus) modalStatus.textContent = 'Downloading mandatory update...';
        if (modalProgressWrap) modalProgressWrap.style.display = 'block';
        if (modalActionWrap) modalActionWrap.style.display = 'none';
        if (modalDevClose) modalDevClose.style.display = isDevMode ? 'inline-block' : 'none';

        // Display unclosable modal
        modal.style.display = 'flex';
      }
    });
  }

  // 2. Track background download progress
  if (window.api?.onUpdateDownloadProgress) {
    window.api.onUpdateDownloadProgress((progress) => {
      const pct = Math.min(100, Math.max(0, Math.round(progress?.percent || 0)));
      if (modalBar) modalBar.style.width = `${pct}%`;
      if (modalPct) modalPct.textContent = `${pct}%`;

      if (modalStatus && progress?.transferred && progress?.total) {
        const transferredMB = (progress.transferred / (1024 * 1024)).toFixed(1);
        const totalMB = (progress.total / (1024 * 1024)).toFixed(1);
        modalStatus.textContent = `Downloading ${transferredMB} MB / ${totalMB} MB...`;
      }
    });
  }

  // 3. When download finishes and update is ready
  if (window.api?.onUpdateReady) {
    window.api.onUpdateReady((info) => {
      console.log('[Updater UI] Update ready to apply:', info);
      const verText = info?.version ? `v${info.version}` : '';

      // Unhide top bar button as well
      if (headerBtn) {
        if (verText && headerVersionTag) {
          headerVersionTag.textContent = `(${verText})`;
        }
        headerBtn.style.display = 'inline-flex';
      }

      // Update Mandatory Modal to Restart State
      if (modal) {
        modal.style.display = 'flex';
        if (modalIcon) modalIcon.textContent = '✨';
        if (modalTitle) modalTitle.textContent = 'Update Downloaded & Verified';
        if (modalSub) {
          modalSub.innerHTML = `Version <b style="color: #10b981;">${verText}</b> is ready. The app must restart to apply the upgrade.`;
        }
        if (modalProgressWrap) modalProgressWrap.style.display = 'none';
        if (modalActionWrap) modalActionWrap.style.display = 'flex';
        if (modalDevClose) modalDevClose.style.display = isDevMode ? 'inline-block' : 'none';

        // Auto-restart countdown (5 seconds)
        let secondsLeft = 5;
        if (modalCountdown) modalCountdown.textContent = `Auto-restarting in ${secondsLeft} seconds...`;

        countdownTimer = setInterval(() => {
          secondsLeft -= 1;
          if (secondsLeft > 0) {
            if (modalCountdown) modalCountdown.textContent = `Auto-restarting in ${secondsLeft} seconds...`;
          } else {
            clearInterval(countdownTimer);
            if (modalCountdown) modalCountdown.textContent = 'Restarting app...';
            triggerRestart();
          }
        }, 1000);
      }
    });
  }

  // Button Listeners
  modalRestartBtn?.addEventListener('click', triggerRestart);
  headerBtn?.addEventListener('click', triggerRestart);

  // Helpful console tip for testing
  console.log('[Updater UI] Initialized. Run `window.api.simulateUpdateDownloaded("1.4.0")` to test mandatory update modal.');
}
