const { prisma } = require('./prisma')
const { pool } = require('../../db.ts')

const DEFAULT_LIMIT = 50

const leadExists = async (leadId) => {
  const r = await pool.query('SELECT id FROM leads WHERE id=$1', [leadId])
  return r.rows.length > 0
}

const syncLeadPricing = async (leadId, amountQuoted, discountedAmount) => {
  return pool.query(
    'UPDATE leads SET amount_quoted=$1, discounted_amount=$2 WHERE id=$3',
    [amountQuoted || null, discountedAmount || null, leadId]
  )
}

const getQuoteGroupById = (id) =>
  prisma.quoteGroup.findUnique({ where: { id: Number(id) } })

const createQuoteGroup = (leadId, title) =>
  prisma.quoteGroup.create({
    data: {
      leadId: Number(leadId),
      title: String(title),
    },
  })

const updateQuoteGroup = (id, data) =>
  prisma.quoteGroup.update({
    where: { id: Number(id) },
    data,
  })

const listQuoteGroupsByLead = (leadId, { limit, offset }) =>
  prisma.quoteGroup.findMany({
    where: { leadId: Number(leadId) },
    orderBy: { createdAt: 'desc' },
    take: limit ?? DEFAULT_LIMIT,
    skip: offset ?? 0,
  })

const deleteQuoteGroup = (id) =>
  prisma.quoteGroup.delete({ where: { id: Number(id) } })

const deleteQuoteVersion = (id) =>
  prisma.quoteVersion.delete({ where: { id: Number(id) } })

const getQuoteVersionById = (id) =>
  prisma.quoteVersion.findUnique({
    where: { id: Number(id) },
    include: {
      quoteGroup: true,
      items: true,
      negotiations: true,
      approvals: true,
      proposalSnapshots: { orderBy: { createdAt: 'desc' }, take: 1, select: { proposalToken: true } },
    },
  })

const listQuoteVersions = (groupId, { limit, offset }) =>
  prisma.quoteVersion.findMany({
    where: { quoteGroupId: Number(groupId) },
    orderBy: { versionNumber: 'desc' },
    take: limit ?? DEFAULT_LIMIT,
    skip: offset ?? 0,
    include: {
      items: true,
      proposalSnapshots: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, proposalToken: true } },
    },
  })

const getLatestQuoteVersion = (groupId) =>
  prisma.quoteVersion.findFirst({
    where: { quoteGroupId: Number(groupId) },
    orderBy: { versionNumber: 'desc' },
    include: { items: true },
  })

const createQuoteVersion = async (groupId, payload) => {
  return prisma.$transaction(async (tx) => {
    const max = await tx.quoteVersion.aggregate({
      where: { quoteGroupId: Number(groupId) },
      _max: { versionNumber: true },
    })
    const nextVersion = (max._max.versionNumber || 0) + 1

    await tx.quoteVersion.updateMany({
      where: { quoteGroupId: Number(groupId), isLatest: true },
      data: { isLatest: false },
    })

    return tx.quoteVersion.create({
      data: {
        quoteGroupId: Number(groupId),
        versionNumber: nextVersion,
        status: payload.status,
        calculatedPrice: payload.calculatedPrice ?? null,
        salesOverridePrice: payload.salesOverridePrice ?? null,
        overrideReason: payload.overrideReason ?? null,
        targetPrice: payload.targetPrice ?? null,
        softDiscountPrice: payload.softDiscountPrice ?? null,
        minimumPrice: payload.minimumPrice ?? null,
        draftDataJson: payload.draftDataJson ?? null,
        isLatest: true,
        createdBy: payload.createdBy ?? null,
      },
    })
  })
}

const listActivePricingRules = () =>
  prisma.pricingRule.findMany({
    where: { active: true },
    orderBy: { priority: 'desc' },
  })

const getTeamRoleById = (id) =>
  prisma.teamRoleCatalog.findUnique({ where: { id: Number(id) } })

const getDeliverableById = (id) =>
  prisma.deliverableCatalog.findUnique({ where: { id: Number(id) } })

const expireOtherVersions = (groupId, currentVersionId) =>
  prisma.quoteVersion.updateMany({
    where: {
      quoteGroupId: Number(groupId),
      id: { not: Number(currentVersionId) },
      status: { notIn: ['ACCEPTED', 'REJECTED', 'EXPIRED'] },
    },
    data: { status: 'EXPIRED' },
  })

const findTeamRoleByName = (name) =>
  prisma.teamRoleCatalog.findFirst({
    where: { name: { equals: String(name || '').trim(), mode: 'insensitive' } },
  })

