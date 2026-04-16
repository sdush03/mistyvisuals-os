const crypto = require('crypto')
const repo = require('./quotation.repository')
const { QuoteStatus, PricingItemType, NegotiationType } = require('./quotation.types')

const toNumber = (value) => (value === null || value === undefined ? null : Number(value))

const throwHttp = (statusCode, message, code) => {
  const err = new Error(message)
  err.statusCode = statusCode
  if (code) err.code = code
  throw err
}

const getEffectivePrice = (version) => {
  const override = toNumber(version.salesOverridePrice)
  if (override !== null && !Number.isNaN(override)) return override
  const calc = toNumber(version.calculatedPrice)
  return calc ?? 0
}

const computeApprovalHash = (draft) => {
  if (!draft) return ''
  const items = (draft.pricingItems || []).map(i => `${i.itemType}_${i.catalogId}_${i.quantity || 1}_${i.unitPrice || 0}_${i.eventId || ''}`).sort().join('|')
  const mode = draft.pricingMode || 'TIERED'
  const modeData = mode === 'SINGLE' ? (draft.selectedTierId || 'default') : 'tiered'
  const tiers = (draft.tiers || []).map(t => `${t.id}_${t.price}_${t.overridePrice || 0}_${t.discountedPrice || 0}`).sort().join('|')
  return crypto.createHash('md5').update(`${items}::${modeData}::${tiers}`).digest('hex')
}

const getProposalClientName = (json, quoteGroup) => {
  const draft = json?.draftDataJson || json?.draftData || json || {}
  const hero = draft.hero || {}
  const bride = (hero.brideName || hero.bride_name || draft.brideName || draft.bride_name || '').trim()
  const groom = (hero.groomName || hero.groom_name || draft.groomName || draft.groom_name || '').trim()
  const cNames = (hero.coupleNames || hero.couple_names || draft.coupleNames || draft.couple_names || '').trim()
  const leadTitle = quoteGroup?.title ? quoteGroup.title.split('-')[0].trim() : ''
  let clientName = cNames || (bride && groom ? `${bride} & ${groom}` : leadTitle)
  if (!clientName || clientName === 'Quote' || clientName === 'Proposal') clientName = 'a client'
  return clientName
}

/**
 * Check every tier independently.
 * For each tier the client-facing price is: discountedPrice → overridePrice → system price.
 * If ANY tier's client price is more than 10% below its own system price → needs admin.
 * Returns { meetsAutoApprove, details[] } for notification context.
 */
const checkTierAutoApproval = (version) => {
  const draft = version.draftDataJson || {};
  const tiers = draft.tiers || [];
  const mode = draft.pricingMode || 'TIERED';

  // No tiers at all → fall back to simple override vs calculated check
  if (tiers.length === 0) {
    const calculated = toNumber(version.calculatedPrice) ?? 0;
    const effective = getEffectivePrice(version);
    if (calculated <= 0) return { meetsAutoApprove: false, details: [{ tier: 'Quote', system: calculated, client: effective, pct: 100 }] };
    const pct = ((calculated - effective) / calculated) * 100;
    return { meetsAutoApprove: pct <= 10, details: [{ tier: 'Quote', system: calculated, client: effective, pct: Math.round(pct * 10) / 10 }] };
  }

  // In SINGLE mode, only check the selected tier
  const tiersToCheck = mode === 'SINGLE'
    ? [tiers.find(t => t.id === draft.selectedTierId) || tiers[0]].filter(Boolean)
    : tiers;

  const details = [];
  let meetsAutoApprove = true;

  for (const t of tiersToCheck) {
    const systemPrice = toNumber(t.price) ?? 0;
    if (systemPrice <= 0) { meetsAutoApprove = false; continue; }

    // Client-facing price: discountedPrice takes priority, then overridePrice, then system price
    const clientPrice = toNumber(t.discountedPrice) ?? toNumber(t.overridePrice) ?? systemPrice;
    const discountPct = ((systemPrice - clientPrice) / systemPrice) * 100;

    details.push({ tier: t.name || t.id, system: systemPrice, client: clientPrice, pct: Math.round(discountPct * 10) / 10 });

    if (clientPrice < systemPrice * 0.90) {
      meetsAutoApprove = false;
    }
  }

  return { meetsAutoApprove, details };
}

const toJson = (value) => {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return value
}

const matchNumericCondition = (value, condition) => {
  const num = Number(value || 0)
  if (condition === null || condition === undefined) return true
  if (typeof condition === 'number') return num === condition
  if (typeof condition === 'string' && condition.trim() !== '') {
    const parsed = Number(condition)
    if (!Number.isNaN(parsed)) return num === parsed
  }
  if (typeof condition === 'object') {
    const op = condition.op || condition.operator
    if (op && condition.value !== undefined) {
      const target = Number(condition.value)
      if (Number.isNaN(target)) return false
      if (op === '>' || op === 'gt') return num > target
      if (op === '>=' || op === 'gte') return num >= target
      if (op === '<' || op === 'lt') return num < target
      if (op === '<=' || op === 'lte') return num <= target
      return num === target
    }
    const min = condition.min ?? condition.gte
    const max = condition.max ?? condition.lte
    if (min !== undefined && num < Number(min)) return false
    if (max !== undefined && num > Number(max)) return false
    return true
  }
  return false
}

const matchBooleanCondition = (value, condition) => {
  if (condition === null || condition === undefined) return true
  if (typeof condition === 'boolean') return Boolean(value) === condition
  if (typeof condition === 'string') {
    if (condition.toLowerCase() === 'true') return Boolean(value) === true
    if (condition.toLowerCase() === 'false') return Boolean(value) === false
  }
  return false
}

