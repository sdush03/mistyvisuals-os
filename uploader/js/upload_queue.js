// Upload Queue & Pipeline Intercept Component

function initQueueUI() {
  const dropzone = document.getElementById('dropzone');
  const queueCancelBtn = document.getElementById('queue-cancel-btn');
  const queueStartBtn = document.getElementById('queue-start-btn');
  const toggleUploadedViewBtn = document.getElementById('toggle-uploaded-view-btn');

  if (dropzone) {
    dropzone.addEventListener('click', async () => {
      const folder = await window.api.selectFolder();
      if (folder) {
        setFolder([folder]);
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      
      if (e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        const paths = files.map(f => f.path);
        setFolder(paths);
      }
    });
  }

  if (queueCancelBtn) {
    queueCancelBtn.addEventListener('click', () => {
      const queueTotalStatus = document.getElementById('queue-total-status');
      const uploadQueueCard = document.getElementById('upload-queue-card');

      if (window.AppState.isUploadingActive) {
        window.api.cancelUpload();
        if (queueTotalStatus) queueTotalStatus.textContent = 'Pausing/cancelling upload...';
        queueCancelBtn.disabled = true;
        return;
      }

      window.AppState.resolvedFiles = [];
      window.AppState.selectedFolderPaths = [];
      if (dropzone) dropzone.style.display = 'flex';
      if (uploadQueueCard) uploadQueueCard.style.display = 'none';
    });
  }

  if (queueStartBtn) {
    queueStartBtn.addEventListener('click', onQueueStart);
  }

  if (toggleUploadedViewBtn) {
    toggleUploadedViewBtn.addEventListener('click', () => {
      const mainPanelTitle = document.getElementById('main-panel-title');
      const uploadQueueCard = document.getElementById('upload-queue-card');
      const uploadedPhotosCard = document.getElementById('uploaded-photos-card');

      if (window.AppState.currentUploaderView === 'upload') {
        window.AppState.currentUploaderView = 'uploaded';
        if (mainPanelTitle) mainPanelTitle.textContent = 'Uploaded Photos';
        toggleUploadedViewBtn.textContent = 'Back to Upload';
        
        if (dropzone) dropzone.style.display = 'none';
        if (uploadQueueCard) uploadQueueCard.style.display = 'none';
        if (uploadedPhotosCard) uploadedPhotosCard.style.display = 'flex';
        
        loadUploadedPhotos();
      } else {
        window.AppState.currentUploaderView = 'upload';
        if (mainPanelTitle) mainPanelTitle.textContent = 'Upload Photos';
        toggleUploadedViewBtn.textContent = 'View Uploaded Photos';
        
        if (uploadedPhotosCard) uploadedPhotosCard.style.display = 'none';
        if (window.AppState.resolvedFiles.length > 0) {
          if (uploadQueueCard) uploadQueueCard.style.display = 'flex';
          if (dropzone) dropzone.style.display = 'none';
        } else {
          if (dropzone) dropzone.style.display = 'flex';
          if (uploadQueueCard) uploadQueueCard.style.display = 'none';
        }
      }
    });
  }

  setupProgressListeners();
}

function showOrganizeModal(subDirsList, mainFolderName) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.style.zIndex = '9999';
    
    const listStr = subDirsList.slice(0, 4).join(', ') + (subDirsList.length > 4 ? ` and ${subDirsList.length - 4} more` : '');
    
    overlay.innerHTML = `
      <div class="modal-box" style="max-width: 440px; text-align: left; padding: 24px; background: #0c0c0e; border: 1px solid var(--surface-border); border-radius: 16px;">
        <div style="display: flex; gap: 12px; align-items: flex-start;">
          <div style="font-size: 24px;">📁</div>
          <div>
            <div style="font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 6px;">Organize Subfolders</div>
            <div style="font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-bottom: 16px;">
              We detected subfolders inside <strong>"${mainFolderName}"</strong> (including <em>${listStr}</em>).<br><br>
              How would you like to map these to your event tabs?
            </div>
          </div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px;">
          <button id="mode-split" class="btn" style="width: 100%; text-align: left; justify-content: flex-start; padding: 12px; font-size: 11px; text-transform: none; letter-spacing: normal; background: var(--primary); color: #fff; border-radius: 8px;">
            📂 <strong>Create separate tabs</strong> (e.g. for ${listStr})
          </button>
          
          <button id="mode-merge" class="btn" style="width: 100%; text-align: left; justify-content: flex-start; padding: 12px; font-size: 11px; text-transform: none; letter-spacing: normal; background: transparent; border: 1px solid var(--surface-border); color: #fff; border-radius: 8px;">
            📦 <strong>Merge all into single tab</strong> (group all under "${mainFolderName}")
          </button>
          
          <button id="mode-cancel" class="btn" style="width: 100%; justify-content: center; padding: 10px; font-size: 11px; text-transform: none; letter-spacing: normal; background: transparent; color: var(--text-muted); border: none;">
            Cancel Upload
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    const cleanup = () => {
      overlay.remove();
    };
    
    overlay.querySelector('#mode-split').addEventListener('click', () => {
      cleanup();
      resolve('split');
    });
    
    overlay.querySelector('#mode-merge').addEventListener('click', () => {
      cleanup();
      resolve('merge');
    });
    
    overlay.querySelector('#mode-cancel').addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
  });
}

async function setFolder(paths) {
  const dropzone = document.getElementById('dropzone');
  const uploadQueueCard = document.getElementById('upload-queue-card');
  const queueHeaderTitle = document.getElementById('queue-header-title');
  const queueHeaderSize = document.getElementById('queue-header-size');
  const queueTotalProgress = document.getElementById('queue-total-progress');
  const queueTotalStatus = document.getElementById('queue-total-status');
  const queueItemsList = document.getElementById('queue-items-list');
  const queueStartBtn = document.getElementById('queue-start-btn');
  const queueCancelBtn = document.getElementById('queue-cancel-btn');
  const queueCompletedMsg = document.getElementById('queue-completed-msg');
  const tabSelect = document.getElementById('tab-select');
  const customTab = document.getElementById('custom-tab');

  window.AppState.selectedFolderPaths = paths;
  if (dropzone) dropzone.style.display = 'none';
  if (uploadQueueCard) uploadQueueCard.style.display = 'flex';
  
  if (queueHeaderTitle) queueHeaderTitle.textContent = '0/0 Photos';
  if (queueHeaderSize) queueHeaderSize.textContent = '0.0 MB';
  if (queueTotalProgress) queueTotalProgress.style.width = '0%';
  if (queueTotalStatus) queueTotalStatus.textContent = 'Scanning directory...';
  if (queueItemsList) queueItemsList.innerHTML = '';
  
  if (queueStartBtn) {
    queueStartBtn.disabled = true;
    queueStartBtn.textContent = 'Start Upload';
  }
  if (queueCancelBtn) queueCancelBtn.style.display = 'block';
  if (queueCompletedMsg) queueCompletedMsg.style.display = 'none';
  window.AppState.uploadCompletedState = false;

  try {
    const scanResult = await window.api.getFolderFiles({ paths });

    if (scanResult.length === 0) {
      if (queueTotalStatus) queueTotalStatus.textContent = 'No photos (.jpg, .jpeg, .png) found in the selected folder.';
      if (queueHeaderTitle) queueHeaderTitle.textContent = '0 Photos';
      return;
    }

    const hasDirectFiles = scanResult.some(file => file.rootFolder === null);
    const validDropdownTab = (tabSelect && tabSelect.value && tabSelect.value !== 'ALL') ? tabSelect.value : null;
    const selectedTab = (customTab ? customTab.value.trim() : '') || validDropdownTab;

    if (hasDirectFiles && !selectedTab) {
      await showModal({
        icon: '⚠️',
        title: 'Select Event Tab',
        sub: 'Please select a gallery category tab or create a new one on the left before dragging photos directly.',
        confirmText: 'OK'
      });
      window.AppState.selectedFolderPaths = [];
      if (dropzone) dropzone.style.display = 'flex';
      if (uploadQueueCard) uploadQueueCard.style.display = 'none';
      return;
    }

    const defaultTabName = selectedTab || 'General';
    window.AppState.resolvedFiles = [];

    if (paths.length > 1) {
      window.AppState.resolvedFiles = scanResult.map(file => ({
        ...file,
        tabName: file.rootFolder || defaultTabName
      }));
    } else {
      const uniqueSubDirs = [...new Set(scanResult.map(f => f.topSubDir).filter(Boolean))];
      
      if (uniqueSubDirs.length === 0) {
        window.AppState.resolvedFiles = scanResult.map(file => ({
          ...file,
          tabName: file.rootFolder || defaultTabName
        }));
      } else {
        const mode = await showOrganizeModal(uniqueSubDirs, scanResult[0].rootFolder);
        if (!mode) {
          window.AppState.selectedFolderPaths = [];
          if (dropzone) dropzone.style.display = 'flex';
          if (uploadQueueCard) uploadQueueCard.style.display = 'none';
          return;
        }
        
        if (mode === 'split') {
          window.AppState.resolvedFiles = scanResult.map(file => ({
            ...file,
            tabName: file.topSubDir || file.rootFolder || defaultTabName
          }));
        } else {
          window.AppState.resolvedFiles = scanResult.map(file => ({
            ...file,
            tabName: file.rootFolder || defaultTabName
          }));
        }
      }
    }

    if (window.AppState.currentUploadedPhotosList.length === 0 && window.AppState.currentGalleryId) {
      try {
        const photosRes = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${window.AppState.currentGalleryId}/photos?limit=50000`, {
          headers: { 'Authorization': `Bearer ${window.AppState.authToken}` }
        });
        if (photosRes.ok) {
          const photosData = await photosRes.json();
          window.AppState.currentUploadedPhotosList = photosData.photos || [];
        }
      } catch (err) {
        console.error('[Deduplication] Failed to fetch existing photos:', err);
      }
    }

    const existingPhotosByTab = {};
    window.AppState.currentUploadedPhotosList.forEach(p => {
      const tName = (p.tabName || '').toLowerCase().trim();
      if (!existingPhotosByTab[tName]) {
        existingPhotosByTab[tName] = {};
      }
      const fName = (p.filename || '').toLowerCase().trim();
      existingPhotosByTab[tName][fName] = p.originalSize !== null && p.originalSize !== undefined ? p.originalSize : true;
    });

    let preCompletedCount = 0;
    window.AppState.resolvedFiles.forEach(file => {
      const tName = (file.tabName || '').toLowerCase().trim();
      const existingMap = existingPhotosByTab[tName] || {};
      const fName = (file.name || '').toLowerCase().trim();
      const existing = existingMap[fName];
      if (existing !== undefined) {
        const sizeMatches = (typeof existing === 'number') ? (existing === file.sizeBytes) : true;
        if (sizeMatches) {
          file.isAlreadyUploaded = true;
          preCompletedCount++;
        } else {
          file.isAlreadyUploaded = false;
        }
      } else {
        file.isAlreadyUploaded = false;
      }
    });

    const totalSizeBytes = window.AppState.resolvedFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
    const sizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);

    if (queueHeaderTitle) queueHeaderTitle.textContent = `${preCompletedCount}/${window.AppState.resolvedFiles.length} Photos`;
    if (queueHeaderSize) queueHeaderSize.textContent = `${sizeMB} MB`;
    if (queueTotalStatus) {
      if (preCompletedCount > 0) {
        queueTotalStatus.textContent = `${window.AppState.resolvedFiles.length - preCompletedCount} new files ready to upload (${preCompletedCount} already uploaded)`;
      } else {
        queueTotalStatus.textContent = `${window.AppState.resolvedFiles.length} files ready to upload`;
      }
    }

    renderQueueList();

    if (queueStartBtn) queueStartBtn.disabled = false;
  } catch (err) {
    console.error('Error scanning folder files:', err);
    if (queueTotalStatus) queueTotalStatus.textContent = 'Failed to scan directory files.';
  }
}

