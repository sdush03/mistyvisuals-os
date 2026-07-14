// Background Scanner Backfill View Component

function triggerBackfillCheck() {
  if (!window.AppState.currentGalleryId || !window.AppState.authToken) return;

  const currentGallery = window.AppState.projects.find(p => p.id === window.AppState.currentGalleryId);
  if (!currentGallery || currentGallery.galleryFacesComplete !== false) return;

  const eventSlug = currentGallery ? currentGallery.slug : null;

  console.log('[Backfill] Triggering background backfill check for gallery:', window.AppState.currentGalleryId);
  window.api.startBackfill({
    eventId: window.AppState.currentGalleryId,
    eventSlug,
    backendUrl: window.AppState.apiBaseUrl,
    token: window.AppState.authToken,
    concurrency: window.AppState.backfillWorkers,
    daemons: window.AppState.backfillDaemons
  });
}

function triggerGlobalBackfillCheck() {
  if (!window.AppState.authToken || !window.AppState.projects || window.AppState.projects.length === 0) return;
  
  const unscannedGallery = window.AppState.projects.find(p => p.galleryFacesComplete === false);
  if (unscannedGallery) {
    console.log('[Global Backfill] Automatically starting backfill in background for unscanned gallery:', unscannedGallery.title);
    window.api.startBackfill({
      eventId: unscannedGallery.id,
      eventSlug: unscannedGallery.slug,
      backendUrl: window.AppState.apiBaseUrl,
      token: window.AppState.authToken,
      concurrency: window.AppState.backfillWorkers,
      daemons: window.AppState.backfillDaemons
    });
  }
}

function initBackfillListeners() {
  window.api.onBackfillStatus((data) => {
    const projectScanStatusBadge = document.getElementById('project-scan-status-badge');

    if (data.status === 'perf-stats') {
      window.AppState.activeBackfillPerf.activeDownloads = data.activeDownloads;
      window.AppState.activeBackfillPerf.activeScans = data.activeScans;
      updateProjectScanStatusDisplay();
      return;
    }

    if (data.status === 'scan-failed') {
      window.AppState.activeBackfillStatus.scanFailures = data.scanFailures || (window.AppState.activeBackfillStatus.scanFailures + 1);
      console.warn(`[Backfill] Face scan failed for photo ${data.filename || data.photoId}: ${data.error}`);
      updateProjectScanStatusDisplay();
      return;
    }

    if (data.eventId) {
      window.AppState.activeBackfillStatus.eventId = data.eventId;
    }
    window.AppState.activeBackfillStatus.status = data.status;

    if (data.status === 'progress') {
      window.AppState.activeBackfillStatus.index = data.index;
      window.AppState.activeBackfillStatus.total = data.total;
      if (typeof data.scanFailures === 'number') {
        window.AppState.activeBackfillStatus.scanFailures = data.scanFailures;
      }
    } else if (data.status === 'processing') {
      window.AppState.activeBackfillStatus.total = data.total;
      window.AppState.activeBackfillStatus.index = 0;
      window.AppState.activeBackfillStatus.scanFailures = 0;
    } else if (data.status === 'idle') {
      window.AppState.activeBackfillStatus.eventId = null;
      window.AppState.activeBackfillStatus.index = 0;
      window.AppState.activeBackfillStatus.total = 0;
      window.AppState.activeBackfillStatus.scanFailures = 0;
    }

    updatePerformanceInputsLockState();
    updateProjectScanStatusDisplay();

    if (data.status === 'starting') {
      console.log('[Backfill] Background scanner starting...');
    } else if (data.status === 'processing') {
      console.log(`[Backfill] Background scanner starting processing of ${data.total} photos.`);
    } else if (data.status === 'progress') {
      const failMsg = window.AppState.activeBackfillStatus.scanFailures > 0 ? ` | ${window.AppState.activeBackfillStatus.scanFailures} scan errors` : '';
      console.log(`[Backfill] Background scanner progress: ${data.index}/${data.total} photos processed${failMsg}.`);
    } else if (data.status === 'idle') {
      console.log('[Backfill] Background scanner is idle (no photos left).');
      window.AppState.uploadedPhotosCache = {};
      loadUploadedPhotos();
      loadProjects();
    } else if (data.status === 'error') {
      console.error('[Backfill] Background scanner error:', data.error);
      if (projectScanStatusBadge) {
        projectScanStatusBadge.innerHTML = `
          <div style="display:inline-flex;align-items:flex-start;gap:6px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);padding:8px 10px;border-radius:8px;font-size:10px;font-weight:bold;color:#f87171;width:100%;box-sizing:border-box;">
            <span style="flex-shrink:0;margin-top:1px;">❌</span>
            <span style="line-height:1.4;">${data.error || 'Face scanner failed — check setup.'}</span>
          </div>
        `;
      }
      window.AppState.activeBackfillStatus.status = 'idle';
      updatePerformanceInputsLockState();
    }
  });

  window.api.onTriggerBackfill(() => {
    triggerGlobalBackfillCheck();
  });
}