const ruleMatches = (conditionsJson, context) => {
  const conditions = toJson(conditionsJson)
  if (!conditions) return false

  if (Array.isArray(conditions)) {
    return conditions.every((cond) => {
      if (!cond || typeof cond !== 'object') return false
      const field = cond.field || cond.key
      if (!field) return false
      const value = context[field]
      if (field === 'destination') return matchBooleanCondition(value, cond.value ?? cond)
      return matchNumericCondition(value, cond.value ?? cond)
    })
  }

  if (typeof conditions !== 'object') return false
  for (const [field, cond] of Object.entries(conditions)) {
    const value = context[field]
    if (field === 'destination') {
      if (!matchBooleanCondition(value, cond)) return false
    } else {
      if (!matchNumericCondition(value, cond)) return false
    }
  }
  return true
}

const normalizeDefaultItem = (item) => {
  if (!item) return null
  if (typeof item === 'number') return { catalogId: item, quantity: 1 }
  if (typeof item === 'string') return { name: item, quantity: 1 }
  if (typeof item === 'object') {
    return {
      catalogId: item.catalogId ?? item.catalog_id ?? item.id ?? null,
      name: item.name ?? item.label ?? null,
      quantity: item.quantity ?? item.qty ?? 1,
    }
  }
  return null
}

const resolveDefaults = async (items, resolverById, resolverByName, itemType) => {
  const resolved = []
  for (const raw of items) {
    const normalized = normalizeDefaultItem(raw)
    if (!normalized) continue
    let catalog = null
    if (normalized.catalogId) {
      catalog = await resolverById(normalized.catalogId)
    } else if (normalized.name) {
      catalog = await resolverByName(normalized.name)
    }
    if (!catalog) continue
    resolved.push({
      itemType,
      catalogId: Number(catalog.id),
      quantity: Number(normalized.quantity) || 1,
      unitPrice: Number(catalog.price),
      label: catalog.name,
    })
  }
  return resolved
}

const buildPricingDefaults = async (leadId) => {
  const context = await repo.getLeadRuleContext(leadId)
  if (!context) return null
  const rules = await repo.listActivePricingRules()
  for (const rule of rules) {
    if (!ruleMatches(rule.conditionsJson, context)) continue
    const teamDefaultsRaw = toJson(rule.defaultTeamJson)
    const deliverDefaultsRaw = toJson(rule.defaultDeliverablesJson)
    const teamDefaults = Array.isArray(teamDefaultsRaw) ? teamDefaultsRaw : teamDefaultsRaw?.items || []
    const deliverDefaults = Array.isArray(deliverDefaultsRaw)
      ? deliverDefaultsRaw
      : deliverDefaultsRaw?.items || []
    const teamItems = await resolveDefaults(
      teamDefaults,
      repo.getTeamRoleById,
      repo.findTeamRoleByName,
      PricingItemType.TEAM_ROLE
    )
    const deliverItems = await resolveDefaults(
      deliverDefaults,
      repo.getDeliverableById,
      repo.findDeliverableByName,
      PricingItemType.DELIVERABLE
    )
    const deliverDraft = deliverItems.map((item) => ({
      label: item.label,
      description: '',
    }))
    return {
      pricingItems: [...teamItems, ...deliverItems],
      deliverables: deliverDraft,
    }
  }
  return null
}

const applyDefaultsToDraft = (draftDataJson, defaults) => {
  if (!defaults) return draftDataJson ?? null
  const base = draftDataJson && typeof draftDataJson === 'object' ? { ...draftDataJson } : {}
  const hasPricing = Array.isArray(base.pricingItems) && base.pricingItems.length > 0
  const hasDeliverables = Array.isArray(base.deliverables) && base.deliverables.length > 0
  if (!hasPricing) base.pricingItems = defaults.pricingItems
  if (!hasDeliverables) base.deliverables = defaults.deliverables
  return base
}

const syncLeadFromDraft = async (fullVersion, draftData) => {
  const leadId = fullVersion?.quoteGroup?.leadId
  if (!leadId) return

  let amountQuoted = null
  let discountedAmount = null

  if (draftData && draftData.tiers) {
    const tiers = draftData.tiers
    const mode = draftData.pricingMode || 'TIERED'
    if (mode === 'SINGLE') {
      const activeTierId = draftData.selectedTierId || tiers[0]?.id
      const t = tiers.find((x) => x.id === activeTierId) || tiers[0]
      if (t) {
        amountQuoted = t.overridePrice ?? t.price
        discountedAmount = t.discountedPrice ?? null
      }
    } else {
      const sigTier = tiers.find((x) => String(x.name).toLowerCase().includes('signature')) || tiers.find((x) => x.isPopular) || tiers[1] || tiers[0]
      if (sigTier) {
        amountQuoted = sigTier.overridePrice ?? sigTier.price
        discountedAmount = sigTier.discountedPrice ?? null
      }
    }
  }

  if (amountQuoted != null) {
    await repo.syncLeadPricing(leadId, amountQuoted, discountedAmount).catch(() => {})
  }
}

const assertLatestEditable = (version) => {
  if (!version) throwHttp(404, 'Quote version not found')
  if (!version.isLatest) throwHttp(400, 'Only latest version is editable')
  if (
    [QuoteStatus.SENT, QuoteStatus.ACCEPTED, QuoteStatus.REJECTED, QuoteStatus.EXPIRED].includes(
      version.status
    )
  ) {
    throwHttp(400, 'Sent quotes are immutable')
  }
}

const createQuoteGroup = async ({ leadId, title }) => {
  const exists = await repo.leadExists(leadId)
  if (!exists) throwHttp(404, 'Lead not found')
  return repo.createQuoteGroup(leadId, title)
}

const updateQuoteGroup = async (groupId, payload) => {
  const group = await repo.getQuoteGroupById(groupId)
  if (!group) throwHttp(404, 'Quote group not found')
  return repo.updateQuoteGroup(groupId, { title: payload.title })
}

const listQuoteGroups = async (leadId, pagination) => {
  return repo.listQuoteGroupsByLead(leadId, pagination)
}

const deleteQuoteGroup = async (groupId) => {
  return repo.deleteQuoteGroup(groupId)
}

