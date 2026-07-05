const { prisma } = require('../quotation/prisma')

const getSetting = async (key) => {
  const setting = await prisma.systemSettings.findUnique({
    where: { key }
  })
  return setting ? setting.value : null
}

const updateSetting = async (key, value) => {
  const setting = await prisma.systemSettings.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  })
  return setting.value
}

module.exports = {
  getSetting,
  updateSetting
}
