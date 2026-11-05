/**
 * Smart Face Detection and 1:1 Portrait Cropping Utility
 * 
 * Automatically detects the face area in selfies and portraits using:
 * 1. Native browser Shape Detection API (window.FaceDetector) where supported (Chrome, Edge, Android WebView).
 * 2. High-speed client-side skin-tone & facial saliency clustering (YCbCr + upper-body spatial prior)
 *    as a universal zero-dependency fallback for Safari, iOS, and Firefox.
 * 3. Intelligent portrait framing fallback (framing top 20-30% headshot zone rather than the tummy/torso).
 */

export interface SmartCropBox {
  x: number // percentage 0 - 100
  y: number // percentage 0 - 100
  width: number // percentage 0 - 100
  height: number // percentage 0 - 100
  aspect: '1:1'
  faceDetected: boolean
}

/**
 * Calculates percentage coordinates for an exact 1:1 square in natural image pixels.
 */
function calculateSquareBox(
  targetCenterX: number,
  targetCenterY: number,
  squarePx: number,
  naturalWidth: number,
  naturalHeight: number,
  faceDetected: boolean
): SmartCropBox {
  // Square dimension in pixels must not exceed either image dimension
  const maxAllowedDim = Math.min(naturalWidth, naturalHeight)
  const finalSquarePx = Math.max(20, Math.min(maxAllowedDim, Math.round(squarePx)))

  // Calculate left and top in pixels
  let leftPx = Math.round(targetCenterX - finalSquarePx / 2)
  let topPx = Math.round(targetCenterY - finalSquarePx / 2)

  // Clamp within image bounds
  if (leftPx < 0) leftPx = 0
  if (topPx < 0) topPx = 0
  if (leftPx + finalSquarePx > naturalWidth) leftPx = naturalWidth - finalSquarePx
  if (topPx + finalSquarePx > naturalHeight) topPx = naturalHeight - finalSquarePx

  // Convert to percentages (0 - 100)
  const cropX = Math.round((leftPx / naturalWidth) * 1000) / 10
  const cropY = Math.round((topPx / naturalHeight) * 1000) / 10
  const cropW = Math.round((finalSquarePx / naturalWidth) * 1000) / 10
  const cropH = Math.round((finalSquarePx / naturalHeight) * 1000) / 10

  return {
    x: Math.max(0, Math.min(100 - cropW, cropX)),
    y: Math.max(0, Math.min(100 - cropH, cropY)),
    width: cropW,
    height: cropH,
    aspect: '1:1',
    faceDetected
  }
}

/**
 * Analyzes an image source and calculates an optimal 1:1 square crop box focused on the face.
 */
