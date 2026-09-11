// Lightbox, Photos Grid, Batch Actions & Cover Photo Component

let currentLightboxPhotos = [];
let currentLightboxIndex = 0;

function isVideoMediaItem(photo) {
  if (!photo) return false;
  if (photo.isVideo) return true;
  if (photo.tabName && photo.tabName.trim().toUpperCase() === 'CINEMA') return true;
  const fn = (photo.filename || '').toLowerCase();
  const u = (photo.r2Url || '').toLowerCase();
  return fn.endsWith('.mp4') || fn.endsWith('.mov') || fn.endsWith('.m4v') || fn.endsWith('.webm') ||
         u.endsWith('.mp4') || u.endsWith('.mov') || u.endsWith('.m4v') || u.includes('/videos/');
}

function initLightboxUI() {
  const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
  const lightboxPrevBtn = document.getElementById('lightbox-prev-btn');
  const lightboxNextBtn = document.getElementById('lightbox-next-btn');

  const closeLightbox = () => {
    document.getElementById('lightbox-modal')?.classList.remove('open');
    const v = document.getElementById('lightbox-video');
    if (v) {
      v.pause();
      v.src = '';
    }
  };

  if (lightboxCloseBtn) {
    lightboxCloseBtn.addEventListener('click', closeLightbox);
  }
  if (lightboxPrevBtn) {
    lightboxPrevBtn.addEventListener('click', () => {
      if (currentLightboxIndex > 0) {
        currentLightboxIndex--;
        renderLightboxCurrent();
      }
    });
  }
  if (lightboxNextBtn) {
    lightboxNextBtn.addEventListener('click', () => {
      if (currentLightboxIndex < currentLightboxPhotos.length - 1) {
        currentLightboxIndex++;
        renderLightboxCurrent();
      }
    });
  }

  const featuredBtn = document.getElementById('lightbox-featured-btn');
  if (featuredBtn) {
    featuredBtn.addEventListener('click', () => {
      const currentPhoto = currentLightboxPhotos[currentLightboxIndex];
      if (currentPhoto) {
        handleToggleFeaturedVideo(currentPhoto);
      }
    });
  }

  const updateCoverBtn = document.getElementById('lightbox-update-cover-btn');
  if (updateCoverBtn) {
    updateCoverBtn.addEventListener('click', () => {
      const currentPhoto = currentLightboxPhotos[currentLightboxIndex];
      if (currentPhoto) {
        handleUpdateVideoCover(currentPhoto);
      }
    });
  }

  const editFilmBtn = document.getElementById('lightbox-edit-film-btn');
  if (editFilmBtn) {
    editFilmBtn.addEventListener('click', () => {
      const currentPhoto = currentLightboxPhotos[currentLightboxIndex];
      if (currentPhoto) {
        openVideoEditModal(currentPhoto);
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('lightbox-modal');
    if (!modal || !modal.classList.contains('open')) return;
    if (e.key === 'Escape') {
      closeLightbox();
    } else if (e.key === 'ArrowLeft') {
      document.getElementById('lightbox-prev-btn')?.click();
    } else if (e.key === 'ArrowRight') {
      document.getElementById('lightbox-next-btn')?.click();
    }
  });

  initTabManagementUI();
  initBatchActionsUI();
  initCoverUploadUI();
  initVideoEditModal();
}

function openLightbox(photosList, index) {
  if (!photosList || photosList.length === 0) return;
  currentLightboxPhotos = photosList;
  currentLightboxIndex = index;
  renderLightboxCurrent();
  const modal = document.getElementById('lightbox-modal');
  if (modal) modal.classList.add('open');
}

function renderLightboxCurrent() {
  if (!currentLightboxPhotos || currentLightboxPhotos.length === 0) return;
  const photo = currentLightboxPhotos[currentLightboxIndex];
  if (!photo) return;

  const isVideo = isVideoMediaItem(photo);
  const rawUrl = photo.r2Url;
  const absUrl = rawUrl ? (rawUrl.startsWith('/') ? `${window.AppState.apiBaseUrl}${rawUrl}` : rawUrl) : '';
  const rawThumb = photo.thumbnailUrl;
  const absThumb = rawThumb ? (rawThumb.startsWith('/') ? `${window.AppState.apiBaseUrl}${rawThumb}` : rawThumb) : '';

  const imgEl = document.getElementById('lightbox-img');
  const videoEl = document.getElementById('lightbox-video');
  const filenameEl = document.getElementById('lightbox-filename');
  const metaEl = document.getElementById('lightbox-meta');
  const counterEl = document.getElementById('lightbox-counter');
  const openUrlBtn = document.getElementById('lightbox-open-url-btn');
  const updateCoverBtn = document.getElementById('lightbox-update-cover-btn');
  const editFilmBtn = document.getElementById('lightbox-edit-film-btn');
  const featuredBtn = document.getElementById('lightbox-featured-btn');

  if (isVideo) {
    if (imgEl) imgEl.style.display = 'none';
    if (videoEl) {
      videoEl.style.display = 'block';
      videoEl.poster = absThumb || '';
      videoEl.src = absUrl;
    }
    if (featuredBtn) {
      featuredBtn.style.display = 'inline-flex';
      const isFeatured = Boolean(photo.isFeatured);
      featuredBtn.innerHTML = isFeatured ? '★ Featured' : '☆ Feature';
      featuredBtn.style.background = isFeatured ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255, 255, 255, 0.08)';
      featuredBtn.style.borderColor = isFeatured ? '#E50914' : 'rgba(255, 255, 255, 0.2)';
      featuredBtn.style.color = isFeatured ? '#ff4d4d' : '#fff';
      featuredBtn.title = isFeatured ? 'Featured Video (Gallery Cover will represent this in Cinema)' : 'Click to set as Featured Video';
    }
    if (editFilmBtn) {
      editFilmBtn.style.display = 'inline-flex';
    }
    if (updateCoverBtn) {
      updateCoverBtn.style.display = 'inline-flex';
    }
  } else {
    if (videoEl) {
      videoEl.pause();
      videoEl.style.display = 'none';
      videoEl.src = '';
    }
    if (imgEl) {
      imgEl.style.display = 'block';
      imgEl.src = absUrl;
    }
    if (featuredBtn) {
      featuredBtn.style.display = 'none';
    }
    if (editFilmBtn) {
      editFilmBtn.style.display = 'none';
    }
    if (updateCoverBtn) {
      updateCoverBtn.style.display = 'none';
    }
  }

  if (filenameEl) filenameEl.textContent = photo.filename || 'Photo';

  const dimStr = (photo.width && photo.height) ? `${photo.width} × ${photo.height}px` : (isVideo ? 'Video' : 'High Resolution');
  const sizeStr = photo.fileSize ? `${(photo.fileSize / (1024 * 1024)).toFixed(2)} MB` : '';
  const metaParts = [`Category: ${photo.tabName || 'General'}`, dimStr, sizeStr].filter(Boolean);
  if (metaEl) metaEl.textContent = metaParts.join(' • ');

  if (counterEl) counterEl.textContent = `${currentLightboxIndex + 1} of ${currentLightboxPhotos.length}`;

  if (openUrlBtn) {
    openUrlBtn.onclick = () => {
      if (absUrl) window.api.openExternal(absUrl);
    };
  }
}

function updateBatchActionsBar(totalCount) {
  const uploadedActionsContainer = document.getElementById('uploaded-actions-container');
  const btnSelectAll = document.getElementById('btn-select-all');
  const btnDeselectAll = document.getElementById('btn-deselect-all');
  const btnDeleteSelected = document.getElementById('btn-delete-selected');
  const moveContainer = document.getElementById('move-container');
  const selectMoveTarget = document.getElementById('select-move-target');

  if (!uploadedActionsContainer) return;

  if (totalCount === 0) {
    uploadedActionsContainer.style.display = 'none';
    return;
  }
  uploadedActionsContainer.style.display = 'flex';

  if (window.AppState.selectedPhotoIds.size > 0) {
    if (btnDeselectAll) btnDeselectAll.style.display = 'inline-block';
    if (btnSelectAll) btnSelectAll.style.display = 'none';
    if (btnDeleteSelected) {
      btnDeleteSelected.style.display = 'inline-block';
      btnDeleteSelected.textContent = `Delete (${window.AppState.selectedPhotoIds.size})`;
    }
    
    if (selectMoveTarget && selectMoveTarget.options.length > 1) {
      if (moveContainer) moveContainer.style.display = 'flex';
    } else {
      if (moveContainer) moveContainer.style.display = 'none';
    }
  } else {
    if (btnDeselectAll) btnDeselectAll.style.display = 'none';
    if (btnSelectAll) btnSelectAll.style.display = 'inline-block';
    if (btnDeleteSelected) btnDeleteSelected.style.display = 'none';
    if (moveContainer) moveContainer.style.display = 'none';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cinema Library 4-Shelf View & Drag-and-Drop Sequencing
// Finalized Shelves: 1, 4, 3, 2
// P1: THE DIRECTORS’ CUT
// P4: CANDID DIARIES
// P3: STAGE & SPOTLIGHT
// P2: THE EXTENDED CUTS
// ─────────────────────────────────────────────────────────────────────────────

const CINEMA_SHELVES_CONFIG = [
  {
    category: 'THE DIRECTORS’ CUT',
    title: 'THE DIRECTORS’ CUT',
    badge: ''
  },
  {
    category: 'CANDID DIARIES',
    title: 'CANDID DIARIES',
    badge: 'REEL'
  },
  {
    category: 'STAGE & SPOTLIGHT',
    title: 'STAGE & SPOTLIGHT',
    badge: 'STAGE'
  },
  {
    category: 'THE EXTENDED CUTS',
    title: 'THE EXTENDED CUTS',
    badge: 'FULL FILM'
  }
];

function getCurrentGalleryName() {
  if (window.AppState) {
    if (window.AppState.currentGalleryTitle) {
      return String(window.AppState.currentGalleryTitle).trim();
    }
    if (window.AppState.currentGalleryId && Array.isArray(window.AppState.projects)) {
      const p = window.AppState.projects.find(x => x.id === window.AppState.currentGalleryId || x.id === parseInt(window.AppState.currentGalleryId, 10));
      if (p && p.title) return String(p.title).trim();
    }
    if (window.AppState.currentGallerySlug) {
      return window.AppState.currentGallerySlug
        .split(/[-_]+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' & ');
    }
  }
  const el = document.getElementById('project-name-display');
  if (el && el.textContent && el.textContent !== '—') {
    return el.textContent.trim();
  }
  return '';
}
window.getCurrentGalleryName = getCurrentGalleryName;

function classifyCinemaCategoryForVideo(photo) {
  const explicit = (photo.cinemaCategory || photo.exif?.cinemaCategory || '').trim().toUpperCase().replace(/['']/g, '’');
  if (explicit.includes('DIRECTOR')) return 'THE DIRECTORS’ CUT';
  if (explicit.includes('CANDID') || explicit.includes('REEL') || explicit.includes('DIAR')) return 'CANDID DIARIES';
  if (explicit.includes('STAGE') || explicit.includes('SPOTLIGHT') || explicit.includes('PERFORMANCE') || explicit.includes('DANCE')) return 'STAGE & SPOTLIGHT';
  if (explicit.includes('EXTENDED') || explicit.includes('CUTS') || explicit.includes('CHAPTER') || explicit.includes('CEREMONY')) return 'THE EXTENDED CUTS';

  if (window.CinemaMetadata) {
    const subtype = window.CinemaMetadata.detectCinemaSubtype(photo.filename, false);
    return window.CinemaMetadata.mapSubtypeToCategory(subtype);
  }
  return 'THE DIRECTORS’ CUT';
}

function getPhotoSortOrder(photo) {
  if (typeof photo.sortOrder === 'number') return photo.sortOrder;
  if (typeof photo.exif?.sortOrder === 'number') return photo.exif.sortOrder;
  if (photo.exif?.sortOrder !== undefined && photo.exif?.sortOrder !== null) {
    const parsed = parseInt(photo.exif.sortOrder, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 9999;
}

let activeDraggedCinemaItem = null;

function renderCinemaUploadedView(filteredVideos, container) {
  if (!container) return;

  container.innerHTML = '';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '20px';
  container.style.maxHeight = '560px';
  container.style.overflowY = 'auto';
  container.style.paddingRight = '6px';

  // Partition videos into the 4 shelves
  const shelfMap = {
    'THE DIRECTORS’ CUT': [],
    'CANDID DIARIES': [],
    'STAGE & SPOTLIGHT': [],
    'THE EXTENDED CUTS': []
  };

  filteredVideos.forEach(v => {
    const cat = classifyCinemaCategoryForVideo(v);
    if (shelfMap[cat]) {
      shelfMap[cat].push(v);
    } else {
      shelfMap['THE DIRECTORS’ CUT'].push(v);
    }
  });

  // Sort each shelf by sortOrder
  Object.keys(shelfMap).forEach(cat => {
    shelfMap[cat].sort((a, b) => getPhotoSortOrder(a) - getPhotoSortOrder(b));
  });

  // Render each shelf block in order: P1, P4, P3, P2
  CINEMA_SHELVES_CONFIG.forEach(shelf => {
    const shelfBlock = document.createElement('div');
    shelfBlock.className = 'cinema-shelf-block';
    shelfBlock.setAttribute('data-category', shelf.category);

    const shelfVideos = shelfMap[shelf.category] || [];

    const header = document.createElement('div');
    header.className = 'cinema-shelf-header';
    header.innerHTML = `
      <div class="cinema-shelf-title-wrap">
        <h3 class="cinema-shelf-title">${shelf.title}</h3>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 10px; color: var(--text-muted);">Drag cards to reorder sequence</span>
        <span class="cinema-shelf-count">${shelfVideos.length} ${shelfVideos.length === 1 ? 'Video' : 'Videos'}</span>
      </div>
    `;
    shelfBlock.appendChild(header);

    const cardsRow = document.createElement('div');
    cardsRow.className = 'cinema-shelf-cards-row';
    cardsRow.setAttribute('data-category', shelf.category);

    if (shelfVideos.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'cinema-shelf-empty';
      emptyDiv.setAttribute('data-category', shelf.category);
      emptyDiv.innerHTML = `
        <div style="font-size: 20px; margin-bottom: 4px;">🎬</div>
        <div style="font-weight: 600; color: #fff; font-size: 12px;">No videos in ${shelf.title} yet</div>
        <div style="font-size: 10px; opacity: 0.7; margin-top: 2px;">Drag any video card here to move it to this section</div>
      `;
      cardsRow.appendChild(emptyDiv);
    } else {
      shelfVideos.forEach((photo, idx) => {
        const card = createCinemaPosterCard(photo, idx, shelf, filteredVideos, shelfMap, container);
        cardsRow.appendChild(card);
      });
    }

    setupShelfDropZone(cardsRow, shelf.category, filteredVideos, shelfMap, container);

    shelfBlock.appendChild(cardsRow);
    container.appendChild(shelfBlock);
  });
}

async function deleteCinemaItem(photo, fallbackTitle) {
  if (!photo || !photo.id) return;
  const displayName = photo.title || photo.exif?.title || fallbackTitle || photo.filename || 'this film';
  const confirmed = await showModal({
    icon: '🗑️',
    title: 'Remove Video & Poster?',
    sub: `Are you sure you want to permanently remove "${displayName}"?\n\nThis will delete the media file, poster artwork, and linked database records. This action cannot be undone.`,
    confirmText: 'Remove',
    danger: true
  });
  if (!confirmed) return;

  try {
    const response = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${window.AppState.currentGalleryId}/photos`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.AppState.authToken}`
      },
      body: JSON.stringify({ photoIds: [photo.id] })
    });

    if (response.ok) {
      const editModal = document.getElementById('video-edit-modal');
      if (editModal && editModal.classList.contains('open')) {
        editModal.classList.remove('open');
      }
      window.AppState.uploadedPhotosCache = {};
      if (window.AppState.currentUploadedPhotosList) {
        window.AppState.currentUploadedPhotosList = window.AppState.currentUploadedPhotosList.filter(p => p.id !== photo.id);
      }
      await loadUploadedPhotos();
      await showModal({
        icon: '✅',
        title: 'Removed Successfully',
        sub: `"${displayName}" and its media files have been removed.`,
        confirmText: 'OK'
      });
    } else {
      const err = await response.json().catch(() => ({}));
      await showModal({
        icon: '❌',
        title: 'Delete Failed',
        sub: err.error || 'Failed to remove film.',
        confirmText: 'OK',
        danger: true
      });
    }
  } catch (err) {
    await showModal({
      icon: '❌',
      title: 'Error',
      sub: err.message || 'Failed to remove film.',
      confirmText: 'OK',
      danger: true
    });
  }
}

function createCinemaPosterCard(photo, idx, shelf, allFilteredVideos, shelfMap, mainContainer) {
  const card = document.createElement('div');
  card.className = 'cinema-poster-card';
  card.setAttribute('draggable', 'true');
  card.setAttribute('data-id', photo.id);
  card.setAttribute('data-category', shelf.category);

  const thumb = photo.thumbnailUrl || photo.r2Url || '';
  const imgUrl = thumb ? (thumb.startsWith('/') ? `${window.AppState.apiBaseUrl}${thumb}` : thumb) : '';

  const cleanTitle = photo.title || photo.exif?.title || (window.CinemaMetadata ? window.CinemaMetadata.generateCleanTitle(photo.filename) : photo.filename);

  let durationDisplay = '';
  const durSec = Number(photo.duration || photo.exif?.duration);
  if (durSec && !isNaN(durSec)) {
    const m = Math.floor(durSec / 60);
    const s = Math.floor(durSec % 60);
    durationDisplay = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }

  const badgeRightHtml = (shelf.badge && shelf.badge !== 'FEATURE')
    ? `<div class="cinema-badge-custom">${shelf.badge}</div>`
    : '';

  const posterMediaHtml = imgUrl
    ? `<img src="${imgUrl}" class="cinema-poster-img" alt="${cleanTitle}" loading="lazy">`
    : `<div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #141418; color: #71717a; font-size: 26px;">🎬<span style="font-size: 9px; margin-top: 6px; color: #a1a1aa; font-weight: 600;">NO POSTER</span></div>`;

  let bakedSet = new Set();
  try {
    bakedSet = new Set(JSON.parse(localStorage.getItem('misty_baked_cover_ids') || '[]'));
  } catch (_) {}

  const isBaked = Boolean(
    photo.hasBakedCover ||
    photo.isCoverBaked ||
    photo.exif?.hasBakedCover ||
    photo.exif?.isCoverBaked ||
    bakedSet.has(photo.id)
  );

  const isDancePerformance = (shelf.category === 'STAGE & SPOTLIGHT');
  const seqBadgeHtml = isDancePerformance
    ? `<div class="cinema-card-top-badges"><div class="cinema-badge-seq">#${idx + 1}</div></div>`
    : '';

  card.innerHTML = `
    ${posterMediaHtml}
    ${!isBaked ? `<div class="cinema-poster-scrim"></div>` : ''}
    ${seqBadgeHtml}
    <div class="cinema-poster-footer">
      ${!isBaked ? `<div class="cinema-poster-title" title="${cleanTitle}">${cleanTitle}</div>` : ''}
      ${durationDisplay ? `<div class="cinema-poster-duration">⏱ ${durationDisplay}</div>` : ''}
    </div>
    <div class="cinema-card-hover-overlay">
      <button class="cinema-hover-btn btn-eye" title="Watch Video / View Poster">👁</button>
      <button class="cinema-hover-btn btn-edit" title="Edit Video Details">✏️</button>
      <button class="cinema-hover-btn btn-remove" title="Remove Video & Poster">🗑️</button>
    </div>
  `;

  // Hover Buttons Click Handlers
  const eyeBtn = card.querySelector('.btn-eye');
  if (eyeBtn) {
    eyeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const vIndex = allFilteredVideos.findIndex(p => p.id === photo.id);
      openLightbox(allFilteredVideos, vIndex !== -1 ? vIndex : 0);
    });
  }

  const editBtn = card.querySelector('.btn-edit');
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openVideoEditModal(photo);
    });
  }

  const removeBtn = card.querySelector('.btn-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteCinemaItem(photo, cleanTitle);
    });
  }

  card.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    const vIndex = allFilteredVideos.findIndex(p => p.id === photo.id);
    openLightbox(allFilteredVideos, vIndex !== -1 ? vIndex : 0);
  });

  // Drag and drop
  card.addEventListener('dragstart', (e) => {
    activeDraggedCinemaItem = { photo, sourceCategory: shelf.category };
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(photo.id));
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    activeDraggedCinemaItem = null;
    document.querySelectorAll('.cinema-poster-card.drag-over').forEach(el => {
      el.classList.remove('drag-over');
      el.style.borderLeft = '';
      el.style.borderRight = '';
    });
    document.querySelectorAll('.cinema-shelf-cards-row.shelf-drop-target').forEach(el => el.classList.remove('shelf-drop-target'));
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (activeDraggedCinemaItem && activeDraggedCinemaItem.photo.id !== photo.id) {
      card.classList.add('drag-over');
      const rect = card.getBoundingClientRect();
      const isAfter = (e.clientX - rect.left) > (rect.width / 2);
      if (isAfter) {
        card.style.borderRight = '3px solid var(--primary)';
        card.style.borderLeft = '';
      } else {
        card.style.borderLeft = '3px solid var(--primary)';
        card.style.borderRight = '';
      }
    }
  });

  card.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    card.classList.remove('drag-over');
    card.style.borderLeft = '';
    card.style.borderRight = '';
  });

  card.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    card.classList.remove('drag-over');
    card.style.borderLeft = '';
    card.style.borderRight = '';

    if (!activeDraggedCinemaItem) return;
    const draggedPhoto = activeDraggedCinemaItem.photo;
    const sourceCategory = activeDraggedCinemaItem.sourceCategory;
    const targetCategory = shelf.category;

    if (draggedPhoto.id === photo.id) return;

    const rect = card.getBoundingClientRect();
    const isAfter = (e.clientX - rect.left) > (rect.width / 2);

    handleDropOnCard(draggedPhoto, sourceCategory, photo, targetCategory, isAfter, shelfMap, allFilteredVideos, mainContainer);
  });

  return card;
}

