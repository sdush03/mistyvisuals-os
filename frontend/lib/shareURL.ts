/**
 * Reusable Share & Invite URL Generator for Misty Visuals Galleries
 */

export interface ShareGalleryData {
  id?: number | string
  slug: string
  title: string
  crmName?: string | null
  passcode?: string | null
  partialPasscode?: string | null
  eventDate?: string | null
  coverPhotoUrl?: string | null
}

export type AccessTier = 'partial' | 'full'

/**
 * Returns the correct base domain for the public gallery (MyCircle)
 */
export function getGalleryDomain(): string {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin
    if (
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('192.168.') ||
      origin.includes('0.0.0.0')
    ) {
      return origin
    }
  }
  return 'https://mycircle.mistyvisuals.com'
}

/**
 * Generates the clean MyCircle gallery URL with access query code if present
 */
export function buildGalleryUrl(slug: string, code?: string | null): string {
  const domain = getGalleryDomain()
  const cleanSlug = (slug || '').trim()
  const query = code && code.trim() ? `?code=${encodeURIComponent(code.trim())}` : ''
  return `${domain}/${cleanSlug}/gallery${query}`
}

/**
 * Generates ready-to-send WhatsApp / text messages for Partial and Full tiers
 */
export function buildInviteMessage(data: ShareGalleryData, tier: AccessTier): string {
  const coupleName = data.crmName || data.title || 'the wedding'
  const isPartial = tier === 'partial'
  const code = isPartial ? data.partialPasscode : data.passcode
  const link = buildGalleryUrl(data.slug, code)

  if (isPartial) {
    return `*Misty Visuals* is inviting you to join the wedding gallery for *${coupleName}*!\n\n✨ Get your own photos instantly using Face Recognition!\n\n📲 Join via Link:\n${link}${code ? `\n\n🔑 Access Code: ${code}` : ''}`
  }

  return `*Misty Visuals* is inviting you to join the wedding gallery for *${coupleName}*!\n\n📸 Access all photos, full ceremony albums, and films in full resolution.\n\n📲 Join via Link:\n${link}${code ? `\n\n🔑 Passcode: ${code}` : ''}`
}

/**
 * Helper to copy text to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to legacy execCommand
    }
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'absolute'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(el)
    return successful
  } catch {
    return false
  }
}
