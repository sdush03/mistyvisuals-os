'use client'

import { useEffect, useState, useMemo } from 'react'

type InsightRow = { spend: number; impressions: number; reach: number; clicks: number; ctr: number; meta_leads: number; cost_per_lead: number }
type AgeGender = InsightRow & { age: string; gender: string }
type Region = InsightRow & { region: string }
type Platform = InsightRow & { platform: string }
type Placement = InsightRow & { platform: string; position: string }
type Device = InsightRow & { device: string }
type AudienceData = { age_gender: AgeGender[]; regions: Region[]; platforms: Platform[]; placements: Placement[]; devices: Device[] }

const RANGES = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'All Time', value: 'all' },
]

const METRIC_TIPS: Record<string, string> = {
  'Impressions': 'Total times your ad was displayed',
  'Reach': 'Unique people who saw your ad',
  'Spend': 'Money spent on ads',
  'Clicks': 'Number of ad clicks',
  'CTR': 'Click-Through Rate — % who clicked',
  'Leads': 'Leads received from this segment',
  'CPL': 'Cost Per Lead for this segment',
}

const GENDER_COLORS: Record<string, string> = { male: '#3b82f6', female: '#ec4899', unknown: '#94a3b8' }
const PLATFORM_COLORS: Record<string, string> = { facebook: '#1877F2', instagram: '#E4405F', audience_network: '#374151', messenger: '#0084FF' }

function dateRange(v: string) {
  if (v === 'all') return { from: '', to: '' }
  const days = parseInt(v) || 30
  return { from: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }
}

