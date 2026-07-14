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
      if (dropzone) dropzone.style.display = 'flex';
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
          const thumbnailsLinked = data.registered - data.thumbnailMissing;
          const cloudUploaded = data.registered - data.localUrlsFound;

          let warning = '';
          if (data.qdrantWarning) {
            warning = `\n\n⚠️ Warning: ${data.qdrantWarning}`;
          }

          await showModal({
            icon: '🔍',
            title: 'Event Health Report',
            sub: `Total Photos Expected: ${data.expected}\nRegistered in DB: ${data.registered}\n\n` +
                 `• Cloud Storage Linked: ${cloudUploaded} / ${data.registered}\n` +
                 `• Thumbnails Uploaded: ${thumbnailsLinked} / ${data.registered}\n` +
                 `• Scanned for Faces: ${photosScanned} / ${data.registered} (Pending: ${data.facesUnscanned})\n\n` +
                 `Qdrant Database: ${qdrantStatus}${warning}`,
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

    card.innerHTML = `
      ${coverUrl
        ? `<img class="project-card-cover" src="${coverUrl}" alt="${p.title}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="project-card-cover-placeholder" style="display:none">📷</div>`
        : `<div class="project-card-cover-placeholder">📷</div>`
      }
      ${p.galleryFacesComplete === false
        ? `<div class="unscanned-badge" style="position: absolute; top: 12px; right: 12px; background: #ef4444; color: #fff; font-size: 9px; font-weight: bold; padding: 3px 7px; border-radius: 10px; z-index: 2; box-shadow: 0 2px 4px rgba(239,68,68,0.4);">Pending Face Scan</div>`
        : ''
      }
      <div class="project-card-body">
        <div class="project-card-header">
          <span class="project-card-title">${p.title}</span>
        </div>
        <div class="project-card-footer">
          <span class="project-card-date">${formattedDate}</span>
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

  window.AppState.currentUploadedPhotosList = [];
  window.AppState.uploadedPhotosCache = {};

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

  const [projectEventsData, tabsData] = await Promise.all(fetchPromises);

  if (projectEventsData && tabSelect) {
    (projectEventsData.projectEvents || []).forEach(e => {
      const option = document.createElement('option');
      option.value = e.event_type;
      option.textContent = e.event_type;
      tabSelect.appendChild(option);
    });
  }

  if (tabsData && tabSelect) {
    (tabsData.tabs || []).forEach(tab => {
      if (!Array.from(tabSelect.options).some(opt => opt.value === tab)) {
        const option = document.createElement('option');
        option.value = tab;
        option.textContent = tab;
        tabSelect.appendChild(option);
      }
    });
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
            <span>Scanning Faces: ${window.AppState.activeBackfillStatus.index}/${window.AppState.activeBackfillStatus.total} (${pct}%)</span>${failBadge}
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
        <span style="margin-left: 2px;">Initializing Face Scanner...</span>
      </div>
    `;
  } else if (matched.galleryFacesComplete === false) {
    projectScanStatusBadge.innerHTML = `
      <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.2); padding: 4px 10px; border-radius: 8px; font-size: 10px; font-weight: bold; color: #fb7185;">
        <span>⚠️</span>
        <span>Pending Face Scan</span>
      </div>
    `;
  } else {
    projectScanStatusBadge.innerHTML = `
      <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); padding: 4px 10px; border-radius: 8px; font-size: 10px; font-weight: bold; color: #34d399;">
        <span>✓</span>
        <span>Face Scan Complete</span>
      </div>
    `;
  }
}
