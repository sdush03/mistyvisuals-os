module.exports = async function(api, opts) {
  const {
    placesRoutes,
    quotationRoutes,
  } = opts;

  /* ===================== QUOTATIONS ===================== */

  api.register(quotationRoutes)
  api.register(placesRoutes, { prefix: '/places' })


}
