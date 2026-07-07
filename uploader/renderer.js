// State Management
let selectedFolderPaths = [];
let authToken = null;
let apiBaseUrl = 'http://localhost:3001';
let projects = [];
let pendingEventSlug = null;
let currentGallerySlug = null;
let currentGalleryId = null;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const projectsScreen = document.getElementById('projects-screen');
const uploaderScreen = document.getElementById('uploader-screen');

const loginBtn = document.getElementById('login-btn');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginUrl = document.getElementById('login-url');
const loginError = document.getElementById('login-error');

const projectSelect = document.getElementById('project-select');
const projectNameDisplay = document.getElementById('project-name-display');
const tabSelect = document.getElementById('tab-select');
const customTab = document.getElementById('custom-tab');
const dropzone = document.getElementById('dropzone');
const selectedFolderInfo = document.getElementById('selected-folder-info');
const folderPathDisplay = document.getElementById('folder-path-display');
const clearFolderBtn = document.getElementById('clear-folder-btn');
const startUploadBtn = document.getElementById('start-upload-btn');
const uploadStatusCard = document.getElementById('upload-status-card');
const statusMessage = document.getElementById('status-message');
const progressBar = document.getElementById('progress-bar');
const queueFilename = document.getElementById('queue-filename');
const queueRatio = document.getElementById('queue-ratio');
const connectedUser = document.getElementById('connected-user');

const projectsList = document.getElementById('projects-list');
const dashboardLogoutBtn = document.getElementById('dashboard-logout-btn');
const backToProjectsBtn = document.getElementById('back-to-projects-btn');

const addTabBtn = document.getElementById('add-tab-btn');
const renameTabBtn = document.getElementById('rename-tab-btn');
const deleteTabBtn = document.getElementById('delete-tab-btn');

const uploadQuality = document.getElementById('upload-quality');
const watermarkToggle = document.getElementById('watermark-toggle');

// Cover upload elements
const uploadHorizontalBtn = document.getElementById('upload-horizontal-btn');
const horizontalStatus = document.getElementById('horizontal-status');
const horizontalFileInput = document.getElementById('horizontal-file-input');
const horizontalPreviewImg = document.getElementById('horizontal-preview-img');
const horizontalPreviewContainer = document.getElementById('horizontal-preview-container');
const uploadVerticalBtn = document.getElementById('upload-vertical-btn');
const verticalStatus = document.getElementById('vertical-status');
const verticalFileInput = document.getElementById('vertical-file-input');
const verticalPreviewImg = document.getElementById('vertical-preview-img');
const verticalPreviewContainer = document.getElementById('vertical-preview-container');

// Uploaded photos elements
const uploadedPhotosCard = document.getElementById('uploaded-photos-card');
const uploadedPhotosGrid = document.getElementById('uploaded-photos-grid');
const uploadedCount = document.getElementById('uploaded-count');
const toggleUploadedViewBtn = document.getElementById('toggle-uploaded-view-btn');
const mainPanelTitle = document.getElementById('main-panel-title');
let currentUploaderView = 'upload'; // 'upload' or 'uploaded'

// Queue card elements
const uploadQueueCard = document.getElementById('upload-queue-card');
const queueHeaderTitle = document.getElementById('queue-header-title');
const queueHeaderSize = document.getElementById('queue-header-size');
const queueTotalProgress = document.getElementById('queue-total-progress');
const queueTotalStatus = document.getElementById('queue-total-status');
const queueItemsList = document.getElementById('queue-items-list');
const queueCompletedMsg = document.getElementById('queue-completed-msg');
const queueCancelBtn = document.getElementById('queue-cancel-btn');
const queueStartBtn = document.getElementById('queue-start-btn');

// In-memory queue state
let resolvedFiles = [];
let uploadCompletedState = false;

