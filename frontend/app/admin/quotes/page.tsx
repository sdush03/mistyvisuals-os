'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function QuotesIndexPage() {
  const router = useRouter()
  const [versionId, setVersionId] = useState('')

  return (
    <div className="px-6 py-8">
      <div className="max-w-3xl">
        <div className="text-xs uppercase tracking-[0.35em] text-neutral-500">Admin</div>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Quote Builder</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Open a quote version to edit the proposal draft and pricing.
        </p>

        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <label className="block text-xs font-semibold text-neutral-700">Quote Version ID</label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={versionId}
              onChange={(event) => setVersionId(event.target.value)}
              placeholder="e.g. 124"
              className="w-full flex-1 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-neutral-400"
            />
            <button
              type="button"
              onClick={() => {
                if (!versionId.trim()) return
                router.push(`/admin/quotes/${versionId.trim()}`)
              }}
              className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Open Builder
            </button>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Need a new quote version? Create it from the Lead → Quotes workflow, then open it here.
          </p>
        </div>
      </div>
    </div>
  )
}
