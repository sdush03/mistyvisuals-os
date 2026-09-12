// Upload Queue & Pipeline Intercept Component

function initQueueUI() {
  const dropzone = document.getElementById('dropzone');
  const queueCancelBtn = document.getElementById('queue-cancel-btn');
  const queueStartBtn = document.getElementById('queue-start-btn');
  const toggleUploadedViewBtn = document.getElementById('toggle-uploaded-view-btn');

  const tabSelect = document.getElementById('tab-select');

  const updateDropzoneForTab = () => {
    const activeTab = tabSelect ? tabSelect.value : '';
    const isCinema = (activeTab || '').trim().toUpperCase() === 'CINEMA';
    const dropzoneTitle = dropzone ? dropzone.querySelector('.dropzone-title') : null;
    const dropzoneSub = dropzone ? dropzone.querySelector('.dropzone-sub') : null;
    const dropzoneIcon = dropzone ? dropzone.querySelector('.dropzone-icon') : null;
    const browseBtn = document.getElementById('browse-btn');
    const imageQualityGroup = document.getElementById('image-quality-group');
    const videoQualityGroup = document.getElementById('video-quality-group');
    const watermarkGroup = document.getElementById('watermark-group');
    const mainPanelTitle = document.getElementById('main-panel-title');

    if (isCinema) {
      if (dropzoneIcon) dropzoneIcon.textContent = '🎬';
      if (dropzoneTitle) dropzoneTitle.textContent = 'Drag & Drop Video(s) Here';
      if (dropzoneSub) dropzoneSub.textContent = 'Supports MP4 and MOV (Max 10GB per video)';
      if (browseBtn) browseBtn.textContent = 'Browse Video';
      if (imageQualityGroup) imageQualityGroup.style.display = 'none';
      if (videoQualityGroup) videoQualityGroup.style.display = 'block';
      if (watermarkGroup) watermarkGroup.style.display = 'none';
      if (toggleUploadedViewBtn && window.AppState.currentUploaderView === 'upload') {
        toggleUploadedViewBtn.textContent = 'View Uploaded Videos';
      }
      if (mainPanelTitle) {
        mainPanelTitle.textContent = window.AppState.currentUploaderView === 'uploaded' ? 'Cinema Showcase' : 'Upload Cinema Videos';
      }

      const vq = document.getElementById('video-quality');
      if (vq && !vq.value) {
        vq.value = '14mbps';
      }
    } else {
      if (dropzoneIcon) dropzoneIcon.textContent = '📂';
      if (dropzoneTitle) dropzoneTitle.textContent = 'Drag & Drop Folder Here';
      if (dropzoneSub) dropzoneSub.textContent = 'Supports JPG, JPEG, and PNG folder uploads';
      if (browseBtn) browseBtn.textContent = 'Browse Folder';
      if (imageQualityGroup) imageQualityGroup.style.display = 'block';
      if (videoQualityGroup) videoQualityGroup.style.display = 'none';
      if (watermarkGroup) watermarkGroup.style.display = 'flex';
      if (toggleUploadedViewBtn && window.AppState.currentUploaderView === 'upload') {
        toggleUploadedViewBtn.textContent = 'View Uploaded Photos';
      }
      if (mainPanelTitle) {
        mainPanelTitle.textContent = window.AppState.currentUploaderView === 'uploaded' ? 'Uploaded Photos' : 'Upload Photos';
      }
    }
  };

  const videoQuality = document.getElementById('video-quality');
  if (videoQuality) {
    try { localStorage.removeItem('mv_video_quality'); } catch (_) {}
    videoQuality.value = '14mbps';
  }

  if (tabSelect) {
    tabSelect.addEventListener('change', updateDropzoneForTab);
  }

  if (dropzone) {
    updateDropzoneForTab();

    dropzone.addEventListener('click', async () => {
      const activeTab = tabSelect ? tabSelect.value : '';
      const selected = (activeTab === 'Cinema' && window.api.selectVideoOrFolder)
        ? await window.api.selectVideoOrFolder()
        : await window.api.selectFolder();
      if (selected) {
        setFolder([selected]);
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

      const activeTab = tabSelect ? tabSelect.value : '';
      const isCinema = (activeTab || '').trim().toUpperCase() === 'CINEMA';

      if (window.AppState.currentUploaderView === 'upload') {
        window.AppState.currentUploaderView = 'uploaded';
        if (mainPanelTitle) mainPanelTitle.textContent = isCinema ? 'Cinema Showcase' : 'Uploaded Photos';
        toggleUploadedViewBtn.textContent = isCinema ? 'Back to Upload Video' : 'Back to Upload';
        
        if (dropzone) dropzone.style.display = 'none';
        if (uploadQueueCard) uploadQueueCard.style.display = 'none';
        if (uploadedPhotosCard) uploadedPhotosCard.style.display = 'flex';
        
        loadUploadedPhotos();
      } else {
        window.AppState.currentUploaderView = 'upload';
        if (mainPanelTitle) mainPanelTitle.textContent = isCinema ? 'Upload Cinema Videos' : 'Upload Photos';
        toggleUploadedViewBtn.textContent = isCinema ? 'View Uploaded Videos' : 'View Uploaded Photos';
        
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
    let scanResult = await window.api.getFolderFiles({ paths });

    if (scanResult.length === 0) {
      if (queueTotalStatus) queueTotalStatus.textContent = 'No media files found in the selected folder.';
      if (queueHeaderTitle) queueHeaderTitle.textContent = '0 Items';
      return;
    }

    const validDropdownTab = (tabSelect && tabSelect.value && tabSelect.value !== 'ALL') ? tabSelect.value : null;
    const selectedTab = (customTab ? customTab.value.trim() : '') || validDropdownTab;
    const isCinemaTab = selectedTab && selectedTab.trim().toUpperCase() === 'CINEMA';

    const videoExts = ['.mp4', '.mov', '.m4v'];
    const isVideoFile = (f) => {
      const name = f.name || f.path || '';
      const dotIdx = name.lastIndexOf('.');
      return dotIdx !== -1 && videoExts.includes(name.slice(dotIdx).toLowerCase());
    };

    if (isCinemaTab) {
      const videoFiles = scanResult.filter(f => isVideoFile(f));
      const nonVideos = scanResult.filter(f => !isVideoFile(f));

      // Detect any image files that can serve as covers or Coming Soon posters
      const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
      const imageFiles = nonVideos.filter(f => {
        const dotIdx = (f.name || f.path || '').lastIndexOf('.');
        return dotIdx !== -1 && imageExts.includes((f.name || f.path || '').slice(dotIdx).toLowerCase());
      });

      if (videoFiles.length === 0 && imageFiles.length > 0) {
        // Allow images to be uploaded as Coming Soon Cinema Posters
        imageFiles.forEach((img, idx) => {
          img.isComingSoon = true;
          img.customCoverPath = img.path;
          img.customCoverName = img.name;
          img.customCoverStatus = '4:3 Portrait Poster';
          img.hasBakedCover = false;

          const metaHelper = window.CinemaMetadata;
          if (metaHelper) {
            const subtype = metaHelper.detectCinemaSubtype(img.name, false);
            img.cinemaSubtype = subtype;
            img.cinemaCategory = metaHelper.mapSubtypeToCategory(subtype);
            img.title = metaHelper.generateCleanTitle(img.name, subtype);
            img.description = metaHelper.getRandomDescription(subtype);
          } else {
            img.cinemaCategory = 'THE DIRECTORS’ CUT';
            img.title = img.name.replace(/\.[a-zA-Z0-9]+$/, '');
            img.description = '';
          }
          const galleryName = (typeof getCurrentGalleryName === 'function' ? getCurrentGalleryName() : (window.getCurrentGalleryName ? window.getCurrentGalleryName() : ''));
          img.subtitle = galleryName || 'COMING SOON • TEASER POSTER';
          img.sortOrder = idx + 1;
          img.isFeatured = false;
        });

        scanResult = imageFiles;
      } else if (videoFiles.length === 0) {
        await showModal({
          icon: '🎬',
          title: 'Videos or Posters in Cinema',
          sub: 'The Cinema tab accepts video files (.mp4, .mov, .m4v) or movie posters (.jpg, .png) for Coming Soon previews.',
          confirmText: 'OK'
        });
        window.AppState.selectedFolderPaths = [];
        if (dropzone) dropzone.style.display = 'flex';
        if (uploadQueueCard) uploadQueueCard.style.display = 'none';
        return;
      } else {
        const getBaseName = (filename) => {
          const dotIdx = filename.lastIndexOf('.');
          return (dotIdx !== -1 ? filename.slice(0, dotIdx) : filename).toLowerCase().trim();
        };

        // Auto-pair matching images with videos by base name and initialize Cinema metadata
        videoFiles.forEach((v, idx) => {
          v.isVideo = true;
          const vBase = getBaseName(v.name);
          const matched = imageFiles.find(img => {
            const imgBase = getBaseName(img.name);
            if (imgBase === vBase) return true;
            if (imgBase === `${vBase}_cover` || imgBase === `${vBase}-cover`) return true;
            if (imgBase === `${vBase}_poster` || imgBase === `${vBase}-poster`) return true;
            return false;
          });

          if (matched) {
            v.customCoverPath = matched.path;
            v.customCoverName = matched.name;
          } else if (videoFiles.length === 1 && imageFiles.length === 1) {
            v.customCoverPath = imageFiles[0].path;
            v.customCoverName = imageFiles[0].name;
          }

          // Initialize Cinema metadata!
          const metaHelper = window.CinemaMetadata;
          if (metaHelper) {
            const subtype = metaHelper.detectCinemaSubtype(v.name, false);
            v.cinemaSubtype = subtype;
            v.cinemaCategory = metaHelper.mapSubtypeToCategory(subtype);
            v.title = metaHelper.generateCleanTitle(v.name, subtype);
            v.description = metaHelper.getRandomDescription(subtype);
          } else {
            v.cinemaCategory = 'THE DIRECTORS’ CUT';
            v.title = v.name.replace(/\.[a-zA-Z0-9]+$/, '');
            v.description = '';
          }
          const galleryName = (typeof getCurrentGalleryName === 'function' ? getCurrentGalleryName() : (window.getCurrentGalleryName ? window.getCurrentGalleryName() : ''));
          v.subtitle = galleryName || 'CHAPTER I • 18 MIN';
          v.sortOrder = idx + 1;
          v.isFeatured = (idx === 0);
        });

        scanResult = videoFiles;
      }
    } else {
      const videosInPhotoTab = scanResult.filter(f => isVideoFile(f));
      if (videosInPhotoTab.length > 0 && scanResult.length === videosInPhotoTab.length) {
        await showModal({
          icon: '📷',
          title: 'Photos Only',
          sub: 'This tab only accepts photos. Videos can only be uploaded to the Cinema tab.',
          confirmText: 'OK'
        });
        window.AppState.selectedFolderPaths = [];
        if (dropzone) dropzone.style.display = 'flex';
        if (uploadQueueCard) uploadQueueCard.style.display = 'none';
        return;
      }
      scanResult = scanResult.filter(f => !isVideoFile(f));
    }

    const hasDirectFiles = scanResult.some(file => file.rootFolder === null);

    if (hasDirectFiles && !selectedTab) {
      await showModal({
        icon: '⚠️',
        title: 'Select Event Tab',
        sub: 'Please select a gallery category tab or create a new one on the left before dragging files directly.',
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
      let fetchSuccess = false;
      let lastFetchErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const photosRes = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${window.AppState.currentGalleryId}/photos?limit=50000`, {
            headers: { 'Authorization': `Bearer ${window.AppState.authToken}` }
          });
          if (photosRes.ok) {
            const photosData = await photosRes.json();
            window.AppState.currentUploadedPhotosList = photosData.photos || [];
            fetchSuccess = true;
            break;
          } else {
            lastFetchErr = new Error(`Server returned HTTP ${photosRes.status}`);
          }
        } catch (err) {
          lastFetchErr = err;
        }
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 800 * attempt));
        }
      }

      if (!fetchSuccess && lastFetchErr) {
        console.error('[Deduplication] Failed to fetch existing photos after 3 attempts:', lastFetchErr);
        const confirmBypass = await showModal({
          icon: '⚠️',
          title: 'Duplicate Check Failed',
          sub: `Could not verify already-uploaded photos after 3 attempts (${lastFetchErr.message}).\n\nWhat to do: Check your internet connection or server. Click "Upload Anyway" to bypass duplicate checking, or "Cancel" to abort.`,
          confirmText: 'Upload Anyway',
          danger: true
        });
        if (!confirmBypass) {
          const queueStartBtn = document.getElementById('queue-start-btn');
          if (queueStartBtn) queueStartBtn.disabled = false;
          return;
        }
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

function moveQueueItem(fromIndex, toIndex) {
  const files = window.AppState.resolvedFiles;
  if (fromIndex < 0 || fromIndex >= files.length || toIndex < 0 || toIndex >= files.length) return;
  const temp = files[fromIndex];
  files[fromIndex] = files[toIndex];
  files[toIndex] = temp;
  files.forEach((f, i) => {
    f.sortOrder = i + 1;
  });
  renderQueueList();
}

function getRowCinemaDetailsHtml(file, index, totalCount) {
  const metaHelper = window.CinemaMetadata;
  const categories = metaHelper ? metaHelper.CINEMA_CATEGORIES : [
    'THE DIRECTORS’ CUT',
    'CANDID DIARIES',
    'STAGE & SPOTLIGHT',
    'THE EXTENDED CUTS'
  ];

  const currentCategory = file.cinemaCategory || 'THE DIRECTORS’ CUT';
  const categoryOptions = categories.map(cat => 
    `<option value="${cat}" ${cat === currentCategory ? 'selected' : ''}>${cat}</option>`
  ).join('');

  const isPhotoFile = !['.mp4', '.mov', '.m4v'].some(ext => (file.name || file.path || '').toLowerCase().endsWith(ext));
  if (isPhotoFile) {
    file.isComingSoon = true;
    if (!file.subtitle || file.subtitle === 'CHAPTER I • 18 MIN') {
      file.subtitle = 'COMING SOON • TEASER POSTER';
    }
  }

  const hasCover = Boolean(file.customCoverPath || file.customCoverPreview || file.customCoverBase64);
  const isBaked = Boolean(file.hasBakedCover || file.isCoverBaked);

  let statusBorder = '1px dashed rgba(239, 68, 68, 0.6)';
  let statusBg = 'rgba(239, 68, 68, 0.08)';
  let coverLabel = '⚠️ Poster & Typography Required (Compulsory)';
  let coverSubLabel = '<span style="color: #ef4444; font-weight: 600;">⚠️ Mandatory: Click "Upload & Bake Poster" to proceed.</span>';
  let designBtnText = '🎨 Upload & Bake Poster';
  let designBtnStyle = 'padding: 4px 10px; font-size: 10px; font-weight: 700; background: #ef4444; border: 1px solid #dc2626; border-radius: 6px; color: #fff; cursor: pointer;';

  if (hasCover && !isBaked) {
    statusBorder = '1px dashed rgba(245, 158, 11, 0.6)';
    statusBg = 'rgba(245, 158, 11, 0.08)';
    coverLabel = '⚠️ Typography Not Baked (Compulsory)';
    coverSubLabel = '<span style="color: #fbbf24; font-weight: 600;">⚠️ Mandatory: Open Poster Studio to bake title onto poster.</span>';
    designBtnText = '🎨 Bake in Poster Studio';
    designBtnStyle = 'padding: 4px 10px; font-size: 10px; font-weight: 700; background: #f59e0b; border: 1px solid #d97706; border-radius: 6px; color: #000; cursor: pointer;';
  } else if (hasCover && isBaked) {
    statusBorder = '1px solid rgba(16, 185, 129, 0.4)';
    statusBg = 'rgba(16, 185, 129, 0.06)';
    coverLabel = `✓ ${file.customCoverName || 'Baked Poster'} (Text Baked)`;
    coverSubLabel = '<span style="color: #34d399; font-weight: 600;">✓ Editorial typography baked onto 4:3 poster. Ready to upload.</span>';
    designBtnText = '🎨 Redesign Poster';
    designBtnStyle = 'padding: 4px 9px; font-size: 10px; font-weight: 700; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 6px; color: #34d399; cursor: pointer;';
  }

  const coverThumb = file.customCoverPreview
    ? `<img src="${file.customCoverPreview}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" />`
    : `<span style="font-size: 16px;">⚠️</span>`;

  const isFirst = index === 0;
  const isLast = index === totalCount - 1;

  return `
    <div class="q-cinema-card" data-index="${index}" style="
      margin-top: 10px;
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    ">
      <!-- Top Controls Row: Sequence, Category, Featured Toggle -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="
            font-size: 10px;
            font-weight: 700;
            color: var(--primary);
            background: rgba(16, 185, 129, 0.12);
            padding: 3px 8px;
            border-radius: 4px;
            border: 1px solid rgba(16, 185, 129, 0.25);
          ">#${index + 1}</span>

          <!-- Move Up / Down Buttons -->
          <div style="display: flex; gap: 3px;">
            <button type="button" class="btn-move-up" data-index="${index}" ${isFirst ? 'disabled style="opacity: 0.35; cursor: not-allowed; padding: 2px 7px; font-size: 10px; background: rgba(255,255,255,0.06); border: 1px solid var(--surface-border); border-radius: 4px; color: #fff;"' : 'style="padding: 2px 7px; font-size: 10px; background: rgba(255,255,255,0.06); border: 1px solid var(--surface-border); border-radius: 4px; color: #fff; cursor: pointer;"'} title="Move Up in Sequence">▲</button>
            <button type="button" class="btn-move-down" data-index="${index}" ${isLast ? 'disabled style="opacity: 0.35; cursor: not-allowed; padding: 2px 7px; font-size: 10px; background: rgba(255,255,255,0.06); border: 1px solid var(--surface-border); border-radius: 4px; color: #fff;"' : 'style="padding: 2px 7px; font-size: 10px; background: rgba(255,255,255,0.06); border: 1px solid var(--surface-border); border-radius: 4px; color: #fff; cursor: pointer;"'} title="Move Down in Sequence">▼</button>
          </div>

          <!-- Category Shelf Selector -->
          <div style="display: flex; align-items: center; gap: 5px; margin-left: 6px;">
            <span style="font-size: 10px; color: var(--text-muted); font-weight: 600;">SHELF:</span>
            <select class="q-cinema-category-select" data-index="${index}" style="
              background: #141418;
              border: 1px solid rgba(255,255,255,0.18);
              color: #fff;
              font-size: 11px;
              font-weight: 600;
              padding: 4px 8px;
              border-radius: 6px;
              outline: none;
              cursor: pointer;
            ">
              ${categoryOptions}
            </select>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <!-- Automatic Coming Soon Badge (Decided automatically, no manual toggle checkmark) -->
          ${file.isComingSoon ? `
            <span style="
              padding: 4px 8px;
              font-size: 10px;
              font-weight: 700;
              background: rgba(229, 196, 131, 0.15);
              border: 1px solid #E5C483;
              border-radius: 6px;
              color: #E5C483;
              display: flex;
              align-items: center;
              gap: 4px;
            ">✨ Coming Soon</span>
          ` : ''}

          <!-- Featured Star Button -->
          <button type="button" class="btn-toggle-featured" data-index="${index}" style="
            padding: 4px 10px;
            font-size: 10px;
            font-weight: 700;
            background: ${file.isFeatured ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255, 255, 255, 0.06)'};
            border: 1px solid ${file.isFeatured ? '#E50914' : 'var(--surface-border)'};
            border-radius: 6px;
            color: ${file.isFeatured ? '#ff4d4d' : 'var(--text-muted)'};
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: all 0.15s ease;
          " title="${file.isFeatured ? 'Featured Video (Spotlighted on Hero Marquee)' : 'Click to spotlight on Hero Marquee'}">
            ${file.isFeatured ? '★ Featured on Hero' : '☆ Feature on Hero'}
          </button>
        </div>
      </div>

      <!-- Middle: Editable Title & Synopsis with Shuffle Button -->
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 10px; color: var(--text-muted); font-weight: 600; width: 55px;">TITLE:</span>
          <input type="text" class="q-cinema-title-input" data-index="${index}" value="${(file.title || '').replace(/"/g, '&quot;')}" placeholder="Film Title (e.g. The Wedding Film, Haldi Ritual)" style="
            flex: 1;
            background: #121216;
            border: 1px solid rgba(255,255,255,0.12);
            color: #fff;
            font-size: 11px;
            padding: 5px 8px;
            border-radius: 6px;
            outline: none;
          " />
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 10px; color: var(--text-muted); font-weight: 600; width: 55px;">SUBTITLE:</span>
          <input type="text" class="q-cinema-subtitle-input" data-index="${index}" value="${(file.subtitle || '').replace(/"/g, '&quot;')}" placeholder="Subtitle (e.g. CHAPTER I • 18 MIN or COMING SOON • TEASER POSTER)" style="
            flex: 1;
            background: #121216;
            border: 1px solid rgba(255,255,255,0.12);
            color: #fff;
            font-size: 11px;
            padding: 5px 8px;
            border-radius: 6px;
            outline: none;
          " />
        </div>

        <div style="display: flex; align-items: flex-start; gap: 8px;">
          <span style="font-size: 10px; color: var(--text-muted); font-weight: 600; width: 55px; padding-top: 5px;">SYNOPSIS:</span>
          <div style="display: flex; flex: 1; gap: 6px;">
            <textarea class="q-cinema-desc-input" data-index="${index}" rows="3" placeholder="Poetic story synopsis or description..." style="
              flex: 1;
              background: #121216;
              border: 1px solid rgba(255,255,255,0.12);
              color: var(--text);
              font-size: 11px;
              line-height: 1.4;
              padding: 6px 8px;
              border-radius: 6px;
              outline: none;
              resize: vertical;
              font-family: inherit;
            ">${(file.description || '').replace(/</g, '&lt;')}</textarea>
            <button type="button" class="btn-shuffle-desc" data-index="${index}" style="
              padding: 6px 10px;
              font-size: 10px;
              font-weight: 600;
              background: rgba(255, 255, 255, 0.07);
              border: 1px solid rgba(255, 255, 255, 0.15);
              border-radius: 6px;
              color: #fff;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 4px;
              align-self: flex-start;
              white-space: nowrap;
            " title="Generate random high-end synopsis from library">🎲 Shuffle</button>
          </div>
        </div>
      </div>

      <!-- Bottom: 4:3 Portrait Movie Poster Selector (Compulsory for Cinema) -->
      <div class="q-cover-dropzone" data-index="${index}" style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: ${statusBg};
        border: ${statusBorder};
        border-radius: 8px;
        transition: all 0.2s ease;
      ">
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
          <!-- 3:4 Portrait Frame: 36px width x 48px height -->
          <div style="
            width: 36px;
            height: 48px;
            border-radius: 4px;
            overflow: hidden;
            background: #000;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid ${hasCover ? (isBaked ? 'rgba(16, 185, 129, 0.5)' : 'rgba(245, 158, 11, 0.5)') : 'rgba(239, 68, 68, 0.5)'};
            flex-shrink: 0;
          ">
            ${coverThumb}
          </div>
          <div style="display: flex; flex-direction: column; gap: 3px; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 11px; font-weight: 600; color: ${hasCover ? (isBaked ? '#34d399' : '#fbbf24') : '#ef4444'}; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                ${coverLabel}
              </span>
              <span style="font-size: 9px; padding: 1px 5px; border-radius: 4px; background: rgba(255,255,255,0.06); color: var(--text-muted);">4:3 Poster</span>
            </div>
            <span style="font-size: 9px; line-height: 1.3;">
              ${coverSubLabel}
            </span>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <button type="button" class="btn-design-poster" data-index="${index}" style="${designBtnStyle}">${designBtnText}</button>
          <button type="button" class="btn-select-cover" data-index="${index}" style="
            padding: 4px 8px;
            font-size: 10px;
            font-weight: 600;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid var(--surface-border);
            border-radius: 6px;
            color: #fff;
            cursor: pointer;
          ">${hasCover ? 'Replace Photo' : 'Select Photo'}</button>
          ${hasCover ? `
            <button type="button" class="btn-remove-cover" data-index="${index}" style="
              padding: 4px 7px;
              font-size: 10px;
              font-weight: bold;
              background: transparent;
              border: 1px solid rgba(239, 68, 68, 0.3);
              border-radius: 6px;
              color: #ef4444;
              cursor: pointer;
            " title="Reset poster">✕</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function attachCinemaRowHandlers(container, file, index) {
  if (!container) return;

  const moveUpBtn = container.querySelector('.btn-move-up');
  if (moveUpBtn) {
    moveUpBtn.onclick = (e) => {
      e.stopPropagation();
      moveQueueItem(index, index - 1);
    };
  }

  const moveDownBtn = container.querySelector('.btn-move-down');
  if (moveDownBtn) {
    moveDownBtn.onclick = (e) => {
      e.stopPropagation();
      moveQueueItem(index, index + 1);
    };
  }

  const catSelect = container.querySelector('.q-cinema-category-select');
  if (catSelect) {
    catSelect.onchange = (e) => {
      file.cinemaCategory = e.target.value;
    };
  }

  const titleInput = container.querySelector('.q-cinema-title-input');
  if (titleInput) {
    titleInput.oninput = (e) => {
      file.title = e.target.value;
    };
  }

  const subtitleInput = container.querySelector('.q-cinema-subtitle-input');
  if (subtitleInput) {
    subtitleInput.oninput = (e) => {
      file.subtitle = e.target.value;
    };
  }

  const descInput = container.querySelector('.q-cinema-desc-input');
  if (descInput) {
    descInput.oninput = (e) => {
      file.description = e.target.value;
    };
  }

  const shuffleBtn = container.querySelector('.btn-shuffle-desc');
  if (shuffleBtn) {
    shuffleBtn.onclick = (e) => {
      e.stopPropagation();
      const metaHelper = window.CinemaMetadata;
      if (metaHelper) {
        const newDesc = metaHelper.getRandomDescription(file.cinemaSubtype || file.cinemaCategory);
        file.description = newDesc;
        if (descInput) descInput.value = newDesc;
      }
    };
  }

  const featuredBtn = container.querySelector('.btn-toggle-featured');
  if (featuredBtn) {
    featuredBtn.onclick = (e) => {
      e.stopPropagation();
      const willBeFeatured = !file.isFeatured;
      if (willBeFeatured && window.AppState?.resolvedFiles) {
        window.AppState.resolvedFiles.forEach(f => {
          f.isFeatured = false;
        });
      }
      file.isFeatured = willBeFeatured;
      renderQueueList();
    };
  }

  const selectBtn = container.querySelector('.btn-select-cover');
  if (selectBtn) {
    selectBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        const chosenPath = await window.api.selectVideoCover(file.name);
        if (chosenPath) {
          file.customCoverPath = chosenPath;
          file.customCoverName = chosenPath.split(/[/\\]/).pop();
          const inspected = await window.api.inspectCoverImage(chosenPath);
          if (inspected) {
            file.customCoverPreview = inspected.previewDataUrl;
            file.customCoverHighRes = inspected.highResDataUrl;
            file.rawCoverHighRes = inspected.highResDataUrl;
            file.rawCoverPreview = inspected.previewDataUrl;
            file.customCoverStatus = '4:3 Portrait Poster';
            file.hasBakedCover = false;
            file.isCoverBaked = false;
          }
          renderQueueList();
        }
      } catch (err) {
        console.error('Failed to select cover:', err);
      }
    };
  }

  const designBtn = container.querySelector('.btn-design-poster');
  if (designBtn) {
    designBtn.onclick = async (e) => {
      e.stopPropagation();
      let cleanImage = file.rawCoverHighRes || file.customCoverHighRes;

      if (!cleanImage && file.isComingSoon && file.path && window.api.inspectCoverImage) {
        try {
          const inspected = await window.api.inspectCoverImage(file.path);
          if (inspected && (inspected.highResDataUrl || inspected.previewDataUrl)) {
            file.rawCoverHighRes = inspected.highResDataUrl || inspected.previewDataUrl;
            file.rawCoverPreview = inspected.previewDataUrl;
            file.customCoverPreview = inspected.previewDataUrl;
            file.customCoverHighRes = inspected.highResDataUrl;
            file.customCoverStatus = '4:3 Portrait Poster';
            cleanImage = file.rawCoverHighRes;
          }
        } catch (err) {
          console.error('Failed to inspect coming soon poster image:', err);
        }
      }

      // Only open editor if a clean photo is available or selected
      if (!cleanImage) {
        try {
          const chosenPath = await window.api.selectVideoCover(file.name);
          if (!chosenPath) return; // User canceled dialog -> do NOT open editor
          file.customCoverPath = chosenPath;
          file.customCoverName = chosenPath.split(/[/\\]/).pop();
          const inspected = await window.api.inspectCoverImage(chosenPath);
          if (inspected && (inspected.highResDataUrl || inspected.previewDataUrl)) {
            file.rawCoverHighRes = inspected.highResDataUrl || inspected.previewDataUrl;
            file.rawCoverPreview = inspected.previewDataUrl;
            file.customCoverPreview = inspected.previewDataUrl;
            file.customCoverStatus = '4:3 Portrait Poster';
            cleanImage = file.rawCoverHighRes;
            renderQueueList();
          }
        } catch (err) {
          console.error('Failed to select cover:', err);
          return;
        }
      }

      if (!cleanImage) return;

      if (window.PosterStudio && window.PosterStudio.open) {
        const galleryName = (typeof getCurrentGalleryName === 'function' ? getCurrentGalleryName() : (window.getCurrentGalleryName ? window.getCurrentGalleryName() : ''));
        window.PosterStudio.open({
          initialImage: cleanImage, // Fresh clean photo without old baked text!
          initialTitle: file.title || file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' '),
          initialSubtitle: file.subtitle || (file.isComingSoon ? 'COMING SOON • TEASER POSTER' : (galleryName || 'CHAPTER I • 18 MIN')),
          onSave: async ({ base64Data, tempFilePath, config }) => {
            file.customCoverPreview = base64Data;
            file.customCoverPath = tempFilePath;
            file.customCoverBase64 = base64Data;
            file.customCoverName = 'Baked 4:3 Poster';
            file.customCoverStatus = '4:3 Portrait Poster';
            file.hasBakedCover = true;
            file.isCoverBaked = true;
            if (config && config.title) file.title = config.title;
            if (config && config.subtitle !== undefined) file.subtitle = config.subtitle;
            renderQueueList();
          }
        });
      }
    };
  }

  const removeBtn = container.querySelector('.btn-remove-cover');
  if (removeBtn) {
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      file.customCoverPath = null;
      file.customCoverName = null;
      file.customCoverPreview = null;
      file.customCoverBase64 = null;
      file.rawCoverHighRes = null;
      file.rawCoverPreview = null;
      file.customCoverStatus = null;
      file.hasBakedCover = false;
      file.isCoverBaked = false;
      renderQueueList();
    };
  }

  const coverDropzone = container.querySelector('.q-cover-dropzone');
  if (coverDropzone) {
    coverDropzone.ondragover = (e) => {
      e.preventDefault();
      e.stopPropagation();
      coverDropzone.style.borderColor = 'var(--primary)';
      coverDropzone.style.background = 'rgba(16, 185, 129, 0.15)';
    };

    coverDropzone.ondragleave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const hasCover = Boolean(file.customCoverPath || file.customCoverPreview);
      const isBaked = Boolean(file.hasBakedCover || file.isCoverBaked);
      coverDropzone.style.borderColor = hasCover ? (isBaked ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.6)') : 'rgba(239, 68, 68, 0.6)';
      coverDropzone.style.background = hasCover ? (isBaked ? 'rgba(16, 185, 129, 0.06)' : 'rgba(245, 158, 11, 0.08)') : 'rgba(239, 68, 68, 0.08)';
    };

    coverDropzone.ondrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const dropped = e.dataTransfer.files[0];
        const ext = dropped.name.slice(dropped.name.lastIndexOf('.')).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          file.customCoverPath = dropped.path;
          file.customCoverName = dropped.name;
          file.hasBakedCover = false;
          file.isCoverBaked = false;
          const inspected = await window.api.inspectCoverImage(dropped.path);
          if (inspected) {
            file.customCoverPreview = inspected.previewDataUrl;
            file.customCoverHighRes = inspected.highResDataUrl;
            file.rawCoverHighRes = inspected.highResDataUrl;
            file.rawCoverPreview = inspected.previewDataUrl;
            file.customCoverStatus = '4:3 Portrait Poster';
          }
          renderQueueList();

          // Immediately open Poster Studio so text is baked onto the newly dropped poster
          const cleanImage = inspected ? (inspected.highResDataUrl || inspected.previewDataUrl) : null;
          if (cleanImage && window.PosterStudio && window.PosterStudio.open) {
            const galleryName = (typeof getCurrentGalleryName === 'function' ? getCurrentGalleryName() : (window.getCurrentGalleryName ? window.getCurrentGalleryName() : ''));
            window.PosterStudio.open({
              initialImage: cleanImage,
              initialTitle: file.title || file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' '),
              initialSubtitle: file.subtitle || (file.isComingSoon ? 'COMING SOON • TEASER POSTER' : (galleryName || 'CHAPTER I • 18 MIN')),
              onSave: async ({ base64Data, tempFilePath, config }) => {
                file.customCoverPreview = base64Data;
                file.customCoverPath = tempFilePath;
                file.customCoverBase64 = base64Data;
                file.hasBakedCover = true;
                file.isCoverBaked = true;
                if (config && config.title) file.title = config.title;
                if (config && config.subtitle !== undefined) file.subtitle = config.subtitle;
                renderQueueList();
              }
            });
          }
        }
      }
    };
  }
}

function renderQueueList() {
  const queueItemsList = document.getElementById('queue-items-list');
  if (!queueItemsList) return;

  queueItemsList.innerHTML = '';
  const fragment = document.createDocumentFragment();
  const videoExts = ['.mp4', '.mov', '.m4v'];

  window.AppState.resolvedFiles.forEach((file, index) => {
    const row = document.createElement('div');
    row.className = 'queue-row';
    row.id = `q-row-${index}`;
    
    const fileMB = (file.sizeBytes / (1024 * 1024)).toFixed(2);
    const isDup = file.isAlreadyUploaded;
    const statusText = isDup ? '✓ Uploaded' : 'Pending';
    const statusColor = isDup ? 'var(--primary)' : 'var(--text-muted)';
    const isVideo = (file.tabName || '').toUpperCase() === 'CINEMA' || videoExts.some(ext => (file.name || '').toLowerCase().endsWith(ext));

    let cinemaBlockHtml = '';
    if (isVideo) {
      cinemaBlockHtml = getRowCinemaDetailsHtml(file, index, window.AppState.resolvedFiles.length);
    }
    
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
      ${cinemaBlockHtml}
      <div class="q-row-progress-container" style="display: ${isDup ? 'block' : 'none'}; margin-top: 4px;">
        <div class="q-row-progress" style="width: ${isDup ? '100%' : '0%'}; background: var(--primary);"></div>
      </div>
    `;

    if (isVideo) {
      const cinemaCard = row.querySelector('.q-cinema-card');
      attachCinemaRowHandlers(cinemaCard, file, index);

      // Asynchronous background preview inspection for auto-paired covers
      if (file.customCoverPath && !file.customCoverPreview && window.api.inspectCoverImage) {
        window.api.inspectCoverImage(file.customCoverPath).then(inspected => {
          if (inspected && file.customCoverPath) {
            file.customCoverPreview = inspected.previewDataUrl;
            file.customCoverHighRes = inspected.highResDataUrl;
            file.customCoverStatus = '4:3 Portrait Poster';
            if (cinemaCard) {
              const previewBox = cinemaCard.querySelector('.q-cover-dropzone img');
              if (!previewBox) {
                renderQueueList();
              }
            }
          }
        }).catch(() => {});
      }
    }

    fragment.appendChild(row);
  });
  queueItemsList.appendChild(fragment);
}

async function ensureTabExists(tabName, eventId) {
  const tabSelect = document.getElementById('tab-select');
  if (tabSelect) {
    const exists = Array.from(tabSelect.options).some(opt => opt.value === tabName);
    if (exists) return { ok: true };
  }

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
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
        return { ok: true };
      } else {
        const text = await res.text().catch(() => '');
        lastErr = new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }
    } catch (err) {
      lastErr = err;
    }
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 600 * attempt));
    }
  }

  console.error(`[Tabs] Failed to create tab "${tabName}" after 3 attempts:`, lastErr);
  return { ok: false, error: lastErr ? lastErr.message : 'Unknown network error' };
}

