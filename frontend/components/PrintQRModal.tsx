'use client'

import React, { useState, useEffect, useRef } from 'react'
import { QrCode } from '@/lib/qrCode'
import { ShareGalleryData, AccessTier, buildGalleryUrl } from '@/lib/shareURL'

interface PrintQRModalProps {
  gallery: ShareGalleryData
  initialAccessType?: AccessTier
  onClose: () => void
}

export type CardTheme =
  | 'minimalist'
  | 'botanical'
  | 'editorial'
  | 'gemini_1'
  | 'gemini_2'
  | 'gemini_3'
  | 'custom_upload'

const THEME_OPTIONS: { id: CardTheme; name: string; description: string; previewBg: string }[] = [
  {
    id: 'minimalist',
    name: 'Classic Ivory',
    description: 'Fine-art vector silhouette on warm ivory with champagne borders',
    previewBg: 'bg-[#FAF8F5] border-[#E8E4DD]',
  },
  {
    id: 'botanical',
    name: 'Sage Botanical',
    description: 'Eucalyptus botanical framing with delicate laurel accents',
    previewBg: 'bg-[#F2F6F3] border-[#D4E2D7]',
  },
  {
    id: 'editorial',
    name: 'Modern Luxe',
    description: 'Contemporary warm stone palette with fine geometric framing',
    previewBg: 'bg-[#F5F2EB] border-[#DCD5C9]',
  },
  {
    id: 'gemini_1',
    name: 'Gemini 1: Ivory',
    description: 'AI Watercolor: Warm champagne & ivory textured background',
    previewBg: 'bg-[#F9F5EC] border-[#E2D8C3]',
  },
  {
    id: 'gemini_2',
    name: 'Gemini 2: Sage',
    description: 'AI Watercolor: Soft sage green & eucalyptus washes',
    previewBg: 'bg-[#EEF4EF] border-[#CADBCE]',
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
  const [theme, setTheme] = useState<CardTheme>('minimalist')
  const [coupleName, setCoupleName] = useState(gallery.crmName || gallery.title || 'Bride & Groom')
  const [customUploadUrl, setCustomUploadUrl] = useState<string>('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const activeCode = accessType === 'partial' ? gallery.partialPasscode : gallery.passcode
  const targetUrl = buildGalleryUrl(gallery.slug, activeCode)

  // Re-draw canvas whenever parameters change
  useEffect(() => {
    drawCard()
  }, [accessType, theme, coupleName, targetUrl, activeCode, customUploadUrl])

  const drawCard = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // High resolution canvas: 1200 x 1600 (3:4 portrait ratio)
    const W = 1200
    const H = 1600
    canvas.width = W
    canvas.height = H

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

    const renderForeground = (hasBackgroundImage: boolean = false) => {
      // ── 1. Top Brand Header ──
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      // Tiny top monogram / logo mark
      ctx.fillStyle = '#8B8378'
      ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.letterSpacing = '10px'
      ctx.fillText('M I S T Y   V I S U A L S', W / 2 + 5, 80)
      ctx.letterSpacing = '0px'

      // Fine divider
      ctx.strokeStyle = 'rgba(180, 170, 155, 0.4)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(W / 2 - 120, 125)
      ctx.lineTo(W / 2 + 120, 125)
      ctx.stroke()

      // ── 2. Couple Name (Main Heading) ──
      ctx.fillStyle = '#1A1816'
      ctx.font = 'bold 64px "Playfair Display", Georgia, "Times New Roman", serif'
      ctx.fillText(coupleName, W / 2, 160)

      // Subtitle / Date
      if (gallery.eventDate) {
        ctx.fillStyle = '#7A7268'
        ctx.font = '500 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        try {
          const dateStr = new Date(gallery.eventDate).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'Asia/Kolkata',
          })
          ctx.fillText(dateStr, W / 2, 240)
        } catch {
          ctx.fillText(gallery.eventDate, W / 2, 240)
        }
      }

      // ── 3. Silhouette Artwork (Centerpiece) ──
      // If no background image, render built-in vector couple silhouette
      if (!hasBackgroundImage) {
        drawSilhouetteIllustration(ctx, W / 2, 450, theme)
      }

      // ── 4. QR Code Card Container ──
      const qrBoxW = 460
      const qrBoxH = 460
      const qrBoxX = (W - qrBoxW) / 2
      const qrBoxY = 660

      // Card shadow
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.08)'
      ctx.shadowBlur = 40
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 16
      ctx.fillStyle = '#FFFFFF'
      roundRect(qrBoxX, qrBoxY, qrBoxW, qrBoxH, 36)
      ctx.fill()
      ctx.restore()

      // Subtle card border
      ctx.strokeStyle = 'rgba(215, 205, 190, 0.6)'
      ctx.lineWidth = 1.5
      roundRect(qrBoxX, qrBoxY, qrBoxW, qrBoxH, 36)
      ctx.stroke()

      // Draw QR Code onto Canvas
      try {
        const qr = QrCode.encodeText(targetUrl, 'M')
        const qrSize = qr.size
        const qrDrawSize = 360
        const moduleSize = qrDrawSize / qrSize
        const startX = qrBoxX + (qrBoxW - qrDrawSize) / 2
        const startY = qrBoxY + (qrBoxH - qrDrawSize) / 2

        ctx.fillStyle = '#111111'
        for (let r = 0; r < qrSize; r++) {
          for (let c = 0; c < qrSize; c++) {
            if (qr.getModule(c, r)) {
              ctx.fillRect(startX + c * moduleSize, startY + r * moduleSize, moduleSize + 0.5, moduleSize + 0.5)
            }
          }
        }
      } catch (err) {
        console.error('Failed to draw QR:', err)
      }

      // ── 5. Action Instruction & Messaging ──
      const isPartial = accessType === 'partial'
      const tagText = isPartial ? 'FIND YOUR PHOTOS WITH AI' : 'FULL WEDDING GALLERY'
      const mainInstruction = isPartial
        ? 'Scan to Find Your Photos Instantly'
        : 'Scan to View All Photos & Films'
      const subInstruction = isPartial
        ? 'Take a quick selfie to discover all your photos from the celebrations.'
        : 'Access full resolution ceremony photos, highlights, and wedding films.'

      // Action Tag Pill
      const pillY = 1170
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.letterSpacing = '3px'
      const tagMetrics = ctx.measureText(tagText)
      const pillW = tagMetrics.width + 50
      const pillH = 44

      ctx.fillStyle = isPartial ? 'rgba(16, 185, 129, 0.12)' : 'rgba(99, 102, 241, 0.12)'
      roundRect((W - pillW) / 2, pillY, pillW, pillH, 22)
      ctx.fill()

      ctx.strokeStyle = isPartial ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'
      ctx.lineWidth = 1
      roundRect((W - pillW) / 2, pillY, pillW, pillH, 22)
      ctx.stroke()

      ctx.fillStyle = isPartial ? '#065F46' : '#3730A3'
      ctx.fillText(tagText, W / 2, pillY + 12)
      ctx.letterSpacing = '0px'

      // Main Instruction
      ctx.fillStyle = '#1A1816'
      ctx.font = 'bold 42px "Playfair Display", Georgia, serif'
      ctx.fillText(mainInstruction, W / 2, 1240)

      // Sub-instruction
      ctx.fillStyle = '#6E675E'
      ctx.font = '400 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(subInstruction, W / 2, 1300)

      // Passcode / Access Code Pill (if available)
      if (activeCode) {
        const codeY = 1365
        const codeLabel = isPartial ? `ACCESS CODE: ${activeCode}` : `PASSCODE: ${activeCode}`
        ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, monospace'
        ctx.letterSpacing = '2px'
        const codeMetrics = ctx.measureText(codeLabel)
        const codePillW = codeMetrics.width + 60
        const codePillH = 56

        ctx.fillStyle = '#FFFFFF'
        roundRect((W - codePillW) / 2, codeY, codePillW, codePillH, 28)
        ctx.fill()

        ctx.strokeStyle = '#D1C7BA'
        ctx.lineWidth = 1.5
        roundRect((W - codePillW) / 2, codeY, codePillW, codePillH, 28)
        ctx.stroke()

        ctx.fillStyle = '#222222'
        ctx.fillText(codeLabel, W / 2, codeY + 15)
        ctx.letterSpacing = '0px'
      }

      // ── 6. Footer ──
      ctx.fillStyle = '#9C9488'
      ctx.font = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.letterSpacing = '1px'
      ctx.fillText('POWERED BY MYCIRCLE  •  MYCIRCLE.MISTYVISUALS.COM', W / 2, 1490)
      ctx.letterSpacing = '0px'

      // Update preview data URL
      setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.95))
    }

    // ── Background Rendering per Theme ──
    const isGeminiTheme = theme === 'gemini_1' || theme === 'gemini_2' || theme === 'gemini_3'
    let imageSrc = ''
    if (theme === 'gemini_1') imageSrc = '/qr-templates/template-1.jpg'
    else if (theme === 'gemini_2') imageSrc = '/qr-templates/template-2.jpg'
    else if (theme === 'gemini_3') imageSrc = '/qr-templates/template-3.jpg'
    else if (theme === 'custom_upload') imageSrc = customUploadUrl

    if ((isGeminiTheme || theme === 'custom_upload') && imageSrc) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = imageSrc
      img.onload = () => {
        // Draw image covering canvas
        ctx.drawImage(img, 0, 0, W, H)
        // Add subtle overlay gradient so text is guaranteed legible
        const grad = ctx.createLinearGradient(0, 0, 0, H)
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)')
        grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.15)')
        grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.7)')
        grad.addColorStop(1, 'rgba(255, 255, 255, 0.95)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)
        renderForeground(true)
      }
      img.onerror = () => {
        // Fallback to minimalist background if custom image not found
        drawMinimalistBackground(ctx, W, H)
        renderForeground(false)
      }
    } else {
      if (theme === 'botanical') {
        drawBotanicalBackground(ctx, W, H)
      } else if (theme === 'editorial') {
        drawEditorialBackground(ctx, W, H)
      } else {
        drawMinimalistBackground(ctx, W, H)
      }
      renderForeground(false)
    }
  }

  // ── Background Helpers ──
  const drawMinimalistBackground = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    // Warm ivory base
    ctx.fillStyle = '#FAF7F2'
    ctx.fillRect(0, 0, W, H)

    // Soft subtle radial warmth
    const radial = ctx.createRadialGradient(W / 2, 350, 50, W / 2, 350, 700)
    radial.addColorStop(0, 'rgba(243, 235, 222, 0.7)')
    radial.addColorStop(1, 'rgba(250, 247, 242, 0)')
    ctx.fillStyle = radial
    ctx.fillRect(0, 0, W, H)

    // Elegant outer double border
    ctx.strokeStyle = '#E0D7C9'
    ctx.lineWidth = 1.5
    ctx.strokeRect(36, 36, W - 72, H - 72)

    ctx.strokeStyle = 'rgba(224, 215, 201, 0.5)'
    ctx.lineWidth = 0.8
    ctx.strokeRect(46, 46, W - 92, H - 92)
  }

  const drawBotanicalBackground = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    ctx.fillStyle = '#F4F7F4'
    ctx.fillRect(0, 0, W, H)

    const radial = ctx.createRadialGradient(W / 2, 380, 80, W / 2, 380, 750)
    radial.addColorStop(0, 'rgba(226, 237, 229, 0.8)')
    radial.addColorStop(1, 'rgba(244, 247, 244, 0)')
    ctx.fillStyle = radial
    ctx.fillRect(0, 0, W, H)

    // Delicate botanical frame
    ctx.strokeStyle = '#CAD8CD'
    ctx.lineWidth = 1.5
    ctx.strokeRect(36, 36, W - 72, H - 72)
  }

  const drawEditorialBackground = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    ctx.fillStyle = '#F5F3EF'
    ctx.fillRect(0, 0, W, H)

    ctx.strokeStyle = '#D9D3C7'
    ctx.lineWidth = 2
    ctx.strokeRect(40, 40, W - 80, H - 80)

    // Corner cross accents
    const crossSize = 15
    const drawCross = (x: number, y: number) => {
      ctx.beginPath()
      ctx.moveTo(x - crossSize, y)
      ctx.lineTo(x + crossSize, y)
      ctx.moveTo(x, y - crossSize)
      ctx.lineTo(x, y + crossSize)
      ctx.stroke()
    }
    ctx.strokeStyle = '#A89F91'
    ctx.lineWidth = 1.5
    drawCross(40, 40)
    drawCross(W - 40, 40)
    drawCross(40, H - 40)
    drawCross(W - 40, H - 40)
  }

  // ── Vector Couple Silhouette Artwork ──
  const drawSilhouetteIllustration = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    themeMode: CardTheme
  ) => {
    ctx.save()
    ctx.translate(cx, cy)
    const scale = 1.15
    ctx.scale(scale, scale)

    // Subtle halo / watercolor wash behind couple
    const haloGrad = ctx.createRadialGradient(0, -30, 20, 0, -30, 150)
    if (themeMode === 'botanical') {
      haloGrad.addColorStop(0, 'rgba(195, 218, 201, 0.45)')
      haloGrad.addColorStop(1, 'rgba(195, 218, 201, 0)')
    } else {
      haloGrad.addColorStop(0, 'rgba(225, 212, 195, 0.5)')
      haloGrad.addColorStop(1, 'rgba(225, 212, 195, 0)')
    }
    ctx.fillStyle = haloGrad
    ctx.beginPath()
    ctx.arc(0, -30, 150, 0, Math.PI * 2)
    ctx.fill()

    // Arch behind couple
    ctx.strokeStyle = themeMode === 'botanical' ? 'rgba(150, 175, 155, 0.4)' : 'rgba(190, 175, 155, 0.45)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(0, -50, 110, Math.PI, 0, false)
    ctx.lineTo(110, 80)
    ctx.moveTo(-110, -50)
    ctx.lineTo(-110, 80)
    ctx.stroke()

    // Silhouette Color: warm charcoal
    ctx.fillStyle = '#2B2621'

    // ── Groom (Left figure, back-view in tuxedo) ──
    // Groom Head
    ctx.beginPath()
    ctx.ellipse(-26, -112, 15, 18, -0.05, 0, Math.PI * 2)
    ctx.fill()

    // Groom Neck & Collar
    ctx.beginPath()
    ctx.moveTo(-33, -95)
    ctx.lineTo(-18, -95)
    ctx.lineTo(-15, -78)
    ctx.lineTo(-44, -78)
    ctx.closePath()
    ctx.fill()

    // Groom Torso / Tuxedo Jacket
    ctx.beginPath()
    ctx.moveTo(-45, -78)
    ctx.quadraticCurveTo(-55, -60, -50, 0) // Left shoulder & arm
    ctx.lineTo(-10, 0)                    // Waist
    ctx.lineTo(-10, -78)                   // Chest/back seam
    ctx.closePath()
    ctx.fill()

    // Groom Left Arm embracing
    ctx.beginPath()
    ctx.moveTo(-50, -65)
    ctx.quadraticCurveTo(-62, -20, -38, 20)
    ctx.quadraticCurveTo(-20, 28, 5, 20)
    ctx.quadraticCurveTo(-15, 10, -40, -10)
    ctx.closePath()
    ctx.fill()

    // ── Bride (Right figure, back-view in bridal gown) ──
    // Bride Head
    ctx.beginPath()
    ctx.ellipse(18, -105, 13, 16, 0.1, 0, Math.PI * 2)
    ctx.fill()

    // Bride Hair Bun / Updo
    ctx.beginPath()
    ctx.ellipse(22, -114, 8, 9, 0, 0, Math.PI * 2)
    ctx.fill()

    // Bride Shoulders & Back
    ctx.beginPath()
    ctx.moveTo(5, -90)
    ctx.quadraticCurveTo(20, -92, 42, -75) // Right shoulder
    ctx.quadraticCurveTo(45, -45, 36, -15) // Back contour
    ctx.quadraticCurveTo(20, -10, -2, -15) // Waist connecting to groom
    ctx.quadraticCurveTo(-3, -75, 5, -90)
    ctx.closePath()
    ctx.fill()

    // Bride Gown Flared Skirt (graceful flowing curves)
    ctx.beginPath()
    ctx.moveTo(-2, -15)
    ctx.quadraticCurveTo(36, -15, 36, -15)
    ctx.quadraticCurveTo(65, 30, 85, 90)   // Right flare
    ctx.lineTo(-35, 90)                    // Hem
    ctx.quadraticCurveTo(-10, 30, -2, -15)
    ctx.closePath()
    ctx.fill()

    // Translucent Bridal Veil trailing down
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)'
    ctx.beginPath()
    ctx.moveTo(22, -110)
    ctx.quadraticCurveTo(55, -50, 75, 80)
    ctx.quadraticCurveTo(30, 95, 0, 85)
    ctx.quadraticCurveTo(20, -10, 22, -110)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  // Handle Download JPG
  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setIsDownloading(true)
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
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

  return (
    <div className="fixed inset-0 bg-neutral-950/75 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-2xl w-full max-w-5xl overflow-hidden my-auto animate-in fade-in duration-200">

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div>
            <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <span>🖼️</span> Print & Download Wedding QR Card
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              High-resolution 300 DPI printable card for guest reception tables or digital sharing.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-full transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body: Left Controls, Right Preview */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* LEFT: Controls (5 columns) */}
          <div className="lg:col-span-5 space-y-6">

            {/* 1. Access Mode Toggle */}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                1. Access Tier
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setAccessType('partial')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold transition ${
                    accessType === 'partial'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  ✨ Guest (Selfie Search)
                </button>
                <button
                  type="button"
                  onClick={() => setAccessType('full')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold transition ${
                    accessType === 'full'
                      ? 'bg-white text-indigo-900 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  📸 Full Access
                </button>
              </div>
              <p className="text-[11px] text-neutral-500 px-1">
                {accessType === 'partial'
                  ? 'Guests can scan and take a selfie to view their own photos and event highlights.'
                  : 'Gives full access to all albums, ceremony folders, and wedding films.'}
              </p>
            </div>

            {/* 2. Theme Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                  2. Artistic Template
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] font-bold text-neutral-600 hover:text-neutral-900 underline"
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

              <div className="grid grid-cols-2 gap-2.5">
                {THEME_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={`text-left p-3 rounded-2xl border transition relative overflow-hidden ${
                      theme === t.id
                        ? 'border-neutral-900 bg-neutral-900/5 ring-1 ring-neutral-900 shadow-xs'
                        : 'border-neutral-200 hover:border-neutral-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-3.5 h-3.5 rounded-full border ${t.previewBg}`}></div>
                      <span className="text-xs font-bold text-neutral-900 leading-tight">{t.name}</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 line-clamp-2">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Text Customization */}
            <div className="space-y-3">
              <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                3. Card Information
              </label>
              <div>
                <span className="text-[10px] text-neutral-500 font-medium mb-1 block">Couple / Event Title</span>
                <input
                  type="text"
                  value={coupleName}
                  onChange={(e) => setCoupleName(e.target.value)}
                  placeholder="e.g. Drishti & Vaibhav"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-xs font-medium text-neutral-800 focus:outline-none focus:border-neutral-400 shadow-xs"
                />
              </div>
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100 text-[11px] text-neutral-600 space-y-1">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Target Link:</span>
                  <span className="font-mono text-[10px] text-neutral-700 truncate max-w-[220px]">
                    {targetUrl}
                  </span>
                </div>
                {activeCode && (
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Embedded Code:</span>
                    <span className="font-mono font-bold text-neutral-900">{activeCode}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold py-3 px-4 rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>💾</span>
                {isDownloading ? 'Generating JPG...' : 'Download High-Res JPG'}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-800 font-semibold py-3 px-4 rounded-xl text-xs transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>🖨️</span> Print Card
              </button>
            </div>
          </div>

          {/* RIGHT: Live High-Resolution Card Preview (7 columns) */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center bg-neutral-100/70 p-6 rounded-3xl border border-neutral-200/60 relative">
            <div className="w-full max-w-[380px] aspect-[3/4] bg-white rounded-2xl shadow-xl overflow-hidden border border-neutral-200 relative group transition-all">
              {previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt="QR Card Preview"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-neutral-400">
                  Generating Preview...
                </div>
              )}
            </div>
            <p className="text-[11px] text-neutral-400 mt-3 font-medium text-center">
              Preview shown scaled down. Output JPG is 1200 × 1600 px (300 DPI print-ready).
            </p>
          </div>

        </div>

        {/* Hidden full-res canvas used for rendering and export */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  )
}
