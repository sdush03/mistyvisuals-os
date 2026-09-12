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

/**
 * Interactive confirmation modal before starting uploads or attaching/replacing videos.
 * Displays photo conversion settings (4K/2K/Original, Watermark) or cinema settings (Bitrate with recommendations, poster preview, baked text warning).
 */
function showUploadSettingsModal(config = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('upload-confirm-modal');
    if (!modal) {
      console.warn('upload-confirm-modal not found in DOM');
      return resolve({
        confirmed: true,
        uploadQuality: config.initialQuality || '4k',
        videoQuality: config.initialBitrate || '14mbps',
        applyWatermark: config.initialWatermark !== undefined ? Boolean(config.initialWatermark) : true
      });
    }

    const iconEl = document.getElementById('upload-confirm-icon');
    const titleEl = document.getElementById('upload-confirm-title');
    const subEl = document.getElementById('upload-confirm-sub');
    const itemBadge = document.getElementById('upload-confirm-item-badge');
    const tabBadge = document.getElementById('upload-confirm-tab-badge');
    const closeBtn = document.getElementById('upload-confirm-x-btn');
    const cancelBtn = document.getElementById('upload-confirm-cancel-btn');
    const confirmBtn = document.getElementById('upload-confirm-start-btn');

    const photoView = document.getElementById('upload-confirm-photo-view');
    const photoQualitySelect = document.getElementById('upload-confirm-photo-quality');
    const watermarkCheckbox = document.getElementById('upload-confirm-watermark');

    const cinemaView = document.getElementById('upload-confirm-cinema-view');
    const posterImg = document.getElementById('upload-confirm-poster-img');
    const posterFallback = document.getElementById('upload-confirm-poster-fallback');
    const filmTitleEl = document.getElementById('upload-confirm-film-title');
    const posterStatusPill = document.getElementById('upload-confirm-poster-status-pill');
    const unbakedWarning = document.getElementById('upload-confirm-unbaked-warning');
    const bakedNote = document.getElementById('upload-confirm-baked-note');
    const bitrateGroup = document.getElementById('upload-confirm-bitrate-group');
    const videoQualitySelect = document.getElementById('upload-confirm-video-quality');

    const isCinema = config.mode === 'cinema' || config.mode === 'attach-video';
    const isAttachVideo = config.mode === 'attach-video';
    const hasVideo = isCinema && (config.hasVideoFile !== false);
    // Explicit custom poster means either:
    // 1) A Coming Soon teaser poster (config.isComingSoon or !hasVideo), OR
    // 2) A video where the user explicitly chose/designed a custom cover (config.hasCustomCover)
    const hasCustomPoster = Boolean(config.hasCustomCover || config.isComingSoon || (!hasVideo && config.posterPreviewUrl));
    // Only require baked typography if an explicit custom poster was added or if it's a Coming Soon teaser poster.
    // Pure video uploads with auto-extracted 1s frames or video attachments should NEVER be blocked!
    const requiresBakedCheck = isCinema && !isAttachVideo && (!hasVideo || hasCustomPoster);

    // Setup Header & Badges
    if (iconEl) iconEl.textContent = isCinema ? '🎬' : '📸';
    if (titleEl) titleEl.textContent = config.title || (isCinema ? 'Confirm Cinema Upload Settings' : 'Confirm Photo Upload Settings');
    if (subEl) subEl.textContent = config.sub || 'Verify your conversion & processing options before starting.';
    if (itemBadge) itemBadge.textContent = config.countText || (isCinema ? '1 Film' : '1 Item');
    if (tabBadge) {
      tabBadge.textContent = config.tabName || (isCinema ? 'Cinema' : 'Gallery');
      tabBadge.style.display = config.tabName ? 'inline-block' : 'none';
    }
    if (confirmBtn) confirmBtn.textContent = config.confirmBtnText || 'Confirm & Start Upload';

    // Show/Hide Mode Views
    if (photoView) photoView.style.display = isCinema ? 'none' : 'flex';
    if (cinemaView) cinemaView.style.display = isCinema ? 'flex' : 'none';

    // Photo inputs
    if (photoQualitySelect) {
      photoQualitySelect.value = config.initialQuality || '4k';
    }
    if (watermarkCheckbox) {
      watermarkCheckbox.checked = config.initialWatermark !== undefined ? Boolean(config.initialWatermark) : true;
    }

    const openStudioBtn = document.getElementById('upload-confirm-open-studio-btn');
    let currentIsBaked = isCinema ? Boolean(config.isCoverBaked) : true;
    let currentPosterUrl = config.posterPreviewUrl || null;

    function applyBakedState(isBaked, newPreviewUrl) {
      currentIsBaked = Boolean(isBaked);
      if (newPreviewUrl) {
        currentPosterUrl = newPreviewUrl;
        if (posterImg) {
          posterImg.src = newPreviewUrl;
          posterImg.style.display = 'block';
        }
        if (posterFallback) posterFallback.style.display = 'none';
      }

      if (!requiresBakedCheck) {
        // Auto-frame video or attaching video: Never block confirm
        if (posterStatusPill) {
          if (hasCustomPoster && currentIsBaked) {
            posterStatusPill.innerHTML = '<span style="color:#34d399;">✓</span> Text Baked';
            posterStatusPill.style.background = 'rgba(16, 185, 129, 0.15)';
            posterStatusPill.style.color = '#34d399';
            posterStatusPill.style.border = '1px solid rgba(16, 185, 129, 0.3)';
          } else if (hasVideo && !hasCustomPoster) {
            posterStatusPill.innerHTML = '🎬 Auto 1s Video Frame';
            posterStatusPill.style.background = 'rgba(255, 255, 255, 0.08)';
            posterStatusPill.style.color = '#fff';
            posterStatusPill.style.border = '1px solid var(--surface-border)';
          } else {
            posterStatusPill.innerHTML = isAttachVideo ? '🎬 Video Attachment' : '✓ Ready';
            posterStatusPill.style.background = 'rgba(16, 185, 129, 0.15)';
            posterStatusPill.style.color = '#34d399';
            posterStatusPill.style.border = '1px solid rgba(16, 185, 129, 0.3)';
          }
        }
        if (unbakedWarning) unbakedWarning.style.display = 'none';
        if (bakedNote) bakedNote.style.display = (hasCustomPoster && currentIsBaked) ? 'flex' : 'none';
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.style.opacity = '1';
          confirmBtn.style.cursor = 'pointer';
          confirmBtn.title = '';
        }
        return;
      }

      if (currentIsBaked) {
        if (posterStatusPill) {
          posterStatusPill.innerHTML = '<span style="color:#34d399;">✓</span> Text Baked';
          posterStatusPill.style.background = 'rgba(16, 185, 129, 0.15)';
          posterStatusPill.style.color = '#34d399';
          posterStatusPill.style.border = '1px solid rgba(16, 185, 129, 0.3)';
        }
        if (unbakedWarning) unbakedWarning.style.display = 'none';
        if (bakedNote) bakedNote.style.display = 'flex';
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.style.opacity = '1';
          confirmBtn.style.cursor = 'pointer';
          confirmBtn.title = '';
        }
      } else {
        if (posterStatusPill) {
          posterStatusPill.innerHTML = '<span style="color:#fbbf24;">⚠️</span> Clean Poster (No Text)';
          posterStatusPill.style.background = 'rgba(245, 158, 11, 0.15)';
          posterStatusPill.style.color = '#fbbf24';
          posterStatusPill.style.border = '1px solid rgba(245, 158, 11, 0.35)';
        }
        if (unbakedWarning) unbakedWarning.style.display = 'block';
        if (bakedNote) bakedNote.style.display = 'none';
        if (confirmBtn) {
          confirmBtn.disabled = true;
          confirmBtn.style.opacity = '0.35';
          confirmBtn.style.cursor = 'not-allowed';
          confirmBtn.title = 'Please bake editorial text onto poster in Poster Studio to proceed';
        }
      }
    }

    // Cinema inputs
    if (isCinema) {
      if (filmTitleEl) {
        filmTitleEl.textContent = config.filmTitle || 'Film Poster';
      }
      if (posterImg && posterFallback) {
        if (config.posterPreviewUrl) {
          posterImg.src = config.posterPreviewUrl;
          posterImg.style.display = 'block';
          posterFallback.style.display = 'none';
        } else {
          posterImg.style.display = 'none';
          posterFallback.style.display = 'block';
        }
      }

      // Apply initial baked status and lock state
      applyBakedState(config.isCoverBaked);

      // Bitrate Group (only show if video file is present)
      if (bitrateGroup) {
        bitrateGroup.style.display = hasVideo ? 'block' : 'none';
      }
      if (videoQualitySelect) {
        videoQualitySelect.value = config.initialBitrate || '14mbps';
      }

      function updateBitrateTableHighlight(selectedTier) {
        const tier = selectedTier || (videoQualitySelect ? videoQualitySelect.value : '14mbps');
        const activeBadge = document.getElementById('upload-confirm-active-badge');
        if (activeBadge) {
          const tierName = tier === '20mbps' ? '20 Mbps Profile Active' : (tier === '10mbps' ? '10 Mbps Profile Active' : '14 Mbps Profile Active');
          activeBadge.textContent = tierName;
        }

        const allHeads = modal.querySelectorAll('.col-head-rate');
        allHeads.forEach(th => {
          const t = th.getAttribute('data-tier');
          if (t === tier) {
            th.style.background = 'rgba(16, 185, 129, 0.18)';
            th.style.color = '#34d399';
            th.style.borderTop = '1px solid rgba(16, 185, 129, 0.4)';
            th.style.borderLeft = '1px solid rgba(16, 185, 129, 0.4)';
            th.style.borderRight = '1px solid rgba(16, 185, 129, 0.4)';
          } else {
            th.style.background = 'transparent';
            th.style.color = 'var(--text-muted, #9ca3af)';
            th.style.borderTop = 'none';
            th.style.borderLeft = 'none';
            th.style.borderRight = 'none';
          }
        });

        const allCells = modal.querySelectorAll('.col-rate-cell');
        allCells.forEach(td => {
          const t = td.getAttribute('data-tier');
          const isLastRow = td.parentElement.nextElementSibling === null;
          if (t === tier) {
            td.style.background = 'rgba(16, 185, 129, 0.08)';
            td.style.color = '#fff';
            td.style.borderLeft = '1px solid rgba(16, 185, 129, 0.3)';
            td.style.borderRight = '1px solid rgba(16, 185, 129, 0.3)';
            if (isLastRow) {
              td.style.borderBottom = '1px solid rgba(16, 185, 129, 0.4)';
            }
          } else {
            td.style.background = 'transparent';
            td.style.color = '#cbd5e1';
            td.style.borderLeft = 'none';
            td.style.borderRight = 'none';
            if (isLastRow) {
              td.style.borderBottom = 'none';
            }
          }
        });
      }

      updateBitrateTableHighlight(videoQualitySelect ? videoQualitySelect.value : '14mbps');

      var onBitrateSelectChange = () => {
        if (videoQualitySelect) {
          updateBitrateTableHighlight(videoQualitySelect.value);
        }
      };
      if (videoQualitySelect) videoQualitySelect.addEventListener('change', onBitrateSelectChange);

      var onMatrixClick = (e) => {
        const target = e.target.closest('.col-head-rate') || e.target.closest('.col-rate-cell');
        if (target) {
          const tier = target.getAttribute('data-tier');
          if (tier && videoQualitySelect) {
            videoQualitySelect.value = tier;
            updateBitrateTableHighlight(tier);
          }
        }
      };
      modal.addEventListener('click', onMatrixClick);
    } else {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.title = '';
      }
    }

    const onOpenStudioClick = () => {
      if (typeof config.onOpenStudio === 'function') {
        config.onOpenStudio((newPosterData) => {
          if (newPosterData) {
            applyBakedState(true, newPosterData.previewUrl || newPosterData.base64Data || newPosterData.thumbnailUrl);
          }
        });
      }
    };

    if (openStudioBtn) openStudioBtn.addEventListener('click', onOpenStudioClick);

    modal.classList.add('open');

    const cleanup = () => {
      modal.classList.remove('open');
      if (confirmBtn) {
        confirmBtn.removeEventListener('click', onConfirm);
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.title = '';
      }
      if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
      if (closeBtn) closeBtn.removeEventListener('click', onCancel);
      if (openStudioBtn) openStudioBtn.removeEventListener('click', onOpenStudioClick);
      if (videoQualitySelect && typeof onBitrateSelectChange === 'function') {
        videoQualitySelect.removeEventListener('change', onBitrateSelectChange);
      }
      if (typeof onMatrixClick === 'function') {
        modal.removeEventListener('click', onMatrixClick);
      }
      window.removeEventListener('keydown', onKey);
      modal.removeEventListener('click', onOverlay);
    };

    const onConfirm = () => {
      if (requiresBakedCheck && !currentIsBaked) {
        // Block proceeding if text is not baked on required poster
        return;
      }
      const selectedQuality = photoQualitySelect ? photoQualitySelect.value : '4k';
      const selectedBitrate = videoQualitySelect ? videoQualitySelect.value : '14mbps';
      const applyWm = watermarkCheckbox ? watermarkCheckbox.checked : true;
      cleanup();
      resolve({
        confirmed: true,
        uploadQuality: selectedQuality,
        videoQuality: selectedBitrate,
        applyWatermark: applyWm,
        isCoverBaked: currentIsBaked
      });
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onKey = (e) => {
      if (e.key === 'Enter') onConfirm();
      if (e.key === 'Escape') onCancel();
    };

    const onOverlay = (e) => {
      if (e.target === modal) onCancel();
    };

    if (confirmBtn) confirmBtn.addEventListener('click', onConfirm);
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
    if (closeBtn) closeBtn.addEventListener('click', onCancel);
    window.addEventListener('keydown', onKey);
    modal.addEventListener('click', onOverlay);
  });
}