const getAllTeamRoles = () => prisma.teamRoleCatalog.findMany({ where: { active: true } })

const findDeliverableByName = (name) =>
  prisma.deliverableCatalog.findFirst({
    where: { name: { equals: String(name || '').trim(), mode: 'insensitive' } },
  })

const getAllDeliverables = () => prisma.deliverableCatalog.findMany({ where: { active: true } })

const getLeadRuleContext = async (leadId) => {
  const r = await pool.query(
    `
    SELECT
      l.id,
      COALESCE(l.is_destination, false) AS destination,
      COALESCE(ev.event_count, 0)::int AS event_count,
      COALESCE(ev.max_pax, 0)::int AS pax
    FROM leads l
    LEFT JOIN (
      SELECT lead_id,
             COUNT(*)::int AS event_count,
             MAX(COALESCE(pax, 0))::int AS max_pax
      FROM lead_events
      WHERE lead_id = $1
      GROUP BY lead_id
    ) ev ON ev.lead_id = l.id
    WHERE l.id = $1
    `,
    [Number(leadId)]
  )
  if (!r.rows.length) return null
  return r.rows[0]
}

const updateQuoteVersion = (id, data) =>
  prisma.quoteVersion.update({
    where: { id: Number(id) },
    data,
  })

const updateDraft = (id, draftDataJson) =>
  prisma.quoteVersion.update({
    where: { id: Number(id) },
    data: { draftDataJson },
  })

const replacePricingItems = async (versionId, items) => {
  return prisma.$transaction(async (tx) => {
    await tx.quotePricingItem.deleteMany({ where: { quoteVersionId: Number(versionId) } })
    return tx.quotePricingItem.createMany({ data: items })
  })
}

const copyPricingItems = async (fromId, toId) => {
  const items = await prisma.quotePricingItem.findMany({ where: { quoteVersionId: Number(fromId) } })
  const cloned = items.map(it => {
    const { id, createdAt, updatedAt, ...rest } = it
    return { ...rest, quoteVersionId: Number(toId) }
  })
  if (cloned.length > 0) return prisma.quotePricingItem.createMany({ data: cloned })
  return []
}

const createNegotiation = (versionId, payload) =>
  prisma.quoteNegotiation.create({
    data: {
      quoteVersionId: Number(versionId),
      type: payload.type,
      message: payload.message,
      createdBy: payload.createdBy ?? null,
    },
  })

const listNegotiations = (versionId, { limit, offset }) =>
  prisma.quoteNegotiation.findMany({
    where: { quoteVersionId: Number(versionId) },
    orderBy: { createdAt: 'desc' },
    take: limit ?? DEFAULT_LIMIT,
    skip: offset ?? 0,
  })

const withIST = (fn) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TIME ZONE 'Asia/Kolkata'")
    return fn(tx)
  })

const createApproval = (versionId, payload) =>
  withIST((tx) =>
    tx.quoteApproval.create({
      data: {
        quoteVersionId: Number(versionId),
        approvedBy: payload.approvedBy ?? null,
        approvedAt: payload.approvedAt ?? new Date(),
        note: payload.note ?? null,
      },
    })
  )

const createProposalSnapshot = (versionId, payload) =>
  withIST((tx) =>
    tx.proposalSnapshot.create({
      data: {
        quoteVersionId: Number(versionId),
        proposalToken: payload.proposalToken,
        snapshotJson: payload.snapshotJson,
        expiresAt: payload.expiresAt ?? null,
      },
    })
  )

const getProposalByToken = (token) =>
  prisma.proposalSnapshot.findUnique({
    where: { proposalToken: token },
    include: { 
      quoteVersion: {
        include: {
          quoteGroup: true
        }
      }
    },
  })

const incrementProposalView = (token) =>
  withIST((tx) =>
    tx.proposalSnapshot.update({
      where: { proposalToken: token },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: new Date(),
      },
    })
  )

const createProposalView = (snapshotId, payload) =>
  withIST((tx) =>
    tx.proposalView.create({
      data: {
        proposalSnapshotId: Number(snapshotId),
        ip: payload.ip ?? null,
        device: payload.device ?? null,
      },
    })
  )

const isInternalIp = async (ip) => {
  if (!ip) return false
  const r = await prisma.$queryRaw`
    SELECT 1 FROM known_internal_ips WHERE ip = ${ip}
    UNION
    SELECT 1 FROM admin_audit_log WHERE ip = ${ip} LIMIT 1
  `
  return Array.isArray(r) && r.length > 0
}

