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

const GENDER_COLORS: Record<string, string> = { male: 'bg-blue-500', female: 'bg-pink-500', unknown: 'bg-neutral-400' }
const PLATFORM_COLORS: Record<string, string> = { facebook: 'bg-[#1877F2]', instagram: 'bg-[#E4405F]', audience_network: 'bg-neutral-700', messenger: 'bg-[#0084FF]' }
const PLATFORM_TEXT: Record<string, string> = { facebook: 'text-[#1877F2]', instagram: 'text-[#E4405F]', audience_network: 'text-neutral-700', messenger: 'text-[#0084FF]' }

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

  const regionData = useMemo(() => data?.regions?.length ? [...data.regions].sort((a, b) => (b.reach || b.impressions) - (a.reach || a.impressions)).slice(0, 12) : [], [data])
  const regionMaxReach = Math.max(...regionData.map(d => d.reach || d.impressions), 1)

  const platformData = useMemo(() => data?.platforms?.length ? [...data.platforms].sort((a, b) => b.reach - a.reach) : [], [data])
  const platformTotalReach = platformData.reduce((s, d) => s + (d.reach || d.impressions), 0)

  const placementData = useMemo(() => data?.placements?.length ? [...data.placements].sort((a, b) => b.impressions - a.impressions).slice(0, 10) : [], [data])
  const placementMaxImpr = Math.max(...placementData.map(d => d.impressions), 1)

  const deviceData = useMemo(() => data?.devices?.length ? [...data.devices].sort((a, b) => b.reach - a.reach) : [], [data])
  const deviceTotalReach = deviceData.reduce((s, d) => s + (d.reach || d.impressions), 0)

  return (
    <div className="max-w-[1400px] px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Audience Insights</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Who sees your ads — demographics, locations & platforms</p>
        </div>
        <select value={range} onChange={e => setRange(e.target.value)}
          className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none">
          {RANGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading && <div className="flex items-center justify-center py-20"><div className="w-7 h-7 border-[2.5px] border-neutral-200 border-t-[#1877F2] rounded-full animate-spin" /></div>}

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
          <strong>{error}.</strong>
          <span className="block text-xs text-amber-600 mt-1">Your token may need <code className="bg-amber-100 px-1 rounded">ads_read</code> permission.</span>
        </div>
      )}

      {!loading && !error && data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Age & Gender */}
          <Section title="Age & Gender" subtitle="People reached by age bracket">
            {ageData.length === 0 ? <Empty /> : (
              <div className="space-y-2">
                {ageData.map(d => {
                  const pct = Math.round((d.total / ageMax) * 100)
                  return (
                    <div key={d.age} className="group cursor-default relative mb-3">
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-3 py-1.5 bg-neutral-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        {fmtPpl(d.reach)} people · ₹{fmtMoney(d.spend)} spent · {d.leads} leads
                      </div>
                      <div className="flex items-end justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-neutral-700">{d.age}</span>
                          <span className="text-[13px] text-neutral-400">{fmtPpl(d.reach)}</span>
                        </div>
                        <div className="text-[11px] font-medium text-neutral-400">{pct}%</div>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div className="flex h-full" style={{ width: `${Math.max(1, pct)}%` }}>
                          {d.male > 0 && <div className={`${GENDER_COLORS.male} transition-all`} style={{ width: `${(d.male / d.total) * 100}%` }} title={`Male: ${d.male}`} />}
                          {d.female > 0 && <div className={`${GENDER_COLORS.female} transition-all`} style={{ width: `${(d.female / d.total) * 100}%` }} title={`Female: ${d.female}`} />}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div className="flex gap-5 justify-center pt-2">
                  <span className="flex items-center gap-1.5 text-[10px] text-neutral-500"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Male</span>
                  <span className="flex items-center gap-1.5 text-[10px] text-neutral-500"><span className="w-2.5 h-2.5 rounded-full bg-pink-500 inline-block" /> Female</span>
                </div>
              </div>
            )}
          </Section>

          {/* Top Regions */}
          <Section title="Top Regions" subtitle="Where your audience is located">
            {regionData.length === 0 ? <Empty /> : (
              <div className="space-y-1.5">
                {regionData.map((d, i) => {
                  const reach = d.reach || d.impressions
                  const pct = Math.round((reach / regionMaxReach) * 100)
                  return (
                    <div key={d.region || i} className="group cursor-default relative mb-3">
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-3 py-1.5 bg-neutral-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        {fmtPpl(reach)} people reached · ₹{fmtMoney(d.spend)} spent · {d.meta_leads} leads · {(d.ctr || 0).toFixed(2)}% CTR
                      </div>
                      <div className="flex items-end justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-neutral-700">{d.region || 'Unknown'}</span>
                          <span className="text-[13px] text-neutral-400">{fmtPpl(reach)}</span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-[#1877F2] transition-all" style={{ width: `${Math.max(1, pct)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* Platforms */}
          <Section title="Platforms" subtitle="Facebook, Instagram & more">
            {platformData.length === 0 ? <Empty /> : (
              <div>
                <div className="flex rounded-lg overflow-hidden h-6 mb-5">
                  {platformData.map(d => {
                    const pct = platformTotalReach > 0 ? ((d.reach || d.impressions) / platformTotalReach) * 100 : 0
                    return <div key={d.platform} className={`${PLATFORM_COLORS[d.platform?.toLowerCase()] || 'bg-neutral-400'} transition-all`} style={{ width: `${pct}%`, minWidth: pct > 0 ? 2 : 0 }} />
                  })}
                </div>
                <div className="space-y-3">
                  {platformData.map(d => {
                    const reach = d.reach || d.impressions
                    const pct = platformTotalReach > 0 ? ((reach / platformTotalReach) * 100).toFixed(1) : '0'
                    const colorClass = PLATFORM_COLORS[d.platform?.toLowerCase()] || 'bg-neutral-400'
                    const textClass = PLATFORM_TEXT[d.platform?.toLowerCase()] || 'text-neutral-500'
                    return (
                      <div key={d.platform} className="flex items-center gap-3 group cursor-default relative">
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-3 py-1.5 bg-neutral-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                          {fmtPpl(reach)} reached · {fmtPpl(d.impressions)} impressions · ₹{fmtMoney(d.spend)} spent · {d.meta_leads} leads
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full ${colorClass} shrink-0`} />
                        <div className="flex-1 text-sm font-medium capitalize text-neutral-900">{d.platform || 'Unknown'}</div>
                        <div className="text-xs text-neutral-500">{fmtPpl(reach)} people</div>
                        <div className={`text-sm font-semibold w-12 text-right ${textClass}`}>{pct}%</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Section>

          {/* Placements */}
          <Section title="Placements" subtitle="Feed, Stories, Reels — where your ads appear">
            {placementData.length === 0 ? <Empty /> : (
              <div className="space-y-1.5">
                {placementData.map((d, i) => {
                  const pct = Math.round((d.impressions / placementMaxImpr) * 100)
                  return (
                    <div key={`${d.platform}-${d.position}-${i}`} className="group cursor-default relative mb-3">
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-3 py-1.5 bg-neutral-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        {fmtPpl(d.impressions)} impressions · {fmtPpl(d.reach)} reach · ₹{fmtMoney(d.spend)} spent · {d.meta_leads} leads
                      </div>
                      <div className="flex items-end justify-between mb-1.5">
                        <div className="flex items-center gap-2 max-w-[70%]">
                          <span className="text-[10px] text-neutral-400 capitalize whitespace-nowrap">{d.platform}</span>
                          <span className="text-[13px] font-medium text-neutral-700 truncate">{fmtPos(d.position)}</span>
                          <span className="text-[13px] text-neutral-400">{fmtPpl(d.impressions)}</span>
                        </div>
                        <div className="text-[11px] font-medium text-neutral-400">{pct}%</div>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${PLATFORM_COLORS[d.platform?.toLowerCase()] || 'bg-neutral-400'} opacity-80 hover:opacity-100 transition-all`}
                          style={{ width: `${Math.max(1, pct)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* Devices */}
          <div className="lg:col-span-2">
            <Section title="Devices" subtitle="Mobile vs Desktop">
              {deviceData.length === 0 ? <Empty /> : (
                <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${Math.min(deviceData.length, 4)}, 1fr)` }}>
                  {deviceData.map(d => {
                    const reach = d.reach || d.impressions
                    const pct = deviceTotalReach > 0 ? ((reach / deviceTotalReach) * 100).toFixed(0) : '0'
                    return (
                      <div key={d.device} className="bg-neutral-50 rounded-2xl border border-neutral-100 p-6 text-center group cursor-default relative hover:shadow-sm transition-shadow">
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-3 py-1.5 bg-neutral-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                          {fmtPpl(reach)} reached · {fmtPpl(d.impressions)} impressions · ₹{fmtMoney(d.spend)} spent · {d.meta_leads} leads · {(d.ctr || 0).toFixed(2)}% CTR
                        </div>
                        <div className="mb-2">
                          {d.device?.toLowerCase().includes('mobile') ? (
                            <svg className="mx-auto text-neutral-400" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                          ) : d.device?.toLowerCase().includes('desktop') ? (
                            <svg className="mx-auto text-neutral-400" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                          ) : (
                            <svg className="mx-auto text-neutral-400" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          )}
                        </div>
                        <div className="text-sm font-semibold capitalize text-neutral-900 mb-0.5">{d.device || 'Unknown'}</div>
                        <div className="text-3xl font-bold text-[#1877F2] tracking-tight">{pct}%</div>
                        <div className="text-[11px] text-neutral-400 mt-1">{fmtPpl(reach)} people</div>
                        <div className="text-[11px] text-neutral-400">₹{fmtMoney(d.spend)} spent</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      <p className="text-xs text-neutral-500 mt-0.5 mb-5">{subtitle}</p>
      {children}
    </div>
  )
}

function Empty() { return <p className="text-xs text-neutral-400 text-center py-10">No data available for this period</p> }

function fmtPpl(n: number) { if (!n) return '0'; if (n >= 1e7) return (n/1e7).toFixed(1)+'Cr'; if (n >= 1e5) return (n/1e5).toFixed(1)+'L'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return String(Math.round(n)) }
function fmtMoney(n: number) { return Math.round(n || 0).toLocaleString('en-IN') }
function fmtPos(s: string) { return s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '' }