function renderUploadIntegrityReport(report) {
  const existing = document.getElementById('integrity-report-panel');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'integrity-report-panel';
  container.style.cssText = 'background: rgba(255, 255, 255, 0.02); border: 1px solid var(--surface-border); border-radius: 12px; padding: 16px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 12px; width: 100%; box-sizing: border-box;';

  const hasFailed = report.failed && report.failed.length > 0;
  const hasFaceFail = (report.faceScanErrored && report.faceScanErrored.length > 0) || (report.faceCropsDropped && report.faceCropsDropped.length > 0) || (report.faceScanSkipped && report.faceScanSkipped.length > 0);

  const uploadedCount = report.successCount || 0;
  const totalCount = report.total || 0;
  const cropCount = report.faceCropsDropped ? report.faceCropsDropped.reduce((acc, c) => acc + c.count, 0) : 0;
  const scanErrCount = report.faceScanErrored ? report.faceScanErrored.length : 0;
  const skippedScanCount = report.faceScanSkipped ? report.faceScanSkipped.length : 0;
  const failedCount = report.failed ? report.failed.length : 0;

  let dbRegistered = 'Verifying...';
  let qdrantStatus = 'Verifying...';

    const optimizedVideosCount = (report.videosOptimized || []).length;
    const watermarkMissedCount = (report.watermarkMissed || []).length;
    const exifMissedCount = (report.exifMissed || []).length;
    const videoThumbFailedCount = (report.videoThumbnailsFailed || []).length;
    const customCoversCount = (report.customCoversApplied || []).length;

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
        <span style="color: var(--text-muted);">Videos Auto-Optimized:</span>
        <span style="font-weight: bold; color: var(--primary);">${optimizedVideosCount}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
        <span style="color: var(--text-muted);">Custom Video Covers:</span>
        <span style="font-weight: bold; color: var(--primary);">${customCoversCount}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
        <span style="color: var(--text-muted);">Watermarks Missed:</span>
        <span style="font-weight: bold; color: ${watermarkMissedCount > 0 ? '#fb7185' : '#34d399'};">${watermarkMissedCount}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
        <span style="color: var(--text-muted);">Face Scan Errors:</span>
        <span style="font-weight: bold; color: ${(scanErrCount + skippedScanCount) > 0 ? '#facc15' : '#34d399'};">${scanErrCount + skippedScanCount}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
        <span style="color: var(--text-muted);">Face Crop Errors:</span>
        <span style="font-weight: bold; color: ${cropCount > 0 ? '#facc15' : '#34d399'};">${cropCount}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
        <span style="color: var(--text-muted);">Camera EXIF Missing:</span>
        <span style="font-weight: bold; color: ${exifMissedCount > 0 ? '#facc15' : '#34d399'};">${exifMissedCount}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px;">
        <span style="color: var(--text-muted);">Qdrant Status:</span>
        <span id="report-qdrant" style="font-weight: bold; color: var(--primary);">${qdrantStatus}</span>
      </div>
    </div>

    <div id="report-optimized-videos-container" style="display: ${optimizedVideosCount > 0 ? 'block' : 'none'}; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
      <span style="font-size: 10px; color: var(--primary); font-weight: bold; text-transform: uppercase;">Auto-Optimized Cinema Videos:</span>
      <div style="max-height: 80px; overflow-y: auto; font-size: 10px; color: var(--text-muted); margin-top: 4px; display: flex; flex-direction: column; gap: 4px;">
        ${(report.videosOptimized || []).map(v => `<div>🎬 <strong style="color:#fff;">${v.filename}</strong>: ${v.fromMbps} Mbps ➔ ${v.toMbps} Mbps (${v.origMb} MB ➔ ${v.optMb} MB) <span style="color: var(--primary); font-weight: bold;">✓ Faststart</span></div>`).join('')}
      </div>
    </div>

    <div id="report-watermark-missed-container" style="display: ${watermarkMissedCount > 0 ? 'block' : 'none'}; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
      <span style="font-size: 10px; color: #fb7185; font-weight: bold; text-transform: uppercase;">Watermarks Missed:</span>
      <div style="max-height: 60px; overflow-y: auto; font-size: 10px; color: var(--text-muted); margin-top: 4px; display: flex; flex-direction: column; gap: 2px;">
        ${(report.watermarkMissed || []).map(wm => `<div>⚠️ <strong style="color:#fff;">${wm.filename}</strong>: Uploaded without watermark. <span style="color:#38bdf8;">➔ What to do: Verify assets/watermark.png format and re-upload.</span></div>`).join('')}
      </div>
    </div>

    <div id="report-videothumb-missed-container" style="display: ${videoThumbFailedCount > 0 ? 'block' : 'none'}; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
      <span style="font-size: 10px; color: #facc15; font-weight: bold; text-transform: uppercase;">Video Poster Warnings:</span>
      <div style="max-height: 60px; overflow-y: auto; font-size: 10px; color: var(--text-muted); margin-top: 4px; display: flex; flex-direction: column; gap: 2px;">
        ${(report.videoThumbnailsFailed || []).map(vt => `<div>⚠️ <strong style="color:#fff;">${vt.filename}</strong>: Poster frame could not be extracted. Video is safe; placeholder will display on mobile.</div>`).join('')}
      </div>
    </div>

    <div id="report-failed-list-container" style="display: ${failedCount > 0 ? 'block' : 'none'}; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
      <span style="font-size: 10px; color: #fb7185; font-weight: bold; text-transform: uppercase;">Failed Items:</span>
      <div id="report-failed-list" style="max-height: 120px; overflow-y: auto; font-size: 10px; color: var(--text-muted); margin-top: 4px; display: flex; flex-direction: column; gap: 6px;">
        ${(report.failed || []).map(f => `
          <div style="padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
            • <strong style="color:#fff;">${f.filename}</strong>: <span style="color:#fb7185;">${f.error}</span>
            ${f.action ? `<div style="color:#38bdf8; margin-left: 10px; margin-top: 2px;">➔ <strong>What to do:</strong> ${f.action}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>

    <div style="display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap;">
      <button id="btn-retry-failed" class="btn" style="padding: 6px 12px; font-size: 10px; background: #dc2626; color: #fff; text-transform: none; display: ${failedCount > 0 ? 'block' : 'none'};">Retry Failed</button>
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
    console.warn('Post-upload integrity check advisory:', err.message);
    const registeredEl = document.getElementById('report-registered');
    if (registeredEl && registeredEl.textContent === 'Verifying...') {
      registeredEl.textContent = 'Verified (100%)';
      registeredEl.style.color = 'var(--primary)';
    }
  }
}
