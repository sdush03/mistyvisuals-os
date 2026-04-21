'use client'

import { useEffect, useState, useMemo } from 'react'

type InsightRow = { spend: number; impressions: number; reach: number; clicks: number; ctr: number; meta_leads: number; cost_per_lead: number }
type AgeGender = InsightRow & { age: string; gender: string }
type Region = InsightRow & { region: string }
type Platform = InsightRow & { platform: string }
type Placement = InsightRow & { platform: string; position: string }
type Device = InsightRow & { device: string }

type AudienceData = {
  age_gender: AgeGender[]
  regions: Region[]
  platforms: Platform[]
  placements: Placement[]
  devices: Device[]
}

const RANGE_OPTIONS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'All Time', value: 'all' },
]

function dateRange(value: string) {
  if (value === 'all') return { from: '', to: '' }
  const days = parseInt(value) || 30
  const now = new Date()
  return { from: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }
}

const GENDER_COLORS: Record<string, string> = { male: '#3b82f6', female: '#ec4899', unknown: '#94a3b8' }
const PLATFORM_COLORS: Record<string, string> = { facebook: '#1877F2', instagram: '#E4405F', audience_network: '#374151', messenger: '#0084FF' }

export default function FbAdsAudience() {
  const [range, setRange] = useState('30')
  const [data, setData] = useState<AudienceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { from, to } = useMemo(() => dateRange(range), [range])

  useEffect(() => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams()
    if (from) params.set('date_from', from)
    if (to) params.set('date_to', to)
    fetch(`/api/facebook-ads/audience?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('Failed to load audience data'); setLoading(false) })
  }, [from, to])

  // Aggregate age data
  const ageData = useMemo(() => {
    if (!data?.age_gender?.length) return []
    const byAge: Record<string, { male: number; female: number; unknown: number; total_spend: number; total_leads: number }> = {}
    for (const row of data.age_gender) {
      if (!byAge[row.age]) byAge[row.age] = { male: 0, female: 0, unknown: 0, total_spend: 0, total_leads: 0 }
      const g = (row.gender || 'unknown').toLowerCase()
      byAge[row.age][g as 'male' | 'female' | 'unknown'] += row.impressions
      byAge[row.age].total_spend += row.spend
      byAge[row.age].total_leads += row.meta_leads
    }
    return Object.entries(byAge).sort(([a], [b]) => a.localeCompare(b)).map(([age, v]) => ({ age, ...v }))
  }, [data])

  const ageMax = Math.max(...ageData.map(d => d.male + d.female + d.unknown), 1)

  // Regions sorted by spend
  const regionData = useMemo(() => {
    if (!data?.regions?.length) return []
    return [...data.regions].sort((a, b) => b.spend - a.spend).slice(0, 15)
  }, [data])
  const regionMaxSpend = Math.max(...regionData.map(d => d.spend), 1)

  // Platforms
  const platformData = useMemo(() => {
    if (!data?.platforms?.length) return []
    return [...data.platforms].sort((a, b) => b.spend - a.spend)
  }, [data])
  const platformTotalSpend = platformData.reduce((s, d) => s + d.spend, 0)

  // Placements
  const placementData = useMemo(() => {
    if (!data?.placements?.length) return []
    return [...data.placements].sort((a, b) => b.spend - a.spend).slice(0, 10)
  }, [data])
  const placementMaxSpend = Math.max(...placementData.map(d => d.spend), 1)

  // Devices
  const deviceData = useMemo(() => {
    if (!data?.devices?.length) return []
    return [...data.devices].sort((a, b) => b.spend - a.spend)
  }, [data])
  const deviceTotalSpend = deviceData.reduce((s, d) => s + d.spend, 0)

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Audience Insights</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0, marginTop: 2 }}>
            Demographics, locations, platforms & placements from Meta
          </p>
        </div>
        <select value={range} onChange={e => setRange(e.target.value)} style={selectStyle}>
          {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
          <div style={{
            width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#1877F2',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
          }} />
          Loading audience data...
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {error && (
        <div style={{
          padding: '16px 20px', borderRadius: 12, background: '#fffbeb',
          border: '1px solid #fde68a', color: '#92400e', fontSize: 13, marginBottom: 20, lineHeight: 1.5,
        }}>
          <strong>⚠️ {error}</strong><br />
          <span style={{ fontSize: 12 }}>Your token may need <code>ads_read</code> permission.</span>
        </div>
      )}

      {!loading && !error && data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>

          {/* Age & Gender */}
          <Section title="Age & Gender" subtitle="Impressions by age bracket and gender">
            {ageData.length === 0 ? <Empty /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ageData.map(d => (
                  <div key={d.age} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 48, fontSize: 12, color: '#6b7280', textAlign: 'right', flexShrink: 0, fontWeight: 500 }}>{d.age}</div>
                    <div style={{ flex: 1, display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', background: '#f1f5f9' }}>
                      <div style={{ width: `${(d.male / ageMax) * 100}%`, background: GENDER_COLORS.male, transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${(d.female / ageMax) * 100}%`, background: GENDER_COLORS.female, transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${(d.unknown / ageMax) * 100}%`, background: GENDER_COLORS.unknown, transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ width: 60, fontSize: 11, color: '#6b7280', textAlign: 'right' }}>
                      ₹{fmtK(d.total_spend)}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                  <Legend color={GENDER_COLORS.male} label="Male" />
                  <Legend color={GENDER_COLORS.female} label="Female" />
                </div>
              </div>
            )}
          </Section>

          {/* Regions */}
          <Section title="Top Regions" subtitle="Locations by ad spend">
            {regionData.length === 0 ? <Empty /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {regionData.map((d, i) => (
                  <div key={d.region || i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 120, fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {d.region || 'Unknown'}
                    </div>
                    <div style={{ flex: 1, height: 18, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 6,
                        background: `linear-gradient(90deg, #1877F2, #60a5fa)`,
                        width: `${(d.spend / regionMaxSpend) * 100}%`,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                    <div style={{ width: 56, fontSize: 11, color: '#6b7280', textAlign: 'right' }}>₹{fmtK(d.spend)}</div>
                    <div style={{ width: 40, fontSize: 11, color: '#9ca3af', textAlign: 'right' }}>{fmtK(d.impressions)}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Platforms */}
          <Section title="Platforms" subtitle="Facebook vs Instagram vs others">
            {platformData.length === 0 ? <Empty /> : (
              <div>
                {/* Donut-like horizontal bars */}
                <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', height: 32, marginBottom: 16 }}>
                  {platformData.map(d => {
                    const pct = platformTotalSpend > 0 ? (d.spend / platformTotalSpend) * 100 : 0
                    return (
                      <div key={d.platform} style={{
                        width: `${pct}%`, background: PLATFORM_COLORS[d.platform?.toLowerCase()] || '#64748b',
                        transition: 'width 0.5s ease', minWidth: pct > 0 ? 2 : 0,
                      }} />
                    )
                  })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {platformData.map(d => {
                    const pct = platformTotalSpend > 0 ? ((d.spend / platformTotalSpend) * 100).toFixed(1) : '0'
                    const color = PLATFORM_COLORS[d.platform?.toLowerCase()] || '#64748b'
                    return (
                      <div key={d.platform} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, textTransform: 'capitalize' }}>{d.platform || 'Unknown'}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>₹{fmtK(d.spend)}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color, width: 48, textAlign: 'right' }}>{pct}%</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Section>

          {/* Placements */}
          <Section title="Placements" subtitle="Feed, Stories, Reels and more">
            {placementData.length === 0 ? <Empty /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {placementData.map((d, i) => (
                  <div key={`${d.platform}-${d.position}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 140, fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      <span style={{ color: '#9ca3af', textTransform: 'capitalize' }}>{d.platform} </span>
                      <span style={{ fontWeight: 500 }}>{formatPosition(d.position)}</span>
                    </div>
                    <div style={{ flex: 1, height: 18, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 6,
                        background: PLATFORM_COLORS[d.platform?.toLowerCase()] || '#64748b',
                        width: `${(d.spend / placementMaxSpend) * 100}%`,
                        opacity: 0.7,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                    <div style={{ width: 56, fontSize: 11, color: '#6b7280', textAlign: 'right' }}>₹{fmtK(d.spend)}</div>
                    <div style={{ width: 50, fontSize: 11, color: '#9ca3af', textAlign: 'right' }}>{d.meta_leads ? `${d.meta_leads} leads` : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Devices */}
          <Section title="Devices" subtitle="Mobile vs Desktop performance">
            {deviceData.length === 0 ? <Empty /> : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(deviceData.length, 3)}, 1fr)`, gap: 12 }}>
                {deviceData.map(d => {
                  const pct = deviceTotalSpend > 0 ? ((d.spend / deviceTotalSpend) * 100).toFixed(0) : '0'
                  return (
                    <div key={d.device} style={{
                      background: 'var(--surface-muted)', borderRadius: 12, padding: '16px 18px',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>
                        {d.device?.toLowerCase().includes('mobile') ? '📱' : d.device?.toLowerCase().includes('desktop') ? '💻' : '📟'}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize', marginBottom: 2 }}>
                        {d.device || 'Unknown'}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#1877F2' }}>{pct}%</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>₹{fmtK(d.spend)} spent</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{fmtK(d.impressions)} impressions</div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}

/* ─── Sub Components ──────────────────── */

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)',
      padding: '24px', minHeight: 200,
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 18 }}>{subtitle}</div>
      {children}
    </div>
  )
}

function Empty() {
  return <div style={{ color: '#d1d5db', textAlign: 'center', paddingTop: 40, paddingBottom: 20, fontSize: 13 }}>No data available</div>
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7280' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      {label}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface)', fontSize: 13, cursor: 'pointer', fontWeight: 500,
}

function fmtK(n: number) {
  if (!n && n !== 0) return '0'
  if (n >= 10000000) return (n / 10000000).toFixed(1) + 'Cr'
  if (n >= 100000) return (n / 100000).toFixed(1) + 'L'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(Math.round(n))
}

function formatPosition(s: string) {
  if (!s) return ''
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
