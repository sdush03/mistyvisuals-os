// Modal & Quality Report Component

function initPerformanceUI() {
  const settingsModal = document.getElementById('settings-modal');
  const dashboardSettingsBtn = document.getElementById('dashboard-settings-btn');
  const sidebarSettingsBtn = document.getElementById('sidebar-settings-btn');
  const settingsCancelBtn = document.getElementById('settings-cancel');
  const settingsSaveBtn = document.getElementById('settings-save');

  const sliderUploadWorkers = document.getElementById('slider-upload-workers');
  const valUploadWorkers = document.getElementById('val-upload-workers');
  const sliderUploadDaemons = document.getElementById('slider-upload-daemons');
  const valUploadDaemons = document.getElementById('val-upload-daemons');

  const sliderBackfillWorkers = document.getElementById('slider-backfill-workers');
  const valBackfillWorkers = document.getElementById('val-backfill-workers');
  const sliderBackfillDaemons = document.getElementById('slider-backfill-daemons');
  const valBackfillDaemons = document.getElementById('val-backfill-daemons');

  if (sliderUploadWorkers) {
    sliderUploadWorkers.addEventListener('input', (e) => {
      window.AppState.tempUploadWorkers = parseInt(e.target.value);
      if (valUploadWorkers) valUploadWorkers.textContent = window.AppState.tempUploadWorkers;
    });
  }
  if (sliderUploadDaemons) {
    sliderUploadDaemons.addEventListener('input', (e) => {
      window.AppState.tempUploadDaemons = parseInt(e.target.value);
      if (valUploadDaemons) valUploadDaemons.textContent = window.AppState.tempUploadDaemons;
    });
  }
  if (sliderBackfillWorkers) {
    sliderBackfillWorkers.addEventListener('input', (e) => {
      window.AppState.tempBackfillWorkers = parseInt(e.target.value);
      if (valBackfillWorkers) valBackfillWorkers.textContent = window.AppState.tempBackfillWorkers;
    });
  }
  if (sliderBackfillDaemons) {
    sliderBackfillDaemons.addEventListener('input', (e) => {
      window.AppState.tempBackfillDaemons = parseInt(e.target.value);
      if (valBackfillDaemons) valBackfillDaemons.textContent = window.AppState.tempBackfillDaemons;
    });
  }

  const openSettings = () => {
    window.AppState.tempUploadWorkers = window.AppState.uploadWorkers;
    window.AppState.tempUploadDaemons = window.AppState.uploadDaemons;
    window.AppState.tempBackfillWorkers = window.AppState.backfillWorkers;
    window.AppState.tempBackfillDaemons = window.AppState.backfillDaemons;

    if (sliderUploadWorkers) sliderUploadWorkers.value = window.AppState.uploadWorkers;
    if (valUploadWorkers) valUploadWorkers.textContent = window.AppState.uploadWorkers;
    
    if (sliderUploadDaemons) sliderUploadDaemons.value = window.AppState.uploadDaemons;
    if (valUploadDaemons) valUploadDaemons.textContent = window.AppState.uploadDaemons;

    if (sliderBackfillWorkers) sliderBackfillWorkers.value = window.AppState.backfillWorkers;
    if (valBackfillWorkers) valBackfillWorkers.textContent = window.AppState.backfillWorkers;

    if (sliderBackfillDaemons) sliderBackfillDaemons.value = window.AppState.backfillDaemons;
    if (valBackfillDaemons) valBackfillDaemons.textContent = window.AppState.backfillDaemons;

    updatePerformanceInputsLockState();
    if (settingsModal) settingsModal.classList.add('open');
  };

  if (dashboardSettingsBtn) dashboardSettingsBtn.addEventListener('click', openSettings);
  if (sidebarSettingsBtn) sidebarSettingsBtn.addEventListener('click', openSettings);

  const settingsRecommendBtn = document.getElementById('settings-recommend');
  if (settingsRecommendBtn) {
    settingsRecommendBtn.addEventListener('click', async () => {
      try {
        const specs = await window.api.getHardwareSpecs();
        const cores = specs.cores || 4;
        
        window.AppState.tempUploadWorkers = Math.min(6, cores);
        window.AppState.tempUploadDaemons = Math.max(1, Math.min(2, Math.floor(cores / 4)));
        window.AppState.tempBackfillWorkers = Math.min(8, cores);
        window.AppState.tempBackfillDaemons = Math.max(1, Math.min(3, Math.floor(cores / 3)));

        if (sliderUploadWorkers) sliderUploadWorkers.value = window.AppState.tempUploadWorkers;
        if (valUploadWorkers) valUploadWorkers.textContent = window.AppState.tempUploadWorkers;
        
        if (sliderUploadDaemons) sliderUploadDaemons.value = window.AppState.tempUploadDaemons;
        if (valUploadDaemons) valUploadDaemons.textContent = window.AppState.tempUploadDaemons;

        if (sliderBackfillWorkers) sliderBackfillWorkers.value = window.AppState.tempBackfillWorkers;
        if (valBackfillWorkers) valBackfillWorkers.textContent = window.AppState.tempBackfillWorkers;

        if (sliderBackfillDaemons) sliderBackfillDaemons.value = window.AppState.tempBackfillDaemons;
        if (valBackfillDaemons) valBackfillDaemons.textContent = window.AppState.tempBackfillDaemons;

        console.log(`[Settings] Optimized values calculated for ${cores} cores CPU.`);
      } catch (err) {
        console.error('Failed to get hardware specs:', err);
      }
    });
  }

  if (settingsCancelBtn) {
    settingsCancelBtn.addEventListener('click', () => {
      if (settingsModal) settingsModal.classList.remove('open');
    });
  }

  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', () => {
      const isRunning = window.AppState.isUploadingActive || (window.AppState.activeBackfillStatus.status !== 'idle');
      if (isRunning) return;

      window.AppState.uploadWorkers = window.AppState.tempUploadWorkers;
      window.AppState.uploadDaemons = window.AppState.tempUploadDaemons;
      window.AppState.backfillWorkers = window.AppState.tempBackfillWorkers;
      window.AppState.backfillDaemons = window.AppState.tempBackfillDaemons;

      localStorage.setItem('upload_workers', window.AppState.uploadWorkers);
      localStorage.setItem('upload_daemons', window.AppState.uploadDaemons);
      localStorage.setItem('backfill_workers', window.AppState.backfillWorkers);
      localStorage.setItem('backfill_daemons', window.AppState.backfillDaemons);

      if (settingsModal) settingsModal.classList.remove('open');
    });
  }
}

