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

// Batch action elements
const btnSelectAll = document.getElementById('btn-select-all');
const btnDeselectAll = document.getElementById('btn-deselect-all');
const btnDeleteSelected = document.getElementById('btn-delete-selected');
const selectMoveTarget = document.getElementById('select-move-target');
const btnMoveSelected = document.getElementById('btn-move-selected');
const moveContainer = document.getElementById('move-container');
const uploadedActionsContainer = document.getElementById('uploaded-actions-container');

let selectedPhotoIds = new Set();

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
let currentUploadedPhotosList = [];
let uploadCompletedState = false;
let isUploadingActive = false;

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

  // Clear tab dropdown and set disabled default placeholder option
  tabSelect.innerHTML = '<option value="" disabled selected style="color: var(--text-muted);">Select Event Tab...</option>';

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
        currentUploadedPhotosList = photosData.photos || [];
        const existingTabs = [...new Set(currentUploadedPhotosList.map(p => p.tabName).filter(Boolean))];
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
  
  // Clear file selections and cache when transitioning back
  selectedFolderPaths = [];
  currentUploadedPhotosList = [];
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
    const defaultTabName = customTab.value.trim() || tabSelect.value || 'General';
    
    // Scan files in folder using recursive background thread
    const scanResult = await window.api.getFolderFiles({
      paths
    });

    if (scanResult.length === 0) {
      queueTotalStatus.textContent = 'No photos (.jpg, .jpeg, .png) found in the selected folder.';
      queueHeaderTitle.textContent = '0 Photos';
      return;
    }

    // Determine the mapping of files to tabs
    resolvedFiles = [];

    if (paths.length > 1) {
      // Multiple items selected: map to their respective root folder names
      resolvedFiles = scanResult.map(file => {
        return {
          ...file,
          tabName: file.rootFolder || defaultTabName
        };
      });
    } else {
      // Exactly one folder path selected
      const uniqueSubDirs = [...new Set(scanResult.map(f => f.topSubDir).filter(Boolean))];
      
      if (uniqueSubDirs.length === 0) {
        // No subfolders containing photos, map everything to the root folder name
        resolvedFiles = scanResult.map(file => {
          return {
            ...file,
            tabName: file.rootFolder || defaultTabName
          };
        });
      } else {
        // We have subfolders! Ask the user how to organize them
        const mode = await showOrganizeModal(uniqueSubDirs, scanResult[0].rootFolder);
        if (!mode) {
          // Cancel upload clicked
          selectedFolderPaths = [];
          dropzone.style.display = 'flex';
          uploadQueueCard.style.display = 'none';
          return;
        }
        
        if (mode === 'split') {
          // Option A: Split by topSubDir (create separate tabs)
          resolvedFiles = scanResult.map(file => {
            return {
              ...file,
              tabName: file.topSubDir || file.rootFolder || defaultTabName
            };
          });
        } else {
          // Option B: Merge all into a single tab named after root folder
          resolvedFiles = scanResult.map(file => {
            return {
              ...file,
              tabName: file.rootFolder || defaultTabName
            };
          });
        }
      }
    }

    // Multi-Tab Deduplication check
    const existingPhotosByTab = {}; // { [tabName]: { [filename]: originalSize } }
    currentUploadedPhotosList.forEach(p => {
      const tName = p.tabName || '';
      if (!existingPhotosByTab[tName]) {
        existingPhotosByTab[tName] = {};
      }
      existingPhotosByTab[tName][p.filename] = p.originalSize !== null && p.originalSize !== undefined ? p.originalSize : true;
    });

    let preCompletedCount = 0;
    resolvedFiles.forEach(file => {
      const tName = file.tabName || '';
      const existingMap = existingPhotosByTab[tName] || {};
      const existing = existingMap[file.name];
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

    // Calculate total size
    const totalSizeBytes = resolvedFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
    const sizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);

    queueHeaderTitle.textContent = `${preCompletedCount}/${resolvedFiles.length} Photos`;
    queueHeaderSize.textContent = `${sizeMB} MB`;
    if (preCompletedCount > 0) {
      queueTotalStatus.textContent = `${resolvedFiles.length - preCompletedCount} new files ready to upload (${preCompletedCount} already uploaded)`;
    } else {
      queueTotalStatus.textContent = `${resolvedFiles.length} files ready to upload`;
    }

    // Render list rows with folders / category badges
    const fragment = document.createDocumentFragment();
    resolvedFiles.forEach((file, index) => {
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

    queueStartBtn.disabled = false;
  } catch (err) {
    console.error('Error scanning folder files:', err);
    queueTotalStatus.textContent = 'Failed to scan directory files.';
  }
}

queueCancelBtn.addEventListener('click', () => {
  if (isUploadingActive) {
    window.api.cancelUpload();
    queueTotalStatus.textContent = 'Pausing/cancelling upload...';
    queueCancelBtn.disabled = true;
    return;
  }

  resolvedFiles = [];
  selectedFolderPaths = [];
  dropzone.style.display = 'flex';
  uploadQueueCard.style.display = 'none';
});

async function ensureTabExists(tabName, eventId) {
  const exists = Array.from(tabSelect.options).some(opt => opt.value === tabName);
  if (exists) return true;

  try {
    const res = await fetch(`${apiBaseUrl}/api/gallery/events/${eventId}/tabs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ tabName })
    });

    if (res.ok) {
      const option = document.createElement('option');
      option.value = tabName;
      option.textContent = tabName;
      tabSelect.appendChild(option);
      return true;
    }
  } catch (err) {
    console.error(`Failed to automatically create tab ${tabName}:`, err);
  }
  return false;
}

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
    queueCancelBtn.textContent = 'Cancel';
    queueCancelBtn.style.color = 'var(--text-muted)';
    queueCancelBtn.style.borderColor = 'var(--surface-border)';
    queueCancelBtn.style.display = 'block';
    queueCancelBtn.disabled = false;
    queueCompletedMsg.style.display = 'none';
    return;
  }

  if (resolvedFiles.length === 0 || !authToken) return;

  // Re-validate resolvedFiles against database cache tab-by-tab
  const existingPhotosByTab = {}; // { [tabName]: { [filename]: originalSize } }
  currentUploadedPhotosList.forEach(p => {
    const tName = p.tabName || '';
    if (!existingPhotosByTab[tName]) {
      existingPhotosByTab[tName] = {};
    }
    existingPhotosByTab[tName][p.filename] = p.originalSize !== null && p.originalSize !== undefined ? p.originalSize : true;
  });

  let preCompletedCount = 0;
  resolvedFiles.forEach(file => {
    const tName = file.tabName || '';
    const existingMap = existingPhotosByTab[tName] || {};
    const existing = existingMap[file.name];
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

  const eventId = currentGalleryId;
  const eventSlug = currentGallerySlug;

  queueStartBtn.disabled = true;
  queueStartBtn.textContent = 'Uploading...';
  
  // Set active upload state and keep cancel button visible as a Red Cancel Upload button
  isUploadingActive = true;
  queueCancelBtn.textContent = 'Cancel Upload';
  queueCancelBtn.style.color = '#ef4444';
  queueCancelBtn.style.borderColor = '#ef4444';
  queueCancelBtn.style.display = 'block';
  queueCancelBtn.disabled = false;

  queueHeaderTitle.textContent = `${preCompletedCount}/${resolvedFiles.length} Photos`;

  // Auto tab verification & creation
  queueTotalStatus.textContent = 'Verifying category tabs on server...';
  try {
    const uniqueTabs = [...new Set(resolvedFiles.map(f => f.tabName).filter(Boolean))];
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
        queueStartBtn.disabled = false;
        queueStartBtn.textContent = 'Start Upload';
        isUploadingActive = false;
        queueCancelBtn.textContent = 'Cancel';
        queueCancelBtn.style.color = 'var(--text-muted)';
        queueCancelBtn.style.borderColor = 'var(--surface-border)';
        return;
      }
    }
  } catch (tabErr) {
    console.error('Failed to pre-create tabs:', tabErr);
  }

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

    isUploadingActive = false;

    // Restore cancel button styling
    queueCancelBtn.textContent = 'Cancel';
    queueCancelBtn.style.color = 'var(--text-muted)';
    queueCancelBtn.style.borderColor = 'var(--surface-border)';

    if (result && result.status === 'cancelled') {
      queueTotalStatus.textContent = `Upload paused/cancelled. ${result.count} photos uploaded.`;
      queueStartBtn.textContent = 'Resume Upload';
      queueStartBtn.disabled = false;
      queueCancelBtn.disabled = false;
      
      // Reload uploads grid to display successfully saved items
      await loadUploadedPhotos();
      return;
    }

    // Mark as completed
    queueTotalProgress.style.width = '100%';
    queueHeaderTitle.textContent = `${result.count}/${result.count} Photos`;
    
    // Count successful vs skipped vs failed
    const rows = queueItemsList.querySelectorAll('.queue-row');
    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    rows.forEach(r => {
      const statusText = r.querySelector('.q-status').textContent;
      if (statusText.includes('SUCCESS')) successCount++;
      else if (statusText.includes('SKIPPED')) skippedCount++;
      else if (statusText.includes('FAILED')) failedCount++;
    });

    queueTotalStatus.textContent = `${successCount} success, ${skippedCount} skipped, ${failedCount} error`;
    
    // Show Completed! text and UPLOAD MORE button
    queueCompletedMsg.style.display = 'flex';
    queueStartBtn.textContent = 'UPLOAD MORE';
    queueStartBtn.disabled = false;
    queueCancelBtn.textContent = 'Back';
    uploadCompletedState = true;
    await loadUploadedPhotos();
  } catch (err) {
    isUploadingActive = false;
    queueCancelBtn.textContent = 'Cancel';
    queueCancelBtn.style.color = 'var(--text-muted)';
    queueCancelBtn.style.borderColor = 'var(--surface-border)';
    queueCancelBtn.disabled = false;

    await showModal({ icon: '❌', title: 'Upload Failed', sub: err.message, confirmText: 'OK', danger: true });
    queueTotalStatus.textContent = 'Upload failed. Correct issues and try again.';
    queueStartBtn.textContent = 'Start Upload';
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
  } else if (data.status === 'row-skipped') {
    const row = document.getElementById(`q-row-${data.index}`);
    if (row) {
      const statusText = row.querySelector('.q-status');
      const progressBar = row.querySelector('.q-row-progress');
      const progressContainer = row.querySelector('.q-row-progress-container');
      if (statusText) {
        statusText.innerHTML = 'SKIPPED <span style="font-size:10px;">✓</span>';
        statusText.style.color = '#38bdf8'; // Sky Blue
      }
      if (progressContainer) {
        progressContainer.style.display = 'block';
      }
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

  const eventId = parseInt(projectSelect.value, 10);
  addTabBtn.disabled = true;

  try {
    const res = await fetch(`${apiBaseUrl}/api/gallery/events/${eventId}/tabs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ tabName })
    });

    if (res.ok) {
      const option = document.createElement('option');
      option.value = tabName;
      option.textContent = tabName;
      tabSelect.appendChild(option);
      tabSelect.value = tabName;
    } else {
      const err = await res.json();
      await showModal({ icon: '❌', title: 'Add failed', sub: err.error, confirmText: 'OK', danger: true });
    }
  } catch (err) {
    await showModal({ icon: '❌', title: 'Add failed', sub: err.message, confirmText: 'OK', danger: true });
  } finally {
    addTabBtn.disabled = false;
  }
});