export default function FbAdsAudience() {
  const [range, setRange] = useState('30')
  const [data, setData] = useState<AudienceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { from, to } = useMemo(() => dateRange(range), [range])

  useEffect(() => {
    setLoading(true); setError('')
    const p = new URLSearchParams()
    if (from) p.set('date_from', from); if (to) p.set('date_to', to)
    fetch(`/api/facebook-ads/audience?${p}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('Failed to load audience data'); setLoading(false) })
  }, [from, to])

  // Age aggregation
  const ageData = useMemo(() => {
    if (!data?.age_gender?.length) return []
    const byAge: Record<string, { male: number; female: number; unknown: number; spend: number; reach: number; leads: number }> = {}
    for (const row of data.age_gender) {
      if (!byAge[row.age]) byAge[row.age] = { male: 0, female: 0, unknown: 0, spend: 0, reach: 0, leads: 0 }
      const g = (row.gender || 'unknown').toLowerCase() as 'male' | 'female' | 'unknown'
      byAge[row.age][g] += row.reach || row.impressions
      byAge[row.age].spend += row.spend
      byAge[row.age].reach += row.reach
      byAge[row.age].leads += row.meta_leads
    }
    return Object.entries(byAge).sort(([a], [b]) => a.localeCompare(b)).map(([age, v]) => ({ age, ...v, total: v.male + v.female + v.unknown }))
  }, [data])
  const ageMax = Math.max(...ageData.map(d => d.total), 1)

  // Regions by reach
  const regionData = useMemo(() => {
    if (!data?.regions?.length) return []
    return [...data.regions].sort((a, b) => (b.reach || b.impressions) - (a.reach || a.impressions)).slice(0, 12)
  }, [data])
  const regionMaxReach = Math.max(...regionData.map(d => d.reach || d.impressions), 1)

  // Platforms by reach
  const platformData = useMemo(() => {
    if (!data?.platforms?.length) return []
    return [...data.platforms].sort((a, b) => b.reach - a.reach)
  }, [data])
  const platformTotalReach = platformData.reduce((s, d) => s + (d.reach || d.impressions), 0)

  // Placements by impressions
  const placementData = useMemo(() => {
    if (!data?.placements?.length) return []
    return [...data.placements].sort((a, b) => b.impressions - a.impressions).slice(0, 10)
  }, [data])
  const placementMaxImpr = Math.max(...placementData.map(d => d.impressions), 1)

  // Devices
  const deviceData = useMemo(() => {
    if (!data?.devices?.length) return []
    return [...data.devices].sort((a, b) => b.reach - a.reach)
  }, [data])
  const deviceTotalReach = deviceData.reduce((s, d) => s + (d.reach || d.impressions), 0)

  return (
    <div className="fb-aud" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        .fb-aud .tip-wrap { position: relative; }
        .fb-aud .tip-wrap .tip-box {
          display: none; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
          background: #1e293b; color: #f8fafc; padding: 6px 10px; border-radius: 6px; font-size: 11px;
          white-space: normal; width: 180px; text-align: center; z-index: 50; pointer-events: none;
        }
        .fb-aud .tip-wrap .tip-box::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 5px solid transparent; border-top-color: #1e293b; }
        .fb-aud .tip-wrap:hover .tip-box { display: block; }
        .fb-aud .section { background: var(--surface); border-radius: 16px; border: 1px solid var(--border); padding: 22px 24px; }
        @keyframes fbspin { to { transform: rotate(360deg) } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>Audience Insights</h1>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, marginTop: 2 }}>Who sees your ads — demographics, locations & platforms</p>
        </div>
        <select value={range} onChange={e => setRange(e.target.value)} style={selSt}>
          {RANGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 70, color: '#9ca3af' }}><div style={{ width: 28, height: 28, border: '2.5px solid #e5e7eb', borderTopColor: '#1877F2', borderRadius: '50%', animation: 'fbspin 0.7s linear infinite', margin: '0 auto 10px' }} />Loading audience data…</div>}

      {error && (
        <div style={{ padding: '14px 20px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13, lineHeight: 1.5 }}>
          <strong>{error}</strong><br />
          <span style={{ fontSize: 11 }}>Your token may need <code>ads_read</code> permission.</span>
        </div>
      )}

      {!loading && !error && data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>

          {/* ─── Age & Gender ────────────────────── */}
          <div className="section">
            <SectionHeader title="Age & Gender" subtitle="People reached by age bracket" />
            {ageData.length === 0 ? <Empty /> : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {ageData.map(d => (
                    <div key={d.age} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 44, fontSize: 12, color: '#374151', textAlign: 'right', flexShrink: 0, fontWeight: 500 }}>{d.age}</div>
                      <div style={{ flex: 1, display: 'flex', height: 20, borderRadius: 5, overflow: 'hidden', background: '#f1f5f9' }}>
                        {d.male > 0 && <div style={{ width: `${(d.male / ageMax) * 100}%`, background: GENDER_COLORS.male, transition: 'width 0.5s ease' }} />}
                        {d.female > 0 && <div style={{ width: `${(d.female / ageMax) * 100}%`, background: GENDER_COLORS.female, transition: 'width 0.5s ease' }} />}
                      </div>
                      <div className="tip-wrap" style={{ width: 52, fontSize: 11, color: '#6b7280', textAlign: 'right', cursor: 'default' }}>
                        <span className="tip-box">Reached {fmtPeople(d.reach)} people · Spent ₹{fmtMoney(d.spend)} · {d.leads} leads</span>
                        {fmtPeople(d.reach)}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12 }}>
                  <Dot color={GENDER_COLORS.male} label="Male" />
                  <Dot color={GENDER_COLORS.female} label="Female" />
                </div>
              </div>
            )}
          </div>

          {/* ─── Top Regions ────────────────────── */}
          <div className="section">
            <SectionHeader title="Top Regions" subtitle="Where your audience is located" />
            {regionData.length === 0 ? <Empty /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {regionData.map((d, i) => {
                  const reach = d.reach || d.impressions
                  return (
                    <div key={d.region || i} className="tip-wrap" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'default' }}>
                      <span className="tip-box">
                        {fmtPeople(reach)} people reached · ₹{fmtMoney(d.spend)} spent · {d.meta_leads} leads · {(d.ctr || 0).toFixed(2)}% CTR
                      </span>
                      <div style={{ width: 14, fontSize: 11, color: '#9ca3af', textAlign: 'right', flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ width: 110, fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {d.region || 'Unknown'}
                      </div>
                      <div style={{ flex: 1, height: 16, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 5,
                          background: 'linear-gradient(90deg, #1877F2, #60a5fa)',
                          width: `${(reach / regionMaxReach) * 100}%`,
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                      <div style={{ width: 50, fontSize: 11, color: '#6b7280', textAlign: 'right' }}>
                        {fmtPeople(reach)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ─── Platforms ────────────────────── */}
          <div className="section">
            <SectionHeader title="Platforms" subtitle="Facebook, Instagram & more" />
            {platformData.length === 0 ? <Empty /> : (
              <div>
                {/* Stacked bar */}
                <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 28, marginBottom: 16 }}>
                  {platformData.map(d => {
                    const pct = platformTotalReach > 0 ? ((d.reach || d.impressions) / platformTotalReach) * 100 : 0
                    return <div key={d.platform} style={{ width: `${pct}%`, background: PLATFORM_COLORS[d.platform?.toLowerCase()] || '#64748b', transition: 'width 0.5s ease', minWidth: pct > 0 ? 2 : 0 }} />
                  })}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {platformData.map(d => {
                    const reach = d.reach || d.impressions
                    const pct = platformTotalReach > 0 ? ((reach / platformTotalReach) * 100).toFixed(1) : '0'
                    const color = PLATFORM_COLORS[d.platform?.toLowerCase()] || '#64748b'
                    return (
                      <div key={d.platform} className="tip-wrap" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'default' }}>
                        <span className="tip-box">
                          {fmtPeople(reach)} people reached · {fmtPeople(d.impressions)} impressions · ₹{fmtMoney(d.spend)} spent · {d.meta_leads} leads
                        </span>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, textTransform: 'capitalize' }}>{d.platform || 'Unknown'}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{fmtPeople(reach)} people</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color, width: 48, textAlign: 'right' }}>{pct}%</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ─── Placements ────────────────────── */}
          <div className="section">
            <SectionHeader title="Placements" subtitle="Feed, Stories, Reels — where your ads appear" />
            {placementData.length === 0 ? <Empty /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {placementData.map((d, i) => (
                  <div key={`${d.platform}-${d.position}-${i}`} className="tip-wrap" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'default' }}>
                    <span className="tip-box">
                      {fmtPeople(d.impressions)} impressions · {fmtPeople(d.reach)} reach · ₹{fmtMoney(d.spend)} spent · {d.meta_leads} leads
                    </span>
                    <div style={{ width: 130, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      <span style={{ color: '#9ca3af', textTransform: 'capitalize', fontSize: 10 }}>{d.platform} </span>
                      <span style={{ color: '#374151', fontWeight: 500 }}>{fmtPos(d.position)}</span>
                    </div>
                    <div style={{ flex: 1, height: 14, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 4,
                        background: PLATFORM_COLORS[d.platform?.toLowerCase()] || '#64748b',
                        width: `${(d.impressions / placementMaxImpr) * 100}%`,
                        opacity: 0.6, transition: 'width 0.5s ease',
                      }} />
                    </div>
                    <div style={{ width: 55, fontSize: 10, color: '#6b7280', textAlign: 'right' }}>{fmtPeople(d.impressions)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Devices ────────────────────── */}
          <div className="section" style={{ gridColumn: '1 / -1' }}>
            <SectionHeader title="Devices" subtitle="Mobile vs Desktop" />
            {deviceData.length === 0 ? <Empty /> : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(deviceData.length, 4)}, 1fr)`, gap: 14 }}>
                {deviceData.map(d => {
                  const reach = d.reach || d.impressions
                  const pct = deviceTotalReach > 0 ? ((reach / deviceTotalReach) * 100).toFixed(0) : '0'
                  return (
                    <div key={d.device} className="tip-wrap" style={{
                      background: '#fafbfc', borderRadius: 12, padding: '20px', textAlign: 'center',
                      border: '1px solid var(--border)', cursor: 'default',
                    }}>
                      <span className="tip-box" style={{ width: 200 }}>
                        {fmtPeople(reach)} people reached · {fmtPeople(d.impressions)} impressions · ₹{fmtMoney(d.spend)} spent · {d.meta_leads} leads · {(d.ctr || 0).toFixed(2)}% CTR
                      </span>
                      <div style={{ marginBottom: 8 }}>
                        {d.device?.toLowerCase().includes('mobile') ? <IconMobile /> : d.device?.toLowerCase().includes('desktop') ? <IconDesktop /> : <IconDevice />}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize', marginBottom: 2 }}>{d.device || 'Unknown'}</div>
                      <div style={{ fontSize: 26, fontWeight: 700, color: '#1877F2', letterSpacing: '-0.03em' }}>{pct}%</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{fmtPeople(reach)} people</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>₹{fmtMoney(d.spend)} spent</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Sub Components ──────────────────── */

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{subtitle}</div>
    </div>
  )
}

function Empty() { return <div style={{ color: '#d1d5db', textAlign: 'center', padding: '40px 0', fontSize: 12 }}>No data available for this period</div> }

function Dot({ color, label }: { color: string; label: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7280' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />{label}</div>
}

/* ─── SVG Icons ──────────────────────── */
function IconMobile() { return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> }
function IconDesktop() { return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> }
function IconDevice() { return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }

/* ─── Formatters ─────────────────────── */
const selSt: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }

function fmtPeople(n: number) {
  if (!n && n !== 0) return '0'
  if (n >= 1e7) return (n / 1e7).toFixed(1) + 'Cr'
  if (n >= 1e5) return (n / 1e5).toFixed(1) + 'L'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

function fmtMoney(n: number) { return Math.round(n || 0).toLocaleString('en-IN') }

function fmtPos(s: string) {
  if (!s) return ''
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
