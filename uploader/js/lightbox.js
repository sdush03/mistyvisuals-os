// Lightbox, Photos Grid, Batch Actions & Cover Photo Component

let currentLightboxPhotos = [];
let currentLightboxIndex = 0;

function initLightboxUI() {
  const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
  const lightboxPrevBtn = document.getElementById('lightbox-prev-btn');
  const lightboxNextBtn = document.getElementById('lightbox-next-btn');

  if (lightboxCloseBtn) {
    lightboxCloseBtn.addEventListener('click', () => {
      document.getElementById('lightbox-modal')?.classList.remove('open');
    });
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

  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('lightbox-modal');
    if (!modal || !modal.classList.contains('open')) return;
    if (e.key === 'Escape') {
      modal.classList.remove('open');
    } else if (e.key === 'ArrowLeft') {
      document.getElementById('lightbox-prev-btn')?.click();
    } else if (e.key === 'ArrowRight') {
      document.getElementById('lightbox-next-btn')?.click();
    }
  });

  initTabManagementUI();
  initBatchActionsUI();
  initCoverUploadUI();
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

  const rawUrl = photo.r2Url || photo.thumbnailUrl;
  const absUrl = rawUrl ? (rawUrl.startsWith('/') ? `${window.AppState.apiBaseUrl}${rawUrl}` : rawUrl) : '';

  const imgEl = document.getElementById('lightbox-img');
  const filenameEl = document.getElementById('lightbox-filename');
  const metaEl = document.getElementById('lightbox-meta');
  const counterEl = document.getElementById('lightbox-counter');
  const openUrlBtn = document.getElementById('lightbox-open-url-btn');

  if (imgEl) imgEl.src = absUrl;
  if (filenameEl) filenameEl.textContent = photo.filename || 'Photo';

  const dimStr = (photo.width && photo.height) ? `${photo.width} × ${photo.height}px` : 'High Resolution';
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

      const activeUrl = photo.thumbnailUrl || photo.r2Url;
      const imgUrl = activeUrl.startsWith('/') ? `${window.AppState.apiBaseUrl}${activeUrl}` : activeUrl;
      
      item.innerHTML = `
        <img src="${imgUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;" loading="lazy">
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

      updateItemSelectionState();
      if (uploadedPhotosGrid) uploadedPhotosGrid.appendChild(item);
    });
  } catch (err) {
    console.error('Error loading uploaded photos:', err);
    if (uploadedPhotosGrid) uploadedPhotosGrid.innerHTML = `<div style="color: #ef4444; font-size: 11px; padding: 12px; line-height: 1.5;"><strong>Error loading photos:</strong> ${err.message}</div>`;
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

      if (oldName === 'Highlights') {
        await showModal({ icon: '🔒', title: 'Cannot rename', sub: '"Highlights" is a permanent tab and cannot be renamed.', confirmText: 'OK' });
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

      if (tabName === 'Highlights') {
        await showModal({ icon: '🔒', title: 'Cannot delete', sub: '"Highlights" is a permanent tab and cannot be deleted.', confirmText: 'OK' });
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
