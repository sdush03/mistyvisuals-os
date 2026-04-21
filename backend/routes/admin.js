module.exports = async function adminRoutes(fastify, opts) {
  const {
    pool,
    requireAdmin,
    logAdminAudit,
    isProtectedAdminUser,
    PROTECTED_ADMIN_EMAIL,
    hashPassword,
  } = opts

  const getDefaultPassword = () => {
    const raw = String(process.env.DEFAULT_PASSWORD || '').trim()
    return raw || null
  }

  const normalizeUserEmail = (value) => {
    const trimmed = String(value || '').trim().toLowerCase()
    return trimmed || null
  }

  const normalizeUserPhone = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return null
    const compact = raw.replace(/[\s\-().]/g, '')
    if (/^\+91\d{10}$/.test(compact)) return compact
    if (/^\d{10}$/.test(compact)) return compact
    return null
  }

  const ensureUniqueUserFields = async ({ email, phone, excludeId }) => {
    if (email) {
      const exists = await pool.query(
        `SELECT id FROM users WHERE lower(email)=lower($1) AND id<>COALESCE($2, -1) LIMIT 1`,
        [email, excludeId || null]
      )
      if (exists.rows.length) return 'Email already in use'
    }
    if (phone) {
      const exists = await pool.query(
        `SELECT id FROM users WHERE phone=$1 AND id<>COALESCE($2, -1) LIMIT 1`,
        [phone, excludeId || null]
      )
      if (exists.rows.length) return 'Phone already in use'
    }
    return null
  }

  fastify.get('/admin/roles', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    return (await pool.query(`SELECT id, key, label FROM roles ORDER BY key ASC`)).rows
  })

  fastify.get('/admin/users', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    return (await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.phone,
         u.nickname,
         u.job_title,
         u.crew_type,
         u.operational_role_id,
         u.is_login_enabled,
         u.is_active,
         u.force_password_reset,
         u.created_at,
         COALESCE(array_remove(array_agg(r.key), NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id
       ORDER BY u.name NULLS LAST, u.email ASC`
    )).rows
  })

  fastify.get('/admin/users/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { id } = req.params
    const res = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.phone,
         u.nickname,
         u.job_title,
         u.profile_photo,
         u.crew_type,
         u.operational_role_id,
         u.is_login_enabled,
         u.is_active,
         u.force_password_reset,
         u.created_at,
         COALESCE(array_remove(array_agg(r.key), NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [id]
    )
    if (!res.rows.length) return reply.code(404).send({ error: 'User not found' })
    return res.rows[0]
  })

  fastify.post('/admin/users', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const {
      name,
      email,
      phone,
      nickname,
      job_title,
      profile_photo,
      crew_type,
      operational_role_id,
      is_login_enabled,
      roles,
    } = req.body || {}

    const finalName = String(name || '').trim()
    if (!finalName) return reply.code(400).send({ error: 'Name is required' })

    const finalEmail = normalizeUserEmail(email)
    const finalPhone = normalizeUserPhone(phone)
    if (!finalPhone) {
      return reply.code(400).send({ error: 'Phone is required (10 digits or +91XXXXXXXXXX)' })
    }

    const uniquenessError = await ensureUniqueUserFields({ email: finalEmail, phone: finalPhone })
    if (uniquenessError) return reply.code(400).send({ error: uniquenessError })

    const defaultPassword = getDefaultPassword()
    if (!defaultPassword) {
      return reply.code(500).send({ error: 'Default password is not configured' })
    }

    const rolesList = Array.isArray(roles) ? roles.map(r => String(r)) : []
    if (!rolesList.length) {
      return reply.code(400).send({ error: 'At least one role is required' })
    }
    const legacyRole = rolesList.includes('admin') ? 'admin' : 'sales'
    const loginEnabled =
      is_login_enabled == null
        ? !rolesList.includes('crew')
        : String(is_login_enabled).toLowerCase() === 'true' || is_login_enabled === true
    const finalCrewType = crew_type != null ? String(crew_type).trim() || null : null
    let finalOperationalRoleId = null
    if (operational_role_id != null) {
      const parsed = Number(operational_role_id)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return reply.code(400).send({ error: 'Operational role is invalid' })
      }
      const roleRes = await pool.query('SELECT id FROM operational_roles WHERE id=$1', [parsed])
      if (!roleRes.rows.length) {
        return reply.code(400).send({ error: 'Operational role not found' })
      }
      finalOperationalRoleId = parsed
    }
    if (rolesList.includes('crew') && !finalOperationalRoleId) {
      return reply.code(400).send({ error: 'Operational role is required for crew' })
    }

    const res = await pool.query(
      `INSERT INTO users (name, email, phone, nickname, job_title, profile_photo, crew_type, operational_role_id, is_login_enabled, role, is_active, force_password_reset, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, true, $11, NOW(), NOW())
       RETURNING id, name, email, phone, nickname, job_title, profile_photo, crew_type, operational_role_id, is_login_enabled, is_active, force_password_reset, created_at`,
      [
        finalName,
        finalEmail,
        finalPhone,
        nickname ? String(nickname).trim() : null,
        job_title ? String(job_title).trim() : null,
        profile_photo ? String(profile_photo) : null,
        finalCrewType,
        finalOperationalRoleId,
        loginEnabled,
        legacyRole,
        hashPassword(defaultPassword),
      ]
    )
    const row = res.rows[0]

    if (rolesList.length) {
      const roleRows = await pool.query(
        `SELECT id, key FROM roles WHERE key = ANY($1::text[])`,
        [rolesList]
      )
      if (roleRows.rows.length !== rolesList.length) {
        return reply.code(400).send({ error: 'One or more roles are invalid' })
      }
      for (const roleRow of roleRows.rows) {
        await pool.query(
          `INSERT INTO user_roles (user_id, role_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [row.id, roleRow.id]
        )
      }
    }

    const final = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.phone,
         u.nickname,
         u.job_title,
         u.profile_photo,
         u.crew_type,
         u.operational_role_id,
         u.is_login_enabled,
         u.is_active,
         u.force_password_reset,
         u.created_at,
         COALESCE(array_remove(array_agg(r.key), NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [row.id]
    )
    const created = final.rows[0]
    await logAdminAudit(req, 'create', 'user', created.id, null, created, auth.sub)
    return created
  })

  fastify.patch('/admin/users/:id', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { id } = req.params
    const cur = await pool.query(
      `SELECT id, name, email, phone, nickname, job_title, profile_photo, crew_type, operational_role_id, is_login_enabled, role, is_active, force_password_reset
       FROM users WHERE id=$1`,
      [id]
    )
    if (!cur.rows.length) return reply.code(404).send({ error: 'User not found' })
    const existing = cur.rows[0]
    if (isProtectedAdminUser(existing)) {
      const editorEmail = String(auth?.email || '').trim().toLowerCase()
      if (editorEmail !== PROTECTED_ADMIN_EMAIL) {
        return reply.code(403).send({ error: 'Only Dushyant Saini can edit this profile' })
      }
    }
    const {
      name,
      email,
      phone,
      nickname,
      job_title,
      profile_photo,
      crew_type,
      operational_role_id,
      is_login_enabled,
      roles,
      is_active,
    } = req.body || {}

    const finalName = name != null ? String(name).trim() : existing.name
    if (!finalName) return reply.code(400).send({ error: 'Name is required' })

    const finalEmail = email != null ? normalizeUserEmail(email) : existing.email
    const finalPhone = phone != null ? normalizeUserPhone(phone) : existing.phone
    if (!finalPhone) {
      return reply.code(400).send({ error: 'Phone is required (10 digits or +91XXXXXXXXXX)' })
    }

    const uniquenessError = await ensureUniqueUserFields({
      email: finalEmail,
      phone: finalPhone,
      excludeId: id,
    })
    if (uniquenessError) return reply.code(400).send({ error: uniquenessError })

    const rolesList = Array.isArray(roles) ? roles.map(r => String(r)) : null
    const existingRolesRes = await pool.query(
      `SELECT r.key
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [id]
    )
    const existingRoles = existingRolesRes.rows.map(row => row.key)
    const nextRoles = rolesList ?? existingRoles
    if (!nextRoles.length) {
      return reply.code(400).send({ error: 'At least one role is required' })
    }
    if (isProtectedAdminUser(existing) && !nextRoles.includes('admin')) {
      return reply.code(400).send({ error: 'Admin role cannot be removed for this user' })
    }
    if (isProtectedAdminUser(existing) && is_active === false) {
      return reply.code(400).send({ error: 'This user cannot be disabled' })
    }
    const legacyRole = rolesList
      ? (rolesList.includes('admin') ? 'admin' : rolesList.includes('sales') ? 'sales' : rolesList[0] || 'crew')
      : existing.role
    const nextLoginEnabled =
      is_login_enabled == null
        ? existing.is_login_enabled
        : String(is_login_enabled).toLowerCase() === 'true' || is_login_enabled === true
    const nextCrewType = crew_type != null ? String(crew_type).trim() || null : existing.crew_type
    let nextOperationalRoleId = existing.operational_role_id
    if (operational_role_id !== undefined) {
      if (operational_role_id === null || operational_role_id === '') {
        nextOperationalRoleId = null
      } else {
        const parsed = Number(operational_role_id)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return reply.code(400).send({ error: 'Operational role is invalid' })
        }
        const roleRes = await pool.query('SELECT id FROM operational_roles WHERE id=$1', [parsed])
        if (!roleRes.rows.length) {
          return reply.code(400).send({ error: 'Operational role not found' })
        }
        nextOperationalRoleId = parsed
      }
    }
    if (nextRoles.includes('crew') && !nextOperationalRoleId) {
      return reply.code(400).send({ error: 'Operational role is required for crew' })
    }

    const updated = await pool.query(
      `UPDATE users
       SET name=$1,
           email=$2,
           phone=$3,
           nickname=$4,
           job_title=$5,
           profile_photo=$6,
           crew_type=$7,
           operational_role_id=$8,
           is_login_enabled=$9,
           role=$10,
           is_active=$11,
           updated_at=NOW()
       WHERE id=$12
       RETURNING id, name, email, phone, nickname, job_title, profile_photo, crew_type, operational_role_id, is_login_enabled, is_active, force_password_reset, created_at`,
      [
        finalName,
        finalEmail,
        finalPhone,
        nickname != null ? String(nickname).trim() : existing.nickname,
        job_title != null ? String(job_title).trim() : existing.job_title,
        profile_photo != null ? String(profile_photo) : existing.profile_photo,
        nextCrewType,
        nextOperationalRoleId,
        nextLoginEnabled,
        legacyRole,
        is_active != null ? Boolean(is_active) : existing.is_active,
        id,
      ]
    )
    const row = updated.rows[0]

    if (rolesList) {
      const roleRows = await pool.query(
        `SELECT id, key FROM roles WHERE key = ANY($1::text[])`,
        [rolesList]
      )
      if (roleRows.rows.length !== rolesList.length) {
        return reply.code(400).send({ error: 'One or more roles are invalid' })
      }
      await pool.query('DELETE FROM user_roles WHERE user_id=$1', [id])
      for (const roleRow of roleRows.rows) {
        await pool.query(
          `INSERT INTO user_roles (user_id, role_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [id, roleRow.id]
        )
      }
    }

    const final = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.phone,
         u.nickname,
         u.job_title,
         u.profile_photo,
         u.crew_type,
         u.operational_role_id,
         u.is_login_enabled,
         u.is_active,
         u.force_password_reset,
         u.created_at,
         COALESCE(array_remove(array_agg(r.key), NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [id]
    )
    const updatedRow = final.rows[0]
    await logAdminAudit(req, 'update', 'user', updatedRow.id, existing, updatedRow, auth.sub)
    return updatedRow
  })

  fastify.post('/admin/users/:id/reset-password', async (req, reply) => {
    const auth = await requireAdmin(req, reply)
    if (!auth) return
    const { id } = req.params
    const cur = await pool.query(`SELECT id, email, name FROM users WHERE id=$1`, [id])
    if (!cur.rows.length) return reply.code(404).send({ error: 'User not found' })
    if (isProtectedAdminUser(cur.rows[0])) {
      const editorEmail = String(auth?.email || '').trim().toLowerCase()
      if (editorEmail !== PROTECTED_ADMIN_EMAIL) {
        return reply.code(403).send({ error: 'Only Dushyant Saini can reset this password' })
      }
    }
    const defaultPassword = getDefaultPassword()
    if (!defaultPassword) {
      return reply.code(500).send({ error: 'Default password is not configured' })
    }
    await pool.query(
      `UPDATE users SET password_hash=$1, force_password_reset=true, updated_at=NOW() WHERE id=$2`,
      [hashPassword(defaultPassword), id]
    )
    await logAdminAudit(req, 'reset_password', 'user', Number(id), null, { force_password_reset: true }, auth.sub)
    return { success: true }
  })
}
