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

  card.innerHTML = `
    ${posterMediaHtml}
    <div class="cinema-poster-scrim"></div>
    <div class="cinema-card-top-badges">
      <div class="cinema-badge-seq">#${idx + 1}</div>
      ${badgeRightHtml}
    </div>
    <div class="cinema-poster-footer">
      <div class="cinema-poster-title" title="${cleanTitle}">${cleanTitle}</div>
      ${durationDisplay ? `<div class="cinema-poster-duration">⏱ ${durationDisplay}</div>` : ''}
    </div>
    <div class="cinema-card-hover-overlay">
      <button class="cinema-hover-btn btn-eye" title="Watch Video">👁</button>
      <button class="cinema-hover-btn btn-edit" title="Edit Video Details">✏️</button>
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
          if (!['haldi', 'mehendi', 'sangeet', 'wedding', 'reception', 'engagement'].includes(subtype)) {
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
      const chosenPath = await window.api.selectVideoCover(activeEditPhoto.filename);
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
        z-index: 99999;
      `;
      toast.innerHTML = `<span>⏳</span> Uploading 2:3 portrait poster...`;
      document.body.appendChild(toast);

      try {
        const res = await window.api.updateVideoCover({
          filePath: chosenPath,
          eventId: window.AppState.currentGalleryId,
          photoId: activeEditPhoto.id,
          backendUrl: window.AppState.apiBaseUrl,
          token: window.AppState.authToken
        });

        if (res && res.thumbnailUrl) {
          activeEditPhoto.thumbnailUrl = res.thumbnailUrl;
          const absThumb = res.thumbnailUrl.startsWith('/') ? `${window.AppState.apiBaseUrl}${res.thumbnailUrl}` : res.thumbnailUrl;
          const posterImg = document.getElementById('edit-video-poster-img');
          const placeholder = document.getElementById('edit-video-poster-placeholder');
          if (posterImg) {
            posterImg.src = `${absThumb}?t=${Date.now()}`;
            posterImg.style.display = 'block';
          }
          if (placeholder) placeholder.style.display = 'none';

          // Update cache
          if (window.AppState.currentUploadedPhotosList) {
            const found = window.AppState.currentUploadedPhotosList.find(p => p.id === activeEditPhoto.id);
            if (found) found.thumbnailUrl = res.thumbnailUrl;
          }

          toast.style.borderColor = '#10b981';
          toast.innerHTML = `✅ 2:3 Movie poster updated!`;
          setTimeout(() => toast.remove(), 3000);
        } else {
          throw new Error(res?.error || 'Failed to upload poster');
        }
      } catch (err) {
        console.error('Failed to change poster:', err);
        toast.style.borderColor = '#dc3545';
        toast.innerHTML = `❌ Error: ${err.message || 'Failed to update poster'}`;
        setTimeout(() => toast.remove(), 4000);
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (!activeEditPhoto) return;
      const title = (document.getElementById('edit-video-title-input')?.value || '').trim();
      const cinemaCategory = document.getElementById('edit-video-category-select')?.value || 'THE DIRECTORS’ CUT';
      const description = (document.getElementById('edit-video-desc-input')?.value || '').trim();
      const sortOrder = parseInt(document.getElementById('edit-video-sort-order')?.value, 10) || 1;
      const isFeatured = Boolean(document.getElementById('edit-video-featured-checkbox')?.checked);

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const res = await window.api.updateVideoMetadata({
          eventId: window.AppState.currentGalleryId,
          photoId: activeEditPhoto.id,
          title,
          description,
          cinemaCategory,
          sortOrder,
          isFeatured,
          backendUrl: window.AppState.apiBaseUrl,
          token: window.AppState.authToken
        });

        if (res && (res.success || res.photo)) {
          // Update photo in client memory
          activeEditPhoto.title = title;
          activeEditPhoto.description = description;
          activeEditPhoto.cinemaCategory = cinemaCategory;
          activeEditPhoto.sortOrder = sortOrder;
          activeEditPhoto.isFeatured = isFeatured;
          if (!activeEditPhoto.exif) activeEditPhoto.exif = {};
          activeEditPhoto.exif.title = title;
          activeEditPhoto.exif.description = description;
          activeEditPhoto.exif.cinemaCategory = cinemaCategory;
          activeEditPhoto.exif.sortOrder = sortOrder;
          activeEditPhoto.exif.isFeatured = isFeatured;

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

  const currentCategory = photo.cinemaCategory || photo.exif?.cinemaCategory || 'THE DIRECTORS’ CUT';
  if (catSelect) catSelect.value = currentCategory;

  let currentDesc = photo.description || photo.exif?.description || '';
  if (!currentDesc && window.CinemaMetadata) {
    const subtype = window.CinemaMetadata.detectCinemaSubtype(photo.filename, false);
    currentDesc = window.CinemaMetadata.getRandomDescription(subtype);
  }
  if (descInput) descInput.value = currentDesc;

  const currentOrder = photo.sortOrder || photo.exif?.sortOrder || 1;
  if (orderInput) orderInput.value = currentOrder;

  if (featuredCheck) featuredCheck.checked = Boolean(photo.isFeatured);

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
