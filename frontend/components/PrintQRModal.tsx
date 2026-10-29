'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { ShareGalleryData, AccessTier, buildGalleryUrl } from '@/lib/shareURL'

const getAssetUrl = (path: string): string => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host !== 'localhost' && host !== '127.0.0.1' && !host.includes('192.168.')) {
      return `https://os.mistyvisuals.com${path}`
    }
  }
  return path
}

interface PrintQRModalProps {
  gallery: ShareGalleryData
  initialAccessType?: AccessTier
  onClose: () => void
}

export type CardTheme =
  | 'gemini_1'
  | 'gemini_2'
  | 'gemini_3'
  | 'custom_upload'

const THEME_OPTIONS: { id: CardTheme; name: string; description: string; previewBg: string }[] = [
  {
    id: 'gemini_1',
    name: 'Gemini 1: Ivory',
    description: 'AI Watercolor: Warm champagne & ivory textured background',
    previewBg: 'bg-[#F9F5EC] border-[#E2D8C3]',
  },
  {
    id: 'gemini_2',
    name: 'Gemini 2: Mandap',
    description: 'AI Watercolor: Traditional Indian Mandap & sacred ceremony',
    previewBg: 'bg-[#FFF7ED] border-[#FED7AA]',
  },
  {
    id: 'gemini_3',
    name: 'Gemini 3: Sunset',
    description: 'AI Watercolor: Soft blush, rose gold & warm terracotta',
    previewBg: 'bg-[#F9EFEA] border-[#EAD5CC]',
  },
  {
    id: 'custom_upload',
    name: 'Custom Image',
    description: 'Upload your own backdrop image file',
    previewBg: 'bg-neutral-100 border-neutral-300',
  },
]

