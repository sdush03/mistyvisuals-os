const { PrismaClient } = require('@prisma/client')

if (!process.env.DATABASE_URL) {
  const host = process.env.DB_HOST
  const user = process.env.DB_USER
  const name = process.env.DB_NAME
  if (host && user && name) {
    const port = process.env.DB_PORT || 5432
    const password = process.env.DB_PASSWORD
    const auth = password
      ? `${user}:${encodeURIComponent(password)}`
      : user
    process.env.DATABASE_URL = `postgresql://${auth}@${host}:${port}/${name}`
  }
}

const prisma = new PrismaClient()

module.exports = { prisma }