const createQuoteVersion = async (groupId, payload) => {
  const group = await repo.getQuoteGroupById(groupId)
  if (!group) throwHttp(404, 'Quote group not found')

  const latest = await repo.getLatestQuoteVersion(groupId)
  const status = payload.status || QuoteStatus.DRAFT

  // Use previous draft data as base if and only if no payload data provided
  let draftDataJson = payload.draftDataJson || latest?.draftDataJson || null

  const draftDefaults = await buildPricingDefaults(group.leadId)
  draftDataJson = applyDefaultsToDraft(draftDataJson, draftDefaults)

  const newVersion = await repo.createQuoteVersion(groupId, {
    ...payload,
    status,
    draftDataJson,
    // Pre-fill prices if copying from latest
    calculatedPrice: payload.calculatedPrice ?? latest?.calculatedPrice,
    salesOverridePrice: payload.salesOverridePrice ?? latest?.salesOverridePrice,
    overrideReason: payload.overrideReason ?? latest?.overrideReason,
    targetPrice: payload.targetPrice ?? latest?.targetPrice,
    softDiscountPrice: payload.softDiscountPrice ?? latest?.softDiscountPrice,
    minimumPrice: payload.minimumPrice ?? latest?.minimumPrice,
  })

  // Pre-fill line items if latest exists
  if (latest) {
    await repo.copyPricingItems(latest.id, newVersion.id)
  }

  return newVersion
}

const listQuoteVersions = async (groupId, pagination) => {
  return repo.listQuoteVersions(groupId, pagination)
}

const getQuoteVersion = async (versionId) => {
  const version = await repo.getQuoteVersionById(versionId)
  if (!version) throwHttp(404, 'Quote version not found')
  
  // Real-time prune deleted testimonials from draftData for consistent preview
  const activeIds = new Set(await repo.getActiveTestimonialIds())
  if (version.draftDataJson && Array.isArray(version.draftDataJson.testimonials)) {
    version.draftDataJson.testimonials = version.draftDataJson.testimonials.filter(t => t && activeIds.has(Number(t.id)))
  }

  return version
}

const deleteQuoteVersion = async (versionId) => {
  const version = await repo.getQuoteVersionById(versionId)
  if (!version) throwHttp(404, 'Quote version not found')
  if (String(version.status).toUpperCase() !== 'DRAFT') throwHttp(400, 'Only draft versions can be deleted')
  return repo.deleteQuoteVersion(versionId)
}

const updateQuoteVersion = async (versionId, payload) => {
  const version = await repo.getQuoteVersionById(versionId)
  assertLatestEditable(version)

  if (payload.salesOverridePrice !== undefined && payload.salesOverridePrice !== null) {
    if (!payload.overrideReason || !String(payload.overrideReason).trim()) {
      throwHttp(400, 'Override reason required when sales override is applied')
    }
  }

  const result = await repo.updateQuoteVersion(versionId, {
    status: payload.status ?? version.status,
    salesOverridePrice: payload.salesOverridePrice ?? version.salesOverridePrice,
    overrideReason: payload.overrideReason ?? version.overrideReason,
    targetPrice: payload.targetPrice ?? version.targetPrice,
    softDiscountPrice: payload.softDiscountPrice ?? version.softDiscountPrice,
    minimumPrice: payload.minimumPrice ?? version.minimumPrice,
    draftDataJson: payload.draftDataJson ?? version.draftDataJson,
  })

  // Sync to Leads Table
  if (payload.draftDataJson) {
     await syncLeadFromDraft(version, payload.draftDataJson)
  }

  return result
}

const updateDraft = async (versionId, draftDataJson) => {
  const version = await repo.getQuoteVersionById(versionId)
  assertLatestEditable(version)
  
  await syncLeadFromDraft(version, draftDataJson)
  
  // Strip approval metadata from incoming draft — only the server controls these
  delete draftDataJson.approvalHash
  delete draftDataJson.approvedStatus

  // Preserve the server's approval metadata in the saved draft
  const serverHash = version.draftDataJson?.approvalHash
  const serverApprovedStatus = version.draftDataJson?.approvedStatus

  // Hash check: only run if the server has a stored approval hash (i.e. quote was submitted/approved)
  let updatedStatus = null
  if (serverHash && [QuoteStatus.PENDING_APPROVAL, QuoteStatus.APPROVED, QuoteStatus.DRAFT].includes(version.status)) {
     const newHash = computeApprovalHash(draftDataJson)
     if (newHash !== serverHash) {
        // Pricing changed from the approved snapshot — revert to DRAFT
        if (version.status !== QuoteStatus.DRAFT) updatedStatus = QuoteStatus.DRAFT
     } else {
        // Pricing is identical to the approved snapshot — restore to approved status
        if (serverApprovedStatus && serverApprovedStatus !== version.status) {
           updatedStatus = serverApprovedStatus
        }
     }
  }

  if (updatedStatus) {
     await repo.updateQuoteVersion(versionId, { status: updatedStatus })
  }

  // Re-attach the server's approval metadata before saving
  if (serverHash) draftDataJson.approvalHash = serverHash
  if (serverApprovedStatus) draftDataJson.approvedStatus = serverApprovedStatus
  
  const result = await repo.updateDraft(versionId, draftDataJson)
  // Return status so frontend can update UI instantly
  return { ...result, status: updatedStatus || version.status }
}

const addPricingItems = async (versionId, items) => {
  const version = await repo.getQuoteVersionById(versionId)
  assertLatestEditable(version)

  const prepared = []

  for (const item of items) {
    if (![PricingItemType.TEAM_ROLE, PricingItemType.DELIVERABLE].includes(item.itemType)) {
      throwHttp(400, 'Invalid pricing item type')
    }
    const qty = Number(item.quantity || 0)
    if (!qty || qty < 1) throwHttp(400, 'Quantity must be at least 1')
    let unitPrice = item.unitPrice
    if (unitPrice === undefined || unitPrice === null) {
      unitPrice = await repo.getCatalogPrice(item.itemType, item.catalogId)
      if (unitPrice === null) throwHttp(400, 'Catalog item not found for pricing')
    }
    const total = Number(unitPrice) * qty
    prepared.push({
      quoteVersionId: Number(versionId),
      itemType: item.itemType,
      catalogId: Number(item.catalogId),
      quantity: qty,
      unitPrice: Number(unitPrice),
      totalPrice: total,
    })
  }

  await repo.replacePricingItems(versionId, prepared)
  return repo.getQuoteVersionById(versionId)
}