async function handleDropOnCard(draggedPhoto, sourceCategory, targetPhoto, targetCategory, isAfter, shelfMap, allFilteredVideos, mainContainer) {
  const sourceList = shelfMap[sourceCategory] || [];
  const targetList = shelfMap[targetCategory] || [];

  const sIdx = sourceList.findIndex(p => p.id === draggedPhoto.id);
  if (sIdx !== -1) {
    sourceList.splice(sIdx, 1);
  }

  let tIdx = targetList.findIndex(p => p.id === targetPhoto.id);
  if (tIdx !== -1) {
    if (isAfter) {
      tIdx += 1;
    }
    targetList.splice(tIdx, 0, draggedPhoto);
  } else {
    targetList.push(draggedPhoto);
  }

  draggedPhoto.cinemaCategory = targetCategory;
  if (!draggedPhoto.exif) draggedPhoto.exif = {};
  draggedPhoto.exif.cinemaCategory = targetCategory;

  targetList.forEach((p, idx) => {
    p.sortOrder = idx + 1;
    if (!p.exif) p.exif = {};
    p.exif.sortOrder = idx + 1;
    p.cinemaCategory = targetCategory;
    p.exif.cinemaCategory = targetCategory;
  });

  if (sourceCategory !== targetCategory) {
    sourceList.forEach((p, idx) => {
      p.sortOrder = idx + 1;
      if (!p.exif) p.exif = {};
      p.exif.sortOrder = idx + 1;
      p.cinemaCategory = sourceCategory;
      p.exif.cinemaCategory = sourceCategory;
    });
  }

  renderCinemaUploadedView(allFilteredVideos, mainContainer);

  const ordersToSave = [];
  targetList.forEach((p, idx) => {
    ordersToSave.push({
      photoId: p.id,
      id: p.id,
      sortOrder: idx + 1,
      cinemaCategory: targetCategory
    });
  });

  if (sourceCategory !== targetCategory) {
    sourceList.forEach((p, idx) => {
      ordersToSave.push({
        photoId: p.id,
        id: p.id,
        sortOrder: idx + 1,
        cinemaCategory: sourceCategory
      });
    });
  }

  await persistCinemaReorder(ordersToSave);
}

