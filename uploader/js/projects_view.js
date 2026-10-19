// Login & Gallery Projects Component

function initProjectsUI() {
  const loginBtn = document.getElementById('login-btn');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  const loginUrl = document.getElementById('login-url');
  const loginError = document.getElementById('login-error');
  const dashboardLogoutBtn = document.getElementById('dashboard-logout-btn');
  const backToProjectsBtn = document.getElementById('back-to-projects-btn');

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const email = loginEmail.value.trim();
      const password = loginPassword.value;
      window.AppState.apiBaseUrl = loginUrl.value.trim().replace(/\/$/, '');
      const rememberMe = document.getElementById('remember-me')?.checked;

      if (!email || !password) {
        showLoginError('Please enter email and password.');
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = 'Connecting...';
      if (loginError) loginError.style.display = 'none';

      try {
        const res = await fetch(`${window.AppState.apiBaseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        if (!res.ok) {
          let errMsg = 'Authentication failed';
          try {
            const err = await res.json();
            errMsg = err.error || errMsg;
          } catch (e) {
            errMsg = `Server error (${res.status}): ${res.statusText || 'Unable to connect to Misty OS backend'}`;
          }
          throw new Error(errMsg);
        }

        const data = await res.json();
        window.AppState.authToken = data.token;

        if (rememberMe) {
          localStorage.setItem('mv_credentials', JSON.stringify({ email, password, apiBaseUrl: window.AppState.apiBaseUrl }));
        } else {
          localStorage.removeItem('mv_credentials');
        }

        localStorage.setItem('mv_session', JSON.stringify({
          token: window.AppState.authToken,
          apiBaseUrl: window.AppState.apiBaseUrl,
          displayName: data.email ? data.email.split('@')[0] : 'Editor'
        }));

        await afterLogin(data.email ? data.email.split('@')[0] : 'Editor');
      } catch (err) {
        showLoginError(err.message);
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Connect & Login';
      }
    });
  }

  const triggerLoginOnEnter = (e) => {
    if (e.key === 'Enter' && loginBtn) {
      loginBtn.click();
    }
  };
  if (loginEmail) loginEmail.addEventListener('keydown', triggerLoginOnEnter);
  if (loginPassword) loginPassword.addEventListener('keydown', triggerLoginOnEnter);

  if (dashboardLogoutBtn) {
    dashboardLogoutBtn.addEventListener('click', handleLogout);
  }

  if (backToProjectsBtn) {
    backToProjectsBtn.addEventListener('click', () => {
      const uploaderScreen = document.getElementById('uploader-screen');
      const projectsScreen = document.getElementById('projects-screen');
      const dropzone = document.getElementById('dropzone');

      if (uploaderScreen) uploaderScreen.classList.remove('active');
      if (projectsScreen) projectsScreen.classList.add('active');

      window.AppState.selectedFolderPaths = [];
      window.AppState.currentUploadedPhotosList = [];
      window.AppState.currentStorageSummary = null;
      if (dropzone) dropzone.style.display = 'flex';

      // Refresh projects grid to reflect any physical storage / orphan updates
      loadProjects();
    });
  }

  const manualVerifyBtn = document.getElementById('btn-manual-verify-health');
  if (manualVerifyBtn) {
    manualVerifyBtn.addEventListener('click', async () => {
      if (!window.AppState.currentGalleryId || !window.AppState.authToken) return;
      manualVerifyBtn.disabled = true;
      manualVerifyBtn.textContent = 'Checking...';
      try {
        const res = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${window.AppState.currentGalleryId}/integrity-check`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${window.AppState.authToken}`
          },
          body: JSON.stringify({ photoIds: [] })
        });
        if (res.ok) {
          const data = await res.json();
          const qdrantStatus = data.qdrantMode === 'connected' ? 'Live (Connected)' : 'Mock Mode (Local Offline Cache)';
          
          const photosScanned = data.registered - data.facesUnscanned;
          const cloudUploaded = data.registered - data.localUrlsFound;
          const exifLinked = data.registered - (data.exifMissing || 0);

          let tabText = '';
          if (data.tabCounts && data.tabCounts.length > 0) {
            tabText = '\n\n📂 Category Tabs Breakdown:\n' +
              data.tabCounts.map(t => `  • ${t.tabName}: ${t.count}`).join('\n');
          }

          let vectorText = '';
          if (data.vectorCount !== undefined) {
            vectorText = `\n  • Indexed Face Vectors: ${data.vectorCount.toLocaleString()}`;
          }

          let warning = '';
          if (data.qdrantWarning) {
            warning = `\n\n⚠️ Warning: ${data.qdrantWarning}`;
          }

          await showModal({
            icon: '🔍',
            title: 'Event Health Report',
            sub: `Total Photos Expected: ${data.expected}\nRegistered in DB: ${data.registered}\n\n` +
                 `• Cloud Storage Linked: ${cloudUploaded} / ${data.registered}\n` +
                 `• Camera EXIF Metadata: ${exifLinked} / ${data.registered}\n` +
                 `• Scanned for Faces: ${photosScanned} / ${data.registered} (Pending: ${data.facesUnscanned})\n\n` +
                 `Qdrant Vector Database: ${qdrantStatus}${vectorText}${tabText}${warning}`,
            confirmText: 'OK'
          });
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        console.error('Manual health check failed:', err);
        await showModal({
          icon: '❌',
          title: 'Health Check Failed',
          sub: err.message,
          confirmText: 'OK',
          danger: true
        });
      } finally {
        manualVerifyBtn.disabled = false;
        manualVerifyBtn.textContent = '🔍 Verify Health';
      }
    });
  }

  const manualResetBtn = document.getElementById('btn-manual-reset-scan');
  if (manualResetBtn) {
    manualResetBtn.addEventListener('click', async () => {
      if (!window.AppState.currentGalleryId || !window.AppState.authToken) return;
      
      const typedConfirmation = await showModal({
        icon: '⚠️',
        title: 'Wipe & Rescan Event',
        sub: 'This will clear all face recognition data for this event on the server and trigger a fresh scan. Your photos and thumbnails will remain safe.\n\nPlease type "wipe" below to confirm.',
        inputPlaceholder: 'Type "wipe" to confirm',
        confirmText: 'Wipe & Rescan',
        danger: true
      });
      if (!typedConfirmation || typedConfirmation.toLowerCase() !== 'wipe') {
        if (typedConfirmation !== null) {
          await showModal({
            icon: '❌',
            title: 'Incorrect Confirmation',
            sub: 'You must type "wipe" to proceed. Operation cancelled.',
            confirmText: 'OK',
            danger: true
          });
        }
        return;
      }

      manualResetBtn.disabled = true;
      manualResetBtn.textContent = 'Wiping...';
      try {
        await window.api.stopBackfill();
        const res = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${window.AppState.currentGalleryId}/reset-face-scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${window.AppState.authToken}`
          },
          body: JSON.stringify({})
        });
        if (res.ok) {
          const data = await res.json();
          await showModal({
            icon: '✅',
            title: 'Wipe Successful',
            sub: `Wiped face signatures for ${data.resetCount} photos. Fresh background scanning started.`,
            confirmText: 'Done'
          });
          await loadProjects();
          triggerBackfillCheck();
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        console.error('Wipe failed:', err);
        await showModal({
          icon: '❌',
          title: 'Wipe Failed',
          sub: err.message,
          confirmText: 'OK',
          danger: true
        });
      } finally {
        manualResetBtn.disabled = false;
        manualResetBtn.textContent = '⚠️ Wipe & Rescan';
      }
    });
  }

  const manualInspectOrphansBtn = document.getElementById('btn-manual-inspect-orphans');
  if (manualInspectOrphansBtn) {
    manualInspectOrphansBtn.addEventListener('click', () => {
      openOrphanInspectionModal(window.AppState.currentGalleryId);
    });
  }

  const sidebarInspectOrphansBtn = document.getElementById('btn-inspect-orphans-sidebar');
  if (sidebarInspectOrphansBtn) {
    sidebarInspectOrphansBtn.addEventListener('click', () => {
      openOrphanInspectionModal(window.AppState.currentGalleryId);
    });
  }
}

