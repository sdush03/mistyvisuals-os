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
  cancelUpload: () => ipcRenderer.send('cancel-upload')
});
