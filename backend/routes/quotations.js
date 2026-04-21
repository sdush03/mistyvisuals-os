module.exports = async function(api, opts) {
  const {
    placesRoutes,
    fastify,
    quotationRoutes,
    apiRoutes,
  } = opts;

  /* ===================== QUOTATIONS ===================== */

  api.register(quotationRoutes)
  api.register(placesRoutes, { prefix: '/places' })


}

fastify.register(apiRoutes, { prefix: '/api' })
fastify.register(apiRoutes, { prefix: '' })


}