// --- 1. Login Handling ---
loginBtn.addEventListener('click', async () => {
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  apiBaseUrl = loginUrl.value.trim().replace(/\/$/, '');

  if (!email || !password) {
    showLoginError('Please enter email and password.');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Connecting...';
  loginError.style.display = 'none';

  try {
    const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Authentication failed');
    }

    const data = await res.json();
    authToken = data.token;

    // Persist session so user stays logged in across restarts
    localStorage.setItem('mv_session', JSON.stringify({
      token: authToken,
      apiBaseUrl,
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

// Shared post-login setup (used by both fresh login and session restore)
async function afterLogin(displayName) {
  await loadProjects();
  connectedUser.textContent = displayName;
  loginScreen.classList.remove('active');

  if (pendingEventSlug) {
    const matched = projects.find(p => p.slug === pendingEventSlug);
    if (matched) {
      openProjectUploader(matched.id);
      pendingEventSlug = null;
      return;
    }
  }

  projectsScreen.classList.add('active');
}

const triggerLoginOnEnter = (e) => {
  if (e.key === 'Enter') {
    loginBtn.click();
  }
};
loginEmail.addEventListener('keydown', triggerLoginOnEnter);
loginPassword.addEventListener('keydown', triggerLoginOnEnter);

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.style.display = 'block';
}

// --- 2. Load Gallery Events ---
async function loadProjects() {
  try {
    const res = await fetch(`${apiBaseUrl}/api/gallery/events`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (res.ok) {
      const data = await res.json();
      projects = data.events || data; // handle direct arrays or wrapped object responses
      console.log('[DEBUG] loadProjects raw response sample:', JSON.stringify(projects[0]));
      
      // Populate select dropdown
      projectSelect.innerHTML = '';
      projects.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.dataset.slug = p.slug;
        option.dataset.uuid = p.projectUuid;
        option.textContent = p.title;
        projectSelect.appendChild(option);
      });

      // Populate grid list
      renderProjectsGrid();

      if (pendingEventSlug) {
        const matched = projects.find(p => p.slug === pendingEventSlug);
        if (matched) {
          openProjectUploader(matched.id);
          pendingEventSlug = null;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

// --- 3. Render Grid list ---
function renderProjectsGrid() {
  projectsList.innerHTML = '';
  if (projects.length === 0) {
    projectsList.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; font-style: italic;">No active projects found.</div>';
    return;
  }

  projects.forEach(p => {
    const card = document.createElement('div');
    card.className = 'project-card';
    
    const formattedDate = p.date && !p.date.startsWith('2099')
      ? new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Dates TBD';

    card.innerHTML = `
      <div class="project-card-header">
        <span class="project-card-title">${p.title}</span>
        <span class="project-card-badge">Active</span>
      </div>
      <div class="project-card-footer">
        <span class="project-card-date">${formattedDate}</span>
        <span class="project-card-arrow">→</span>
      </div>
    `;
    
    card.addEventListener('click', () => {
      openProjectUploader(p.id);
    });
    
    projectsList.appendChild(card);
  });
}

function updateCoverPreviews(matchedProject) {
  const getAbsoluteUrl = (url) => {
    if (!url) return '';
    return url.startsWith('/') ? `${apiBaseUrl}${url}` : url;
  };

  const horizUrl = matchedProject ? matchedProject.coverPhotoUrl : null;
  const vertUrl = matchedProject ? matchedProject.coverPhotoMobileUrl : null;

  if (horizUrl) {
    horizontalPreviewImg.src = getAbsoluteUrl(horizUrl);
    horizontalPreviewContainer.style.display = 'block';
    uploadHorizontalBtn.style.display = 'none';
    horizontalStatus.style.display = 'none';
  } else {
    horizontalPreviewContainer.style.display = 'none';
    uploadHorizontalBtn.style.display = 'flex';
    horizontalStatus.style.display = 'none';
  }

  if (vertUrl) {
    verticalPreviewImg.src = getAbsoluteUrl(vertUrl);
    verticalPreviewContainer.style.display = 'block';
    uploadVerticalBtn.style.display = 'none';
    verticalStatus.style.display = 'none';
  } else {
    verticalPreviewContainer.style.display = 'none';
    uploadVerticalBtn.style.display = 'flex';
    verticalStatus.style.display = 'none';
  }
}

async function openProjectUploader(projectId) {
  // Find the gallery event from the in-memory projects array
  const matchedProject = projects.find(p => p.id === projectId || p.id === parseInt(projectId, 10));
  const gallerySlug = matchedProject ? matchedProject.slug : '';
  const projectTitle = matchedProject ? matchedProject.title : '';

  currentGalleryId = projectId;
  currentGallerySlug = gallerySlug;

  projectSelect.value = projectId;

  // Show clean project name (no dropdown)
  if (projectNameDisplay) {
    projectNameDisplay.textContent = projectTitle || '—';
  }

  // Clear tab dropdown first (no "All" option)
  tabSelect.innerHTML = '';

  // Initialize cover photo previews
  updateCoverPreviews(matchedProject);

  // Fetch CRM project events via the dedicated endpoint (uses gallery slug as key)
  if (gallerySlug) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/gallery/events/${encodeURIComponent(gallerySlug)}/project-events`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        const projectEvents = data.projectEvents || [];
        projectEvents.forEach(e => {
          const option = document.createElement('option');
          option.value = e.event_type;
          option.textContent = e.event_type;
          tabSelect.appendChild(option);
        });
      } else {
        console.error('Failed to fetch project-events, status:', res.status);
      }
    } catch (err) {
      console.error('Error fetching project-events:', err);
    }
  }

  // Also load existing uploaded photo tab names (custom user-created tabs)
  if (gallerySlug) {
    try {
      const photosRes = await fetch(`${apiBaseUrl}/api/gallery/public/events/${gallerySlug}/photos`);
      if (photosRes.ok) {
        const photosData = await photosRes.json();
        const existingTabs = [...new Set((photosData.photos || []).map(p => p.tabName).filter(Boolean))];
        existingTabs.forEach(tab => {
          if (!Array.from(tabSelect.options).some(opt => opt.value === tab)) {
            const option = document.createElement('option');
            option.value = tab;
            option.textContent = tab;
            tabSelect.appendChild(option);
          }
        });
      }
    } catch (err) {
      console.error('Failed to load existing photo tabs:', err);
    }
  }

  // Reset view to upload mode
  currentUploaderView = 'upload';
  mainPanelTitle.textContent = 'Upload Photos';
  toggleUploadedViewBtn.textContent = 'View Uploaded Photos';
  uploadedPhotosCard.style.display = 'none';

  // Fetch and display photos for the initially selected tab
  loadUploadedPhotos();

  projectsScreen.classList.remove('active');
  loginScreen.classList.remove('active');
  uploaderScreen.classList.add('active');
}


// --- 4. Navigation & Directory transitions ---
backToProjectsBtn.addEventListener('click', () => {
  uploaderScreen.classList.remove('active');
  projectsScreen.classList.add('active');
  
  // Clear file selections when transitioning back
  selectedFolderPaths = [];
  dropzone.style.display = 'flex';
  selectedFolderInfo.style.display = 'none';
  uploadStatusCard.style.display = 'none';
});

// --- 5. Directory / Folder Selection ---
dropzone.addEventListener('click', async () => {
  const folder = await window.api.selectFolder();
  if (folder) {
    setFolder([folder]);
  }
});

// Drag-and-drop listeners
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

async function setFolder(paths) {
  selectedFolderPaths = paths;
  dropzone.style.display = 'none';
  uploadQueueCard.style.display = 'flex';
  
  queueHeaderTitle.textContent = '0/0 Photos';
  queueHeaderSize.textContent = '0.0 MB';
  queueTotalProgress.style.width = '0%';
  queueTotalStatus.textContent = 'Scanning directory...';
  queueItemsList.innerHTML = '';
  
  queueStartBtn.disabled = true;
  queueCancelBtn.style.display = 'block';
  queueCompletedMsg.style.display = 'none';
  queueStartBtn.textContent = 'Start Upload';
  uploadCompletedState = false;

  try {
    const tabName = customTab.value.trim() || tabSelect.value;
    if (!tabName) {
      await showModal({ icon: '⚠️', title: 'Select Event Tab', sub: 'Please select an event tab or add a new category before uploading.', confirmText: 'OK' });
      selectedFolderPaths = [];
      dropzone.style.display = 'flex';
      uploadQueueCard.style.display = 'none';
      return;
    }
    
    // Scan files in folder using background thread
    resolvedFiles = await window.api.getFolderFiles({
      paths,
      defaultTab: tabName
    });

    if (resolvedFiles.length === 0) {
      queueTotalStatus.textContent = 'No photos (.jpg, .jpeg, .png) found in the selected folder.';
      queueHeaderTitle.textContent = '0 Photos';
      return;
    }

    // Calculate total size
    const totalSizeBytes = resolvedFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
    const sizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);

    queueHeaderTitle.textContent = `0/${resolvedFiles.length} Photos`;
    queueHeaderSize.textContent = `${sizeMB} MB`;
    queueTotalStatus.textContent = `${resolvedFiles.length} files ready to upload`;

    // Render list rows
    const fragment = document.createDocumentFragment();
    resolvedFiles.forEach((file, index) => {
      const row = document.createElement('div');
      row.className = 'queue-row';
      row.id = `q-row-${index}`;
      
      const fileMB = (file.sizeBytes / (1024 * 1024)).toFixed(2);
      
      row.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="q-filename" style="font-size: 12px; font-weight: 600; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 65%;" title="${file.name}">${file.name}</span>
          <div style="display: flex; align-items: center; gap: 16px;">
            <span class="q-filesize" style="font-size: 11px; color: var(--text-muted); font-weight: 500;">${fileMB} MB</span>
            <span class="q-status" style="font-size: 11px; font-weight: 700; color: var(--text-muted); min-width: 70px; text-align: right;">Pending</span>
          </div>
        </div>
        <div class="q-row-progress-container" style="display: none; margin-top: 4px;">
          <div class="q-row-progress" style="width: 0%;"></div>
        </div>
      `;
      fragment.appendChild(row);
    });
    queueItemsList.appendChild(fragment);

    queueStartBtn.disabled = false;
  } catch (err) {
    console.error('Error scanning folder files:', err);
    queueTotalStatus.textContent = 'Failed to scan directory files.';
  }
}

queueCancelBtn.addEventListener('click', () => {
  resolvedFiles = [];
  selectedFolderPaths = [];
  dropzone.style.display = 'flex';
  uploadQueueCard.style.display = 'none';
});

// --- 6. Start Batch Upload & AI Engine ---
queueStartBtn.addEventListener('click', async () => {
  if (uploadCompletedState) {
    // Reset/Upload more state clicked
    resolvedFiles = [];
    selectedFolderPaths = [];
    dropzone.style.display = 'flex';
    uploadQueueCard.style.display = 'none';
    uploadCompletedState = false;
    queueStartBtn.textContent = 'Start Upload';
    queueCancelBtn.style.display = 'block';
    queueCompletedMsg.style.display = 'none';
    return;
  }

  if (resolvedFiles.length === 0 || !authToken) return;

  const eventId = currentGalleryId;
  const eventSlug = currentGallerySlug;

  queueStartBtn.disabled = true;
  queueCancelBtn.style.display = 'none'; // hide cancel during active upload
  queueTotalStatus.textContent = 'Starting upload pipeline...';

  try {
    const result = await window.api.processPhotos({
      resolvedFiles,
      eventId,
      eventSlug,
      backendUrl: apiBaseUrl,
      token: authToken,
      uploadQuality: uploadQuality ? uploadQuality.value : '4k',
      applyWatermark: watermarkToggle ? watermarkToggle.checked : true
    });

    // Mark as completed
    queueTotalProgress.style.width = '100%';
    queueHeaderTitle.textContent = `${result.count}/${result.count} Photos`;
    
    // Count successful vs failed
    const rows = queueItemsList.querySelectorAll('.queue-row');
    let successCount = 0;
    let failedCount = 0;
    rows.forEach(r => {
      const statusText = r.querySelector('.q-status').textContent;
      if (statusText.includes('SUCCESS')) successCount++;
      else if (statusText.includes('FAILED')) failedCount++;
    });

    queueTotalStatus.textContent = `${successCount} success, 0 duplicate, ${failedCount} error`;
    
    // Show Completed! text and UPLOAD MORE button
    queueCompletedMsg.style.display = 'flex';
    queueStartBtn.textContent = 'UPLOAD MORE';
    queueStartBtn.disabled = false;
    uploadCompletedState = true;
    loadUploadedPhotos();
  } catch (err) {
    await showModal({ icon: '❌', title: 'Upload Failed', sub: err.message, confirmText: 'OK', danger: true });
    queueTotalStatus.textContent = 'Upload failed. Correct issues and try again.';
    queueStartBtn.disabled = false;
    queueCancelBtn.style.display = 'block';
  }
});

// --- 7. Progress Event Callbacks ---
window.api.onProgress((data) => {
  if (data.status === 'row-processing') {
    const row = document.getElementById(`q-row-${data.index}`);
    if (row) {
      const statusText = row.querySelector('.q-status');
      const progressContainer = row.querySelector('.q-row-progress-container');
      const progressBar = row.querySelector('.q-row-progress');
      if (statusText) {
        statusText.textContent = 'Processing...';
        statusText.style.color = '#eab308'; // Yellow/Amber
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
        statusText.style.color = '#3b82f6'; // Blue
      }
      if (progressBar) progressBar.style.width = '80%';
    }
  } else if (data.status === 'row-success') {
    const row = document.getElementById(`q-row-${data.index}`);
    if (row) {
      const statusText = row.querySelector('.q-status');
      const progressBar = row.querySelector('.q-row-progress');
      if (statusText) {
        statusText.innerHTML = 'SUCCESS <span style="font-size:10px;">✓</span>';
        statusText.style.color = 'var(--primary)'; // Emerald Green
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
        statusText.textContent = 'FAILED';
        statusText.style.color = '#ef4444'; // Red
      }
      if (progressBar) {
        progressBar.style.width = '100%';
        progressBar.style.background = '#ef4444';
      }
    }
  } else if (data.status === 'progress') {
    const pct = Math.round((data.index / data.total) * 100);
    queueTotalProgress.style.width = `${pct}%`;
    queueHeaderTitle.textContent = `${data.index}/${data.total} Photos`;
    queueTotalStatus.textContent = `Uploading files: ${data.index} of ${data.total} completed`;
  } else if (data.status === 'submitting') {
    queueTotalStatus.textContent = 'Optimizing database & syncing face indexes...';
  }
});

// --- 8. Deep Linking Handler ---
window.api.handleDeepLink((slug) => {
  console.log('Received deep link for event slug:', slug);
  pendingEventSlug = slug;
  if (projects.length > 0) {
    const matched = projects.find(p => p.slug === slug);
    if (matched) {
      openProjectUploader(matched.id);
      pendingEventSlug = null;
    }
  }
});

// --- 9. In-App Modal System ---
const appModal     = document.getElementById('app-modal');
const appModalBox  = document.getElementById('app-modal-box');
const modalIcon    = document.getElementById('modal-icon');
const modalTitle   = document.getElementById('modal-title');
const modalSub     = document.getElementById('modal-sub');
const modalInput   = document.getElementById('modal-input');
const modalCancel  = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');

/**
 * Show a themed modal.
 * @param {object} opts
 *   icon        - emoji icon string
 *   title       - heading
 *   sub         - subtext
 *   inputPlaceholder - if set, shows a text input; omit for confirm-only
 *   inputValue  - prefill value
 *   confirmText - button label (default: 'Confirm')
 *   danger      - if true, applies red danger styling
 * @returns {Promise<string|true|null>} resolves to input value / true / null if cancelled
 */
function showModal({ icon = '', title, sub = '', inputPlaceholder, inputValue = '', confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    modalIcon.textContent  = icon;
    modalTitle.textContent = title;
    modalSub.textContent   = sub;
    modalConfirm.textContent = confirmText;

    // Danger styling
    if (danger) {
      appModalBox.classList.add('danger');
      modalConfirm.className = 'modal-btn danger';
    } else {
      appModalBox.classList.remove('danger');
      modalConfirm.className = 'modal-btn confirm';
    }

    // Input field
    if (inputPlaceholder !== undefined) {
      modalInput.style.display = 'block';
      modalInput.placeholder   = inputPlaceholder;
      modalInput.value         = inputValue;
      setTimeout(() => { modalInput.focus(); modalInput.select(); }, 80);
    } else {
      modalInput.style.display = 'none';
      modalInput.value = '';
    }

    appModal.classList.add('open');

    const cleanup = () => {
      appModal.classList.remove('open');
      modalConfirm.removeEventListener('click', onConfirm);
      modalCancel.removeEventListener('click', onCancel);
      modalInput.removeEventListener('keydown', onKey);
      appModal.removeEventListener('click', onOverlay);
    };

    const onConfirm = () => {
      cleanup();
      resolve(inputPlaceholder !== undefined ? modalInput.value.trim() : true);
    };
    const onCancel = () => { cleanup(); resolve(null); };
    const onKey = (e) => {
      if (e.key === 'Enter') onConfirm();
      if (e.key === 'Escape') onCancel();
    };
    const onOverlay = (e) => { if (e.target === appModal) onCancel(); };

    modalConfirm.addEventListener('click', onConfirm);
    modalCancel.addEventListener('click', onCancel);
    modalInput.addEventListener('keydown', onKey);
    appModal.addEventListener('click', onOverlay);
  });
}

// --- 10. Tab Management Actions ---
addTabBtn.addEventListener('click', async () => {
  const tabName = await showModal({
    icon: '＋',
    title: 'Add Category Tab',
    sub: 'Type a name for the new gallery category.',
    inputPlaceholder: 'e.g. Cocktail Night',
    confirmText: 'Add Tab'
  });

  if (!tabName) return;

  const exists = Array.from(tabSelect.options).some(opt => opt.value === tabName);
  if (exists) {
    await showModal({ icon: '⚠️', title: 'Already exists', sub: `A tab named "${tabName}" already exists.`, confirmText: 'OK' });
    return;
  }

  const option = document.createElement('option');
  option.value = tabName;
  option.textContent = tabName;
  tabSelect.appendChild(option);
  tabSelect.value = tabName;
});

renameTabBtn.addEventListener('click', async () => {
  const oldName = tabSelect.value;
  if (oldName === 'All') {
    await showModal({ icon: '🚫', title: 'Cannot rename', sub: "The 'All' tab cannot be renamed.", confirmText: 'OK' });
    return;
  }

  const newName = await showModal({
    icon: '✎',
    title: `Rename "${oldName}"`,
    sub: 'Enter the new name for this category tab.',
    inputPlaceholder: 'New tab name',
    inputValue: oldName,
    confirmText: 'Rename'
  });

  if (!newName || newName === oldName) return;

  const eventId = parseInt(projectSelect.value, 10);
  renameTabBtn.disabled = true;

  try {
    const res = await fetch(`${apiBaseUrl}/api/gallery/events/${eventId}/tabs/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ oldName, newName })
    });

    if (res.ok) {
      const activeOpt = tabSelect.options[tabSelect.selectedIndex];
      activeOpt.value = newName;
      activeOpt.textContent = newName;
      tabSelect.value = newName;
      await showModal({ icon: '✅', title: 'Renamed', sub: `Tab renamed to "${newName}" and all matching photos updated.`, confirmText: 'Done' });
    } else {
      const err = await res.json();
      await showModal({ icon: '❌', title: 'Rename failed', sub: err.error, confirmText: 'OK', danger: true });
    }
  } catch (err) {
    await showModal({ icon: '❌', title: 'Rename failed', sub: err.message, confirmText: 'OK', danger: true });
  } finally {
    renameTabBtn.disabled = false;
  }
});

deleteTabBtn.addEventListener('click', async () => {
  const tabName = tabSelect.value;
  if (tabName === 'All') {
    await showModal({ icon: '🚫', title: 'Cannot delete', sub: "The 'All' tab cannot be deleted.", confirmText: 'OK' });
    return;
  }

  const confirmed = await showModal({
    icon: '🗑️',
    title: `Delete "${tabName}"?`,
    sub: `This will permanently delete all photos uploaded under this category. This action cannot be undone.`,
    confirmText: 'Delete',
    danger: true
  });

  if (!confirmed) return;

  const eventId = parseInt(projectSelect.value, 10);
  deleteTabBtn.disabled = true;

  try {
    const res = await fetch(`${apiBaseUrl}/api/gallery/events/${eventId}/tabs`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ tabName })
    });

    if (res.ok) {
      tabSelect.remove(tabSelect.selectedIndex);
      tabSelect.value = 'All';
      await showModal({ icon: '✅', title: 'Deleted', sub: `Category "${tabName}" and all its photos have been removed.`, confirmText: 'Done' });
    } else {
      const err = await res.json();
      await showModal({ icon: '❌', title: 'Delete failed', sub: err.error, confirmText: 'OK', danger: true });
    }
  } catch (err) {
    await showModal({ icon: '❌', title: 'Delete failed', sub: err.message, confirmText: 'OK', danger: true });
  } finally {
    deleteTabBtn.disabled = false;
  }
});

// --- 11. Logout / Disconnect ---
function handleLogout() {
  authToken = null;
  selectedFolderPaths = [];
  localStorage.removeItem('mv_session');

  dropzone.style.display = 'flex';
  selectedFolderInfo.style.display = 'none';
  uploadStatusCard.style.display = 'none';

  uploaderScreen.classList.remove('active');
  projectsScreen.classList.remove('active');
  loginScreen.classList.add('active');
}

dashboardLogoutBtn.addEventListener('click', handleLogout);

// --- 12. Auto-restore saved session on startup ---
(async function restoreSession() {
  try {
    const saved = localStorage.getItem('mv_session');
    if (!saved) return;

    const { token, apiBaseUrl: savedUrl, displayName } = JSON.parse(saved);
    if (!token || !savedUrl) return;

    // Silently validate the saved token
    apiBaseUrl = savedUrl;
    loginUrl.value = savedUrl;
    const res = await fetch(`${savedUrl}/api/auth/heartbeat`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      localStorage.removeItem('mv_session');
      return;
    }

    // Token still valid — restore session
    authToken = token;
    await afterLogin(displayName || 'Editor');
  } catch {
    // Network error or bad saved data — just show login
    localStorage.removeItem('mv_session');
  }
})();

// --- 13. Load Uploaded Photos (Tab-wise) ---
async function loadUploadedPhotos() {
  if (!tabSelect.value || !authToken) {
    uploadedPhotosGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px;">Select an event tab above to view photos.</div>';
    uploadedCount.textContent = '0';
    return;
  }

  if (!currentGallerySlug) return;
  const gallerySlug = currentGallerySlug;

  uploadedPhotosGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px;">Loading...</div>';

  try {
    const photosRes = await fetch(`${apiBaseUrl}/api/gallery/public/events/${gallerySlug}/photos`);
    if (photosRes.ok) {
      const photosData = await photosRes.json();
      const allPhotos = photosData.photos || [];
      
      // Filter by the currently selected tab
      const filtered = allPhotos.filter(p => p.tabName === tabSelect.value);
      
      uploadedCount.textContent = filtered.length;
      uploadedPhotosGrid.innerHTML = '';

      if (filtered.length === 0) {
        uploadedPhotosGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px;">No photos uploaded to this event tab yet.</div>';
        return;
      }

      filtered.forEach(photo => {
        const item = document.createElement('div');
        item.style.cssText = `
          position: relative;
          width: 100%;
          aspect-ratio: 1;
          border-radius: 8px;
          border: 1px solid var(--surface-border);
          overflow: hidden;
          background: #000;
        `;

        const imgUrl = photo.r2Url.startsWith('/') ? `${apiBaseUrl}${photo.r2Url}` : photo.r2Url;
        
        item.innerHTML = `
          <img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
          <div style="
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0,0,0,0.65);
            color: #fff;
            font-size: 9px;
            padding: 4px;
            white-space: nowrap;
            text-overflow: ellipsis;
            overflow: hidden;
            text-align: center;
          ">${photo.filename}</div>
        `;
        uploadedPhotosGrid.appendChild(item);
      });
    } else {
      uploadedPhotosGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px;">Failed to load photos.</div>';
    }
  } catch (err) {
    console.error('Error loading uploaded photos:', err);
    uploadedPhotosGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px;">Error loading photos.</div>';
  }
}

// Reload uploaded photos when event tab changes
tabSelect.addEventListener('change', loadUploadedPhotos);

// --- 14. Gallery Cover Image Upload Handling ---
uploadHorizontalBtn.addEventListener('click', () => {
  horizontalFileInput.click();
});

uploadVerticalBtn.addEventListener('click', () => {
  verticalFileInput.click();
});

async function handleCoverUpload(inputElement, type, statusElement) {
  const file = inputElement.files[0];
  if (!file) return;

  statusElement.textContent = 'Uploading...';
  statusElement.style.color = 'var(--primary)';
  statusElement.style.display = 'block';
  if (type === 'horizontal') {
    horizontalPreviewContainer.style.display = 'none';
    uploadHorizontalBtn.style.display = 'none';
  } else {
    verticalPreviewContainer.style.display = 'none';
    uploadVerticalBtn.style.display = 'none';
  }

  if (!currentGalleryId) {
    statusElement.textContent = 'No project selected';
    statusElement.style.color = '#ef4444';
    if (type === 'horizontal') {
      uploadHorizontalBtn.style.display = 'flex';
    } else {
      uploadVerticalBtn.style.display = 'flex';
    }
    return;
  }
  const eventId = currentGalleryId;

  try {
    const res = await window.api.uploadCoverPhoto({
      filePath: file.path,
      type,
      eventId,
      backendUrl: apiBaseUrl,
      token: authToken
    });

    if (res.success) {
      // Update in-memory project cover properties so it stays persistent
      const matched = projects.find(p => p.id === eventId);
      if (matched) {
        if (type === 'horizontal') matched.coverPhotoUrl = res.url;
        else matched.coverPhotoMobileUrl = res.url;
        updateCoverPreviews(matched);
      }
    } else {
      statusElement.textContent = 'Failed';
      statusElement.style.color = '#ef4444';
      if (type === 'horizontal') {
        uploadHorizontalBtn.style.display = 'flex';
      } else {
        uploadVerticalBtn.style.display = 'flex';
      }
    }
  } catch (err) {
    console.error(`Failed to upload ${type} cover:`, err);
    statusElement.textContent = 'Error';
    statusElement.style.color = '#ef4444';
    if (type === 'horizontal') {
      uploadHorizontalBtn.style.display = 'flex';
    } else {
      uploadVerticalBtn.style.display = 'flex';
    }
    await showModal({ icon: '❌', title: 'Cover Upload Failed', sub: err.message, confirmText: 'OK', danger: true });
  } finally {
    inputElement.value = ''; // Reset input selection
  }
}

horizontalFileInput.addEventListener('change', () => {
  handleCoverUpload(horizontalFileInput, 'horizontal', horizontalStatus);
});

verticalFileInput.addEventListener('change', () => {
  handleCoverUpload(verticalFileInput, 'vertical', verticalStatus);
});

// Click container to trigger input change cover
horizontalPreviewContainer.addEventListener('click', () => {
  horizontalFileInput.click();
});

verticalPreviewContainer.addEventListener('click', () => {
  verticalFileInput.click();
});

// Toggle between Uploader and Uploaded Photos views
toggleUploadedViewBtn.addEventListener('click', () => {
  if (currentUploaderView === 'upload') {
    currentUploaderView = 'uploaded';
    mainPanelTitle.textContent = 'Uploaded Photos';
    toggleUploadedViewBtn.textContent = 'Back to Upload';
    
    dropzone.style.display = 'none';
    uploadQueueCard.style.display = 'none';
    uploadedPhotosCard.style.display = 'flex';
    
    loadUploadedPhotos();
  } else {
    currentUploaderView = 'upload';
    mainPanelTitle.textContent = 'Upload Photos';
    toggleUploadedViewBtn.textContent = 'View Uploaded Photos';
    
    uploadedPhotosCard.style.display = 'none';
    if (resolvedFiles.length > 0) {
      uploadQueueCard.style.display = 'flex';
      dropzone.style.display = 'none';
    } else {
      dropzone.style.display = 'flex';
      uploadQueueCard.style.display = 'none';
    }
  }
});
