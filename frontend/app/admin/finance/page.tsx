'use client'

import { useEffect, useMemo, useState, type MouseEvent, type FocusEvent } from 'react'
import { toISTDateInput } from '@/lib/formatters'
import { formatIndian } from '@/components/CurrencyInput'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm'
const chartHeight = 136

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type CashflowRow = {
  month: string
  total_in: number
  total_out: number
  net: number
}

type TransactionRow = {
  id: number
  date: string
  amount: number | string
  direction: 'in' | 'out'
  money_source_name?: string | null
  category_name?: string | null
  note?: string | null
  is_transfer?: boolean
  lead_id?: number | null
  lead_name?: string | null
  lead_number?: number | null
  is_overhead?: boolean
  vendor_bill_id?: number | null
  user_id?: number | null
  transaction_type?: 'invoice_payment' | 'vendor_payment' | 'payroll' | 'overhead' | 'transfer' | null
}

type ProjectProfitRow = {
  lead_id: number
  lead_name?: string | null
  lead_number?: number | null
  revenue: number
  cost: number
  profit: number
  margin: number
}

type FyTrendRow = {
  label: string
  expected: number
  received: number
}

type MoneySource = {
  id: number
  name: string
}

const formatMoney = (value: number | string) => {
  const rounded = Math.round(Number(value || 0))
  return `₹${formatIndian(rounded)}`
}
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const buildAxisTicks = (maxValue: number, steps = 4) => {
  const safeMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 0
  const ticks = []
  for (let i = steps; i >= 0; i -= 1) {
    const value = Math.round((safeMax * i) / steps)
    ticks.push(value)
  }
  return ticks
}

const buildLinePoints = (rows: FyTrendRow[], key: 'expected' | 'received', maxValue: number) => {
  if (!rows.length) return ''
  const safeMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 1
  return rows
    .map((row, index) => {
      const x = rows.length === 1 ? 50 : (index / (rows.length - 1)) * 100
      const rawValue = Number(row[key] || 0)
      const y = 100 - (rawValue / safeMax) * 100
      return `${x},${y}`
    })
    .join(' ')
}

const getCurrentFyLabel = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const start = month >= 4 ? year : year - 1
  const end = start + 1
  return `FY${String(start).slice(2)}-${String(end).slice(2)}`
}

const getFyRangeFromLabel = (label: string) => {
  const match = label.match(/FY(\d{2})-(\d{2})/)
  if (!match) return null
  const startYear = 2000 + Number(match[1])
  const endYear = 2000 + Number(match[2])
  return {
    start: `${startYear}-04-01`,
    end: `${endYear}-03-31`,
    startMonth: `${startYear}-04`,
    endMonth: `${endYear}-03`,
  }
}

const padMonth = (value: number) => String(value).padStart(2, '0')

const monthKey = (dateValue?: string | null) => {
  if (!dateValue) return null
  const clean = String(dateValue).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null
  return clean.slice(0, 7)
}

const formatDateShort = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
}

const monthStartDate = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return null
  return toISTDateInput(new Date(y, m - 1, 1))
}

const monthEndDate = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return null
  const end = new Date(y, m, 0)
  return toISTDateInput(end)
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const toYmd = (date: Date) => toISTDateInput(date)

const buildMonthSpan = (fromYm: string, toYm: string) => {
  const [fromY, fromM] = fromYm.split('-').map(Number)
  const [toY, toM] = toYm.split('-').map(Number)
  if (!fromY || !fromM || !toY || !toM) return []
  const start = new Date(fromY, fromM - 1, 1)
  const end = new Date(toY, toM - 1, 1)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  const months = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cursor <= end) {
    const ym = `${cursor.getFullYear()}-${padMonth(cursor.getMonth() + 1)}`
    const label = `${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`
    months.push({ ym, label })
    cursor.setMonth(cursor.getMonth() + 1, 1)
  }
  return months
}

