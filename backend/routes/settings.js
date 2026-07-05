const controller = require('../modules/settings/settings.controller')

module.exports = async function settingsRoutes(fastify, opts) {
  fastify.get('/admin/settings/payment', controller.getPaymentSettings)
  fastify.post('/admin/settings/payment', controller.updatePaymentSettings)
}
