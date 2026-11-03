'use client'

export interface UploadMediaOptions {
  slug: string
  file: File | Blob
  section: 'family' | 'photography' | 'videography' | 'invitations'
  isVideo?: boolean
  onProgress?: (percent: number) => void
}

export interface UploadResult {
  fileUrl: string
  storageKey: string
}

/**
 * Compresses an image in the browser before upload to minimize transfer time
 * and R2 storage costs while retaining high visual fidelity.
 */
async function compressImageClientSide(blob: Blob | File): Promise<Blob> {
  // Pass through if not a standard compressible image format
  const mime = blob.type.toLowerCase()
  if (!mime.startsWith('image/') || mime.includes('svg') || mime.includes('gif')) {
    return blob
  }

  // If already under 800KB and small, don't re-compress aggressively
  if (blob.size < 800 * 1024) {
    return blob
  }

  return new Promise<Blob>((resolve) => {
    try {
      const img = new Image()
      const url = URL.createObjectURL(blob)

      img.onload = () => {
        URL.revokeObjectURL(url)
        const maxDim = 2400
        let { width, height } = img

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          resolve(blob)
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (compressedBlob) => {
            if (compressedBlob && compressedBlob.size < blob.size) {
              resolve(compressedBlob)
            } else {
              resolve(blob)
            }
          },
          'image/jpeg',
          0.85
        )
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(blob)
      }

      img.src = url
    } catch {
      resolve(blob)
    }
  })
}

/**
 * Uploads media directly to Cloudflare R2 using a short-lived presigned PUT URL.
 * Automatically falls back to local upload endpoint in local development environments.
 */
export async function uploadMediaToR2(opts: UploadMediaOptions): Promise<UploadResult> {
  const { slug, file, section, isVideo = false, onProgress } = opts

  if (onProgress) onProgress(5)

  // 1. Client-side compression for images
  let uploadBlob: Blob = file
  if (!isVideo && (file.type.startsWith('image/') || (file instanceof File && /\.(jpe?g|png|webp)$/i.test(file.name)))) {
    try {
      uploadBlob = await compressImageClientSide(file)
    } catch {
      uploadBlob = file
    }
  }

  if (onProgress) onProgress(15)

  const filename = file instanceof File ? file.name : `upload_${Date.now()}.jpg`
  const mimeType = uploadBlob.type || (isVideo ? 'video/mp4' : 'image/jpeg')

  // 2. Request scoped presigned upload URL from backend
  const presignRes = await fetch(`/api/client-portal/${slug}/questionnaire/presigned-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      section,
      filename,
      mimeType,
      isVideo
    })
  })

  if (!presignRes.ok) {
    const errData = await presignRes.json().catch(() => ({}))
    throw new Error(errData.error || 'Failed to prepare upload destination')
  }

  const presignData = await presignRes.json()

  // 3. Direct browser-to-R2 upload via presigned URL
  if (presignData.uploadUrl) {
    return new Promise<UploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', presignData.uploadUrl, true)
      xhr.setRequestHeader('Content-Type', mimeType)

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && onProgress) {
          const pct = Math.round(15 + (evt.loaded / evt.total) * 80)
          onProgress(pct)
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) onProgress(100)
          resolve({
            fileUrl: presignData.fileUrl || presignData.publicUrl,
            storageKey: presignData.storageKey
          })
        } else {
          reject(new Error(`Direct storage upload failed with status ${xhr.status}`))
        }
      }

      xhr.onerror = () => {
        reject(new Error('Network error during file upload to storage'))
      }

      xhr.send(uploadBlob)
    })
  }

  // 4. Local fallback upload for dev server without R2 credentials
  const formData = new FormData()
  formData.append('file', uploadBlob, filename)

  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/client-portal/${slug}/questionnaire/upload-local?section=${section}`, true)
    xhr.withCredentials = true

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        const pct = Math.round(15 + (evt.loaded / evt.total) * 80)
        onProgress(pct)
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText)
          if (onProgress) onProgress(100)
          resolve({
            fileUrl: res.fileUrl,
            storageKey: res.storageKey
          })
        } catch {
          reject(new Error('Invalid response from upload server'))
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    }

    xhr.onerror = () => {
      reject(new Error('Network error during file upload'))
    }

    xhr.send(formData)
  })
}
