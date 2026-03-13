'use client'

import { useEffect, useMemo, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import CurrencyInput, { formatIndian } from '@/components/CurrencyInput'
import LeadAsyncSearch from '@/components/LeadAsyncSearch'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type Vendor = {
  id: number
  name: string
  vendor_type: 'freelancer' | 'service' | 'employee'
  is_active?: boolean
}

type MoneySource = {
  id: number
  name: string
}

type VendorBill = {
  id: number
  bill_category: string
  bill_amount: number | string
  paid_amount?: number | string
  status: string
  vendor_id?: number | null
  lead_id?: number | null
  vendor_name?: string | null
  lead_name?: string | null
  lead_number?: number | null
}

const fieldClass = 'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none focus:border-neutral-400'

const parseAmount = (value: string) => {
  if (!value) return null
  const cleaned = value.replace(/,/g, '').trim()
  if (!cleaned) return null
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  return num
}

const formatMoney = (value: number | string) => {
  const rounded = Math.round(Number(value || 0))
  return `₹${formatIndian(rounded)}`
}

const formatDateShort = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const getBillRemaining = (bill: VendorBill) => {
  const total = Number(bill.bill_amount || 0)
  const paid = Number(bill.paid_amount || 0)
  return Math.max(total - paid, 0)
}

export default function ProjectExpensePage() {
  const [leadId, setLeadId] = useState('')
  const [leadName, setLeadName] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [moneySources, setMoneySources] = useState<MoneySource[]>([])

  const [vendorBills, setVendorBills] = useState<VendorBill[]>([])
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([])
  const [pendingBillId, setPendingBillId] = useState<string | null>(null)
  const [loadingBills, setLoadingBills] = useState(false)

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [amountTouched, setAmountTouched] = useState(false)
  const [moneySourceId, setMoneySourceId] = useState('')
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [billCategory, setBillCategory] = useState('misc')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showOverpayConfirm, setShowOverpayConfirm] = useState(false)
  const [overpayChoice, setOverpayChoice] = useState<'other_bill' | 'credit'>('other_bill')
  const [carryAmount, setCarryAmount] = useState<number | null>(null)

  const [recentExpenses, setRecentExpenses] = useState<any[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [vendorsRes, sourcesRes] = await Promise.all([
          apiFetch('/api/finance/vendors'),
          apiFetch('/api/finance/money-sources'),
        ])
        const vendorsData = await vendorsRes.json().catch(() => [])
        const sourcesData = await sourcesRes.json().catch(() => [])
        const filteredVendors = Array.isArray(vendorsData)
          ? vendorsData.filter((v: Vendor) => v.vendor_type !== 'employee')
          : []
        setVendors(filteredVendors)
        setMoneySources(Array.isArray(sourcesData) ? sourcesData : [])
      } catch {
        setVendors([])
        setMoneySources([])
      }
    }
    void loadLookups()
  }, [])

  useEffect(() => {
    if (!leadId && !vendorId) {
      setVendorBills([])
      setSelectedBillIds([])
      return
    }
    const loadBills = async () => {
      setLoadingBills(true)
      try {
        const params = new URLSearchParams()
        if (leadId) params.set('lead_id', leadId)
        else if (vendorId) params.set('vendor_id', vendorId)
        const res = await apiFetch(`/api/finance/vendor-bills?${params.toString()}`)
        const data = await res.json().catch(() => [])
        const list = Array.isArray(data) ? data : []
        setVendorBills(list)
        setSelectedBillIds((prev) => {
          if (pendingBillId) return [pendingBillId]
          const existing = prev.filter(id => list.some(bill => String(bill.id) === id))
          return existing
        })
        setPendingBillId(null)
      } catch {
        setVendorBills([])
        setSelectedBillIds([])
      } finally {
        setLoadingBills(false)
      }
    }
    void loadBills()
  }, [leadId, vendorId, pendingBillId])

  useEffect(() => {
    if (!leadId && !vendorId) {
      setRecentExpenses([])
      return
    }
    const loadRecent = async () => {
      setLoadingRecent(true)
      try {
        const params = new URLSearchParams()
        params.set('direction', 'out')
        params.set('limit', '5')
        if (leadId) params.set('lead_id', leadId)
        else if (vendorId) params.set('vendor_id', vendorId)
        const res = await apiFetch(`/api/finance/transactions?${params.toString()}`)
        const data = await res.json().catch(() => [])
        setRecentExpenses(Array.isArray(data) ? data : [])
      } catch {
        setRecentExpenses([])
      } finally {
        setLoadingRecent(false)
      }
    }
    void loadRecent()
  }, [leadId, vendorId])

  const handleSelectBill = (bill: VendorBill) => {
    const billId = String(bill.id)
    const billVendor = bill.vendor_id ? String(bill.vendor_id) : ''
    const billLead = bill.lead_id ? String(bill.lead_id) : ''

    setSelectedBillIds((prev) => {
      if (billVendor && vendorId && billVendor !== vendorId) {
        return [billId]
      }
      if (prev.includes(billId)) return prev.filter((id) => id !== billId)
      return [...prev, billId]
    })

    if (billVendor && billVendor !== vendorId) {
      setVendorId(billVendor)
      setPendingBillId(billId)
    }

    if (billLead && leadId && billLead !== leadId) {
      setLeadId('')
      setLeadName('')
      setPendingBillId(billId)
    } else if (billLead && !leadId) {
      setLeadId(billLead)
      setLeadName(bill.lead_name || '')
    }
  }

  const unpaidBills = useMemo(() => {
    return vendorBills.filter(bill => {
      const total = Number(bill.bill_amount || 0)
      const paid = Number(bill.paid_amount || 0)
      return total - paid > 0 && bill.status !== 'paid'
    })
  }, [vendorBills])

  const selectedBills = useMemo(() => {
    if (!selectedBillIds.length) return []
    const set = new Set(selectedBillIds)
    return unpaidBills.filter(bill => set.has(String(bill.id)))
  }, [unpaidBills, selectedBillIds])

  const primaryBill = selectedBills[0] || null

  const billSummary = useMemo(() => {
    if (!selectedBills.length) return null
    const total = selectedBills.reduce((sum, bill) => sum + Number(bill.bill_amount || 0), 0)
    const paid = selectedBills.reduce((sum, bill) => sum + Number(bill.paid_amount || 0), 0)
    const remaining = selectedBills.reduce((sum, bill) => {
      const billTotal = Number(bill.bill_amount || 0)
      const billPaid = Number(bill.paid_amount || 0)
      return sum + Math.max(billTotal - billPaid, 0)
    }, 0)
    return { total, paid, remaining }
  }, [selectedBills])

  const allocation = useMemo(() => {
    const amountNum = parseAmount(amount) || 0
    let remaining = amountNum
    const map: Record<string, number> = {}
    selectedBills.forEach((bill, index) => {
      const outstanding = getBillRemaining(bill)
      const applyNow = Math.min(outstanding, remaining)
      map[String(bill.id)] = applyNow
      remaining -= applyNow
    })
    if (remaining > 0 && overpayChoice === 'credit' && selectedBills.length) {
      const last = selectedBills[selectedBills.length - 1]
      map[String(last.id)] = (map[String(last.id)] || 0) + remaining
      remaining = 0
    }
    return { map, leftover: remaining }
  }, [selectedBills, amount, overpayChoice])

  useEffect(() => {
    if (!selectedBills.length || !billSummary) return
    if (carryAmount !== null) return
    if (!amountTouched || !amount) {
      setAmount(String(billSummary.remaining))
    }
  }, [selectedBills, billSummary, amountTouched, amount, carryAmount])

  const needsLead = !leadId && (selectedBills.length === 0 || selectedBills.some(bill => !bill.lead_id))
  const hasRejectedBill = selectedBills.some(bill => bill.status === 'rejected')
  const needsCategory = selectedBills.length === 0 && !billCategory
  const disableSubmit = needsLead || !vendorId || !moneySourceId || !parseAmount(amount)
    || (selectedBills.length > 0 && billSummary && billSummary.remaining <= 0)
    || hasRejectedBill
    || needsCategory

  const buildFinalNote = () => {
    const tags: string[] = []
    if (paymentMethod) tags.push(`Method: ${paymentMethod}`)
    const amountNum = parseAmount(amount)
    if (selectedBills.length && billSummary && amountNum && amountNum > billSummary.remaining) {
      if (overpayChoice === 'other_bill') tags.push('Overpay: Other bill')
      if (overpayChoice === 'credit') tags.push('Overpay: Unapplied credit')
    }
    const remark = note.trim()
    const meta = tags.length ? `[${tags.join('] [')}]` : ''
    return [remark, meta].filter(Boolean).join(' ')
  }

  const submitExpense = async (forceOverpay = false) => {
    setError('')
    setSuccess('')
    const amountNum = parseAmount(amount)
    if (!amountNum) {
      setError('Amount is required.')
      return
    }
    if (selectedBills.length > 0) {
      if (billSummary?.remaining !== undefined && billSummary.remaining <= 0) {
        setError('Bill already fully paid')
        return
      }
      if (billSummary && amountNum > billSummary.remaining && !forceOverpay) {
        setShowOverpayConfirm(true)
        return
      }
    } else if (!leadId) {
      setError('Project is required.')
      return
    }

    setSaving(true)
    try {
      if (selectedBills.length > 0) {
        for (const bill of selectedBills) {
          const applyNow = allocation.map[String(bill.id)] || 0
          if (applyNow <= 0) continue
          const billLeadId = bill.lead_id ? Number(bill.lead_id) : Number(leadId)
          if (!billLeadId) throw new Error('Project is required for selected bill')
          const res = await apiFetch('/api/finance/transactions/project-expense', {
            method: 'POST',
            body: JSON.stringify({
              lead_id: billLeadId,
              vendor_id: Number(vendorId),
              vendor_bill_id: Number(bill.id),
              amount: applyNow,
              date,
              money_source_id: Number(moneySourceId),
              note: buildFinalNote() || null,
              bill_category: bill.bill_category,
            }),
          })
          if (!res.ok) {
            const msg = await res.json().catch(() => ({}))
            throw new Error(msg?.error || 'Failed to record expense')
          }
        }
      } else {
        const res = await apiFetch('/api/finance/transactions/project-expense', {
          method: 'POST',
          body: JSON.stringify({
            lead_id: Number(leadId),
            vendor_id: Number(vendorId),
            vendor_bill_id: null,
            amount: amountNum,
            date,
            money_source_id: Number(moneySourceId),
            note: buildFinalNote() || null,
            bill_category: billCategory,
          }),
        })
        if (!res.ok) {
          const msg = await res.json().catch(() => ({}))
          throw new Error(msg?.error || 'Failed to record expense')
        }
      }

      const remaining = selectedBills.length > 0 ? allocation.leftover : 0
      if (remaining > 0 && overpayChoice === 'other_bill') {
        setCarryAmount(remaining)
        setAmount(String(remaining))
        const nextBill = unpaidBills.find(bill => !selectedBillIds.includes(String(bill.id)))
        if (nextBill) {
          setPendingBillId(String(nextBill.id))
          setSelectedBillIds([String(nextBill.id)])
          if (nextBill.lead_id) {
            setLeadId(String(nextBill.lead_id))
            setLeadName(nextBill.lead_name || '')
          }
          if (nextBill.vendor_id && String(nextBill.vendor_id) !== vendorId) {
            setVendorId(String(nextBill.vendor_id))
          }
          setSuccess('Expense recorded. Remaining amount moved to the next unpaid bill.')
        } else {
          setSelectedBillIds([])
          setLeadId('')
          setLeadName('')
          setPendingBillId(null)
          setSuccess('Expense recorded. Select another bill for the same vendor to apply the remaining amount.')
        }
      } else {
        setCarryAmount(null)
        setAmount('')
        setSuccess('Expense recorded.')
        setSelectedBillIds([])
      }
      setAmountTouched(false)
      setNote('')
      setPaymentMethod('')
      setBillCategory('misc')
      setOverpayChoice('other_bill')
      if (leadId || vendorId) {
        const params = new URLSearchParams()
        if (leadId) params.set('lead_id', leadId)
        if (vendorId) params.set('vendor_id', vendorId)
        const refresh = await apiFetch(`/api/finance/vendor-bills?${params.toString()}`)
        const data = await refresh.json().catch(() => [])
        setVendorBills(Array.isArray(data) ? data : [])
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to record expense')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Project Expense</h1>
        <p className="mt-1 text-sm text-neutral-500">Record money paid for a project</p>
      </div>

      <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Project</label>
          <LeadAsyncSearch
            value={leadId}
            onChange={(id, name) => {
              setLeadId(id)
              setLeadName(name || '')
              setPendingBillId(null)
              setCarryAmount(null)
              setSuccess('')
              setError('')
            }}
            selectedLabel={leadName}
            placeholder="Search by name, phone, or ID..."
          />
          {leadId && !leadName && primaryBill?.lead_name && (
            <div className="text-xs text-neutral-500">Auto-selected: L#{primaryBill.lead_number || ''} {primaryBill.lead_name}</div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700">Vendor</label>
          <select
            className={fieldClass}
            value={vendorId}
            onChange={(e) => {
              setVendorId(e.target.value)
              setPendingBillId(null)
              setCarryAmount(null)
            }}
          >
            <option value="">Select vendor</option>
            {vendors.map(vendor => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-neutral-700">Bill (optional)</label>
            <a href="/admin/finance/bills" className="text-xs font-medium text-neutral-500 hover:text-neutral-900">
              + Add Bill
            </a>
          </div>
          {loadingBills ? (
            <div className="text-sm text-neutral-500">Loading bills…</div>
          ) : unpaidBills.length === 0 ? (
            <div className="text-sm text-neutral-500">No bill found. You can still record a project expense.</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">Select</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Remaining</th>
                    <th className="px-3 py-2 text-right">Will Apply</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {unpaidBills.map(bill => {
                    const total = Number(bill.bill_amount || 0)
                    const paid = Number(bill.paid_amount || 0)
                    const remaining = Math.max(total - paid, 0)
                    const applyNow = allocation.map[String(bill.id)] || 0
                    return (
                      <tr key={bill.id} className="text-neutral-700">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            name="vendor-bill"
                            value={bill.id}
                            checked={selectedBillIds.includes(String(bill.id))}
                            onChange={() => handleSelectBill(bill)}
                          />
                        </td>
                        <td className="px-3 py-2 capitalize">
                          {bill.bill_category}
                          {(bill.vendor_name || bill.lead_name) && (
                            <div className="text-[10px] text-neutral-500 mt-0.5">
                              {bill.vendor_name ? bill.vendor_name : ''}{bill.vendor_name && bill.lead_name ? ' · ' : ''}{bill.lead_name ? `L#${bill.lead_number || ''} ${bill.lead_name}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{formatMoney(total)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(paid)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(remaining)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-600">{formatMoney(applyNow)}</td>
                        <td className="px-3 py-2 capitalize">{bill.status}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="border-t border-neutral-200 px-3 py-2 text-xs text-neutral-500">
                Select one or more bills to update immediately. Need a new bill? Create one in Finance → Bills.
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">Date</label>
            <input type="date" className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">Amount</label>
            <CurrencyInput
              value={amount}
              onChange={(val) => {
                setAmount(val)
                setAmountTouched(!!val)
              }}
              className={fieldClass}
              placeholder="0"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-neutral-700">Money Source</label>
            <select className={fieldClass} value={moneySourceId} onChange={(e) => setMoneySourceId(e.target.value)}>
              <option value="">Select account</option>
              {moneySources.map(source => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-neutral-700">Payment Method (optional)</label>
            <select className={fieldClass} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="">Select method</option>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cash">Cash</option>
              <option value="Cheque">Cheque</option>
              <option value="Card">Card</option>
              <option value="Other">Other</option>
            </select>
          </div>
          {selectedBills.length === 0 && (
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-neutral-700">Expense Category *</label>
              <select className={fieldClass} value={billCategory} onChange={(e) => setBillCategory(e.target.value)}>
                <option value="editing">Editing</option>
                <option value="shooting">Shooting</option>
                <option value="travel">Travel</option>
                <option value="food">Food</option>
                <option value="printing">Printing</option>
                <option value="misc">Misc</option>
              </select>
              <div className="text-xs text-neutral-500">A paid bill will be created automatically.</div>
            </div>
          )}
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-neutral-700">Remarks (optional)</label>
            <textarea className={`${fieldClass} min-h-[90px]`} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {selectedBills.length > 0 && billSummary && (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            <div className="font-medium text-neutral-700">Selected Bills Summary</div>
            <div className="mt-3 space-y-2">
              {selectedBills.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between text-xs text-neutral-600">
                  <div className="text-neutral-700">
                    {bill.vendor_name ? `${bill.vendor_name} · ` : ''}{bill.lead_name ? `L#${bill.lead_number || ''} ${bill.lead_name}` : 'Project'}
                  </div>
                  <div>{formatMoney(getBillRemaining(bill))} remaining</div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div>
                <div className="text-xs uppercase text-neutral-500">Bill Amount</div>
                <div className="font-semibold text-neutral-900">{formatMoney(billSummary.total)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-neutral-500">Paid so far</div>
                <div className="font-semibold text-neutral-900">{formatMoney(billSummary.paid)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-neutral-500">Remaining</div>
                <div className="font-semibold text-neutral-900">{formatMoney(billSummary.remaining)}</div>
              </div>
            </div>
          </div>
        )}

        <div className="text-sm text-neutral-500">This expense will be recorded against the project.</div>
        {selectedBills.length === 0 && (
          <div className="text-sm text-neutral-500">A paid bill will be created automatically.</div>
        )}
        {selectedBills.length > 0 && <div className="text-sm text-neutral-500">The selected bills will be updated immediately.</div>}
        {selectedBills.some(bill => bill.status !== 'approved') && (
          <div className="text-sm text-amber-600">This bill is not approved yet. Please verify before paying.</div>
        )}
        {carryAmount !== null && (
          <div className="text-sm text-amber-600">Remaining {formatMoney(carryAmount)} ready for another bill.</div>
        )}

        {(leadId || vendorId) && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-sm font-medium text-neutral-700">Recent Expenses</div>
            {loadingRecent ? (
              <div className="mt-2 text-sm text-neutral-500">Loading recent expenses…</div>
            ) : recentExpenses.length === 0 ? (
              <div className="mt-2 text-sm text-neutral-500">No recent expenses found.</div>
            ) : (
              <div className="mt-3 space-y-2 text-sm text-neutral-600">
                {recentExpenses.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between">
                    <div>
                      <div className="text-neutral-700">{formatMoney(tx.amount)}</div>
                      <div className="text-xs text-neutral-500">{tx.note || 'Expense'}</div>
                    </div>
                    <div className="text-xs text-neutral-500">{formatDateShort(tx.date)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div className="text-sm text-rose-600">{error}</div>}
        {success && <div className="text-sm text-emerald-600">{success}</div>}

        <button
          type="button"
          className="btn-pill bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          disabled={disableSubmit || saving}
          onClick={() => submitExpense(false)}
        >
          {saving ? 'Recording…' : 'Record Expense'}
        </button>
      </div>

      <ConfirmDialog
        isOpen={showOverpayConfirm}
        title="Amount exceeds remaining"
        message={
          <div>
            <div className="text-sm text-neutral-600">
              The amount exceeds the remaining balance for the selected bills. Choose how to handle the excess.
            </div>
            <div className="mt-3 space-y-2 text-sm text-neutral-700">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="overpay"
                  value="other_bill"
                  checked={overpayChoice === 'other_bill'}
                  onChange={() => setOverpayChoice('other_bill')}
                />
                Apply remaining to another bill
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="overpay"
                  value="credit"
                  checked={overpayChoice === 'credit'}
                  onChange={() => setOverpayChoice('credit')}
                />
                Record full amount on selected bills
              </label>
            </div>
          </div>
        }
        confirmText="Record Expense"
        onConfirm={() => submitExpense(true)}
        onClose={() => setShowOverpayConfirm(false)}
      />
    </div>
  )
}