function setupShelfDropZone(cardsRow, shelfCategory, allFilteredVideos, shelfMap, mainContainer) {
  cardsRow.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    cardsRow.classList.add('shelf-drop-target');
  });

  cardsRow.addEventListener('dragleave', (e) => {
    if (!cardsRow.contains(e.relatedTarget)) {
      cardsRow.classList.remove('shelf-drop-target');
    }
  });

  cardsRow.addEventListener('drop', async (e) => {
    e.preventDefault();
    cardsRow.classList.remove('shelf-drop-target');

    if (!activeDraggedCinemaItem) return;
    if (e.target.closest('.cinema-poster-card')) return;

    const draggedPhoto = activeDraggedCinemaItem.photo;
    const sourceCategory = activeDraggedCinemaItem.sourceCategory;
    const targetCategory = shelfCategory;

    const sourceList = shelfMap[sourceCategory] || [];
    const targetList = shelfMap[targetCategory] || [];

    const sIdx = sourceList.findIndex(p => p.id === draggedPhoto.id);
    if (sIdx !== -1) {
      sourceList.splice(sIdx, 1);
    }
    targetList.push(draggedPhoto);

    draggedPhoto.cinemaCategory = targetCategory;
    if (!draggedPhoto.exif) draggedPhoto.exif = {};
    draggedPhoto.exif.cinemaCategory = targetCategory;

    targetList.forEach((p, idx) => {
      p.sortOrder = idx + 1;
      if (!p.exif) p.exif = {};
      p.exif.sortOrder = idx + 1;
      p.cinemaCategory = targetCategory;
      p.exif.cinemaCategory = targetCategory;
    });

    if (sourceCategory !== targetCategory) {
      sourceList.forEach((p, idx) => {
        p.sortOrder = idx + 1;
        if (!p.exif) p.exif = {};
        p.exif.sortOrder = idx + 1;
        p.cinemaCategory = sourceCategory;
        p.exif.cinemaCategory = sourceCategory;
      });
    }

    renderCinemaUploadedView(allFilteredVideos, mainContainer);

    const ordersToSave = [];
    targetList.forEach((p, idx) => {
      ordersToSave.push({
        photoId: p.id,
        id: p.id,
        sortOrder: idx + 1,
        cinemaCategory: targetCategory
      });
    });

    if (sourceCategory !== targetCategory) {
      sourceList.forEach((p, idx) => {
        ordersToSave.push({
          photoId: p.id,
          id: p.id,
          sortOrder: idx + 1,
          cinemaCategory: sourceCategory
        });
      });
    }

    await persistCinemaReorder(ordersToSave);
  });
}