export default function PrintQRModal({ gallery, initialAccessType = 'partial', onClose }: PrintQRModalProps) {
  const [accessType, setAccessType] = useState<AccessTier>(initialAccessType)
  const [theme, setTheme] = useState<CardTheme>('gemini_1')
  const [coupleName, setCoupleName] = useState(gallery.crmName || gallery.title || 'Bride & Groom')
  const [customUploadUrl, setCustomUploadUrl] = useState<string>('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const activeCode = accessType === 'partial' ? gallery.partialPasscode : gallery.passcode
  const targetUrl = buildGalleryUrl(gallery.slug, activeCode)

  const [mounted, setMounted] = useState(false)
  const logoImgRef = useRef<HTMLImageElement | null>(null)
  const [logoImgLoaded, setLogoImgLoaded] = useState(false)

  useEffect(() => {
    const logoImg = new Image()
    logoImg.crossOrigin = 'anonymous'
    logoImg.src = getAssetUrl('/logo_black.png')
    logoImgRef.current = logoImg
    if (logoImg.complete && logoImg.naturalWidth > 0) {
      setLogoImgLoaded(true)
    } else {
      logoImg.onload = () => {
        setLogoImgLoaded(true)
      }
      logoImg.onerror = () => {
        // Retry without crossOrigin if CORS is not enabled
        if (logoImg.crossOrigin) {
          logoImg.crossOrigin = null
          logoImg.src = getAssetUrl('/logo_black.png')
        }
      }
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  // Re-draw canvas whenever parameters change
  useEffect(() => {
    if (!mounted) return
    const timer = setTimeout(() => {
      drawCard()
    }, 20)
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.load('96px "Alex Brush"').then(() => {
        drawCard()
      }).catch(() => {})
      document.fonts.ready.then(() => {
        drawCard()
      }).catch(() => {})
    }
    return () => clearTimeout(timer)
  }, [mounted, accessType, theme, coupleName, targetUrl, activeCode, customUploadUrl, logoImgLoaded])

  const drawCard = () => {
    const canvas = canvasRef.current
    if (!canvas) {
      requestAnimationFrame(() => {
        if (canvasRef.current) drawCard()
      })
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // High resolution canvas: 1200 x 1600 (3:4 portrait ratio)
    const W = 1200
    const H = 1600
    canvas.width = W
    canvas.height = H

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Helper: Draw rounded rectangle
    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + w - r, y)
      ctx.quadraticCurveTo(x + w, y, x + w, y + r)
      ctx.lineTo(x + w, y + h - r)
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      ctx.lineTo(x + r, y + h)
      ctx.quadraticCurveTo(x, y + h, x, y + h - r)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
    }

    const renderForeground = () => {
      // ── 1. Top Brand Logo ──
      const logo = logoImgRef.current
      const logoY = 45
      const logoW = 160
      if (logo && logo.complete && logo.naturalWidth > 0) {
        const logoH = logoW * (logo.naturalHeight / logo.naturalWidth)
        ctx.drawImage(logo, (W - logoW) / 2, logoY, logoW, logoH)
      } else {
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#1A1816'
        ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.letterSpacing = '8px'
        ctx.fillText('M I S T Y   V I S U A L S', W / 2 + 4, logoY + 25)
        ctx.letterSpacing = '0px'
      }

      // ── 2. Couple Name & Event Date ──
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      ctx.save()
      ctx.shadowColor = 'rgba(255, 255, 255, 0.95)'
      ctx.shadowBlur = 12
      ctx.fillStyle = '#1A1816'
      let nameFontSize = 96
      ctx.font = `normal ${nameFontSize}px "Alex Brush", "Playfair Display", Georgia, cursive`
      const maxNameW = 1040
      const measuredNameW = ctx.measureText(coupleName).width
      if (measuredNameW > maxNameW) {
        nameFontSize = Math.max(64, Math.floor(nameFontSize * (maxNameW / measuredNameW)))
        ctx.font = `normal ${nameFontSize}px "Alex Brush", "Playfair Display", Georgia, cursive`
      }
      const nameY = 152
      ctx.fillText(coupleName, W / 2, nameY)

      // Subtitle / Date
      if (gallery.eventDate) {
        ctx.fillStyle = '#5A5248'
        ctx.font = '500 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.letterSpacing = '2px'
        const dateY = 250
        try {
          const dateStr = new Date(gallery.eventDate).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'Asia/Kolkata',
          }).toUpperCase()
          ctx.fillText(dateStr, W / 2, dateY)
        } catch {
          ctx.fillText(gallery.eventDate.toUpperCase(), W / 2, dateY)
        }
        ctx.letterSpacing = '0px'
      }
      ctx.restore()

      // ── 3. QR Code & Radial Opacity White Background ──
      const qrDrawSize = 360
      const qrCenterX = W / 2
      const qrCenterY = 1010

      // Radial opacity white background:
      // centre(0) at 80% opacity, mid(75) at 50% opacity, end(100) at 0% opacity
      const radialRadius = 300
      const radialBg = ctx.createRadialGradient(qrCenterX, qrCenterY, 0, qrCenterX, qrCenterY, radialRadius)
      radialBg.addColorStop(0, 'rgba(255, 255, 255, 0.8)')
      radialBg.addColorStop(0.75, 'rgba(255, 255, 255, 0.5)')
      radialBg.addColorStop(1, 'rgba(255, 255, 255, 0.0)')

      ctx.save()
      ctx.fillStyle = radialBg
      ctx.beginPath()
      ctx.arc(qrCenterX, qrCenterY, radialRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Draw QR Code onto Canvas (Standard ISO compliant QRCode with Quiet Zone)
      try {
        const qr = QRCode.create(targetUrl, { errorCorrectionLevel: 'M' })
        const modCount = qr.modules.size
        const quietZone = 4
        const totalGrid = modCount + quietZone * 2
        const moduleSize = qrDrawSize / totalGrid
        const startX = qrCenterX - qrDrawSize / 2
        const startY = qrCenterY - qrDrawSize / 2

        ctx.fillStyle = '#000000'
        for (let r = 0; r < modCount; r++) {
          for (let c = 0; c < modCount; c++) {
            if (qr.modules.get(c, r)) {
              const x = startX + (c + quietZone) * moduleSize
              const y = startY + (r + quietZone) * moduleSize
              ctx.fillRect(x, y, moduleSize + 0.5, moduleSize + 0.5)
            }
          }
        }
      } catch (err) {
        console.error('Failed to draw QR:', err)
      }

      // ── 4. Action Instruction & Messaging ──
      const isPartial = accessType === 'partial'
      const tagText = isPartial ? 'FIND YOUR PHOTOS WITH AI' : 'FULL WEDDING GALLERY'
      const mainInstruction = isPartial
        ? 'Scan to Find Your Photos Instantly'
        : 'Scan to View All Photos & Films'
      const subInstruction = isPartial
        ? 'Take a quick selfie to discover all your photos from the celebrations.'
        : 'Access full resolution ceremony photos, highlights, and wedding films.'

      // Action Tag Pill
      const pillY = 1230
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.letterSpacing = '2px'
      const tagMetrics = ctx.measureText(tagText)
      const pillW = tagMetrics.width + 48
      const pillH = 40

      ctx.fillStyle = isPartial ? 'rgba(16, 185, 129, 0.12)' : 'rgba(99, 102, 241, 0.12)'
      roundRect((W - pillW) / 2, pillY, pillW, pillH, 20)
      ctx.fill()

      ctx.strokeStyle = isPartial ? 'rgba(16, 185, 129, 0.35)' : 'rgba(99, 102, 241, 0.35)'
      ctx.lineWidth = 1
      roundRect((W - pillW) / 2, pillY, pillW, pillH, 20)
      ctx.stroke()

      ctx.fillStyle = isPartial ? '#065F46' : '#3730A3'
      ctx.fillText(tagText, W / 2, pillY + 11)
      ctx.letterSpacing = '0px'

      // Main Instruction
      ctx.fillStyle = '#1A1816'
      ctx.font = 'bold 34px "Playfair Display", Georgia, serif'
      ctx.fillText(mainInstruction, W / 2, 1290)

      // Sub-instruction
      ctx.fillStyle = '#6E665D'
      ctx.font = '400 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(subInstruction, W / 2, 1345)

      // Passcode / Access Code Pill (if available)
      if (activeCode) {
        const codeY = 1395
        const codeLabel = isPartial ? `ACCESS CODE: ${activeCode}` : `PASSCODE: ${activeCode}`
        ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, monospace'
        ctx.letterSpacing = '2px'
        const codeMetrics = ctx.measureText(codeLabel)
        const codePillW = codeMetrics.width + 56
        const codePillH = 48

        ctx.fillStyle = '#FFFFFF'
        roundRect((W - codePillW) / 2, codeY, codePillW, codePillH, 24)
        ctx.fill()

        ctx.strokeStyle = '#D1C7BA'
        ctx.lineWidth = 1.5
        roundRect((W - codePillW) / 2, codeY, codePillW, codePillH, 24)
        ctx.stroke()

        ctx.fillStyle = '#222222'
        ctx.fillText(codeLabel, W / 2, codeY + 14)
        ctx.letterSpacing = '0px'
      }

      // ── 5. Footer (Left: Instagram, Right: Website) ──
      const footerY = 1520
      ctx.fillStyle = '#6B6359'
      ctx.font = '500 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.letterSpacing = '0.5px'

      // Left corner: Instagram
      ctx.textAlign = 'left'
      ctx.fillText('Instagram: @weddingsbymistyvisuals', 75, footerY)

      // Right corner: Website
      ctx.textAlign = 'right'
      ctx.fillText('Website: www.mistyvisuals.com', W - 75, footerY)

      ctx.letterSpacing = '0px'

      // Update preview data URL (lossless PNG)
      setPreviewDataUrl(canvas.toDataURL('image/png'))
    }

    // ── Background Image Loading & Rendering ──
    const imageSrc =
      theme === 'gemini_1'
        ? getAssetUrl('/qr-templates/template-1.jpg')
        : theme === 'gemini_2'
        ? getAssetUrl('/qr-templates/template-2.jpg')
        : theme === 'gemini_3'
        ? getAssetUrl('/qr-templates/template-3.jpg')
        : customUploadUrl

    const renderWithBackground = (img?: HTMLImageElement) => {
      if (img) {
        ctx.drawImage(img, 0, 0, W, H)
        // Soft overlay gradient so text at top and bottom is perfectly legible
        const grad = ctx.createLinearGradient(0, 0, 0, H)
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.75)')
        grad.addColorStop(0.18, 'rgba(255, 255, 255, 0.35)')
        grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.0)')
        grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.65)')
        grad.addColorStop(1, 'rgba(255, 255, 255, 0.95)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)
      } else {
        // Fallback elegant warm ivory if image is missing/not uploaded yet
        ctx.fillStyle = '#FAF7F2'
        ctx.fillRect(0, 0, W, H)
        const radial = ctx.createRadialGradient(W / 2, 500, 50, W / 2, 500, 700)
        radial.addColorStop(0, 'rgba(243, 235, 222, 0.7)')
        radial.addColorStop(1, 'rgba(250, 247, 242, 0)')
        ctx.fillStyle = radial
        ctx.fillRect(0, 0, W, H)
      }
      renderForeground()
    }

    if (imageSrc) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = imageSrc
      img.onload = () => {
        renderWithBackground(img)
      }
      img.onerror = () => {
        if (img.crossOrigin) {
          img.crossOrigin = null
          img.src = imageSrc
          return
        }
        renderWithBackground()
      }
    } else {
      renderWithBackground()
    }
  }

  // Handle Download JPG
  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setIsDownloading(true)
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.98)
      const link = document.createElement('a')
      const sanitizedName = coupleName.replace(/[^a-zA-Z0-9]/g, '_')
      link.download = `${sanitizedName}_MistyVisuals_QR_${accessType}.jpg`
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Download error:', err)
      alert('Failed to download JPG.')
    } finally {
      setIsDownloading(false)
    }
  }

  // Handle Print Card
  const handlePrint = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/jpeg', 0.98)
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${coupleName} - Misty Visuals QR Card</title>
          <style>
            @page { size: auto; margin: 0; }
            body { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff; }
            img { max-width: 100vw; max-height: 100vh; object-fit: contain; }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" onload="window.print();window.close();" />
        </body>
      </html>
    `)
    win.document.close()
  }

  // Handle user uploading custom background
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setCustomUploadUrl(event.target.result)
        setTheme('custom_upload')
      }
    }
    reader.readAsDataURL(file)
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 w-screen h-screen min-h-screen min-h-[100dvh] top-0 left-0 right-0 bottom-0 bg-black/60 backdrop-blur-md z-[100000] flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-2xl w-full max-w-3xl overflow-hidden my-auto animate-in fade-in duration-200">

        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <span>🖼️</span> Print & Download Wedding QR Card
            </h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              High-resolution 300 DPI printable card for guest reception tables or digital sharing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-full transition cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body: Left Controls, Right Preview */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-5 items-start">

          {/* LEFT: Controls (6 columns) */}
          <div className="md:col-span-6 space-y-4">

            {/* 1. Access Mode Toggle */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                1. Access Tier
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setAccessType('partial')}
                  className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    accessType === 'partial'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  ✨ Guest (Selfie)
                </button>
                <button
                  type="button"
                  onClick={() => setAccessType('full')}
                  className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    accessType === 'full'
                      ? 'bg-white text-indigo-900 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  📸 Full Access
                </button>
              </div>
              <p className="text-[10px] text-neutral-400 px-0.5">
                {accessType === 'partial'
                  ? 'Guests can scan and take a selfie to view their own photos and event highlights.'
                  : 'Gives full access to all albums, ceremony folders, and wedding films.'}
              </p>
            </div>

            {/* 2. Theme Selection */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  2. Artistic Template
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] font-bold text-neutral-600 hover:text-neutral-900 underline cursor-pointer"
                >
                  Upload Gemini Art
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {THEME_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={`text-left p-2 rounded-xl border transition relative overflow-hidden cursor-pointer ${
                      theme === t.id
                        ? 'border-neutral-900 bg-neutral-900/5 ring-1 ring-neutral-900 shadow-xs'
                        : 'border-neutral-200 hover:border-neutral-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className={`w-3 h-3 rounded-full border shrink-0 ${t.previewBg}`}></div>
                      <span className="text-xs font-bold text-neutral-900 leading-tight truncate">{t.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Text Customization */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                3. Card Information
              </label>
              <div>
                <span className="text-[10px] text-neutral-500 font-medium mb-1 block">Couple / Event Title</span>
                <input
                  type="text"
                  value={coupleName}
                  onChange={(e) => setCoupleName(e.target.value)}
                  placeholder="e.g. Drishti & Vaibhav"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-1.5 text-xs font-medium text-neutral-800 focus:outline-none focus:border-neutral-400 shadow-xs"
                />
              </div>
              <div className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-100 text-[10px] text-neutral-600 space-y-1">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-neutral-400 shrink-0">Target:</span>
                  <span className="font-mono text-[9px] text-neutral-700 truncate">
                    {targetUrl}
                  </span>
                </div>
                {activeCode && (
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-400">Passcode:</span>
                    <span className="font-mono font-bold text-neutral-900 text-[10px]">{activeCode}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Action Buttons */}
            <div className="pt-1 flex gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold py-2.5 px-3 rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>💾</span>
                {isDownloading ? 'Generating...' : 'Download JPG'}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-800 font-semibold py-2.5 px-3 rounded-xl text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>🖨️</span> Print
              </button>
            </div>
          </div>

          {/* RIGHT: Live High-Resolution Card Preview (6 columns) */}
          <div className="md:col-span-6 flex items-center justify-center self-stretch">
            <div className="w-full aspect-[3/4] bg-white rounded-2xl shadow-xl overflow-hidden border border-neutral-200/80 relative group transition-all">
              {previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt="QR Card Preview"
                  className="w-full h-full object-cover select-none"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-neutral-400">
                  Generating Preview...
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Hidden full-res canvas used for rendering and export */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>,
    document.body
  )
}
