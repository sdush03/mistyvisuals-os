import { useEffect, useState } from 'react'

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isSafari, setIsSafari] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 1. Detect if already running in standalone mode (installed app window)
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches
      const isIOSStandalone = (window.navigator as any).standalone === true
      setIsStandalone(isStandaloneMedia || isIOSStandalone)
    }

    checkStandalone()

    // 2. Detect iOS and Safari (since Apple restricts beforeinstallprompt API)
    const detectEnvironment = () => {
      const ua = window.navigator.userAgent.toLowerCase()
      const isIOSDevice = /iphone|ipad|ipod/.test(ua)
      const isSafariBrowser = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium') && !ua.includes('android')
      
      setIsIOS(isIOSDevice)
      setIsSafari(isSafariBrowser)
    }

    detectEnvironment()

    // 3. Listen for the native browser install prompt event
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

  // We show the install UI if:
  // - We are NOT already running in standalone mode AND
  // - The browser supports programmatic install (installPrompt exists) OR the user is on iOS / Safari
  const showInstallButton = !isStandalone && (installPrompt !== null || isIOS || isSafari)

  return { 
    showInstallButton, 
    installApp, 
    isIOS, 
    isSafari, 
    isStandalone, 
    hasNativePrompt: installPrompt !== null 
  }
}