export async function detectFaceAndSmartCrop(
  source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
): Promise<SmartCropBox> {
  const naturalWidth = (source as HTMLImageElement).naturalWidth || (source as HTMLVideoElement).videoWidth || source.width || 640
  const naturalHeight = (source as HTMLImageElement).naturalHeight || (source as HTMLVideoElement).videoHeight || source.height || 640

  if (!naturalWidth || !naturalHeight) {
    return { x: 25, y: 10, width: 50, height: 50, aspect: '1:1', faceDetected: false }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LEVEL 1: Native browser FaceDetector (Chromium, Chrome on Android, etc.)
  // ──────────────────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined' && 'FaceDetector' in window) {
    try {
      const FaceDetectorCtor = (window as any).FaceDetector
      const detector = new FaceDetectorCtor({ fastMode: false, maxDetectedFaces: 5 })
      const faces = await detector.detect(source)

      if (faces && faces.length > 0) {
        // Pick the largest/most prominent face (for bride/groom portrait)
        let bestFace = faces[0]
        let maxArea = 0
        for (const f of faces) {
          const area = (f.boundingBox?.width || 0) * (f.boundingBox?.height || 0)
          if (area > maxArea) {
            maxArea = area
            bestFace = f
          }
        }

        const b = bestFace.boundingBox
        if (b && b.width > 0 && b.height > 0) {
          const faceCenterX = b.x + b.width / 2
          const faceCenterY = b.y + b.height / 2
          const faceDim = Math.max(b.width, b.height)

          // Frame as a portrait headshot: ~2.0x face size, slightly raised so eyes align with upper third
          let squarePx = faceDim * 2.1
          const minSquare = Math.min(naturalWidth, naturalHeight) * 0.35
          const maxSquare = Math.min(naturalWidth, naturalHeight) * 0.95
          squarePx = Math.max(minSquare, Math.min(maxSquare, squarePx))

          const targetCenterX = faceCenterX
          const targetCenterY = faceCenterY - (faceDim * 0.12) // Slightly higher for hair/headroom

          return calculateSquareBox(targetCenterX, targetCenterY, squarePx, naturalWidth, naturalHeight, true)
        }
      }
    } catch {
      // Fall through to Level 2 canvas analyzer
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LEVEL 2: Client-side Skin Tone & Facial Saliency Analyzer (Canvas YCbCr)
  // Highly effective across all browsers (Safari iOS, macOS Safari, Firefox)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const scanSize = 160
    const canvas = document.createElement('canvas')
    canvas.width = scanSize
    canvas.height = scanSize
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    if (ctx) {
      ctx.drawImage(source, 0, 0, scanSize, scanSize)
      const imgData = ctx.getImageData(0, 0, scanSize, scanSize)
      const data = imgData.data

      let skinCount = 0
      let totalWeight = 0
      let weightedX = 0
      let weightedY = 0

      // Only scan the upper 65% of the frame (faces in portraits/selfies are in upper body)
      const maxY = Math.floor(scanSize * 0.65)
      for (let py = 0; py < maxY; py++) {
        const normY = py / scanSize
        // Heavy vertical prior: favor 12% - 48% (the head/face zone), penalize lower torso
        let vertWeight = 1.0
        if (normY >= 0.12 && normY <= 0.48) {
          vertWeight = 3.0
        } else if (normY < 0.12) {
          vertWeight = 1.5
        } else {
          vertWeight = 0.4
        }

        for (let px = 0; px < scanSize; px++) {
          const idx = (py * scanSize + px) * 4
          const r = data[idx]
          const g = data[idx + 1]
          const b = data[idx + 2]

          // Convert RGB to YCbCr
          const y = 0.299 * r + 0.587 * g + 0.114 * b
          const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
          const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b

          // Universal skin range clustering
          if (y > 35 && cb >= 77 && cb <= 130 && cr >= 132 && cr <= 178 && r > g && g > b * 0.75) {
            skinCount++
            weightedX += px * vertWeight
            weightedY += py * vertWeight
            totalWeight += vertWeight
          }
        }
      }

      // If a distinct face/skin cluster is detected
      if (skinCount >= 20 && totalWeight > 0) {
        const normCenterX = (weightedX / totalWeight) / scanSize
        const normCenterY = (weightedY / totalWeight) / scanSize

        const targetCenterX = normCenterX * naturalWidth
        const targetCenterY = normCenterY * naturalHeight

        // Headshot square size
        let squarePx = Math.min(naturalWidth, naturalHeight) * 0.65
        if (naturalHeight > naturalWidth) {
          // Vertical phone portrait: headshot is ~60-70% of photo width
          squarePx = naturalWidth * 0.68
        }

        return calculateSquareBox(targetCenterX, targetCenterY, squarePx, naturalWidth, naturalHeight, true)
      }
    }
  } catch {
    // Fall through to Level 3 prior
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LEVEL 3: Intelligent Portrait Prior (Universal Fallback)
  // Ensures the crop focuses on the upper 25% face area, never the tummy/torso
  // ──────────────────────────────────────────────────────────────────────────
  if (naturalHeight > naturalWidth) {
    // Tall portrait: face is near upper center (y ≈ 25% down, NOT 50% tummy)
    const targetCenterX = naturalWidth * 0.5
    const targetCenterY = naturalHeight * 0.26
    const squarePx = naturalWidth * 0.72
    return calculateSquareBox(targetCenterX, targetCenterY, squarePx, naturalWidth, naturalHeight, false)
  } else {
    // Landscape or square photo
    const targetCenterX = naturalWidth * 0.5
    const targetCenterY = naturalHeight * 0.35
    const squarePx = naturalHeight * 0.75
    return calculateSquareBox(targetCenterX, targetCenterY, squarePx, naturalWidth, naturalHeight, false)
  }
}

/**
 * Takes a File (e.g. from file picker or camera) and crops it to a clean 1:1 square
 * centered on the face, returning an optimized 1:1 JPEG File.
 */
export async function smartCropImageFile(
  file: File,
  maxOutputDimension = 900,
  quality = 0.88
): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const img = new Image()
      img.onload = async () => {
        try {
          const natW = img.naturalWidth
          const natH = img.naturalHeight
          if (!natW || !natH) return resolve(file)

          // 1. Detect face and get 1:1 crop box
          const cropBox = await detectFaceAndSmartCrop(img)

          // 2. Convert crop percentage box to pixel coordinates
          const pixelX = Math.round((cropBox.x / 100) * natW)
          const pixelY = Math.round((cropBox.y / 100) * natH)
          const pixelW = Math.round((cropBox.width / 100) * natW)
          const pixelH = Math.round((cropBox.height / 100) * natH)

          const squareDim = Math.min(pixelW, pixelH)
          const outputSize = Math.min(maxOutputDimension, squareDim)

          // 3. Render 1:1 cropped square
          const canvas = document.createElement('canvas')
          canvas.width = outputSize
          canvas.height = outputSize
          const ctx = canvas.getContext('2d')

          if (!ctx) return resolve(file)

          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, pixelX, pixelY, squareDim, squareDim, 0, 0, outputSize, outputSize)

          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(file)
              const cleanName = file.name.replace(/\.[^/.]+$/, '') + '_1x1.jpg'
              const croppedFile = new File([blob], cleanName, {
                type: 'image/jpeg',
                lastModified: Date.now()
              })
              resolve(croppedFile)
            },
            'image/jpeg',
            quality
          )
        } catch {
          resolve(file)
        }
      }
      img.onerror = () => resolve(file)
      img.src = e.target?.result as string
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}
