const controller = require('./quotation.controller')
const schema = require('./quotation.schema')

async function quotationRoutes(fastify) {
  fastify.post('/quote-groups', { schema: schema.createQuoteGroup }, controller.createQuoteGroup)
  fastify.get('/leads/:leadId/quote-groups', { schema: { params: schema.leadIdParam, querystring: schema.paginationQuery } }, controller.listQuoteGroups)
  fastify.patch('/quote-groups/:id', { schema: { params: schema.idParam, body: schema.updateQuoteGroup } }, controller.updateQuoteGroup)
  fastify.delete('/quote-groups/:id', { schema: { params: schema.idParam } }, controller.deleteQuoteGroup)

  fastify.post('/quote-groups/:groupId/versions', { schema: { params: schema.groupIdParam, ...schema.createQuoteVersion } }, controller.createQuoteVersion)
  fastify.get('/quote-groups/:groupId/versions', { schema: { params: schema.groupIdParam, querystring: schema.paginationQuery } }, controller.listQuoteVersions)
  fastify.get('/quote-versions/:id', { schema: { params: schema.idParam } }, controller.getQuoteVersion)
  fastify.patch('/quote-versions/:id', { schema: { params: schema.idParam, ...schema.updateQuoteVersion } }, controller.updateQuoteVersion)
  fastify.delete('/quote-versions/:id', { schema: { params: schema.idParam } }, controller.deleteQuoteVersion)

  fastify.patch('/quote-versions/:id/draft', { schema: { params: schema.idParam, ...schema.draftAutosave } }, controller.updateDraft)

  fastify.post('/quote-versions/:id/pricing-items', { schema: { params: schema.idParam, ...schema.addPricingItems } }, controller.addPricingItems)
  fastify.post('/quote-versions/:id/calculate', { schema: { params: schema.idParam } }, controller.calculatePricing)

  fastify.post('/quote-versions/:id/negotiations', { schema: { params: schema.idParam, ...schema.negotiationCreate } }, controller.addNegotiation)
  fastify.get('/quote-versions/:id/negotiations', { schema: { params: schema.idParam, querystring: schema.paginationQuery } }, controller.listNegotiations)

  fastify.post('/quote-versions/:id/submit', { schema: { params: schema.idParam, ...schema.submitVersion } }, controller.submitVersion)
  fastify.post('/quote-versions/:id/approve', { schema: { params: schema.idParam, ...schema.approveVersion } }, controller.approveVersion)
  fastify.post('/quote-versions/:id/reject', { schema: { params: schema.idParam, ...schema.rejectVersion } }, controller.rejectVersion)

  fastify.post('/quote-versions/:id/send', { schema: { params: schema.idParam, ...schema.sendVersion } }, controller.sendVersion)

  fastify.get('/proposals/:token', controller.getProposal)
  fastify.post('/proposals/:token/view', controller.viewProposal)
  fastify.post('/proposals/:token/accept', controller.acceptProposal)
  fastify.post('/proposals/:token/confirm-payment', controller.confirmPayment)
  fastify.post('/proposals/:token/request-addons', controller.requestAddons)
  fastify.post('/proposals/:token/feedback', controller.provideFeedback)
  
  fastify.post('/webhooks/razorpay', controller.handleRazorpayWebhook)
}

module.exports = quotationRoutes
