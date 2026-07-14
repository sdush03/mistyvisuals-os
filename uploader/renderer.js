// Renderer Initialization & Orchestrator

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Renderer] Initializing Misty Visuals Gallery Uploader UI components...');

  // Initialize modular UI subsystems
  initPerformanceUI();
  updatePerformanceInputsLockState();
  initProjectsUI();
  initQueueUI();
  initBackfillListeners();
  initLightboxUI();

  // Verify engine and restore session
  checkAndInstallEngine();
});
