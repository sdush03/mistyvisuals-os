import { useEffect, useState } from 'react'

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 1. Detect if already running in standalone mode (installed app window)
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches
      const isIOSStandalone = (window.navigator as any).standalone === true
      setIsStandalone(isStandaloneMedia || isIOSStandalone)
    }

    checkStandalone()

    // 2. Listen for the native browser install prompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const installApp = async () => {
    if (!installPrompt) return
    try {
      installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      if (outcome === 'accepted') {
        setInstallPrompt(null)
      }
    } catch (err) {
      console.error('Error during PWA installation prompt:', err)
    }
  }

  // Only show the install option if:
  // - We are NOT already running in standalone mode
  // - The install prompt event was successfully captured
  const showInstallButton = !isStandalone && installPrompt !== null

  return { showInstallButton, installApp }
}