async function persistCinemaReorder(orders) {
  const eventId = window.AppState.currentGalleryId;
  const backendUrl = window.AppState.apiBaseUrl;
  const token = window.AppState.authToken;

  if (!eventId || !token || !orders || orders.length === 0) return;

  try {
    if (window.api && window.api.reorderVideos) {
      await window.api.reorderVideos({
        eventId,
        orders,
        backendUrl,
        token
      });
    } else {
      await fetch(`${backendUrl}/api/gallery/events/${eventId}/photos/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ orders })
      });
    }

    orders.forEach(ord => {
      const p = (window.AppState.currentUploadedPhotosList || []).find(x => x.id === ord.photoId || x.id === ord.id);
      if (p) {
        p.sortOrder = ord.sortOrder;
        if (!p.exif) p.exif = {};
        p.exif.sortOrder = ord.sortOrder;
        if (ord.cinemaCategory) {
          p.cinemaCategory = ord.cinemaCategory;
          p.exif.cinemaCategory = ord.cinemaCategory;
        }
      }
    });

    showCinemaToast('✅ Sequence updated!');
  } catch (err) {
    console.error('Failed to save cinema reorder:', err);
    showCinemaToast('❌ Failed to save sequence: ' + (err.message || 'Unknown error'), true);
  }
}

function showCinemaToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #18181f;
    border: 1px solid ${isError ? '#dc3545' : '#10b981'};
    color: #fff;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.6);
    z-index: 99999;
  `;
  toast.innerHTML = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), isError ? 4000 : 2500);
}

async function loadUploadedPhotos() {
  const tabSelect = document.getElementById('tab-select');
  const uploadedPhotosGrid = document.getElementById('uploaded-photos-grid');
  const uploadedCount = document.getElementById('uploaded-count');
  const selectMoveTarget = document.getElementById('select-move-target');

  if (!tabSelect || !tabSelect.value || !window.AppState.authToken) {
    if (uploadedPhotosGrid) uploadedPhotosGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px;">Select an event tab above to view photos.</div>';
    if (uploadedCount) uploadedCount.textContent = '0';
    window.AppState.selectedPhotoIds.clear();
    updateBatchActionsBar(0);
    return;
  }

  if (!window.AppState.currentGallerySlug) return;
  const cacheKey = `${window.AppState.currentGalleryId}::${tabSelect.value}`;

  if (uploadedPhotosGrid) uploadedPhotosGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px;">Loading...</div>';

  try {
    const eventId = window.AppState.currentGalleryId;
    const selectedTabVal = tabSelect.value;

    if (!window.AppState.uploadedPhotosCache[cacheKey]) {
      const photosRes = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${eventId}/photos?limit=50000`, {
        headers: { 'Authorization': `Bearer ${window.AppState.authToken}` }
      });
      if (photosRes.ok) {
        const photosData = await photosRes.json();
        window.AppState.currentUploadedPhotosList = photosData.photos || [];
        window.AppState.uploadedPhotosCache[`${eventId}::ALL`] = window.AppState.currentUploadedPhotosList;
        const tabGroups = {};
        window.AppState.currentUploadedPhotosList.forEach(p => {
          const t = p.tabName || 'ALL';
          if (!tabGroups[t]) tabGroups[t] = [];
          tabGroups[t].push(p);
        });
        Object.entries(tabGroups).forEach(([t, photos]) => {
          window.AppState.uploadedPhotosCache[`${eventId}::${t}`] = photos;
        });
      } else {
        const errText = await photosRes.text().catch(() => '');
        console.error(`Failed to load photos (HTTP ${photosRes.status}):`, errText);
        if (uploadedPhotosGrid) uploadedPhotosGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px;">Failed to load photos.</div>';
        return;
      }
    }

    const allPhotos = window.AppState.uploadedPhotosCache[`${eventId}::ALL`] || [];
    window.AppState.currentUploadedPhotosList = allPhotos;
    const filtered = (!selectedTabVal || selectedTabVal === 'ALL')
      ? allPhotos
      : (window.AppState.uploadedPhotosCache[cacheKey] || allPhotos.filter(p => p.tabName === selectedTabVal));

    if (uploadedCount) uploadedCount.textContent = filtered.length;
    if (uploadedPhotosGrid) uploadedPhotosGrid.innerHTML = '';
    window.AppState.selectedPhotoIds.clear();
    updateBatchActionsBar(filtered.length);

    const isCinemaTab = selectedTabVal && selectedTabVal.trim().toUpperCase() === 'CINEMA';
    const uploadedActionsContainer = document.getElementById('uploaded-actions-container');

    if (isCinemaTab) {
      if (uploadedActionsContainer) uploadedActionsContainer.style.display = 'none';
      renderCinemaUploadedView(filtered, uploadedPhotosGrid);
      return;
    } else {
      if (uploadedActionsContainer) uploadedActionsContainer.style.display = 'flex';
      if (uploadedPhotosGrid) {
        uploadedPhotosGrid.style.display = 'grid';
        uploadedPhotosGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(110px, 1fr))';
        uploadedPhotosGrid.style.gap = '12px';
      }
    }

    if (filtered.length === 0) {
      if (uploadedPhotosGrid) uploadedPhotosGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 12px;">No photos uploaded to this event tab yet.</div>';
      return;
    }

    if (selectMoveTarget) {
      selectMoveTarget.innerHTML = '<option value="" disabled selected>Move to...</option>';
      Array.from(tabSelect.options).forEach(opt => {
        if (opt.value && opt.value !== 'ALL' && opt.value !== tabSelect.value) {
          const moveOpt = document.createElement('option');
          moveOpt.value = opt.value;
          moveOpt.textContent = opt.textContent;
          selectMoveTarget.appendChild(moveOpt);
        }
      });
    }

    filtered.forEach((photo, photoIndex) => {
      const item = document.createElement('div');
      item.style.cssText = `
        position: relative;
        width: 100%;
        height: 0;
        padding-bottom: 100%;
        border-radius: 8px;
        border: 2px solid var(--surface-border);
        overflow: hidden;
        background: #000;
        cursor: pointer;
        transition: border-color 0.2s, transform 0.2s;
      `;
      item.setAttribute('title', `Click to select / Double click to view full size (${photo.filename})`);

      const isVideo = isVideoMediaItem(photo);
      const activeThumb = isVideo ? (photo.thumbnailUrl || '') : photo.r2Url;
      const imgUrl = activeThumb ? (activeThumb.startsWith('/') ? `${window.AppState.apiBaseUrl}${activeThumb}` : activeThumb) : '';

      const mediaHtml = imgUrl
        ? `<img src="${imgUrl}" class="uploaded-card-thumb" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;" loading="lazy">`
        : `<div class="uploaded-card-thumb" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #121217; color: #71717a; font-size: 24px;">🎬<span style="font-size: 9px; margin-top: 4px; color: #a1a1aa;">No Cover</span></div>`;

      const videoBadgeHtml = isVideo
        ? `<div style="position: absolute; top: 8px; right: 38px; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.75); border: 1px solid rgba(255,255,255,0.25); color: #fff; font-size: 8px; font-weight: 700; letter-spacing: 0.5px; z-index: 3;">🎬 VIDEO</div>`
        : '';

      const featuredBtnHtml = '';

      const editFilmBtnHtml = isVideo
        ? `<button class="btn-edit-film" title="Edit Film Details (Title, Shelf, Synopsis, Sequence, Poster)" style="
            position: absolute;
            bottom: 22px;
            right: 6px;
            padding: 3px 8px;
            border-radius: 4px;
            border: 1px solid rgba(59,130,246,0.6);
            background: rgba(59,130,246,0.85);
            color: #fff;
            font-size: 9px;
            font-weight: 600;
            cursor: pointer;
            z-index: 4;
            display: flex;
            align-items: center;
            gap: 3px;
            transition: all 0.2s;
          ">✏️ Edit</button>`
        : '';

      const updateCoverBtnHtml = isVideo
        ? `<button class="btn-update-cover" title="Update Cover Photo / Poster" style="
            position: absolute;
            bottom: 22px;
            right: 56px;
            padding: 3px 8px;
            border-radius: 4px;
            border: 1px solid rgba(16,185,129,0.5);
            background: rgba(16,185,129,0.85);
            color: #fff;
            font-size: 9px;
            font-weight: 600;
            cursor: pointer;
            z-index: 4;
            display: flex;
            align-items: center;
            gap: 3px;
            transition: all 0.2s;
          ">🖼️ Cover</button>`
        : '';

      item.innerHTML = `
        ${mediaHtml}
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
          z-index: 3;
        "></div>
        ${videoBadgeHtml}
        <button class="view-single-btn" title="View Full Screen" style="
          position: absolute;
          top: 8px;
          right: 8px;
          width: 24px;
          height: 24px;
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.3);
          background: rgba(0,0,0,0.6);
          color: #fff;
          font-size: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 4;
          opacity: 0.8;
          transition: all 0.2s;
        ">👁</button>
        ${featuredBtnHtml}
        ${updateCoverBtnHtml}
        ${editFilmBtnHtml}
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
          z-index: 2;
        ">${photo.filename}</div>
      `;

      const updateItemSelectionState = () => {
        const isSelected = window.AppState.selectedPhotoIds.has(photo.id);
        const indicator = item.querySelector('.checkbox-indicator');
        if (isSelected) {
          item.style.borderColor = 'var(--primary)';
          if (indicator) {
            indicator.style.background = 'var(--primary)';
            indicator.style.borderColor = 'var(--primary)';
            indicator.textContent = '✓';
          }
        } else {
          item.style.borderColor = 'var(--surface-border)';
          if (indicator) {
            indicator.style.background = 'rgba(0,0,0,0.4)';
            indicator.style.borderColor = '#fff';
            indicator.textContent = '';
          }
        }
      };

      item.addEventListener('click', () => {
        if (window.AppState.selectedPhotoIds.has(photo.id)) {
          window.AppState.selectedPhotoIds.delete(photo.id);
        } else {
          window.AppState.selectedPhotoIds.add(photo.id);
        }
        updateItemSelectionState();
        updateBatchActionsBar(filtered.length);
      });

      item.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        openLightbox(filtered, photoIndex);
      });

      const viewBtn = item.querySelector('.view-single-btn');
      if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openLightbox(filtered, photoIndex);
        });
      }

      const coverBtn = item.querySelector('.btn-update-cover');
      if (coverBtn) {
        coverBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleUpdateVideoCover(photo, item);
        });
      }

      const editBtn = item.querySelector('.btn-edit-film');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openVideoEditModal(photo);
        });
      }

      const featuredBtn = item.querySelector('.btn-toggle-featured');
      if (featuredBtn) {
        featuredBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleToggleFeaturedVideo(photo);
        });
      }

      updateItemSelectionState();
      if (uploadedPhotosGrid) uploadedPhotosGrid.appendChild(item);
    });
  } catch (err) {
    console.error('Error loading uploaded photos:', err);
    if (uploadedPhotosGrid) uploadedPhotosGrid.innerHTML = `<div style="color: #ef4444; font-size: 11px; padding: 12px; line-height: 1.5;"><strong>Error loading photos:</strong> ${err.message}</div>`;
  }
}

async function handleUpdateVideoCover(photo, itemElement) {
  if (!photo) return;
  const chosenPath = await window.api.selectVideoCover(photo.filename);
  if (!chosenPath) return;

  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #18181f;
    border: 1px solid var(--primary);
    color: #fff;
    padding: 12px 18px;
    border-radius: 8px;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.6);
    z-index: 9999;
  `;
  toast.innerHTML = `<span>⏳</span> Updating cover for <b>${photo.filename}</b>...`;
  document.body.appendChild(toast);

  try {
    const res = await window.api.updateVideoCover({
      filePath: chosenPath,
      eventId: window.AppState.currentGalleryId,
      photoId: photo.id,
      backendUrl: window.AppState.apiBaseUrl,
      token: window.AppState.authToken
    });

    if (res && res.thumbnailUrl) {
      photo.thumbnailUrl = res.thumbnailUrl;

      if (window.AppState.currentUploadedPhotosList) {
        const found = window.AppState.currentUploadedPhotosList.find(p => p.id === photo.id);
        if (found) found.thumbnailUrl = res.thumbnailUrl;
      }
      Object.keys(window.AppState.uploadedPhotosCache || {}).forEach(k => {
        const list = window.AppState.uploadedPhotosCache[k];
        if (Array.isArray(list)) {
          const found = list.find(p => p.id === photo.id);
          if (found) found.thumbnailUrl = res.thumbnailUrl;
        }
      });

      const absThumb = res.thumbnailUrl.startsWith('/') ? `${window.AppState.apiBaseUrl}${res.thumbnailUrl}` : res.thumbnailUrl;
      if (itemElement) {
        let existingImg = itemElement.querySelector('img.uploaded-card-thumb');
        if (existingImg) {
          existingImg.src = `${absThumb}?t=${Date.now()}`;
        } else {
          loadUploadedPhotos();
        }
      } else {
        loadUploadedPhotos();
      }

      const modal = document.getElementById('lightbox-modal');
      if (modal && modal.classList.contains('open')) {
        renderLightboxCurrent();
      }

      toast.style.borderColor = '#10b981';
      toast.innerHTML = `✅ Cover updated for <b>${photo.filename}</b>!`;
      setTimeout(() => toast.remove(), 3500);
    } else {
      throw new Error(res?.error || 'Failed to update cover');
    }
  } catch (err) {
    console.error('Failed to update video cover:', err);
    toast.style.borderColor = '#dc3545';
    toast.innerHTML = `❌ Error: ${err.message || 'Failed to update cover'}`;
    setTimeout(() => toast.remove(), 4500);
  }
}

async function handleToggleFeaturedVideo(photo) {
  if (!photo) return;
  const nextFeatured = !photo.isFeatured;

  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #18181f;
    border: 1px solid var(--primary);
    color: #fff;
    padding: 12px 18px;
    border-radius: 8px;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.6);
    z-index: 9999;
  `;
  toast.innerHTML = `<span>⏳</span> ${nextFeatured ? 'Featuring' : 'Unfeaturing'} <b>${photo.filename}</b>...`;
  document.body.appendChild(toast);

  try {
    const res = await window.api.setVideoFeatured({
      eventId: window.AppState.currentGalleryId,
      photoId: photo.id,
      isFeatured: nextFeatured,
      backendUrl: window.AppState.apiBaseUrl,
      token: window.AppState.authToken
    });

    if (res && res.success) {
      photo.isFeatured = nextFeatured;

      // Enforce at most 1 featured video per gallery in client memory
      if (nextFeatured) {
        if (window.AppState.currentUploadedPhotosList) {
          window.AppState.currentUploadedPhotosList.forEach(p => {
            p.isFeatured = (p.id === photo.id);
          });
        }
        Object.keys(window.AppState.uploadedPhotosCache || {}).forEach(k => {
          const list = window.AppState.uploadedPhotosCache[k];
          if (Array.isArray(list)) {
            list.forEach(p => {
              p.isFeatured = (p.id === photo.id);
            });
          }
        });
        if (currentLightboxPhotos) {
          currentLightboxPhotos.forEach(p => {
            p.isFeatured = (p.id === photo.id);
          });
        }
      } else {
        if (window.AppState.currentUploadedPhotosList) {
          const found = window.AppState.currentUploadedPhotosList.find(p => p.id === photo.id);
          if (found) found.isFeatured = false;
        }
        Object.keys(window.AppState.uploadedPhotosCache || {}).forEach(k => {
          const list = window.AppState.uploadedPhotosCache[k];
          if (Array.isArray(list)) {
            const found = list.find(p => p.id === photo.id);
            if (found) found.isFeatured = false;
          }
        });
      }

      // Re-render uploaded photos grid to update button states across all video cards
      loadUploadedPhotos();

      // If lightbox is open, re-render lightbox controls
      const modal = document.getElementById('lightbox-modal');
      if (modal && modal.classList.contains('open')) {
        renderLightboxCurrent();
      }

      toast.style.borderColor = nextFeatured ? '#E50914' : '#10b981';
      toast.innerHTML = nextFeatured
        ? `★ <b>${photo.filename}</b> is now Featured! Gallery cover will represent this video in Cinema.`
        : `☆ Unmarked <b>${photo.filename}</b> as featured.`;
      setTimeout(() => toast.remove(), 3500);
    } else {
      throw new Error(res?.error || 'Failed to update featured video');
    }
  } catch (err) {
    console.error('Failed to toggle featured video:', err);
    toast.style.borderColor = '#dc3545';
    toast.innerHTML = `❌ Error: ${err.message || 'Failed to update featured status'}`;
    setTimeout(() => toast.remove(), 4000);
  }
}