const calculatePricing = async (versionId) => {
  const version = await repo.getQuoteVersionById(versionId)
  assertLatestEditable(version)

  const draft = version.draftDataJson || {}
  const events = Array.isArray(draft.events) ? draft.events : []
  const items = Array.isArray(draft.pricingItems) ? draft.pricingItems : []

  // 1. Fetch catalog to determine unit types and default prices
  const [teamRoles, deliverables] = await Promise.all([
    repo.getAllTeamRoles(),
    repo.getAllDeliverables(),
  ])

  const catalogMap = {}
  teamRoles.forEach((r) => {
    catalogMap[`TEAM_ROLE_${r.id}`] = { ...r, itemType: PricingItemType.TEAM_ROLE }
  })
  deliverables.forEach((d) => {
    catalogMap[`DELIVERABLE_${d.id}`] = { ...d, itemType: PricingItemType.DELIVERABLE }
  })

  // 2. Map event IDs to clean YYYY-MM-DD dates for daily grouping
  const eventIdToDate = {}
  events.forEach((e) => {
    if (e.id && e.date) {
      const d = new Date(e.date)
      if (!Number.isNaN(d.getTime())) {
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        eventIdToDate[e.id] = `${yyyy}-${mm}-${dd}`
      } else {
        // Fallback for non-ISO strings if any
        const parts = String(e.date).split('T')[0].split(' ')[0]
        eventIdToDate[e.id] = parts
      }
    }
  })

  // 3. Process items into Daily Maxes vs. Absolute Sums
  let calculatedPrice = 0
  const dailyMaxes = {} // { [date]: { [catalogKey]: { max: number, price: number } } }

  for (const it of items) {
    const catalogKey = `${it.itemType}_${it.catalogId}`
    const catalogEntry = catalogMap[catalogKey]
    
    // Team Roles are always PER_DAY as per instruction. Deliverables use catalog unitType.
    const unitType = it.itemType === PricingItemType.TEAM_ROLE ? 'PER_DAY' : (catalogEntry?.unitType || 'PER_UNIT')
    const qty = Number(it.quantity || 0)
    const price = Number(it.unitPrice ?? catalogEntry?.price ?? 0)

    const dateKey = it.eventId ? eventIdToDate[it.eventId] : null

    if (unitType === 'PER_DAY' && dateKey) {
      if (!dailyMaxes[dateKey]) dailyMaxes[dateKey] = {}
      if (!dailyMaxes[dateKey][catalogKey]) {
        dailyMaxes[dateKey][catalogKey] = { max: 0, price }
      }
      dailyMaxes[dateKey][catalogKey].max = Math.max(dailyMaxes[dateKey][catalogKey].max, qty)
    } else {
      // PER_UNIT, FLAT, or unassigned items are simply added
      calculatedPrice += qty * price
    }
  }

  // 4. Sum up the calculated maximums for each day
  for (const date in dailyMaxes) {
    for (const key in dailyMaxes[date]) {
      const { max, price } = dailyMaxes[date][key]
      calculatedPrice += max * price
    }
  }

  return repo.updateQuoteVersion(versionId, { calculatedPrice })
}

const addNegotiation = async (versionId, payload) => {
  const version = await repo.getQuoteVersionById(versionId)
  if (!version) throwHttp(404, 'Quote version not found')
  if (!Object.values(NegotiationType).includes(payload.type)) {
    throwHttp(400, 'Invalid negotiation type')
  }
  return repo.createNegotiation(versionId, payload)
}

const listNegotiations = async (versionId, pagination) => {
  return repo.listNegotiations(versionId, pagination)
}

const submitForApproval = async (versionId, note, auth) => {
  // Sync calculated price freshly before evaluation
  await calculatePricing(versionId)
  
  let version = await repo.getQuoteVersionById(versionId)
  assertLatestEditable(version)

  const currentDraft = version.draftDataJson || {}
  const currentHash = computeApprovalHash(currentDraft)
  currentDraft.approvalHash = currentHash
  currentDraft.approvedStatus = QuoteStatus.PENDING_APPROVAL
  
  // Lapse any older pending approval notifications for this quote
  const leadId = version.quoteGroup?.leadId
  const quoteLink = leadId ? `/leads/${leadId}/quotes/${versionId}` : null
  await repo.lapseApprovalNotifications(quoteLink)

  await repo.updateDraft(versionId, currentDraft)
  version = await repo.updateQuoteVersion(versionId, { status: QuoteStatus.PENDING_APPROVAL })

  const { meetsAutoApprove, details } = checkTierAutoApproval(version)
  const proposerName = await repo.getNotificationUserName(auth?.sub)

  if (meetsAutoApprove) {
    setTimeout(async () => {
      try {
        const current = await repo.getQuoteVersionById(versionId)
        if (current && current.status === QuoteStatus.PENDING_APPROVAL && current.draftDataJson?.approvalHash === currentHash) {
          
          const approvedDraft = current.draftDataJson || {}
          approvedDraft.approvedStatus = QuoteStatus.APPROVED
          await repo.updateDraft(versionId, approvedDraft)
          
          const title = current.quoteGroup?.title || 'Quote'
          const clientName = getProposalClientName(current.draftDataJson, current.quoteGroup)
          await repo.updateQuoteVersion(versionId, { status: QuoteStatus.APPROVED })
          await repo.createApproval(versionId, { note: 'Auto-approved by system (all tiers within 10% tolerance)' })
          await repo.createNotification({
            roleTarget: 'sales',
            title: 'Quote Auto-Approved ⚡',
            message: `Proposal for ${clientName} (${title}) was automatically approved.`,
            category: 'PROPOSAL',
            type: 'SUCCESS',
            linkUrl: current.quoteGroup?.leadId ? `/leads/${current.quoteGroup.leadId}/quotes/${versionId}` : undefined
          })
        }
      } catch (err) {
        console.error('Auto-approval error:', err)
      }
    }, 10000)
  } else {
    const flagged = details.filter(d => d.pct > 10)
    const reasonText = flagged.length > 0
      ? ' ' + flagged.map(d => `${d.tier}: ${d.pct}% off (Client: ₹${d.client.toLocaleString('en-IN')}, System: ₹${d.system.toLocaleString('en-IN')})`).join('; ')
      : ''
      const title = version.quoteGroup?.title || 'Quote'
      const clientName = getProposalClientName(version.draftDataJson, version.quoteGroup)
      await repo.createNotification({
      roleTarget: 'admin',
      title: 'Quote Approval Required 📝',
      message: `${proposerName} wants approval for ${clientName}'s proposal (${title}).${reasonText}`,
      category: 'PROPOSAL',
      type: 'WARNING',
      linkUrl: leadId ? `/leads/${leadId}/quotes/${versionId}` : undefined
    })
  }

  return version
}

