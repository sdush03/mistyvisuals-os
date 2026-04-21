module.exports = async function(api, opts) {
  const {
    getOrCreateCity,
    getAuthFromRequest,
    logLeadActivity,
    pool,
  } = opts;

  /* ===================== LEAD CITIES ===================== */

  api.put('/leads/:id/cities', async (req, reply) => {
    const { id } = req.params
    const { cities } = req.body
    const auth = getAuthFromRequest(req)

    if (!Array.isArray(cities) || cities.length === 0)
      return reply.code(400).send({ error: 'Cities are required' })

    const primaryCount = cities.filter(c => c.is_primary).length
    if (primaryCount !== 1)
      return reply.code(400).send({ error: 'Exactly one primary city required' })

    const leadStatusRes = await pool.query(`SELECT status FROM leads WHERE id=$1`, [id])
    if (!leadStatusRes.rows.length) {
      return reply.code(404).send({ error: 'Lead not found' })
    }
    const leadStatus = leadStatusRes.rows[0].status
    if (leadStatus === 'Converted') {
      return reply.code(400).send({ error: 'Converted leads cannot be edited' })
    }
    const mustEnforce = ['Quoted', 'Follow Up', 'Negotiation', 'Converted'].includes(leadStatus)

    const formatCityLabel = (row) => {
      const name = String(row?.name || '').trim()
      if (!name) return ''
      return row?.is_primary ? `${name} (Primary)` : name
    }
    const normalizeCityLabel = (rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return ''
      const normalized = rows
        .map(row => ({
          name: String(row?.name || '').trim(),
          is_primary: !!row?.is_primary,
        }))
        .filter(row => row.name)
        .sort((a, b) => {
          if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
          return a.name.localeCompare(b.name)
        })
      return normalized.map(formatCityLabel).filter(Boolean).join(', ')
    }

    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      const existingCitiesRes = await client.query(
        `SELECT c.name, lc.is_primary
       FROM lead_cities lc
       JOIN cities c ON c.id = lc.city_id
       WHERE lc.lead_id=$1`,
        [id]
      )
      const existingCityLabel = normalizeCityLabel(existingCitiesRes.rows)
      const nextCityLabel = normalizeCityLabel(cities)

      await client.query('DELETE FROM lead_cities WHERE lead_id=$1', [id])

      let primaryCountry = 'India'

      for (const city of cities) {
        const cityId = await getOrCreateCity({
          name: (city.name || '').trim(),
          state: (city.state || '').trim(),
          country: city.country || 'India',
        }, client)

        if (city.is_primary) primaryCountry = city.country || 'India'

        await client.query(
          `INSERT INTO lead_cities (lead_id, city_id, is_primary)
         VALUES ($1,$2,$3)`,
          [id, cityId, city.is_primary]
        )
      }

      const isInternational = primaryCountry !== 'India'

      if (isInternational) {
        await client.query(
          `UPDATE leads
         SET is_destination=true,
             country=$1,
             updated_at=NOW()
         WHERE id=$2`,
          [primaryCountry, id]
        )
      } else {
        await client.query(
          `UPDATE leads
         SET country=$1,
             updated_at=NOW()
         WHERE id=$2`,
          [primaryCountry, id]
        )
      }

      // City-event linkage is now validated only during status transitions (not here)
      // This allows users to freely add/change/remove cities and fix events afterward

      if (existingCityLabel !== nextCityLabel) {
        await logLeadActivity(
          id,
          'lead_field_change',
          {
            log_type: 'activity',
            section: 'details',
            field: 'cities',
            from: existingCityLabel || '—',
            to: nextCityLabel || '—',
          },
          auth?.sub || null,
          client
        )
      }

      await client.query('COMMIT')
      return { success: true }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })


}
