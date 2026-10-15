// Centralized Application State and Shared References
window.AppState = {
  selectedFolderPaths: [],
  authToken: null,
  apiBaseUrl: 'https://os.mistyvisuals.com',
  projects: [],
  pendingEventSlug: null,
  currentGallerySlug: null,
  currentGalleryId: null,
  currentGalleryTitle: null,
  heartbeatInterval: null,
  uploadedPhotosCache: {},
  activeBackfillStatus: {
    eventId: null,
    status: 'idle',
    index: 0,
    total: 0,
    scanFailures: 0
  },
  activeBackfillPerf: {
    activeDownloads: 0,
    activeScans: 0
  },
  currentUploaderView: 'upload',
  selectedPhotoIds: new Set(),
  resolvedFiles: [],
  currentUploadedPhotosList: [],
  uploadCompletedState: false,
  isUploadingActive: false,

  // Performance Settings
  uploadWorkers: parseInt(localStorage.getItem('upload_workers')) || 6,
  uploadDaemons: parseInt(localStorage.getItem('upload_daemons')) || 2,
  backfillWorkers: parseInt(localStorage.getItem('backfill_workers')) || 6,
  backfillDaemons: parseInt(localStorage.getItem('backfill_daemons')) || 3,

  tempUploadWorkers: 6,
  tempUploadDaemons: 2,
  tempBackfillWorkers: 6,
  tempBackfillDaemons: 3,

  lastUploadReport: null,
  currentStorageSummary: null
};

window.formatBytes = function(bytes) {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
  return `${val} ${sizes[i]}`;
};

// Initialize temp performance settings values
window.AppState.tempUploadWorkers = window.AppState.uploadWorkers;
window.AppState.tempUploadDaemons = window.AppState.uploadDaemons;
window.AppState.tempBackfillWorkers = window.AppState.backfillWorkers;
window.AppState.tempBackfillDaemons = window.AppState.backfillDaemons;