function initBatchActionsUI() {
  const btnSelectAll = document.getElementById('btn-select-all');
  const btnDeselectAll = document.getElementById('btn-deselect-all');
  const btnDeleteSelected = document.getElementById('btn-delete-selected');
  const btnMoveSelected = document.getElementById('btn-move-selected');
  const tabSelect = document.getElementById('tab-select');
  const selectMoveTarget = document.getElementById('select-move-target');
  const uploadedPhotosGrid = document.getElementById('uploaded-photos-grid');

  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      const activeTab = tabSelect.value;
      const filtered = window.AppState.currentUploadedPhotosList.filter(p => p.tabName === activeTab);
      filtered.forEach(photo => {
        window.AppState.selectedPhotoIds.add(photo.id);
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
  }

  if (btnDeselectAll) {
    btnDeselectAll.addEventListener('click', () => {
      window.AppState.selectedPhotoIds.clear();
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
      const count = window.AppState.currentUploadedPhotosList.filter(p => p.tabName === activeTab).length;
      updateBatchActionsBar(count);
    });
  }

  if (btnDeleteSelected) {
    btnDeleteSelected.addEventListener('click', async () => {
      if (window.AppState.selectedPhotoIds.size === 0) return;
      const confirmed = await showModal({
        icon: '⚠️',
        title: 'Delete Selected Photos',
        sub: `Are you sure you want to permanently delete the ${window.AppState.selectedPhotoIds.size} selected photo(s)? This action cannot be undone.`,
        confirmText: 'Delete',
        danger: true
      });
      if (!confirmed) return;

      btnDeleteSelected.disabled = true;
      btnDeleteSelected.textContent = 'Deleting...';
      try {
        const response = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${window.AppState.currentGalleryId}/photos`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${window.AppState.authToken}`
          },
          body: JSON.stringify({ photoIds: Array.from(window.AppState.selectedPhotoIds) })
        });
        
        if (response.ok) {
          window.AppState.selectedPhotoIds.clear();
          window.AppState.uploadedPhotosCache = {};
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
        const count = window.AppState.currentUploadedPhotosList.filter(p => p.tabName === activeTab).length;
        updateBatchActionsBar(count);
      }
    });
  }

  if (btnMoveSelected) {
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
      if (window.AppState.selectedPhotoIds.size === 0) return;
      
      btnMoveSelected.disabled = true;
      btnMoveSelected.textContent = 'Moving...';
      try {
        const response = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${window.AppState.currentGalleryId}/photos/move`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${window.AppState.authToken}`
          },
          body: JSON.stringify({
            photoIds: Array.from(window.AppState.selectedPhotoIds),
            targetTab: targetTab
          })
        });

        if (response.ok) {
          window.AppState.selectedPhotoIds.clear();
          window.AppState.uploadedPhotosCache = {};
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
        const count = window.AppState.currentUploadedPhotosList.filter(p => p.tabName === activeTab).length;
        updateBatchActionsBar(count);
      }
    });
  }

  if (tabSelect) {
    tabSelect.addEventListener('change', loadUploadedPhotos);
  }
}

function initTabManagementUI() {
  const addTabBtn = document.getElementById('add-tab-btn');
  const renameTabBtn = document.getElementById('rename-tab-btn');
  const deleteTabBtn = document.getElementById('delete-tab-btn');
  const tabSelect = document.getElementById('tab-select');
  const projectSelect = document.getElementById('project-select');

  if (addTabBtn) {
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
        const res = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${eventId}/tabs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.AppState.authToken}` },
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
  }

  if (renameTabBtn) {
    renameTabBtn.addEventListener('click', async () => {
      const oldName = tabSelect.value;

      if (oldName === 'Highlights' || oldName === 'Cinema') {
        await showModal({ icon: '🔒', title: 'Cannot rename', sub: `"${oldName}" is a permanent tab and cannot be renamed.`, confirmText: 'OK' });
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
        const res = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${eventId}/tabs/rename`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.AppState.authToken}` },
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
  }

  if (deleteTabBtn) {
    deleteTabBtn.addEventListener('click', async () => {
      const tabName = tabSelect.value;

      if (tabName === 'Highlights' || tabName === 'Cinema') {
        await showModal({ icon: '🔒', title: 'Cannot delete', sub: `"${tabName}" is a permanent tab and cannot be deleted.`, confirmText: 'OK' });
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
        const res = await fetch(`${window.AppState.apiBaseUrl}/api/gallery/events/${eventId}/tabs`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.AppState.authToken}` },
          body: JSON.stringify({ tabName })
        });

        if (res.ok) {
          tabSelect.remove(tabSelect.selectedIndex);
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
  }
}

function initCoverUploadUI() {
  const uploadHorizontalBtn = document.getElementById('upload-horizontal-btn');
  const horizontalStatus = document.getElementById('horizontal-status');
  const horizontalFileInput = document.getElementById('horizontal-file-input');
  const horizontalPreviewContainer = document.getElementById('horizontal-preview-container');

  const uploadVerticalBtn = document.getElementById('upload-vertical-btn');
  const verticalStatus = document.getElementById('vertical-status');
  const verticalFileInput = document.getElementById('vertical-file-input');
  const verticalPreviewContainer = document.getElementById('vertical-preview-container');

  if (uploadHorizontalBtn) uploadHorizontalBtn.addEventListener('click', () => horizontalFileInput.click());
  if (uploadVerticalBtn) uploadVerticalBtn.addEventListener('click', () => verticalFileInput.click());

  if (horizontalFileInput) {
    horizontalFileInput.addEventListener('change', () => {
      handleCoverUpload(horizontalFileInput, 'horizontal', horizontalStatus);
    });
  }

  if (verticalFileInput) {
    verticalFileInput.addEventListener('change', () => {
      handleCoverUpload(verticalFileInput, 'vertical', verticalStatus);
    });
  }

  if (horizontalPreviewContainer) {
    horizontalPreviewContainer.addEventListener('click', () => horizontalFileInput.click());
  }
  if (verticalPreviewContainer) {
    verticalPreviewContainer.addEventListener('click', () => verticalFileInput.click());
  }
}

function updateCoverPreviews(matchedProject) {
  const horizontalPreviewImg = document.getElementById('horizontal-preview-img');
  const horizontalPreviewContainer = document.getElementById('horizontal-preview-container');
  const uploadHorizontalBtn = document.getElementById('upload-horizontal-btn');
  const horizontalStatus = document.getElementById('horizontal-status');

  const verticalPreviewImg = document.getElementById('vertical-preview-img');
  const verticalPreviewContainer = document.getElementById('vertical-preview-container');
  const uploadVerticalBtn = document.getElementById('upload-vertical-btn');
  const verticalStatus = document.getElementById('vertical-status');

  const getAbsoluteUrl = (url) => {
    if (!url) return '';
    return url.startsWith('/') ? `${window.AppState.apiBaseUrl}${url}` : url;
  };

  const horizUrl = matchedProject ? matchedProject.coverPhotoUrl : null;
  const vertUrl = matchedProject ? matchedProject.coverPhotoMobileUrl : null;

  if (horizUrl) {
    if (horizontalPreviewImg) horizontalPreviewImg.src = getAbsoluteUrl(horizUrl);
    if (horizontalPreviewContainer) horizontalPreviewContainer.style.display = 'block';
    if (uploadHorizontalBtn) uploadHorizontalBtn.style.display = 'none';
    if (horizontalStatus) horizontalStatus.style.display = 'none';
  } else {
    if (horizontalPreviewContainer) horizontalPreviewContainer.style.display = 'none';
    if (uploadHorizontalBtn) uploadHorizontalBtn.style.display = 'flex';
    if (horizontalStatus) horizontalStatus.style.display = 'none';
  }

  if (vertUrl) {
    if (verticalPreviewImg) verticalPreviewImg.src = getAbsoluteUrl(vertUrl);
    if (verticalPreviewContainer) verticalPreviewContainer.style.display = 'block';
    if (uploadVerticalBtn) uploadVerticalBtn.style.display = 'none';
    if (verticalStatus) verticalStatus.style.display = 'none';
  } else {
    if (verticalPreviewContainer) verticalPreviewContainer.style.display = 'none';
    if (uploadVerticalBtn) uploadVerticalBtn.style.display = 'flex';
    if (verticalStatus) verticalStatus.style.display = 'none';
  }
}

