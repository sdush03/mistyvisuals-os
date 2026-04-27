/**
 * agreement-pdf.js
 *
 * Generates a branded service agreement PDF using PDFKit.
 * All data is pulled from the proposal snapshot (same token the client uses).
 */

const PDFDocument = require('pdfkit')
const repo = require('./quotation.repository')
const fs = require('fs')
const path = require('path')

const formatINR = (v) => 'Rs. ' + Number(v || 0).toLocaleString('en-IN')
const fmtDate = (d) => {
  if (!d) return 'TBD'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Reverse personalized event name back to base type */
const normalizeEventName = (ev) => {
  if (ev.originalType) return ev.originalType.replace(/\s*\([^)]*\)/gi, '').trim()
  const name = (ev.name || 'Event').trim()
  const match = name.match(/^.+?'s\s+(.+)$/i)
  return match ? match[1].trim() : name
}

/** Build array of full-text team lines like ["2 Candid Photographers", "1 Cinematographer"] */
const buildTeamLines = (ev, pricingItems) => {
  const crewForEvent = (pricingItems || []).filter(
    i => i.eventId === ev.id && i.itemType === 'TEAM_ROLE' && Number(i.quantity) > 0
  )
  if (crewForEvent.length === 0) return ['—']
  const roleMap = {}
  crewForEvent.forEach(item => {
    const label = (item.label || 'Crew').trim()
    roleMap[label] = (roleMap[label] || 0) + Number(item.quantity)
  })
  return Object.entries(roleMap).map(([label, qty]) => {
    const plural = qty > 1 ? pluralize(label) : label
    return `${qty} ${plural}`
  })
}

/** Simple pluralization for crew role names */
const pluralize = (word) => {
  const w = word.trim()
  if (/s$/i.test(w) && !/ss$/i.test(w)) return w
  return w + 's'
}

async function generateAgreementPdf(token, reply) {
  const snapshot = await repo.getProposalByToken(token)
  if (!snapshot) {
    reply.code(404).send({ error: 'Proposal not found' })
    return
  }

  const json = snapshot.snapshotJson || {}
  const draft = json.draftData || {}
  const hero = draft.hero || {}

  // ── Client / Package info ──
  const bride = (hero.brideName || hero.bride_name || draft.brideName || draft.bride_name || '').trim()
  const groom = (hero.groomName || hero.groom_name || draft.groomName || draft.groom_name || '').trim()
  const leadName = (hero.leadName || hero.lead_name || draft.leadName || draft.lead_name || '').trim()
  const coupleNames = (hero.coupleNames || hero.couple_names || draft.coupleNames || draft.couple_names || '').trim()
  const clientName = coupleNames || (bride && groom ? `${bride} & ${groom}` : leadName) || 'Client'

  const tiers = draft.tiers || []
  const activeTier = tiers.find(t => t.isPopular) || tiers[0] || {}
  const tierName = activeTier.name || 'Essential'
  const originalPrice = Number(activeTier.overridePrice ?? activeTier.price ?? snapshot.salesOverridePrice ?? snapshot.calculatedPrice ?? 0)
  const hasDiscount = activeTier.discountedPrice != null && activeTier.discountedPrice > 0
  const discountedPrice = hasDiscount ? Number(activeTier.discountedPrice) : null

  const paymentSchedule = draft.paymentSchedule || []
  const pricingItems = draft.pricingItems || []
  const events = Array.isArray(draft.events) ? [...draft.events] : []
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const todayStr = fmtDate(draft.agreementSignedAt || new Date())

  // ── Build PDF ──
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 60, bottom: 60, left: 55, right: 55 },
    bufferPages: true,
    info: {
      Title: `Misty Visuals – Service Agreement – ${clientName}`,
      Author: 'Misty Visuals Pvt Ltd',
    },
  })

  // Buffer entire PDF in memory, then send as complete response
  const chunks = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const pdfReady = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const accent = '#1a1a2e'

  // ── Header ──
  const logoPath = path.resolve(__dirname, '../../../frontend/public/logo_black.png')
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, doc.page.width / 2 - 80, doc.y, { width: 160 })
    doc.y += 45
    doc.moveDown(0.5)
  } else {
    doc.fontSize(22).font('Helvetica-Bold').fillColor(accent).text('MISTY VISUALS', { align: 'center' }).moveDown(0.2)
  }
  
  doc
    .fontSize(8).font('Helvetica')
    .fillColor('#888')
    .text('An Artful Approach to Capturing Love', { align: 'center' })
    .moveDown(0.6)

  // Thin line
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageW, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke()
  doc.moveDown(0.8)

  doc.fontSize(18).font('Helvetica-Bold').fillColor('#111').text('Service Agreement', { align: 'center' })
  doc.moveDown(1)

  // ── Helpers ──
  const sectionTitle = (text) => {
    doc.moveDown(1)
    doc.fontSize(12).font('Helvetica-Bold').fillColor(accent).text(text)
    doc.moveDown(0.3)
  }

  const bodyText = (text) => {
    doc.fontSize(9.5).font('Helvetica').fillColor('#333').text(text, { lineGap: 3.5 })
  }

  const bulletText = (text) => {
    doc.fontSize(9.5).font('Helvetica').fillColor('#333')
      .text(`•  ${text}`, { indent: 12, lineGap: 3 })
  }

  // ── Parties ──
  sectionTitle('Parties')
  bodyText(`Service Provider:  Misty Visuals Pvt Ltd`)
  bodyText(`GSTIN:  06AANCM7903Q1ZQ`)
  bodyText(`Client:  ${clientName}`)
  bodyText(`Package:  The ${tierName} Experience`)
  bodyText(`Total Package Value:  ${formatINR(originalPrice)} (+ 18% GST)`)
  if (hasDiscount && discountedPrice) {
    bodyText(`After Discount:  ${formatINR(discountedPrice)} (+ 18% GST)`)
  }
  bodyText(`Agreement Date:  ${todayStr}`)

  // ── Events Schedule ──
  if (events.length > 0) {
    sectionTitle('Event Schedule')
    
    // 4-column layout: Date (+ timing), Event (shrunk), Venue (+ pax), Team (expanded)
    const colWidths = [pageW * 0.22, pageW * 0.15, pageW * 0.25, pageW * 0.38]
    const headers = ['Date', 'Event', 'Venue', 'Team']
    const tableX = doc.page.margins.left
    let rowY = doc.y

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#555')
    headers.forEach((h, i) => {
      let x = tableX
      for (let j = 0; j < i; j++) x += colWidths[j]
      doc.text(h, x, rowY, { width: colWidths[i], continued: false })
    })
    doc.y = rowY + 14
    doc.moveTo(tableX, doc.y).lineTo(tableX + pageW, doc.y).strokeColor('#ddd').lineWidth(0.3).stroke()
    doc.moveDown(0.3)

    events.forEach((ev) => {
      let rowY = doc.y
      const timing = ev.time || ev.slot || ''
      const pax = ev.pax || ev.guestCount || ''
      const venue = ev.location || ev.venue || '—'
      const teamLines = buildTeamLines(ev, pricingItems)

      let x = tableX
      
      // Date & Timing
      doc.fontSize(8).font('Helvetica').fillColor('#333')
      doc.text(fmtDate(ev.date), x, rowY, { width: colWidths[0] })
      if (timing) {
         doc.fontSize(7).fillColor('#999')
         doc.text(timing, x, doc.y, { width: colWidths[0] })
      }
      const maxYAfterDate = doc.y

      // Event
      doc.fontSize(8).font('Helvetica').fillColor('#333')
      doc.text(normalizeEventName(ev), x + colWidths[0], rowY, { width: colWidths[1] })
      const maxYAfterEvent = doc.y

      // Venue & Pax
      const venueOptions = { width: colWidths[2] }
      if (ev.locationLink) {
         venueOptions.link = ev.locationLink
      }
      doc.fontSize(8).font('Helvetica').fillColor(ev.locationLink ? '#2563eb' : '#333')
      doc.text(venue, x + colWidths[0] + colWidths[1], rowY, venueOptions)
      if (pax) {
         doc.fontSize(7).fillColor('#999')
         doc.text(`${pax} pax`, x + colWidths[0] + colWidths[1], doc.y, { width: colWidths[2] })
      }
      const maxYAfterVenue = doc.y

      // Team
      doc.fontSize(8).font('Helvetica').fillColor('#333')
      teamLines.forEach((tl, idx) => {
         doc.text(tl, x + colWidths[0] + colWidths[1] + colWidths[2], idx === 0 ? rowY : doc.y, { width: colWidths[3] })
      })
      const maxYAfterTeam = doc.y

      doc.y = Math.max(maxYAfterDate, maxYAfterEvent, maxYAfterVenue, maxYAfterTeam) + 8
    })
  }

  // ── Deliverables ──
  const deliverables = (pricingItems || []).filter(i => i.itemType === 'DELIVERABLE' && Number(i.quantity) > 0)
  if (deliverables.length > 0) {
    sectionTitle('Deliverables Included')
    deliverables.forEach(d => {
      const qty = Number(d.quantity)
      const label = d.label || 'Deliverable'
      const plural = qty > 1 ? pluralize(label) : label
      
      let labelFormatted = label
      if (qty > 1) labelFormatted = `${qty} ${plural}`
      
      const timelineStr = d.deliveryTimeline ? ` (${d.deliveryTimeline})` : ''
      bodyText(`${labelFormatted}${timelineStr}`)
    })
  }

  // ── Payment Structure ──
  if (paymentSchedule.length > 0) {
    sectionTitle('Payment Structure')
    
    const payHeaders = ['Stage', 'Percentage']
    const pTableX = doc.page.margins.left
    const pColWidths = [pageW * 0.4, pageW * 0.3]
    
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#555')
    doc.text(payHeaders[0], pTableX, doc.y, { width: pColWidths[0], continued: false })
    // Use doc.y - doc.currentLineHeight() to align on same line
    doc.text(payHeaders[1], pTableX + pColWidths[0], doc.y - doc.currentLineHeight(), { width: pColWidths[1] })
    doc.y += 2
    doc.moveTo(pTableX, doc.y).lineTo(pTableX + pColWidths[0] + pColWidths[1], doc.y).strokeColor('#ddd').lineWidth(0.3).stroke()
    doc.moveDown(0.3)

    paymentSchedule.forEach(s => {
      doc.fontSize(8).font('Helvetica').fillColor('#333')
      const rowY = doc.y
      doc.text(s.label, pTableX, rowY, { width: pColWidths[0] })
      doc.text(`${s.percentage}%`, pTableX + pColWidths[0], rowY, { width: pColWidths[1] })
      doc.y = rowY + 12
    })

    doc.moveDown(0.2)
    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#666')
      .text('Venue day payment must be completed on the first day of the event. Late payments will delay delivery of all final deliverables.', { lineGap: 3 })
  }

  // ── Terms ──
  sectionTitle('Terms & Conditions')
  const termSection = (title, bullets) => {
    sectionTitle(title)
    bullets.forEach(b => bulletText(b))
  }

  termSection('1. Cancellation Policy', [
    'If you decide to cancel at any time, the advance booking amount is non-refundable.',
    'If we are forced to cancel due to severe illness or emergency, we will issue a full refund of all amounts paid.',
    'In the event of force majeure or unforeseen circumstances, cancellation terms will be mutually discussed.',
  ])

  termSection('2. Rescheduling Policy', [
    'The event may be rescheduled once, provided the client notifies the studio at least 120 days before the originally decided event date.',
    'Rescheduling is subject to the studio\'s availability on the new date.',
    'If the event is rescheduled, any previously applied discounts or courtesy offsets will not be carried forward. The total package value at the time of rescheduling will apply.',
  ])

  termSection('3. Deliverables & Timeline', [
    'As per the accepted quotation. Delivery timelines will be shared with the client post-event.',
    'During peak wedding season, edits might take a little longer, but the studio will always keep the client updated.',
    'We will hand over all raw footage once the final payment is cleared.',
  ])

  termSection('4. Creative Rights & Usage', [
    'We edit in our signature style—it\'s what makes our films special and why you hired us!',
    'We don\'t provide project files for third-party re-editing, and we ask that you trust our creative process.',
    'The studio reserves the right to use work for its portfolio and marketing. The client may opt out by notifying the studio in writing before the event.',
  ])

  termSection('5. Editing Revisions', [
    '2–3 minor revisions per deliverable are included at no extra charge.',
    'Beyond this, additional revision charges will apply depending on the scope of corrections.',
    'If revision requests are not provided within the studio\'s revision window, re-edits will take additional time and may be chargeable.',
  ])

  termSection('6. Equipment Safety & Lasers', [
    'Direct laser lights permanently destroy camera sensors. If lasers are active at the venue, our team will stop shooting to protect the gear.',
    'Any laser damage caused to our equipment at the venue will be the client\'s responsibility (repair costs + rental for the repair duration).',
  ])

  termSection('7. Team & Coverage', [
    'The number and type of crew members are specified in the accepted quotation. The studio reserves the right to assign specific team members.',
    'Any request for additional coverage hours beyond the booked schedule will be chargeable at the studio\'s prevailing hourly rate.',
  ])

  termSection('8. Client Responsibilities', [
    'Meals: Our team shoots better on a full stomach! Please ensure we are provided the same hot buffet meals as your guests.',
    'Accommodation & Travel: For outstation events, the client is responsible for providing accommodation and travel arrangements for the crew.',
    'Drone Licensing: Client is responsible for obtaining any permits or licenses required for drone operation at the venue locations.',
    'Schedule & Timing: Late functions or extended makeup = limited content. Please share pre-decided timelines in advance.',
  ])

  termSection('9. Conduct & Safety', [
    'Safe Environment: We treat your family with respect and expect the same in return. Any harassment or misbehaviour towards our team will result in an immediate stop to the shoot.',
    'Any equipment damage by guests will be the client\'s responsibility at MRP.',
  ])

  termSection('10. Liability', [
    'The studio is not liable for missed moments due to venue restrictions, family constraints, or scheduling conflicts.',
    'The studio\'s maximum liability is capped at the total amount paid by the client.',
    'The client is responsible for backing up their deliverables post-delivery. The studio does not guarantee indefinite storage.',
  ])

  termSection('11. Data Archival', [
    'We store your raw footage for 30 days after the final films are delivered.',
    'Please ensure you create your own backups once you receive the files, as we do not guarantee indefinite storage.',
  ])

  termSection('12. Governing Law', [
    'This agreement is governed by the laws of India. Any disputes shall be subject to the jurisdiction of courts in Gurgaon, Haryana.',
    'This agreement supersedes all prior verbal or written agreements between the parties.',
  ])

  // ── Signature block ──
  doc.moveDown(1.5)
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageW, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke()
  doc.moveDown(1)

  const halfW = pageW / 2 - 20
  const sigY = doc.y

  // Studio side
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#111').text('For Misty Visuals Pvt Ltd', doc.page.margins.left, sigY, { width: halfW })
  doc.moveDown(2)
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + halfW - 10, doc.y).strokeColor('#bbb').lineWidth(0.5).stroke()
  doc.moveDown(0.3)
  doc.fontSize(8).font('Helvetica').fillColor('#888').text('Authorised Signatory', doc.page.margins.left, doc.y, { width: halfW })

  // Client side
  const rightX = doc.page.margins.left + halfW + 40
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#111').text(`Client: ${clientName}`, rightX, sigY, { width: halfW })
  doc.y = sigY + 15
  
  if (draft.signatureImage) {
    try {
      doc.image(draft.signatureImage, rightX, doc.y, { width: halfW > 150 ? 150 : halfW, fit: [halfW, 40], align: 'left' })
      doc.y += 45
    } catch (e) {
      doc.moveDown(2)
    }
  } else if (draft.signatureName) {
    doc.fontSize(12).font('Times-Italic').fillColor('#4f46e5').text(draft.signatureName, rightX, doc.y, { width: halfW })
    doc.y += 30
  } else {
    doc.moveDown(2)
  }

  doc.moveTo(rightX, doc.y).lineTo(rightX + halfW - 10, doc.y).strokeColor('#bbb').lineWidth(0.5).stroke()
  doc.moveDown(0.3)
  doc.fontSize(8).font('Helvetica').fillColor('#888').text('Client Signature', rightX, doc.y, { width: halfW })

  // ── Footer ──
  const pageCount = doc.bufferedPageRange().count
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i)
    doc.fontSize(7).font('Helvetica').fillColor('#aaa').text(
      '© 2019 Misty Visuals Pvt Ltd | GSTIN: 06AANCM7903Q1ZQ | 415, Sector-40, Gurgaon | contact@mistyvisuals.com', 
      doc.page.margins.left, 
      doc.page.height - 40, 
      { align: 'center', width: pageW }
    )
  }

  doc.end()

  // Wait for PDF to finish, then send as complete response
  const pdfBuffer = await pdfReady
  reply
    .type('application/pdf')
    .header('Content-Disposition', `attachment; filename="MistyVisuals_Agreement_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`)
    .send(pdfBuffer)
}

module.exports = { generateAgreementPdf }
