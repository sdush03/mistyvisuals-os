'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { SignaturePad } from './SignaturePad'

type AgreementOverlayProps = {
  open: boolean
  onClose: () => void
  onAcceptAndPay: (signatureName?: string, signatureImage?: string, signatureImageDark?: string) => void
  accepting?: boolean
  snapshot: any
  draftData: any
  totalPrice: number
  selectedTierId?: string
  token?: string
  readOnly?: boolean
  isRevision?: boolean
  paymentUrl?: string | null
}

/**
 * Normalize a personalized event name back to its base type.
 * "Priya's Haldi" → "Haldi"
 * "Raj & Priya's Sangeet" → "Sangeet"
 * If the event has an originalType, prefer that.
 */
function normalizeEventName(ev: any): string {
  // If we have the original event type stored, use it (strip the "(Bride)"/"(Groom)" suffix)
  if (ev.originalType) {
    return ev.originalType.replace(/\s*\([^)]*\)/gi, '').trim()
  }
  const name = (ev.name || 'Event').trim()
  // Strip "Name's " prefix: "Priya's Haldi" → "Haldi"
  const match = name.match(/^.+?'s\s+(.+)$/i)
  if (match) return match[1].trim()
  return name
}

export default function AgreementOverlay({
  open,
  onClose,
  onAcceptAndPay,
  accepting = false,
  snapshot,
  draftData,
  totalPrice,
  selectedTierId,
  token,
  readOnly = false,
  isRevision = false,
  paymentUrl = null,
}: AgreementOverlayProps) {
  const [agreed, setAgreed] = useState(readOnly)
  const [signatureName, setSignatureName] = useState('')
  const [hasSignature, setHasSignature] = useState(false)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [signatureDataDark, setSignatureDataDark] = useState<string | null>(null)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [viewingBankDetails, setViewingBankDetails] = useState(false)
  const [notifyingTransfer, setNotifyingTransfer] = useState(false)
  const [transferSuccess, setTransferSuccess] = useState(false)

  const [showQrInModal, setShowQrInModal] = useState(false)
  const [copiedBankDetails, setCopiedBankDetails] = useState(false)
  const [screenshotUrl, setScreenshotUrl] = useState('')
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false)
  const [uploadingProofStep, setUploadingProofStep] = useState(false)

  useEffect(() => {
    if (!open) {
      setAgreed(false)
      setSignatureName('')
      setHasSignature(false)
      setShowQrInModal(false)
      setCopiedBankDetails(false)
      setScreenshotUrl('')
      setUploadingScreenshot(false)
      setUploadingProofStep(false)
    }
  }, [open])

  if (!open) return null

  // Extract data for agreement
  const draft = draftData || {}
  const hero = draft.hero || {}
  const bride = (hero.brideName || hero.bride_name || draft.brideName || draft.bride_name || '').trim()
  const groom = (hero.groomName || hero.groom_name || draft.groomName || draft.groom_name || '').trim()
  const leadName = (hero.leadName || hero.lead_name || draft.leadName || draft.lead_name || '').trim()
  const coupleNames = (hero.coupleNames || hero.couple_names || draft.coupleNames || draft.couple_names || '').trim()
  const clientName = coupleNames || (bride && groom ? `${bride} & ${groom}` : leadName) || 'Client'

  const paymentSchedule = draft.paymentSchedule || []
  const events = Array.isArray(draft.events) ? [...draft.events] : []
  events.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const pricingItems = draft.pricingItems || []
  const deliverables = pricingItems.filter((i: any) => i.itemType === 'DELIVERABLE')

  const tiers = draft.tiers || []
  const activeTier = selectedTierId
    ? tiers.find((t: any) => t.id === selectedTierId)
    : tiers.find((t: any) => t.isPopular) || tiers[0]
  const tierName = activeTier?.name || 'Essential'

  const formatINR = (v: number) => '₹' + v.toLocaleString('en-IN')

  // Original price (before discount)
  const originalPrice = Number(activeTier?.overridePrice ?? activeTier?.price ?? totalPrice)
  // Discounted price (if any)
  const hasDiscount = activeTier?.discountedPrice != null && activeTier?.discountedPrice > 0
  const discountedPrice = hasDiscount ? Number(activeTier.discountedPrice) : null
  const finalPrice = hasDiscount ? Number(activeTier.discountedPrice) : originalPrice
  
  const firstMilestone = Array.isArray(draft.paymentSchedule) && draft.paymentSchedule.length > 0
    ? draft.paymentSchedule[0]
    : { label: 'Advance', percentage: 25 }
  const advancePercent = Number(firstMilestone.percentage) || 25
  const advanceBase = Math.round(finalPrice * (advancePercent / 100))
  const netBookingFee = Math.round(advanceBase * 1.18) // Base + 18% GST
  const convenienceFee = Math.round(netBookingFee * 0.02)
  const gstOnConvenienceFee = Math.round(convenienceFee * 0.18)
  const razorpayTotal = netBookingFee + convenienceFee + gstOnConvenienceFee

  const dateObj = draft.agreementSignedAt ? new Date(draft.agreementSignedAt) : new Date()
  const todayStr = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  const fmtDate = (d: string) => {
    if (!d) return '—'
    if (d.startsWith('2099-01-01') || d.includes('2099-01-01')) return 'TBD'
    const parsed = new Date(d)
    if (Number.isNaN(parsed.getTime())) return d
    
    const y = parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' })
    const m = parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', month: '2-digit' })
    const day = parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', day: '2-digit' })
    if (`${y}-${m}-${day}` === '2099-01-01') return 'TBD'

    return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-[9999] bg-neutral-950 flex flex-col overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between shrink-0 border-b border-white/[0.06]">
        <div>
          <h2 className="text-[14px] font-black text-white tracking-wide">
            {readOnly ? 'Signed Agreement' : isRevision ? 'Revised Service Agreement' : 'Service Agreement'}
          </h2>
          <p className="text-[9px] text-white/35 mt-0.5 font-mono">
            {readOnly ? 'Proposal Accepted & Active' : 'Review terms before proceeding'}
          </p>
        </div>
        {!readOnly && !isRevision && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose() }}
            className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      {/* Scrollable Terms */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 no-scrollbar"
        style={{ scrollbarWidth: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Identification */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5">
          <div className="text-[8px] uppercase tracking-[0.2em] text-white/25 font-bold mb-2.5">Parties</div>
          <div className="grid gap-1.5 text-[11px]">
            <Row label="Provider" value="Misty Visuals Pvt Ltd" />
            <Row label="GSTIN" value="06AANCM7903Q1ZQ" />
            <Row label="Client" value={clientName} />
            <Row label="Package" value={`${tierName} Experience`} />
            <Row label="Total Value" value={<>{formatINR(originalPrice)} <span className="text-white/30 text-[9px]">+ GST</span></>} />
            {hasDiscount && discountedPrice && (
              <Row label="After Discount" value={<>{formatINR(discountedPrice)} <span className="text-white/30 text-[9px]">+ GST</span></>} />
            )}
            <Row label="Date" value={todayStr} />
          </div>
        </div>

        {/* Events Table */}
        {events.length > 0 && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5">
            <div className="text-[8px] uppercase tracking-[0.2em] text-white/25 font-bold mb-2.5">Event Schedule</div>
            <div className="space-y-0">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1.4fr_1.5fr] gap-x-2 pb-1.5 border-b border-white/[0.06]">
                <div className="text-[9px] text-white/30 font-semibold">Date</div>
                <div className="text-[9px] text-white/30 font-semibold">Event Details</div>
                <div className="text-[9px] text-white/30 font-semibold">Team</div>
              </div>
              {/* Rows */}
              {events.map((ev: any, i: number) => {
                const teamLines = buildTeamLines(ev, pricingItems)
                return (
                  <div key={i} className="grid grid-cols-[1fr_1.4fr_1.5fr] gap-x-2 py-2 border-b border-white/[0.03]">
                    <div>
                      <div className="text-[10px] text-white/70 font-medium">{fmtDate(ev.date)}</div>
                      {(ev.time || ev.slot) && <div className="text-[8px] text-white/30 mt-0.5 whitespace-nowrap">{ev.time || ev.slot}</div>}
                    </div>
                    <div>
                      <div className="text-[10px] text-white/80 font-bold">{normalizeEventName(ev)}</div>
                      <div className="text-[10px] text-white/50 mt-0.5">{ev.location || ev.venue || '—'}</div>
                      {(ev.pax || ev.guestCount) ? <div className="text-[9px] text-white/30 mt-0.5">{ev.pax || ev.guestCount} pax</div> : null}
                    </div>
                    <div className="space-y-0.5">
                      {teamLines.map((line, li) => (
                        <div key={li} className="text-[8px] text-white/60 leading-snug">{line}</div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Deliverables Included */}
        {deliverables.length > 0 && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5">
            <div className="text-[8px] uppercase tracking-[0.2em] text-white/25 font-bold mb-2.5">Deliverables Included</div>
            <div className="space-y-1.5 text-[11px]">
              {deliverables.map((d: any, i: number) => {
                const rawLabel = d.name || d.label || String(d)
                const qty = Number(d.quantity || 1)
                const plural = qty > 1 && !rawLabel.endsWith('s') ? rawLabel + 's' : rawLabel
                const displayLabel = qty > 1 ? `${qty} ${plural}` : rawLabel
                return (
                  <div key={i} className="flex justify-between items-center border-b border-white/[0.03] pb-1.5 last:border-0 last:pb-0">
                    <span className="text-white/80">{displayLabel}</span>
                    {d.deliveryTimeline && <span className="text-white/40 text-[10px] italic">{d.deliveryTimeline}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Payment Schedule */}
        {paymentSchedule.length > 0 && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5">
            <div className="text-[8px] uppercase tracking-[0.2em] text-white/25 font-bold mb-2.5">Payment Structure</div>
            <div className="space-y-1.5 text-[11px]">
              {paymentSchedule.map((s: any, i: number) => (
                <div key={i} className="flex justify-between">
                  <span className="text-white/50">{s.label}</span>
                  <span className="text-white/80 font-semibold">{s.percentage}%</span>
                </div>
              ))}
              <div className="mt-2 pt-2 border-t border-white/[0.04] text-[10px] text-white/35 leading-relaxed">
                Venue day payment must be completed on the first day of the event. Late payments will delay delivery.
              </div>
            </div>
          </div>
        )}

        {/* Terms & Conditions */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5">
          <div className="text-[8px] uppercase tracking-[0.2em] text-white/25 font-bold mb-3">Terms & Conditions</div>
          <div className="space-y-3">
            {(draft.agreementTerms && Array.isArray(draft.agreementTerms)) ? (
              /* Render snapshotted terms — legally locked at signing time */
              draft.agreementTerms.map((term: any) => (
                <TermInline key={term.n} n={term.n} title={term.title}>
                  {term.items.map((item: string, i: number) => (
                    <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
                  ))}
                </TermInline>
              ))
            ) : (
              /* Fallback: hardcoded terms for unsigned previews */
              <>
            <TermInline n="1" title="Cancellation Policy">
              <li>The advance booking amount secures your date exclusively for you and is non-refundable upon cancellation.</li>
              <li>Should we need to cancel due to a severe medical emergency on our end, a full refund will be issued without question.</li>
              <li>In the rare event of circumstances beyond anyone's control, we will always work towards a fair resolution together.</li>
            </TermInline>

            <TermInline n="2" title="Rescheduling">
              <li>One reschedule is permitted, provided we receive at least <b>120 days' notice</b> before the original event date and the new date is available with us.</li>
              <li>Any previously applied discounts will not carry forward — the pricing applicable at the time of rescheduling will apply.</li>
            </TermInline>

            <TermInline n="3" title="Deliverables & Timeline">
              <li>During the wedding season (Oct–Mar), there may be a slight delay compared to our standard timelines owing to high booking volume. Rest assured, we'll always keep you in the loop.</li>
              <li>Raw footage will be handed over only after the final payment has been cleared.</li>
            </TermInline>

            <TermInline n="4" title="Creative Vision">
              <li>Our films are crafted in a signature cinematic style — that's the aesthetic you fell in love with, and that's what we'll bring to your story.</li>
              <li>We do not share project files for third-party re-editing. We trust you'll trust us with the creative process.</li>
              <li>The production house reserves the right to use work for its portfolio and marketing. If you'd prefer to keep things private, please let us know before the event.</li>
            </TermInline>

            <TermInline n="5" title="Editing & Music">
              <li>Up to 2–3 minor revisions are included at no extra cost. Further changes beyond this scope may be chargeable depending on the nature of the request.</li>
              <li>The sooner you share revision requests, the sooner we can turn them around. Delays on your end will naturally push timelines.</li>
              <li>Music is selected by our editors based on what best complements your story. If you have something in mind, share it with us <b>before</b> editing begins — changes requested after the edit has started may incur additional charges.</li>
            </TermInline>

            <TermInline n="6" title="Equipment & Lasers">
              <li>Laser lights at venues can cause permanent and irreversible damage to camera sensors. If lasers are active during the event, our team will pause coverage to protect the equipment.</li>
              <li>Any damage to our equipment caused by lasers or other hazards at the venue will be the financial responsibility of the client.</li>
            </TermInline>

            <TermInline n="7" title="Team & Coverage Hours">
              <li>The team composition will be as per your quotation. Our production house reserves the right to assign specific team members based on availability and event requirements.</li>
              <li>Our coverage is planned around your pre-confirmed event schedule. If the event runs beyond the agreed hours, continued coverage will be subject to team availability and will be billed at applicable rates.</li>
            </TermInline>

            <TermInline n="8" title="Client Responsibilities">
              <li><b>Meals:</b> A well-fed team is a creative team. Kindly ensure our crew is provided hot meals at the venue — the same as your guests.</li>
              <li><b>Outstation Events:</b> For destination weddings, travel and accommodation for our crew are to be arranged and borne by the client.</li>
              <li><b>Drone Permissions:</b> Any permits or authorisations required for drone operation at your venue are the client's responsibility to obtain.</li>
              <li><b>Timing & Coverage Scope:</b> Our coverage includes getting ready, decor, couple portraits, family portraits, event proceedings, baarat, rituals, and scheduled interviews — as per the itinerary shared with us. Late starts, extended makeup sessions, or last-minute schedule changes may limit what we are able to capture. Please share a detailed itinerary in advance. Moments missed due to factors outside our control — venue restrictions, timing shifts, or access limitations — cannot be held against us.</li>
            </TermInline>

            <TermInline n="9" title="Conduct & Safety">
              <li>Our team will always treat you and your family with the utmost respect and warmth. We expect the same in return. Any form of harassment or misconduct towards our team members will result in an immediate halt to the shoot, with no refund obligations.</li>
              <li>Any damage to our equipment caused by guests will be charged at MRP.</li>
            </TermInline>

            <TermInline n="10" title="Liability">
              <li>Our production house cannot be held responsible for moments missed due to venue restrictions, access limitations, instructions from officiants at religious ceremonies (temples, gurudwaras, churches, etc.), or situations where family members or guests restrict or obstruct our team from capturing a moment.</li>
              <li>In the rare and unfortunate event of technical failure — such as camera malfunction, memory card error, or data loss during processing — our liability shall be limited to the total value of your contract. We maintain backup equipment and follow strict protocols to minimise risk, but cannot guarantee against every unforeseen circumstance.</li>
            </TermInline>

            <TermInline n="11" title="Colour & Print Variance">
              <li>Photography and videography are influenced by lighting, digital sensor behaviour, and post-processing. As a result, colours may appear slightly different across different photographs or devices — this is natural and expected.</li>
              <li>Prints produced at different labs, sizes, or times may vary in colour balance. Images on your monitor may not perfectly match printed output due to screen calibration differences.</li>
            </TermInline>

            <TermInline n="12" title="Data Archival">
              <li>We retain your raw footage for <b>30 days</b> following the delivery of your final films. After this period, files may be permanently deleted.</li>
              <li>We strongly encourage you to create your own backups as soon as files are delivered. Indefinite storage is not something we can guarantee.</li>
            </TermInline>

            <TermInline n="13" title="Governing Law">
              <li>This agreement is governed by the laws of India. Any disputes arising from this contract shall fall under the jurisdiction of courts in Gurgaon, Haryana.</li>
              <li>This agreement supersedes and replaces all prior verbal or written understandings between the parties.</li>
            </TermInline>
              </>
            )}

            {/* Special Conditions — per-client custom terms */}
            {draft.additionalTerms && Array.isArray(draft.additionalTerms) && draft.additionalTerms.filter((t: string) => t.trim()).length > 0 && (
              <TermInline 
                 n={draft.agreementTerms ? String(draft.agreementTerms.length + 1) : "14"} 
                 title="Special Conditions"
              >
                 {draft.additionalTerms.filter((t: string) => t.trim()).map((term: string, i: number) => (
                   <li key={i}>{term}</li>
                 ))}
              </TermInline>
            )}
          </div>
        </div>

        {readOnly && (
          <div className="w-full rounded-xl py-4 flex flex-col items-center justify-center gap-2 mt-8 mb-4"
            style={{
              background: 'rgba(16,185,129,0.05)',
              border: '1px solid rgba(16,185,129,0.2)',
            }}>
            <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-[12px]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
              Agreement Accepted & Digitally Signed
            </div>
            
            {(draft.signatureImage || draft.signatureName) ? (
              <div className="mt-2 flex flex-col items-center border-t border-emerald-500/20 pt-3 w-full max-w-[200px]">
                {draft.signatureImage && (
                  <img src={draft.signatureImage} alt="Client Signature" className="h-16 object-contain opacity-80" />
                )}
                {draft.signatureName && (
                   <div className="text-[12px] text-emerald-400/80 font-serif italic mt-2">
                     By {draft.signatureName}
                   </div>
                )}
              </div>
            ) : (
              <div className="text-[10px] text-emerald-400/60 font-serif italic mt-2">
                By {clientName}
              </div>
            )}

            {token && (
              <a
                href={`/api/proposals/${token}/agreement-pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition"
                style={{
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  color: 'rgba(16,185,129,0.9)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(16,185,129,0.18)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(16,185,129,0.1)'
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3"/></svg>
                Download Agreement PDF
              </a>
            )}
          </div>
        )}

        {/* Bottom spacer for the fixed footer */}
        {(!readOnly || snapshot?.status !== 'ACCEPTED') && <div className="h-36" />}
      </div>

      {/* Footer: Checkbox + Signature + CTA — fixed at bottom */}
      {(!readOnly || snapshot?.status !== 'ACCEPTED') && (
        <div
          className="absolute bottom-0 left-0 right-0 px-5 py-3.5 border-t border-white/[0.06] space-y-2.5 bg-gradient-to-t from-black via-black/95 to-transparent pt-12"
          style={{ background: 'rgba(5,5,15,0.95)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!readOnly ? (
            <>
              {/* Checkbox */}
          <label
            className="flex items-start gap-2.5 cursor-pointer"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAgreed(!agreed) }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              className={`mt-0.5 w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                agreed ? 'bg-emerald-500 border-emerald-500' : 'border-white/20 hover:border-white/40'
              }`}
            >
              {agreed && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className="text-[10px] leading-relaxed text-white/50 select-none">
              I have read and agree to all terms and conditions above.
            </span>
          </label>

          {/* Signature Field */}
          {agreed && (
            <div className="animate-in fade-in slide-in-from-bottom-1 duration-200 space-y-3">
              <SignaturePad 
                hasSignature={hasSignature} 
                onDraw={(drawn, data, darkData) => {
                  setHasSignature(drawn)
                  if (data) setSignatureData(data)
                  if (darkData) setSignatureDataDark(darkData)
                }} 
              />
              <input
                type="text"
                placeholder="Type your full name to sign"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/50 font-serif italic"
              />
            </div>
          )}

          {/* Accept & Pay */}
          <button
            onClick={(e) => { e.stopPropagation(); onAcceptAndPay(signatureName, signatureData || undefined, signatureDataDark || undefined) }}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={!agreed || signatureName.trim().length < 2 || !hasSignature || accepting}
            className="w-full rounded-xl py-2.5 text-[13px] font-semibold flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-25 disabled:pointer-events-none"
            style={{
              background: 'rgba(16,185,129,0.2)',
              border: '1px solid rgba(16,185,129,0.4)',
              color: '#6ee7b7',
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
            {accepting ? 'Processing...' : isRevision ? 'I Agree — Sign Revised Agreement' : 'Accept & Book'}
          </button>
            </>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setShowPaymentModal(true); }}
              className="w-full rounded-xl py-3 text-[14px] font-bold flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-[0_4px_14px_rgba(16,185,129,0.4)]"
              style={{
                background: 'rgba(16,185,129,0.9)',
                color: '#fff',
              }}
            >
              Continue to Pay Advance
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
            </button>
          )}
        </div>
      )}

      {/* Payment Options Overlay Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-end justify-center p-4 md:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-neutral-950 border border-white/[0.08] p-5 space-y-5 animate-slide-up shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-white" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-white">Select Payment Method</h3>
                <p className="text-[10px] text-white/45 mt-0.5">{firstMilestone.label} ({advancePercent}%)</p>
                <div className="text-xs font-bold text-white/50 mt-2.5 uppercase tracking-wider">
                  Amount to be paid: <span className="text-xl font-black text-white ml-1 tracking-tight normal-case">₹{netBookingFee.toLocaleString('en-IN')}</span>
                </div>
              </div>
              <button 
                onClick={() => { setShowPaymentModal(false); setViewingBankDetails(false); setTransferSuccess(false); setShowQrInModal(false); setCopiedBankDetails(false); }} 
                className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/55 hover:text-white transition mt-0.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {!viewingBankDetails ? (
              <div className="space-y-4">
                {/* Razorpay Option */}
                <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="pr-2">
                      <span className="text-[8px] uppercase tracking-widest font-bold text-emerald-400">Instantly Confirmed</span>
                      <h4 className="text-sm font-semibold text-white/90 mt-0.5">Pay Online (Razorpay)</h4>
                      <p className="text-[10px] text-white/40 leading-relaxed mt-1">UPI, Cards, NetBanking. Includes 2% gateway + GST charges.</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-white">₹{netBookingFee.toLocaleString('en-IN')}</div>
                      <span className="text-[9px] text-white/35 block mt-0.5">+ Razorpay Processing Fee</span>
                    </div>
                  </div>
                  <button
                    disabled={generatingLink}
                    onClick={async (e) => {
                      e.stopPropagation()
                      setGeneratingLink(true)
                      try {
                        const res = await fetch(`/api/proposals/${token}/payment-link`, { method: 'POST' })
                        const data = await res.json()
                        if (data.paymentUrl) {
                          window.location.href = data.paymentUrl
                        } else {
                          alert('Could not generate payment link. Please try again.')
                          setGeneratingLink(false)
                        }
                      } catch {
                        alert('Could not generate payment link. Please try again.')
                        setGeneratingLink(false)
                      }
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] transition-all text-xs font-semibold flex items-center justify-center gap-2 text-white shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {generatingLink ? 'Redirecting to Razorpay…' : 'Proceed to Pay Online'}
                  </button>
                </div>

                {/* Bank Transfer Option (only shown if configured) */}
                {snapshot.bankDetails && snapshot.bankDetails.accountNumber && (
                  <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div className="pr-2">
                        <span className="text-[8px] uppercase tracking-widest font-bold text-neutral-400">Manual Verification</span>
                        <h4 className="text-sm font-semibold text-white/90 mt-0.5">Direct Bank Transfer or UPI</h4>
                        <p className="text-[10px] text-white/40 leading-relaxed mt-1">No extra gateway fees. Verify manually via WhatsApp/Email.</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-white">₹{netBookingFee.toLocaleString('en-IN')}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setViewingBankDetails(true)}
                      className="w-full py-2.5 rounded-xl border border-white/10 hover:bg-white/5 active:scale-[0.99] transition-all text-xs font-semibold text-white"
                    >
                      Show Bank & UPI Details
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {transferSuccess ? (
                  <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-5 text-center space-y-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
                    </div>
                    <h4 className="text-sm font-bold text-emerald-400">Verification Request Sent!</h4>
                    <p className="text-[11px] text-white/60 leading-relaxed">Our team has been notified. We will verify the transfer and confirm your booking within 12–24 hours.</p>
                    <button
                      onClick={() => { setShowPaymentModal(false); setViewingBankDetails(false); setTransferSuccess(false); setShowQrInModal(false); setCopiedBankDetails(false); }}
                      className="mt-2 px-4 py-1.5 bg-white/10 hover:bg-white/15 rounded-lg text-[10px] font-semibold transition"
                    >
                      Close Window
                    </button>
                  </div>
                ) : uploadingProofStep ? (
                  <>
                    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-5 space-y-4 text-center">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto text-emerald-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white/90">Share Payment Receipt</h4>
                        <p className="text-[11px] text-white/50 leading-relaxed mt-1">Please upload a screenshot of your bank transfer or UPI receipt to help us confirm your booking faster.</p>
                      </div>

                      <div className="space-y-2 text-left mt-2">
                        {screenshotUrl ? (
                          <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.01]">
                            <div className="flex items-center gap-2">
                              <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                              <span className="text-xs text-white/80 font-medium truncate max-w-[170px]">Screenshot Uploaded</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setScreenshotUrl('')}
                              className="text-[10px] text-rose-500 hover:text-rose-400 font-bold uppercase tracking-wider transition focus:outline-none"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingScreenshot}
                              onChange={async (e) => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                setUploadingScreenshot(true)
                                try {
                                  const reader = new FileReader()
                                  const dataUrlPromise = new Promise<string>((resolve, reject) => {
                                    reader.onload = () => resolve(reader.result as string)
                                    reader.onerror = reject
                                  })
                                  reader.readAsDataURL(file)
                                  const dataUrl = await dataUrlPromise
                                  
                                  const res = await fetch(`/api/proposals/${token}/upload-receipt`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ dataUrl, filename: file.name })
                                  })
                                  const data = await res.json()
                                  if (!res.ok) throw new Error(data.error || 'Failed to upload screenshot')
                                  setScreenshotUrl(data.fileUrl)
                                } catch (err: any) {
                                  alert(err.message || 'Error uploading file')
                                } finally {
                                  setUploadingScreenshot(false)
                                }
                              }}
                              className="w-full text-xs text-white/50 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-white/5 file:text-white/85 hover:file:bg-white/10 file:transition cursor-pointer file:cursor-pointer disabled:opacity-50"
                            />
                            {uploadingScreenshot && <div className="text-[10px] text-emerald-400 animate-pulse mt-1 text-center">Uploading receipt...</div>}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2.5 mt-4">
                      <button
                        onClick={() => { setUploadingProofStep(false); setScreenshotUrl(''); }}
                        className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs font-semibold text-white/70 hover:bg-white/5 hover:text-white transition"
                      >
                        Back
                      </button>
                      <button
                        disabled={notifyingTransfer || !screenshotUrl || uploadingScreenshot}
                        onClick={async () => {
                          setNotifyingTransfer(true)
                          try {
                            const res = await fetch(`/api/proposals/${token}/feedback`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ 
                                action: 'bank_transfer', 
                                reason: `Client notified bank transfer for ₹${netBookingFee.toLocaleString('en-IN')}`,
                                screenshotUrl: screenshotUrl
                              })
                            })
                            if (res.ok) {
                              setTransferSuccess(true)
                            } else {
                              alert('Error submitting confirmation request. Please contact support.')
                            }
                          } catch {
                            alert('Error submitting confirmation request. Please contact support.')
                          } finally {
                            setNotifyingTransfer(false)
                          }
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] transition-all text-xs font-semibold text-white shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                      >
                        {notifyingTransfer ? 'Submitting…' : "Submit & Confirm"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 space-y-3 text-xs leading-normal">
                      <div className="flex justify-between items-center pb-2 border-b border-white/[0.08] mb-1">
                        <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Bank Details</span>
                        <button
                          type="button"
                          onClick={() => {
                            const detailsText = `Bank Transfer & UPI Details:
Beneficiary: ${snapshot.bankDetails.accountName}
Bank Name: ${snapshot.bankDetails.bankName}
Account Number: ${snapshot.bankDetails.accountNumber}
IFSC Code: ${snapshot.bankDetails.ifscCode}
${snapshot.bankDetails.upiId ? `UPI ID: ${snapshot.bankDetails.upiId}` : ''}`.trim();
                            navigator.clipboard.writeText(detailsText);
                            setCopiedBankDetails(true);
                            setTimeout(() => setCopiedBankDetails(false), 2000);
                          }}
                          className="text-white/40 hover:text-white transition-colors flex items-center gap-1.5 focus:outline-none"
                          title="Copy details"
                        >
                          {copiedBankDetails ? (
                            <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Copied!</span>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/[0.03] gap-2">
                        <span className="text-white/40 shrink-0">Beneficiary</span>
                        <span className="font-semibold text-white/80 text-right">{snapshot.bankDetails.accountName}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/[0.03] gap-2">
                        <span className="text-white/40 shrink-0">Bank Name</span>
                        <span className="font-semibold text-white/80 text-right">{snapshot.bankDetails.bankName}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/[0.03] gap-2">
                        <span className="text-white/40 shrink-0">Account No.</span>
                        <span className="font-mono font-semibold text-white/80 select-all text-right">{snapshot.bankDetails.accountNumber}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-white/[0.03] gap-2">
                        <span className="text-white/40 shrink-0">IFSC Code</span>
                        <span className="font-mono font-semibold text-white/80 select-all text-right">{snapshot.bankDetails.ifscCode}</span>
                      </div>
                      {snapshot.bankDetails.upiId && (
                        <div className="flex justify-between py-1 gap-2">
                          <span className="text-white/40 shrink-0">UPI ID</span>
                          <span className="font-mono font-semibold text-white/80 select-all text-right">{snapshot.bankDetails.upiId}</span>
                        </div>
                      )}
                    </div>

                    {snapshot.bankDetails.qrCodeUrl && (
                      <div className="space-y-3 mt-1">
                        <button
                          type="button"
                          onClick={() => setShowQrInModal(prev => !prev)}
                          className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-xs font-semibold text-white/90 flex items-center justify-center gap-2"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          {showQrInModal ? 'Hide UPI QR Code' : 'Show UPI QR Code'}
                        </button>
                        
                        {showQrInModal && (
                          <div className="flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-2 bg-white rounded-xl shadow-inner flex items-center justify-center">
                              <img 
                                src={snapshot.bankDetails.qrCodeUrl} 
                                alt="UPI QR Code" 
                                className="w-32 h-32 object-contain"
                              />
                            </div>
                            <span className="text-[9px] text-white/40 font-bold mt-2.5 uppercase tracking-wider">Scan to Pay via UPI</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2.5 mt-4">
                      <button
                        onClick={() => { setViewingBankDetails(false); setShowQrInModal(false); }}
                        className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs font-semibold text-white/70 hover:bg-white/5 hover:text-white transition"
                      >
                        Back
                      </button>
                      <button
                        onClick={() => setUploadingProofStep(true)}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] transition-all text-xs font-semibold text-white shadow-lg shadow-emerald-500/20"
                      >
                        I've Made the Transfer
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="text-white/30 shrink-0 w-24">{label}</span>
      <span className="text-white/80 font-medium">{value}</span>
    </div>
  )
}

function Term({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3.5 py-3">
      <div className="text-[10px] font-bold text-white/60 mb-1.5">{n}. {title}</div>
      <ul className="space-y-1 text-[10px] text-white/40 leading-relaxed list-disc list-outside pl-3.5">
        {children}
      </ul>
    </div>
  )
}

function TermInline({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="pb-2.5 border-b border-white/[0.04] last:border-0 last:pb-0">
      <div className="text-[10px] font-bold text-white/50 mb-1">{n}. {title}</div>
      <ul className="space-y-0.5 text-[10px] text-white/40 leading-relaxed list-disc list-outside pl-3.5">
        {children}
      </ul>
    </div>
  )
}

/**
 * Build an array of full-text team role lines with proper pluralization.
 * e.g. ["2 Candid Photographers", "1 Cinematographer", "1 Drone Operator"]
 */
function buildTeamLines(ev: any, pricingItems: any[]): string[] {
  const crewForEvent = pricingItems.filter(
    (i: any) => i.eventId === ev.id && i.itemType === 'TEAM_ROLE' && Number(i.quantity) > 0
  )
  if (crewForEvent.length === 0) return ['—']

  // Group by the catalog label to preserve original role names
  const roleMap: Record<string, number> = {}
  crewForEvent.forEach((item: any) => {
    const label = (item.label || 'Crew').trim()
    roleMap[label] = (roleMap[label] || 0) + Number(item.quantity)
  })

  return Object.entries(roleMap).map(([label, qty]) => {
    const plural = qty > 1 ? pluralize(label) : label
    return `${qty} ${plural}`
  })
}

/** Simple pluralization for common crew role names */
function pluralize(word: string): string {
  const w = word.trim()
  // Already plural
  if (/s$/i.test(w) && !/ss$/i.test(w)) return w
  // "Drone Operator" → "Drone Operators"
  // "Cinematographer" → "Cinematographers"
  // "Candid Photographer" → "Candid Photographers"
  return w + 's'
}