async function handleCoverUpload(inputElement, type, statusElement) {
  const uploadHorizontalBtn = document.getElementById('upload-horizontal-btn');
  const horizontalPreviewContainer = document.getElementById('horizontal-preview-container');
  const uploadVerticalBtn = document.getElementById('upload-vertical-btn');
  const verticalPreviewContainer = document.getElementById('vertical-preview-container');

  const file = inputElement.files[0];
  if (!file) return;

  if (statusElement) {
    statusElement.textContent = 'Uploading...';
    statusElement.style.color = 'var(--primary)';
    statusElement.style.display = 'block';
  }

  if (type === 'horizontal') {
    if (horizontalPreviewContainer) horizontalPreviewContainer.style.display = 'none';
    if (uploadHorizontalBtn) uploadHorizontalBtn.style.display = 'none';
  } else {
    if (verticalPreviewContainer) verticalPreviewContainer.style.display = 'none';
    if (uploadVerticalBtn) uploadVerticalBtn.style.display = 'none';
  }

  if (!window.AppState.currentGalleryId) {
    if (statusElement) {
      statusElement.textContent = 'No project selected';
      statusElement.style.color = '#ef4444';
    }
    if (type === 'horizontal') {
      if (uploadHorizontalBtn) uploadHorizontalBtn.style.display = 'flex';
    } else {
      if (uploadVerticalBtn) uploadVerticalBtn.style.display = 'flex';
    }
    return;
  }
  const eventId = window.AppState.currentGalleryId;

  try {
    const res = await window.api.uploadCoverPhoto({
      filePath: file.path,
      type,
      eventId,
      backendUrl: window.AppState.apiBaseUrl,
      token: window.AppState.authToken
    });

    if (res.success) {
      const matched = window.AppState.projects.find(p => p.id === eventId);
      if (matched) {
        if (type === 'horizontal') matched.coverPhotoUrl = res.url;
        else matched.coverPhotoMobileUrl = res.url;
        updateCoverPreviews(matched);
      }
    } else {
      if (statusElement) {
        statusElement.textContent = 'Failed';
        statusElement.style.color = '#ef4444';
      }
      if (type === 'horizontal') {
        if (uploadHorizontalBtn) uploadHorizontalBtn.style.display = 'flex';
      } else {
        if (uploadVerticalBtn) uploadVerticalBtn.style.display = 'flex';
      }
    }
  } catch (err) {
    console.error(`Failed to upload ${type} cover:`, err);
    if (statusElement) {
      statusElement.textContent = 'Error';
      statusElement.style.color = '#ef4444';
    }
    if (type === 'horizontal') {
      if (uploadHorizontalBtn) uploadHorizontalBtn.style.display = 'flex';
    } else {
      if (uploadVerticalBtn) uploadVerticalBtn.style.display = 'flex';
    }
    await showModal({ icon: '❌', title: 'Cover Upload Failed', sub: err.message, confirmText: 'OK', danger: true });
  } finally {
    inputElement.value = '';
  }
}

// ----------------------------------------------------
// Cinema Video Post-Upload Details Modal
// ----------------------------------------------------

let activeEditPhoto = null;