function updatePerformanceInputsLockState() {
  const sliderUploadWorkers = document.getElementById('slider-upload-workers');
  const sliderUploadDaemons = document.getElementById('slider-upload-daemons');
  const sliderBackfillWorkers = document.getElementById('slider-backfill-workers');
  const sliderBackfillDaemons = document.getElementById('slider-backfill-daemons');
  const settingsSaveBtn = document.getElementById('settings-save');

  const isRunning = window.AppState.isUploadingActive || (window.AppState.activeBackfillStatus.status !== 'idle');
  [sliderUploadWorkers, sliderUploadDaemons, sliderBackfillWorkers, sliderBackfillDaemons].forEach(slider => {
    if (slider) slider.disabled = isRunning;
  });
  if (settingsSaveBtn) {
    settingsSaveBtn.disabled = isRunning;
    if (isRunning) {
      settingsSaveBtn.style.opacity = '0.5';
      settingsSaveBtn.textContent = 'Active (Cannot Apply)';
    } else {
      settingsSaveBtn.style.opacity = '1';
      settingsSaveBtn.textContent = 'Save & Apply';
    }
  }
}

async function checkAndInstallEngine() {
  const setupScreen = document.getElementById('setup-screen');
  const setupProgress = document.getElementById('setup-progress');
  const setupStatus = document.getElementById('setup-status');
  const setupError = document.getElementById('setup-error');

  const setupFileCount = document.getElementById('setup-file-count');
  const setupFileProgress = document.getElementById('setup-file-progress');

  window.api.onSetupProgress((data) => {
    if (setupProgress) setupProgress.style.width = `${data.progress}%`;
    if (setupStatus) setupStatus.textContent = data.status;
    if (setupFileCount && data.fileCount) setupFileCount.textContent = data.fileCount;
    if (setupFileProgress && data.fileProgress) setupFileProgress.textContent = data.fileProgress;
  });

  try {
    const result = await window.api.triggerSetup();
    if (result.status === 'ready' || result.status === 'success') {
      console.log('[Setup] Environment ready. Transitioning to login.');
      if (setupScreen) setupScreen.classList.remove('active');
      await restoreSession();
    } else {
      if (setupStatus) setupStatus.textContent = 'Setup Failed';
      if (setupError) {
        setupError.textContent = result.error || 'Unknown setup error occurred.';
        setupError.style.display = 'block';
      }
    }
  } catch (err) {
    if (setupStatus) setupStatus.textContent = 'Error';
    if (setupError) {
      setupError.textContent = err.message;
      setupError.style.display = 'block';
    }
  }
}

