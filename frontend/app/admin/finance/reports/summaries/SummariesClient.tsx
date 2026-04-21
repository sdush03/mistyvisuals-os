'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { formatIndian } from '@/components/CurrencyInput'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)]'
const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type LeadReportRow = {
  lead_id: number
  lead_number?: number
  name?: string | null
  bride_name?: string | null
  groom_name?: string | null
  status?: string | null
  event_type?: string | null
  city?: string | null
  revenue: number
  vendor_cost: number
  payroll_overhead: number
  infra_overhead: number
  net_profit: number
  profit_percent?: number | null
}

type VendorBillRow = {
  bill_id: number
  lead_id?: number | null
  lead_number?: number | null
  lead_name?: string | null
  amount: number
  category?: string | null
  paid_date?: string | null
}

type VendorReportRow = {
  vendor_id: number
  vendor_name: string
  vendor_type: string
  total_paid: number
  bills_paid: number
  avg_bill_value: number
  projects_count: number
  bills: VendorBillRow[]
}

type EmployeeMonthlyCu = { month: string; cu_count: number }

type EmployeeProjectCu = {
  lead_id: number
  lead_number?: number | null
  lead_name?: string | null
  cu_count: number
}

type EmployeeReportRow = {
  user_id: number
  name?: string | null
  email?: string | null
  role?: string | null
  job_title?: string | null
  is_active?: boolean
  employment_type?: string | null
  profile_active?: boolean | null
  total_paid: number
  projects_count: number
  total_cu: number
  avg_cu_per_month: number
  monthly_cu: EmployeeMonthlyCu[]
  project_cu: EmployeeProjectCu[]
}

const formatMoney = (value: number) => `₹${formatIndian(Number(value) || 0)}`

const csvEscape = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const leadLabel = (row: LeadReportRow) => {
  const number = row.lead_number ? `L${row.lead_number}` : 'Lead'
  const primaryName = row.name || row.bride_name || row.groom_name || ''
  return primaryName ? `${number} · ${primaryName}` : number
}

const employeeRoleLabel = (row: EmployeeReportRow) => {
  return row.job_title || row.role || '—'
}

const employmentLabel = (value?: string | null) => {
  if (!value) return '—'
  if (value === 'salaried_plus_variable') return 'Mixed'
  if (value === 'salaried') return 'Salary'
  if (value === 'stipend') return 'Stipend'
  return value
}

