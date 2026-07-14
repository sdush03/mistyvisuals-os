const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const axios = require('axios');
const { downloadFileHelper } = require('./preflight');

let isBackfillRunning = false;
let isBackfillPaused = false;

function setupBackfillHandlers({ ipcMain, app, getMainWindow, initDaemonPool }) {
  ipcMain.handle('pause-backfill', async (event, pauseState) => {
    isBackfillPaused = pauseState;
    console.log(`[Backfill] Pause state changed to: ${isBackfillPaused}`);
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('backfill-status', {
        status: isBackfillPaused ? 'progress' : 'progress',
        isPaused: isBackfillPaused
      });
    }
    return { success: true, isPaused: isBackfillPaused };
  });

  ipcMain.handle('start-backfill', async (event, config) => {
    const { eventId, eventSlug, backendUrl, token, concurrency = 6, daemons = 3 } = config;
    if (!eventId || !backendUrl || !token) {
      return { success: false, error: 'Missing parameters' };
    }

    if (isBackfillRunning) {
      return { success: false, reason: 'Already running' };
    }

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
        // Pause check
        while (isBackfillPaused && isBackfillRunning) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!isBackfillRunning) {
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
        let batchIndex = 0;
        let completedInBatch = 0;

        const processBackfillPhoto = async (photo, overallIndex) => {
          const tempFilePath = path.join(tempDir, `temp_backfill_${photo.id}_${photo.filename}`);
          console.log(`[Backfill] [${overallIndex}/${totalInitial}] Processing photoId ${photo.id}: ${photo.filename}`);

          try {
            try {
              activeBackfillDownloads++;
              sendBackfillPerfStats();
              await downloadFileHelper(photo.r2Url, tempFilePath);
            } finally {
              activeBackfillDownloads--;
              sendBackfillPerfStats();
            }

            let faces = [];
            let faceScanFailed = false;
            try {
              activeBackfillScans++;
              sendBackfillPerfStats();
              faces = await getFacesFromPool(tempFilePath);
            } catch (scanErr) {
              faceScanFailed = true;
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
            }

            if (faceScanFailed) {
              // Trigger retry logic below in the catch block
              throw new Error('Face recognition scan failed');
            }

            faces = faces.map(f => {
              if (f.faceId && f.faceId.includes('temp_backfill_')) {
                const prefix = `temp_backfill_${photo.id}_`;
                f.faceId = f.faceId.replace(prefix, '');
              }
              return f;
            });
            if (faces && faces.length > 0) {
              const facesToUpload = [];

              const faceIdsToUpload = faces.filter(f => f.box).map(f => f.faceId);
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

              const cropAndUploadPromises = faces
                .filter(face => face.box && faceUrlMap[face.faceId])
                .map(async face => {
                  const [fx, fy, ffw, ffh] = face.box;
                  const faceBuffer = await sharp(tempFilePath)
                    .rotate()
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
              await axios.post(`${backendUrl}/api/gallery/events/${eventId}/photos/${photo.id}/vectors`, {
                faces: []
              }, {
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                }
              });
            }
            // If we succeeded, we can delete the retry log entry
            delete photoRetries[photo.id];
          } catch (err) {
            console.error(`[Backfill] Failed for photoId ${photo.id}:`, err.message);
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
          }
        };

        const backfillWorker = async () => {
          while (batchIndex < unscannedPhotos.length) {
            // Pause check inside worker
            while (isBackfillPaused && isBackfillRunning) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (!isBackfillRunning) {
              break;
            }

            const i = batchIndex++;
            if (i >= unscannedPhotos.length) {
              break;
            }
            const photo = unscannedPhotos[i];
            const overallIndex = scannedSoFar + i + 1;
            await processBackfillPhoto(photo, overallIndex);
            completedInBatch++;
            mainWindow.webContents.send('backfill-status', {
              eventId,
              status: 'progress',
              index: scannedSoFar + completedInBatch,
              total: Math.max(totalInitial, scannedSoFar + completedInBatch),
              scanFailures,
              isPaused: isBackfillPaused
            });
          }
        };

        const backfillWorkers = [];
        for (let w = 0; w < BACKFILL_CONCURRENCY; w++) {
          backfillWorkers.push(backfillWorker());
        }
        await Promise.all(backfillWorkers);

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

      isBackfillRunning = false;
      isBackfillPaused = false;
      mainWindow.webContents.send('backfill-status', { eventId, status: 'idle', isPaused: false });

      if (scannedSoFar > 0) {
        setTimeout(() => {
          mainWindow.webContents.send('trigger-backfill-check');
        }, 1000);
      }

      return { success: true, count: scannedSoFar };

    } catch (err) {
      if (daemon && daemon.killAllDaemons) {
        daemon.killAllDaemons();
      }
      isBackfillRunning = false;
      isBackfillPaused = false;
      mainWindow.webContents.send('backfill-status', { status: 'error', error: err.message, isPaused: false });
      console.error('[Backfill] Error in backfill loop:', err.message);
      return { success: false, error: err.message };
    }
  });
}

module.exports = {
  setupBackfillHandlers
};
