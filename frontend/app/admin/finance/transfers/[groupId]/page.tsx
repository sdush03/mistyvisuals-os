'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { formatIndian } from '@/components/CurrencyInput'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'
const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)]'
const fieldClass = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })

type TransferLeg = {
  id: number
  date: string
  amount: number | string
  direction: 'in' | 'out'
  note?: string | null
  created_at?: string
  money_source_id?: number
  money_source_name?: string | null
}

type TransferDetail = {
  transfer_group_id: string
  date: string
  amount: number | string
  note?: string | null
  from_account?: string | null
  to_account?: string | null
  created_by?: { user_id?: number | null; user_name?: string | null; created_at?: string | null } | null
  legs: TransferLeg[]
}

const formatDateShort = (value?: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
}

export default function TransferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const groupId = String(params?.groupId || '')

  const [detail, setDetail] = useState<TransferDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!groupId) return
    void loadDetail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  const loadDetail = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/api/finance/transfers/${groupId}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to load transfer')
      setDetail(data)
    } catch (err: any) {
      setError(err?.message || 'Failed to load transfer')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    const reason = deleteReason.trim()
    if (!reason) {
      setDeleteError('Delete reason is required')
      return
    }
    setSaving(true)
    setDeleteError('')
    try {
      const res = await apiFetch(`/api/finance/transfers/${groupId}`, {
        method: 'DELETE',
        body: JSON.stringify({ delete_reason: reason })
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setDeleteError(data?.error || 'Unable to delete transfer')
        return
      }
      router.push('/admin/finance/ledger')
    } catch (err: any) {
      setDeleteError(err?.message || 'Unable to delete transfer')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-neutral-500">Loading transfer…</div>
  }

  if (error || !detail) {
    return (
      <div className="p-8 text-sm text-rose-600">
        {error || 'Transfer not found'}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin · Finance</div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Transfer Detail</h1>
            <p className="text-sm text-neutral-600 mt-1">Group {detail.transfer_group_id}</p>
          </div>
          <div className="flex gap-2">
            <Link className={buttonOutline} href="/admin/finance/ledger">Back to Ledger</Link>
            <button className={buttonPrimary} onClick={() => setShowDelete(true)}>Delete Transfer</button>
          </div>
        </div>
      </div>

      <section className={cardClass}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-neutral-500">Date</div>
            <div className="font-medium">{formatDateShort(detail.date)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">From → To</div>
            <div className="font-medium">{detail.from_account || '—'} → {detail.to_account || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Amount</div>
            <div className="font-medium">₹{formatIndian(detail.amount || 0)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Created By</div>
            <div className="font-medium">{detail.created_by?.user_name || '—'}</div>
          </div>
          <div className="md:col-span-4">
            <div className="text-xs text-neutral-500">Note</div>
            <div className="text-[var(--foreground)]">{detail.note || '—'}</div>
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <div className="text-lg font-semibold">Transfer Legs</div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              <tr className="text-left">
                <th className="pb-3">Direction</th>
                <th className="pb-3">Account</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {detail.legs.map(leg => (
                <tr key={leg.id}>
                  <td className="py-3">
                    <span className={leg.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'}>
                      {leg.direction === 'in' ? 'IN' : 'OUT'}
                    </span>
                  </td>
                  <td className="py-3">{leg.money_source_name || '—'}</td>
                  <td className="py-3">₹{formatIndian(leg.amount || 0)}</td>
                  <td className="py-3 text-neutral-600">{leg.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Delete Transfer</h3>
            <p className="mt-1 text-sm text-neutral-600">This will delete both sides of the transfer.</p>
            <div className="mt-4">
              <div className="text-xs text-neutral-500 mb-1">Reason (required)</div>
              <textarea
                className={`${fieldClass} min-h-[90px]`}
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                placeholder="Why are you deleting this transfer?"
              />
            </div>
            {deleteError && <div className="mt-2 text-sm text-rose-600">{deleteError}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button className={buttonOutline} onClick={() => setShowDelete(false)}>
                Cancel
              </button>
              <button className={buttonPrimary} onClick={handleDelete} disabled={saving}>
                {saving ? 'Deleting…' : 'Delete Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
