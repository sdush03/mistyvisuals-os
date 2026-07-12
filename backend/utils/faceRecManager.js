// Stubbed FaceRecManager for OS backend
// Face recognition and python daemon have been moved entirely to the MyCircle codebase.
// This stub prevents any python daemon spawning on the OS to conserve memory and CPU.

class FaceRecManager {
  constructor() {
    this.pythonDaemon = null;
    this.queue = [];
    this.stdoutBuffer = '';
    this.isInitializing = false;
  }

  ensureDaemon() {
    return Promise.resolve();
  }

  processBuffer() {}
  handleCrash(error) {}
  async sendCommand(command) {
    return Promise.resolve({});
  }

  async validateSelfie(imagePath) {
    console.log('[FaceRecManager] validateSelfie called on OS (Disabled - moved to MyCircle)');
    return { success: false, error: 'Face recognition is disabled on the OS workspace. Please use the MyCircle portal.' };
  }

  async verifyAnchor(imagePath, anchorVector) {
    console.log('[FaceRecManager] verifyAnchor called on OS (Disabled - moved to MyCircle)');
    return { verified: false, error: 'Face recognition is disabled on the OS workspace. Please use the MyCircle portal.' };
  }

  async matchSelfie(selfiePath, dbVectors, extraVectors = []) {
    console.log('[FaceRecManager] matchSelfie called on OS (Disabled - moved to MyCircle)');
    return { matches: [] };
  }

  async clusterFaces(dbVectors) {
    console.log('[FaceRecManager] clusterFaces called on OS (Disabled - moved to MyCircle)');
    return { clusters: [] };
  }

  shutdown() {}
}

const managerInstance = new FaceRecManager();

module.exports = managerInstance;