const approveVersion = async (versionId, payload, auth) => {
  const version = await repo.getQuoteVersionById(versionId)
  if (!version) throwHttp(404, 'Quote version not found')
  
  const currentDraft = version.draftDataJson || {}
  currentDraft.approvalHash = computeApprovalHash(currentDraft)
  currentDraft.approvedStatus = QuoteStatus.APPROVED
  await repo.updateDraft(versionId, currentDraft)

  const updated = await repo.updateQuoteVersion(versionId, { status: QuoteStatus.APPROVED })
  const approverName = await repo.getNotificationUserName(auth?.sub || payload.approvedBy)
  const clientName = getProposalClientName(version.draftDataJson, version.quoteGroup)
  
  await repo.createApproval(versionId, {
    approvedBy: auth?.sub || payload.approvedBy,
    note: payload.note,
    approvedAt: new Date(),
  })
  
  await repo.createNotification({
    roleTarget: 'sales',
    title: 'Quote Approved ✅',
    message: `${clientName}'s quote was approved by ${approverName}.`,
    category: 'PROPOSAL',
    type: 'SUCCESS',
    linkUrl: `/leads/${version.quoteGroup?.leadId}/quotes/${versionId}`
  })

  return updated
}

const rejectVersion = async (versionId, payload, auth) => {
  const version = await repo.getQuoteVersionById(versionId)
  if (!version) throwHttp(404, 'Quote version not found')
  const updated = await repo.updateQuoteVersion(versionId, { status: QuoteStatus.ADMIN_REJECTED })
  
  const rejectorName = await repo.getNotificationUserName(auth?.sub || payload.rejectedBy)
  const clientName = getProposalClientName(version.draftDataJson, version.quoteGroup)

  if (payload.note) {
    await repo.createNegotiation(versionId, {
      type: NegotiationType.INTERNAL_NOTE,
      message: payload.note,
      createdBy: auth?.sub || payload.rejectedBy,
    })
  }
  
  await repo.createNotification({
    roleTarget: 'sales',
    title: 'Quote Disapproved ❌',
    message: `${clientName}'s quote was disapproved by ${rejectorName}. ${payload.note ? `Reason: ${payload.note}` : ''}`,
    category: 'PROPOSAL',
    type: 'ERROR',
    linkUrl: `/leads/${version.quoteGroup?.leadId}/quotes/${versionId}`
  })

  return updated
}

const sendQuote = async (versionId, expiresAt) => {
  const version = await repo.getQuoteVersionById(versionId)
  assertLatestEditable(version)

  const effective = getEffectivePrice(version)
  const minimum = toNumber(version.minimumPrice) ?? 0
  
  if (version.status === QuoteStatus.PENDING_APPROVAL) {
    throwHttp(400, 'Cannot send quote while it is pending admin approval')
  }
  
  if (effective < minimum && version.status !== QuoteStatus.APPROVED) {
    throwHttp(400, 'Approval required before sending below minimum price')
  }

  let draftData = version.draftDataJson || {}
  if (!draftData.expirySettings) draftData.expirySettings = {}
  if (!draftData.expirySettings.validUntil) {
    const dDate = new Date()
    dDate.setDate(dDate.getDate() + 14)
    draftData.expirySettings.validUntil = dDate.toISOString().split('T')[0]
    await repo.updateQuoteVersion(versionId, { draftDataJson: draftData })
    version.draftDataJson = draftData 
  }

  // Generate short 6-char token with collision check
  let token
  for (let attempt = 0; attempt < 5; attempt++) {
    token = crypto.randomBytes(4).toString('base64url').slice(0, 6)
    const existing = await repo.getProposalByToken(token)
    if (!existing) break
  }
  const safeSnapshot = await buildProposalSnapshot(version)
  
  // Set expiry to end-of-day IST (23:59:59 IST = 18:29:59 UTC)
  let finalExpiresAt = null
  if (draftData.expirySettings.validUntil) {
    const [y, m, d] = draftData.expirySettings.validUntil.split('-').map(Number)
    finalExpiresAt = new Date(Date.UTC(y, m - 1, d, 18, 29, 59))
  }

  await repo.createProposalSnapshot(versionId, {
    proposalToken: token,
    snapshotJson: safeSnapshot,
    expiresAt: finalExpiresAt,
  })

  await repo.updateQuoteVersion(versionId, { status: QuoteStatus.SENT })
  await repo.expireOtherVersions(version.quoteGroupId, versionId)

  return { proposalToken: token, status: QuoteStatus.SENT }
}

