const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const axios = require('axios');
const https = require('https');
const { downloadFileHelper } = require('./preflight');

// Enable Keep-Alive to reuse TCP/TLS connections and avoid handshake delays
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  keepAliveMsecs: 30000
});
axios.defaults.httpsAgent = keepAliveAgent;

let isBackfillRunning = false;
let isBackfillPaused = false;
let currentRunId = 0;

function setupBackfillHandlers({ ipcMain, app, getMainWindow, initDaemonPool }) {
  ipcMain.handle('pause-backfill', async (event, pauseState) => {
    isBackfillPaused = pauseState;
    console.log(`[Backfill] Pause state changed to: ${isBackfillPaused}`);
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('backfill-status', {
        isPaused: isBackfillPaused
      });
    }
    return { success: true, isPaused: isBackfillPaused };
  });

  ipcMain.handle('stop-backfill', async () => {
    currentRunId++;
    isBackfillRunning = false;
    isBackfillPaused = false;
    console.log('[Backfill] Stop requested');
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('backfill-status', {
        status: 'idle',
        isPaused: false
      });
    }
    return { success: true };
  });

  ipcMain.handle('start-backfill', async (event, config) => {
    const { eventId, eventSlug, backendUrl, token, concurrency = 6, daemons = 3 } = config;
    if (!eventId || !backendUrl || !token) {
      return { success: false, error: 'Missing parameters' };
    }

    if (isBackfillRunning) {
      return { success: false, reason: 'Already running' };
    }

    currentRunId++;
    const runId = currentRunId;

    const mainWindow = getMainWindow();
    isBackfillRunning = true;
    isBackfillPaused = false;
    mainWindow.webContents.send('backfill-status', { eventId, status: 'starting', isPaused: false });

    let activeBackfillDownloads = 0;
    let activeBackfillScans = 0;
    const sendBackfillPerfStats = () => {
      mainWindow.webContents.send('backfill-status', {
        eventId,
        status: 'perf-stats',
        activeDownloads: activeBackfillDownloads,
        activeScans: daemon ? daemon.getActiveCount() : 0
      });
    };

    let daemon = null;
    let totalInitial = null;
    let scannedSoFar = 0;
    let scanFailures = 0;
    const photoRetries = {};

    try {
      const tempDir = path.join(app.getPath('temp'), 'misty_uploader_backfills');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      while (true) {
        if (runId !== currentRunId) break;
        // Pause check
        while (isBackfillPaused && isBackfillRunning && runId === currentRunId) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!isBackfillRunning || runId !== currentRunId) {
          break;
        }

        const res = await axios.get(`${backendUrl}/api/gallery/events/${eventId}/photos/unscanned`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const unscannedPhotos = res.data.photos || [];
        const totalUnscanned = res.data.totalUnscanned !== undefined ? res.data.totalUnscanned : unscannedPhotos.length;

        if (totalInitial === null) {
          totalInitial = totalUnscanned;
        }

        console.log(`[Backfill] Batch retrieved ${unscannedPhotos.length} photos (total unscanned remaining: ${totalUnscanned}) for event ${eventId}`);

        if (unscannedPhotos.length === 0) {
          break;
        }

        if (!daemon) {
          daemon = await initDaemonPool(app, daemons);

          if (daemon.readyInstances.length === 0) {
            const errorDetails = daemon.getErrors();
            daemon.killAllDaemons();
            isBackfillRunning = false;
            mainWindow.webContents.send('backfill-status', {
              eventId,
              status: 'error',
              error: `Face scanner is offline — backfill cannot start.\n\n${errorDetails}\n\nPlease re-run setup to reinstall OpenCV / models, then retry.`
            });
            console.error('[Backfill] Aborted: zero daemon instances ready. Details:\n', errorDetails);
            return { success: false, error: 'Face scanner offline — backfill aborted to protect data integrity.' };
          }

          mainWindow.webContents.send('backfill-status', { eventId, status: 'processing', total: totalInitial, index: scannedSoFar, isPaused: isBackfillPaused });
        }

        const getFacesFromPool = daemon.getFacesFromPool;
        const BACKFILL_CONCURRENCY = concurrency;
        let completedInBatch = 0;

        // Shared Queues
        const downloadedQueue = [];
        const scannedQueue = [];

        let downloadIndex = 0;
        let downloadsCompleted = 0;
        let scansCompleted = 0;
        let uploadsCompleted = 0;

        // 1. Download Producers
        const downloaderWorker = async () => {
          while (downloadIndex < unscannedPhotos.length) {
            if (runId !== currentRunId) break;
            while (isBackfillPaused && isBackfillRunning && runId === currentRunId) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            // Throttling: do not build up an excessive queue of downloaded images to avoid disk bloat
            while (downloadedQueue.length > BACKFILL_CONCURRENCY * 2 && runId === currentRunId) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (runId !== currentRunId) break;

            const i = downloadIndex++;
            if (i >= unscannedPhotos.length) break;

            const photo = unscannedPhotos[i];
            const overallIndex = scannedSoFar + i + 1;
            const tempFilePath = path.join(tempDir, `temp_backfill_${photo.id}_${photo.filename}`);

            try {
              activeBackfillDownloads++;
              sendBackfillPerfStats();
              await downloadFileHelper(photo.r2Url, tempFilePath);
              if (runId === currentRunId) {
                downloadedQueue.push({ photo, tempFilePath, overallIndex });
              } else {
                if (fs.existsSync(tempFilePath)) {
                  try { fs.unlinkSync(tempFilePath); } catch (e) {}
                }
              }
            } catch (err) {
              console.error(`[Backfill] Download failed for photoId ${photo.id}:`, err.message);
              downloadedQueue.push({ photo, tempFilePath, overallIndex, downloadFailed: true, downloadError: err.message });
            } finally {
              activeBackfillDownloads--;
              sendBackfillPerfStats();
              downloadsCompleted++;
            }
          }
        };

        // 2. Face Scan Inference Consumer
        const scannerWorker = async () => {
          while (scansCompleted < unscannedPhotos.length) {
            if (runId !== currentRunId) break;
            while (isBackfillPaused && isBackfillRunning && runId === currentRunId) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (!isBackfillRunning || runId !== currentRunId) break;

            if (downloadedQueue.length === 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
              continue;
            }

            const item = downloadedQueue.shift();
            if (!item) continue;

            const { photo, tempFilePath, overallIndex, downloadFailed, downloadError } = item;
            
            if (downloadFailed) {
              scannedQueue.push({ photo, tempFilePath, overallIndex, faceScanFailed: true, scanError: downloadError });
              scansCompleted++;
              continue;
            }

            let faces = [];
            let faceScanFailed = false;
            let scanErrorMsg = '';

            try {
              activeBackfillScans++;
              sendBackfillPerfStats();
              faces = await getFacesFromPool(tempFilePath);
            } catch (scanErr) {
              faceScanFailed = true;
              scanErrorMsg = scanErr.message;
              scanFailures++;
              console.error(`[Backfill] Face scan threw for photoId ${photo.id}: ${scanErr.message}`);
              mainWindow.webContents.send('backfill-status', {
                eventId,
                status: 'scan-failed',
                photoId: photo.id,
                filename: photo.filename,
                scanFailures,
                error: scanErr.message
              });
            } finally {
              activeBackfillScans--;
              sendBackfillPerfStats();
              scansCompleted++;
            }

            if (runId === currentRunId) {
              scannedQueue.push({ photo, tempFilePath, overallIndex, faces, faceScanFailed, scanError: scanErrorMsg });
            } else {
              if (fs.existsSync(tempFilePath)) {
                try { fs.unlinkSync(tempFilePath); } catch (e) {}
              }
            }
          }
        };

        // 3. Crop & Upload Consumer
        const uploaderWorker = async () => {
          while (uploadsCompleted < unscannedPhotos.length) {
            if (runId !== currentRunId) break;
            while (isBackfillPaused && isBackfillRunning && runId === currentRunId) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (!isBackfillRunning || runId !== currentRunId) break;

            if (scannedQueue.length === 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
              continue;
            }

            const item = scannedQueue.shift();
            if (!item) continue;

            const { photo, tempFilePath, overallIndex, faces, faceScanFailed, scanError } = item;
            let facesList = faces || [];

            try {
              if (faceScanFailed) {
                throw new Error(scanError || 'Prior stage failed');
              }

              facesList = facesList.map(f => {
                if (f.faceId && f.faceId.includes('temp_backfill_')) {
                  const prefix = `temp_backfill_${photo.id}_`;
                  f.faceId = f.faceId.replace(prefix, '');
                }
                return f;
              });

              if (facesList && facesList.length > 0) {
                const facesToUpload = [];
                const faceIdsToUpload = facesList.filter(f => f.box).map(f => f.faceId);
                let faceUrlMap = {};

                if (faceIdsToUpload.length > 0) {
                  const urlRes = await axios.post(`${backendUrl}/api/gallery/events/${eventId}/generate-face-upload-urls`, {
                    faceIds: faceIdsToUpload,
                    eventSlug
                  }, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                  });
                  for (const f of urlRes.data.faces) {
                    faceUrlMap[f.faceId] = f.putUrl;
                  }
                }

                if (runId !== currentRunId) return;

                const parentSharp = sharp(tempFilePath).rotate();
                const cropAndUploadPromises = facesList
                  .filter(face => face.box && faceUrlMap[face.faceId])
                  .map(async face => {
                    const [fx, fy, ffw, ffh] = face.box;
                    const faceBuffer = await parentSharp.clone()
                      .extract({ left: fx, top: fy, width: ffw, height: ffh })
                      .toBuffer();

                    await axios.put(faceUrlMap[face.faceId], faceBuffer, {
                      headers: {
                        'Content-Type': 'image/jpeg',
                        'Cache-Control': 'public, max-age=31536000, immutable'
                      }
                    });

                    facesToUpload.push({ faceId: face.faceId, vector: face.vector });
                  });
                await Promise.all(cropAndUploadPromises);

                if (runId !== currentRunId) return;

                if (facesToUpload.length > 0) {
                  await axios.post(`${backendUrl}/api/gallery/events/${eventId}/photos/${photo.id}/vectors`, {
                    faces: facesToUpload
                  }, {
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    }
                  });
                }
              } else {
                if (runId !== currentRunId) return;
                await axios.post(`${backendUrl}/api/gallery/events/${eventId}/photos/${photo.id}/vectors`, {
                  faces: []
                }, {
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  }
                });
              }

              delete photoRetries[photo.id];
            } catch (err) {
              if (runId !== currentRunId) return;
              console.error(`[Backfill] Upload/Vector post failed for photoId ${photo.id}:`, err.message);
              photoRetries[photo.id] = (photoRetries[photo.id] || 0) + 1;
              if (photoRetries[photo.id] >= 3) {
                console.warn(`[Backfill] PhotoId ${photo.id} failed 3 times. Marking as scanned with 0 faces to prevent infinite loops.`);
                try {
                  await axios.post(`${backendUrl}/api/gallery/events/${eventId}/photos/${photo.id}/vectors`, {
                    faces: []
                  }, {
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    }
                  });
                } catch (postErr) {
                  console.error(`[Backfill] Failed to skip photoId ${photo.id} on server:`, postErr.message);
                }
              }
            } finally {
              if (fs.existsSync(tempFilePath)) {
                try { fs.unlinkSync(tempFilePath); } catch (e) {}
              }
              uploadsCompleted++;
              completedInBatch++;

              if (runId === currentRunId) {
                mainWindow.webContents.send('backfill-status', {
                  eventId,
                  status: 'progress',
                  index: scannedSoFar + completedInBatch,
                  total: Math.max(totalInitial, scannedSoFar + completedInBatch),
                  scanFailures,
                  isPaused: isBackfillPaused
                });
              }
            }
          }
        };

        // Spawn parallel pipeline queues
        const workers = [];
        const downloadConcurrency = BACKFILL_CONCURRENCY;
        const scanConcurrency = Math.min(daemons || 2, BACKFILL_CONCURRENCY);
        const uploadConcurrency = BACKFILL_CONCURRENCY;

        for (let d = 0; d < downloadConcurrency; d++) {
          workers.push(downloaderWorker());
        }
        for (let s = 0; s < scanConcurrency; s++) {
          workers.push(scannerWorker());
        }
        for (let u = 0; u < uploadConcurrency; u++) {
          workers.push(uploaderWorker());
        }

        await Promise.all(workers);

        scannedSoFar += unscannedPhotos.length;
      }

      if (daemon && daemon.killAllDaemons) {
        daemon.killAllDaemons();
      }

      try {
        await axios.post(`${backendUrl}/api/gallery/events/${eventId}/finalize-upload`, {}, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (finalizeErr) {
        console.error('[Backfill] Failed to finalize upload:', finalizeErr.message);
      }

      if (runId === currentRunId) {
        isBackfillRunning = false;
        isBackfillPaused = false;
        mainWindow.webContents.send('backfill-status', { eventId, status: 'idle', isPaused: false });

        if (scannedSoFar > 0) {
          setTimeout(() => {
            if (runId === currentRunId) {
              mainWindow.webContents.send('trigger-backfill-check');
            }
          }, 1000);
        }
      }

      return { success: true, count: scannedSoFar };

    } catch (err) {
      if (daemon && daemon.killAllDaemons) {
        daemon.killAllDaemons();
      }
      if (runId === currentRunId) {
        isBackfillRunning = false;
        isBackfillPaused = false;
        mainWindow.webContents.send('backfill-status', { status: 'error', error: err.message, isPaused: false });
      }
      console.error('[Backfill] Error in backfill loop:', err.message);
      return { success: false, error: err.message };
    }
  });
}

module.exports = {
  setupBackfillHandlers
};
