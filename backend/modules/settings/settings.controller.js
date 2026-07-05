const service = require('./settings.service')

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

const ensureAdmin = (req, reply) => {
  const auth = req.auth
  if (!auth) {
    reply.code(401).send({ error: 'Not authenticated' })
    return false
  }
  const roles = Array.isArray(auth.roles) ? auth.roles : auth.role ? [auth.role] : []
  if (!roles.includes('admin')) {
    reply.code(403).send({ error: 'Admin only' })
    return false
  }
  return true
}

const getPaymentSettings = handle(async (req, reply) => {
  if (!ensureAdmin(req, reply)) return
  const details = await service.getSetting('bank_details')
  return details || { bankName: '', accountName: '', accountNumber: '', ifscCode: '', upiId: '', qrCodeUrl: '' }
})

const updatePaymentSettings = handle(async (req, reply) => {
  if (!ensureAdmin(req, reply)) return
  const { bankName, accountName, accountNumber, ifscCode, upiId, qrCodeUrl } = req.body || {}
  const value = { 
    bankName: bankName || '', 
    accountName: accountName || '', 
    accountNumber: accountNumber || '', 
    ifscCode: ifscCode || '', 
    upiId: upiId || '',
    qrCodeUrl: qrCodeUrl || ''
  }
  return service.updateSetting('bank_details', value)
})

module.exports = {
  getPaymentSettings,
  updatePaymentSettings
}
