'use client'


import CalendarInput from '@/components/CalendarInput'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import LeadAsyncSearch from '@/components/LeadAsyncSearch'
import { formatIndian } from '@/components/CurrencyInput'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-[var(--surface-muted)]'
const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type ProjectRow = {
  lead_id: number
  lead_number?: number | null
  name?: string | null
  bride_name?: string | null
  groom_name?: string | null
  status?: string | null
  revenue: number
  vendor_cost: number
  payroll_overhead: number
  infra_overhead: number
  net_profit: number
  profit_percent?: number | null
}

type MonthlyRow = {
  month: string
  revenue: number
  vendor_cost: number
  payroll_overhead: number
  infra_overhead: number
  net_profit: number
}

type CostMixResponse = {
  totals: {
    vendor_cost: number
    payroll_overhead: number
    infra_overhead: number
  }
  percentages: {
    vendor_pct: number
    payroll_pct: number
    infra_pct: number
  }
  lead?: {
    lead_id: number
    lead_number?: number | null
    name?: string | null
    bride_name?: string | null
    groom_name?: string | null
  } | null
}

type FyRange = { start: string; end: string }

type ProjectFilters = {
  eventFrom: string
  eventTo: string
  eventType: string
  city: string
  status: string
}

const STATUSES = ['New', 'Contacted', 'Quoted', 'Follow Up', 'Negotiation', 'Awaiting Advance', 'Converted', 'Lost', 'Rejected']

const formatAmount = (value: number) => formatIndian(value || 0)

const getCurrentFyLabel = () => {
  const now = new Date()
  const month = now.getMonth() + 1
  const startYear = month >= 4 ? now.getFullYear() : now.getFullYear() - 1
  const endYear = startYear + 1
  return `FY${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`
}

