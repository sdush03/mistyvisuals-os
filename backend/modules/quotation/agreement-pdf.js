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
  const liveDraft = snapshot.quoteVersion?.draftDataJson || {}
  // Merge liveDraft on top of draftData to ensure we have the absolutely latest signed terms and signature
  const draft = { ...(json.draftData || {}), ...liveDraft }
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
  const startY = doc.y;
  
  // Right side text
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#111').text('Misty Visuals Pvt Ltd', doc.page.margins.left, startY, { align: 'right', width: pageW })
  doc.moveDown(0.2)
  doc.fontSize(8).font('Helvetica').fillColor('#555')
    .text('415 (Basement), Sector 40', { align: 'right', width: pageW })
    .text('Gurugram - 122001', { align: 'right', width: pageW })
    .text('GST - 06AANCM7903Q1ZQ', { align: 'right', width: pageW })
    .text('+91 756 000 8899', { align: 'right', width: pageW })
    .text('contact@mistyvisuals.com', { align: 'right', width: pageW })
  
  const rightBottom = doc.y;

  // Left side: logo and quote
  doc.x = doc.page.margins.left;
  doc.y = startY;
  const logoPath = path.resolve(__dirname, '../../../frontend/public/logo_black.png')
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, { width: 86 })
    doc.moveDown(0.2)
  } else {
    doc.fontSize(18).font('Helvetica-Bold').fillColor(accent).text('MISTY VISUALS')
  }
  
  const leftBottom = doc.y;
  
  doc.y = Math.max(leftBottom, rightBottom) + 15;

  // Thin line
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageW, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke()
  doc.moveDown(2.5)
  
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#111').text('Service Agreement', { align: 'center' })
  doc.moveDown(1.5)
  doc.fontSize(9.5).font('Helvetica').fillColor('#333').text(`Agreement Date:  ${todayStr}`, { align: 'left' })
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

  // Load Roboto font for Rupees
  const fontPath = path.resolve(__dirname, '../../../backend/assets/Roboto-Regular.ttf')
  if (fs.existsSync(fontPath)) {
    doc.registerFont('RupeeFont', fontPath)
  }

  const { pool } = require('../../db')
  const leadId = snapshot.quoteVersion?.quoteGroup?.leadId
  let leadRecord = null
  if (leadId) {
    const res = await pool.query('SELECT name, bride_name, groom_name, phone_primary FROM leads WHERE id = $1', [leadId])
    leadRecord = res.rows[0]
  }

  const lName = leadRecord?.name || leadName || 'Client';
  const lPhone = leadRecord?.phone_primary || draft.clientPhone || hero.clientPhone || hero.phone || '';
  const lBride = leadRecord?.bride_name || bride;
  const lGroom = leadRecord?.groom_name || groom;
  
  const clientStr = lPhone ? `${lName} (${lPhone})` : lName;

  // ── Parties ──
  sectionTitle('Parties')
  bodyText(`Service Provider:  Misty Visuals Pvt Ltd`)
  bodyText(`Client:  ${clientStr}`)
  
  if (lBride && lGroom) {
    const coupleStr = lPhone ? `${lBride} & ${lGroom} (${lPhone})` : `${lBride} & ${lGroom}`;
    bodyText(`Couple:  ${coupleStr}`)
  }
  
  bodyText(`Package:  The ${tierName} Experience`)
  
  const drawAmountLine = (label, amt) => {
    const formattedAmt = `${Number(amt).toLocaleString('en-IN')} (+ 18% GST)`
    const startX = doc.x;
    const startY = doc.y;
    
    doc.fontSize(9.5).font('Helvetica').fillColor('#333')
    doc.text(label, startX, startY, { continued: false })
    const labelWidth = doc.widthOfString(label)
    
    if (fs.existsSync(fontPath)) {
      doc.fontSize(10).font('RupeeFont').text('₹', startX + labelWidth, startY - 3, { continued: false })
      const rupeeWidth = doc.widthOfString('₹') + 1
      doc.fontSize(9.5).font('Helvetica').text(formattedAmt, startX + labelWidth + rupeeWidth, startY, { continued: false })
    } else {
      doc.font('Helvetica').text('Rs. ' + formattedAmt, startX + labelWidth, startY, { continued: false })
    }
    
    doc.y = startY + doc.currentLineHeight() + 3.5;
    doc.x = startX;
  }
  
  drawAmountLine(`Total Package Value:  `, originalPrice)
  if (hasDiscount && discountedPrice) {
    drawAmountLine(`After Discount:  `, discountedPrice)
  }

  // ── Events Schedule ──
  if (events.length > 0) {
    doc.moveDown(1)
    sectionTitle('Event Schedule')
    
    // 4-column layout: Date (+ timing), Event (shrunk), Venue (+ pax), Team (expanded)
    const colWidths = [pageW * 0.22, pageW * 0.23, pageW * 0.27, pageW * 0.28]
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
    
    // Reset doc.x to left margin after drawing the table
    doc.x = doc.page.margins.left
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
      doc.fontSize(9.5).font('Helvetica').fillColor('#333').text(`${labelFormatted}${timelineStr}`, { align: 'left', lineGap: 3.5 })
    })
  }

  // ── Payment Structure ──
  if (paymentSchedule.length > 0) {
    doc.moveDown(1)
    sectionTitle('Payment Structure')
    
    const payHeaders = ['Stage', 'Percentage']
    const pTableX = doc.page.margins.left
    const pColWidths = [pageW * 0.30, pageW * 0.20]
    
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
    
    // Reset doc.x to left margin after drawing the table
    doc.x = doc.page.margins.left

    doc.moveDown(0.2)
    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#666')
      .text('Venue day payment must be completed on the first day of the event. Late payments will delay delivery of all final deliverables.', { align: 'left', lineGap: 3 })
  }

  // ── Terms ──
  doc.addPage()
  doc.fontSize(12).font('Helvetica-Bold').fillColor(accent).text('Terms & Conditions')
  
  let isFirstTerm = true;
  const termSection = (title, bullets) => {
    if (!isFirstTerm) {
      doc.moveDown(0.8)
    } else {
      doc.moveDown(0.4)
      isFirstTerm = false;
    }
    doc.fontSize(10).font('Helvetica-Bold').fillColor(accent).text(title)
    doc.moveDown(0.2)
    doc.fontSize(9.5).font('Helvetica').fillColor('#333')
    doc.list(bullets, { 
      bulletRadius: 1.5,
      textIndent: 12,
      bulletIndent: 0,
      lineGap: 3,
      align: 'justify'
    })
  }

  const { AGREEMENT_TERMS } = require('./agreement-terms')
  const termsToRender = (draft.agreementTerms && Array.isArray(draft.agreementTerms))
    ? draft.agreementTerms
    : AGREEMENT_TERMS

  const stripHtml = (str) => str.replace(/<[^>]*>?/gm, '')

  termsToRender.forEach(term => {
    const cleanItems = term.items.map(stripHtml)
    termSection(`${term.n}. ${term.title}`, cleanItems)
  })

  // ── Signature block ──
  doc.moveDown(1.5)
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageW, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke()
  doc.moveDown(1)

  const halfW = pageW / 2 - 20
  const sigStartY = doc.y

  // Studio side (Left)
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#111').text('For Misty Visuals Pvt Ltd', doc.page.margins.left, sigStartY, { width: halfW })
  
  // Client side (Right) - Text
  const rightX = doc.page.margins.left + halfW + 40
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#111').text(`Client: ${clientName}`, rightX, sigStartY, { width: halfW })
  
  // Calculate signature image dimensions
  let maxSigHeight = 40;
  let signatureYEnd = sigStartY + 60; // default space without image
  let imageYStart = sigStartY + 15;
  
  const pdfSigImage = draft.signatureImageDark || draft.signatureImage
  let currentY = imageYStart;

  if (pdfSigImage) {
    try {
      doc.image(pdfSigImage, rightX, currentY, { width: halfW > 150 ? 150 : halfW, fit: [halfW, maxSigHeight], align: 'left' })
      currentY += maxSigHeight + 5;
    } catch (e) {
      // image failed to load
    }
  }

  if (draft.signatureName) {
    if (pdfSigImage) {
      doc.fontSize(10).font('Times-Italic').fillColor('#555').text(`By ${draft.signatureName}`, rightX, currentY, { width: halfW })
      currentY += 15;
    } else {
      doc.fontSize(12).font('Times-Italic').fillColor('#4f46e5').text(draft.signatureName, rightX, currentY, { width: halfW })
      currentY += 30;
    }
  }

  signatureYEnd = Math.max(currentY + 5, sigStartY + 60);
  
  // Use a fixed Y for the horizontal lines based on whatever took up more space
  const linesY = Math.max(signatureYEnd, sigStartY + 60);

  // Draw Left Line & Subtext
  doc.moveTo(doc.page.margins.left, linesY).lineTo(doc.page.margins.left + halfW - 10, linesY).strokeColor('#bbb').lineWidth(0.5).stroke()
  doc.fontSize(8).font('Helvetica').fillColor('#888').text('Authorised Signatory', doc.page.margins.left, linesY + 5, { width: halfW })

  // Draw Right Line & Subtext
  doc.moveTo(rightX, linesY).lineTo(rightX + halfW - 10, linesY).strokeColor('#bbb').lineWidth(0.5).stroke()
  doc.fontSize(8).font('Helvetica').fillColor('#888').text('Client Signature', rightX, linesY + 5, { width: halfW })

  // ── Footer ──
  const pageCount = doc.bufferedPageRange().count
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i)
    
    // Temporarily remove bottom margin to prevent footer from triggering an auto-page-break
    const originalBottomMargin = doc.page.margins.bottom
    doc.page.margins.bottom = 0

    doc.fontSize(7).font('Helvetica').fillColor('#aaa').text(
      '© 2019 Misty Visuals Pvt Ltd | GSTIN: 06AANCM7903Q1ZQ | 415, Sector-40, Gurgaon | contact@mistyvisuals.com', 
      doc.page.margins.left, 
      doc.page.height - 40, 
      { align: 'center', width: pageW, lineBreak: false }
    )

    // Restore bottom margin
    doc.page.margins.bottom = originalBottomMargin
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
