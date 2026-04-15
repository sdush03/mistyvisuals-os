const service = require('./quotation.service')

const handle = (fn) => async (req, reply) => {
  try {
    const data = await fn(req, reply)
    if (data === undefined) return
    return reply.send(data)
  } catch (err) {
    const status = err.statusCode || 500
    reply.code(status).send({ error: err.message || 'Unexpected error', code: err.code })
  }
}

const createQuoteGroup = handle(async (req) => {
  const { leadId, title } = req.body
  return service.createQuoteGroup({ leadId, title })
})

const listQuoteGroups = handle(async (req) => {
  const { leadId } = req.params
  const { limit, offset } = req.query || {}
  return service.listQuoteGroups(leadId, { limit, offset })
})

const updateQuoteGroup = handle(async (req) => {
  const { id } = req.params
  return service.updateQuoteGroup(id, req.body)
})

const deleteQuoteGroup = handle(async (req) => {
  const { id } = req.params
  return service.deleteQuoteGroup(id)
})

const createQuoteVersion = handle(async (req) => {
  const { groupId } = req.params
  return service.createQuoteVersion(groupId, req.body || {})
})

const listQuoteVersions = handle(async (req) => {
  const { groupId } = req.params
  const { limit, offset } = req.query || {}
  return service.listQuoteVersions(groupId, { limit, offset })
})

const deleteQuoteVersion = handle(async (req) => {
  await service.deleteQuoteVersion(req.params.id)
  return { success: true }
})

const getQuoteVersion = handle(async (req) => {
  const { id } = req.params
  return service.getQuoteVersion(id)
})

const updateQuoteVersion = handle(async (req) => {
  const { id } = req.params
  return service.updateQuoteVersion(id, req.body || {})
})

const updateDraft = handle(async (req) => {
  const { id } = req.params
  return service.updateDraft(id, req.body.draftDataJson)
})

const addPricingItems = handle(async (req) => {
  const { id } = req.params
  return service.addPricingItems(id, req.body.items || [])
})

const calculatePricing = handle(async (req) => {
  const { id } = req.params
  return service.calculatePricing(id)
})

const addNegotiation = handle(async (req) => {
  const { id } = req.params
  return service.addNegotiation(id, req.body || {})
})

const listNegotiations = handle(async (req) => {
  const { id } = req.params
  const { limit, offset } = req.query || {}
  return service.listNegotiations(id, { limit, offset })
})

const submitVersion = handle(async (req) => {
  const { id } = req.params
  return service.submitForApproval(id, req.body?.note)
})

const approveVersion = handle(async (req) => {
  const { id } = req.params
  return service.approveVersion(id, req.body || {})
})

const rejectVersion = handle(async (req) => {
  const { id } = req.params
  return service.rejectVersion(id, req.body || {})
})

const sendVersion = handle(async (req) => {
  const { id } = req.params
  return service.sendQuote(id, req.body?.expiresAt)
})

const getProposal = handle(async (req) => {
  const { token } = req.params
  return service.getProposalSnapshot(token)
})

const viewProposal = handle(async (req) => {
  const { token } = req.params
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    null
  const device = req.headers['user-agent'] || null
  return service.trackProposalView(token, { ip, device })
})

const acceptProposal = handle(async (req) => {
  const { token } = req.params
  return service.acceptProposal(token, req.body || {})
})

const confirmPayment = handle(async (req) => {
  const { token } = req.params
  return service.confirmPayment(token, req.body || {})
})

const requestAddons = handle(async (req) => {
  const { token } = req.params
  return service.requestAddons(token, req.body || {})
})

const provideFeedback = handle(async (req) => {
  const { token } = req.params
  return service.provideFeedback(token, req.body || {})
})

const handleRazorpayWebhook = async (req, reply) => {
  try {
    const rawBody = req.rawBody || ''
    const signature = req.headers['x-razorpay-signature']
    // We pass req.body instead of parsing rawBody since Fastify already parses JSON. 
    await service.handleRazorpayWebhook({ body: req.body, rawBody, signature })
    return reply.send({ status: 'ok' })
  } catch (err) {
    req.log.error('Webhook error:', err)
    return reply.code(400).send({ error: 'Webhook processing failed' })
  }
}

module.exports = {
  createQuoteGroup,
  listQuoteGroups,
  deleteQuoteGroup,
  createQuoteVersion,
  listQuoteVersions,
  getQuoteVersion,
  deleteQuoteVersion,
  updateQuoteVersion,
  updateDraft,
  addPricingItems,
  calculatePricing,
  addNegotiation,
  listNegotiations,
  submitVersion,
  approveVersion,
  rejectVersion,
  showProposedPriceToClient: true,
  sendVersion,
  getProposal,
  viewProposal,
  acceptProposal,
  confirmPayment,
  requestAddons,
  provideFeedback,
  handleRazorpayWebhook,
  updateQuoteGroup
}
