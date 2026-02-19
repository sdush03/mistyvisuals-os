module.exports = async function authRoutes(fastify, opts) {
  const {
    pool,
    setAuthCookie,
    clearAuthCookie,
    verifyPassword,
    signToken,
    getAuthFromRequest,
    logLeadActivity,
    getClientInfo,
    normalizeNickname,
    parseDataUrl,
    hashPassword,
  } = opts

  fastify.post('/auth/login', async (req, reply) => {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' })
    }

    const r = await pool.query(
      'SELECT id, email, password_hash, role FROM users WHERE email=$1',
      [String(email).toLowerCase()]
    )
    if (!r.rows.length) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const user = r.rows[0]
    if (!verifyPassword(String(password), user.password_hash)) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const clientInfo = getClientInfo(req)
    const sessionRes = await pool.query(
      `INSERT INTO user_sessions (user_id, login_at, device_type, user_agent, client_kind, platform, client_name, client_version)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        user.id,
        clientInfo.device_type,
        clientInfo.user_agent,
        clientInfo.client_kind,
        clientInfo.platform,
        clientInfo.client_name,
        clientInfo.client_version,
      ]
    )
    const sessionId = sessionRes.rows[0]?.id || null

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      sid: sessionId,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    })

    setAuthCookie(reply, token)
    await logLeadActivity(
      null,
      'audit_login',
      {
        log_type: 'audit',
        client_kind: clientInfo.client_kind,
        device_type: clientInfo.device_type,
        platform: clientInfo.platform,
        client_name: clientInfo.client_name,
        client_version: clientInfo.client_version,
      },
      user.id
    )
    return { success: true, role: user.role, email: user.email }
  })

  fastify.post('/auth/logout', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    clearAuthCookie(reply)
    if (auth?.sub) {
      await logLeadActivity(null, 'audit_logout', { log_type: 'audit' }, auth.sub)
      const sessionId = auth?.sid
      if (sessionId) {
        await pool.query(
          `
          UPDATE user_sessions
          SET logout_at=NOW(),
              duration_seconds=EXTRACT(EPOCH FROM (NOW() - login_at))::int
          WHERE id=$1 AND user_id=$2 AND logout_at IS NULL
          `,
          [sessionId, auth.sub]
        )
      } else {
        await pool.query(
          `
          WITH target AS (
            SELECT id FROM user_sessions
            WHERE user_id=$1 AND logout_at IS NULL
            ORDER BY login_at DESC
            LIMIT 1
          )
          UPDATE user_sessions
          SET logout_at=NOW(),
              duration_seconds=EXTRACT(EPOCH FROM (NOW() - login_at))::int
          WHERE id IN (SELECT id FROM target)
          `,
          [auth.sub]
        )
      }
    }
    return { success: true }
  })

  fastify.get('/auth/me', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
    const r = await pool.query(
      'SELECT id, email, role, name, nickname, profile_photo, job_title FROM users WHERE id=$1',
      [auth.sub]
    )
    const user = r.rows[0] || {
      id: auth.sub,
      email: auth.email,
      role: auth.role,
      name: null,
      nickname: null,
      profile_photo: null,
      job_title: null,
    }
    return {
      authenticated: true,
      user: {
        email: user.email,
        role: user.role,
        name: user.name,
        nickname: user.nickname,
        job_title: user.job_title,
        has_photo: !!user.profile_photo,
      },
    }
  })

  fastify.post('/auth/nickname', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })

    const raw = req.body?.nickname
    if (raw && String(raw).trim().length > 50) {
      return reply.code(400).send({ error: 'Nickname must be 50 characters or less' })
    }
    const normalized = normalizeNickname(raw)

    await pool.query('UPDATE users SET nickname=$1 WHERE id=$2', [normalized, auth.sub])
    await logLeadActivity(null, 'audit_profile_update', { log_type: 'audit', fields: ['nickname'] }, auth.sub)
    return { success: true, nickname: normalized }
  })

  fastify.get('/auth/profile-photo', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })

    const r = await pool.query('SELECT profile_photo FROM users WHERE id=$1', [auth.sub])
    const dataUrl = r.rows[0]?.profile_photo
    if (!dataUrl) return reply.code(404).send({ error: 'No photo' })

    const parsed = parseDataUrl(dataUrl)
    if (!parsed) return reply.code(400).send({ error: 'Invalid photo data' })

    const buffer = Buffer.from(parsed.base64, 'base64')
    reply.header('Content-Type', parsed.mime)
    return buffer
  })

  fastify.post('/auth/profile-photo', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
    const { image_data } = req.body || {}
    const parsed = parseDataUrl(image_data)
    if (!parsed) {
      return reply.code(400).send({ error: 'Invalid image format' })
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(parsed.mime)) {
      return reply.code(400).send({ error: 'Only JPG, PNG, or WEBP allowed' })
    }
    const bytes = Math.floor((parsed.base64.length * 3) / 4)
    if (bytes > 2 * 1024 * 1024) {
      return reply.code(400).send({ error: 'Image must be 2MB or less' })
    }

    await pool.query('UPDATE users SET profile_photo=$1 WHERE id=$2', [image_data, auth.sub])
    await logLeadActivity(null, 'audit_profile_update', { log_type: 'audit', fields: ['profile_photo'] }, auth.sub)
    return { success: true }
  })

  fastify.post('/auth/change-password', async (req, reply) => {
    const auth = getAuthFromRequest(req)
    if (!auth) return reply.code(401).send({ error: 'Not authenticated' })
    const { current_password, new_password } = req.body || {}
    if (!current_password || !new_password) {
      return reply.code(400).send({ error: 'Current and new password are required' })
    }

    const r = await pool.query(
      'SELECT password_hash FROM users WHERE id=$1',
      [auth.sub]
    )
    if (!r.rows.length) {
      return reply.code(404).send({ error: 'User not found' })
    }
    const ok = verifyPassword(String(current_password), r.rows[0].password_hash)
    if (!ok) {
      return reply.code(401).send({ error: 'Current password is incorrect' })
    }

    const nextHash = hashPassword(String(new_password))
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [nextHash, auth.sub])
    await logLeadActivity(null, 'audit_password_change', { log_type: 'audit' }, auth.sub)
    return { success: true }
  })
}