const buildFyMonths = (fyLabel: string) => {
  const range = getFyRangeFromLabel(fyLabel)
  if (!range) return []
  const months = []
  const start = new Date(`${range.start}T00:00:00`)
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const ym = `${d.getFullYear()}-${padMonth(d.getMonth() + 1)}`
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`
    months.push({ ym, label })
  }
  return months
}

const buildFyRangeMeta = (fyLabel: string) => {
  const range = getFyRangeFromLabel(fyLabel)
  if (!range) return null
  return {
    label: fyLabel,
    fromMonth: range.startMonth,
    toMonth: range.endMonth,
    startDate: range.start,
    endDate: range.end,
    monthList: buildFyMonths(fyLabel),
  }
}

const buildLast12Range = () => {
  const now = new Date()
  const toMonth = `${now.getFullYear()}-${padMonth(now.getMonth() + 1)}`
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const fromMonth = `${start.getFullYear()}-${padMonth(start.getMonth() + 1)}`
  const startDate = monthStartDate(fromMonth) || `${start.getFullYear()}-${padMonth(start.getMonth() + 1)}-01`
  const endDate = monthEndDate(toMonth) || `${now.getFullYear()}-${padMonth(now.getMonth() + 1)}-01`
  return {
    label: 'last12',
    fromMonth,
    toMonth,
    startDate,
    endDate,
    monthList: buildMonthSpan(fromMonth, toMonth),
  }
}

const buildRangeMeta = (selection: string) => {
  if (selection === 'last12') return buildLast12Range()
  return buildFyRangeMeta(selection)
}

const clampMonthRange = (fyLabel: string, fromValue?: string, toValue?: string) => {
  const range = getFyRangeFromLabel(fyLabel)
  if (!range) return null
  const clamp = (value: string, min: string, max: string) => {
    if (value < min) return min
    if (value > max) return max
    return value
  }
  const rawFrom = fromValue && /^\d{4}-\d{2}$/.test(fromValue) ? fromValue : range.startMonth
  const rawTo = toValue && /^\d{4}-\d{2}$/.test(toValue) ? toValue : range.endMonth
  let from = clamp(rawFrom, range.startMonth, range.endMonth)
  let to = clamp(rawTo, range.startMonth, range.endMonth)
  if (from > to) {
    const swap = from
    from = to
    to = swap
  }
  return { ...range, fromMonth: from, toMonth: to }
}

const buildFyOptions = () => {
  const current = getCurrentFyLabel()
  const range = getFyRangeFromLabel(current)
  if (!range) return [current]
  const prevStart = Number(range.start.slice(0, 4)) - 1
  const prev = `FY${String(prevStart).slice(2)}-${String(prevStart + 1).slice(2)}`
  const prev2Start = prevStart - 1
  const prev2 = `FY${String(prev2Start).slice(2)}-${String(prev2Start + 1).slice(2)}`
  return [current, prev, prev2]
}

const buildFyTrendLabels = (baseLabel: string, count = 4) => {
  const range = getFyRangeFromLabel(baseLabel)
  if (!range) return [baseLabel]
  const currentStart = Number(range.start.slice(0, 4))
  const labels = []
  for (let i = 0; i < count; i += 1) {
    const start = currentStart - i
    const end = start + 1
    labels.push(`FY${String(start).slice(2)}-${String(end).slice(2)}`)
  }
  return labels.reverse()
}

export default function FinanceAnalyticsTestPage() {
  const [fyOptions] = useState(buildFyOptions)
  const [rangeSelection, setRangeSelection] = useState(() => fyOptions[0] || getCurrentFyLabel())
  const [moneySources, setMoneySources] = useState<MoneySource[]>([])
  const [moneySourceId, setMoneySourceId] = useState('')

  const [cashflowRows, setCashflowRows] = useState<CashflowRow[]>([])
  const [cashflowDisplayRows, setCashflowDisplayRows] = useState<CashflowRow[]>([])
  const [expectedDisplayRows, setExpectedDisplayRows] = useState<{ month: string; expected: number; received: number }[]>([])
  const [fyTrendRows, setFyTrendRows] = useState<FyTrendRow[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [balanceTrend, setBalanceTrend] = useState<{ label: string; balance: number }[]>([])
  const [snapshot, setSnapshot] = useState({
    liquidCash: 0,
    clientOutstanding: 0,
    vendorPending: 0,
    payrollDue: 0,
    overheadsDue: 0,
  })
  const [costStructure, setCostStructure] = useState({
    revenue: 0,
    salaries: 0,
    freelancers: 0,
    overheads: 0,
    profit: 0,
  })
  const [agingBuckets, setAgingBuckets] = useState({
    bucket0_30: 0,
    bucket31_60: 0,
    bucket61_90: 0,
    bucket90: 0,
    projects: {
      bucket0_30: [] as { lead_id: number; lead_number?: number | null; lead_name?: string | null; amount: number }[],
      bucket31_60: [] as { lead_id: number; lead_number?: number | null; lead_name?: string | null; amount: number }[],
      bucket61_90: [] as { lead_id: number; lead_number?: number | null; lead_name?: string | null; amount: number }[],
      bucket90: [] as { lead_id: number; lead_number?: number | null; lead_name?: string | null; amount: number }[],
    },
  })
  const [forecast, setForecast] = useState({
    in30: 0,
    out30: 0,
    net30: 0,
    in60: 0,
    out60: 0,
    net60: 0,
  })
  const [projectProfitability, setProjectProfitability] = useState<{
    top: ProjectProfitRow[]
    bottom: ProjectProfitRow[]
    avgMargin: number
  }>({ top: [], bottom: [], avgMargin: 0 })
  const [fyTooltip, setFyTooltip] = useState<{
    left: number
    top: number
    expected: number
    received: number
    label: string
  } | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadSources()
  }, [])

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeSelection, moneySourceId])

  const loadSources = async () => {
    try {
      const res = await apiFetch('/api/finance/money-sources')
      const data = await res.json().catch(() => [])
      if (!res.ok) throw new Error(data?.error || 'Failed to load accounts')
      setMoneySources(Array.isArray(data) ? data : [])
    } catch (err) {
      setMoneySources([])
    }
  }

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const range = buildRangeMeta(rangeSelection)
      if (!range) throw new Error('Invalid range')

      const cashflowParams = new URLSearchParams()
      cashflowParams.set('from_month', range.fromMonth)
      cashflowParams.set('to_month', range.toMonth)
      if (moneySourceId) cashflowParams.set('money_source_id', moneySourceId)
      const cashflowUrl = `/api/finance/cashflow?${cashflowParams.toString()}`

      const expectedParams = new URLSearchParams()
      expectedParams.set('from_month', range.fromMonth)
      expectedParams.set('to_month', range.toMonth)
      const expectedUrl = `/api/finance/expected-payments?${expectedParams.toString()}`

      const categoryFrom = monthStartDate(range.fromMonth) || range.startDate
      const categoryTo = monthEndDate(range.toMonth) || range.endDate
      const balanceStartDate = new Date(`${range.startDate}T00:00:00`)
      balanceStartDate.setDate(balanceStartDate.getDate() - 1)
      const balanceAsOf = toYmd(balanceStartDate)

      const txAllParams = new URLSearchParams({
        limit: '5000',
        date_from: categoryFrom,
        date_to: categoryTo,
      })
      const balanceTxParams = new URLSearchParams({
        limit: '5000',
        date_from: range.startDate,
        date_to: range.endDate,
        include_transfers: '1',
      })
      const recentParams = new URLSearchParams({ limit: '10' })
      if (moneySourceId) {
        balanceTxParams.set('money_source_id', moneySourceId)
        recentParams.set('money_source_id', moneySourceId)
      }

      const perfCashflowParams = new URLSearchParams()
      perfCashflowParams.set('from_month', range.fromMonth)
      perfCashflowParams.set('to_month', range.toMonth)
      const perfCashflowUrl = `/api/finance/cashflow?${perfCashflowParams.toString()}`

      const now = new Date()
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const currentMonth = toYmd(currentMonthStart)
      const todayYmd = toYmd(now)

      const nextMonthStart = new Date(currentMonthStart)
      nextMonthStart.setMonth(nextMonthStart.getMonth() + 1)
      const nextMonth = toYmd(nextMonthStart)

      const [cashflowRes, perfCashflowRes, expectedRes, txRes, txAllRes, balanceRes, balanceTxRes, vendorBillsRes, invoicesRes, payrollRes, payrollNextRes, categoriesRes, overheadTxRes, balanceNowRes] = await Promise.all([
        apiFetch(cashflowUrl),
        apiFetch(perfCashflowUrl),
        apiFetch(expectedUrl),
        apiFetch(`/api/finance/transactions?${recentParams.toString()}`),
        apiFetch(`/api/finance/transactions?${txAllParams.toString()}`),
        apiFetch(`/api/finance/balances?as_of=${balanceAsOf}`),
        apiFetch(`/api/finance/transactions?${balanceTxParams.toString()}`),
        apiFetch('/api/finance/vendor-bills'),
        apiFetch('/api/finance/invoices?limit=5000'),
        apiFetch(`/api/finance/payroll/summary?month=${currentMonth}`),
        apiFetch(`/api/finance/payroll/summary?month=${nextMonth}`),
        apiFetch('/api/finance/categories'),
        apiFetch('/api/finance/transactions?is_overhead=true&direction=out&limit=5000'),
        apiFetch(`/api/finance/balances?as_of=${todayYmd}`),
      ])

      const cashflowData = await cashflowRes.json().catch(() => null)
      const perfCashflowData = await perfCashflowRes.json().catch(() => null)
      const expectedData = await expectedRes.json().catch(() => null)
      const txData = await txRes.json().catch(() => [])
      const txAllData = await txAllRes.json().catch(() => [])
      const balanceData = await balanceRes.json().catch(() => [])
      const balanceTxData = await balanceTxRes.json().catch(() => [])
      const vendorBillsData = await vendorBillsRes.json().catch(() => [])
      const invoicesData = await invoicesRes.json().catch(() => [])
      const payrollData = await payrollRes.json().catch(() => [])
      const payrollNextData = await payrollNextRes.json().catch(() => [])
      const categoriesData = await categoriesRes.json().catch(() => [])
      const overheadTxData = await overheadTxRes.json().catch(() => [])
      const balanceNowData = await balanceNowRes.json().catch(() => [])

      if (!cashflowRes.ok) throw new Error(cashflowData?.error || 'Failed to load cashflow')
      if (!perfCashflowRes.ok) throw new Error(perfCashflowData?.error || 'Failed to load performance cashflow')
      if (!expectedRes.ok) throw new Error(expectedData?.error || 'Failed to load expected payments')
      if (!txRes.ok) throw new Error(txData?.error || 'Failed to load transactions')
      if (!txAllRes.ok) throw new Error(txAllData?.error || 'Failed to load transaction totals')
      if (!balanceRes.ok) throw new Error(balanceData?.error || 'Failed to load balances')
      if (!balanceTxRes.ok) throw new Error(balanceTxData?.error || 'Failed to load balance transactions')
      if (!vendorBillsRes.ok) throw new Error(vendorBillsData?.error || 'Failed to load vendor bills')
      if (!invoicesRes.ok) throw new Error(invoicesData?.error || 'Failed to load invoices')
      if (!payrollRes.ok) throw new Error(payrollData?.error || 'Failed to load payroll summary')
      if (!payrollNextRes.ok) throw new Error(payrollNextData?.error || 'Failed to load next payroll summary')
      if (!categoriesRes.ok) throw new Error(categoriesData?.error || 'Failed to load categories')
      if (!overheadTxRes.ok) throw new Error(overheadTxData?.error || 'Failed to load overhead transactions')
      if (!balanceNowRes.ok) throw new Error(balanceNowData?.error || 'Failed to load latest balances')

      setCashflowRows(Array.isArray(cashflowData?.rows) ? cashflowData.rows : [])
      setTransactions(Array.isArray(txData) ? txData : [])

      const allRows = Array.isArray(txAllData) ? txAllData : []
      const cashflowByMonth = new Map<string, CashflowRow>()
      const rawRows = Array.isArray(cashflowData?.rows) ? cashflowData.rows : []
      rawRows.forEach((row: CashflowRow) => {
        cashflowByMonth.set(row.month, row)
      })
      const displayRows = range.monthList.map((item) => {
        const base = cashflowByMonth.get(item.ym)
        const totalIn = Number(base?.total_in || 0)
        const totalOut = Number(base?.total_out || 0)
        return {
          month: item.label,
          total_in: totalIn,
          total_out: totalOut,
          net: totalIn - totalOut,
        }
      })
      setCashflowDisplayRows(displayRows)

      const perfCashflowByMonth = new Map<string, CashflowRow>()
      const perfRows = Array.isArray(perfCashflowData?.rows) ? perfCashflowData.rows : []
      perfRows.forEach((row: CashflowRow) => {
        perfCashflowByMonth.set(row.month, row)
      })

      const expectedByMonth = new Map<string, number>()
      const expectedRows = Array.isArray(expectedData?.rows) ? expectedData.rows : []
      expectedRows.forEach((row: any) => {
        if (!row?.month) return
        expectedByMonth.set(row.month, Number(row.expected_total || 0))
      })
      const expectedDisplay = range.monthList.map((item) => {
        const received = Number(perfCashflowByMonth.get(item.ym)?.total_in || 0)
        return {
          month: item.label,
          expected: expectedByMonth.get(item.ym) || 0,
          received
        }
      })
      setExpectedDisplayRows(expectedDisplay)

      const focusFyLabel = rangeSelection === 'last12' ? getCurrentFyLabel() : rangeSelection
      const trendLabels = buildFyTrendLabels(focusFyLabel, 4)
      const trendRows = await Promise.all(
        trendLabels.map(async (label) => {
          const fyRange = getFyRangeFromLabel(label)
          if (!fyRange) return { label, expected: 0, received: 0 }
          try {
            const fyCashflowParams = new URLSearchParams({
              from_month: fyRange.startMonth,
              to_month: fyRange.endMonth,
            })
            const fyExpectedParams = new URLSearchParams({
              from_month: fyRange.startMonth,
              to_month: fyRange.endMonth,
            })
            const [fyCashflowRes, fyExpectedRes] = await Promise.all([
              apiFetch(`/api/finance/cashflow?${fyCashflowParams.toString()}`),
              apiFetch(`/api/finance/expected-payments?${fyExpectedParams.toString()}`),
            ])
            const fyCashflowData = await fyCashflowRes.json().catch(() => null)
            const fyExpectedData = await fyExpectedRes.json().catch(() => null)
            if (!fyCashflowRes.ok || !fyExpectedRes.ok) return { label, expected: 0, received: 0 }
            const receivedTotal = Array.isArray(fyCashflowData?.rows)
              ? fyCashflowData.rows.reduce((sum: number, row: any) => sum + Number(row.total_in || 0), 0)
              : 0
            const expectedTotal = Array.isArray(fyExpectedData?.rows)
              ? fyExpectedData.rows.reduce((sum: number, row: any) => sum + Number(row.expected_total || 0), 0)
              : 0
            return { label, expected: expectedTotal, received: receivedTotal }
          } catch (err) {
            return { label, expected: 0, received: 0 }
          }
        })
      )
      setFyTrendRows(trendRows)

      const openingBalance = Array.isArray(balanceData)
        ? balanceData.reduce((sum, row) => {
          if (moneySourceId && String(row.money_source_id) !== String(moneySourceId)) return sum
          return sum + Number(row.balance || 0)
        }, 0)
        : 0
      const balanceDeltaByMonth = new Map<string, number>()
      const balanceRows = Array.isArray(balanceTxData) ? balanceTxData : []
      balanceRows.forEach((row: TransactionRow) => {
        const ym = monthKey(row.date)
        if (!ym) return
        const amount = Number(row.amount || 0)
        const delta = row.direction === 'in' ? amount : -amount
        balanceDeltaByMonth.set(ym, (balanceDeltaByMonth.get(ym) || 0) + delta)
      })
      let running = openingBalance
      const trend = range.monthList.map(item => {
        running += balanceDeltaByMonth.get(item.ym) || 0
        return { label: item.label, balance: running }
      })
      setBalanceTrend(trend)

      const billsList = Array.isArray(vendorBillsData) ? vendorBillsData : []
      const billLookup = new Map<number, { vendor_id: number; vendor_name: string; lead_id: number | null }>()
      billsList.forEach((bill: any) => {
        billLookup.set(bill.id, {
          vendor_id: bill.vendor_id,
          vendor_name: bill.vendor_name || 'Vendor',
          lead_id: bill.lead_id ? Number(bill.lead_id) : null,
        })
      })

      const costTotals = allRows.reduce(
        (acc, row: TransactionRow) => {
          if (row.is_transfer || row.transaction_type === 'transfer') return acc
          const amount = Number(row.amount || 0)
          if (row.transaction_type === 'invoice_payment') {
            acc.revenue += amount
            return acc
          }
          if (row.transaction_type === 'payroll') acc.salaries += amount
          if (row.transaction_type === 'overhead') acc.overheads += amount
          if (row.transaction_type === 'vendor_payment') {
            const billId = (row as any).vendor_bill_id
            if (billId && billLookup.get(billId)?.lead_id) acc.freelancers += amount
          }
          return acc
        },
        { revenue: 0, salaries: 0, freelancers: 0, overheads: 0 }
      )
      const profit = costTotals.revenue - costTotals.salaries - costTotals.freelancers - costTotals.overheads
      setCostStructure({ ...costTotals, profit })

      const projectMap = new Map<number, ProjectProfitRow>()
      allRows.forEach((row: TransactionRow) => {
        if (row.is_transfer || row.transaction_type === 'transfer') return
        if (!row.lead_id) return
        const leadId = Number(row.lead_id)
        if (!leadId) return
        if (!projectMap.has(leadId)) {
          projectMap.set(leadId, {
            lead_id: leadId,
            lead_name: row.lead_name || null,
            lead_number: row.lead_number || null,
            revenue: 0,
            cost: 0,
            profit: 0,
            margin: 0,
          })
        }
        const target = projectMap.get(leadId)!
        const amount = Number(row.amount || 0)
        if (row.transaction_type === 'invoice_payment') {
          target.revenue += amount
        } else if (row.transaction_type === 'vendor_payment') {
          const billId = row.vendor_bill_id
          if (billId) {
            target.cost += amount
          }
        }
      })

      const projectRows = Array.from(projectMap.values()).map((row) => {
        const profitValue = row.revenue - row.cost
        const margin = row.revenue > 0 ? (profitValue / row.revenue) * 100 : 0
        return { ...row, profit: profitValue, margin }
      })

      const avgMargin =
        projectRows.filter((row) => row.revenue > 0).reduce((sum, row) => sum + row.margin, 0) /
        Math.max(1, projectRows.filter((row) => row.revenue > 0).length)

      const top = [...projectRows].sort((a, b) => b.profit - a.profit).slice(0, 5)
      const bottom = [...projectRows].sort((a, b) => a.profit - b.profit).slice(0, 5)

      setProjectProfitability({ top, bottom, avgMargin: Number.isFinite(avgMargin) ? avgMargin : 0 })

      const liquidCashTotal = Array.isArray(balanceNowData)
        ? balanceNowData.reduce((sum, row) => {
          if (moneySourceId && String(row.money_source_id) !== String(moneySourceId)) return sum
          return sum + Number(row.balance || 0)
        }, 0)
        : 0

      const invoicesList = Array.isArray(invoicesData) ? invoicesData : []
      const clientOutstandingTotal = invoicesList.reduce((sum: number, invoice: any) => {
        const status = String(invoice.status || '').toLowerCase()
        if (status === 'draft' || status === 'cancelled') return sum
        const total = Number(invoice.total_amount || 0)
        const paid = Number(invoice.paid_amount || 0)
        const remaining = Math.max(0, total - paid)
        return sum + remaining
      }, 0)

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const agingProjectMaps = {
        bucket0_30: new Map<number, { lead_id: number; lead_number?: number | null; lead_name?: string | null; amount: number }>(),
        bucket31_60: new Map<number, { lead_id: number; lead_number?: number | null; lead_name?: string | null; amount: number }>(),
        bucket61_90: new Map<number, { lead_id: number; lead_number?: number | null; lead_name?: string | null; amount: number }>(),
        bucket90: new Map<number, { lead_id: number; lead_number?: number | null; lead_name?: string | null; amount: number }>(),
      }

      const agingTotals = invoicesList.reduce(
        (acc: { bucket0_30: number; bucket31_60: number; bucket61_90: number; bucket90: number }, invoice: any) => {
          const status = String(invoice.status || '').toLowerCase()
          if (status === 'draft' || status === 'cancelled') return acc
          if (!invoice.due_date) return acc
          const dueDateValue = new Date(invoice.due_date)
          if (Number.isNaN(dueDateValue.getTime())) return acc
          const dueDateStart = new Date(dueDateValue)
          dueDateStart.setHours(0, 0, 0, 0)
          const total = Number(invoice.total_amount || 0)
          const paid = Number(invoice.paid_amount || 0)
          const outstanding = Math.max(0, total - paid)
          if (outstanding <= 0) return acc
          const leadId = Number(invoice.lead_id || 0)
          const leadName = invoice.lead_name || 'Lead'
          const leadNumber = invoice.lead_number || null
          const updateProject = (bucketKey: keyof typeof agingProjectMaps) => {
            if (!leadId) return
            const bucketMap = agingProjectMaps[bucketKey]
            const existing = bucketMap.get(leadId)
            if (existing) {
              existing.amount += outstanding
            } else {
              bucketMap.set(leadId, {
                lead_id: leadId,
                lead_name: leadName,
                lead_number: leadNumber,
                amount: outstanding,
              })
            }
          }
          const diffMs = todayStart.getTime() - dueDateStart.getTime()
          const ageDays = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0
          if (ageDays <= 30) {
            acc.bucket0_30 += outstanding
            updateProject('bucket0_30')
          } else if (ageDays <= 60) {
            acc.bucket31_60 += outstanding
            updateProject('bucket31_60')
          } else if (ageDays <= 90) {
            acc.bucket61_90 += outstanding
            updateProject('bucket61_90')
          } else {
            acc.bucket90 += outstanding
            updateProject('bucket90')
          }
          return acc
        },
        { bucket0_30: 0, bucket31_60: 0, bucket61_90: 0, bucket90: 0 }
      )

      const vendorPendingTotal = billsList.reduce((sum: number, bill: any) => {
        const billAmount = Number(bill.bill_amount || 0)
        const paidAmount = Number(bill.paid_amount || 0)
        const remaining = Math.max(0, billAmount - paidAmount)
        return sum + remaining
      }, 0)

      const payrollList = Array.isArray(payrollData) ? payrollData : []
      const payrollDueTotal = payrollList.reduce((sum: number, row: any) => {
        const netDue = Number(row.net_due || 0)
        const paid = Number(row.amount_paid || 0)
        const remaining = Math.max(0, netDue - paid)
        return sum + remaining
      }, 0)

      const categoriesList = Array.isArray(categoriesData) ? categoriesData : []
      const overheadList = Array.isArray(overheadTxData) ? overheadTxData : []
      const currentMonthKey = monthKey(currentMonth) || ''
      const lastPaidByCategory = new Map<number, { date: string; amount: number }>()
      const paidThisMonth = new Set<number>()

      overheadList.forEach((tx: any) => {
        const categoryId = Number(tx.category_id || 0)
        if (!categoryId) return
        const txDate = tx.date
        const amount = Number(tx.amount || 0)
        if (txDate) {
          const txMonth = monthKey(txDate)
          if (txMonth === currentMonthKey) {
            paidThisMonth.add(categoryId)
          }
          const existing = lastPaidByCategory.get(categoryId)
          if (!existing || new Date(txDate).getTime() > new Date(existing.date).getTime()) {
            lastPaidByCategory.set(categoryId, { date: txDate, amount })
          }
        }
      })

      const overheadDueTotal = categoriesList.reduce((sum: number, category: any) => {
        const categoryId = Number(category.id || 0)
        if (!categoryId) return sum
        if (paidThisMonth.has(categoryId)) return sum
        const lastPaid = lastPaidByCategory.get(categoryId)
        if (!lastPaid) return sum
        return sum + Number(lastPaid.amount || 0)
      }, 0)

      setSnapshot({
        liquidCash: liquidCashTotal,
        clientOutstanding: clientOutstandingTotal,
        vendorPending: vendorPendingTotal,
        payrollDue: payrollDueTotal,
        overheadsDue: overheadDueTotal,
      })
      const mapToList = (bucketMap: Map<number, { lead_id: number; lead_number?: number | null; lead_name?: string | null; amount: number }>) =>
        Array.from(bucketMap.values()).sort((a, b) => b.amount - a.amount)

      setAgingBuckets({
        ...agingTotals,
        projects: {
          bucket0_30: mapToList(agingProjectMaps.bucket0_30),
          bucket31_60: mapToList(agingProjectMaps.bucket31_60),
          bucket61_90: mapToList(agingProjectMaps.bucket61_90),
          bucket90: mapToList(agingProjectMaps.bucket90),
        },
      })

      const forecastStart = new Date()
      forecastStart.setHours(0, 0, 0, 0)
      const forecast30End = addDays(forecastStart, 30)
      const forecast60End = addDays(forecastStart, 60)

      const forecastParams30 = new URLSearchParams({
        from_date: toYmd(forecastStart),
        to_date: toYmd(forecast30End),
      })
      const forecastParams60 = new URLSearchParams({
        from_date: toYmd(forecastStart),
        to_date: toYmd(forecast60End),
      })

      const [forecastIn30Res, forecastIn60Res] = await Promise.all([
        apiFetch(`/api/finance/expected-payments/range?${forecastParams30.toString()}`),
        apiFetch(`/api/finance/expected-payments/range?${forecastParams60.toString()}`),
      ])
      const forecastIn30Data = await forecastIn30Res.json().catch(() => null)
      const forecastIn60Data = await forecastIn60Res.json().catch(() => null)
      const expectedIn30 = forecastIn30Res.ok ? Number(forecastIn30Data?.total || 0) : 0
      const expectedIn60 = forecastIn60Res.ok ? Number(forecastIn60Data?.total || 0) : 0

      const billOut = (endDate: Date) =>
        billsList.reduce((sum: number, bill: any) => {
          if (String(bill.status || '').toLowerCase() !== 'approved') return sum
          if (!bill.bill_date) return sum
          const billDate = new Date(bill.bill_date)
          if (Number.isNaN(billDate.getTime())) return sum
          if (billDate < forecastStart || billDate > endDate) return sum
          const remaining = Math.max(0, Number(bill.bill_amount || 0) - Number(bill.paid_amount || 0))
          return sum + remaining
        }, 0)

      const monthSpan30 = buildMonthSpan(monthKey(toYmd(forecastStart)) || '', monthKey(toYmd(forecast30End)) || '')
      const monthSpan60 = buildMonthSpan(monthKey(toYmd(forecastStart)) || '', monthKey(toYmd(forecast60End)) || '')

      const overheadOut = (monthSpan: { ym: string; label: string }[]) => {
        return categoriesList.reduce((sum: number, category: any) => {
          const categoryId = Number(category.id || 0)
          if (!categoryId) return sum
          const lastPaid = lastPaidByCategory.get(categoryId)
          if (!lastPaid) return sum
          const skipCurrent = paidThisMonth.has(categoryId)
          const monthCount = monthSpan.filter((m) => !(skipCurrent && m.ym === currentMonthKey)).length
          if (monthCount <= 0) return sum
          return sum + Number(lastPaid.amount || 0) * monthCount
        }, 0)
      }

      const payrollOut = (endDate: Date) => {
        const totals = []
        const currentMonthDate = new Date(currentMonth)
        const nextMonthDate = new Date(nextMonth)
        if (currentMonthDate <= endDate) totals.push(payrollData)
        if (nextMonthDate <= endDate) totals.push(payrollNextData)
        return totals.reduce((sum: number, list: any) => {
          if (!Array.isArray(list)) return sum
          const monthTotal = list.reduce((inner: number, row: any) => {
            const netDue = Number(row.net_due || 0)
            const paid = Number(row.amount_paid || 0)
            return inner + Math.max(0, netDue - paid)
          }, 0)
          return sum + monthTotal
        }, 0)
      }

      const out30 = billOut(forecast30End) + overheadOut(monthSpan30) + payrollOut(forecast30End)
      const out60 = billOut(forecast60End) + overheadOut(monthSpan60) + payrollOut(forecast60End)

      setForecast({
        in30: expectedIn30,
        out30,
        net30: expectedIn30 - out30,
        in60: expectedIn60,
        out60,
        net60: expectedIn60 - out60,
      })
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  const cashflowChartRows = useMemo(() => {
    return cashflowDisplayRows
  }, [cashflowDisplayRows])

  const maxInOut = useMemo(() => {
    return cashflowChartRows.reduce((max, row) => {
      return Math.max(max, Number(row.total_in || 0), Number(row.total_out || 0))
    }, 1)
  }, [cashflowChartRows])

  const maxExpected = useMemo(() => {
    return expectedDisplayRows.reduce((max, row) => {
      return Math.max(max, Number(row.expected || 0), Number(row.received || 0))
    }, 1)
  }, [expectedDisplayRows])

  const fySummary = useMemo(() => {
    const expectedTotal = expectedDisplayRows.reduce((sum, row) => sum + Number(row.expected || 0), 0)
    const receivedTotal = expectedDisplayRows.reduce((sum, row) => sum + Number(row.received || 0), 0)
    const outstanding = Math.max(0, expectedTotal - receivedTotal)
    const efficiency = expectedTotal > 0 ? (receivedTotal / expectedTotal) * 100 : 0
    return { expectedTotal, receivedTotal, outstanding, efficiency }
  }, [expectedDisplayRows])

  const maxFyTrend = useMemo(() => {
    return fyTrendRows.reduce((max, row) => {
      return Math.max(max, Number(row.expected || 0), Number(row.received || 0))
    }, 1)
  }, [fyTrendRows])

  const maxBalance = useMemo(() => {
    return balanceTrend.reduce((max, row) => Math.max(max, Math.abs(Number(row.balance || 0))), 1)
  }, [balanceTrend])

  const rangeLabel = rangeSelection === 'last12' ? 'Last 12 Months' : rangeSelection
  const hideFyTooltip = () => setFyTooltip(null)
  const showFyTooltip = (event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>, row: FyTrendRow) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const tooltipWidth = 220
    const tooltipHeight = 56
    const viewportWidth = window.innerWidth || 0
    let left = rect.left + rect.width / 2 - tooltipWidth / 2
    let top = rect.top - tooltipHeight - 8
    if (top < 8) top = rect.bottom + 8
    const minLeft = 8
    const maxLeft = Math.max(minLeft, viewportWidth - tooltipWidth - 8)
    left = Math.min(Math.max(left, minLeft), maxLeft)
    setFyTooltip({
      left,
      top,
      expected: row.expected,
      received: row.received,
      label: row.label,
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">ADMIN</div>
        <h1 className="text-2xl md:text-3xl font-semibold mt-2">Finance Overview</h1>
        <p className="text-sm text-neutral-600 mt-1">Trends and financial movement across accounts.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className={cardClass}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-lg font-semibold">Filters</div>
            <div className="text-xs text-neutral-500">Scope analytics by financial year or last 12 months.</div>
          </div>
          <div className="flex flex-col gap-3 w-full md:w-auto md:flex-row md:items-center">
            <div className="w-full md:w-56">
              <div className="text-xs text-neutral-500 mb-1">Performance metrics</div>
              <select
                className={fieldClass}
                value={rangeSelection}
                onChange={e => setRangeSelection(e.target.value)}
              >
                <option value="last12">Last 12 Months</option>
                {fyOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="w-full md:w-56">
              <div className="text-xs text-neutral-500 mb-1">Cash views only</div>
              <select
                className={fieldClass}
                value={moneySourceId}
                onChange={e => setMoneySourceId(e.target.value)}
              >
                <option value="">All Accounts</option>
                {moneySources.map(source => (
                  <option key={source.id} value={source.id}>{source.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">Business Performance</div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className={`${cardClass} lg:col-span-2`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-lg font-semibold">FY Performance</div>
              <div className="text-xs text-neutral-500">Showing {rangeLabel}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="text-xs text-neutral-500">Expected Turnover (FY)</div>
              <div className="mt-2 text-xl font-semibold">{formatMoney(fySummary.expectedTotal)}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="text-xs text-neutral-500">Received (FY)</div>
              <div className="mt-2 text-xl font-semibold text-emerald-600">{formatMoney(fySummary.receivedTotal)}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="text-xs text-neutral-500">Outstanding (FY)</div>
              <div className="mt-2 text-xl font-semibold">{formatMoney(fySummary.outstanding)}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="text-xs text-neutral-500">Collection Efficiency %</div>
              <div className="mt-2 text-xl font-semibold">{Math.round(fySummary.efficiency)}%</div>
            </div>
          </div>
        </div>

        <div className={`${cardClass} lg:col-span-3`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-lg font-semibold">FY Turnover Trend</div>
              <div className="text-xs text-neutral-500">Expected vs Received per FY</div>
            </div>
          </div>
          <div className="mt-4 relative h-48 overflow-visible pb-8">
            <div className="pointer-events-none absolute top-0 bottom-8 left-0 w-12 flex flex-col justify-between text-[10px] text-neutral-400">
              {buildAxisTicks(maxFyTrend).map((value, idx) => (
                <div key={`${value}-${idx}`} className="text-right">{formatMoney(value)}</div>
              ))}
            </div>
            <div className="absolute top-0 bottom-8 left-14 right-0 pointer-events-none z-0">
              {buildAxisTicks(maxFyTrend).map((_, idx, arr) => {
                const top = arr.length > 1 ? (idx / (arr.length - 1)) * 100 : 0
                return (
                  <div
                    key={idx}
                    className="absolute left-0 right-0 h-px bg-neutral-200/70"
                    style={{ top: `${top}%` }}
                  />
                )
              })}
            </div>
            <div className="absolute top-0 bottom-8 left-14 right-0">
              <div className="absolute inset-0 overflow-hidden">
                <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    points={buildLinePoints(fyTrendRows, 'expected', maxFyTrend)}
                  />
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    points={buildLinePoints(fyTrendRows, 'received', maxFyTrend)}
                  />
                </svg>
              </div>
              <div className="absolute inset-0 pointer-events-none">
                {fyTrendRows.map((row, index) => {
                  const x = fyTrendRows.length === 1 ? 50 : (index / (fyTrendRows.length - 1)) * 100
                  const expectedY = 100 - (Number(row.expected || 0) / (maxFyTrend || 1)) * 100
                  const receivedY = 100 - (Number(row.received || 0) / (maxFyTrend || 1)) * 100
                  return (
                    <div key={`${row.label}-dots`} className="contents">
                      <div
                        className="absolute h-2 w-2 rounded-full bg-slate-400"
                        style={{ left: `calc(${x}% - 4px)`, top: `calc(${expectedY}% - 4px)` }}
                      />
                      <div
                        className="absolute h-2 w-2 rounded-full bg-emerald-500"
                        style={{ left: `calc(${x}% - 4px)`, top: `calc(${receivedY}% - 4px)` }}
                      />
                    </div>
                  )
                })}
              </div>
              {fyTrendRows.map((row, index) => {
                const x = fyTrendRows.length === 1 ? 50 : (index / (fyTrendRows.length - 1)) * 100
                return (
                  <button
                    key={row.label}
                    type="button"
                    className="absolute top-0 bottom-0 w-10 -translate-x-1/2"
                    style={{ left: `${x}%` }}
                    onMouseEnter={(event) => showFyTooltip(event, row)}
                    onMouseLeave={hideFyTooltip}
                    onFocus={(event) => showFyTooltip(event, row)}
                    onBlur={hideFyTooltip}
                    aria-label={`${row.label} expected ${formatMoney(row.expected)} received ${formatMoney(row.received)}`}
                  />
                )
              })}
              <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-[10px] text-neutral-500">
                {fyTrendRows.map(row => (
                  <div key={`${row.label}-label`}>{row.label}</div>
                ))}
              </div>
              {fyTrendRows.length === 0 && (
                <div className="text-sm text-neutral-500">No FY trend data.</div>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Expected
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Received
            </span>
          </div>
        </div>
      </section>

      {fyTooltip && (
        <div
          className="fixed z-50 rounded bg-neutral-900 px-3 py-2 text-[11px] text-white shadow-lg pointer-events-none"
          style={{ left: `${fyTooltip.left}px`, top: `${fyTooltip.top}px` }}
        >
          <div className="text-xs text-neutral-300">{fyTooltip.label}</div>
          <div>Expected: {formatMoney(fyTooltip.expected)}</div>
          <div>Received: {formatMoney(fyTooltip.received)}</div>
        </div>
      )}

      <section className={cardClass}>
        <div className="text-lg font-semibold">Expected vs Received (Payments)</div>
        <div className="mt-4 relative h-40 overflow-visible pb-4">
          <div className="pointer-events-none absolute top-0 bottom-6 left-0 w-12 flex flex-col justify-between text-[10px] text-neutral-400">
            {buildAxisTicks(maxExpected).map((value, idx) => (
              <div key={`${value}-${idx}`} className="text-right">{formatMoney(value)}</div>
            ))}
          </div>
          <div className="absolute top-0 bottom-6 left-0 right-0 ml-14 pointer-events-none z-0">
            {buildAxisTicks(maxExpected).map((_, idx, arr) => {
              if (idx === arr.length - 1) return null
              const top = arr.length > 1 ? (idx / (arr.length - 1)) * 100 : 0
              return (
                <div
                  key={idx}
                  className="absolute left-0 right-0 h-px bg-neutral-200/70"
                  style={{ top: `${top}%` }}
                />
              )
            })}
            <div className="absolute left-0 right-0 h-px bg-neutral-200/70 bottom-0" />
          </div>
          <div className="absolute top-0 bottom-6 left-0 right-0 ml-14 grid grid-cols-6 items-end gap-3 md:grid-cols-12 overflow-visible z-10">
            {expectedDisplayRows.map(row => {
              const expectedHeight = (Number(row.expected || 0) / maxExpected) * chartHeight
              const receivedHeight = (Number(row.received || 0) / maxExpected) * chartHeight
              return (
                <div key={row.month} className="flex flex-col items-center gap-2">
                  <div className="flex items-end justify-center gap-1 w-full">
                    <div className="relative group">
                      <div
                        className="w-2.5 md:w-3 rounded bg-slate-300"
                        title=""
                        style={{ height: `${expectedHeight}px` }}
                      />
                      <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-neutral-900 px-2 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100 z-30 whitespace-nowrap">
                        {formatMoney(row.expected)}
                      </div>
                    </div>
                    <div className="relative group">
                      <div
                        className="w-2.5 md:w-3 rounded bg-emerald-500"
                        title=""
                        style={{ height: `${receivedHeight}px` }}
                      />
                      <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-neutral-900 px-2 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100 z-30 whitespace-nowrap">
                        {formatMoney(row.received)}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-neutral-500">{row.month}</div>
                </div>
              )
            })}
            {expectedDisplayRows.length === 0 && <div className="text-sm text-neutral-500">No expected payment data.</div>}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 text-lg font-semibold">Project Profitability</div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-sm font-semibold text-neutral-700">Top Profitable Projects</div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-500">
                    <th className="pb-2">Project</th>
                    <th className="pb-2 text-right">Revenue</th>
                    <th className="pb-2 text-right">Cost</th>
                    <th className="pb-2 text-right">Profit</th>
                    <th className="pb-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {projectProfitability.top.length === 0 && (
                    <tr>
                      <td className="py-3 text-neutral-500" colSpan={5}>
                        No project data.
                      </td>
                    </tr>
                  )}
                  {projectProfitability.top.map((row) => {
                    const marginClass =
                      row.margin > 25 ? 'text-emerald-600' : row.margin >= 10 ? 'text-amber-600' : 'text-rose-600'
                    return (
                      <tr key={`top-${row.lead_id}`}>
                        <td className="py-2 text-neutral-700">
                          {row.lead_number ? `L#${row.lead_number} ` : ''}{row.lead_name || 'Lead'}
                        </td>
                        <td className="py-2 text-right text-neutral-700">{formatMoney(row.revenue)}</td>
                        <td className="py-2 text-right text-neutral-700">{formatMoney(row.cost)}</td>
                        <td className="py-2 text-right text-neutral-700">{formatMoney(row.profit)}</td>
                        <td className={`py-2 text-right font-semibold ${marginClass}`}>{Math.round(row.margin)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-sm font-semibold text-neutral-700">Lowest Profit Projects</div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-500">
                    <th className="pb-2">Project</th>
                    <th className="pb-2 text-right">Revenue</th>
                    <th className="pb-2 text-right">Cost</th>
                    <th className="pb-2 text-right">Profit</th>
                    <th className="pb-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {projectProfitability.bottom.length === 0 && (
                    <tr>
                      <td className="py-3 text-neutral-500" colSpan={5}>
                        No project data.
                      </td>
                    </tr>
                  )}
                  {projectProfitability.bottom.map((row) => {
                    const marginClass =
                      row.margin > 25 ? 'text-emerald-600' : row.margin >= 10 ? 'text-amber-600' : 'text-rose-600'
                    return (
                      <tr key={`bottom-${row.lead_id}`}>
                        <td className="py-2 text-neutral-700">
                          {row.lead_number ? `L#${row.lead_number} ` : ''}{row.lead_name || 'Lead'}
                        </td>
                        <td className="py-2 text-right text-neutral-700">{formatMoney(row.revenue)}</td>
                        <td className="py-2 text-right text-neutral-700">{formatMoney(row.cost)}</td>
                        <td className="py-2 text-right text-neutral-700">{formatMoney(row.profit)}</td>
                        <td className={`py-2 text-right font-semibold ${marginClass}`}>{Math.round(row.margin)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col justify-center">
            <div className="text-xs text-neutral-500">Average Project Margin (FY)</div>
            <div className="mt-2 text-3xl font-semibold">
              {Math.round(projectProfitability.avgMargin)}%
            </div>
            <div className="mt-1 text-xs text-neutral-500">Across all projects in selected FY</div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 text-lg font-semibold">Accounts Aging</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs text-neutral-500">0–30 Days</div>
            <div className="mt-2 text-xl font-semibold text-neutral-800">{formatMoney(agingBuckets.bucket0_30)}</div>
            {agingBuckets.projects.bucket0_30.length > 0 && (
              <div className="mt-3 space-y-1 text-xs text-neutral-600 max-h-28 overflow-y-auto pr-1">
                {agingBuckets.projects.bucket0_30.map((proj) => (
                  <div key={proj.lead_id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {proj.lead_number ? `L#${proj.lead_number} ` : ''}{proj.lead_name || 'Lead'}
                    </span>
                    <span className="text-neutral-500">{formatMoney(proj.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs text-neutral-500">31–60 Days</div>
            <div className="mt-2 text-xl font-semibold text-amber-600">{formatMoney(agingBuckets.bucket31_60)}</div>
            {agingBuckets.projects.bucket31_60.length > 0 && (
              <div className="mt-3 space-y-1 text-xs text-neutral-600 max-h-28 overflow-y-auto pr-1">
                {agingBuckets.projects.bucket31_60.map((proj) => (
                  <div key={proj.lead_id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {proj.lead_number ? `L#${proj.lead_number} ` : ''}{proj.lead_name || 'Lead'}
                    </span>
                    <span className="text-neutral-500">{formatMoney(proj.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs text-neutral-500">61–90 Days</div>
            <div className="mt-2 text-xl font-semibold text-orange-600">{formatMoney(agingBuckets.bucket61_90)}</div>
            {agingBuckets.projects.bucket61_90.length > 0 && (
              <div className="mt-3 space-y-1 text-xs text-neutral-600 max-h-28 overflow-y-auto pr-1">
                {agingBuckets.projects.bucket61_90.map((proj) => (
                  <div key={proj.lead_id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {proj.lead_number ? `L#${proj.lead_number} ` : ''}{proj.lead_name || 'Lead'}
                    </span>
                    <span className="text-neutral-500">{formatMoney(proj.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs text-neutral-500">90+ Days</div>
            <div className="mt-2 text-xl font-semibold text-rose-600">{formatMoney(agingBuckets.bucket90)}</div>
            {agingBuckets.projects.bucket90.length > 0 && (
              <div className="mt-3 space-y-1 text-xs text-neutral-600 max-h-28 overflow-y-auto pr-1">
                {agingBuckets.projects.bucket90.map((proj) => (
                  <div key={proj.lead_id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {proj.lead_number ? `L#${proj.lead_number} ` : ''}{proj.lead_name || 'Lead'}
                    </span>
                    <span className="text-neutral-500">{formatMoney(proj.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">Cash Position</div>

      <section>
        <div className="mb-3 text-lg font-semibold">Snapshot</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs text-neutral-500">Total Liquid Cash</div>
            <div className="mt-2 text-xl font-semibold">{formatMoney(snapshot.liquidCash)}</div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs text-neutral-500">Total Client Outstanding</div>
            <div className="mt-2 text-xl font-semibold">{formatMoney(snapshot.clientOutstanding)}</div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs text-neutral-500">Vendor Bills Pending</div>
            <div className="mt-2 text-xl font-semibold">{formatMoney(snapshot.vendorPending)}</div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs text-neutral-500">Payroll Due (Current Month)</div>
            <div className="mt-2 text-xl font-semibold">{formatMoney(snapshot.payrollDue)}</div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs text-neutral-500">Overheads Due (Current Month)</div>
            <div className="mt-2 text-xl font-semibold">{formatMoney(snapshot.overheadsDue)}</div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs text-neutral-500">Net Immediate Exposure</div>
            <div
              className={`mt-2 text-xl font-semibold ${
                snapshot.vendorPending + snapshot.payrollDue + snapshot.overheadsDue - snapshot.liquidCash >= 0
                  ? 'text-rose-600'
                  : 'text-emerald-600'
              }`}
            >
              {formatMoney(snapshot.vendorPending + snapshot.payrollDue + snapshot.overheadsDue - snapshot.liquidCash)}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 text-lg font-semibold">Cash Forecast</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs text-neutral-500">Next 30 Days</div>
            <div className="mt-3 grid gap-2 text-sm">
              <div className="flex items-center justify-between text-neutral-700">
                <span>Expected IN</span>
                <span className="font-semibold">{formatMoney(forecast.in30)}</span>
              </div>
              <div className="flex items-center justify-between text-neutral-700">
                <span>Expected OUT</span>
                <span className="font-semibold">{formatMoney(forecast.out30)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-600">Net Forecast</span>
                <span className={`font-semibold ${forecast.net30 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatMoney(forecast.net30)}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="text-xs text-neutral-500">Next 60 Days</div>
            <div className="mt-3 grid gap-2 text-sm">
              <div className="flex items-center justify-between text-neutral-700">
                <span>Expected IN</span>
                <span className="font-semibold">{formatMoney(forecast.in60)}</span>
              </div>
              <div className="flex items-center justify-between text-neutral-700">
                <span>Expected OUT</span>
                <span className="font-semibold">{formatMoney(forecast.out60)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-600">Net Forecast</span>
                <span className={`font-semibold ${forecast.net60 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatMoney(forecast.net60)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={cardClass}>
          <div className="text-lg font-semibold">Cash in Hand</div>
          <div className="mt-4 relative h-40 overflow-visible pb-4">
            <div className="pointer-events-none absolute top-0 bottom-6 left-0 w-12 flex flex-col justify-between text-[10px] text-neutral-400">
              {buildAxisTicks(maxBalance).map((value, idx) => (
                <div key={`${value}-${idx}`} className="text-right">{formatMoney(value)}</div>
              ))}
            </div>
            <div className="absolute top-0 bottom-6 left-0 right-0 ml-14 pointer-events-none z-0">
              {buildAxisTicks(maxBalance).map((_, idx, arr) => {
                if (idx === arr.length - 1) return null
                const top = arr.length > 1 ? (idx / (arr.length - 1)) * 100 : 0
                return (
                  <div
                    key={idx}
                    className="absolute left-0 right-0 h-px bg-neutral-200/70"
                    style={{ top: `${top}%` }}
                  />
                )
              })}
              <div className="absolute left-0 right-0 h-px bg-neutral-200/70 bottom-0" />
            </div>
            <div className="absolute top-0 bottom-6 left-0 right-0 ml-14 grid grid-cols-6 items-end gap-3 md:grid-cols-12 overflow-visible z-10">
            {balanceTrend.map(row => {
              const height = (Math.abs(Number(row.balance || 0)) / maxBalance) * chartHeight
              const color = Number(row.balance || 0) >= 0 ? 'bg-blue-500' : 'bg-rose-500'
              return (
                <div key={row.label} className="flex flex-col items-center gap-2">
                  <div className="relative group">
                    <div
                      className={`w-4 md:w-5 rounded ${color}`}
                      title=""
                      style={{ height: `${height}px` }}
                    />
                    <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-neutral-900 px-2 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100 z-30 whitespace-nowrap">
                      {formatMoney(row.balance)}
                    </div>
                  </div>
                  <div className="text-[10px] text-neutral-500">{row.label}</div>
                </div>
              )
            })}
            {balanceTrend.length === 0 && <div className="text-sm text-neutral-500">No balance data.</div>}
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <div className="text-lg font-semibold">Monthly Cash IN vs OUT</div>
          <div className="mt-4 relative h-40 overflow-visible pb-4">
            <div className="pointer-events-none absolute top-0 bottom-6 left-0 w-12 flex flex-col justify-between text-[10px] text-neutral-400">
              {buildAxisTicks(maxInOut).map((value, idx) => (
                <div key={`${value}-${idx}`} className="text-right">{formatMoney(value)}</div>
              ))}
            </div>
            <div className="absolute top-0 bottom-6 left-0 right-0 ml-14 pointer-events-none z-0">
              {buildAxisTicks(maxInOut).map((_, idx, arr) => {
                if (idx === arr.length - 1) return null
                const top = arr.length > 1 ? (idx / (arr.length - 1)) * 100 : 0
                return (
                  <div
                    key={idx}
                    className="absolute left-0 right-0 h-px bg-neutral-200/70"
                    style={{ top: `${top}%` }}
                  />
                )
              })}
              <div className="absolute left-0 right-0 h-px bg-neutral-200/70 bottom-0" />
            </div>
            <div className="absolute top-0 bottom-6 left-0 right-0 ml-14 grid grid-cols-6 items-end gap-3 md:grid-cols-12 overflow-visible z-10">
            {cashflowChartRows.map(row => {
              const inHeight = (Number(row.total_in || 0) / maxInOut) * chartHeight
              const outHeight = (Number(row.total_out || 0) / maxInOut) * chartHeight
              return (
                <div key={row.month} className="flex flex-col items-center gap-2">
                  <div className="flex items-end justify-center gap-1 w-full">
                    <div className="relative group">
                      <div
                        className="w-2.5 md:w-3 rounded bg-emerald-500"
                        title=""
                        style={{ height: `${inHeight}px` }}
                      />
                      <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-neutral-900 px-2 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100 z-30 whitespace-nowrap">
                        {formatMoney(row.total_in)}
                      </div>
                    </div>
                    <div className="relative group">
                      <div
                        className="w-2.5 md:w-3 rounded bg-rose-400"
                        title=""
                        style={{ height: `${outHeight}px` }}
                      />
                      <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-neutral-900 px-2 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100 z-30 whitespace-nowrap">
                        {formatMoney(row.total_out)}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-neutral-500">{row.month}</div>
                </div>
              )
            })}
            {cashflowChartRows.length === 0 && <div className="text-sm text-neutral-500">No cashflow data.</div>}
            </div>
          </div>
        </div>
      </section>

      <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">Cost Structure</div>

      <section>
        <div className="mb-3 text-lg font-semibold">Cost Structure Ratio</div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="text-xs text-neutral-500">Revenue</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(costStructure.revenue)}</div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {(() => {
              const revenue = costStructure.revenue
              const toPct = (value: number) => (revenue > 0 ? Math.round((value / revenue) * 100) : 0)
              const salariesPct = toPct(costStructure.salaries)
              const freelancersPct = toPct(costStructure.freelancers)
              const overheadsPct = toPct(costStructure.overheads)
              const profitPct = toPct(costStructure.profit)
              return (
                <>
                  <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                    <div className="text-xs text-neutral-500">Salaries</div>
                    <div className="mt-2 text-2xl font-semibold text-blue-600">{salariesPct}%</div>
                    <div className="text-sm text-neutral-600">{formatMoney(costStructure.salaries)}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                    <div className="text-xs text-neutral-500">Freelancers</div>
                    <div className="mt-2 text-2xl font-semibold text-purple-600">{freelancersPct}%</div>
                    <div className="text-sm text-neutral-600">{formatMoney(costStructure.freelancers)}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                    <div className="text-xs text-neutral-500">Overheads</div>
                    <div className="mt-2 text-2xl font-semibold text-orange-600">{overheadsPct}%</div>
                    <div className="text-sm text-neutral-600">{formatMoney(costStructure.overheads)}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                    <div className="text-xs text-neutral-500">Net Profit</div>
                    <div className="mt-2 text-2xl font-semibold text-emerald-600">{profitPct}%</div>
                    <div className="text-sm text-neutral-600">{formatMoney(costStructure.profit)}</div>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      </section>

      <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">Activity</div>

      <section className={cardClass}>
        <div className="text-lg font-semibold">Recent Transactions</div>
        <div className="mt-4">
          {loading && <div className="text-sm text-neutral-500">Loading transactions…</div>}
          {!loading && transactions.length === 0 && <div className="text-sm text-neutral-500">No transactions found.</div>}
          {!loading && transactions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-500">
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Account</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="text-sm">
                      <td className="py-2 text-neutral-600">{formatDateShort(tx.date)}</td>
                      <td className="py-2 text-neutral-700">{tx.money_source_name || 'Account'}</td>
                      <td className={`py-2 text-right font-semibold ${tx.direction === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatMoney(tx.amount)}{tx.direction === 'in' ? 'Cr' : 'Dr'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
