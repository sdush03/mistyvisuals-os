const path = require('path');
const fs = require('fs');

function runCommandAsync(command) {
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

async function downloadFileWithProgress(url, destPath, onProgress) {
  const axios = require('axios');
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'stream'
  });

  const totalSize = parseInt(response.headers['content-length'], 10) || 0;
  let downloaded = 0;
  const fileStream = fs.createWriteStream(destPath);

  response.data.on('data', (chunk) => {
    downloaded += chunk.length;
    onProgress(downloaded, totalSize);
  });

  response.data.pipe(fileStream);

  return new Promise((resolve, reject) => {
    fileStream.on('finish', () => {
      fileStream.close(resolve);
    });
    fileStream.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
    response.data.on('error', (err) => {
      fileStream.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

function setupPreflightHandlers({ ipcMain, app, initDaemonPool, getPreflightDaemonPool, setPreflightDaemonPool }) {
  // IPC Handler: Check, create python environment, and download models on demand
  ipcMain.handle('trigger-setup', async (event) => {
    const userEnvPath = path.join(app.getPath('userData'), 'face_rec_env');
    const pythonBin = process.platform === 'win32'
      ? path.join(userEnvPath, 'Scripts', 'python.exe')
      : path.join(userEnvPath, 'bin', 'python3');
    
    const modelsDir = path.join(app.getPath('userData'), 'models');
    const yunetPath = path.join(modelsDir, 'face_detection_yunet_2023mar.onnx');
    const sfacePath = path.join(modelsDir, 'face_recognition_sface_2021dec.onnx');
    const arcfacePath = path.join(modelsDir, 'w600k_r50.onnx');

    const checkMinSize = (filePath, minBytes) => {
      if (!fs.existsSync(filePath)) return false;
      const stats = fs.statSync(filePath);
      return stats.size >= minBytes;
    };

    const checkFilesExist = () => {
      return fs.existsSync(pythonBin) &&
             checkMinSize(yunetPath, 100 * 1024) &&
             checkMinSize(sfacePath, 30 * 1024 * 1024) &&
             checkMinSize(arcfacePath, 150 * 1024 * 1024);
    };

    if (checkFilesExist()) {
      return { status: 'ready' };
    }

    const sendProgress = (statusText, percent, fileCount = '', fileProgress = '') => {
      event.sender.send('setup-progress', { status: statusText, progress: percent, fileCount, fileProgress });
    };

    try {
      if (!fs.existsSync(pythonBin)) {
        sendProgress('Creating local Python isolation environment...', 10, '0/3 models', '0.0 MB');
        console.log('[Setup] Creating virtual environment at:', userEnvPath);
        await runCommandAsync(`python3 -m venv "${userEnvPath}"`);
      }

      sendProgress('Installing face scanning packages (OpenCV / Numpy)...', 25, '0/3 models', '0.0 MB');
      const pipBin = process.platform === 'win32'
        ? path.join(userEnvPath, 'Scripts', 'pip.exe')
        : path.join(userEnvPath, 'bin', 'pip');
      console.log('[Setup] Installing packages inside virtual environment...');
      await runCommandAsync(`"${pipBin}" install opencv-python numpy`);

      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }

      const yunetUrl = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx";
      const sfaceUrl = "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx";
      const arcfaceUrl = "https://huggingface.co/maze/faceX/resolve/main/w600k_r50.onnx";

      const formatSize = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

      if (!checkMinSize(yunetPath, 100 * 1024)) {
        if (fs.existsSync(yunetPath)) fs.unlinkSync(yunetPath);
        await downloadFileWithProgress(yunetUrl, yunetPath, (dl, total) => {
          const pct = total ? Math.round((dl / total) * 100) : 0;
          const progressStr = `${formatSize(dl)} MB / ${formatSize(total)} MB`;
          sendProgress('Downloading Face Detector model...', 30 + Math.round(pct * 0.15), '1/3 models', progressStr);
        });
      }

      if (!checkMinSize(sfacePath, 30 * 1024 * 1024)) {
        if (fs.existsSync(sfacePath)) fs.unlinkSync(sfacePath);
        await downloadFileWithProgress(sfaceUrl, sfacePath, (dl, total) => {
          const pct = total ? Math.round((dl / total) * 100) : 0;
          const progressStr = `${formatSize(dl)} MB / ${formatSize(total)} MB`;
          sendProgress('Downloading Landmarks Alignment helper...', 45 + Math.round(pct * 0.25), '2/3 models', progressStr);
        });
      }

      if (!checkMinSize(arcfacePath, 150 * 1024 * 1024)) {
        if (fs.existsSync(arcfacePath)) fs.unlinkSync(arcfacePath);
        await downloadFileWithProgress(arcfaceUrl, arcfacePath, (dl, total) => {
          const pct = total ? Math.round((dl / total) * 100) : 0;
          const progressStr = `${formatSize(dl)} MB / ${formatSize(total)} MB`;
          sendProgress('Downloading AI Embeddings engine (ArcFace)...', 70 + Math.round(pct * 0.28), '3/3 models', progressStr);
        });
      }

      sendProgress('Finalizing face recognition engine...', 99, '3/3 models', 'Completed');
      console.log('[Setup] Environment installation successful!');
      return { status: 'success' };
    } catch (err) {
      console.error('[Setup] Local installation failed:', err.message);
      return { status: 'error', error: err.message };
    }
  });

  // IPC Handler: Pre-upload preflight
  ipcMain.handle('run-preflight', async (event, config = {}) => {
    const { daemons = 2 } = config;
    const userEnvPath = path.join(app.getPath('userData'), 'face_rec_env');
    const pythonBin = process.platform === 'win32'
      ? path.join(userEnvPath, 'Scripts', 'python.exe')
      : path.join(userEnvPath, 'bin', 'python3');
    const modelsDir = path.join(app.getPath('userData'), 'models');
    const yunetPath  = path.join(modelsDir, 'face_detection_yunet_2023mar.onnx');
    const sfacePath  = path.join(modelsDir, 'face_recognition_sface_2021dec.onnx');
    const arcfacePath = path.join(modelsDir, 'w600k_r50.onnx');

    const checkMinSize = (filePath, minBytes) => {
      if (!fs.existsSync(filePath)) return false;
      return fs.statSync(filePath).size >= minBytes;
    };
    const sendProgress = (statusText, percent, detail = '') => {
      event.sender.send('preflight-progress', { status: statusText, progress: percent, detail });
    };

    const missing = [];
    if (!fs.existsSync(pythonBin))                       missing.push('Python environment');
    if (!checkMinSize(yunetPath, 100 * 1024))             missing.push('Face detector model (YuNet ~232KB)');
    if (!checkMinSize(sfacePath, 30 * 1024 * 1024))      missing.push('Alignment model (SFace ~38MB)');
    if (!checkMinSize(arcfacePath, 150 * 1024 * 1024))   missing.push('Embeddings model (ArcFace ~174MB)');

    if (missing.length > 0) {
      sendProgress('setup_needed', 5, `Missing: ${missing.join(', ')}`);
      console.log('[Preflight] Missing items:', missing);

      const pipBin = process.platform === 'win32'
        ? path.join(userEnvPath, 'Scripts', 'pip.exe')
        : path.join(userEnvPath, 'bin', 'pip');
      const formatSize = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
      const yunetUrl   = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx';
      const sfaceUrl   = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx';
      const arcfaceUrl = 'https://huggingface.co/maze/faceX/resolve/main/w600k_r50.onnx';

      try {
        if (!fs.existsSync(pythonBin)) {
          sendProgress('installing', 10, 'Creating Python environment...');
          await runCommandAsync(`python3 -m venv "${userEnvPath}"`);
          sendProgress('installing', 20, 'Installing OpenCV & NumPy...');
          await runCommandAsync(`"${pipBin}" install opencv-python numpy`);
        }
        if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

        if (!checkMinSize(yunetPath, 100 * 1024)) {
          if (fs.existsSync(yunetPath)) fs.unlinkSync(yunetPath);
          await downloadFileWithProgress(yunetUrl, yunetPath, (dl, total) => {
            const pct = total ? Math.round((dl / total) * 100) : 0;
            sendProgress('downloading', 25 + Math.round(pct * 0.1), `Face detector: ${formatSize(dl)}/${formatSize(total)} MB`);
          });
        }
        if (!checkMinSize(sfacePath, 30 * 1024 * 1024)) {
          if (fs.existsSync(sfacePath)) fs.unlinkSync(sfacePath);
          await downloadFileWithProgress(sfaceUrl, sfacePath, (dl, total) => {
            const pct = total ? Math.round((dl / total) * 100) : 0;
            sendProgress('downloading', 35 + Math.round(pct * 0.2), `Alignment model: ${formatSize(dl)}/${formatSize(total)} MB`);
          });
        }
        if (!checkMinSize(arcfacePath, 150 * 1024 * 1024)) {
          if (fs.existsSync(arcfacePath)) fs.unlinkSync(arcfacePath);
          await downloadFileWithProgress(arcfaceUrl, arcfacePath, (dl, total) => {
            const pct = total ? Math.round((dl / total) * 100) : 0;
            sendProgress('downloading', 55 + Math.round(pct * 0.3), `ArcFace model: ${formatSize(dl)}/${formatSize(total)} MB`);
          });
        }
      } catch (installErr) {
        console.error('[Preflight] Install failed:', installErr.message);
        return { status: 'setup_failed', error: installErr.message, missingItems: missing };
      }
    }

    sendProgress('starting_daemon', 88, 'Starting face recognition engine...');
    console.log('[Preflight] Starting daemon pool...');
    try {
      const existingPool = getPreflightDaemonPool();
      if (existingPool) {
        try { existingPool.killAllDaemons(); } catch (_) {}
        setPreflightDaemonPool(null);
      }
      const pool = await initDaemonPool(daemons);
      setPreflightDaemonPool(pool);

      if (pool.readyInstances.length === 0) {
        const errorDetails = pool.getErrors();
        pool.killAllDaemons();
        setPreflightDaemonPool(null);
        console.error('[Preflight] Daemon failed to start:\n', errorDetails);
        return { status: 'daemon_failed', daemonReady: false, error: errorDetails };
      }
    } catch (daemonErr) {
      console.error('[Preflight] Daemon pool threw:', daemonErr.message);
      return { status: 'daemon_failed', daemonReady: false, error: daemonErr.message };
    }

    const currentPool = getPreflightDaemonPool();
    sendProgress('ready', 100, `${currentPool.readyInstances.length} scanner(s) ready`);
    console.log('[Preflight] All checks passed. Daemon ready.');
    return { status: 'ready', daemonReady: true, readyCount: currentPool.readyInstances.length };
  });
}

function downloadFileHelper(url, destPath) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: Status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

module.exports = {
  runCommandAsync,
  downloadFileWithProgress,
  downloadFileHelper,
  setupPreflightHandlers
};