function showModal({ icon = '', title, sub = '', inputPlaceholder, inputValue = '', confirmText = 'Confirm', danger = false }) {
  const appModal     = document.getElementById('app-modal');
  const appModalBox  = document.getElementById('app-modal-box');
  const modalIcon    = document.getElementById('modal-icon');
  const modalTitle   = document.getElementById('modal-title');
  const modalSub     = document.getElementById('modal-sub');
  const modalInput   = document.getElementById('modal-input');
  const modalCancel  = document.getElementById('modal-cancel');
  const modalConfirm = document.getElementById('modal-confirm');

  return new Promise((resolve) => {
    if (modalIcon) modalIcon.textContent = icon;
    if (modalTitle) modalTitle.textContent = title;
    if (modalSub) modalSub.textContent = sub;
    if (modalConfirm) modalConfirm.textContent = confirmText;

    if (danger) {
      if (appModalBox) appModalBox.classList.add('danger');
      if (modalConfirm) modalConfirm.className = 'modal-btn danger';
    } else {
      if (appModalBox) appModalBox.classList.remove('danger');
      if (modalConfirm) modalConfirm.className = 'modal-btn confirm';
    }

    if (inputPlaceholder !== undefined) {
      if (modalInput) {
        modalInput.style.display = 'block';
        modalInput.placeholder   = inputPlaceholder;
        modalInput.value         = inputValue;
        setTimeout(() => { modalInput.focus(); modalInput.select(); }, 80);
      }
    } else {
      if (modalInput) {
        modalInput.style.display = 'none';
        modalInput.value = '';
      }
    }

    if (appModal) appModal.classList.add('open');

    const cleanup = () => {
      if (appModal) appModal.classList.remove('open');
      if (modalConfirm) modalConfirm.removeEventListener('click', onConfirm);
      if (modalCancel) modalCancel.removeEventListener('click', onCancel);
      if (modalInput) modalInput.removeEventListener('keydown', onKey);
      if (appModal) appModal.removeEventListener('click', onOverlay);
    };

    const onConfirm = () => {
      cleanup();
      resolve(inputPlaceholder !== undefined ? (modalInput ? modalInput.value.trim() : '') : true);
    };
    const onCancel = () => { cleanup(); resolve(null); };
    const onKey = (e) => {
      if (e.key === 'Enter') onConfirm();
      if (e.key === 'Escape') onCancel();
    };
    const onOverlay = (e) => { if (e.target === appModal) onCancel(); };

    if (modalConfirm) modalConfirm.addEventListener('click', onConfirm);
    if (modalCancel) modalCancel.addEventListener('click', onCancel);
    if (modalInput) modalInput.addEventListener('keydown', onKey);
    if (appModal) appModal.addEventListener('click', onOverlay);
  });
}

