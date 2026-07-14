const path = require('path');
const fs = require('fs');

let preflightDaemonPool = null;

function getPreflightDaemonPool() {
  return preflightDaemonPool;
}

function setPreflightDaemonPool(pool) {
  preflightDaemonPool = pool;
}

async function initFaceRecDaemon(app) {
  let pythonScriptPath = path.join(__dirname, '..', 'face_rec.py');
  if (!fs.existsSync(pythonScriptPath)) {
    pythonScriptPath = path.join(process.resourcesPath, 'face_rec.py');
  }

  const { spawn } = require('child_process');
  let pythonDaemon = null;
  let isDaemonReady = false;
  let startError = '';

  const userEnvPath = path.join(app.getPath('userData'), 'face_rec_env');
  const pythonBin = process.platform === 'win32'
    ? path.join(userEnvPath, 'Scripts', 'python.exe')
    : path.join(userEnvPath, 'bin', 'python3');

  try {
    pythonDaemon = spawn(pythonBin, [pythonScriptPath, 'daemon']);
    pythonDaemon.on('error', (err) => {
      console.warn('[FaceRec] Python daemon spawn error:', err.message);
      startError += `Spawn error: ${err.message}\n`;
      isDaemonReady = false;
    });
    if (pythonDaemon.stderr) {
      pythonDaemon.stderr.on('data', (data) => {
        const str = data.toString();
        console.warn('[FaceRec Daemon Startup stderr]:', str);
        startError += str;
      });
    }
  } catch (err) {
    console.warn('[FaceRec] Python daemon spawn caught exception:', err.message);
    startError += `Spawn exception: ${err.message}\n`;
  }

  const killDaemon = () => {
    if (!pythonDaemon) return;
    try {
      pythonDaemon.stdin.write(JSON.stringify({ action: 'exit' }) + '\n');
      pythonDaemon.kill();
    } catch (e) {}
  };

  process.on('exit', killDaemon);

  let daemonQueue = [];
  let isDaemonProcessing = false;

  const processNextDaemonJob = () => {
    if (!pythonDaemon || daemonQueue.length === 0 || isDaemonProcessing) return;
    
    isDaemonProcessing = true;
    const { imagePath, resolve, reject } = daemonQueue.shift();
    
    try {
      pythonDaemon.stdin.write(JSON.stringify({ action: 'extract', image_path: imagePath }) + '\n');
    } catch (err) {
      isDaemonProcessing = false;
      reject(err);
      processNextDaemonJob();
      return;
    }
    
    const onData = (data) => {
      onData.buffer = (onData.buffer || '') + data.toString();
      const lines = onData.buffer.split('\n');
      onData.buffer = lines.pop();
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const result = JSON.parse(line);
            if (result.image_path === imagePath) {
              pythonDaemon.stdout.off('data', onData);
              pythonDaemon.stderr.off('data', onErr);
              isDaemonProcessing = false;
              resolve(result.faces || []);
              processNextDaemonJob();
              return;
            }
          } catch (e) {
            console.error('Failed to parse Python line:', line, e);
          }
        }
      }
    };
    
    const onErr = (data) => {
      console.warn('Python Daemon stderr:', data.toString());
    };
    
    pythonDaemon.stdout.on('data', onData);
    pythonDaemon.stderr.on('data', onErr);
  };

  const getFacesFromDaemon = (imagePath) => {
    if (!isDaemonReady) {
      return Promise.resolve([]);
    }
    const tStart = Date.now();
    return new Promise((resolve, reject) => {
      daemonQueue.push({ 
        imagePath, 
        resolve: (faces) => {
          console.log(`[BENCHMARK-PYTHON] ${path.basename(imagePath)}: ${Date.now() - tStart}ms`);
          resolve(faces);
        }, 
        reject 
      });
      processNextDaemonJob();
    });
  };

  if (pythonDaemon) {
    await new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('[FaceRec] Python daemon ready check timed out after 30s. Skipping local face recognition.');
          if (pythonDaemon) {
            pythonDaemon.stdout.off('data', onDaemonReady);
            killDaemon();
          }
          resolve();
        }
      }, 30000);

      let buffer = '';
      const onDaemonReady = (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim()) {
            try {
              const res = JSON.parse(line);
              if (res.status === 'ready') {
                clearTimeout(timeout);
                if (!resolved) {
                  resolved = true;
                  isDaemonReady = true;
                  console.log('[FaceRec] Python daemon is ready.');
                  if (pythonDaemon) {
                    pythonDaemon.stdout.off('data', onDaemonReady);
                  }
                  resolve();
                  return;
                }
              }
            } catch (e) {
              console.error('Failed to parse ready line:', line, e);
            }
          }
        }
      };

      pythonDaemon.stdout.on('data', onDaemonReady);
    });
  }
  const isBusy = () => isDaemonProcessing;

  return { isDaemonReady, getFacesFromDaemon, killDaemon, isBusy, getStartError: () => startError };
}

async function initDaemonPool(app, count = 2) {
  const instances = [];
  for (let i = 0; i < count; i++) {
    const inst = await initFaceRecDaemon(app);
    instances.push({ inst, pending: 0 });
  }

  const readyInstances = instances.filter(d => d.inst.isDaemonReady);
  if (readyInstances.length === 0) {
    console.warn('[DaemonPool] No daemon instances started successfully.');
  } else {
    console.log(`[DaemonPool] ${readyInstances.length}/${count} daemon(s) ready.`);
  }

  const getFacesFromPool = (imagePath) => {
    const target = instances.reduce((min, d) => d.pending < min.pending ? d : min, instances[0]);
    target.pending++;
    return target.inst.getFacesFromDaemon(imagePath).finally(() => {
      target.pending = Math.max(0, target.pending - 1);
    });
  };

  const killAllDaemons = () => {
    for (const { inst } of instances) {
      if (inst.killDaemon) inst.killDaemon();
    }
  };

  const getActiveCount = () => {
    return readyInstances.filter(d => d.inst.isBusy()).length;
  };

  const getErrors = () => {
    return instances.map((d, i) => `Daemon #${i + 1}:\n${d.inst.getStartError() || 'Unknown error'}`).join('\n\n');
  };

  return { readyInstances, getFacesFromPool, killAllDaemons, getActiveCount, getErrors };
}

module.exports = {
  initFaceRecDaemon,
  initDaemonPool,
  getPreflightDaemonPool,
  setPreflightDaemonPool
};