function showLoginError(msg) {
  const loginError = document.getElementById('login-error');
  if (loginError) {
    loginError.textContent = msg;
    loginError.style.display = 'block';
  }
}

function startHeartbeat() {
  if (window.AppState.heartbeatInterval) clearInterval(window.AppState.heartbeatInterval);
  window.AppState.heartbeatInterval = setInterval(async () => {
    if (!window.AppState.authToken) return;
    try {
      const res = await fetch(`${window.AppState.apiBaseUrl}/api/auth/heartbeat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${window.AppState.authToken}` }
      });
      if (!res.ok) {
        clearInterval(window.AppState.heartbeatInterval);
        window.AppState.heartbeatInterval = null;
        handleLogout();
      }
    } catch {
      // Network error — ignore
    }
  }, 60 * 1000);
}

async function afterLogin(displayName) {
  const loginScreen = document.getElementById('login-screen');
  const projectsScreen = document.getElementById('projects-screen');
  const connectedUser = document.getElementById('connected-user');

  await loadProjects();
  if (connectedUser) connectedUser.textContent = displayName;
  if (loginScreen) loginScreen.classList.remove('active');
  startHeartbeat();

  if (window.AppState.pendingEventSlug) {
    const matched = window.AppState.projects.find(p => p.slug === window.AppState.pendingEventSlug);
    if (matched) {
      openProjectUploader(matched.id);
      window.AppState.pendingEventSlug = null;
      return;
    }
  }

  if (projectsScreen) projectsScreen.classList.add('active');
}

function handleLogout() {
  const loginScreen = document.getElementById('login-screen');
  const projectsScreen = document.getElementById('projects-screen');
  const uploaderScreen = document.getElementById('uploader-screen');
  const dropzone = document.getElementById('dropzone');

  window.AppState.authToken = null;
  window.AppState.selectedFolderPaths = [];
  localStorage.removeItem('mv_session');

  if (window.AppState.heartbeatInterval) {
    clearInterval(window.AppState.heartbeatInterval);
    window.AppState.heartbeatInterval = null;
  }

  if (dropzone) dropzone.style.display = 'flex';

  if (uploaderScreen) uploaderScreen.classList.remove('active');
  if (projectsScreen) projectsScreen.classList.remove('active');
  if (loginScreen) loginScreen.classList.add('active');
}