const buildProposalSnapshot = async (version) => {
  const items = version.items || []
  const itemSnapshots = []
  for (const item of items) {
    const name = await repo.getCatalogLabel(item.itemType, item.catalogId)
    itemSnapshots.push({
      type: item.itemType,
      name: name || 'Item',
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      totalPrice: Number(item.totalPrice || 0),
    })
  }

  let calculatedPrice = toNumber(version.calculatedPrice)
  const itemTotal = itemSnapshots.reduce((acc, it) => acc + (it.totalPrice || 0), 0)
  if (!calculatedPrice || calculatedPrice === 0) calculatedPrice = itemTotal

  const override = toNumber(version.salesOverridePrice)
  const effectivePrice = (override !== null && !Number.isNaN(override)) ? override : calculatedPrice

  return {
    quoteTitle: version.quoteGroup?.title || 'Proposal',
    versionNumber: version.versionNumber,
    status: version.status,
    calculatedPrice: calculatedPrice,
    salesOverridePrice: override,
    effectivePrice: effectivePrice,
    targetPrice: toNumber(version.targetPrice),
    softDiscountPrice: toNumber(version.softDiscountPrice),
    minimumPrice: toNumber(version.minimumPrice),
    items: itemSnapshots,
    draftData: version.draftDataJson || null,
    createdAt: version.createdAt,
  }
}

const ensureProposalAccessible = async (snapshot) => {
  if (!snapshot) throwHttp(404, 'Proposal not found')

  // Determine effective expiry: DB field first, then fallback to draft data
  let effectiveExpiry = snapshot.expiresAt ? new Date(snapshot.expiresAt) : null
  if (!effectiveExpiry) {
    const validUntil = snapshot.snapshotJson?.draftData?.expirySettings?.validUntil
    if (validUntil) {
      const [y, m, d] = validUntil.split('-').map(Number)
      effectiveExpiry = new Date(Date.UTC(y, m - 1, d, 18, 29, 59)) // 23:59:59 IST
      // Backfill the DB so future checks are instant
      await repo.updateQuoteVersion(snapshot.id, {}).catch(() => {})
      // Actually update the snapshot record
      const { prisma } = require('./prisma')
      await prisma.proposalSnapshot.update({ where: { id: snapshot.id }, data: { expiresAt: effectiveExpiry } }).catch(() => {})
    }
  }

  if (effectiveExpiry && effectiveExpiry.getTime() < Date.now()) {
    if (snapshot.quoteVersion?.id && snapshot.quoteVersion?.status === QuoteStatus.SENT) {
      await repo.updateQuoteVersion(snapshot.quoteVersion.id, { status: 'EXPIRED' })
      
      // Notify Sales
      await repo.createNotification({
        roleTarget: 'sales',
        title: 'Proposal Expired',
        message: `Proposal expired for: ${snapshot.quoteVersion?.quoteGroup?.title || snapshot.snapshotJson?.quoteTitle}`,
        category: 'PROPOSAL',
        type: 'WARNING',
        linkUrl: `/proposalanalytics/${snapshot.id}`
      })
    }
    const err = new Error('This proposal has expired. Please contact us for a revised quotation.')
    err.statusCode = 410
    err.code = 'PROPOSAL_EXPIRED'
    throw err
  }
  if (snapshot.quoteVersion?.status !== QuoteStatus.SENT && snapshot.quoteVersion?.status !== QuoteStatus.ACCEPTED) {
    throwHttp(404, 'Proposal not found')
  }
}

const getProposalSnapshot = async (token) => {
  const snapshot = await repo.getProposalByToken(token)
  await ensureProposalAccessible(snapshot)
  const data = snapshot.snapshotJson || {}
  
  // Real-time prune deleted testimonials from snapshot
  const activeIds = new Set(await repo.getActiveTestimonialIds())
  if (data.draftData && Array.isArray(data.draftData.testimonials)) {
    data.draftData.testimonials = data.draftData.testimonials.filter(t => t && activeIds.has(Number(t.id)))
  }
  
  // Retroactively fix missing totals in existing snapshots
  if (!data.effectivePrice || data.effectivePrice === 0) {
    const items = data.items || []
    const itemTotal = items.reduce((acc, it) => acc + (it.totalPrice || 0), 0)
    if (itemTotal > 0) {
      data.calculatedPrice = data.calculatedPrice || itemTotal
      data.effectivePrice = data.salesOverridePrice || data.calculatedPrice
    }
  }

  if (snapshot.expiresAt) {
    data.expiresAt = snapshot.expiresAt
  }

  if (snapshot.quoteVersion) {
    data.status = snapshot.quoteVersion.status
  }

  return data
}

const trackProposalView = async (token, meta) => {
  // Primary check: if viewer has a valid CRM login cookie, they're staff — skip logging
  if (meta?.req) {
    try {
      const authToken = (meta.req.cookies && meta.req.cookies['mv_auth']) || null
      if (authToken) {
        // Use fastify's built-in JWT verify (req.jwtVerify is available on fastify requests)
        const decoded = await meta.req.server.jwt.verify(authToken)
        if (decoded && decoded.sub) {
          // Also save their current IP so future IP-only checks work too
          if (meta.ip) {
            const { pool } = require('../../db.ts')
            pool.query('INSERT INTO known_internal_ips (ip) VALUES ($1) ON CONFLICT (ip) DO UPDATE SET last_seen_at = NOW()', [meta.ip]).catch(() => {})
          }
          return { success: true }
        }
      }
    } catch (e) { /* cookie invalid or expired — treat as external client */ }
  }
  // Secondary check: IP-based filtering
  if (meta?.ip && await repo.isInternalIp(meta.ip)) return
  const snapshot = await repo.getProposalByToken(token)
  await ensureProposalAccessible(snapshot)
  await repo.createProposalView(snapshot.id, meta)
  await repo.incrementProposalView(token)
  
  const isFirstTime = (snapshot.viewCount || 0) === 0
  const viewTypeTitle = isFirstTime ? 'Proposal Viewed (First Time) 👀' : 'Proposal Viewed Again'
  const notifType = isFirstTime ? 'SUCCESS' : 'INFO'
  const json = snapshot.snapshotJson || {}
  const draft = json.draftData || {}
  const hero = draft.hero || {}

  const bride = (hero.brideName || hero.bride_name || draft.brideName || draft.bride_name || '').trim()
  const groom = (hero.groomName || hero.groom_name || draft.groomName || draft.groom_name || '').trim()
  const lead = (hero.leadName || hero.lead_name || draft.leadName || draft.lead_name || '').trim()
  const cNames = (hero.coupleNames || hero.couple_names || draft.coupleNames || draft.couple_names || '').trim()

  let clientName = cNames || (bride && groom ? `${bride} & ${groom}` : lead)
  if (!clientName) clientName = 'A client'

  const proposalTitle = snapshot.quoteVersion?.quoteGroup?.title || json.quoteTitle || 'Proposal'
  
  // Notify Sales
  await repo.createNotification({
    roleTarget: 'sales',
    title: viewTypeTitle,
    message: `${clientName} is currently viewing: ${proposalTitle}`,
    category: 'PROPOSAL',
    type: notifType,
    linkUrl: `/proposalanalytics/${snapshot.id}`
  })
  
  return { success: true }
}

