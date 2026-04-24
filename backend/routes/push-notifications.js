/**
 * push-notifications.js
 * Fastify route plugin for Web Push subscriptions.
 * Handles: subscribe, unsubscribe, VAPID public key endpoint.
 */
const webpush = require('web-push')

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@mistyvisuals.com'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

/**
 * Send a push notification to a subscription object.
 * Returns true on success, false if the subscription is expired/invalid.
 */
async function sendPushToSubscription(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload))
    return { ok: true }
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      return { ok: false, expired: true }
    }
    return { ok: false, expired: false, err }
  }
}

/**
 * Send a push notification to all subscriptions for a given user.
 */
async function sendPushToUser(pool, userId, payload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return
  const { rows } = await pool.query(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  )
  for (const row of rows) {
    const sub = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }
    const result = await sendPushToSubscription(sub, payload)
    if (result.expired) {
      await pool.query(`DELETE FROM push_subscriptions WHERE id = $1`, [row.id])
    }
  }
}

/**
 * Send a push notification to all subscriptions for a given role (e.g., 'admin', 'sales').
 */
async function sendPushToRole(pool, roleTarget, payload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return
  const { rows } = await pool.query(
    `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
     FROM push_subscriptions ps
     JOIN user_roles ur ON ur.user_id = ps.user_id
     JOIN roles r ON r.id = ur.role_id AND r.key = $1`,
    [roleTarget]
  )
  for (const row of rows) {
    const sub = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }
    const result = await sendPushToSubscription(sub, payload)
    if (result.expired) {
      await pool.query(`DELETE FROM push_subscriptions WHERE id = $1`, [row.id])
    }
  }
}

module.exports = async function pushNotificationRoutes(fastify, opts) {
  const { pool, requireAuth } = opts

  /* ── GET /api/push/vapid-public-key ── */
  fastify.get('/push/vapid-public-key', async (req, reply) => {
    if (!VAPID_PUBLIC_KEY) {
      return reply.code(503).send({ error: 'Push notifications not configured' })
    }
    return { publicKey: VAPID_PUBLIC_KEY }
  })

  /* ── POST /api/push/subscribe ── */
  fastify.post('/push/subscribe', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    const { endpoint, keys } = req.body || {}
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return reply.code(400).send({ error: 'Invalid subscription object' })
    }

    const userAgent = req.headers['user-agent'] || null

    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, endpoint)
       DO UPDATE SET p256dh = $3, auth = $4, user_agent = $5, last_used_at = NOW()`,
      [auth.sub, endpoint, keys.p256dh, keys.auth, userAgent]
    )

    return { success: true }
  })

  /* ── DELETE /api/push/unsubscribe ── */
  fastify.delete('/push/unsubscribe', async (req, reply) => {
    const auth = requireAuth(req, reply)
    if (!auth) return

    const { endpoint } = req.body || {}
    if (!endpoint) {
      return reply.code(400).send({ error: 'endpoint is required' })
    }

    await pool.query(
      `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
      [auth.sub, endpoint]
    )

    return { success: true }
  })
}

module.exports.sendPushToUser = sendPushToUser
module.exports.sendPushToRole = sendPushToRole