async function restoreSession() {
  const loginScreen = document.getElementById('login-screen');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  const loginUrl = document.getElementById('login-url');

  try {
    const creds = localStorage.getItem('mv_credentials');
    if (creds) {
      const { email, password, apiBaseUrl: savedUrl } = JSON.parse(creds);
      if (loginEmail) loginEmail.value = email || '';
      if (loginPassword) loginPassword.value = password || '';
      if (loginUrl && savedUrl) loginUrl.value = savedUrl;
      const rememberCb = document.getElementById('remember-me');
      if (rememberCb) rememberCb.checked = true;
    }
  } catch { /* ignore */ }

  try {
    const saved = localStorage.getItem('mv_session');
    if (!saved) {
      if (loginScreen) loginScreen.classList.add('active');
      return;
    }

    const { token, apiBaseUrl: savedUrl, displayName } = JSON.parse(saved);
    if (!token || !savedUrl) {
      if (loginScreen) loginScreen.classList.add('active');
      return;
    }

    window.AppState.apiBaseUrl = savedUrl;
    if (loginUrl) loginUrl.value = savedUrl;
    const res = await fetch(`${savedUrl}/api/auth/heartbeat`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      localStorage.removeItem('mv_session');
      if (loginScreen) loginScreen.classList.add('active');
      return;
    }

    window.AppState.authToken = token;
    await afterLogin(displayName || 'Editor');
  } catch {
    localStorage.removeItem('mv_session');
    if (loginScreen) loginScreen.classList.add('active');
  }
}

