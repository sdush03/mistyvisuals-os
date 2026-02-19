type PhotoCache = {
  url: string | null
  ts: number
  promise: Promise<string | null> | null
}

const CACHE_TTL_MS = 5 * 60 * 1000

const getCache = (): PhotoCache => {
  if (typeof window === 'undefined') {
    return { url: null, ts: 0, promise: null }
  }
  const w = window as typeof window & { __MV_PHOTO_CACHE__?: PhotoCache }
  if (!w.__MV_PHOTO_CACHE__) {
    w.__MV_PHOTO_CACHE__ = { url: null, ts: 0, promise: null }
  }
  return w.__MV_PHOTO_CACHE__
}

export async function getProfilePhotoUrl(options: { force?: boolean } = {}): Promise<string | null> {
  const cache = getCache()
  const now = Date.now()

  if (!options.force && cache.url && now - cache.ts < CACHE_TTL_MS) {
    return cache.url
  }

  if (!options.force && cache.promise) {
    return cache.promise
  }

  const promise = fetch('/api/auth/profile-photo', { credentials: 'include' })
    .then(async res => {
      if (!res.ok) return null
      const blob = await res.blob()
      if (!blob || blob.size === 0) return null
      const nextUrl = URL.createObjectURL(blob)
      return nextUrl
    })
    .catch(() => null)
    .finally(() => {
      const fresh = getCache()
      fresh.promise = null
    })

  cache.promise = promise
  const nextUrl = await promise
  if (nextUrl) {
    if (cache.url) {
      URL.revokeObjectURL(cache.url)
    }
    cache.url = nextUrl
    cache.ts = Date.now()
  }
  return nextUrl
}

export function clearProfilePhotoCache() {
  const cache = getCache()
  if (cache.url) {
    URL.revokeObjectURL(cache.url)
  }
  cache.url = null
  cache.ts = 0
  cache.promise = null
}
