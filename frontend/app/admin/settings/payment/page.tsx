'use client'

import { useEffect, useState } from 'react'

const apiFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { credentials: 'include', ...init })

async function calculateHash(dataUrl: string) {
  const match = dataUrl.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/)
  if (!match) return ''
  const base64Data = match[2]
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function PaymentSettingsPage() {
  const [bankName, setBankName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifscCode, setIfscCode] = useState('')
  const [upiId, setUpiId] = useState('')
  const [qrCodeUrl, setQrCodeUrl] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingQr, setUploadingQr] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [backup, setBackup] = useState<any>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/admin/settings/payment')
      if (!res.ok) throw new Error('Failed to load payment settings')
      const data = await res.json()
      setBankName(data.bankName || '')
      setAccountName(data.accountName || '')
      setAccountNumber(data.accountNumber || '')
      setIfscCode(data.ifscCode || '')
      setUpiId(data.upiId || '')
      setQrCodeUrl(data.qrCodeUrl || '')
      setBackup(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      const payload = {
        bankName,
        accountName,
        accountNumber,
        ifscCode,
        upiId,
        qrCodeUrl
      }
      const res = await apiFetch('/api/admin/settings/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to save settings')
      setBackup(payload)
      setIsEditing(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleQrFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingQr(true)
    setError('')
    try {
      const reader = new FileReader()
      const dataUrlPromise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
      })
      reader.readAsDataURL(file)
      const dataUrl = await dataUrlPromise
      const hash = await calculateHash(dataUrl)

      const res = await apiFetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl,
          filename: file.name,
          tags: ['qr_code', 'payment'],
          contentHash: hash
        })
      })

      const data = await res.json()
      if (res.status === 409 && data.fileUrl) {
        setQrCodeUrl(data.fileUrl)
      } else if (!res.ok) {
        throw new Error(data.error || 'Failed to upload QR Code')
      } else {
        setQrCodeUrl(data.url || data.file_url || data.fileUrl || '')
      }
    } catch (err: any) {
      setError(err.message || 'Error uploading file')
    } finally {
      setUploadingQr(false)
    }
  }

  const handleCancel = () => {
    if (backup) {
      setBankName(backup.bankName || '')
      setAccountName(backup.accountName || '')
      setAccountNumber(backup.accountNumber || '')
      setIfscCode(backup.ifscCode || '')
      setUpiId(backup.upiId || '')
      setQrCodeUrl(backup.qrCodeUrl || '')
    }
    setIsEditing(false)
    setError('')
  }

  if (loading) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="text-sm text-neutral-500">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Payment Settings</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Configure the bank account and UPI details shown to clients for bank transfer payments.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6 bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
        {error && <div className="p-3 bg-red-50 border border-red-200 text-rose-600 rounded-xl text-sm font-medium">{error}</div>}
        {success && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium">Settings saved successfully!</div>}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Account Holder Name</label>
            <input
              type="text"
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
              disabled={!isEditing}
              className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-900 transition disabled:bg-neutral-50 disabled:text-neutral-500"
              placeholder="e.g. Misty Visuals Private Limited"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Bank Name</label>
            <input
              type="text"
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              disabled={!isEditing}
              className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-900 transition disabled:bg-neutral-50 disabled:text-neutral-500"
              placeholder="e.g. HDFC Bank"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">IFSC Code</label>
            <input
              type="text"
              value={ifscCode}
              onChange={e => setIfscCode(e.target.value.toUpperCase())}
              disabled={!isEditing}
              className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-900 transition font-mono uppercase disabled:bg-neutral-50 disabled:text-neutral-500"
              placeholder="e.g. HDFC0001234"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Account Number</label>
            <input
              type="text"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value.replace(/\s/g, ''))}
              disabled={!isEditing}
              className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-900 transition font-mono disabled:bg-neutral-50 disabled:text-neutral-500"
              placeholder="e.g. 50100234567890"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">UPI ID (Optional)</label>
            <input
              type="text"
              value={upiId}
              onChange={e => setUpiId(e.target.value)}
              disabled={!isEditing}
              className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-900 transition font-mono disabled:bg-neutral-50 disabled:text-neutral-500"
              placeholder="e.g. mistyvisuals@hdfc"
            />
          </div>

          <div className="flex flex-col gap-2.5 md:col-span-2 pt-2 border-t border-neutral-100">
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">UPI QR Code (Optional)</label>
            {qrCodeUrl ? (
              <div className="flex items-start gap-4 p-4 rounded-xl border border-neutral-150 bg-neutral-50/50 w-fit">
                <img src={qrCodeUrl} alt="UPI QR Code" className="w-32 h-32 object-contain bg-white rounded-lg p-1.5 border border-neutral-200 shadow-sm" />
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => setQrCodeUrl('')}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition uppercase tracking-wider mt-1"
                  >
                    Remove QR Code
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleQrFileChange}
                  disabled={!isEditing || uploadingQr}
                  className="text-xs text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-neutral-100 file:text-neutral-700 hover:file:bg-neutral-200 file:transition cursor-pointer disabled:opacity-50"
                />
                {uploadingQr && <span className="text-xs text-neutral-400 animate-pulse">Uploading QR code...</span>}
              </div>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-neutral-100 flex justify-end gap-3">
          {!isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-xl border border-neutral-200 hover:bg-neutral-50 px-6 py-2.5 text-sm font-semibold text-neutral-800 transition"
            >
              Edit Details
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-xl border border-neutral-200 hover:bg-neutral-50 px-6 py-2.5 text-sm font-semibold text-neutral-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}