async function loadProjects() {
  const projectSelect = document.getElementById('project-select');
  try {
    const res = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events`, {
      headers: { 'Authorization': `Bearer ${window.AppState.authToken}` }
    });
    
    if (res.ok) {
      const data = await res.json();
      window.AppState.projects = data.events || data;
      
      if (projectSelect) {
        projectSelect.innerHTML = '';
        window.AppState.projects.forEach(p => {
          const option = document.createElement('option');
          option.value = p.id;
          option.dataset.slug = p.slug;
          option.dataset.uuid = p.projectUuid;
          option.textContent = p.title;
          projectSelect.appendChild(option);
        });
      }

      renderProjectsGrid();
      triggerGlobalBackfillCheck();

      if (window.AppState.pendingEventSlug) {
        const matched = window.AppState.projects.find(p => p.slug === window.AppState.pendingEventSlug);
        if (matched) {
          openProjectUploader(matched.id);
          window.AppState.pendingEventSlug = null;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

function renderProjectsGrid() {
  const projectsList = document.getElementById('projects-list');
  if (!projectsList) return;

  projectsList.innerHTML = '';
  if (window.AppState.projects.length === 0) {
    projectsList.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; font-style: italic;">No active projects found.</div>';
    return;
  }

  window.AppState.projects.forEach(p => {
    const card = document.createElement('div');
    card.className = 'project-card';
    
    const formattedDate = p.date && !p.date.startsWith('2099')
      ? new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Dates TBD';

    const coverUrl = p.coverPhotoUrl
      ? (p.coverPhotoUrl.startsWith('/') ? `${window.AppState.apiBaseUrl}${p.coverPhotoUrl}` : p.coverPhotoUrl)
      : null;

    const phys = (window.AppState.projectPhysicalStorage && window.AppState.projectPhysicalStorage[p.id]) || null;
    let sizeDisplay = p.totalBytes ? window.formatBytes(phys ? phys.totalR2Bytes : p.totalBytes) : '';
    let orphanBadgeHtml = '';
    if (phys && phys.orphanBytes > 0) {
      orphanBadgeHtml = ` <span style="color: #f87171; font-weight: 700; font-size: 9px;" title="Orphan storage leak">+${window.formatBytes(phys.orphanBytes)} orphan</span>`;
    }

    card.innerHTML = `
      ${coverUrl
        ? `<img class="project-card-cover" src="${coverUrl}" alt="${p.title}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="project-card-cover-placeholder" style="display:none">📷</div>`
        : `<div class="project-card-cover-placeholder">📷</div>`
      }
      ${p.galleryFacesComplete === false
        ? `<div class="unscanned-badge" style="position: absolute; top: 12px; right: 12px; background: #ef4444; color: #fff; font-size: 9px; font-weight: bold; padding: 3px 7px; border-radius: 10px; z-index: 2; box-shadow: 0 2px 4px rgba(239,68,68,0.4);">Pending Backfill</div>`
        : ''
      }
      <div class="project-card-body">
        <div class="project-card-header" style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">
          <span class="project-card-title">${p.title}</span>
          ${sizeDisplay ? `<span style="font-size: 10px; color: var(--text-muted); font-weight: 600; white-space: nowrap;">💾 ${sizeDisplay}${orphanBadgeHtml}</span>` : ''}
        </div>
        <div class="project-card-footer">
          <span class="project-card-date">${formattedDate}${p.photoCount ? ` • ${p.photoCount.toLocaleString()} items` : ''}</span>
          <span class="project-card-arrow">→</span>
        </div>
      </div>
    `;
    
    card.addEventListener('click', () => {
      openProjectUploader(p.id);
    });
    
    projectsList.appendChild(card);
  });
}

function renderProjectStorageWidget(summary) {
  const widget = document.getElementById('project-storage-widget');
  const totalPill = document.getElementById('storage-total-pill');
  const photosVal = document.getElementById('storage-photos-val');
  const cinemaVal = document.getElementById('storage-cinema-val');
  const orphanContainer = document.getElementById('storage-orphan-container');
  const orphanPill = document.getElementById('storage-orphan-pill');

  if (!widget) return;
  if (!summary) {
    widget.style.display = 'none';
    return;
  }

  widget.style.display = 'block';

  if (summary.calculating) {
    if (totalPill) totalPill.textContent = 'Calculating...';
    if (photosVal) photosVal.textContent = 'Calculating...';
    if (cinemaVal) cinemaVal.textContent = 'Calculating...';
    if (orphanContainer) orphanContainer.style.display = 'none';
    return;
  }

  // If physical R2 metrics are available, display true bucket total
  if (summary.physicalR2 && summary.physicalR2.totalR2Bytes !== undefined) {
    if (totalPill) totalPill.textContent = `${window.formatBytes(summary.physicalR2.totalR2Bytes)} (${(summary.physicalR2.totalR2Objects || 0).toLocaleString()})`;
  } else {
    if (totalPill) totalPill.textContent = `${window.formatBytes(summary.totalGalleryBytes)} (${(summary.totalGalleryCount || 0).toLocaleString()})`;
  }

  if (photosVal) photosVal.textContent = `${window.formatBytes(summary.allPhotosBytes)} • ${(summary.allPhotosCount || 0).toLocaleString()} photos`;
  if (cinemaVal) cinemaVal.textContent = `${window.formatBytes(summary.cinemaBytes || summary.allVideosBytes)} • ${(summary.cinemaCount || summary.allVideosCount || 0).toLocaleString()} films`;

  // Orphan storage warning indicator
  const orphanBytes = summary.physicalR2?.orphanBytes || 0;
  const orphanCount = summary.physicalR2?.orphanObjects || 0;
  if (orphanContainer && orphanPill) {
    if (orphanBytes > 0 || orphanCount > 0) {
      orphanPill.textContent = `${window.formatBytes(orphanBytes)} (${orphanCount})`;
      orphanContainer.style.display = 'block';
    } else {
      orphanContainer.style.display = 'none';
    }
  }
}

let currentOrphansData = null;
let selectedOrphanKeys = new Set();

async function openOrphanInspectionModal(eventId) {
  const modal = document.getElementById('orphan-inspection-modal');
  if (!modal) return;

  const targetEventId = eventId || window.AppState.currentGalleryId;
  if (!targetEventId) return;

  modal.style.display = 'flex';
  modal.classList.add('open');

  const closeBtn = document.getElementById('orphan-modal-close-btn');
  const refreshBtn = document.getElementById('orphan-refresh-btn');
  const purgeBtn = document.getElementById('orphan-purge-btn');
  const adoptBtn = document.getElementById('orphan-adopt-btn');
  const adoptTabSelect = document.getElementById('orphan-adopt-tab-select');
  const selectAllCheckbox = document.getElementById('orphan-select-all');

  const kpiTotalBytes = document.getElementById('orphan-kpi-total-bytes');
  const kpiTotalCount = document.getElementById('orphan-kpi-total-count');
  const kpiActiveBytes = document.getElementById('orphan-kpi-active-bytes');
  const kpiActiveCount = document.getElementById('orphan-kpi-active-count');
  const kpiOrphanBytes = document.getElementById('orphan-kpi-orphan-bytes');
  const kpiOrphanCount = document.getElementById('orphan-kpi-orphan-count');
  const reasonsBar = document.getElementById('orphan-reasons-bar');
  const tableBody = document.getElementById('orphan-table-body');
  const summaryEl = document.getElementById('orphan-selected-summary');

  // Populate rescue tabs dropdown
  if (adoptTabSelect) {
    adoptTabSelect.innerHTML = '';
    const tabs = window.AppState.currentStorageSummary?.tabs || [];
    tabs.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.tabName;
      opt.textContent = `Rescue to: ${t.tabName}`;
      adoptTabSelect.appendChild(opt);
    });
    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'Uncategorized';
    defaultOpt.textContent = 'Rescue to: Uncategorized';
    if (!tabs.some(t => (t.tabName || '').toLowerCase() === 'uncategorized')) {
      adoptTabSelect.appendChild(defaultOpt);
    }
  }

  const cleanup = () => {
    modal.style.display = 'none';
    modal.classList.remove('open');
  };

  if (closeBtn) closeBtn.onclick = cleanup;
  modal.onclick = (e) => { if (e.target === modal) cleanup(); };

  async function loadAndRender(forceRefresh = false) {
    if (kpiTotalBytes) kpiTotalBytes.textContent = 'Scanning...';
    if (kpiActiveBytes) kpiActiveBytes.textContent = 'Scanning...';
    if (kpiOrphanBytes) kpiOrphanBytes.textContent = 'Scanning...';
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">Scanning physical Cloudflare R2 bucket...</td></tr>';

    try {
      const url = `${window.AppState.apiBaseUrl}/api/gallery/events/${targetEventId}/r2-orphans${forceRefresh ? '?refresh=true' : ''}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${window.AppState.authToken}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      currentOrphansData = data;
      selectedOrphanKeys = new Set((data.orphans || []).map(o => o.key));

      // Update KPIs
      if (kpiTotalBytes) kpiTotalBytes.textContent = window.formatBytes(data.totalR2Bytes || 0);
      if (kpiTotalCount) kpiTotalCount.textContent = `${(data.totalR2Objects || 0).toLocaleString()} objects`;
      if (kpiActiveBytes) kpiActiveBytes.textContent = window.formatBytes(data.activeBytes || 0);
      if (kpiActiveCount) kpiActiveCount.textContent = `${(data.activeObjects || 0).toLocaleString()} active files`;
      if (kpiOrphanBytes) kpiOrphanBytes.textContent = window.formatBytes(data.orphanBytes || 0);
      if (kpiOrphanCount) kpiOrphanCount.textContent = `${(data.orphanObjects || 0).toLocaleString()} unlinked files`;

      // Render Reason Filter Tags
      if (reasonsBar) {
        reasonsBar.innerHTML = '';
        const reasons = data.reasonsSummary || {};
        Object.entries(reasons).forEach(([rCode, rData]) => {
          if (!rData || rData.count === 0) return;
          const tag = document.createElement('div');
          tag.style.cssText = 'font-size: 10px; padding: 3px 8px; border-radius: 6px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #cbd5e1;';
          tag.innerHTML = `<strong>${rData.label}:</strong> ${rData.count} (${window.formatBytes(rData.bytes)})`;
          reasonsBar.appendChild(tag);
        });
      }

      renderTable();
    } catch (err) {
      console.error('Failed to load R2 orphans:', err);
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: #f87171;">Failed to inspect R2 storage: ${err.message}</td></tr>`;
    }
  }

  function renderTable() {
    if (!tableBody || !currentOrphansData) return;
    const orphans = currentOrphansData.orphans || [];

    if (orphans.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 36px 12px; color: #34d399;">
            <div style="font-size: 24px; margin-bottom: 6px;">✨</div>
            <div style="font-weight: 700; font-size: 13px;">No Orphaned Files Detected!</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">100% of physical Cloudflare R2 assets are actively referenced in your gallery database.</div>
          </td>
        </tr>
      `;
      if (purgeBtn) purgeBtn.disabled = true;
      if (adoptBtn) adoptBtn.disabled = true;
      if (summaryEl) summaryEl.textContent = '0 files selected';
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      return;
    }

    if (purgeBtn) purgeBtn.disabled = selectedOrphanKeys.size === 0;
    if (adoptBtn) adoptBtn.disabled = selectedOrphanKeys.size === 0;
    if (selectAllCheckbox) selectAllCheckbox.checked = selectedOrphanKeys.size === orphans.length;

    let selectedBytes = 0;
    orphans.forEach(o => {
      if (selectedOrphanKeys.has(o.key)) selectedBytes += o.size;
    });
    if (summaryEl) summaryEl.textContent = `${selectedOrphanKeys.size} of ${orphans.length} files selected (${window.formatBytes(selectedBytes)})`;

    tableBody.innerHTML = '';
    orphans.forEach(orphan => {
      const tr = document.createElement('tr');
      tr.style.cssText = 'border-bottom: 1px solid rgba(255,255,255,0.04);';
      const isChecked = selectedOrphanKeys.has(orphan.key);

      let reasonBadgeColor = '#94a3b8';
      let reasonBadgeBg = 'rgba(255,255,255,0.06)';
      if (orphan.reason === 'REPLACED_ASSET') {
        reasonBadgeColor = '#fbbf24';
        reasonBadgeBg = 'rgba(245, 158, 11, 0.15)';
      } else if (orphan.reason === 'ABORTED_UPLOAD') {
        reasonBadgeColor = '#f87171';
        reasonBadgeBg = 'rgba(239, 68, 68, 0.15)';
      } else if (orphan.reason === 'DANGLING_THUMBNAIL') {
        reasonBadgeColor = '#a78bfa';
        reasonBadgeBg = 'rgba(167, 139, 250, 0.15)';
      }

      const previewThumbHtml = orphan.isImage
        ? `<div style="width: 44px; height: 44px; border-radius: 6px; overflow: hidden; background: #000; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; cursor: pointer;">
             <img src="${orphan.url}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.parentElement.innerHTML='🖼️';" />
           </div>`
        : (orphan.isVideo
            ? `<div style="width: 44px; height: 44px; border-radius: 6px; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px;">🎬</div>`
            : `<div style="width: 44px; height: 44px; border-radius: 6px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; font-size: 16px;">📄</div>`
          );

      tr.innerHTML = `
        <td style="padding: 8px 10px;">
          <input type="checkbox" class="orphan-item-cb" data-key="${orphan.key}" ${isChecked ? 'checked' : ''} style="accent-color: var(--primary); cursor: pointer;">
        </td>
        <td style="padding: 6px 10px;">
          ${previewThumbHtml}
        </td>
        <td style="padding: 8px 10px; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${orphan.key}">
          <div style="color: #fff; font-weight: 500;">${orphan.filename}</div>
          <div style="font-size: 9px; color: var(--text-muted);">${orphan.key}</div>
        </td>
        <td style="padding: 8px 10px;">
          <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; font-weight: 600; color: ${reasonBadgeColor}; background: ${reasonBadgeBg};" title="${orphan.reasonDescription || ''}">
            ${orphan.reasonLabel || orphan.reason}
          </span>
        </td>
        <td style="padding: 8px 10px; text-align: right; color: #cbd5e1; font-weight: 500; white-space: nowrap;">
          ${window.formatBytes(orphan.size)}
        </td>
        <td style="padding: 8px 10px; text-align: right; color: var(--text-muted); white-space: nowrap;">
          ${orphan.ageHours > 24 ? Math.round(orphan.ageHours / 24) + 'd ago' : orphan.ageHours + 'h ago'}
        </td>
      `;

      const cb = tr.querySelector('.orphan-item-cb');
      if (cb) {
        cb.onchange = () => {
          if (cb.checked) {
            selectedOrphanKeys.add(orphan.key);
          } else {
            selectedOrphanKeys.delete(orphan.key);
          }
          renderTable();
        };
      }

      tableBody.appendChild(tr);
    });
  }

  if (selectAllCheckbox) {
    selectAllCheckbox.onchange = () => {
      const orphans = currentOrphansData?.orphans || [];
      if (selectAllCheckbox.checked) {
        orphans.forEach(o => selectedOrphanKeys.add(o.key));
      } else {
        selectedOrphanKeys.clear();
      }
      renderTable();
    };
  }

  if (refreshBtn) {
    refreshBtn.onclick = () => loadAndRender(true);
  }

  if (adoptBtn) {
    adoptBtn.onclick = async () => {
      if (selectedOrphanKeys.size === 0) return;
      const count = selectedOrphanKeys.size;
      const targetTab = adoptTabSelect ? adoptTabSelect.value : 'Uncategorized';

      const confirmed = await showModal({
        icon: '📥',
        title: `Rescue ${count} Photo(s)?`,
        sub: `This will register ${count} photo(s) from Cloudflare R2 into tab "${targetTab}" without re-uploading.\n\nThey will immediately appear on MyCircle and the web gallery!`,
        confirmText: `Rescue ${count} Photo(s)`
      });

      if (!confirmed) return;

      adoptBtn.disabled = true;
      adoptBtn.textContent = 'Rescuing...';

      try {
        const res = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${targetEventId}/r2-orphans/adopt`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${window.AppState.authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            keys: Array.from(selectedOrphanKeys),
            tabName: targetTab
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        // Refresh storage summary in sidebar
        const summaryRes = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${targetEventId}/storage-summary?scanR2=true`, {
          headers: { 'Authorization': `Bearer ${window.AppState.authToken}` }
        });
        if (summaryRes.ok) {
          const sumData = await summaryRes.json();
          window.AppState.currentStorageSummary = sumData;
          renderProjectStorageWidget(sumData);
        }

        await showModal({
          icon: '✅',
          title: 'Photos Rescued',
          sub: result.message || `Successfully rescued ${result.adoptedCount} photos into "${targetTab}".`,
          confirmText: 'Done'
        });

        // Re-scan modal view
        loadAndRender(true);
      } catch (err) {
        console.error('Failed to rescue orphans:', err);
        await showModal({
          icon: '❌',
          title: 'Rescue Failed',
          sub: 'Failed to rescue photos: ' + err.message,
          confirmText: 'OK',
          danger: true
        });
      } finally {
        if (adoptBtn) {
          adoptBtn.disabled = false;
          adoptBtn.textContent = '📥 Rescue into Gallery';
        }
      }
    };
  }

  if (purgeBtn) {
    purgeBtn.onclick = async () => {
      if (selectedOrphanKeys.size === 0) return;
      const count = selectedOrphanKeys.size;
      let totalBytesToPurge = 0;
      (currentOrphansData?.orphans || []).forEach(o => {
        if (selectedOrphanKeys.has(o.key)) totalBytesToPurge += o.size;
      });

      const confirmed = await showModal({
        icon: '🧹',
        title: 'Purge Orphaned Assets?',
        sub: `This will permanently delete ${count} orphaned file(s) (${window.formatBytes(totalBytesToPurge)}) from Cloudflare R2 storage.\n\nActive photos and films in your gallery will NOT be touched.`,
        confirmText: `Purge ${count} File(s)`,
        danger: true
      });

      if (!confirmed) return;

      purgeBtn.disabled = true;
      purgeBtn.textContent = 'Purging...';

      try {
        const res = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${targetEventId}/r2-orphans/cleanup`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${window.AppState.authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ keys: Array.from(selectedOrphanKeys) })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        // Refresh storage summary in sidebar
        const summaryRes = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${targetEventId}/storage-summary?scanR2=true`, {
          headers: { 'Authorization': `Bearer ${window.AppState.authToken}` }
        });
        if (summaryRes.ok) {
          const sumData = await summaryRes.json();
          window.AppState.currentStorageSummary = sumData;
          renderProjectStorageWidget(sumData);
        }

        await showModal({
          icon: '✅',
          title: 'Orphan Purge Complete',
          sub: result.message || `Successfully purged ${result.deletedCount} orphaned files.`,
          confirmText: 'Done'
        });

        // Re-scan modal view
        loadAndRender(true);
      } catch (err) {
        console.error('Failed to purge orphans:', err);
        await showModal({
          icon: '❌',
          title: 'Purge Failed',
          sub: 'Failed to purge orphaned assets: ' + err.message,
          confirmText: 'OK',
          danger: true
        });
      } finally {
        if (purgeBtn) {
          purgeBtn.disabled = false;
          purgeBtn.textContent = '🧹 Purge Selected Orphans';
        }
      }
    };
  }

  loadAndRender();
}

window.updateTabSizeBadge = function(selectedTabVal) {
  const sizeBadge = document.getElementById('uploaded-tab-size-label');
  if (!sizeBadge) return;
  const summary = window.AppState.currentStorageSummary;
  if (!summary) {
    sizeBadge.style.display = 'none';
    return;
  }

  const rawVal = (selectedTabVal || '').trim();
  const isAll = !rawVal || rawVal.toUpperCase() === 'ALL';
  const isCinema = rawVal.toUpperCase() === 'CINEMA';

  if (isAll) {
    sizeBadge.textContent = `💾 ${window.formatBytes(summary.totalGalleryBytes)} on R2`;
    sizeBadge.style.display = 'inline-block';
  } else if (isCinema) {
    const cinBytes = summary.cinemaBytes || summary.allVideosBytes || 0;
    sizeBadge.textContent = `💾 ${window.formatBytes(cinBytes)} on R2`;
    sizeBadge.style.display = 'inline-block';
  } else {
    const tabStat = (summary.tabs || []).find(t => (t.tabName || '').trim().toLowerCase() === rawVal.toLowerCase());
    if (tabStat) {
      sizeBadge.textContent = `💾 ${window.formatBytes(tabStat.totalBytes)} on R2`;
      sizeBadge.style.display = 'inline-block';
    } else {
      sizeBadge.style.display = 'none';
    }
  }
};

async function openProjectUploader(projectId) {
  const projectSelect = document.getElementById('project-select');
  const projectNameDisplay = document.getElementById('project-name-display');
  const tabSelect = document.getElementById('tab-select');
  const mainPanelTitle = document.getElementById('main-panel-title');
  const toggleUploadedViewBtn = document.getElementById('toggle-uploaded-view-btn');
  const uploadedPhotosCard = document.getElementById('uploaded-photos-card');
  const uploadedPhotosGrid = document.getElementById('uploaded-photos-grid');
  const projectsScreen = document.getElementById('projects-screen');
  const loginScreen = document.getElementById('login-screen');
  const uploaderScreen = document.getElementById('uploader-screen');

  const matchedProject = window.AppState.projects.find(p => p.id === projectId || p.id === parseInt(projectId, 10));
  const gallerySlug = matchedProject ? matchedProject.slug : '';
  const projectTitle = matchedProject ? matchedProject.title : '';

  window.AppState.currentGalleryId = projectId;
  window.AppState.currentGallerySlug = gallerySlug;
  window.AppState.currentGalleryTitle = projectTitle;

  window.AppState.currentUploadedPhotosList = [];
  window.AppState.uploadedPhotosCache = {};
  window.AppState.currentStorageSummary = null;
  renderProjectStorageWidget({ calculating: true });

  if (projectSelect) projectSelect.value = projectId;
  if (projectNameDisplay) projectNameDisplay.textContent = projectTitle || '—';
  
  updateProjectScanStatusDisplay(matchedProject);

  if (tabSelect) {
    tabSelect.innerHTML = '<option value="ALL" selected>All Photos (Show All)</option>';
    tabSelect.value = 'ALL';
  }

  updateCoverPreviews(matchedProject);

  window.AppState.currentUploaderView = 'upload';
  if (mainPanelTitle) mainPanelTitle.textContent = 'Upload Photos';
  if (toggleUploadedViewBtn) toggleUploadedViewBtn.textContent = 'View Uploaded Photos';
  if (uploadedPhotosCard) uploadedPhotosCard.style.display = 'none';
  if (uploadedPhotosGrid) uploadedPhotosGrid.innerHTML = '';

  if (projectsScreen) projectsScreen.classList.remove('active');
  if (loginScreen) loginScreen.classList.remove('active');
  if (uploaderScreen) uploaderScreen.classList.add('active');

  const fetchPromises = [];

  if (gallerySlug) {
    fetchPromises.push(
      fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${encodeURIComponent(gallerySlug)}/project-events`, {
        headers: { 'Authorization': `Bearer ${window.AppState.authToken}` }
      }).then(r => r.ok ? r.json() : null).catch(() => null)
    );
  } else {
    fetchPromises.push(Promise.resolve(null));
  }

  fetchPromises.push(
    fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${projectId}/tabs`, {
      headers: { 'Authorization': `Bearer ${window.AppState.authToken}` }
    }).then(r => r.ok ? r.json() : null).catch(() => null)
  );

  fetchPromises.push(
    fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${projectId}/storage-summary?scanR2=true`, {
      headers: { 'Authorization': `Bearer ${window.AppState.authToken}` }
    }).then(r => r.ok ? r.json() : null).catch(() => null)
  );

  const [projectEventsData, tabsData, storageSummaryData] = await Promise.all(fetchPromises);

  if (storageSummaryData) {
    window.AppState.currentStorageSummary = storageSummaryData;
    if (storageSummaryData.physicalR2) {
      if (!window.AppState.projectPhysicalStorage) window.AppState.projectPhysicalStorage = {};
      window.AppState.projectPhysicalStorage[projectId] = storageSummaryData.physicalR2;
    }
    renderProjectStorageWidget(storageSummaryData);
  } else {
    renderProjectStorageWidget(null);
  }

  const findTabSizeLabel = (tName) => {
    if (!storageSummaryData || !storageSummaryData.tabs) return '';
    const st = storageSummaryData.tabs.find(t => (t.tabName || '').trim().toLowerCase() === tName.trim().toLowerCase());
    return st ? ` — ${window.formatBytes(st.totalBytes)} (${st.count})` : '';
  };

  if (tabSelect) {
    const allTotalBytes = storageSummaryData?.totalGalleryBytes ? ` — ${window.formatBytes(storageSummaryData.totalGalleryBytes)} (${storageSummaryData.totalGalleryCount})` : '';
    tabSelect.innerHTML = `<option value="ALL" selected>All Photos (Show All)${allTotalBytes}</option>`;

    if (projectEventsData) {
      (projectEventsData.projectEvents || []).forEach(e => {
        const option = document.createElement('option');
        option.value = e.event_type;
        option.textContent = `${e.event_type}${findTabSizeLabel(e.event_type)}`;
        tabSelect.appendChild(option);
      });
    }

    if (tabsData) {
      (tabsData.tabs || []).forEach(tab => {
        if (!Array.from(tabSelect.options).some(opt => opt.value === tab)) {
          const option = document.createElement('option');
          option.value = tab;
          option.textContent = `${tab}${findTabSizeLabel(tab)}`;
          tabSelect.appendChild(option);
        }
      });
    }

    window.updateTabSizeBadge(tabSelect.value);
  }

  triggerBackfillCheck();
}

