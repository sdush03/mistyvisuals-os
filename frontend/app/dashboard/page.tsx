'use client'

import { useEffect, useMemo, useState } from 'react'

const STATUS_ORDER = [
  'New',
  'Contacted',
  'Quoted',
  'Follow Up',
  'Negotiation',
  'Awaiting Advance',
  'Converted',
  'Rejected',
  'Lost',
]

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [heatCounts, setHeatCounts] = useState<Record<string, number>>({})
  const [followupCounts, setFollowupCounts] = useState<{ today?: number; overdue?: number }>({})
  const [priorityCounts, setPriorityCounts] = useState<{ important?: number; potential?: number }>({})
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({})
  const [todayActivity, setTodayActivity] = useState<{ followups_completed?: number; moved_to_negotiation?: number }>({})

  useEffect(() => {
    fetch('http://localhost:3001/dashboard/metrics')
      .then(res => res.json())
      .then(data => {
        setStatusCounts(data?.status_counts || {})
        setHeatCounts(data?.heat_counts || {})
        setFollowupCounts(data?.followups || {})
        setPriorityCounts(data?.priority || {})
        setSourceCounts(data?.source_counts || {})
        setTodayActivity(data?.today_activity || {})
        setLoading(false)
      })
      .catch(() => {
        setError('Unable to load leads right now.')
        setLoading(false)
      })
  }, [])

  const heatSummary = useMemo(() => {
    return {
      Hot: heatCounts.Hot || 0,
      Warm: heatCounts.Warm || 0,
      Cold: heatCounts.Cold || 0,
    }
  }, [heatCounts])

  const followupSummary = useMemo(() => {
    return {
      today: followupCounts.today || 0,
      overdue: followupCounts.overdue || 0,
    }
  }, [followupCounts])

  const prioritySummary = useMemo(() => {
    return {
      important: priorityCounts.important || 0,
      potential: priorityCounts.potential || 0,
    }
  }, [priorityCounts])

  const activitySummary = useMemo(() => {
    return {
      followups_completed: todayActivity.followups_completed || 0,
      moved_to_negotiation: todayActivity.moved_to_negotiation || 0,
    }
  }, [todayActivity])

  const sourceSummary = useMemo(() => {
    return Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count }))
  }, [sourceCounts])

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">
            Sales
          </div>
          <h2 className="text-2xl md:text-3xl font-semibold mt-2">Dashboard</h2>
          <p className="text-sm text-neutral-600 mt-1">
            A quick snapshot of pipeline health.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="grid grid-cols-1 gap-6">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="text-sm text-neutral-600 mb-4">Leads by stage</div>
            {loading ? (
              <div className="grid grid-cols-1 gap-2 text-sm text-neutral-400">
                {STATUS_ORDER.map(status => (
                  <div key={status} className="flex items-center justify-between">
                    <span>{status}</span>
                    <span>—</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 text-sm">
                {STATUS_ORDER.map(status => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-neutral-700">{status}</span>
                    <span className="font-medium">{statusCounts[status] || 0}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="text-sm text-neutral-600 mb-4">Lead sources</div>
            {loading ? (
              <div className="grid grid-cols-1 gap-2 text-sm text-neutral-400">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span>—</span>
                    <span>—</span>
                  </div>
                ))}
              </div>
            ) : sourceSummary.length === 0 ? (
              <div className="text-sm text-neutral-500">No sources yet.</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 text-sm">
                {sourceSummary.map(item => (
                  <div key={item.source} className="flex items-center justify-between">
                    <span className="text-neutral-700">{item.source}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="text-sm text-neutral-600 mb-4">Heat overview</div>
            <div className="grid grid-cols-3 gap-3">
              {(['Hot', 'Warm', 'Cold'] as const).map(h => (
                <div key={h} className="rounded-xl border border-[var(--border)] bg-white p-4">
                  <div className="text-2xl font-semibold">{loading ? '—' : heatSummary[h]}</div>
                  <div className="text-xs text-neutral-500 mt-1">{h}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="text-sm text-neutral-600 mb-4">Follow-up signals</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <div className="text-2xl font-semibold">{loading ? '—' : followupSummary.today}</div>
                <div className="text-xs text-neutral-500 mt-1">Due today</div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <div className="text-2xl font-semibold">{loading ? '—' : followupSummary.overdue}</div>
                <div className="text-xs text-neutral-500 mt-1">Overdue</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="text-sm text-neutral-600 mb-4">Priority signals</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <div className="text-2xl font-semibold">{loading ? '—' : prioritySummary.important}</div>
                <div className="text-xs text-neutral-500 mt-1">Important</div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <div className="text-2xl font-semibold">{loading ? '—' : prioritySummary.potential}</div>
                <div className="text-xs text-neutral-500 mt-1">Potential</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="text-sm text-neutral-600 mb-4">Today’s activity</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <div className="text-2xl font-semibold">{loading ? '—' : activitySummary.followups_completed}</div>
                <div className="text-xs text-neutral-500 mt-1">Follow-ups completed</div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <div className="text-2xl font-semibold">{loading ? '—' : activitySummary.moved_to_negotiation}</div>
                <div className="text-xs text-neutral-500 mt-1">Moved to Negotiation</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
