const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  processPhotos: (config) => ipcRenderer.invoke('process-photos', config),
  onProgress: (callback) => ipcRenderer.on('upload-progress', (event, data) => callback(data)),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  handleDeepLink: (callback) => ipcRenderer.on('deep-link', (event, slug) => callback(slug)),
  getFolderStats: (paths) => ipcRenderer.invoke('get-folder-stats', paths),
  getFolderFiles: (config) => ipcRenderer.invoke('get-folder-files', config),
  uploadCoverPhoto: (config) => ipcRenderer.invoke('upload-cover-photo', config),
  cancelUpload: () => ipcRenderer.send('cancel-upload'),
  startBackfill: (config) => ipcRenderer.invoke('start-backfill', config),
  pauseBackfill: (pauseState) => ipcRenderer.invoke('pause-backfill', pauseState),
  onBackfillStatus: (callback) => ipcRenderer.on('backfill-status', (event, data) => callback(data)),
  onTriggerBackfill: (callback) => ipcRenderer.on('trigger-backfill-check', (event) => callback()),
  getHardwareSpecs: () => ipcRenderer.invoke('get-hardware-specs'),
  triggerSetup: () => ipcRenderer.invoke('trigger-setup'),
  onSetupProgress: (callback) => ipcRenderer.on('setup-progress', (event, data) => callback(data)),
  // Preflight check + upload integrity
  runPreflight: (config) => ipcRenderer.invoke('run-preflight', config),
  onPreflightProgress: (callback) => ipcRenderer.on('preflight-progress', (event, data) => callback(data)),
  onUploadReport: (callback) => ipcRenderer.on('upload-report', (event, data) => callback(data))
});