async function onQueueStart() {
  const queueStartBtn = document.getElementById('queue-start-btn');
  const queueCancelBtn = document.getElementById('queue-cancel-btn');
  const queueTotalProgress = document.getElementById('queue-total-progress');
  const queueTotalStatus = document.getElementById('queue-total-status');
  const queueHeaderTitle = document.getElementById('queue-header-title');
  const queueCompletedMsg = document.getElementById('queue-completed-msg');
  const uploadQuality = document.getElementById('upload-quality');
  const videoQuality = document.getElementById('video-quality');
  const watermarkToggle = document.getElementById('watermark-toggle');
  const tabSelect = document.getElementById('tab-select');
  const selectedTab = tabSelect ? tabSelect.value : '';
  const hasCinemaFiles = window.AppState.resolvedFiles.some(f => (f.tabName || '').trim().toUpperCase() === 'CINEMA' || f.isVideo);
  const isCinemaTab = (selectedTab && selectedTab.trim().toUpperCase() === 'CINEMA') || hasCinemaFiles;

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

  // Strictly enforce compulsory poster upload and typography baking for Cinema
  if (isCinemaTab) {
    const unreadyCinemaFiles = window.AppState.resolvedFiles.filter(f => {
      const isVid = f.isVideo || ['.mp4', '.mov', '.m4v', '.webm'].some(ext => (f.name || f.path || '').toLowerCase().endsWith(ext));
      const isCinemaItem = isVid || f.isComingSoon || (f.tabName || '').trim().toUpperCase() === 'CINEMA';
      if (!isCinemaItem) return false;
      const hasCover = Boolean(f.customCoverPath || f.customCoverPreview || f.customCoverBase64);
      const isBaked = Boolean(f.hasBakedCover || f.isCoverBaked);
      return !hasCover || !isBaked;
    });

    if (unreadyCinemaFiles.length > 0) {
      const firstUnready = unreadyCinemaFiles[0];
      const hasNoCover = !firstUnready.customCoverPath && !firstUnready.customCoverPreview && !firstUnready.customCoverBase64;
      await showModal({
        icon: '🎨',
        title: hasNoCover ? 'Poster Upload Required' : 'Editorial Typography Required',
        sub: hasNoCover
          ? `Every cinema film requires a custom poster photo with editorial typography baked on.\n\n"${firstUnready.title || firstUnready.name}" has no poster selected. Click "Upload & Bake Poster" on the film card to proceed.`
          : `Every cinema film requires editorial typography baked onto its poster before uploading.\n\n"${firstUnready.title || firstUnready.name}" poster is not baked. Click "Bake in Poster Studio" on the film card to proceed.`,
        confirmText: 'OK',
        danger: true
      });
      return;
    }
  }

  // Prompt confirmation modal before beginning upload
  const firstCinemaFile = window.AppState.resolvedFiles.find(f => (f.tabName || '').trim().toUpperCase() === 'CINEMA' || f.isVideo);
  const isComingSoon = Boolean(firstCinemaFile && firstCinemaFile.isComingSoon);
  const hasCustomCover = Boolean(firstCinemaFile && (firstCinemaFile.customCoverPath || firstCinemaFile.customCoverPreview));
  const posterPreviewUrl = firstCinemaFile ? (firstCinemaFile.customCoverPreview || firstCinemaFile.previewDataUrl || null) : null;
  const isCoverBaked = firstCinemaFile ? Boolean(firstCinemaFile.hasBakedCover || firstCinemaFile.isCoverBaked) : false;
  const hasVideoFile = window.AppState.resolvedFiles.some(f => {
    const isVid = f.isVideo || ['.mp4', '.mov', '.m4v', '.webm'].some(ext => (f.name || f.path || '').toLowerCase().endsWith(ext));
    return isVid && !f.isComingSoon;
  });
  const totalCount = window.AppState.resolvedFiles.length;
  const countText = isCinemaTab 
    ? `${totalCount} ${totalCount === 1 ? (hasVideoFile ? 'Film' : 'Coming Soon Poster') : (hasVideoFile ? 'Films' : 'Posters')}`
    : `${totalCount} ${totalCount === 1 ? 'Photo' : 'Photos'}`;

  let confirmedSettings = null;
  if (typeof showUploadSettingsModal === 'function') {
    confirmedSettings = await showUploadSettingsModal({
      mode: isCinemaTab ? 'cinema' : 'photos',
      tabName: selectedTab || (isCinemaTab ? 'Cinema' : 'Gallery'),
      countText,
      initialQuality: uploadQuality ? uploadQuality.value : '4k',
      initialBitrate: videoQuality ? videoQuality.value : '14mbps',
      initialWatermark: watermarkToggle ? watermarkToggle.checked : true,
      hasVideoFile,
      hasCustomCover,
      isComingSoon,
      posterPreviewUrl,
      isCoverBaked,
      filmTitle: firstCinemaFile ? (firstCinemaFile.title || firstCinemaFile.name) : undefined,
      confirmBtnText: 'Confirm & Start Upload',
      onOpenStudio: async (onStudioDone) => {
        if (!firstCinemaFile) return;
        const galleryName = (typeof getCurrentGalleryName === 'function' ? getCurrentGalleryName() : (window.getCurrentGalleryName ? window.getCurrentGalleryName() : ''));
        let cleanImg = firstCinemaFile.customCoverHighRes || firstCinemaFile.customCoverPreview || firstCinemaFile.previewDataUrl;
        if (!cleanImg && firstCinemaFile.path && !['.mp4', '.mov', '.m4v', '.webm'].some(ext => firstCinemaFile.path.toLowerCase().endsWith(ext))) {
          cleanImg = firstCinemaFile.path;
        }

        if (!cleanImg) {
          try {
            const chosen = await window.api.selectVideoCover(firstCinemaFile.name);
            if (!chosen) return;
            firstCinemaFile.customCoverPath = chosen;
            firstCinemaFile.customCoverName = chosen.split(/[/\\]/).pop();
            const inspected = await window.api.inspectCoverImage(chosen);
            if (inspected) {
              firstCinemaFile.customCoverPreview = inspected.previewDataUrl;
              firstCinemaFile.customCoverHighRes = inspected.highResDataUrl;
              cleanImg = inspected.highResDataUrl || inspected.previewDataUrl;
            }
          } catch (e) {
            console.error('Failed to select cover for Poster Studio:', e);
            return;
          }
        }

        if (cleanImg && window.PosterStudio && window.PosterStudio.open) {
          window.PosterStudio.open({
            initialImage: cleanImg,
            initialTitle: firstCinemaFile.title || firstCinemaFile.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' '),
            initialSubtitle: firstCinemaFile.subtitle || (firstCinemaFile.isComingSoon ? 'COMING SOON • TEASER POSTER' : (galleryName || 'CHAPTER I • 18 MIN')),
            onSave: async ({ base64Data, tempFilePath, config }) => {
              firstCinemaFile.customCoverPreview = base64Data;
              firstCinemaFile.customCoverPath = tempFilePath;
              firstCinemaFile.customCoverBase64 = base64Data;
              firstCinemaFile.hasBakedCover = true;
              firstCinemaFile.isCoverBaked = true;
              if (config && config.title) firstCinemaFile.title = config.title;
              if (config && config.subtitle !== undefined) firstCinemaFile.subtitle = config.subtitle;
              renderQueueList();
              if (typeof onStudioDone === 'function') {
                onStudioDone({ previewUrl: base64Data, base64Data, tempFilePath });
              }
            }
          });
        }
      }
    });

    if (!confirmedSettings) {
      // User cancelled
      return;
    }

    // Synchronize chosen settings back to sidebar UI controls
    if (uploadQuality && confirmedSettings.uploadQuality) uploadQuality.value = confirmedSettings.uploadQuality;
    if (videoQuality && confirmedSettings.videoQuality) videoQuality.value = confirmedSettings.videoQuality;
    if (watermarkToggle && typeof confirmedSettings.applyWatermark === 'boolean') watermarkToggle.checked = confirmedSettings.applyWatermark;
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

  const initialNoun = isCinemaTab ? (window.AppState.resolvedFiles.length === 1 ? 'Film' : 'Films') : (window.AppState.resolvedFiles.length === 1 ? 'Photo' : 'Photos');
  if (queueHeaderTitle) queueHeaderTitle.textContent = `${preCompletedCount}/${window.AppState.resolvedFiles.length} ${initialNoun}`;

  if (queueTotalStatus) queueTotalStatus.textContent = 'Running preflight checks...';
  let skipFaceScanning = false;
  let preflightSuccess = false;
  const setupScreen = document.getElementById('setup-screen');

  const hasPhotosToScan = window.AppState.resolvedFiles.some(f => {
    const isVideo = f.isVideo || ['.mp4', '.mov', '.m4v', '.webm'].some(ext => (f.name || f.path || '').toLowerCase().endsWith(ext));
    return !isVideo && !f.isComingSoon;
  });

  if (!hasPhotosToScan) {
    skipFaceScanning = true;
    preflightSuccess = true;
  }

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
      const tabRes = await ensureTabExists(tab, eventId);
      if (!tabRes.ok) {
        await showModal({
          icon: '❌',
          title: 'Category Tab Creation Failed',
          sub: `Failed to create or verify category tab "${tab}" on the server after 3 attempts (${tabRes.error}).\n\nWhat to do: Check your admin login or internet connection. You can also create the tab manually in the admin dashboard before uploading.`,
          confirmText: 'OK',
          danger: true
        });
        resetUploadUIState();
        return;
      }
    }
  } catch (tabErr) {
    console.error('Failed to pre-create tabs:', tabErr);
    await showModal({
      icon: '❌',
      title: 'Category Tab Error',
      sub: `Unexpected error verifying categories: ${tabErr.message}.\n\nWhat to do: Check your folder structure and internet connection, then retry.`,
      confirmText: 'OK',
      danger: true
    });
    resetUploadUIState();
    return;
  }

  if (queueTotalStatus) queueTotalStatus.textContent = 'Starting upload pipeline...';

  try {
    const result = await window.api.processPhotos({
      resolvedFiles: window.AppState.resolvedFiles,
      eventId,
      eventSlug,
      backendUrl: window.AppState.apiBaseUrl,
      token: window.AppState.authToken,
      uploadQuality: confirmedSettings ? confirmedSettings.uploadQuality : (uploadQuality ? uploadQuality.value : '4k'),
      videoQuality: confirmedSettings ? confirmedSettings.videoQuality : (videoQuality ? videoQuality.value : '14mbps'),
      applyWatermark: isCinemaTab ? false : (confirmedSettings ? confirmedSettings.applyWatermark : (watermarkToggle ? watermarkToggle.checked : true)),
      concurrency: window.AppState.uploadWorkers,
      daemons: (skipFaceScanning || !hasPhotosToScan) ? 0 : window.AppState.uploadDaemons
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
    try {
      window.AppState.uploadedPhotosCache = {};
      await loadUploadedPhotos();
    } catch (_) {}
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

    const tabSelect = document.getElementById('tab-select');
    const isCinema = (tabSelect && (tabSelect.value || '').trim().toUpperCase() === 'CINEMA') ||
      (window.AppState.resolvedFiles && window.AppState.resolvedFiles.some(f => (f.tabName || '').trim().toUpperCase() === 'CINEMA' || f.isVideo));
    const itemNoun = isCinema ? (data.total === 1 ? 'Film' : 'Films') : (data.total === 1 ? 'Photo' : 'Photos');

    if (data.status === 'row-processing') {
      const row = document.getElementById(`q-row-${data.index}`);
      if (row) {
        const statusText = row.querySelector('.q-status');
        const progressContainer = row.querySelector('.q-row-progress-container');
        const progressBar = row.querySelector('.q-row-progress');
        if (statusText) {
          statusText.textContent = data.detail || (data.percent ? `Compressing (${data.percent}%)...` : 'Processing...');
          statusText.style.color = '#eab308';
        }
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressBar) {
          const pct = data.overallPercent !== undefined ? data.overallPercent : (data.percent ? Math.round(data.percent * 0.4) : 40);
          progressBar.style.width = `${pct}%`;
        }
      }
      if (data.total === 1) {
        if (queueTotalProgress && data.overallPercent !== undefined) queueTotalProgress.style.width = `${data.overallPercent}%`;
        if (queueTotalStatus && data.detail) queueTotalStatus.textContent = data.detail;
      } else if (data.total > 1 && data.overallPercent !== undefined) {
        const itemOverall = data.overallPercent || 20;
        const smoothPct = Math.min(Math.round(((data.index + (itemOverall / 100)) / data.total) * 100), 99);
        if (queueTotalProgress) queueTotalProgress.style.width = `${smoothPct}%`;
        if (queueTotalStatus && data.detail) queueTotalStatus.textContent = `[${data.index + 1}/${data.total}] ${data.detail}`;
      }
    } else if (data.status === 'row-uploading') {
      const row = document.getElementById(`q-row-${data.index}`);
      if (row) {
        const statusText = row.querySelector('.q-status');
        const progressContainer = row.querySelector('.q-row-progress-container');
        const progressBar = row.querySelector('.q-row-progress');
        if (statusText) {
          statusText.textContent = data.detail || (data.percent ? `Uploading (${data.percent}%)...` : 'Uploading...');
          statusText.style.color = '#3b82f6';
        }
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressBar) {
          const pct = data.overallPercent !== undefined ? data.overallPercent : (data.percent ? Math.round(40 + data.percent * 0.59) : 80);
          progressBar.style.width = `${pct}%`;
        }
      }
      if (data.total === 1) {
        if (queueTotalProgress && data.overallPercent !== undefined) queueTotalProgress.style.width = `${data.overallPercent}%`;
        if (queueTotalStatus && data.detail) queueTotalStatus.textContent = data.detail;
      } else if (data.total > 1 && data.overallPercent !== undefined) {
        const itemOverall = data.overallPercent || 70;
        const smoothPct = Math.min(Math.round(((data.index + (itemOverall / 100)) / data.total) * 100), 99);
        if (queueTotalProgress) queueTotalProgress.style.width = `${smoothPct}%`;
        if (queueTotalStatus && data.detail) queueTotalStatus.textContent = `[${data.index + 1}/${data.total}] ${data.detail}`;
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
          const actionTip = data.action ? ` | What to do: ${data.action}` : '';
          statusText.textContent = `FAILED (${data.error || 'Unknown error'})`;
          statusText.style.color = '#ef4444';
          statusText.title = `${data.error || ''}${actionTip}`;
        }
        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.style.background = '#ef4444';
        }
      }
    } else if (data.status === 'progress') {
      const pct = Math.round((data.index / data.total) * 100);
      if (queueTotalProgress) queueTotalProgress.style.width = `${pct}%`;
      if (queueHeaderTitle) queueHeaderTitle.textContent = `${data.index}/${data.total} ${itemNoun}`;
      if (queueTotalStatus) queueTotalStatus.textContent = `Uploading files: ${data.index} of ${data.total} completed`;
    } else if (data.status === 'submitting') {
      if (queueTotalStatus) queueTotalStatus.textContent = data.detail || 'Optimizing database & syncing face indexes...';
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
    if (report && Array.isArray(report.bakedCoverPhotoIds) && report.bakedCoverPhotoIds.length > 0) {
      try {
        const bSet = new Set(JSON.parse(localStorage.getItem('misty_baked_cover_ids') || '[]'));
        report.bakedCoverPhotoIds.forEach(id => bSet.add(id));
        localStorage.setItem('misty_baked_cover_ids', JSON.stringify([...bSet]));
      } catch (_) {}
    }
    renderUploadIntegrityReport(report);
  });
}