export default function FinanceSummariesPage() {
  const [activeTab, setActiveTab] = useState<'projects' | 'vendors' | 'employees'>('projects')
  const [fy, setFy] = useState('')
  const [availableFys, setAvailableFys] = useState<string[]>([])

  const [leadRows, setLeadRows] = useState<LeadReportRow[]>([])
  const [leadLoading, setLeadLoading] = useState(false)
  const [leadError, setLeadError] = useState('')
  const [leadFilters, setLeadFilters] = useState({ eventType: '', city: '', status: '', profitMin: '', profitMax: '' })
  const [leadPage, setLeadPage] = useState(1)

  const [vendorRows, setVendorRows] = useState<VendorReportRow[]>([])
  const [vendorLoading, setVendorLoading] = useState(false)
  const [vendorError, setVendorError] = useState('')
  const [vendorFilters, setVendorFilters] = useState({ vendorType: '', billCategory: '', project: '' })
  const [vendorPage, setVendorPage] = useState(1)
  const [expandedVendorId, setExpandedVendorId] = useState<number | null>(null)

  const [employeeRows, setEmployeeRows] = useState<EmployeeReportRow[]>([])
  const [employeeLoading, setEmployeeLoading] = useState(false)
  const [employeeError, setEmployeeError] = useState('')
  const [employeeFilters, setEmployeeFilters] = useState({ role: '', employmentType: '', activeStatus: '' })
  const [employeePage, setEmployeePage] = useState(1)
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<number | null>(null)

  const pageSize = 20

  useEffect(() => {
    if (activeTab === 'projects') void loadLeadReport()
    if (activeTab === 'vendors') void loadVendorReport()
    if (activeTab === 'employees') void loadEmployeeReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fy])

  useEffect(() => {
    setLeadPage(1)
  }, [leadFilters])

  useEffect(() => {
    setVendorPage(1)
  }, [vendorFilters])

  useEffect(() => {
    setEmployeePage(1)
  }, [employeeFilters])

  const applyFyFromResponse = (data: any) => {
    if (!fy && data?.fy) setFy(data.fy)
    if (Array.isArray(data?.available_fys) && data.available_fys.length) {
      setAvailableFys(data.available_fys)
    }
  }

  const loadLeadReport = async () => {
    setLeadLoading(true)
    setLeadError('')
    try {
      const query = fy ? `?fy=${encodeURIComponent(fy)}` : ''
      const res = await apiFetch(`/api/reports/leads${query}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load project summaries')
      applyFyFromResponse(data)
      setLeadRows(Array.isArray(data?.leads) ? data.leads : [])
      setLeadPage(1)
    } catch (err: any) {
      setLeadError(err?.message || 'Failed to load project summaries')
    } finally {
      setLeadLoading(false)
    }
  }

  const loadVendorReport = async () => {
    setVendorLoading(true)
    setVendorError('')
    try {
      const query = fy ? `?fy=${encodeURIComponent(fy)}` : ''
      const res = await apiFetch(`/api/reports/vendors${query}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load vendor summaries')
      applyFyFromResponse(data)
      setVendorRows(Array.isArray(data?.vendors) ? data.vendors : [])
      setVendorPage(1)
    } catch (err: any) {
      setVendorError(err?.message || 'Failed to load vendor summaries')
    } finally {
      setVendorLoading(false)
    }
  }

  const loadEmployeeReport = async () => {
    setEmployeeLoading(true)
    setEmployeeError('')
    try {
      const query = fy ? `?fy=${encodeURIComponent(fy)}` : ''
      const res = await apiFetch(`/api/reports/employees${query}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load employee summaries')
      applyFyFromResponse(data)
      setEmployeeRows(Array.isArray(data?.employees) ? data.employees : [])
      setEmployeePage(1)
    } catch (err: any) {
      setEmployeeError(err?.message || 'Failed to load employee summaries')
    } finally {
      setEmployeeLoading(false)
    }
  }

  const leadFilterOptions = useMemo(() => {
    const eventTypes = new Set<string>()
    const cities = new Set<string>()
    const statuses = new Set<string>()
    leadRows.forEach(row => {
      if (row.event_type) eventTypes.add(row.event_type)
      if (row.city) cities.add(row.city)
      if (row.status) statuses.add(row.status)
    })
    return {
      eventTypes: Array.from(eventTypes).sort(),
      cities: Array.from(cities).sort(),
      statuses: Array.from(statuses).sort(),
    }
  }, [leadRows])

  const filteredLeads = useMemo(() => {
    const profitMin = leadFilters.profitMin.trim() === '' ? null : Number(leadFilters.profitMin)
    const profitMax = leadFilters.profitMax.trim() === '' ? null : Number(leadFilters.profitMax)
    return leadRows.filter(row => {
      if (leadFilters.eventType && row.event_type !== leadFilters.eventType) return false
      if (leadFilters.city && row.city !== leadFilters.city) return false
      if (leadFilters.status && row.status !== leadFilters.status) return false
      if (Number.isFinite(profitMin) && row.net_profit < (profitMin as number)) return false
      if (Number.isFinite(profitMax) && row.net_profit > (profitMax as number)) return false
      return true
    })
  }, [leadRows, leadFilters])

  const pagedLeads = useMemo(() => {
    const start = (leadPage - 1) * pageSize
    return filteredLeads.slice(start, start + pageSize)
  }, [filteredLeads, leadPage])

  const vendorFilterOptions = useMemo(() => {
    const vendorTypes = new Set<string>()
    const categories = new Set<string>()
    const projects = new Set<string>()
    vendorRows.forEach(row => {
      if (row.vendor_type) vendorTypes.add(row.vendor_type)
      row.bills.forEach(bill => {
        if (bill.category) categories.add(bill.category)
        if (bill.lead_name) projects.add(bill.lead_name)
      })
    })
    return {
      vendorTypes: Array.from(vendorTypes).sort(),
      categories: Array.from(categories).sort(),
      projects: Array.from(projects).sort(),
    }
  }, [vendorRows])

  const filteredVendors = useMemo(() => {
    return vendorRows.filter(row => {
      if (vendorFilters.vendorType && row.vendor_type !== vendorFilters.vendorType) return false
      if (vendorFilters.billCategory) {
        const hasCategory = row.bills.some(bill => bill.category === vendorFilters.billCategory)
        if (!hasCategory) return false
      }
      if (vendorFilters.project) {
        const hasProject = row.bills.some(bill => bill.lead_name === vendorFilters.project)
        if (!hasProject) return false
      }
      return true
    })
  }, [vendorRows, vendorFilters])

  const pagedVendors = useMemo(() => {
    const start = (vendorPage - 1) * pageSize
    return filteredVendors.slice(start, start + pageSize)
  }, [filteredVendors, vendorPage])

  const employeeFilterOptions = useMemo(() => {
    const roles = new Set<string>()
    const employmentTypes = new Set<string>()
    employeeRows.forEach(row => {
      roles.add(employeeRoleLabel(row))
      if (row.employment_type) employmentTypes.add(row.employment_type)
    })
    return {
      roles: Array.from(roles).sort(),
      employmentTypes: Array.from(employmentTypes).sort(),
    }
  }, [employeeRows])

  const filteredEmployees = useMemo(() => {
    return employeeRows.filter(row => {
      if (employeeFilters.role && employeeRoleLabel(row) !== employeeFilters.role) return false
      if (employeeFilters.employmentType && row.employment_type !== employeeFilters.employmentType) return false
      if (employeeFilters.activeStatus) {
        const isActive = row.is_active !== false
        if (employeeFilters.activeStatus === 'active' && !isActive) return false
        if (employeeFilters.activeStatus === 'inactive' && isActive) return false
      }
      return true
    })
  }, [employeeRows, employeeFilters])

  const pagedEmployees = useMemo(() => {
    const start = (employeePage - 1) * pageSize
    return filteredEmployees.slice(start, start + pageSize)
  }, [filteredEmployees, employeePage])

  const exportProjectsCsv = () => {
    const lines: string[] = []
    lines.push('Project,Event Type,City,Revenue,Vendor Cost,Payroll Overhead,Infra Overhead,Net Profit,Profit %')
    filteredLeads.forEach(row => {
      lines.push([
        csvEscape(leadLabel(row)),
        csvEscape(row.event_type || ''),
        csvEscape(row.city || ''),
        csvEscape(row.revenue),
        csvEscape(row.vendor_cost),
        csvEscape(row.payroll_overhead),
        csvEscape(row.infra_overhead),
        csvEscape(row.net_profit),
        csvEscape(row.profit_percent != null ? row.profit_percent.toFixed(2) : '')
      ].join(','))
    })
    downloadCsv(lines.join('\n'), `project-summaries-${fy || 'FY'}.csv`)
  }

  const exportVendorsCsv = () => {
    const lines: string[] = []
    lines.push('Vendor,Type,Total Paid,Bills Paid,Avg Bill Value,Projects Worked On')
    filteredVendors.forEach(row => {
      lines.push([
        csvEscape(row.vendor_name),
        csvEscape(row.vendor_type),
        csvEscape(row.total_paid),
        csvEscape(row.bills_paid),
        csvEscape(row.avg_bill_value),
        csvEscape(row.projects_count)
      ].join(','))
    })
    downloadCsv(lines.join('\n'), `vendor-summaries-${fy || 'FY'}.csv`)
  }

  const exportEmployeesCsv = () => {
    const lines: string[] = []
    lines.push('Employee,Role,Employment Type,Total Payroll Paid,Projects Contributed,Total CU,Avg CU/Month')
    filteredEmployees.forEach(row => {
      lines.push([
        csvEscape(row.name || row.email || `User #${row.user_id}`),
        csvEscape(employeeRoleLabel(row)),
        csvEscape(employmentLabel(row.employment_type)),
        csvEscape(row.total_paid),
        csvEscape(row.projects_count),
        csvEscape(row.total_cu),
        csvEscape(row.avg_cu_per_month.toFixed(2))
      ].join(','))
    })
    downloadCsv(lines.join('\n'), `employee-summaries-${fy || 'FY'}.csv`)
  }

  const downloadCsv = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const totalLeadPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize))
  const totalVendorPages = Math.max(1, Math.ceil(filteredVendors.length / pageSize))
  const totalEmployeePages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize))

  const renderPagination = (current: number, total: number, onChange: (value: number) => void) => (
    <div className="flex items-center gap-2 text-sm">
      <button
        className={buttonOutline}
        onClick={() => onChange(Math.max(1, current - 1))}
        disabled={current <= 1}
      >
        Prev
      </button>
      <span className="text-xs text-neutral-500">Page {current} of {total}</span>
      <button
        className={buttonOutline}
        onClick={() => onChange(Math.min(total, current + 1))}
        disabled={current >= total}
      >
        Next
      </button>
    </div>
  )

  return (
    <div className="space-y-8">
      <div className="bg-[var(--background)] pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Finance · Summaries</div>
            <h1 className="text-2xl md:text-3xl font-semibold mt-2">Summaries</h1>
            <p className="text-sm text-neutral-600 mt-1">Financial rollups for review and export. Not performance reports.</p>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Financial Year</div>
              <select className={fieldClass} value={fy} onChange={e => setFy(e.target.value)}>
                {availableFys.length === 0 && <option value="">Loading FYs…</option>}
                {availableFys.map(label => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <button className={activeTab === 'projects' ? buttonPrimary : buttonOutline} onClick={() => setActiveTab('projects')}>Projects</button>
          <button className={activeTab === 'vendors' ? buttonPrimary : buttonOutline} onClick={() => setActiveTab('vendors')}>Vendors</button>
          <button className={activeTab === 'employees' ? buttonPrimary : buttonOutline} onClick={() => setActiveTab('employees')}>Employees</button>
        </div>
      </div>

      {activeTab === 'projects' && (
        <section className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">Project Summaries</div>
              <div className="text-xs text-neutral-500">Projects active in the selected FY.</div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="text-xs text-neutral-500 mb-1">Event Type</div>
                <select className={fieldClass} value={leadFilters.eventType} onChange={e => setLeadFilters({ ...leadFilters, eventType: e.target.value })}>
                  <option value="">All</option>
                  {leadFilterOptions.eventTypes.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">City</div>
                <select className={fieldClass} value={leadFilters.city} onChange={e => setLeadFilters({ ...leadFilters, city: e.target.value })}>
                  <option value="">All</option>
                  {leadFilterOptions.cities.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">Status</div>
                <select className={fieldClass} value={leadFilters.status} onChange={e => setLeadFilters({ ...leadFilters, status: e.target.value })}>
                  <option value="">All</option>
                  {leadFilterOptions.statuses.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">Profit Min</div>
                <input className={fieldClass} value={leadFilters.profitMin} onChange={e => setLeadFilters({ ...leadFilters, profitMin: e.target.value })} placeholder="0" />
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">Profit Max</div>
                <input className={fieldClass} value={leadFilters.profitMax} onChange={e => setLeadFilters({ ...leadFilters, profitMax: e.target.value })} placeholder="Any" />
              </div>
              <button className={buttonOutline} onClick={exportProjectsCsv} disabled={filteredLeads.length === 0}>Export CSV</button>
            </div>
          </div>

          {leadError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {leadError}
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                <tr className="text-left">
                  <th className="pb-3">Project</th>
                  <th className="pb-3">Event Type</th>
                  <th className="pb-3">City</th>
                  <th className="pb-3">Revenue</th>
                  <th className="pb-3">Vendor Cost</th>
                  <th className="pb-3">Payroll</th>
                  <th className="pb-3">Infra</th>
                  <th className="pb-3">Net Profit</th>
                  <th className="pb-3">Profit %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {leadLoading && (
                  <tr><td className="py-4 text-sm text-neutral-500" colSpan={9}>Loading summaries…</td></tr>
                )}
                {!leadLoading && pagedLeads.length === 0 && (
                  <tr><td className="py-4 text-sm text-neutral-500" colSpan={9}>No projects found.</td></tr>
                )}
                {!leadLoading && pagedLeads.map(row => (
                  <tr
                    key={row.lead_id}
                    className="hover:bg-[var(--surface-muted)] cursor-pointer"
                    onClick={() => window.location.href = `/admin/finance/projects/${row.lead_id}/pnl`}
                  >
                    <td className="py-3 font-medium text-neutral-900">{leadLabel(row)}</td>
                    <td className="py-3 text-neutral-600">{row.event_type || '—'}</td>
                    <td className="py-3 text-neutral-600">{row.city || '—'}</td>
                    <td className="py-3">{formatMoney(row.revenue)}</td>
                    <td className="py-3">{formatMoney(row.vendor_cost)}</td>
                    <td className="py-3">{formatMoney(row.payroll_overhead)}</td>
                    <td className="py-3">{formatMoney(row.infra_overhead)}</td>
                    <td className={`py-3 font-semibold ${row.net_profit < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatMoney(row.net_profit)}</td>
                    <td className="py-3">{row.profit_percent != null ? `${row.profit_percent.toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            {renderPagination(leadPage, totalLeadPages, setLeadPage)}
          </div>
        </section>
      )}

      {activeTab === 'vendors' && (
        <section className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">Vendor Summaries</div>
              <div className="text-xs text-neutral-500">Paid vendor bills within the FY.</div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="text-xs text-neutral-500 mb-1">Vendor Type</div>
                <select className={fieldClass} value={vendorFilters.vendorType} onChange={e => setVendorFilters({ ...vendorFilters, vendorType: e.target.value })}>
                  <option value="">All</option>
                  {vendorFilterOptions.vendorTypes.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">Bill Category</div>
                <select className={fieldClass} value={vendorFilters.billCategory} onChange={e => setVendorFilters({ ...vendorFilters, billCategory: e.target.value })}>
                  <option value="">All</option>
                  {vendorFilterOptions.categories.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">Project</div>
                <select className={fieldClass} value={vendorFilters.project} onChange={e => setVendorFilters({ ...vendorFilters, project: e.target.value })}>
                  <option value="">All</option>
                  {vendorFilterOptions.projects.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <button className={buttonOutline} onClick={exportVendorsCsv} disabled={filteredVendors.length === 0}>Export CSV</button>
            </div>
          </div>

          {vendorError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {vendorError}
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                <tr className="text-left">
                  <th className="pb-3">Vendor</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Total Paid</th>
                  <th className="pb-3">Bills Paid</th>
                  <th className="pb-3">Avg Bill</th>
                  <th className="pb-3">Projects</th>
                  <th className="pb-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {vendorLoading && (
                  <tr><td className="py-4 text-sm text-neutral-500" colSpan={7}>Loading summaries…</td></tr>
                )}
                {!vendorLoading && pagedVendors.length === 0 && (
                  <tr><td className="py-4 text-sm text-neutral-500" colSpan={7}>No vendors found.</td></tr>
                )}
                {!vendorLoading && pagedVendors.map(row => (
                  <Fragment key={row.vendor_id}>
                    <tr className="hover:bg-[var(--surface-muted)]">
                      <td className="py-3 font-medium text-neutral-900">{row.vendor_name}</td>
                      <td className="py-3 text-neutral-600">{row.vendor_type}</td>
                      <td className="py-3">{formatMoney(row.total_paid)}</td>
                      <td className="py-3">{row.bills_paid}</td>
                      <td className="py-3">{formatMoney(row.avg_bill_value)}</td>
                      <td className="py-3">{row.projects_count}</td>
                      <td className="py-3">
                        <button
                          className={buttonOutline}
                          onClick={() => setExpandedVendorId(expandedVendorId === row.vendor_id ? null : row.vendor_id)}
                        >
                          {expandedVendorId === row.vendor_id ? 'Hide Bills' : 'View Bills'}
                        </button>
                      </td>
                    </tr>
                    {expandedVendorId === row.vendor_id && (
                      <tr>
                        <td colSpan={7} className="py-4">
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                            <div className="text-sm font-semibold mb-3">Bills</div>
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-xs">
                                <thead className="text-neutral-500 uppercase tracking-[0.2em]">
                                  <tr className="text-left">
                                    <th className="pb-2">Date</th>
                                    <th className="pb-2">Project</th>
                                    <th className="pb-2">Amount</th>
                                    <th className="pb-2">Category</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                  {row.bills.length === 0 && (
                                    <tr><td className="py-2 text-neutral-500" colSpan={4}>No bills found.</td></tr>
                                  )}
                                  {row.bills.map(bill => (
                                    <tr key={bill.bill_id}>
                                      <td className="py-2">{bill.paid_date || '—'}</td>
                                      <td className="py-2">{bill.lead_name ? `${bill.lead_name}${bill.lead_number ? ` (L${bill.lead_number})` : ''}` : '—'}</td>
                                      <td className="py-2">{formatMoney(bill.amount)}</td>
                                      <td className="py-2">{bill.category || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            {renderPagination(vendorPage, totalVendorPages, setVendorPage)}
          </div>
        </section>
      )}

      {activeTab === 'employees' && (
        <section className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">Employee Summaries</div>
              <div className="text-xs text-neutral-500">Payroll paid and contribution units for the FY.</div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="text-xs text-neutral-500 mb-1">Role</div>
                <select className={fieldClass} value={employeeFilters.role} onChange={e => setEmployeeFilters({ ...employeeFilters, role: e.target.value })}>
                  <option value="">All</option>
                  {employeeFilterOptions.roles.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">Employment Type</div>
                <select className={fieldClass} value={employeeFilters.employmentType} onChange={e => setEmployeeFilters({ ...employeeFilters, employmentType: e.target.value })}>
                  <option value="">All</option>
                  {employeeFilterOptions.employmentTypes.map(value => <option key={value} value={value}>{employmentLabel(value)}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">Status</div>
                <select className={fieldClass} value={employeeFilters.activeStatus} onChange={e => setEmployeeFilters({ ...employeeFilters, activeStatus: e.target.value })}>
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <button className={buttonOutline} onClick={exportEmployeesCsv} disabled={filteredEmployees.length === 0}>Export CSV</button>
            </div>
          </div>

          {employeeError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {employeeError}
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                <tr className="text-left">
                  <th className="pb-3">Employee</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Payroll Paid</th>
                  <th className="pb-3">Projects</th>
                  <th className="pb-3">Total CU</th>
                  <th className="pb-3">Avg CU / Month</th>
                  <th className="pb-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {employeeLoading && (
                  <tr><td className="py-4 text-sm text-neutral-500" colSpan={7}>Loading summaries…</td></tr>
                )}
                {!employeeLoading && pagedEmployees.length === 0 && (
                  <tr><td className="py-4 text-sm text-neutral-500" colSpan={7}>No employees found.</td></tr>
                )}
                {!employeeLoading && pagedEmployees.map(row => (
                  <Fragment key={row.user_id}>
                    <tr className="hover:bg-[var(--surface-muted)]">
                      <td className="py-3 font-medium text-neutral-900">{row.name || row.email || `User #${row.user_id}`}</td>
                      <td className="py-3 text-neutral-600">{employeeRoleLabel(row)}</td>
                      <td className="py-3">{formatMoney(row.total_paid)}</td>
                      <td className="py-3">{row.projects_count}</td>
                      <td className="py-3">{row.total_cu}</td>
                      <td className="py-3">{row.avg_cu_per_month.toFixed(1)}</td>
                      <td className="py-3">
                        <button
                          className={buttonOutline}
                          onClick={() => setExpandedEmployeeId(expandedEmployeeId === row.user_id ? null : row.user_id)}
                        >
                          {expandedEmployeeId === row.user_id ? 'Hide Details' : 'View Details'}
                        </button>
                      </td>
                    </tr>
                    {expandedEmployeeId === row.user_id && (
                      <tr>
                        <td colSpan={7} className="py-4">
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <div className="text-sm font-semibold mb-2">Month-wise CU</div>
                                <div className="space-y-1 text-sm text-neutral-600">
                                  {row.monthly_cu.length === 0 && <div>No CU logged.</div>}
                                  {row.monthly_cu.map(item => (
                                    <div key={item.month} className="flex justify-between">
                                      <span>{item.month}</span>
                                      <span>{item.cu_count}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm font-semibold mb-2">Project Distribution</div>
                                <div className="space-y-1 text-sm text-neutral-600">
                                  {row.project_cu.length === 0 && <div>No projects logged.</div>}
                                  {row.project_cu.map(item => {
                                    const percent = row.total_cu > 0 ? (item.cu_count / row.total_cu) * 100 : 0
                                    return (
                                      <div key={item.lead_id} className="flex justify-between">
                                        <span>{item.lead_name ? `${item.lead_name}${item.lead_number ? ` (L${item.lead_number})` : ''}` : `Lead #${item.lead_id}`}</span>
                                        <span>{item.cu_count} ({percent.toFixed(0)}%)</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            {renderPagination(employeePage, totalEmployeePages, setEmployeePage)}
          </div>
        </section>
      )}
    </div>
  )
}