renameTabBtn.addEventListener('click', async () => {
  const oldName = tabSelect.value;
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
      // Select first available tab after deletion
      if (tabSelect.options.length > 0) {
        tabSelect.selectedIndex = 0;
      }
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
function updateBatchActionsBar(totalCount) {
  if (totalCount === 0) {
    uploadedActionsContainer.style.display = 'none';
    return;
  }
  uploadedActionsContainer.style.display = 'flex';

  if (selectedPhotoIds.size > 0) {
    btnDeselectAll.style.display = 'inline-block';
    btnSelectAll.style.display = 'none';
    btnDeleteSelected.style.display = 'inline-block';
    btnDeleteSelected.textContent = `Delete (${selectedPhotoIds.size})`;
    
    // Check if there are other tabs to move to
    if (selectMoveTarget.options.length > 1) {
      moveContainer.style.display = 'flex';
    } else {
      moveContainer.style.display = 'none';
    }
  } else {
    btnDeselectAll.style.display = 'none';
    btnSelectAll.style.display = 'inline-block';
    btnDeleteSelected.style.display = 'none';
    moveContainer.style.display = 'none';
  }
}

async function loadUploadedPhotos() {
  if (!tabSelect.value || !authToken) {
    uploadedPhotosGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px;">Select an event tab above to view photos.</div>';
    uploadedCount.textContent = '0';
    selectedPhotoIds.clear();
    updateBatchActionsBar(0);
    return;
  }

  if (!currentGallerySlug) return;
  const gallerySlug = currentGallerySlug;

  uploadedPhotosGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px;">Loading...</div>';

  try {
    const photosRes = await fetch(`${apiBaseUrl}/api/gallery/public/events/${gallerySlug}/photos`);
    if (photosRes.ok) {
      const photosData = await photosRes.json();
      currentUploadedPhotosList = photosData.photos || [];
      const allPhotos = currentUploadedPhotosList;
      
      // Filter by the currently selected tab
      const filtered = allPhotos.filter(p => p.tabName === tabSelect.value);
      
      uploadedCount.textContent = filtered.length;
      uploadedPhotosGrid.innerHTML = '';
      selectedPhotoIds.clear();
      updateBatchActionsBar(filtered.length);

      if (filtered.length === 0) {
        uploadedPhotosGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px;">No photos uploaded to this event tab yet.</div>';
        return;
      }

      // Populate the move-to-tab dropdown
      selectMoveTarget.innerHTML = '<option value="" disabled selected>Move to...</option>';
      Array.from(tabSelect.options).forEach(opt => {
        // Only include options that are valid tabs and not the currently active one
        if (opt.value && opt.value !== tabSelect.value) {
          const moveOpt = document.createElement('option');
          moveOpt.value = opt.value;
          moveOpt.textContent = opt.textContent;
          selectMoveTarget.appendChild(moveOpt);
        }
      });

      filtered.forEach(photo => {
        const item = document.createElement('div');
        item.style.cssText = `
          position: relative;
          width: 100%;
          aspect-ratio: 1;
          border-radius: 8px;
          border: 2px solid var(--surface-border);
          overflow: hidden;
          background: #000;
          cursor: pointer;
          transition: border-color 0.2s, transform 0.2s;
        `;

        const imgUrl = photo.r2Url.startsWith('/') ? `${apiBaseUrl}${photo.r2Url}` : photo.r2Url;
        
        item.innerHTML = `
          <img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
          <div class="checkbox-indicator" style="
            position: absolute;
            top: 8px;
            left: 8px;
            width: 18px;
            height: 18px;
            border-radius: 4px;
            border: 2px solid #fff;
            background: rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-size: 10px;
            font-weight: bold;
            transition: all 0.2s;
          "></div>
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

        const updateItemSelectionState = () => {
          const isSelected = selectedPhotoIds.has(photo.id);
          const indicator = item.querySelector('.checkbox-indicator');
          if (isSelected) {
            item.style.borderColor = 'var(--primary)';
            indicator.style.background = 'var(--primary)';
            indicator.style.borderColor = 'var(--primary)';
            indicator.textContent = '✓';
          } else {
            item.style.borderColor = 'var(--surface-border)';
            indicator.style.background = 'rgba(0,0,0,0.4)';
            indicator.style.borderColor = '#fff';
            indicator.textContent = '';
          }
        };

        item.addEventListener('click', () => {
          if (selectedPhotoIds.has(photo.id)) {
            selectedPhotoIds.delete(photo.id);
          } else {
            selectedPhotoIds.add(photo.id);
          }
          updateItemSelectionState();
          updateBatchActionsBar(filtered.length);
        });

        // Initialize state
        updateItemSelectionState();
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

// Select All button
btnSelectAll.addEventListener('click', () => {
  const activeTab = tabSelect.value;
  const filtered = currentUploadedPhotosList.filter(p => p.tabName === activeTab);
  filtered.forEach(photo => {
    selectedPhotoIds.add(photo.id);
  });
  const items = uploadedPhotosGrid.children;
  filtered.forEach((photo, idx) => {
    const item = items[idx];
    if (item) {
      const indicator = item.querySelector('.checkbox-indicator');
      if (indicator) {
        item.style.borderColor = 'var(--primary)';
        indicator.style.background = 'var(--primary)';
        indicator.style.borderColor = 'var(--primary)';
        indicator.textContent = '✓';
      }
    }
  });
  updateBatchActionsBar(filtered.length);
});

// Deselect All button
btnDeselectAll.addEventListener('click', () => {
  selectedPhotoIds.clear();
  const items = uploadedPhotosGrid.children;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const indicator = item.querySelector('.checkbox-indicator');
    if (indicator) {
      item.style.borderColor = 'var(--surface-border)';
      indicator.style.background = 'rgba(0,0,0,0.4)';
      indicator.style.borderColor = '#fff';
      indicator.textContent = '';
    }
  }
  const activeTab = tabSelect.value;
  const count = currentUploadedPhotosList.filter(p => p.tabName === activeTab).length;
  updateBatchActionsBar(count);
});

// Delete Selected Button
btnDeleteSelected.addEventListener('click', async () => {
  if (selectedPhotoIds.size === 0) return;
  const confirmed = await showModal({
    icon: '⚠️',
    title: 'Delete Selected Photos',
    sub: `Are you sure you want to permanently delete the ${selectedPhotoIds.size} selected photo(s)? This action cannot be undone.`,
    confirmText: 'Delete',
    danger: true
  });
  if (!confirmed) return;

  btnDeleteSelected.disabled = true;
  btnDeleteSelected.textContent = 'Deleting...';
  try {
    const response = await fetch(`${apiBaseUrl}/api/gallery/events/${currentGalleryId}/photos`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ photoIds: Array.from(selectedPhotoIds) })
    });
    
    if (response.ok) {
      selectedPhotoIds.clear();
      await loadUploadedPhotos();
      await showModal({
        icon: '✅',
        title: 'Deleted Successfully',
        sub: 'Selected photos have been deleted.',
        confirmText: 'OK'
      });
    } else {
      const err = await response.json();
      await showModal({
        icon: '❌',
        title: 'Delete Failed',
        sub: err.error || 'Failed to delete selected photos.',
        confirmText: 'OK',
        danger: true
      });
    }
  } catch (err) {
    await showModal({
      icon: '❌',
      title: 'Error',
      sub: err.message,
      confirmText: 'OK',
      danger: true
    });
  } finally {
    btnDeleteSelected.disabled = false;
    const activeTab = tabSelect.value;
    const count = currentUploadedPhotosList.filter(p => p.tabName === activeTab).length;
    updateBatchActionsBar(count);
  }
});

// Move Selected Button
btnMoveSelected.addEventListener('click', async () => {
  const targetTab = selectMoveTarget.value;
  if (!targetTab) {
    await showModal({
      icon: '⚠️',
      title: 'Select Target Tab',
      sub: 'Please select a destination tab to move the selected photos.',
      confirmText: 'OK'
    });
    return;
  }
  if (selectedPhotoIds.size === 0) return;
  
  btnMoveSelected.disabled = true;
  btnMoveSelected.textContent = 'Moving...';
  try {
    const response = await fetch(`${apiBaseUrl}/api/gallery/events/${currentGalleryId}/photos/move`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        photoIds: Array.from(selectedPhotoIds),
        targetTab: targetTab
      })
    });

    if (response.ok) {
      selectedPhotoIds.clear();
      await loadUploadedPhotos();
      await showModal({
        icon: '✅',
        title: 'Moved Successfully',
        sub: `Selected photos have been moved to "${targetTab}".`,
        confirmText: 'OK'
      });
    } else {
      const err = await response.json();
      await showModal({
        icon: '❌',
        title: 'Move Failed',
        sub: err.error || 'Failed to move selected photos.',
        confirmText: 'OK',
        danger: true
      });
    }
  } catch (err) {
    await showModal({
      icon: '❌',
      title: 'Error',
      sub: err.message,
      confirmText: 'OK',
      danger: true
    });
  } finally {
    btnMoveSelected.disabled = false;
    btnMoveSelected.textContent = 'Move';
    const activeTab = tabSelect.value;
    const count = currentUploadedPhotosList.filter(p => p.tabName === activeTab).length;
    updateBatchActionsBar(count);
  }
});

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