function renderUploadIntegrityReport(report) {
  const existing = document.getElementById('integrity-report-panel');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'integrity-report-panel';
  container.style.cssText = 'background: rgba(255, 255, 255, 0.02); border: 1px solid var(--surface-border); border-radius: 12px; padding: 16px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 12px; width: 100%; box-sizing: border-box;';

  const hasFailed = report.failed && report.failed.length > 0;
  const hasThumbFail = report.thumbnailMissing && report.thumbnailMissing.length > 0;
  const hasFaceFail = (report.faceScanErrored && report.faceScanErrored.length > 0) || (report.faceCropsDropped && report.faceCropsDropped.length > 0) || (report.faceScanSkipped && report.faceScanSkipped.length > 0);

  const uploadedCount = report.successCount || 0;
  const totalCount = report.total || 0;
  const thumbCount = report.thumbnailMissing ? report.thumbnailMissing.length : 0;
  const cropCount = report.faceCropsDropped ? report.faceCropsDropped.reduce((acc, c) => acc + c.count, 0) : 0;
  const scanErrCount = report.faceScanErrored ? report.faceScanErrored.length : 0;
  const skippedScanCount = report.faceScanSkipped ? report.faceScanSkipped.length : 0;
  const failedCount = report.failed ? report.failed.length : 0;

  let dbRegistered = 'Verifying...';
  let qdrantStatus = 'Verifying...';

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed rgba(255,255,255,0.06); padding-bottom: 8px;">
      <h3 style="font-size: 11px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">Upload Quality Report</h3>
      <span style="font-size: 9px; color: var(--text-muted); font-weight: bold; background: rgba(255,255,255,0.05); padding: 3px 8px; border-radius: 6px;">Batch Check</span>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
        <span style="color: var(--text-muted);">Uploaded to R2:</span>
        <span style="font-weight: bold; color: ${failedCount > 0 ? '#fb7185' : 'var(--primary)'};">${uploadedCount}/${totalCount}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
        <span style="color: var(--text-muted);">DB Registered:</span>
        <span id="report-registered" style="font-weight: bold; color: var(--primary);">${dbRegistered}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
        <span style="color: var(--text-muted);">Thumbnails Missing:</span>
        <span style="font-weight: bold; color: ${thumbCount > 0 ? '#facc15' : '#34d399'};">${thumbCount}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
        <span style="color: var(--text-muted);">Face Crop Errors:</span>
        <span style="font-weight: bold; color: ${cropCount > 0 ? '#facc15' : '#34d399'};">${cropCount}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
        <span style="color: var(--text-muted);">Face Scan Errors:</span>
        <span style="font-weight: bold; color: ${(scanErrCount + skippedScanCount) > 0 ? '#facc15' : '#34d399'};">${scanErrCount + skippedScanCount}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
        <span style="color: var(--text-muted);">Qdrant Status:</span>
        <span id="report-qdrant" style="font-weight: bold; color: var(--primary);">${qdrantStatus}</span>
      </div>
    </div>

    <div id="report-failed-list-container" style="display: ${failedCount > 0 ? 'block' : 'none'}; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
      <span style="font-size: 10px; color: #fb7185; font-weight: bold; text-transform: uppercase;">Failed Photos:</span>
      <div id="report-failed-list" style="max-height: 80px; overflow-y: auto; font-size: 10px; color: var(--text-muted); margin-top: 4px; display: flex; flex-direction: column; gap: 2px;">
        ${(report.failed || []).map(f => `<div>• ${f.filename} (${f.error})</div>`).join('')}
      </div>
    </div>

    <div style="display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap;">
      <button id="btn-retry-failed" class="btn" style="padding: 6px 12px; font-size: 10px; background: #dc2626; color: #fff; text-transform: none; display: ${failedCount > 0 ? 'block' : 'none'};">Retry Failed</button>
      <button id="btn-retry-thumbs" class="btn" style="padding: 6px 12px; font-size: 10px; background: #ea580c; color: #fff; text-transform: none; display: ${thumbCount > 0 ? 'block' : 'none'};">Retry Thumbnails</button>
      <button id="btn-retry-faces" class="btn" style="padding: 6px 12px; font-size: 10px; background: #2563eb; color: #fff; text-transform: none; display: ${hasFaceFail ? 'block' : 'none'};">Run Face Scan</button>
      <button id="btn-event-integrity" class="btn" style="padding: 6px 12px; font-size: 10px; background: transparent; border: 1px solid var(--surface-border); color: #fff; text-transform: none;">Verify Event Health</button>
    </div>
  `;

  const list = document.getElementById('queue-items-list');
  if (list) {
    list.parentNode.insertBefore(container, list.nextSibling);
  }

  const retryFailedBtn = document.getElementById('btn-retry-failed');
  if (retryFailedBtn) {
    retryFailedBtn.addEventListener('click', () => {
      const failedPaths = report.failed.map(f => f.originalPath);
      window.AppState.resolvedFiles = window.AppState.resolvedFiles.filter(file => failedPaths.includes(file.path));
      window.AppState.uploadCompletedState = false;
      container.remove();
      const queueStartBtn = document.getElementById('queue-start-btn');
      if (queueStartBtn) queueStartBtn.click();
    });
  }

  const retryThumbsBtn = document.getElementById('btn-retry-thumbs');
  if (retryThumbsBtn) {
    retryThumbsBtn.addEventListener('click', async () => {
      retryThumbsBtn.disabled = true;
      retryThumbsBtn.textContent = 'Regenerating...';
      try {
        const res = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${window.AppState.currentGalleryId}/regenerate-thumbnails`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${window.AppState.authToken}`
          },
          body: JSON.stringify({ photoIds: report.photoIds || [] })
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        await showModal({
          icon: '✅',
          title: 'Thumbnails Finished',
          sub: `Successfully regenerated ${data.regenerated} thumbnails. Failed: ${data.failed}.`,
          confirmText: 'OK'
        });
        window.AppState.uploadedPhotosCache = {};
        await loadUploadedPhotos();
        triggerBatchIntegrityCheck(report.photoIds);
      } catch (err) {
        console.error('Thumbnail regeneration failed:', err);
        await showModal({ icon: '❌', title: 'Regeneration Failed', sub: err.message, confirmText: 'OK', danger: true });
        retryThumbsBtn.disabled = false;
        retryThumbsBtn.textContent = 'Retry Thumbnails';
      }
    });
  }

  const retryFacesBtn = document.getElementById('btn-retry-faces');
  if (retryFacesBtn) {
    retryFacesBtn.addEventListener('click', () => {
      triggerBackfillCheck();
      retryFacesBtn.disabled = true;
      retryFacesBtn.textContent = 'Backfill Triggered';
    });
  }

  const eventIntegrityBtn = document.getElementById('btn-event-integrity');
  if (eventIntegrityBtn) {
    eventIntegrityBtn.addEventListener('click', () => {
      triggerBatchIntegrityCheck([]);
    });
  }

  triggerBatchIntegrityCheck(report.photoIds || []);
}

async function triggerBatchIntegrityCheck(photoIds) {
  try {
    const res = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${window.AppState.currentGalleryId}/integrity-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.AppState.authToken}`
      },
      body: JSON.stringify({ photoIds })
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();

    const registeredEl = document.getElementById('report-registered');
    const qdrantEl = document.getElementById('report-qdrant');
    const panel = document.getElementById('integrity-report-panel');

    if (registeredEl) {
      registeredEl.textContent = `${data.registered}/${data.expected}`;
      if (data.registered < data.expected) {
        registeredEl.style.color = '#fb7185';
      } else {
        registeredEl.style.color = 'var(--primary)';
      }
    }

    if (qdrantEl) {
      qdrantEl.textContent = data.qdrantMode === 'connected' ? 'Live' : 'Mock Mode';
      qdrantEl.style.color = data.qdrantMode === 'connected' ? 'var(--primary)' : '#f97316';
      
      if (photoIds.length === 0 && panel) {
        const badge = panel.querySelector('span[style*="font-size: 9px;"]');
        if (badge) {
          badge.textContent = 'Whole Event Check';
          badge.style.background = 'rgba(16, 185, 129, 0.1)';
          badge.style.color = 'var(--primary)';
        }
      }
    }
  } catch (err) {
    console.error('Integrity check call failed:', err);
  }
}