function renderQueueList() {
  const queueItemsList = document.getElementById('queue-items-list');
  if (!queueItemsList) return;

  queueItemsList.innerHTML = '';
  const fragment = document.createDocumentFragment();
  window.AppState.resolvedFiles.forEach((file, index) => {
    const row = document.createElement('div');
    row.className = 'queue-row';
    row.id = `q-row-${index}`;
    
    const fileMB = (file.sizeBytes / (1024 * 1024)).toFixed(2);
    const isDup = file.isAlreadyUploaded;
    const statusText = isDup ? '✓ Uploaded' : 'Pending';
    const statusColor = isDup ? 'var(--primary)' : 'var(--text-muted)';
    
    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; flex-direction: column; gap: 2px; max-width: 65%;">
          <span class="q-filename" style="font-size: 12px; font-weight: 600; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${file.name}">${file.name}</span>
          <span class="q-tabname" style="font-size: 10px; color: var(--primary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">📂 Tab: ${file.tabName}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span class="q-filesize" style="font-size: 11px; color: var(--text-muted); font-weight: 500;">${fileMB} MB</span>
          <span class="q-status" style="font-size: 11px; font-weight: 700; color: ${statusColor}; min-width: 70px; text-align: right;">${statusText}</span>
        </div>
      </div>
      <div class="q-row-progress-container" style="display: ${isDup ? 'block' : 'none'}; margin-top: 4px;">
        <div class="q-row-progress" style="width: ${isDup ? '100%' : '0%'}; background: var(--primary);"></div>
      </div>
    `;
    fragment.appendChild(row);
  });
  queueItemsList.appendChild(fragment);
}

async function ensureTabExists(tabName, eventId) {
  const tabSelect = document.getElementById('tab-select');
  if (tabSelect) {
    const exists = Array.from(tabSelect.options).some(opt => opt.value === tabName);
    if (exists) return true;
  }

  try {
    const res = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${eventId}/tabs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.AppState.authToken}`
      },
      body: JSON.stringify({ tabName })
    });

    if (res.ok) {
      if (tabSelect) {
        const option = document.createElement('option');
        option.value = tabName;
        option.textContent = tabName;
        tabSelect.appendChild(option);
      }
      return true;
    }
  } catch (err) {
    console.error(`Failed to automatically create tab ${tabName}:`, err);
  }
  return false;
}