const Razorpay = require('razorpay')

const acceptProposal = async (token, { tierId } = {}) => {
  const snapshot = await repo.getProposalByToken(token)
  await ensureProposalAccessible(snapshot)
  
  const version = await repo.getQuoteVersionById(snapshot.quoteVersionId)
  const draft = version.draftDataJson || {}

  let baseAmount = 0
  let isRazorpayEligible = false

  if (tierId && draft.tiers) {
     const tier = draft.tiers.find(t => t.id === tierId)
     if (tier) {
        baseAmount = Number(tier.discountedPrice ?? tier.overridePrice ?? tier.price ?? 0)
        const name = (tier.name || '').toLowerCase()
        // Ensure only 'essential' and 'signature' trigger Razorpay in tier mode
        if (name.includes('essential') || name.includes('signature')) {
            isRazorpayEligible = true
        }
     }
  } else {
     // Single pricing mode -> auto-eligible
     baseAmount = Number(snapshot.salesOverridePrice ?? snapshot.calculatedPrice ?? 0)
     isRazorpayEligible = true
  }

  // Generate Razorpay Link if Eligible
  if (isRazorpayEligible && baseAmount > 0) {
      const advanceBase = Math.round(baseAmount * 0.25)
      const afterGst = Math.round(advanceBase * 1.18)

      const rzp = new Razorpay({ 
        key_id: process.env.RAZORPAY_KEY_ID || '', 
        key_secret: process.env.RAZORPAY_KEY_SECRET || '' 
      })

      const fe = process.env.FRONTEND_URL || 'http://localhost:3000'
      const coupleNames = draft.hero?.coupleNames || snapshot.quoteVersion?.quoteGroup?.leadId || 'Client'

      try {
        const link = await rzp.paymentLink.create({
            amount: afterGst * 100, // in paise
            currency: 'INR',
            accept_partial: false,
            description: `Advance for ${snapshot.quoteVersion?.quoteGroup?.title || snapshot.snapshotJson?.quoteTitle}`,
            customer: { name: String(coupleNames) },
            notes: {
              token: token,
              tierId: tierId || ''
            },
            notify: { sms: false, email: false }, 
            reminder_enable: false,
            callback_url: `${fe}/p/${token}?payment=success&tierId=${tierId || ''}`,
            callback_method: 'get'
        })
        return { success: true, paymentUrl: link.short_url }
      } catch (err) {
        console.error('Razorpay Error:', err)
        throwHttp(500, 'Failed to generate payment link. Please try again.')
      }
  }

  // Fallback: Non-Razorpay tiers (e.g. high-end custom tiers) skip payment gate
  const updatePayload = { status: QuoteStatus.ACCEPTED }
  
  if (tierId) {
     draft.selectedTierId = tierId
     updatePayload.draftDataJson = draft
     const tier = draft.tiers?.find(t => t.id === tierId)
     if (tier) {
        updatePayload.salesOverridePrice = tier.price
        updatePayload.overrideReason = `Client selected ${tier.name} tier`
     }
  }
  
  await repo.updateQuoteVersion(snapshot.quoteVersionId, updatePayload)
  
  await repo.createNotification({
    roleTarget: 'sales',
    title: 'Proposal Accepted 🎉',
    message: `Client accepted proposal: ${snapshot.quoteVersion?.quoteGroup?.title || snapshot.snapshotJson?.quoteTitle}.`,
    category: 'PROPOSAL',
    type: 'SUCCESS',
    linkUrl: `/proposalanalytics/${snapshot.id}`
  })
  
  return { success: true, event: 'QUOTE_ACCEPTED' }
}

const confirmPayment = async (token, { tierId } = {}) => {
  const snapshot = await repo.getProposalByToken(token)
  await ensureProposalAccessible(snapshot)
  
  const version = await repo.getQuoteVersionById(snapshot.quoteVersionId)
  if (version.status === QuoteStatus.ACCEPTED) {
     return { success: true, message: 'Already accepted' }
  }

  const updatePayload = { status: QuoteStatus.ACCEPTED }
  const draft = version.draftDataJson || {}
  
  if (tierId) {
     draft.selectedTierId = tierId
     updatePayload.draftDataJson = draft
     const tier = draft.tiers?.find((t) => t.id === tierId)
     if (tier) {
        updatePayload.salesOverridePrice = tier.price
        updatePayload.overrideReason = `Client selected ${tier.name} tier`
     }
  }
  
  await repo.updateQuoteVersion(snapshot.quoteVersionId, updatePayload)
  
  await repo.createNotification({
    roleTarget: 'sales',
    title: 'Proposal Accepted 🎉',
    message: `Client paid advance and accepted proposal: ${snapshot.quoteVersion?.quoteGroup?.title || snapshot.snapshotJson?.quoteTitle}.`,
    category: 'PROPOSAL',
    type: 'SUCCESS',
    linkUrl: `/proposalanalytics/${snapshot.id}`
  })
  
  return { success: true, event: 'QUOTE_ACCEPTED_AFTER_PAYMENT' }
}