const getCatalogPrice = async (itemType, catalogId) => {
  if (itemType === 'TEAM_ROLE') {
    const role = await prisma.teamRoleCatalog.findUnique({ where: { id: Number(catalogId) } })
    return role ? Number(role.price) : null
  }
  const deliverable = await prisma.deliverableCatalog.findUnique({ where: { id: Number(catalogId) } })
  return deliverable ? Number(deliverable.price) : null
}

const getCatalogLabel = async (itemType, catalogId) => {
  if (itemType === 'TEAM_ROLE') {
    const role = await prisma.teamRoleCatalog.findUnique({ where: { id: Number(catalogId) } })
    return role ? role.name : null
  }
  const deliverable = await prisma.deliverableCatalog.findUnique({ where: { id: Number(catalogId) } })
  return deliverable ? deliverable.name : null
}

const getRandomCoverPhotos = async (limit = 2) => {
  const r = await pool.query(
    `SELECT file_url FROM photo_library WHERE 'cover' = ANY(tags) ORDER BY random() LIMIT $1`,
    [limit]
  )
  return r.rows.map(row => row.file_url)
}

module.exports = {
  leadExists,
  getQuoteGroupById,
  createQuoteGroup,
  listQuoteGroupsByLead,
  deleteQuoteGroup,
  getQuoteVersionById,
  listQuoteVersions,
  createQuoteVersion,
  updateQuoteVersion,
  updateDraft,
  replacePricingItems,
  createNegotiation,
  listNegotiations,
  createApproval,
  isInternalIp,
  createProposalSnapshot,
  getProposalByToken,
  incrementProposalView,
  createProposalView,
  getCatalogPrice,
  getCatalogLabel,
  listActivePricingRules,
  getTeamRoleById,
  getAllTeamRoles,
  getDeliverableById,
  expireOtherVersions,
  getAllDeliverables,
  findTeamRoleByName,
  findDeliverableByName,
  getLeadRuleContext,
  deleteQuoteVersion,
  getLatestQuoteVersion,
  copyPricingItems,
  getRandomCoverPhotos,
  getActiveTestimonialIds: async () => {
    const r = await pool.query('SELECT id FROM testimonials')
    return r.rows.map(row => Number(row.id))
  },
  getAddonsByIds: async (ids) => {
    const r = await pool.query('SELECT id, name, price FROM deliverable_catalog WHERE id = ANY($1)', [ids])
    return r.rows
  },
  createLeadActivity: async (leadId, type, metadata) => {
    return pool.query(
      'INSERT INTO lead_activities (lead_id, activity_type, metadata) VALUES ($1, $2, $3)',
      [leadId, type, JSON.stringify(metadata)]
    )
  },
  createLeadNote: async (leadId, noteText) => {
    return pool.query(
      'INSERT INTO lead_notes (lead_id, note_text) VALUES ($1, $2)',
      [leadId, noteText]
    )
  },
  syncLeadPricing,
  createNotification: async ({ userId = null, roleTarget = null, title, message, category, type = 'INFO', linkUrl = null }) => {
    try {
      await pool.query(`
        INSERT INTO notifications (user_id, role_target, title, message, category, type, link_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [userId, roleTarget, title, message, category, type, linkUrl])

      // Cleanup: Fire and forget
      pool.query(`DELETE FROM notifications WHERE is_read = true AND created_at < NOW() - INTERVAL '30 days';`).catch(() => {})
      
      if (userId) {
        pool.query(`
          DELETE FROM notifications 
          WHERE id IN (
            SELECT id FROM notifications WHERE user_id = $1 ORDER BY created_at DESC OFFSET 1000
          )
        `, [userId]).catch(() => {})
      } else if (roleTarget) {
        pool.query(`
          DELETE FROM notifications 
          WHERE id IN (
            SELECT id FROM notifications WHERE role_target = $1 ORDER BY created_at DESC OFFSET 1000
          )
        `, [roleTarget]).catch(() => {})
      }
    } catch (err) {
      console.warn('Failed to create notification:', err?.message || err)
    }
  },
  lapseApprovalNotifications: async (linkUrl) => {
    if (!linkUrl) return
    try {
      await pool.query(`
        UPDATE notifications 
        SET is_read = true, read_at = NOW() 
        WHERE link_url = $1 AND is_read = false AND category = 'PROPOSAL'
      `, [linkUrl])
    } catch (err) {
      console.warn('Failed to lapse old notifications:', err?.message || err)
    }
  },
  updateQuoteGroup,
}
