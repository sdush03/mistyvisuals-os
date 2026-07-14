const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const exifr = require('exifr');
const axios = require('axios');
const { dialog, powerSaveBlocker } = require('electron');

let isUploadCancelled = false;

function cancelUpload() {
  isUploadCancelled = true;
}

function setupUploadHandlers({ ipcMain, app, getMainWindow, initDaemonPool, getPreflightDaemonPool, setPreflightDaemonPool }) {
  ipcMain.on('cancel-upload', () => {
    isUploadCancelled = true;
  });

  ipcMain.handle('process-photos', async (event, config) => {
    isUploadCancelled = false;
    let activeBlockerId = null;
    try {
      activeBlockerId = powerSaveBlocker.start('prevent-display-sleep');
      console.log('[Uploader] Started powerSaveBlocker to prevent display sleep during upload. ID:', activeBlockerId);
    } catch (err) {
      console.error('Failed to start powerSaveBlocker:', err);
    }

    const mainWindow = getMainWindow();

    try {
      const { resolvedFiles = [], eventId, eventSlug, backendUrl, token, uploadQuality = '4k', applyWatermark = true, concurrency = 6, daemons = 2 } = config;
      const watermarkPath = path.join(__dirname, '..', 'assets', 'watermark.png');

      let targetWidth = null;
      let targetHeight = null;
      let jpegQuality = 70;

      if (uploadQuality === '4k') {
        targetWidth = 3840;
        targetHeight = 3840;
        jpegQuality = 75;
      } else if (uploadQuality === '2k') {
        targetWidth = 2160;
        targetHeight = 2160;
        jpegQuality = 68;
      }
      
      const totalPhotos = resolvedFiles.length;
      if (totalPhotos === 0) {
        return { count: 0 };
      }

      const tempDir = path.join(app.getPath('temp'), 'misty_uploader_uploads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      let daemon;
      if (daemons === 0) {
        console.log('[Upload] Face scanning explicitly offline/skipped.');
        daemon = {
          readyInstances: [],
          getFacesFromPool: () => Promise.resolve([]),
          killAllDaemons: () => {},
          getActiveCount: () => 0,
          getErrors: () => 'Offline by user request'
        };
      } else {
        const preflightPool = getPreflightDaemonPool();
        if (preflightPool && preflightPool.readyInstances.length > 0) {
          console.log('[Upload] Reusing daemon pool from preflight.');
          daemon = preflightPool;
          setPreflightDaemonPool(null);
        } else {
          console.log('[Upload] No preflight daemon pool found, initializing fresh pool.');
          daemon = await initDaemonPool(app, daemons);
        }
      }
      const getFacesFromDaemon = daemon.getFacesFromPool;
      const killDaemon = daemon.killAllDaemons;
      const isDaemonReady = daemon.readyInstances.length > 0;

      if (!isDaemonReady && daemons > 0) {
        const errorDetails = daemon.getErrors();
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: 'warning',
          buttons: ['Continue Upload', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          title: 'Face Scanner Offline',
          message: `The local face recognition engine is offline (Python daemons failed to start).\n\nError details:\n${errorDetails}\n\nWould you like to continue the upload without local face scanning, or cancel to fix the issues?`,
        });
        if (choice === 1) {
          if (killDaemon) killDaemon();
          return { success: false, error: 'Cancelled by user due to offline face scanner' };
        }
      }

      let hasPromptedMidUploadCrash = false;
      const results = [];

      const uploadReport = {
        total: totalPhotos,
        failed:          [],
        thumbnailMissing:[],
        watermarkMissed: [],
        exifMissed:      [],
        faceScanSkipped: [],
        faceScanErrored: [],
        faceCropsDropped:[],
        duplicatesSkipped:[],
        photoIds:        [],
      };

      let processedCount = 0;
      let currentIndex = 0;
      const CONCURRENCY = concurrency;

      let activeUploads = 0;
      const sendPerfStats = () => {
        mainWindow.webContents.send('upload-progress', {
          status: 'perf-stats',
          activeUploads,
          activeScans: daemon.getActiveCount()
        });
      };

      const processPhoto = async (index) => {
        activeUploads++;
        sendPerfStats();

        const fileItem = resolvedFiles[index];
        const filename = fileItem.name;
        const originalPath = fileItem.path;
        const tabName = fileItem.tabName;
        const tStart = Date.now();

        mainWindow.webContents.send('upload-progress', {
          status: 'row-processing',
          filename,
          index,
          total: totalPhotos
        });

        if (isUploadCancelled) {
          activeUploads--;
          sendPerfStats();
          return;
        }

        try {
          const tExifStart = Date.now();
          let exifData = null;
          let capturedAt = null;
          try {
            const metadata = await exifr.parse(originalPath, {
              tiff: true,
              exif: true,
              device: true
            });
            if (metadata) {
              exifData = {
                make: metadata.Make || null,
                model: metadata.Model || null,
                lens: metadata.LensModel || null,
                iso: metadata.ISO || null,
                aperture: metadata.FNumber || null,
                shutterSpeed: metadata.ExposureTime ? `1/${Math.round(1/metadata.ExposureTime)}` : null,
                focalLength: metadata.FocalLength || null
              };
              if (metadata.DateTimeOriginal) {
                capturedAt = new Date(metadata.DateTimeOriginal).toISOString();
              }
            }
          } catch (exifErr) {
            console.warn(`Failed to parse EXIF for ${filename}:`, exifErr.message);
            uploadReport.exifMissed.push({ filename });
          }
          const tExifEnd = Date.now() - tExifStart;
          const tSharpStart = Date.now();

          const thumbnailPromise = sharp(originalPath)
            .rotate()
            .resize(720, 720, { fit: 'inside', withoutEnlargement: true })
            .sharpen()
            .jpeg({ quality: 85, progressive: true, mozjpeg: true })
            .toBuffer()
            .catch(async (err) => {
              console.warn(`Failed first thumbnail attempt for ${filename}: ${err.message}. Retrying...`);
              try {
                return await sharp(originalPath)
                  .rotate()
                  .resize(720, 720, { fit: 'inside', withoutEnlargement: true })
                  .sharpen()
                  .jpeg({ quality: 85, progressive: true, mozjpeg: true })
                  .toBuffer();
              } catch (retryErr) {
                console.error(`Local thumbnail generation completely failed for ${filename}:`, retryErr.message);
                return null;
              }
            });

          let pipeline = sharp(originalPath).rotate();

          if (targetWidth && targetHeight) {
            pipeline = pipeline
              .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
              .sharpen();
          }

          if (applyWatermark && fs.existsSync(watermarkPath)) {
            try {
              const resizedBuffer = await pipeline.toBuffer();
              const resizedMetadata = await sharp(resizedBuffer).metadata();
              const imgWidth = resizedMetadata.width;
              const imgHeight = resizedMetadata.height;

              const shortestSide = Math.min(imgWidth, imgHeight);
              const watermarkWidth = Math.round(shortestSide * 0.15);
              const watermarkBuffer = fs.readFileSync(watermarkPath);

              const resizedWatermarkBuffer = await sharp(watermarkBuffer)
                .resize(watermarkWidth)
                .toBuffer();

              const padding = Math.max(12, Math.round(shortestSide * 0.03));
              const watermarkMetadata = await sharp(resizedWatermarkBuffer).metadata();
              const x = padding;
              const y = imgHeight - watermarkMetadata.height - padding;

              pipeline = sharp(resizedBuffer)
                .composite([{
                  input: resizedWatermarkBuffer,
                  left: x,
                  top: y
                }]);
            } catch (wmErr) {
              console.error(`Failed to overlay watermark on ${filename}:`, wmErr.message);
              uploadReport.watermarkMissed.push({ filename });
              pipeline = sharp(originalPath).rotate();
              if (targetWidth && targetHeight) {
                pipeline = pipeline
                  .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
                  .sharpen();
              }
            }
          }

          const compressedBuffer = await pipeline
            .jpeg({
              quality: jpegQuality,
              progressive: true,
              mozjpeg: true
            })
            .toBuffer();

          const cleanCompressedBuffer = await sharp(compressedBuffer)
            .withMetadata({
              orientation: 1,
              exif: {
                IFD0: {
                  Copyright: 'https://www.mistyvisuals.com/'
                }
              }
            })
            .toBuffer();

          mainWindow.webContents.send('upload-progress', {
            status: 'row-uploading',
            filename,
            index,
            total: totalPhotos
          });

          const thumbnailBuffer = await thumbnailPromise;
          const tSharpEnd = Date.now() - tSharpStart;

          if (isUploadCancelled) {
            activeUploads--;
            sendPerfStats();
            return;
          }

          const tempUploadPath = path.join(tempDir, `temp_upload_${index}_${filename}`);
          await fs.promises.writeFile(tempUploadPath, cleanCompressedBuffer);

          sendPerfStats();
          let faces = [];
          let tScanStart = Date.now();
          try {
            faces = await getFacesFromDaemon(tempUploadPath);
            faces = faces.map(f => {
              if (f.faceId) {
                const prefix = `temp_upload_${index}_`;
                if (f.faceId.includes(prefix)) {
                  f.faceId = f.faceId.replace(prefix, '');
                }
              }
              return f;
            });
          } catch (err) {
            console.warn(`Face detection failed for ${filename}:`, err);
            uploadReport.faceScanErrored.push({ filename });
            if (!hasPromptedMidUploadCrash) {
              hasPromptedMidUploadCrash = true;
              const choice = dialog.showMessageBoxSync(mainWindow, {
                type: 'warning',
                buttons: ['Continue Upload', 'Cancel Upload'],
                defaultId: 1,
                cancelId: 1,
                title: 'Face Scanner Stopped',
                message: 'The local face recognition scanner stopped running in the middle of this upload.\n\nWould you like to continue uploading the remaining photos without face scanning, or cancel/abort the upload?',
              });
              if (choice === 1) {
                isUploadCancelled = true;
              }
            }
          } finally {
            sendPerfStats();
          }
          const tScanEnd = Date.now() - tScanStart;

          if (isUploadCancelled) {
            activeUploads--;
            sendPerfStats();
            return;
          }

          const tTicketStart = Date.now();
          const ticketRes = await axios.post(`${backendUrl}/api/gallery/events/${eventId}/generate-upload-urls`, {
            uploads: [{
              filename,
              faceIds: faces.map(f => f.faceId)
            }]
          }, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          const tTicketEnd = Date.now() - tTicketStart;

          const ticket = ticketRes.data.uploads[0];
          const r2Url = ticket.r2Url;
          const thumbnailUrl = ticket.thumbnailUrl;

          const tUploadStart = Date.now();
          const uploadPromises = [];

          uploadPromises.push(
            axios.put(ticket.photoPutUrl, cleanCompressedBuffer, {
              headers: { 
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'public, max-age=31536000, immutable'
              }
            })
          );

          if (thumbnailBuffer) {
            uploadPromises.push(
              axios.put(ticket.thumbPutUrl, thumbnailBuffer, {
                headers: { 
                  'Content-Type': 'image/jpeg',
                  'Cache-Control': 'public, max-age=31536000, immutable'
                }
              })
            );
          }

          const tCropStart = Date.now();
          const facesToUpload = [];
          for (const face of faces) {
            if (face.box) {
              const faceTicket = ticket.faces.find(f => f.faceId === face.faceId);
              if (faceTicket) {
                try {
                  const faceBuffer = await sharp(tempUploadPath)
                    .extract({ left: face.box[0], top: face.box[1], width: face.box[2], height: face.box[3] })
                    .toBuffer();

                  uploadPromises.push(
                    axios.put(faceTicket.putUrl, faceBuffer, {
                      headers: { 
                        'Content-Type': 'image/jpeg',
                        'Cache-Control': 'public, max-age=31536000, immutable'
                      }
                    })
                  );

                  facesToUpload.push({
                    faceId: face.faceId,
                    vector: face.vector
                  });
                } catch (cropErr) {
                  console.error(`Failed to crop face ${face.faceId}:`, cropErr.message);
                }
              }
            }
          }
          const tCropEnd = Date.now() - tCropStart;

          await Promise.all(uploadPromises);
          const tUploadEnd = Date.now() - tUploadStart;
          const finalMetadata = await sharp(cleanCompressedBuffer).metadata();

          const resolvedThumbnailUrl = thumbnailBuffer ? thumbnailUrl : null;
          if (!thumbnailBuffer) {
            console.warn(`[Upload] Thumbnail skipped for ${filename} — sharp generation failed. Saving photo without thumbnail URL to avoid dead R2 link.`);
            uploadReport.thumbnailMissing.push({ filename, originalPath });
            mainWindow.webContents.send('upload-progress', {
              status: 'row-warning',
              filename,
              index,
              total: totalPhotos,
              warning: 'Thumbnail generation failed — photo saved without thumbnail'
            });
          }

          const faceCropFailures = faces.length - facesToUpload.length;
          if (faceCropFailures > 0) {
            console.warn(`[Upload] ${faceCropFailures} face crop(s) failed for ${filename} — those faces will be missing from selfie search.`);
            uploadReport.faceCropsDropped.push({ filename, count: faceCropFailures });
          }

          if (!isDaemonReady) {
            uploadReport.faceScanSkipped.push({ filename });
          }

          results.push({
            filename,
            r2Url,
            thumbnailUrl: resolvedThumbnailUrl,
            fileSize: cleanCompressedBuffer.length,
            originalSize: fileItem.sizeBytes,
            tabName: tabName,
            exif: exifData,
            capturedAt: capturedAt,
            width: finalMetadata.width,
            height: finalMetadata.height,
            faces: facesToUpload
          });

          const tTotal = Date.now() - tStart;
          console.log(`[BENCHMARK] ${filename}: Total ${tTotal}ms | EXIF ${tExifEnd}ms | Sharp ${tSharpEnd}ms | Upload ${tUploadEnd}ms | FaceCrops ${tCropEnd}ms`);

          mainWindow.webContents.send('upload-progress', {
            status: 'row-success',
            filename,
            index,
            total: totalPhotos
          });

        } catch (err) {
          console.error(`Failed to process photo ${filename}:`, err);
          uploadReport.failed.push({ filename, error: err.message, originalPath });
          mainWindow.webContents.send('upload-progress', {
            status: 'row-error',
            filename,
            index,
            total: totalPhotos,
            error: err.message
          });
        } finally {
          try {
            const tempUploadPath = path.join(tempDir, `temp_upload_${index}_${filename}`);
            if (fs.existsSync(tempUploadPath)) {
              fs.unlinkSync(tempUploadPath);
            }
          } catch (unlinkErr) {}
          activeUploads--;
          sendPerfStats();
        }

        processedCount++;
        mainWindow.webContents.send('upload-progress', {
          status: 'progress',
          index: processedCount,
          total: totalPhotos
        });
      };

      const executeQueue = async () => {
        const workers = [];
        const worker = async () => {
          while (currentIndex < totalPhotos && !isUploadCancelled) {
            const index = currentIndex++;
            const fileItem = resolvedFiles[index];
            if (fileItem.isAlreadyUploaded) {
              uploadReport.duplicatesSkipped.push({ filename: fileItem.name });
              mainWindow.webContents.send('upload-progress', {
                status: 'row-skipped',
                filename: fileItem.name,
                index,
                total: totalPhotos
              });
              processedCount++;
              mainWindow.webContents.send('upload-progress', {
                status: 'progress',
                index: processedCount,
                total: totalPhotos
              });
              continue;
            }
            await processPhoto(index);
          }
        };

        for (let w = 0; w < CONCURRENCY; w++) {
          workers.push(worker());
        }

        await Promise.all(workers);
      };

      await executeQueue();
      if (killDaemon) killDaemon();

      if (results.length > 0) {
        mainWindow.webContents.send('upload-progress', { status: 'submitting' });
        try {
          const bulkRes = await axios.post(`${backendUrl}/api/gallery/events/${eventId}/photos/bulk`, {
            photos: results,
            isFaceScannerOffline: !isDaemonReady
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });

          if (bulkRes.data && Array.isArray(bulkRes.data.photos)) {
            uploadReport.photoIds = bulkRes.data.photos.map(p => p.id).filter(Boolean);
          }
        } catch (bulkErr) {
          console.error('Bulk index submission failed:', bulkErr.message);
          throw new Error(`Bulk index failed: ${bulkErr.message}`);
        }
      }

      uploadReport.successCount = results.length - uploadReport.failed.length;
      mainWindow.webContents.send('upload-report', uploadReport);
      console.log('[Upload] Report:', JSON.stringify({
        total: uploadReport.total,
        success: uploadReport.successCount,
        failed: uploadReport.failed.length,
        thumbnailMissing: uploadReport.thumbnailMissing.length,
        watermarkMissed: uploadReport.watermarkMissed.length,
        exifMissed: uploadReport.exifMissed.length,
        faceScanSkipped: uploadReport.faceScanSkipped.length,
        faceScanErrored: uploadReport.faceScanErrored.length,
        faceCropsDropped: uploadReport.faceCropsDropped.length,
        duplicates: uploadReport.duplicatesSkipped.length
      }));

      const preflightPool = getPreflightDaemonPool();
      if (preflightPool) {
        try { preflightPool.killAllDaemons(); } catch (_) {}
        setPreflightDaemonPool(null);
      }

      if (isUploadCancelled) {
        return { status: 'cancelled', count: results.length };
      }

      return { status: 'success', count: results.length };
    } finally {
      if (activeBlockerId !== null) {
        try {
          powerSaveBlocker.stop(activeBlockerId);
          console.log('[Uploader] Stopped powerSaveBlocker, system sleep allowed. ID:', activeBlockerId);
        } catch (err) {
          console.error('Failed to stop powerSaveBlocker:', err);
        }
      }
    }
  });

  // Cover photo upload handler
  ipcMain.handle('upload-cover-photo', async (event, config) => {
    const { filePath, type, eventId, backendUrl, token } = config;
    if (!filePath || !type || !eventId || !backendUrl || !token) {
      throw new Error('Missing config parameters for cover upload');
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`Cover photo file not found at path: ${filePath}`);
    }

    try {
      const fileBuffer = await fs.promises.readFile(filePath);
      const base64Content = fileBuffer.toString('base64');
      const filename = path.basename(filePath);

      const res = await axios.post(`${backendUrl}/api/gallery/events/${eventId}/covers`, {
        type,
        filename,
        fileContent: base64Content
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      return res.data;
    } catch (err) {
      console.error('Cover upload error:', err);
      const msg = err.response && err.response.data && err.response.data.error
        ? err.response.data.error
        : err.message;
      throw new Error(msg);
    }
  });
}

module.exports = {
  setupUploadHandlers,
  cancelUpload
};
