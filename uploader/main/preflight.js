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

function getSystemPython3() {
  if (process.platform === 'win32') return 'python';

  const candidatePaths = [
    '/usr/local/bin/python3',
    '/opt/homebrew/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/Current/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.10/bin/python3'
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }

  // Only check /usr/bin/python3 if Xcode developer tools are ACTUALLY installed.
  // Otherwise running /usr/bin/python3 triggers Apple's 20GB Xcode developer tools modal.
  try {
    const { execSync } = require('child_process');
    const devPath = execSync('xcode-select -p', { stdio: 'pipe' }).toString().trim();
    if (devPath && fs.existsSync(devPath) && fs.existsSync('/usr/bin/python3')) {
      return '/usr/bin/python3';
    }
  } catch (_) {}

  return null;
}

async function downloadFileWithProgress(url, destPath, onProgress) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

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

function checkPythonModulesInstalled(pythonBin) {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec(`"${pythonBin}" -c "import cv2, numpy, onnxruntime"`, (err) => {
      resolve(!err);
    });
  });
}

function checkModuleImportable(pythonBin, moduleName) {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec(`"${pythonBin}" -c "import ${moduleName}"`, (err) => {
      resolve(!err);
    });
  });
}

async function retryOperation(fn, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`[Preflight] Operation failed (attempt ${i + 1}/${retries}), retrying in ${delayMs}ms... Error: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

async function ensureAllPackagesInstalled(pythonBin, pipBin, sendProgress) {
  const requiredPackages = [
    { mod: 'numpy',       pkg: 'numpy' },
    { mod: 'cv2',         pkg: 'opencv-python' },
    { mod: 'onnxruntime', pkg: 'onnxruntime<=1.19.2' }
  ];

  let allInstalled = await checkPythonModulesInstalled(pythonBin);
  let attempts = 0;
  const maxAttempts = 10;

  while (!allInstalled && attempts < maxAttempts) {
    attempts++;
    const missing = [];
    for (const item of requiredPackages) {
      const ok = await checkModuleImportable(pythonBin, item.mod);
      if (!ok) missing.push(item);
    }

    if (missing.length === 0) {
      allInstalled = true;
      break;
    }

    const missingNames = missing.map(m => m.pkg).join(', ');
    console.log(`[Setup] Installing missing packages (${missingNames}), attempt ${attempts}/${maxAttempts}`);
    if (sendProgress) {
      sendProgress(`Installing packages: ${missingNames} (Attempt ${attempts}/${maxAttempts})...`, 25, '0/3 models', 'Installing...');
    }

    try {
      const pkgList = missing.map(p => `"${p.pkg}"`).join(' ');
      await runCommandAsync(`"${pipBin}" install --only-binary=:all: ${pkgList}`);
    } catch (batchErr) {
      console.warn('[Setup] Batch pip install failed, attempting individual packages:', batchErr.message);
      for (const item of missing) {
        try {
          if (sendProgress) {
            sendProgress(`Installing ${item.pkg}...`, 25, '0/3 models', item.pkg);
          }
          await runCommandAsync(`"${pipBin}" install --only-binary=:all: "${item.pkg}"`);
        } catch (singleErr) {
          console.warn(`[Setup] Failed to install ${item.pkg}:`, singleErr.message);
        }
      }
    }

    allInstalled = await checkPythonModulesInstalled(pythonBin);
    if (!allInstalled && attempts < maxAttempts) {
      console.warn(`[Setup] Package verification failed. Pausing before retry attempt ${attempts + 1}...`);
      for (let sec = 4; sec > 0; sec--) {
        if (sendProgress) {
          sendProgress(`Package install incomplete. Retrying in ${sec}s... (Attempt ${attempts}/${maxAttempts})`, 25, '0/3 models', 'Retrying...');
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  if (!allInstalled) {
    throw new Error(`Failed to install all face scanning packages after ${maxAttempts} attempts. Please check internet connection.`);
  }

  return true;
}

async function ensureAllModelsDownloaded(modelsDir, sendProgress) {
  if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

  const models = [
    {
      name: 'Face Detector (YuNet)',
      file: path.join(modelsDir, 'face_detection_yunet_2023mar.onnx'),
      url: 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx',
      minSize: 100 * 1024,
      basePct: 30,
      scalePct: 0.15,
      indexStr: '1/3 models'
    },
    {
      name: 'Alignment Helper (SFace)',
      file: path.join(modelsDir, 'face_recognition_sface_2021dec.onnx'),
      url: 'https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx',
      minSize: 30 * 1024 * 1024,
      basePct: 45,
      scalePct: 0.25,
      indexStr: '2/3 models'
    },
    {
      name: 'AI Embeddings (ArcFace)',
      file: path.join(modelsDir, 'w600k_r50.onnx'),
      url: 'https://huggingface.co/maze/faceX/resolve/main/w600k_r50.onnx',
      minSize: 150 * 1024 * 1024,
      basePct: 70,
      scalePct: 0.28,
      indexStr: '3/3 models'
    }
  ];

  const formatSize = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

  for (const m of models) {
    let downloaded = fs.existsSync(m.file) && fs.statSync(m.file).size >= m.minSize;
    let attempts = 0;
    while (!downloaded && attempts < 10) {
      attempts++;
      console.log(`[Setup] Downloading ${m.name} (Attempt ${attempts}/10)...`);
      if (fs.existsSync(m.file)) {
        try { fs.unlinkSync(m.file); } catch (_) {}
      }
      try {
        await downloadFileWithProgress(m.url, m.file, (dl, total) => {
          const pct = total ? Math.round((dl / total) * 100) : 0;
          const progressStr = `${formatSize(dl)} MB / ${formatSize(total)} MB`;
          if (sendProgress) {
            sendProgress(`Downloading ${m.name}...`, m.basePct + Math.round(pct * m.scalePct), m.indexStr, progressStr);
          }
        });
        downloaded = fs.existsSync(m.file) && fs.statSync(m.file).size >= m.minSize;
      } catch (dlErr) {
        console.warn(`[Setup] Download failed for ${m.name}:`, dlErr.message);
      }

      if (!downloaded && attempts < 10) {
        for (let sec = 4; sec > 0; sec--) {
          if (sendProgress) {
            sendProgress(`Download interrupted. Retrying in ${sec}s... (Attempt ${attempts}/10)`, m.basePct, m.indexStr, 'Retrying...');
          }
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    if (!downloaded) {
      throw new Error(`Failed to download ${m.name} after multiple attempts.`);
    }
  }
  return true;
}

async function ensurePythonRuntime(app, sendProgress) {
  const userEnvPath = path.join(app.getPath('userData'), 'face_rec_env');
  const pythonBin = process.platform === 'win32'
    ? path.join(userEnvPath, 'Scripts', 'python.exe')
    : path.join(userEnvPath, 'bin', 'python3');

  if (fs.existsSync(pythonBin)) {
    return pythonBin;
  }

  // 1. Check if user already has an existing downloaded standalone python
  const standaloneDir = path.join(app.getPath('userData'), 'python_standalone');
  const standaloneBin = process.platform === 'win32'
    ? path.join(standaloneDir, 'python.exe')
    : path.join(standaloneDir, 'bin', 'python3');

  if (fs.existsSync(standaloneBin)) {
    console.log('[Setup] Found existing standalone Python at:', standaloneBin);
    return standaloneBin;
  }

  // 2. Check if system has a working Python 3
  const sysPython = getSystemPython3();
  if (sysPython) {
    console.log('[Setup] Found system Python 3 at:', sysPython);
    return sysPython;
  }

  // 3. Neither exists! Automatically download portable Python (~25 MB)
  console.log('[Setup] No system Python found. Auto-downloading portable Python runtime...');
  if (sendProgress) {
    sendProgress('Downloading portable Python runtime (~25 MB)...', 5, '0/3 models', '0.0 MB');
  }

  const arch = process.arch; // 'x64' or 'arm64'
  let url = '';
  if (process.platform === 'darwin') {
    if (arch === 'arm64') {
      url = 'https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.11.17%2B20261003-aarch64-apple-darwin-install_only_stripped.tar.gz';
    } else {
      url = 'https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.11.17%2B20261003-x86_64-apple-darwin-install_only_stripped.tar.gz';
    }
  } else if (process.platform === 'win32') {
    url = 'https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.11.17%2B20261003-x86_64-pc-windows-msvc-shared-install_only.tar.gz';
  } else {
    url = 'https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.11.17%2B20261003-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz';
  }

  const tarballPath = path.join(app.getPath('userData'), 'python_standalone.tar.gz');
  const formatSize = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

  await retryOperation(async () => {
    await downloadFileWithProgress(url, tarballPath, (dl, total) => {
      const pct = total ? Math.round((dl / total) * 100) : 0;
      const progressStr = `${formatSize(dl)} MB / ${formatSize(total)} MB`;
      if (sendProgress) {
        sendProgress('Downloading portable Python runtime (~25 MB)...', Math.round(pct * 0.15), '0/3 models', progressStr);
      }
    });
  });

  if (sendProgress) {
    sendProgress('Extracting Python runtime...', 16, '0/3 models', 'Extracting...');
  }
  const tempExtractDir = path.join(app.getPath('userData'), 'python_temp_' + Date.now());
  fs.mkdirSync(tempExtractDir, { recursive: true });

  try {
    const { execSync } = require('child_process');
    execSync(`tar -xzf "${tarballPath}" -C "${tempExtractDir}"`);

    const extractedPythonDir = path.join(tempExtractDir, 'python');
    if (fs.existsSync(extractedPythonDir)) {
      if (fs.existsSync(standaloneDir)) fs.rmSync(standaloneDir, { recursive: true, force: true });
      fs.renameSync(extractedPythonDir, standaloneDir);
    }
  } finally {
    if (fs.existsSync(tarballPath)) {
      try { fs.unlinkSync(tarballPath); } catch (_) {}
    }
    if (fs.existsSync(tempExtractDir)) {
      try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  if (fs.existsSync(standaloneBin)) {
    console.log('[Setup] Standalone Python successfully installed at:', standaloneBin);
    return standaloneBin;
  }

  throw new Error('Failed to install standalone Python engine.');
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

    const checkFilesExist = async () => {
      const hasBinaries = fs.existsSync(pythonBin) &&
             checkMinSize(yunetPath, 100 * 1024) &&
             checkMinSize(sfacePath, 30 * 1024 * 1024) &&
             checkMinSize(arcfacePath, 150 * 1024 * 1024);
      if (!hasBinaries) return false;
      return await checkPythonModulesInstalled(pythonBin);
    };

    if (await checkFilesExist()) {
      return { status: 'ready' };
    }

    const sendProgress = (statusText, percent, fileCount = '', fileProgress = '') => {
      event.sender.send('setup-progress', { status: statusText, progress: percent, fileCount, fileProgress });
    };

    try {
      if (!fs.existsSync(pythonBin)) {
        sendProgress('Preparing Python environment...', 5, '0/3 models', '0.0 MB');
        const basePython = await ensurePythonRuntime(app, sendProgress);
        sendProgress('Creating local Python isolation environment...', 18, '0/3 models', '0.0 MB');
        console.log('[Setup] Creating virtual environment at:', userEnvPath);
        await runCommandAsync(`"${basePython}" -m venv "${userEnvPath}"`);
      }

      const pipBin = process.platform === 'win32'
        ? path.join(userEnvPath, 'Scripts', 'pip.exe')
        : path.join(userEnvPath, 'bin', 'pip');

      // Keep retrying until ALL required packages (numpy, cv2, onnxruntime) are installed and verified
      await ensureAllPackagesInstalled(pythonBin, pipBin, sendProgress);

      // Keep retrying until ALL required models are downloaded and verified
      await ensureAllModelsDownloaded(modelsDir, sendProgress);

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
    if (!fs.existsSync(pythonBin)) {
      missing.push('Python environment');
    } else {
      const hasModules = await checkPythonModulesInstalled(pythonBin);
      if (!hasModules) {
        missing.push('Required Python modules (OpenCV, NumPy, ONNX Runtime)');
      }
    }
    if (!checkMinSize(yunetPath, 100 * 1024))             missing.push('Face detector model (YuNet ~232KB)');
    if (!checkMinSize(sfacePath, 30 * 1024 * 1024))      missing.push('Alignment model (SFace ~38MB)');
    if (!checkMinSize(arcfacePath, 150 * 1024 * 1024))   missing.push('Embeddings model (ArcFace ~174MB)');

    // Verify Video Optimizer Engine (FFmpeg)
    const getFfmpeg = () => {
      try {
        let p = require('@ffmpeg-installer/ffmpeg').path;
        if (p && p.includes('.asar')) {
          const unpacked = p.replace(/\.asar([/\\])/, '.asar.unpacked$1');
          if (fs.existsSync(unpacked)) return unpacked;
          const standardUnpacked = p.replace(/app(-[^/\\]+)?\.asar([/\\])/, 'app.asar.unpacked$2');
          if (fs.existsSync(standardUnpacked)) return standardUnpacked;
        }
        if (p && fs.existsSync(p)) return p;
      } catch (_) {}
      return null;
    };
    if (!getFfmpeg()) {
      missing.push('Video Optimizer Engine (FFmpeg missing or blocked by macOS permissions. Action: Reinstall uploader or grant permission in System Settings > Privacy & Security)');
    }

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
          sendProgress('installing', 5, 'Preparing Python environment...');
          const basePython = await ensurePythonRuntime(app, (statusText, pct, fileCount, progStr) => {
            sendProgress('downloading', Math.max(5, Math.round(pct * 0.15)), statusText);
          });
          sendProgress('installing', 18, 'Creating Python environment...');
          await runCommandAsync(`"${basePython}" -m venv "${userEnvPath}"`);
        }

        // Keep retrying until ALL required packages (numpy, cv2, onnxruntime) are installed and verified
        await ensureAllPackagesInstalled(pythonBin, pipBin, (statusText, pct, fileCount, progStr) => {
          sendProgress('installing', 25, statusText);
        });

        // Keep retrying until ALL required models are downloaded and verified
        await ensureAllModelsDownloaded(modelsDir, (statusText, pct, fileCount, progStr) => {
          sendProgress('downloading', pct, statusText);
        });
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
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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
