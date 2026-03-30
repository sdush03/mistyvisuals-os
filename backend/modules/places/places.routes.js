const fastify = require('fastify')

async function placesRoutes(api) {
  const API_KEY = (
    process.env.GOOGLE_PLACES_API_KEY || 
    process.env.GOOGLE_MAPS_API_KEY || 
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  )?.trim()

  // 1. Autocomplete (New)
  api.post('/autocomplete', async (req, reply) => {
    if (!API_KEY) return reply.status(500).send({ error: 'API key not configured' })
    
    const { input, sessionToken } = req.body
    if (!input) return reply.status(400).send({ error: 'Input is required' })

    console.log(`[PlacesProxy] Autocomplete search for: "${input}"`)

    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY
      },
      body: JSON.stringify({
        input,
        sessionToken,
        includedRegionCodes: ['IN'],
      })
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error('[PlacesProxy] Google API Error:', response.status, data)
      return reply.status(response.status).send(data)
    }

    console.log(`[PlacesProxy] Found ${data.suggestions?.length || 0} suggestions`)
    return data
  })

  // 2. Place Details (New) - FORCED ESSENTIALS TIER
  api.get('/details/:placeId', async (req, reply) => {
    if (!API_KEY) return reply.status(500).send({ error: 'API key not configured' })
    
    const { placeId } = req.params
    const sessionToken = req.query.sessionToken

    // FIELD MASK: This is the magic for the lowest price. 
    // These fields stay in the "Essentials" tier (70k free/month in India).
    // Note: Requesting 'rating' or 'hotelClass' would jump you to the more expensive Pro/Atmosphere tier.
    const fields = [
      'id',
      'formattedAddress',
      'location',
      'types'
    ].join(',')

    const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`)
    if (sessionToken) url.searchParams.append('sessionToken', sessionToken)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': fields
      }
    })

    const data = await response.json()
    return data
  })
}

module.exports = placesRoutes