function initVideoEditModal() {
  const modal = document.getElementById('video-edit-modal');
  const closeBtn = document.getElementById('edit-video-close-btn');
  const cancelBtn = document.getElementById('edit-video-cancel-btn');
  const saveBtn = document.getElementById('edit-video-save-btn');
  const shuffleBtn = document.getElementById('edit-video-shuffle-btn');
  const changePosterBtn = document.getElementById('edit-video-change-poster-btn');
  const catSelect = document.getElementById('edit-video-category-select');
  const descInput = document.getElementById('edit-video-desc-input');
  const titleInput = document.getElementById('edit-video-title-input');
  const subInput = document.getElementById('edit-video-subtitle-input');
  const orderInput = document.getElementById('edit-video-sort-order');
  const featuredCheck = document.getElementById('edit-video-featured-checkbox');
  const comingSoonCheck = document.getElementById('edit-video-coming-soon-checkbox');

  if (titleInput) {
    titleInput.addEventListener('input', () => {
      if (activeEditPhoto) {
        activeEditPhoto.title = titleInput.value;
        if (!activeEditPhoto.exif) activeEditPhoto.exif = {};
        activeEditPhoto.exif.title = titleInput.value;
      }
    });
  }
  if (subInput) {
    subInput.addEventListener('input', () => {
      if (activeEditPhoto) {
        activeEditPhoto.subtitle = subInput.value;
        if (!activeEditPhoto.exif) activeEditPhoto.exif = {};
        activeEditPhoto.exif.subtitle = subInput.value;
      }
    });
  }
  if (comingSoonCheck) {
    comingSoonCheck.addEventListener('change', () => {
      if (activeEditPhoto) {
        activeEditPhoto.isComingSoon = comingSoonCheck.checked;
        if (!activeEditPhoto.exif) activeEditPhoto.exif = {};
        activeEditPhoto.exif.isComingSoon = comingSoonCheck.checked;
      }
    });
  }
  if (catSelect) {
    catSelect.addEventListener('change', () => {
      if (activeEditPhoto) {
        activeEditPhoto.cinemaCategory = catSelect.value;
        if (!activeEditPhoto.exif) activeEditPhoto.exif = {};
        activeEditPhoto.exif.cinemaCategory = catSelect.value;
      }
    });
  }
  if (descInput) {
    descInput.addEventListener('input', () => {
      if (activeEditPhoto) {
        activeEditPhoto.description = descInput.value;
        if (!activeEditPhoto.exif) activeEditPhoto.exif = {};
        activeEditPhoto.exif.description = descInput.value;
      }
    });
  }
  if (orderInput) {
    orderInput.addEventListener('input', () => {
      if (activeEditPhoto) {
        const val = parseInt(orderInput.value, 10) || 1;
        activeEditPhoto.sortOrder = val;
        if (!activeEditPhoto.exif) activeEditPhoto.exif = {};
        activeEditPhoto.exif.sortOrder = val;
      }
    });
  }
  if (featuredCheck) {
    featuredCheck.addEventListener('change', () => {
      if (activeEditPhoto) {
        activeEditPhoto.isFeatured = Boolean(featuredCheck.checked);
        if (!activeEditPhoto.exif) activeEditPhoto.exif = {};
        activeEditPhoto.exif.isFeatured = Boolean(featuredCheck.checked);
      }
    });
  }

  const closeModal = () => {
    if (modal) modal.classList.remove('open');
    activeEditPhoto = null;
  };

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
      const cat = catSelect ? catSelect.value : 'THE DIRECTORS’ CUT';
      const helper = window.CinemaMetadata;
      if (helper && descInput) {
        const subtype = helper.detectCinemaSubtype(activeEditPhoto ? activeEditPhoto.filename : '', false);
        let lookupKey = subtype;
        if (cat === 'THE DIRECTORS’ CUT') {
          lookupKey = (subtype === 'prewedding') ? 'prewedding' : 'trailer';
        } else if (cat === 'CANDID DIARIES') {
          lookupKey = 'reel';
        } else if (cat === 'STAGE & SPOTLIGHT') {
          lookupKey = 'performance';
        } else if (cat === 'THE EXTENDED CUTS') {
          if (!['haldi', 'mehendi', 'sangeet', 'wedding', 'reception', 'engagement', 'cocktail', 'chooda', 'baraat', 'varmala', 'vidai'].includes(subtype)) {
            lookupKey = 'wedding';
          }
        }
        const newDesc = helper.getRandomDescription(lookupKey);
        descInput.value = newDesc;
      }
    });
  }

  if (changePosterBtn) {
    changePosterBtn.addEventListener('click', async () => {
      if (!activeEditPhoto) return;

      // Only open editor if user selects/uploads a fresh photo to avoid baking text-on-text!
      let cleanImageData = null;
      let chosenPath = null;

      try {
        if (window.api && window.api.selectVideoCover) {
          chosenPath = await window.api.selectVideoCover(activeEditPhoto.filename);
          if (!chosenPath) return; // User canceled dialog -> do NOT open editor on prev baked poster

          const inspected = await window.api.inspectCoverImage(chosenPath);
          if (inspected && (inspected.highResDataUrl || inspected.previewDataUrl)) {
            cleanImageData = inspected.highResDataUrl || inspected.previewDataUrl;
          }
        }
      } catch (selErr) {
        console.warn('Cover selection cancelled or error:', selErr);
        return;
      }

      if (!cleanImageData) return;

      if (window.PosterStudio && window.PosterStudio.open) {
        const galleryName = getCurrentGalleryName();
        const curTitle = (document.getElementById('edit-video-title-input')?.value || activeEditPhoto.title || '').trim() || (window.CinemaMetadata ? window.CinemaMetadata.generateCleanTitle(activeEditPhoto.filename) : activeEditPhoto.filename);
        const curSub = (document.getElementById('edit-video-subtitle-input')?.value !== undefined && document.getElementById('edit-video-subtitle-input')?.value !== '') ? document.getElementById('edit-video-subtitle-input').value : (activeEditPhoto.subtitle || activeEditPhoto.exif?.subtitle || galleryName || "CHAPTER I • 18 MIN");

        window.PosterStudio.open({
          initialImage: cleanImageData, // Fresh clean photo without old baked text!
          initialTitle: curTitle,
          initialSubtitle: curSub,
          onSave: async ({ base64Data, tempFilePath, config }) => {
            const toast = document.createElement("div");
            toast.style.cssText = `
              position: fixed;
              bottom: 24px;
              right: 24px;
              background: #18181f;
              border: 1px solid var(--primary);
              color: #fff;
              padding: 12px 18px;
              border-radius: 8px;
              font-size: 12px;
              display: flex;
              align-items: center;
              gap: 10px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.6);
              z-index: 99999;
            `;
            toast.innerHTML = `<span>⏳</span> Uploading 4:3 portrait poster...`;
            document.body.appendChild(toast);
            try {
              const res = await window.api.updateVideoCover({
                filePath: tempFilePath,
                base64Content: base64Data,
                eventId: window.AppState.currentGalleryId,
                photoId: activeEditPhoto.id,
                backendUrl: window.AppState.apiBaseUrl,
                token: window.AppState.authToken
              });

              if (res && res.thumbnailUrl) {
                activeEditPhoto.thumbnailUrl = res.thumbnailUrl;
                activeEditPhoto.hasBakedCover = true;
                if (!activeEditPhoto.exif) activeEditPhoto.exif = {};
                activeEditPhoto.exif.hasBakedCover = true;

                // Track that this video has a baked cover
                try {
                  const bSet = new Set(JSON.parse(localStorage.getItem('misty_baked_cover_ids') || '[]'));
                  bSet.add(activeEditPhoto.id);
                  localStorage.setItem('misty_baked_cover_ids', JSON.stringify([...bSet]));
                } catch (_) {}

                // Sync new title & subtitle if changed in Poster Studio
                if (config) {
                  if (config.title) {
                    activeEditPhoto.title = config.title;
                    activeEditPhoto.exif.title = config.title;
                    const titleEl = document.getElementById('edit-video-title-input');
                    if (titleEl) titleEl.value = config.title;
                  }
                  if (config.subtitle !== undefined) {
                    activeEditPhoto.subtitle = config.subtitle;
                    activeEditPhoto.exif.subtitle = config.subtitle;
                    const subEl = document.getElementById('edit-video-subtitle-input');
                    if (subEl) subEl.value = config.subtitle;
                  }

                  // Read current values directly from modal inputs to preserve EVERYTHING
                  const currentCategory = document.getElementById('edit-video-category-select')?.value || classifyCinemaCategoryForVideo(activeEditPhoto);
                  const currentDesc = (document.getElementById('edit-video-desc-input')?.value || activeEditPhoto.description || '').trim();
                  const currentOrder = parseInt(document.getElementById('edit-video-sort-order')?.value, 10) || activeEditPhoto.sortOrder || 1;
                  const currentFeatured = document.getElementById('edit-video-featured-checkbox') ? Boolean(document.getElementById('edit-video-featured-checkbox').checked) : Boolean(activeEditPhoto.isFeatured || activeEditPhoto.exif?.isFeatured);

                  activeEditPhoto.cinemaCategory = currentCategory;
                  activeEditPhoto.description = currentDesc;
                  activeEditPhoto.sortOrder = currentOrder;
                  activeEditPhoto.isFeatured = currentFeatured;
                  activeEditPhoto.exif.cinemaCategory = currentCategory;
                  activeEditPhoto.exif.description = currentDesc;
                  activeEditPhoto.exif.sortOrder = currentOrder;
                  activeEditPhoto.exif.isFeatured = currentFeatured;

                  // Save updated metadata to backend asynchronously, preserving the true category and all fields
                  window.api.updateVideoMetadata({
                    eventId: window.AppState.currentGalleryId,
                    photoId: activeEditPhoto.id,
                    title: activeEditPhoto.title,
                    subtitle: activeEditPhoto.subtitle,
                    cinemaCategory: currentCategory,
                    description: currentDesc,
                    sortOrder: currentOrder,
                    isFeatured: currentFeatured,
                    backendUrl: window.AppState.apiBaseUrl,
                    token: window.AppState.authToken
                  }).catch(e => console.warn('Sync metadata error:', e.message));
                }

                const newAbs = res.thumbnailUrl.startsWith("/") ? `${window.AppState.apiBaseUrl}${res.thumbnailUrl}` : res.thumbnailUrl;
                const posterImg = document.getElementById("edit-video-poster-img");
                const placeholder = document.getElementById("edit-video-poster-placeholder");
                if (posterImg) {
                  posterImg.src = `${newAbs}?t=${Date.now()}`;
                  posterImg.style.display = "block";
                }
                if (placeholder) placeholder.style.display = "none";

                if (window.AppState.currentUploadedPhotosList) {
                  const found = window.AppState.currentUploadedPhotosList.find(p => p.id === activeEditPhoto.id);
                  if (found) {
                    found.thumbnailUrl = res.thumbnailUrl;
                    found.hasBakedCover = true;
                    if (config && config.title) found.title = config.title;
                    if (config && config.subtitle !== undefined) found.subtitle = config.subtitle;
                    found.cinemaCategory = activeEditPhoto.cinemaCategory;
                    found.description = activeEditPhoto.description;
                    found.sortOrder = activeEditPhoto.sortOrder;
                    found.isFeatured = activeEditPhoto.isFeatured;
                    if (!found.exif) found.exif = {};
                    found.exif.hasBakedCover = true;
                    if (config && config.title) found.exif.title = config.title;
                    if (config && config.subtitle !== undefined) found.exif.subtitle = config.subtitle;
                    found.exif.cinemaCategory = activeEditPhoto.cinemaCategory;
                    found.exif.description = activeEditPhoto.description;
                    found.exif.sortOrder = activeEditPhoto.sortOrder;
                    found.exif.isFeatured = activeEditPhoto.isFeatured;
                  }
                }

                // Update card in DOM immediately
                const cardEl = document.querySelector(`.cinema-poster-card[data-id="${activeEditPhoto.id}"]`);
                if (cardEl) {
                  const cardImg = cardEl.querySelector('.cinema-poster-img');
                  if (cardImg) cardImg.src = `${newAbs}?t=${Date.now()}`;
                  // Remove old title overlay and scrim from card
                  const oldTitleEl = cardEl.querySelector('.cinema-poster-title');
                  if (oldTitleEl) oldTitleEl.remove();
                  const oldScrimEl = cardEl.querySelector('.cinema-poster-scrim');
                  if (oldScrimEl) oldScrimEl.remove();
                }

                toast.style.borderColor = "#10b981";
                toast.innerHTML = `✅ 4:3 Movie poster updated!`;
                setTimeout(() => toast.remove(), 3000);
              }
            } catch (err) {
              console.error("Failed to change poster:", err);
              toast.style.borderColor = "#dc3545";
              toast.innerHTML = `❌ Error: ${err.message || "Failed to update poster"}`;
              setTimeout(() => toast.remove(), 4000);
            }
          }
        });
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (!activeEditPhoto) return;
      const title = (document.getElementById('edit-video-title-input')?.value || '').trim();
      const subtitle = (document.getElementById('edit-video-subtitle-input')?.value || '').trim();
      const cinemaCategory = document.getElementById('edit-video-category-select')?.value || classifyCinemaCategoryForVideo(activeEditPhoto);
      const description = (document.getElementById('edit-video-desc-input')?.value || '').trim();
      const sortOrder = parseInt(document.getElementById('edit-video-sort-order')?.value, 10) || 1;
      const isFeatured = Boolean(document.getElementById('edit-video-featured-checkbox')?.checked);
      const isVideoFile = ['.mp4', '.mov', '.m4v'].some(ext => (activeEditPhoto.filename || activeEditPhoto.r2Url || '').toLowerCase().endsWith(ext));
      const isPhotoOnly = !isVideoFile;
      const isComingSoon = Boolean(document.getElementById('edit-video-coming-soon-checkbox')?.checked || isPhotoOnly);

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const res = await window.api.updateVideoMetadata({
          eventId: window.AppState.currentGalleryId,
          photoId: activeEditPhoto.id,
          title,
          subtitle,
          description,
          cinemaCategory,
          sortOrder,
          isFeatured,
          isComingSoon,
          backendUrl: window.AppState.apiBaseUrl,
          token: window.AppState.authToken
        });

        if (res && (res.success || res.photo)) {
          // Update photo in client memory
          activeEditPhoto.title = title;
          activeEditPhoto.subtitle = subtitle;
          activeEditPhoto.description = description;
          activeEditPhoto.cinemaCategory = cinemaCategory;
          activeEditPhoto.sortOrder = sortOrder;
          activeEditPhoto.isFeatured = isFeatured;
          activeEditPhoto.isComingSoon = isComingSoon;
          if (!activeEditPhoto.exif) activeEditPhoto.exif = {};
          activeEditPhoto.exif.title = title;
          activeEditPhoto.exif.subtitle = subtitle;
          activeEditPhoto.exif.description = description;
          activeEditPhoto.exif.cinemaCategory = cinemaCategory;
          activeEditPhoto.exif.sortOrder = sortOrder;
          activeEditPhoto.exif.isFeatured = isFeatured;
          activeEditPhoto.exif.isComingSoon = isComingSoon;

          // If featured, clear other photos' featured status in client memory
          if (isFeatured) {
            if (window.AppState.currentUploadedPhotosList) {
              window.AppState.currentUploadedPhotosList.forEach(p => {
                if (p.id !== activeEditPhoto.id) {
                  p.isFeatured = false;
                  if (p.exif) p.exif.isFeatured = false;
                }
              });
            }
          }

          // Clear cache and reload grid
          window.AppState.uploadedPhotosCache = {};
          await loadUploadedPhotos();

          const lModal = document.getElementById('lightbox-modal');
          if (lModal && lModal.classList.contains('open')) {
            renderLightboxCurrent();
          }

          const toast = document.createElement('div');
          toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #18181f;
            border: 1px solid #10b981;
            color: #fff;
            padding: 12px 18px;
            border-radius: 8px;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            z-index: 99999;
          `;
          toast.innerHTML = `✅ Saved film details for <b>${activeEditPhoto.filename}</b>!`;
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 3500);

          closeModal();
        } else {
          throw new Error(res?.error || 'Failed to update film metadata');
        }
      } catch (err) {
        console.error('Failed to save film metadata:', err);
        await showModal({
          icon: '❌',
          title: 'Save Failed',
          sub: err.message || 'Failed to save film details.',
          confirmText: 'OK',
          danger: true
        });
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      }
    });
  }

  const deleteBtn = document.getElementById('edit-video-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (activeEditPhoto) {
        await deleteCinemaItem(activeEditPhoto);
      }
    });
  }

  const attachBtn = document.getElementById('edit-video-attach-btn');
  if (attachBtn) {
    attachBtn.addEventListener('click', async () => {
      if (!activeEditPhoto) return;

      let chosenVideoPath = null;
      try {
        if (window.api && typeof window.api.selectVideoFile === 'function') {
          chosenVideoPath = await window.api.selectVideoFile(activeEditPhoto.title || activeEditPhoto.filename);
        } else if (window.api && typeof window.api.selectVideoOrFolder === 'function') {
          chosenVideoPath = await window.api.selectVideoOrFolder();
        }
      } catch (pickerErr) {
        console.warn('selectVideoFile error, checking restart needed:', pickerErr);
        if ((pickerErr.message || '').includes('No handler registered')) {
          await showModal({
            icon: '⚠️',
            title: 'App Restart Required',
            sub: 'A restart is required to load the new video attachment features.\n\nPlease close the uploader completely (Cmd + Q) and open it again.',
            confirmText: 'OK'
          });
          return;
        }
        try {
          if (window.api && typeof window.api.selectVideoOrFolder === 'function') {
            chosenVideoPath = await window.api.selectVideoOrFolder();
          }
        } catch (fbErr) {
          console.error('Fallback picker error:', fbErr);
        }
      }

      if (!chosenVideoPath) return;

      const ext = (chosenVideoPath.split('.').pop() || '').toLowerCase();
      if (!['mp4', 'mov', 'm4v'].includes(ext)) {
        await showModal({
          icon: '⚠️',
          title: 'Invalid File',
          sub: 'Please select a valid video file (.mp4, .mov, or .m4v).',
          confirmText: 'OK'
        });
        return;
      }

      const videoQualitySelect = document.getElementById('video-quality');
      const selectedQuality = videoQualitySelect ? videoQualitySelect.value : '14mbps';

      const progressModal = document.getElementById('video-attach-progress-modal');
      const modalTitle = document.getElementById('video-attach-modal-title');
      const modalSub = document.getElementById('video-attach-modal-sub');
      const progressBar = document.getElementById('video-attach-modal-bar');
      const stageText = document.getElementById('video-attach-modal-stage');
      const pctText = document.getElementById('video-attach-modal-pct');

      const videoFilename = chosenVideoPath.split(/[/\\]/).pop();

      if (progressModal) {
        if (modalTitle) modalTitle.textContent = `Optimizing & Uploading "${activeEditPhoto.title || videoFilename}"`;
        if (modalSub) modalSub.textContent = `Applying faststart stream remuxing (${selectedQuality})...`;
        if (progressBar) progressBar.style.width = '0%';
        if (stageText) stageText.textContent = 'Inspecting video...';
        if (pctText) pctText.textContent = '0%';
        progressModal.style.display = 'flex';
      }

      if (window.api.onAttachVideoProgress) {
        window.api.onAttachVideoProgress((data) => {
          if (progressBar && typeof data.percent === 'number') {
            progressBar.style.width = `${data.percent}%`;
          }
          if (pctText && typeof data.percent === 'number') {
            pctText.textContent = `${data.percent}%`;
          }
          if (stageText && data.detail) {
            stageText.textContent = data.detail;
          }
        });
      }

      try {
        const res = await window.api.attachVideoToFilm({
          eventId: window.AppState.currentGalleryId,
          photoId: activeEditPhoto.id,
          videoPath: chosenVideoPath,
          videoQuality: selectedQuality,
          backendUrl: window.AppState.apiBaseUrl,
          token: window.AppState.authToken
        });

        if (progressModal) progressModal.style.display = 'none';

        if (res && res.photo) {
          activeEditPhoto.r2Url = res.photo.r2Url;
          activeEditPhoto.filename = res.photo.filename;
          activeEditPhoto.isComingSoon = false;
          if (activeEditPhoto.exif) activeEditPhoto.exif.isComingSoon = false;

          const comingSoonCheck = document.getElementById('edit-video-coming-soon-checkbox');
          if (comingSoonCheck) comingSoonCheck.checked = false;

          const fileBadge = document.getElementById('edit-video-file-badge');
          const fileDesc = document.getElementById('edit-video-file-desc');
          if (fileBadge) {
            fileBadge.textContent = '✓ ACTIVE FILM';
            fileBadge.style.background = 'rgba(16, 185, 129, 0.15)';
            fileBadge.style.color = '#10b981';
          }
          if (fileDesc) fileDesc.textContent = `Attached: ${res.photo.filename} (Faststart streaming enabled)`;
          if (attachBtn) {
            attachBtn.textContent = '🔄 Replace Video File';
            attachBtn.style.background = 'rgba(255, 255, 255, 0.08)';
            attachBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            attachBtn.style.color = '#fff';
          }

          if (window.AppState.currentUploadedPhotosList) {
            const found = window.AppState.currentUploadedPhotosList.find(p => p.id === activeEditPhoto.id);
            if (found) {
              found.r2Url = res.photo.r2Url;
              found.filename = res.photo.filename;
              found.isComingSoon = false;
              if (found.exif) found.exif.isComingSoon = false;
            }
          }

          window.AppState.uploadedPhotosCache = {};
          await loadUploadedPhotos();

          await showModal({
            icon: '✅',
            title: 'Video Attached Successfully',
            sub: `"${activeEditPhoto.title || res.photo.filename}" now has an active video file attached.\n\nComing Soon badge has been removed and the film is ready to play with zero buffering.`,
            confirmText: 'OK'
          });
        }
      } catch (err) {
        if (progressModal) progressModal.style.display = 'none';
        const isRestartNeeded = (err.message || '').includes('No handler registered');
        await showModal({
          icon: '❌',
          title: isRestartNeeded ? 'App Restart Required' : 'Attach Video Failed',
          sub: isRestartNeeded
            ? 'Please completely quit the uploader (Cmd + Q) and restart it so the video engine is active.'
            : (err.message || 'Failed to attach video file.'),
          confirmText: 'OK',
          danger: true
        });
      }
    });
  }
}

function openVideoEditModal(photo) {
  if (!photo) return;
  activeEditPhoto = photo;

  const modal = document.getElementById('video-edit-modal');
  const filenameEl = document.getElementById('edit-video-filename');
  const titleInput = document.getElementById('edit-video-title-input');
  const descInput = document.getElementById('edit-video-desc-input');
  const catSelect = document.getElementById('edit-video-category-select');
  const orderInput = document.getElementById('edit-video-sort-order');
  const featuredCheck = document.getElementById('edit-video-featured-checkbox');
  const posterImg = document.getElementById('edit-video-poster-img');
  const placeholder = document.getElementById('edit-video-poster-placeholder');

  if (filenameEl) filenameEl.textContent = photo.filename || 'Video';

  const defaultTitle = photo.title || photo.exif?.title || (window.CinemaMetadata ? window.CinemaMetadata.generateCleanTitle(photo.filename) : photo.filename);
  if (titleInput) titleInput.value = defaultTitle;

  const galleryName = getCurrentGalleryName();
  const subInput = document.getElementById('edit-video-subtitle-input');
  const defaultSubtitle = photo.subtitle || photo.exif?.subtitle || galleryName || 'CHAPTER I • 18 MIN';
  if (subInput) {
    subInput.value = defaultSubtitle;
    if (galleryName) subInput.placeholder = `e.g. ${galleryName}`;
  }

  const currentCategory = classifyCinemaCategoryForVideo(photo);
  if (catSelect) catSelect.value = currentCategory;
  activeEditPhoto.cinemaCategory = currentCategory;
  if (!activeEditPhoto.exif) activeEditPhoto.exif = {};
  activeEditPhoto.exif.cinemaCategory = currentCategory;

  let currentDesc = photo.description || photo.exif?.description || '';
  if (!currentDesc && window.CinemaMetadata) {
    const subtype = window.CinemaMetadata.detectCinemaSubtype(photo.filename, false);
    currentDesc = window.CinemaMetadata.getRandomDescription(subtype);
  }
  if (descInput) descInput.value = currentDesc;

  const currentOrder = getPhotoSortOrder(photo);
  if (orderInput) orderInput.value = (currentOrder === 9999 ? 1 : currentOrder);

  const isFeat = Boolean(photo.isFeatured || photo.exif?.isFeatured);
  if (featuredCheck) featuredCheck.checked = isFeat;
  activeEditPhoto.isFeatured = isFeat;
  activeEditPhoto.exif.isFeatured = isFeat;

  const comingSoonCheck = document.getElementById('edit-video-coming-soon-checkbox');
  const isVideoFile = ['.mp4', '.mov', '.m4v'].some(ext => (photo.filename || photo.r2Url || '').toLowerCase().endsWith(ext));
  const isPhotoOnly = !isVideoFile;
  const isSoon = Boolean(photo.isComingSoon || photo.exif?.isComingSoon || isPhotoOnly);
  if (comingSoonCheck) comingSoonCheck.checked = isSoon;
  activeEditPhoto.isComingSoon = isSoon;
  activeEditPhoto.exif.isComingSoon = isSoon;

  // Update Film Video File UI Section
  const fileBadge = document.getElementById('edit-video-file-badge');
  const fileDesc = document.getElementById('edit-video-file-desc');
  const attachBtn = document.getElementById('edit-video-attach-btn');
  const attachStatus = document.getElementById('edit-video-attach-status');
  if (attachStatus) attachStatus.style.display = 'none';

  if (isPhotoOnly) {
    if (fileBadge) {
      fileBadge.textContent = '✨ COMING SOON (NO VIDEO)';
      fileBadge.style.background = 'rgba(229, 196, 131, 0.15)';
      fileBadge.style.color = '#E5C483';
    }
    if (fileDesc) fileDesc.textContent = 'No video attached yet. Click below to attach an MP4/MOV video.';
    if (attachBtn) {
      attachBtn.textContent = '🎬 Attach Video File';
      attachBtn.style.background = 'rgba(229, 9, 20, 0.15)';
      attachBtn.style.borderColor = 'rgba(229, 9, 20, 0.4)';
      attachBtn.style.color = '#ff4d4d';
    }
  } else {
    if (fileBadge) {
      fileBadge.textContent = '✓ ACTIVE FILM';
      fileBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      fileBadge.style.color = '#10b981';
    }
    const cleanVidName = photo.filename || 'wedding_film.mp4';
    if (fileDesc) fileDesc.textContent = `Attached: ${cleanVidName} (Faststart streaming enabled)`;
    if (attachBtn) {
      attachBtn.textContent = '🔄 Replace Video File';
      attachBtn.style.background = 'rgba(255, 255, 255, 0.08)';
      attachBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      attachBtn.style.color = '#fff';
    }
  }

  const rawThumb = photo.thumbnailUrl;
  const absThumb = rawThumb ? (rawThumb.startsWith('/') ? `${window.AppState.apiBaseUrl}${rawThumb}` : rawThumb) : '';
  if (absThumb) {
    if (posterImg) {
      posterImg.src = absThumb;
      posterImg.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
  } else {
    if (posterImg) {
      posterImg.src = '';
      posterImg.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'block';
  }

  if (modal) modal.classList.add('open');
}