function updateProjectScanStatusDisplay(project) {
  const projectScanStatusBadge = document.getElementById('project-scan-status-badge');
  const matched = project || window.AppState.projects.find(p => p.id === window.AppState.currentGalleryId);
  if (!matched || !projectScanStatusBadge) return;

  projectScanStatusBadge.innerHTML = '';
  const isScanningCurrent = window.AppState.activeBackfillStatus.eventId === matched.id;

  if (isScanningCurrent && (window.AppState.activeBackfillStatus.status === 'processing' || window.AppState.activeBackfillStatus.status === 'progress')) {
    const pct = window.AppState.activeBackfillStatus.total > 0 ? Math.round((window.AppState.activeBackfillStatus.index / window.AppState.activeBackfillStatus.total) * 100) : 0;
    const failBadge = window.AppState.activeBackfillStatus.scanFailures > 0
      ? `<span style="color:#f97316;margin-left:6px;">⚠ ${window.AppState.activeBackfillStatus.scanFailures} scan error${window.AppState.activeBackfillStatus.scanFailures > 1 ? 's' : ''}</span>`
      : '';
    const isPaused = window.AppState.activeBackfillStatus.isPaused;
    const pauseBtnLabel = isPaused ? '▶ Resume' : '⏸ Pause';
    const pauseBtnColor = isPaused ? '#34d399' : '#facc15';

    projectScanStatusBadge.innerHTML = `
      <div style="display: inline-flex; flex-direction: column; gap: 4px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); padding: 6px 10px; border-radius: 8px; font-size: 10px; font-weight: bold; color: #60a5fa; width: 100%;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="pulse-indicator" style="width: 6px; height: 6px; background: ${isPaused ? '#facc15' : '#3b82f6'}; border-radius: 50%;"></span>
            <span>Scanning / Backfill: ${window.AppState.activeBackfillStatus.index}/${window.AppState.activeBackfillStatus.total} (${pct}%)</span>${failBadge}
          </div>
          <button id="btn-pause-backfill" class="btn" style="padding: 2px 6px; font-size: 9px; line-height: 1; background: rgba(255,255,255,0.05); border: 1px solid var(--surface-border); color: ${pauseBtnColor}; cursor: pointer;">
            ${pauseBtnLabel}
          </button>
        </div>
        <div style="font-size: 9px; color: var(--text-muted); font-weight: 500; padding-left: 12px; margin-top: 1px;">
          ${isPaused ? 'Paused' : `Active: ${window.AppState.activeBackfillPerf.activeDownloads} downloads | ${window.AppState.activeBackfillPerf.activeScans} scanners`}
        </div>
      </div>
    `;

    const pauseBtn = document.getElementById('btn-pause-backfill');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const nextState = !window.AppState.activeBackfillStatus.isPaused;
        await window.api.pauseBackfill(nextState);
      });
    }
  } else if (isScanningCurrent && window.AppState.activeBackfillStatus.status === 'starting') {
    projectScanStatusBadge.innerHTML = `
      <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(234, 179, 8, 0.1); border: 1px solid rgba(234, 179, 8, 0.2); padding: 4px 10px; border-radius: 8px; font-size: 10px; font-weight: bold; color: #facc15;">
        <span style="display: inline-block; animation: spin 1.5s linear infinite;">⏳</span>
        <span style="margin-left: 2px;">Initializing Backfill Engine...</span>
      </div>
    `;
  } else if (matched.galleryFacesComplete === false) {
    projectScanStatusBadge.innerHTML = `
      <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.2); padding: 4px 10px; border-radius: 8px; font-size: 10px; font-weight: bold; color: #fb7185;">
        <span>⚠️</span>
        <span>Pending Backfill</span>
      </div>
    `;
  } else {
    projectScanStatusBadge.innerHTML = `
      <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); padding: 4px 10px; border-radius: 8px; font-size: 10px; font-weight: bold; color: #34d399;">
        <span>✓</span>
        <span>Scan & Thumbs Complete</span>
      </div>
    `;
  }
}
