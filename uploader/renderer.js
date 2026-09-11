// Renderer Initialization & Orchestrator

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Renderer] Initializing Misty Visuals Gallery Uploader UI components...');

  // Safely initialize modular UI subsystems
  const modules = [
    { name: 'PerformanceUI', fn: initPerformanceUI },
    { name: 'PerformanceInputsLock', fn: updatePerformanceInputsLockState },
    { name: 'ProjectsUI', fn: initProjectsUI },
    { name: 'QueueUI', fn: initQueueUI },
    { name: 'BackfillListeners', fn: initBackfillListeners },
    { name: 'LightboxUI', fn: initLightboxUI }
  ];

  for (const mod of modules) {
    try {
      if (typeof mod.fn === 'function') mod.fn();
    } catch (err) {
      console.error(`[Renderer] Failed to initialize ${mod.name}:`, err);
    }
  }

  // Verify engine and restore session
  try {
    checkAndInstallEngine();
  } catch (err) {
    console.error('[Renderer] Failed to run checkAndInstallEngine:', err);
  }
});