const requestAddons = async (token, { addonIds } = {}) => {
  const snapshot = await repo.getProposalByToken(token)
  await ensureProposalAccessible(snapshot)
  
  if (!addonIds || !Array.isArray(addonIds) || addonIds.length === 0) {
    throwHttp(400, 'No addons selected')
  }

  const addonDetails = await repo.getAddonsByIds(addonIds)
  const summary = addonDetails.map(a => `${a.name} (₹${a.price})`).join(', ')
  const leadId = snapshot.quoteVersion.quoteGroup.leadId

  await repo.createLeadActivity(leadId, 'PROPOSAL_ADDON_REQUESTED', {
    token,
    addonIds,
    summary,
    note: `Client requested add-ons: ${summary}`
  })

  await repo.createLeadNote(leadId, `[PROPOSAL] Client requested add-ons: ${summary}`)

  await repo.createNotification({
    roleTarget: 'sales',
    title: 'Client Requested Add-ons 🛒',
    message: `Client requested add-ons: ${summary}`,
    category: 'PROPOSAL',
    type: 'WARNING',
    linkUrl: `/proposalanalytics/${snapshot.id}`
  })

  return { success: true }
}

const provideFeedback = async (token, { action, reason } = {}) => {
  const snapshot = await repo.getProposalByToken(token)
  await ensureProposalAccessible(snapshot)
  const leadId = snapshot.quoteVersion.quoteGroup.leadId

  let notifTitle = 'Proposal Feedback'
  let notifMessage = ''
  let notifType = 'INFO'

  if (action === 'decline') {
    await repo.updateQuoteVersion(snapshot.quoteVersionId, { status: 'REJECTED' })
    await repo.createLeadActivity(leadId, 'PROPOSAL_DECLINED', { token, reason, note: `Client declined proposal. Reason: ${reason}` })
    await repo.createLeadNote(leadId, `[PROPOSAL] Client declined proposal. Reason: ${reason}`)
    notifTitle = 'Client Clicked "Not a Fit" ❌'
    notifMessage = `Client declined proposal. Reason: ${reason}`
    notifType = 'ERROR'
  } else if (action === 'adjust') {
    await repo.createLeadActivity(leadId, 'PROPOSAL_ADJUSTMENT_REQUESTED', { token, reason, note: `Client requested adjustment. Focus: ${reason}` })
    await repo.createLeadNote(leadId, `[PROPOSAL] Client requested plan adjustment. Focus: ${reason}`)
    notifTitle = 'Client Clicked "Adjust This Plan" 🛠️'
    notifMessage = `Client requested adjustment. Priority: ${reason}`
    notifType = 'WARNING'
  } else if (action === 'callback') {
    await repo.createLeadActivity(leadId, 'PROPOSAL_CALLBACK_REQUESTED', { token, note: `Client requested a bespoke callback.` })
    await repo.createLeadNote(leadId, `[PROPOSAL] Client requested a bespoke callback.`)
    notifTitle = 'Callback / Reserve Date Requested 📞'
    notifMessage = `Client requested a callback / reserved their date.`
    notifType = 'WARNING'
  } else {
    throwHttp(400, 'Invalid feedback action')
  }

  await repo.createNotification({
    roleTarget: 'sales',
    title: notifTitle,
    message: notifMessage,
    category: 'PROPOSAL',
    type: notifType,
    linkUrl: `/proposalanalytics/${snapshot.id}`
  })

  return { success: true }
}

const handleRazorpayWebhook = async ({ body, rawBody, signature }) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) return { success: true, message: 'Webhook secret not configured, skipping.' }

  const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  if (expectedSignature !== signature) {
     throwHttp(400, 'Invalid signature')
  }

  const { event, payload } = body
  if (event === 'payment_link.paid') {
     const paymentLink = payload.payment_link && payload.payment_link.entity
     if (!paymentLink || !paymentLink.notes) return { success: true }

     const { token, tierId } = paymentLink.notes
     if (token) {
        // Find proposal by token
        const snapshot = await repo.getProposalByToken(token).catch(() => null)
        if (snapshot) {
           const version = await repo.getQuoteVersionById(snapshot.quoteVersionId)
           if (version.status !== QuoteStatus.ACCEPTED) {
               const updatePayload = { status: QuoteStatus.ACCEPTED }
               const draft = version.draftDataJson || {}
               if (tierId) {
                  draft.selectedTierId = tierId
                  updatePayload.draftDataJson = draft
                  const tier = draft.tiers?.find((t) => t.id === tierId)
                  if (tier) {
                     updatePayload.salesOverridePrice = tier.price
                     updatePayload.overrideReason = `Client selected ${tier.name} tier via Webhook`
                  }
               }
               await repo.updateQuoteVersion(snapshot.quoteVersionId, updatePayload)
               
               await repo.createNotification({
                 roleTarget: 'sales',
                 title: 'Payment Received 🎉',
                 message: `Client securely paid via Razorpay and accepted proposal: ${version.quoteGroup?.title}.`,
                 category: 'PROPOSAL',
                 type: 'SUCCESS',
                 linkUrl: `/proposalanalytics/${snapshot.id}`
               })
           }
        }
     }
  }

  return { success: true }
}

module.exports = {
  createQuoteGroup,
  listQuoteGroups,
  deleteQuoteGroup,
  createQuoteVersion,
  listQuoteVersions,
  getQuoteVersion,
  deleteQuoteVersion,
  updateQuoteGroup,
  updateQuoteVersion,
  updateDraft,
  addPricingItems,
  calculatePricing,
  addNegotiation,
  listNegotiations,
  submitForApproval,
  approveVersion,
  rejectVersion,
  sendQuote,
  getProposalSnapshot,
  trackProposalView,
  acceptProposal,
  confirmPayment,
  requestAddons,
  provideFeedback,
  handleRazorpayWebhook
}