const formatMonthLabel = (monthKey: string) => {
  const date = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return monthKey
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

const formatFyRange = (range?: FyRange | null) => {
  if (!range?.start || !range?.end) return ''
  const startDate = new Date(`${range.start}T00:00:00`)
  const endDate = new Date(`${range.end}T00:00:00`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return ''
  const startLabel = startDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  const endLabel = endDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  return `${startLabel} – ${endLabel}`
}

const getLeadDisplayName = (row: { name?: string | null; bride_name?: string | null; groom_name?: string | null }) => {
  if (row.name) return row.name
  const parts = [row.bride_name, row.groom_name].filter(Boolean)
  if (parts.length) return parts.join(' & ')
  return 'Lead'
}

export default function FinanceProfitPage() {
  const [activeTab, setActiveTab] = useState<'projects' | 'monthly' | 'cost'>('projects')

  const [fy, setFy] = useState('')
  const [fyRange, setFyRange] = useState<FyRange | null>(null)
  const [availableFys, setAvailableFys] = useState<string[]>([])
  const [fyHint, setFyHint] = useState(false)

  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [projectLoading, setProjectLoading] = useState(false)

  const [monthlyRows, setMonthlyRows] = useState<MonthlyRow[]>([])
  const [monthlyLoading, setMonthlyLoading] = useState(false)

  const [costMix, setCostMix] = useState<CostMixResponse | null>(null)
  const [costLoading, setCostLoading] = useState(false)

  const [error, setError] = useState('')

  const [filters, setFilters] = useState<ProjectFilters>({
    eventFrom: '',
    eventTo: '',
    eventType: '',
    city: '',
    status: '',
  })
  const [appliedFilters, setAppliedFilters] = useState<ProjectFilters>(filters)

  const [costLeadId, setCostLeadId] = useState('')
  const [costLeadName, setCostLeadName] = useState('')

  const fyLabel = formatFyRange(fyRange)

  const hasFilters = useMemo(() => {
    return Object.values(appliedFilters).some(value => value && value.trim())
  }, [appliedFilters])

  const buildProjectParams = (fyValue: string) => {
    const params = new URLSearchParams()
    if (fyValue) params.set('fy', fyValue)
    if (appliedFilters.eventFrom) params.set('event_from', appliedFilters.eventFrom)
    if (appliedFilters.eventTo) params.set('event_to', appliedFilters.eventTo)
    if (appliedFilters.eventType) params.set('event_type', appliedFilters.eventType)
    if (appliedFilters.city) params.set('city', appliedFilters.city)
    if (appliedFilters.status) params.set('status', appliedFilters.status)
    return params
  }

  const syncFyMeta = (data: any) => {
    if (data?.fy && !fy) setFy(String(data.fy))
    if (data?.fy_range) setFyRange({ start: data.fy_range.start, end: data.fy_range.end })
    if (Array.isArray(data?.available_fys)) {
      if (data.available_fys.length === 0) {
        const fallback = getCurrentFyLabel()
        setAvailableFys([fallback])
        if (!fy) setFy(fallback)
        setFyHint(true)
      } else {
        setAvailableFys(data.available_fys)
        setFyHint(false)
      }
    }
  }

  const loadProjects = async (fyValue?: string) => {
    setProjectLoading(true)
    setError('')
    try {
      const params = buildProjectParams(fyValue || fy)
      const url = params.toString() ? `/api/finance/profit/projects?${params.toString()}` : '/api/finance/profit/projects'
      const res = await apiFetch(url)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to load project profit')
      setProjects(Array.isArray(data?.projects) ? data.projects : [])
      syncFyMeta(data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load project profit')
    } finally {
      setProjectLoading(false)
    }
  }

  const loadMonthly = async (fyValue?: string) => {
    if (!fyValue && !fy) return
    setMonthlyLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('fy', fyValue || fy)
      const res = await apiFetch(`/api/finance/profit/monthly?${params.toString()}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to load monthly profit')
      setMonthlyRows(Array.isArray(data?.months) ? data.months : [])
      syncFyMeta(data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load monthly profit')
    } finally {
      setMonthlyLoading(false)
    }
  }

  const loadCostMix = async (fyValue?: string, leadId?: string) => {
    if (!fyValue && !fy) return
    setCostLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('fy', fyValue || fy)
      if (leadId) params.set('lead_id', leadId)
      const res = await apiFetch(`/api/finance/profit/cost-mix?${params.toString()}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to load cost mix')
      setCostMix(data)
      syncFyMeta(data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load cost mix')
    } finally {
      setCostLoading(false)
    }
  }

  useEffect(() => {
    void loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!fy) return
    if (activeTab === 'projects') {
      void loadProjects(fy)
    }
    if (activeTab === 'monthly') {
      void loadMonthly(fy)
    }
    if (activeTab === 'cost') {
      void loadCostMix(fy, costLeadId || undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fy])

  const handleApplyFilters = () => {
    setAppliedFilters(filters)
    void loadProjects(fy)
  }

  const handleClearFilters = () => {
    const cleared = { eventFrom: '', eventTo: '', eventType: '', city: '', status: '' }
    setFilters(cleared)
    setAppliedFilters(cleared)
    void loadProjects(fy)
  }

  const handleFyChange = (nextFy: string) => {
    setFy(nextFy)
  }

  const exportProjectsCsv = () => {
    const lines: string[] = []
    lines.push('Lead,Revenue,Vendor Cost,Payroll Overhead,Infra Overhead,Net Profit,Profit %')
    projects.forEach(row => {
      const leadLabel = `${row.lead_number ? `L${row.lead_number}` : 'Lead'} ${getLeadDisplayName(row)}`.trim()
      const pct = row.profit_percent === null || row.profit_percent === undefined ? '' : row.profit_percent.toFixed(1)
      lines.push(`${leadLabel},${row.revenue},${row.vendor_cost},${row.payroll_overhead},${row.infra_overhead},${row.net_profit},${pct}`)
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `profit-projects-${fy || 'fy'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportMonthlyCsv = () => {
    const lines: string[] = []
    lines.push('Month,Revenue,Vendor Cost,Payroll Overhead,Infra Overhead,Net Profit')
    monthlyRows.forEach(row => {
      lines.push(`${row.month},${row.revenue},${row.vendor_cost},${row.payroll_overhead},${row.infra_overhead},${row.net_profit}`)
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `profit-monthly-${fy || 'fy'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalCost = useMemo(() => {
    if (!costMix?.totals) return 0
    return costMix.totals.vendor_cost + costMix.totals.payroll_overhead + costMix.totals.infra_overhead
  }, [costMix])

  return (
    <div className="space-y-8">
      <div className="sticky top-0 z-10 space-y-4 bg-[var(--background)]/95 pb-4 backdrop-blur">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin · Finance</div>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold">Profit Dashboard</h1>
              <p className="text-sm text-neutral-600 mt-1">All numbers shown for {fy || 'Current FY'}{fyLabel ? ` (${fyLabel})` : ''}.</p>
            </div>
            <div className="w-48">
              <div className="text-xs text-neutral-500 mb-1">Financial Year</div>
              <select
                className={fieldClass}
                value={fy}
                onChange={e => handleFyChange(e.target.value)}
              >
                {availableFys.length === 0 && <option value="">Loading…</option>}
                {availableFys.map(label => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
              {fyHint && (
                <div className="mt-1 text-xs text-amber-600">No FY data found yet. Defaulting to current FY.</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={activeTab === 'projects' ? buttonPrimary : buttonOutline}
            onClick={() => setActiveTab('projects')}
          >
            Projects
          </button>
          <button
            className={activeTab === 'monthly' ? buttonPrimary : buttonOutline}
            onClick={() => setActiveTab('monthly')}
          >
            Monthly Profit
          </button>
          <button
            className={activeTab === 'cost' ? buttonPrimary : buttonOutline}
            onClick={() => setActiveTab('cost')}
          >
            Cost Mix
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {activeTab === 'projects' && (
        <section className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">Project Profit (FY)</div>
              <div className="text-xs text-neutral-500">Projects active in the FY, sorted by net profit.</div>
            </div>
            <button className={buttonOutline} onClick={exportProjectsCsv} disabled={projects.length === 0}>
              Export CSV
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Event From</div>
              <CalendarInput
                className={fieldClass}
                value={filters.eventFrom}
                onChange={val => setFilters(prev => ({ ...prev, eventFrom: val }))}
              />
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Event To</div>
              <CalendarInput
                className={fieldClass}
                value={filters.eventTo}
                onChange={val => setFilters(prev => ({ ...prev, eventTo: val }))}
              />
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Wedding Type</div>
              <input
                type="text"
                className={fieldClass}
                value={filters.eventType}
                onChange={e => setFilters(prev => ({ ...prev, eventType: e.target.value }))}
                placeholder="Wedding, Sagan..."
              />
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">City</div>
              <input
                type="text"
                className={fieldClass}
                value={filters.city}
                onChange={e => setFilters(prev => ({ ...prev, city: e.target.value }))}
                placeholder="Jaipur"
              />
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">Status</div>
              <select
                className={fieldClass}
                value={filters.status}
                onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="">All Statuses</option>
                {STATUSES.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-neutral-500">
              {hasFilters ? 'Filters applied to this FY view.' : 'No filters applied.'}
            </div>
            <div className="flex gap-2">
              <button className={buttonOutline} onClick={handleClearFilters}>Clear Filters</button>
              <button className={buttonPrimary} onClick={handleApplyFilters}>Apply Filters</button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                <tr className="text-left">
                  <th className="pb-3">Lead</th>
                  <th className="pb-3">Revenue</th>
                  <th className="pb-3">Vendor Cost</th>
                  <th className="pb-3">Payroll OH</th>
                  <th className="pb-3">Infra OH</th>
                  <th className="pb-3">Net Profit</th>
                  <th className="pb-3">Profit %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {projectLoading && (
                  <tr>
                    <td className="py-4 text-sm text-neutral-500" colSpan={7}>Loading project profit…</td>
                  </tr>
                )}
                {!projectLoading && projects.length === 0 && (
                  <tr>
                    <td className="py-4 text-sm text-neutral-500" colSpan={7}>No projects found for this FY.</td>
                  </tr>
                )}
                {!projectLoading && projects.map(row => {
                  const netClass = row.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  const leadLabel = `${row.lead_number ? `L${row.lead_number}` : 'Lead'}`
                  return (
                    <tr key={row.lead_id}>
                      <td className="py-3">
                        <Link className="text-sm font-medium text-neutral-900 hover:underline" href={`/admin/finance/projects/${row.lead_id}/pnl`}>
                          {leadLabel} · {getLeadDisplayName(row)}
                        </Link>
                        {row.status && <div className="text-xs text-neutral-500">{row.status}</div>}
                      </td>
                      <td className="py-3">₹{formatAmount(row.revenue)}</td>
                      <td className="py-3">₹{formatAmount(row.vendor_cost)}</td>
                      <td className="py-3">₹{formatAmount(row.payroll_overhead)}</td>
                      <td className="py-3">₹{formatAmount(row.infra_overhead)}</td>
                      <td className={`py-3 font-semibold ${netClass}`}>₹{formatAmount(row.net_profit)}</td>
                      <td className="py-3 text-xs text-neutral-500">
                        {row.profit_percent === null || row.profit_percent === undefined
                          ? '—'
                          : `${row.profit_percent.toFixed(1)}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'monthly' && (
        <section className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">Monthly Profit (FY)</div>
              <div className="text-xs text-neutral-500">Apr → Mar view with 12 months.</div>
            </div>
            <button className={buttonOutline} onClick={exportMonthlyCsv} disabled={monthlyRows.length === 0}>
              Export CSV
            </button>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                <tr className="text-left">
                  <th className="pb-3">Month</th>
                  <th className="pb-3">Revenue</th>
                  <th className="pb-3">Vendor Cost</th>
                  <th className="pb-3">Payroll OH</th>
                  <th className="pb-3">Infra OH</th>
                  <th className="pb-3">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {monthlyLoading && (
                  <tr>
                    <td className="py-4 text-sm text-neutral-500" colSpan={6}>Loading monthly profit…</td>
                  </tr>
                )}
                {!monthlyLoading && monthlyRows.length === 0 && (
                  <tr>
                    <td className="py-4 text-sm text-neutral-500" colSpan={6}>No monthly profit data for this FY.</td>
                  </tr>
                )}
                {!monthlyLoading && monthlyRows.map(row => {
                  const netClass = row.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  return (
                    <tr key={row.month}>
                      <td className="py-3 font-medium">{formatMonthLabel(row.month)}</td>
                      <td className="py-3">₹{formatAmount(row.revenue)}</td>
                      <td className="py-3">₹{formatAmount(row.vendor_cost)}</td>
                      <td className="py-3">₹{formatAmount(row.payroll_overhead)}</td>
                      <td className="py-3">₹{formatAmount(row.infra_overhead)}</td>
                      <td className={`py-3 font-semibold ${netClass}`}>₹{formatAmount(row.net_profit)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'cost' && (
        <section className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">Cost Mix (FY)</div>
              <div className="text-xs text-neutral-500">Split of vendor vs payroll vs infra costs.</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <div className="text-xs text-neutral-500 mb-1">Per Project (optional)</div>
              <LeadAsyncSearch
                value={costLeadId}
                onChange={(id, name) => {
                  setCostLeadId(id)
                  setCostLeadName(name || '')
                  if (id) {
                    void loadCostMix(fy, id)
                  } else {
                    void loadCostMix(fy)
                  }
                }}
                placeholder="Search project to view cost mix"
              />
            </div>
            <button
              className={buttonOutline}
              onClick={() => {
                setCostLeadId('')
                setCostLeadName('')
                void loadCostMix(fy)
              }}
            >
              Clear Project
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-neutral-600 mb-2">
                {costMix?.lead ? (
                  <span>Project: {costMix.lead.lead_number ? `L${costMix.lead.lead_number}` : 'Lead'} {getLeadDisplayName(costMix.lead)}</span>
                ) : (
                  <span>Overall FY cost mix</span>
                )}
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100">
                <div className="flex h-full">
                  <div className="bg-amber-400" style={{ width: `${costMix?.percentages?.vendor_pct || 0}%` }} />
                  <div className="bg-sky-400" style={{ width: `${costMix?.percentages?.payroll_pct || 0}%` }} />
                  <div className="bg-emerald-400" style={{ width: `${costMix?.percentages?.infra_pct || 0}%` }} />
                </div>
              </div>
              <div className="mt-2 text-xs text-neutral-500">Overhead allocation is for profitability analysis only.</div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm">
              {costLoading && <div className="text-neutral-500">Loading cost mix…</div>}
              {!costLoading && costMix && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Vendor Cost</span>
                    <span className="font-medium">₹{formatAmount(costMix.totals.vendor_cost)} ({costMix.percentages.vendor_pct.toFixed(1)}%)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Payroll Overhead</span>
                    <span className="font-medium">₹{formatAmount(costMix.totals.payroll_overhead)} ({costMix.percentages.payroll_pct.toFixed(1)}%)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Infra Overhead</span>
                    <span className="font-medium">₹{formatAmount(costMix.totals.infra_overhead)} ({costMix.percentages.infra_pct.toFixed(1)}%)</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-sm">
                    <span className="text-neutral-500">Total Costs</span>
                    <span className="font-semibold">₹{formatAmount(totalCost)}</span>
                  </div>
                </div>
              )}
              {!costLoading && !costMix && <div className="text-neutral-500">No cost mix data.</div>}
            </div>
          </div>

          {costLeadName && (
            <div className="mt-4 text-xs text-neutral-500">Showing cost mix for {costLeadName}.</div>
          )}
        </section>
      )}
    </div>
  )
}
