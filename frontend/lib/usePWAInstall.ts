import { useEffect, useState } from 'react'

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)
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

    // 2. Detect environments
    const detectEnvironment = () => {
      const ua = window.navigator.userAgent.toLowerCase()
      const isIOSDevice = /iphone|ipad|ipod/.test(ua)
      const isAndroidDevice = /android/.test(ua)
      const isSafariBrowser = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium') && !ua.includes('android')
      
      setIsIOS(isIOSDevice)
      setIsAndroid(isAndroidDevice)
      setIsSafari(isSafariBrowser)
    }

    detectEnvironment()

    // 3. Listen for the native browser install prompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeBeforeInstallPrompt)
    
    // Fallback: listen to beforeinstallprompt on window object
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  // Fix typo in event listener variable above if any
  const handleBeforeBeforeInstallPrompt = (e: Event) => {
    e.preventDefault()
    setInstallPrompt(e)
  }

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

  // Show the download button on all browsers if not already running inside the installed PWA
  const showInstallButton = !isStandalone

  return { 
    showInstallButton, 
    installApp, 
    isIOS, 
    isAndroid,
    isSafari, 
    isStandalone, 
    hasNativePrompt: installPrompt !== null 
  }
}
