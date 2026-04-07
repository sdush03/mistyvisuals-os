export type ImageCompressionOptions = {
  maxDimension: number
  quality?: number
  outputType?: 'image/jpeg' | 'image/webp'
}

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })

export const compressImageToDataUrl = async (
  file: File,
  { maxDimension, quality = 0.82, outputType = 'image/jpeg' }: ImageCompressionOptions
) => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload an image file.')
  }

  const originalDataUrl = await readFileAsDataUrl(file)
  const img = await loadImage(originalDataUrl)

  const maxDim = Math.max(img.width, img.height)
  const scale = maxDim > maxDimension ? maxDimension / maxDim : 1
  const targetWidth = Math.max(1, Math.round(img.width * scale))
  const targetHeight = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Unable to process image.')
  }
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

  const dataUrl = canvas.toDataURL(outputType, quality)
  const baseName = file.name.replace(/\.[^.]+$/, '')
  const extension = outputType === 'image/webp' ? '.webp' : '.jpg'

  return {
    dataUrl,
    filename: `${baseName}${extension}`,
  }
}

export const estimateBase64Bytes = (dataUrl: string) => {
  const commaIdx = dataUrl.indexOf(',')
  if (commaIdx === -1) return 0
  const base64 = dataUrl.slice(commaIdx + 1)
  return Math.floor((base64.length * 3) / 4)
}