async function onQueueStart() {
  const queueStartBtn = document.getElementById('queue-start-btn');
  const queueCancelBtn = document.getElementById('queue-cancel-btn');
  const queueTotalProgress = document.getElementById('queue-total-progress');
  const queueTotalStatus = document.getElementById('queue-total-status');
  const queueHeaderTitle = document.getElementById('queue-header-title');
  const queueCompletedMsg = document.getElementById('queue-completed-msg');
  const uploadQuality = document.getElementById('upload-quality');
  const watermarkToggle = document.getElementById('watermark-toggle');

  if (window.AppState.uploadCompletedState) {
    window.AppState.resolvedFiles = [];
    window.AppState.selectedFolderPaths = [];
    const dropzone = document.getElementById('dropzone');
    const uploadQueueCard = document.getElementById('upload-queue-card');
    if (dropzone) dropzone.style.display = 'flex';
    if (uploadQueueCard) uploadQueueCard.style.display = 'none';
    window.AppState.uploadCompletedState = false;
    if (queueStartBtn) queueStartBtn.textContent = 'Start Upload';
    if (queueCancelBtn) {
      queueCancelBtn.textContent = 'Cancel';
      queueCancelBtn.style.color = 'var(--text-muted)';
      queueCancelBtn.style.borderColor = 'var(--surface-border)';
      queueCancelBtn.style.display = 'block';
      queueCancelBtn.disabled = false;
    }
    if (queueCompletedMsg) queueCompletedMsg.style.display = 'none';

    const reportPanel = document.getElementById('integrity-report-panel');
    if (reportPanel) reportPanel.remove();
    return;
  }

  if (window.AppState.resolvedFiles.length === 0 || !window.AppState.authToken) return;

  const existingPhotosByTab = {};
  window.AppState.currentUploadedPhotosList.forEach(p => {
    const tName = (p.tabName || '').toLowerCase().trim();
    if (!existingPhotosByTab[tName]) {
      existingPhotosByTab[tName] = {};
    }
    const fName = (p.filename || '').toLowerCase().trim();
    existingPhotosByTab[tName][fName] = p.originalSize !== null && p.originalSize !== undefined ? p.originalSize : true;
  });

  let preCompletedCount = 0;
  window.AppState.resolvedFiles.forEach(file => {
    const tName = (file.tabName || '').toLowerCase().trim();
    const existingMap = existingPhotosByTab[tName] || {};
    const fName = (file.name || '').toLowerCase().trim();
    const existing = existingMap[fName];
    if (existing !== undefined) {
      const sizeMatches = (typeof existing === 'number') ? (existing === file.sizeBytes) : true;
      if (sizeMatches) {
        file.isAlreadyUploaded = true;
        preCompletedCount++;
      } else {
        file.isAlreadyUploaded = false;
      }
    } else {
      file.isAlreadyUploaded = false;
    }
  });

  const eventId = window.AppState.currentGalleryId;
  const eventSlug = window.AppState.currentGallerySlug;

  if (queueStartBtn) {
    queueStartBtn.disabled = true;
    queueStartBtn.textContent = 'Uploading...';
  }
  
  window.AppState.isUploadingActive = true;
  updatePerformanceInputsLockState();

  if (queueCancelBtn) {
    queueCancelBtn.textContent = 'Cancel Upload';
    queueCancelBtn.style.color = '#ef4444';
    queueCancelBtn.style.borderColor = '#ef4444';
    queueCancelBtn.style.display = 'block';
    queueCancelBtn.disabled = false;
  }

  if (queueHeaderTitle) queueHeaderTitle.textContent = `${preCompletedCount}/${window.AppState.resolvedFiles.length} Photos`;

  if (queueTotalStatus) queueTotalStatus.textContent = 'Running preflight checks...';
  let skipFaceScanning = false;
  let preflightSuccess = false;
  const setupScreen = document.getElementById('setup-screen');

  try {
    while (!preflightSuccess) {
      const preflight = await window.api.runPreflight({ daemons: window.AppState.uploadDaemons });
      if (setupScreen) setupScreen.classList.remove('active');

      if (preflight.status === 'ready') {
        preflightSuccess = true;
        break;
      }

      if (preflight.status === 'setup_failed') {
        const retry = await showModal({
          icon: '❌',
          title: 'Model Download Failed',
          sub: `Required scanner packages or AI models failed to install/download:\n\n${preflight.error}\n\nDo you want to retry downloading the models, or cancel the upload?`,
          confirmText: 'Retry Download',
          danger: true
        });
        if (!retry) {
          resetUploadUIState();
          return;
        }
      } else if (preflight.status === 'daemon_failed') {
        const continueWithoutScan = await showModal({
          icon: '⚠️',
          title: 'Scanner Offline',
          sub: `Face recognition engine failed to start:\n\n${preflight.error}\n\nDo you want to continue the upload without face scanning? (You can run face scan later via Backfill)`,
          confirmText: 'Continue Without Scan',
          danger: false
        });
        if (continueWithoutScan) {
          skipFaceScanning = true;
          preflightSuccess = true;
          break;
        } else {
          resetUploadUIState();
          return;
        }
      }
    }
  } catch (err) {
    if (setupScreen) setupScreen.classList.remove('active');
    console.error('Preflight error:', err);
    await showModal({ icon: '❌', title: 'Preflight Error', sub: err.message, confirmText: 'OK', danger: true });
    resetUploadUIState();
    return;
  }

  if (queueTotalStatus) queueTotalStatus.textContent = 'Verifying category tabs on server...';
  try {
    const uniqueTabs = [...new Set(window.AppState.resolvedFiles.map(f => f.tabName).filter(Boolean))];
    for (const tab of uniqueTabs) {
      const success = await ensureTabExists(tab, eventId);
      if (!success) {
        await showModal({
          icon: '❌',
          title: 'Category Creation Failed',
          sub: `Failed to create or verify category tab "${tab}" on the server. Please check your internet connection.`,
          confirmText: 'OK',
          danger: true
        });
        resetUploadUIState();
        return;
      }
    }
  } catch (tabErr) {
    console.error('Failed to pre-create tabs:', tabErr);
  }

  if (queueTotalStatus) queueTotalStatus.textContent = 'Starting upload pipeline...';

  try {
    const result = await window.api.processPhotos({
      resolvedFiles: window.AppState.resolvedFiles,
      eventId,
      eventSlug,
      backendUrl: window.AppState.apiBaseUrl,
      token: window.AppState.authToken,
      uploadQuality: uploadQuality ? uploadQuality.value : '4k',
      applyWatermark: watermarkToggle ? watermarkToggle.checked : true,
      concurrency: window.AppState.uploadWorkers,
      daemons: skipFaceScanning ? 0 : window.AppState.uploadDaemons
    });

    window.AppState.isUploadingActive = false;
    updatePerformanceInputsLockState();

    if (queueCancelBtn) {
      queueCancelBtn.textContent = 'Cancel';
      queueCancelBtn.style.color = 'var(--text-muted)';
      queueCancelBtn.style.borderColor = 'var(--surface-border)';
    }

    if (result && result.status === 'cancelled') {
      if (queueTotalStatus) queueTotalStatus.textContent = `Upload paused/cancelled. ${result.count} photos uploaded.`;
      if (queueStartBtn) {
        queueStartBtn.textContent = 'Resume Upload';
        queueStartBtn.disabled = false;
      }
      if (queueCancelBtn) queueCancelBtn.disabled = false;
      
      window.AppState.uploadedPhotosCache = {};
      await loadUploadedPhotos();
      return;
    }

    if (queueTotalProgress) queueTotalProgress.style.width = '100%';
    if (queueHeaderTitle) queueHeaderTitle.textContent = `${result.count}/${result.count} Photos`;
    
    const queueItemsList = document.getElementById('queue-items-list');
    const rows = queueItemsList ? queueItemsList.querySelectorAll('.queue-row') : [];
    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    rows.forEach(r => {
      const statusText = r.querySelector('.q-status').textContent;
      if (statusText.includes('SUCCESS')) successCount++;
      else if (statusText.includes('SKIPPED')) skippedCount++;
      else if (statusText.includes('FAILED')) failedCount++;
    });

    if (queueTotalStatus) queueTotalStatus.textContent = `${successCount} success, ${skippedCount} skipped, ${failedCount} error`;
    
    if (queueCompletedMsg) queueCompletedMsg.style.display = 'flex';
    if (queueStartBtn) {
      queueStartBtn.textContent = 'UPLOAD MORE';
      queueStartBtn.disabled = false;
    }
    if (queueCancelBtn) queueCancelBtn.textContent = 'Back';
    window.AppState.uploadCompletedState = true;
    window.AppState.uploadedPhotosCache = {};
    await loadUploadedPhotos();
    triggerBackfillCheck();
  } catch (err) {
    resetUploadUIState();
    await showModal({ icon: '❌', title: 'Upload Failed', sub: err.message, confirmText: 'OK', danger: true });
    if (queueTotalStatus) queueTotalStatus.textContent = 'Upload failed. Correct issues and try again.';
  }
}

