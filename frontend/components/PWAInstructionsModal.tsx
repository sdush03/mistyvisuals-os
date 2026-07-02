import React from 'react'

export function PWAInstructionsModal({
  isOpen,
  onClose,
  isIOS,
  isAndroid,
}: {
  isOpen: boolean
  onClose: () => void
  isIOS: boolean
  isAndroid: boolean
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-[1.5rem] bg-[var(--surface)] p-6 shadow-xl border border-[var(--border)] animate-in zoom-in-95 duration-200 text-neutral-800 dark:text-neutral-200">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <h3 className="text-lg font-semibold">Install Misty OS</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--surface-muted)] rounded-lg transition" aria-label="Close">
            <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm text-neutral-600 dark:text-neutral-400">
          <p>You can add this application to your device to run it as a standalone app.</p>
          
          {isIOS ? (
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold">1</div>
                <p>Tap the <strong>Share</strong> button (the square icon with an arrow pointing up) in your browser.</p>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold">2</div>
                <p>Scroll down the share menu and select <strong>"Add to Home Screen"</strong>.</p>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold">3</div>
                <p>Tap <strong>"Add"</strong> in the top-right corner.</p>
              </div>
            </div>
          ) : isAndroid ? (
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold">1</div>
                <p>Tap the <strong>menu icon</strong> (three dots ⋮ in the top-right corner) in your browser.</p>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold">2</div>
                <p>Select <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong>.</p>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold">3</div>
                <p>Confirm the prompt to add it to your device.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold">1</div>
                <p>Click the <strong>Share</strong> icon in the address bar (or open the browser's file menu).</p>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold">2</div>
                <p>Select <strong>"Add to Dock"</strong> or <strong>"Install..."</strong>.</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="rounded-full px-5 py-2.5 text-sm font-medium bg-neutral-900 text-white dark:bg-white dark:text-black hover:opacity-90 transition cursor-pointer"
            onClick={onClose}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