function resetUploadUIState() {
  const queueStartBtn = document.getElementById('queue-start-btn');
  const queueCancelBtn = document.getElementById('queue-cancel-btn');

  window.AppState.isUploadingActive = false;
  updatePerformanceInputsLockState();

  if (queueStartBtn) {
    queueStartBtn.disabled = false;
    queueStartBtn.textContent = 'Start Upload';
  }
  if (queueCancelBtn) {
    queueCancelBtn.textContent = 'Cancel';
    queueCancelBtn.style.color = 'var(--text-muted)';
    queueCancelBtn.style.borderColor = 'var(--surface-border)';
    queueCancelBtn.style.display = 'block';
  }
}

function setupProgressListeners() {
  window.api.onProgress((data) => {
    const queueTotalProgress = document.getElementById('queue-total-progress');
    const queueHeaderTitle = document.getElementById('queue-header-title');
    const queueTotalStatus = document.getElementById('queue-total-status');

    if (data.status === 'perf-stats') {
      const statsEl = document.getElementById('upload-perf-stats');
      if (statsEl) {
        statsEl.style.display = 'block';
        statsEl.textContent = `Active: ${data.activeUploads} uploads | ${data.activeScans} scanners`;
      }
      return;
    }

    if (data.status === 'row-processing') {
      const row = document.getElementById(`q-row-${data.index}`);
      if (row) {
        const statusText = row.querySelector('.q-status');
        const progressContainer = row.querySelector('.q-row-progress-container');
        const progressBar = row.querySelector('.q-row-progress');
        if (statusText) {
          statusText.textContent = 'Processing...';
          statusText.style.color = '#eab308';
        }
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressBar) progressBar.style.width = '40%';
      }
    } else if (data.status === 'row-uploading') {
      const row = document.getElementById(`q-row-${data.index}`);
      if (row) {
        const statusText = row.querySelector('.q-status');
        const progressBar = row.querySelector('.q-row-progress');
        if (statusText) {
          statusText.textContent = 'Uploading...';
          statusText.style.color = '#3b82f6';
        }
        if (progressBar) progressBar.style.width = '80%';
      }
    } else if (data.status === 'row-skipped') {
      const row = document.getElementById(`q-row-${data.index}`);
      if (row) {
        const statusText = row.querySelector('.q-status');
        const progressBar = row.querySelector('.q-row-progress');
        const progressContainer = row.querySelector('.q-row-progress-container');
        if (statusText) {
          statusText.innerHTML = 'SKIPPED <span style="font-size:10px;">✓</span>';
          statusText.style.color = '#38bdf8';
        }
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.style.background = '#38bdf8';
        }
      }
    } else if (data.status === 'row-success') {
      const row = document.getElementById(`q-row-${data.index}`);
      if (row) {
        const statusText = row.querySelector('.q-status');
        const progressBar = row.querySelector('.q-row-progress');
        if (statusText) {
          statusText.innerHTML = 'SUCCESS <span style="font-size:10px;">✓</span>';
          statusText.style.color = 'var(--primary)';
        }
        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.style.background = 'var(--primary)';
        }
      }
    } else if (data.status === 'row-error') {
      const row = document.getElementById(`q-row-${data.index}`);
      if (row) {
        const statusText = row.querySelector('.q-status');
        const progressBar = row.querySelector('.q-row-progress');
        if (statusText) {
          statusText.textContent = `FAILED (${data.error || 'Unknown error'})`;
          statusText.style.color = '#ef4444';
          statusText.title = data.error || '';
        }
        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.style.background = '#ef4444';
        }
      }
    } else if (data.status === 'progress') {
      const pct = Math.round((data.index / data.total) * 100);
      if (queueTotalProgress) queueTotalProgress.style.width = `${pct}%`;
      if (queueHeaderTitle) queueHeaderTitle.textContent = `${data.index}/${data.total} Photos`;
      if (queueTotalStatus) queueTotalStatus.textContent = `Uploading files: ${data.index} of ${data.total} completed`;
    } else if (data.status === 'submitting') {
      if (queueTotalStatus) queueTotalStatus.textContent = 'Optimizing database & syncing face indexes...';
      const statsEl = document.getElementById('upload-perf-stats');
      if (statsEl) statsEl.style.display = 'none';
    }
  });

  window.api.onPreflightProgress((data) => {
    const setupScreen = document.getElementById('setup-screen');
    const setupProgress = document.getElementById('setup-progress');
    const setupStatus = document.getElementById('setup-status');
    const setupFileCount = document.getElementById('setup-file-count');
    const setupFileProgress = document.getElementById('setup-file-progress');
    const setupTitle = document.getElementById('setup-title');
    const setupSub = document.getElementById('setup-sub');
    const setupError = document.getElementById('setup-error');

    if (setupScreen && setupScreen.classList.contains('active')) {
      if (setupTitle) setupTitle.textContent = "Pre-upload Preflight Check";
      if (setupSub) setupSub.textContent = "Verifying face scanner and downloading missing models...";
      if (setupProgress) setupProgress.style.width = `${data.progress}%`;
      if (setupError) setupError.style.display = 'none';

      if (setupStatus) {
        if (data.status === 'setup_needed') {
          setupStatus.textContent = 'Installing packages / models...';
        } else if (data.status === 'installing' || data.status === 'downloading') {
          setupStatus.textContent = data.detail || 'Downloading...';
        } else if (data.status === 'starting_daemon') {
          setupStatus.textContent = 'Starting face recognition engines...';
        } else {
          setupStatus.textContent = data.status;
        }
      }
      if (setupFileCount) setupFileCount.textContent = '';
      if (setupFileProgress) setupFileProgress.textContent = '';
    }
  });

  window.api.onUploadReport((report) => {
    window.AppState.lastUploadReport = report;
    renderUploadIntegrityReport(report);
  });
}
