'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getAuth } from '@/lib/authClient'

const FUNNEL_STAGES = [
  { label: 'Discovery', statuses: ['New', 'Contacted'], color: 'bg-blue-500' },
  { label: 'Engagement', statuses: ['Quoted', 'Follow Up', 'Negotiation'], color: 'bg-violet-500' },
  { label: 'Closing', statuses: ['Awaiting Advance', 'Converted'], color: 'bg-emerald-500' },
  { label: 'Lost', statuses: ['Rejected', 'Lost'], color: 'bg-neutral-300' },
]

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
}

const formatMoneyCompact = (val: any) => {
  const num = Number(val || 0)
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`
  if (num >= 1000) return `₹${(num / 1000).toFixed(0)}k`
  return `₹${Math.round(num).toLocaleString('en-IN')}`
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

function renderActivityLabel(act: any) {
  const { activity_type, metadata } = act
  if (activity_type === 'status_change') return `moved to ${metadata?.to}`
  if (activity_type === 'followup_done') return 'completed follow-up'
  if (activity_type === 'proposal_sent') return 'sent proposal'
  if (activity_type === 'quote_created') return 'drafted quote'
  if (activity_type === 'lead_created') return 'opted in'
  return activity_type.replace(/_/g, ' ')
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [heatCounts, setHeatCounts] = useState<Record<string, number>>({})
  const [followupCounts, setFollowupCounts] = useState<{ today?: number; overdue?: number }>({})
  const [priorityCounts, setPriorityCounts] = useState<{ important?: number; potential?: number }>({})
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({})
  const [todayActivity, setTodayActivity] = useState<{ followups_completed?: number; moved_to_negotiation?: number }>({})
  const [proposalStats, setProposalStats] = useState<any>({})
  const [revenue, setRevenue] = useState<{ projected_revenue?: number; converted_revenue?: number }>({})
  const [recentActivities, setRecentActivities] = useState<any[]>([])
  const [dealSizes, setDealSizes] = useState<{ avg_deal_size?: number; avg_closed_deal_size?: number }>({})
  const [leadsVolume, setLeadsVolume] = useState<{ this_week?: number; last_week?: number; this_month?: number; last_month?: number }>({})
  const [staleLeads, setStaleLeads] = useState<any[]>([])
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([])
  
  const [userName, setUserName] = useState<string>('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    getAuth().then(data => {
      if (data?.user?.name) {
        setUserName(data.user.name.split(' ')[0])
      } else if (data?.user?.email) {
        const emailPrefix = data.user.email.split('@')[0]
        setUserName(emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1))
      } else {
        setUserName('there')
      }
    }).catch(() => { setUserName('there') })

    fetch('/api/dashboard/metrics', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setStatusCounts(data?.status_counts || {})
        setHeatCounts(data?.heat_counts || {})
        setFollowupCounts(data?.followups || {})
        setPriorityCounts(data?.priority || {})
        setSourceCounts(data?.source_counts || {})
        setTodayActivity(data?.today_activity || {})
        setProposalStats(data?.proposal_stats || {})
        setRevenue(data?.revenue || {})
        setRecentActivities(data?.recent_activities || [])
        setDealSizes(data?.deal_sizes || {})
        setLeadsVolume(data?.leads_volume || {})
        setStaleLeads(data?.stale_leads || [])
        setMonthlyTrend(data?.monthly_trend || [])
        setLoading(false)
      })
      .catch(() => {
        setError('Unable to load metrics right now.')
        setLoading(false)
      })
  }, [])

  const heatSummary = useMemo(() => ({
    Hot: heatCounts.Hot || 0,
    Warm: heatCounts.Warm || 0,
    Cold: heatCounts.Cold || 0,
  }), [heatCounts])

  const totalActiveHeat = heatSummary.Hot + heatSummary.Warm + heatSummary.Cold

  const totalLeads = useMemo(
    () => Object.values(statusCounts).reduce((sum, value) => sum + (Number(value) || 0), 0),
    [statusCounts]
  )

  const activeLeadsCount = useMemo(
    () => Object.entries(statusCounts)
          .filter(([s]) => !['Converted', 'Lost', 'Rejected'].includes(s))
          .reduce((sum, [_, count]) => sum + (Number(count) || 0), 0),
    [statusCounts]
  )

  const sourceSummary = useMemo(() => {
    return Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count }))
  }, [sourceCounts])

  const timeGreeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])

  // Monthly trend max for chart scaling
  const trendMax = useMemo(() => Math.max(...monthlyTrend.map((m: any) => m.revenue || 0), 1), [monthlyTrend])

  if (error) {
    return (
      <div className="max-w-6xl p-6">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 flex flex-col items-center justify-center text-rose-700">
          <div className="font-medium">{error}</div>
        </div>
      </div>
    )
  }

  // Trend helpers
  const weekTrend = (leadsVolume.this_week || 0) - (leadsVolume.last_week || 0)
  const monthTrend = (leadsVolume.this_month || 0) - (leadsVolume.last_month || 0)

  return (
    <div className={`max-w-[1400px] px-1 sm:px-3 md:px-6 py-2 md:py-8 space-y-4 md:space-y-6 transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      
      {/* Inspiring Grand Header */}
      <div className="relative bg-[var(--surface)] rounded-[1.5rem] md:rounded-[2rem] border border-[var(--border)] shadow-sm overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-indigo-50/10 via-sky-50/5 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-emerald-50/10 via-teal-50/5 to-transparent rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-end justify-between gap-6 md:gap-10 p-6 md:p-14 lg:p-16">
          <div className="max-w-3xl text-left flex-1 w-full">
            <h1 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-[var(--foreground)] mb-3 md:mb-6 drop-shadow-sm">
              {timeGreeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--foreground)] to-neutral-500">{userName || 'there'}</span>.
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-neutral-500 font-light leading-relaxed">
              Ready to capture some magic today? Your pipeline is active with <strong className="text-[var(--foreground)] font-semibold">{activeLeadsCount}</strong> opportunities. 
              {followupCounts.today ? (
                <> Let&apos;s clear those <span className="text-[var(--foreground)] font-medium bg-[var(--surface-strong)] px-1.5 py-0.5 rounded-md border border-[var(--border)] whitespace-nowrap">{followupCounts.today} follow-ups</span> and move deals forward.</>
              ) : (
                ' You have no pressing follow-ups due today.'
              )}
            </p>
          </div>
          
          <div className="flex flex-row items-stretch justify-start gap-3 w-full lg:w-auto mt-2 lg:mt-0">
            <div className="flex-1 flex flex-col bg-[var(--surface)]/80 backdrop-blur-md px-5 py-4 lg:px-8 lg:py-6 rounded-2xl border border-[var(--border)] shadow-sm hover:shadow-md transition-shadow">
              <span className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-neutral-400 font-bold mb-1.5 md:mb-2">Due Today</span>
              <div className="text-2xl md:text-4xl font-bold text-[var(--foreground)] flex flex-wrap items-center gap-1.5 md:gap-3">
                {loading ? '-' : followupCounts.today || 0}
                {followupCounts.today ? (
                  <Link href="/follow-ups" className="text-[10px] md:text-sm text-blue-600 hover:text-blue-400 font-bold bg-blue-500/10 hover:bg-blue-500/20 px-2.5 md:px-3 py-1 rounded-full transition w-max">Let&apos;s go →</Link>
                ) : null}
              </div>
            </div>
            
            <div className="flex-1 flex flex-col bg-[var(--surface)]/80 backdrop-blur-md px-4 py-3 lg:px-8 lg:py-6 rounded-xl md:rounded-2xl border border-[var(--border)] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
              {followupCounts.overdue ? <div className="absolute top-0 left-0 w-full h-1 bg-rose-500"></div> : null}
              <span className={`text-[9px] md:text-xs uppercase tracking-[0.2em] font-bold mb-1 md:mb-2 ${followupCounts.overdue ? 'text-rose-500' : 'text-neutral-400'}`}>Overdue</span>
              <div className={`text-2xl md:text-4xl font-bold ${followupCounts.overdue ? 'text-rose-600' : 'text-[var(--foreground)]'}`}>
                {loading ? '-' : followupCounts.overdue || 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row: Revenue + Deal Size ── */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-3 md:p-5 shadow-sm">
        <div className="grid grid-cols-4 divide-x divide-[var(--border)]">
          <div className="flex flex-col px-1.5 md:px-4 items-center justify-center text-center">
            <span className="text-[9px] md:text-xs text-neutral-500 mb-0.5 md:mb-2 truncate w-full">Closed Rev</span>
            <span className="text-xs sm:text-sm md:text-2xl font-bold text-[var(--foreground)] truncate w-full tracking-tight">
              {loading ? '-' : formatMoneyCompact(revenue.converted_revenue)}
            </span>
          </div>
          <div className="flex flex-col px-1.5 md:px-4 items-center justify-center text-center">
            <span className="text-[9px] md:text-xs text-neutral-500 mb-0.5 md:mb-2 truncate w-full">Pipeline</span>
            <span className="text-xs sm:text-sm md:text-2xl font-bold text-[var(--foreground)] truncate w-full tracking-tight">
              {loading ? '-' : formatMoneyCompact(revenue.projected_revenue)}
            </span>
          </div>
          <div className="flex flex-col px-1.5 md:px-4 items-center justify-center text-center">
            <span className="text-[9px] md:text-xs text-neutral-500 mb-0.5 md:mb-2 truncate w-full">Avg Deal</span>
            <span className="text-xs sm:text-sm md:text-2xl font-bold text-[var(--foreground)] truncate w-full tracking-tight">
              {loading ? '-' : formatMoneyCompact(dealSizes.avg_deal_size)}
            </span>
          </div>
          <div className="flex flex-col px-1.5 md:px-4 items-center justify-center text-center">
            <span className="text-[9px] md:text-xs text-neutral-500 mb-0.5 md:mb-2 truncate w-full">Avg Closed</span>
            <span className="text-xs sm:text-sm md:text-2xl font-bold text-[var(--foreground)] truncate w-full tracking-tight">
              {loading ? '-' : formatMoneyCompact(dealSizes.avg_closed_deal_size)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column */}
        <div className="col-span-1 lg:col-span-8 flex flex-col gap-8">

          {/* Pipeline Funnel */}
          <div className="bg-[var(--surface)] rounded-2xl md:rounded-[2rem] border border-[var(--border)] p-5 md:p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6 md:mb-8">
              <div>
                <h3 className="text-sm md:text-base font-semibold text-[var(--foreground)]">Pipeline Funnel</h3>
                <p className="text-[10px] md:text-xs text-neutral-500 mt-0.5 md:mt-1">Total leads categorized by conversion phase.</p>
              </div>
              <div className="text-right">
                <div className="text-xl md:text-2xl font-semibold tracking-tight text-[var(--foreground)]">{loading ? '-' : totalLeads}</div>
                <div className="text-[9px] md:text-[10px] uppercase tracking-widest font-medium text-neutral-400">Total</div>
              </div>
            </div>
            <div className="space-y-4 md:space-y-6">
              {FUNNEL_STAGES.map((stage) => {
                const stageTotal = stage.statuses.reduce((sum, s) => sum + (statusCounts[s] || 0), 0)
                const percentage = totalLeads ? Math.round((stageTotal / totalLeads) * 100) : 0
                return (
                  <div key={stage.label} className="group cursor-default">
                    <div className="flex items-end justify-between mb-1.5 md:mb-2">
                      <div className="flex items-center gap-2 md:gap-3">
                        <span className="text-xs md:text-sm font-medium text-[var(--foreground)]">{stage.label}</span>
                        <span className="text-[10px] md:text-sm text-neutral-400">{loading ? '-' : stageTotal}</span>
                      </div>
                      <div className="text-[10px] md:text-xs font-medium text-neutral-400">{loading ? '-' : `${percentage}%`}</div>
                    </div>
                    <div className="w-full h-1.5 md:h-2 bg-[var(--surface-strong)] rounded-full overflow-hidden">
                      <div className="flex h-full" style={{ width: `${percentage}%` }}>
                        {stage.statuses.map((status) => {
                          const count = statusCounts[status] || 0
                          const pct = stageTotal ? (count / stageTotal) * 100 : 0
                          if (pct === 0) return null
                          return (
                            <div 
                              key={status} 
                              style={{ width: `${pct}%` }} 
                              className={`h-full ${stage.color} opacity-80 hover:opacity-100 transition-opacity border-r border-white/20 last:border-0`}
                              title={`${status}: ${count}`}
                            />
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Leads Volume + Monthly Trend side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            {/* Leads This Week / Month */}
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 md:p-6 shadow-sm flex flex-col justify-between">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3 md:mb-5">Lead Intake</h3>
              <div className="grid grid-cols-2 gap-3 md:gap-4 flex-1 content-center">
                <div>
                  <div className="text-[10px] md:text-xs text-neutral-500 mb-1">This Week</div>
                  <div className="text-xl md:text-2xl font-semibold text-[var(--foreground)]">{loading ? '-' : leadsVolume.this_week || 0}</div>
                  {!loading && (
                    <div className={`text-[9px] md:text-xs font-medium mt-1 ${weekTrend > 0 ? 'text-emerald-600' : weekTrend < 0 ? 'text-rose-500' : 'text-neutral-400'}`}>
                      {weekTrend > 0 ? `↑ ${weekTrend}` : weekTrend < 0 ? `↓ ${Math.abs(weekTrend)}` : '—'} vs last
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] md:text-xs text-neutral-500 mb-1">This Month</div>
                  <div className="text-xl md:text-2xl font-semibold text-[var(--foreground)]">{loading ? '-' : leadsVolume.this_month || 0}</div>
                  {!loading && (
                    <div className={`text-[9px] md:text-xs font-medium mt-1 ${monthTrend > 0 ? 'text-emerald-600' : monthTrend < 0 ? 'text-rose-500' : 'text-neutral-400'}`}>
                      {monthTrend > 0 ? `↑ ${monthTrend}` : monthTrend < 0 ? `↓ ${Math.abs(monthTrend)}` : '—'} vs last
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Monthly Revenue Trend */}
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 md:p-6 shadow-sm flex flex-col justify-between">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3 md:mb-5">Monthly Revenue</h3>
              {loading ? (
                <div className="text-[10px] md:text-xs text-neutral-400 py-4 text-center">Loading...</div>
              ) : monthlyTrend.length === 0 ? (
                <div className="text-[10px] md:text-xs text-neutral-400 py-4 text-center">No conversions in the last 6 months.</div>
              ) : (
                <div className="flex items-end gap-1 md:gap-2 h-[60px] md:h-[80px]">
                  {monthlyTrend.map((m: any) => {
                    const pct = trendMax ? (m.revenue / trendMax) * 100 : 0
                    const monthKey = m.month?.split('-')[1]
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group cursor-default">
                        <div className="text-[10px] font-bold text-[var(--foreground)] opacity-0 group-hover:opacity-100 transition-opacity">
                          {formatMoneyCompact(m.revenue)}
                        </div>
                        <div
                          className="w-full bg-[var(--surface-strong)] hover:bg-neutral-500 transition-colors rounded-t"
                          style={{ height: `${Math.max(pct, 4)}%` }}
                          title={`${MONTH_LABELS[monthKey] || monthKey}: ${formatMoneyCompact(m.revenue)} (${m.deals} deals)`}
                        />
                        <div className="text-[9px] text-neutral-400 font-medium">{MONTH_LABELS[monthKey] || monthKey}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Proposal Performance */}
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 md:p-8 shadow-sm">
            <div className="flex items-start justify-between mb-4 md:mb-6">
              <div>
                <h3 className="text-sm md:text-base font-semibold text-[var(--foreground)] mb-0.5 md:mb-1">Proposal Performance</h3>
                <p className="text-[10px] md:text-xs text-neutral-500">Live metrics of sent quotes.</p>
              </div>
              <Link href="/proposalanalytics" className="text-[10px] md:text-xs font-medium text-blue-600 hover:text-blue-700 transition">
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-3 md:gap-y-6 md:gap-x-4">
              <div className="bg-[var(--surface-muted)] md:bg-transparent p-2.5 md:p-0 rounded-xl md:rounded-none border border-[var(--border)] md:border-none">
                <div className="text-[10px] md:text-xs text-neutral-500 mb-0.5 md:mb-1">Total Sent</div>
                <div className="text-lg md:text-2xl font-semibold text-[var(--foreground)]">{loading ? '-' : proposalStats.total_sent || 0}</div>
                <div className="text-[9px] md:text-[10px] text-neutral-400 mt-0.5 md:mt-1">{proposalStats.total_accepted || 0} Accepted</div>
              </div>
              <div className="bg-[var(--surface-muted)] md:bg-transparent p-2.5 md:p-0 rounded-xl md:rounded-none border border-[var(--border)] md:border-none">
                <div className="text-[10px] md:text-xs text-neutral-500 mb-0.5 md:mb-1">Sent Today</div>
                <div className="text-lg md:text-2xl font-semibold text-[var(--foreground)]">{loading ? '-' : proposalStats.sent_today || 0}</div>
              </div>
              <div className="bg-[var(--surface-muted)] md:bg-transparent p-2.5 md:p-0 rounded-xl md:rounded-none border border-[var(--border)] md:border-none">
                <div className="text-[10px] md:text-xs text-neutral-500 mb-0.5 md:mb-1">Unique Opened</div>
                <div className="text-lg md:text-2xl font-semibold text-[var(--foreground)]">{loading ? '-' : proposalStats.total_viewed || 0}</div>
                <div className="text-[9px] md:text-[10px] text-neutral-400 mt-0.5 md:mt-1">
                  {proposalStats.total_sent ? Math.round(((proposalStats.total_viewed || 0) / proposalStats.total_sent) * 100) : 0}% open rate
                </div>
              </div>
              <div className="bg-[var(--surface-muted)] md:bg-transparent p-2.5 md:p-0 rounded-xl md:rounded-none border border-[var(--border)] md:border-none">
                <div className="text-[10px] md:text-xs text-neutral-500 mb-0.5 md:mb-1">Active Today</div>
                <div className="text-lg md:text-2xl font-semibold text-[var(--foreground)]">{loading ? '-' : proposalStats.viewed_today || 0}</div>
                <div className="text-[9px] md:text-[10px] text-neutral-400 mt-0.5 md:mt-1">{proposalStats.views_logged_today || 0} sessions</div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div className="col-span-1 lg:col-span-4 flex flex-col gap-6">
          
          {/* Stale Leads Alert */}
          {!loading && staleLeads.length > 0 && (
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-sm font-semibold text-neutral-900">Stale Leads</h3>
              </div>
              <p className="text-xs text-neutral-500 mb-4">No activity in 7+ days.</p>
              <ul className="space-y-2">
                {staleLeads.map((lead: any) => (
                  <li key={lead.id}>
                    <Link href={`/leads/${lead.id}`} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-neutral-50 transition group">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-neutral-800 truncate group-hover:text-blue-600 transition">{lead.name}</div>
                        <div className="text-[10px] text-neutral-400 flex items-center gap-2 mt-0.5">
                          <span>{lead.status}</span>
                          {lead.last_activity && <span>· {timeAgo(lead.last_activity)}</span>}
                        </div>
                      </div>
                      {lead.deal_value && (
                        <span className="text-xs font-medium text-neutral-500 shrink-0 ml-3">{formatMoneyCompact(lead.deal_value)}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Priority Insights */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">Priority Tags</h3>
            <p className="text-xs text-neutral-500 mb-5">High impact opportunities.</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 transition border border-transparent hover:border-neutral-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-neutral-900">Important</div>
                    <div className="text-xs text-neutral-500">Flagged deals</div>
                  </div>
                </div>
                <div className="text-lg font-semibold text-neutral-900">{loading ? '-' : priorityCounts.important || 0}</div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 transition border border-transparent hover:border-neutral-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-neutral-900">High Potential</div>
                    <div className="text-xs text-neutral-500">Premium budgets</div>
                  </div>
                </div>
                <div className="text-lg font-semibold text-neutral-900">{loading ? '-' : priorityCounts.potential || 0}</div>
              </div>
            </div>
          </div>

          {/* Live Action Feed */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex-1 flex flex-col min-h-[280px]">
            <div className="p-6 border-b border-neutral-100">
              <h3 className="text-sm font-semibold text-neutral-900 mb-1">Recent Activity</h3>
              <p className="text-xs text-neutral-500">Live pulse of pipeline actions.</p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar max-h-[320px]">
              {loading ? (
                 <div className="text-center text-xs text-neutral-400 py-10">Loading feed...</div>
              ) : recentActivities.length === 0 ? (
                <div className="text-center text-xs text-neutral-400 py-10">No recent activity found.</div>
              ) : (
                <div className="relative">
                  <div className="absolute left-2.5 top-2 bottom-2 w-px bg-neutral-100"></div>
                  <ul className="space-y-4 py-2 relative">
                    {recentActivities.map((act) => (
                      <li key={act.id} className="flex gap-3 items-start group">
                        <div className="w-5 h-5 rounded-full bg-neutral-100 border-2 border-white shrink-0 mt-0.5 shadow-sm group-hover:bg-blue-100 transition"></div>
                        <div className="text-[13px] leading-tight pt-1">
                          <Link href={`/leads/${act.lead_id}`} className="font-semibold text-neutral-800 hover:text-blue-600 transition">
                            {act.lead_name}
                          </Link>
                          <span className="text-neutral-500 ml-1.5">{renderActivityLabel(act)}</span>
                          <div className="text-[10px] text-neutral-400 mt-0.5">{timeAgo(act.created_at)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 md:gap-6">
            {/* Pipeline Intent (Heat) */}
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 md:p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3 md:mb-4">Pipeline Intent</h3>
              <div className="space-y-3 md:space-y-4">
                {([
                  { key: 'Hot', color: 'bg-rose-500', desc: 'High intent' },
                  { key: 'Warm', color: 'bg-amber-500', desc: 'Engaged' },
                  { key: 'Cold', color: 'bg-blue-500', desc: 'Unresponsive' },
                ] as const).map((h) => {
                  const count = heatSummary[h.key]
                  const share = totalActiveHeat ? (count / totalActiveHeat) * 100 : 0
                  return (
                    <div key={h.key} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 md:gap-3">
                        <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${h.color}`}></div>
                        <div>
                          <div className="text-[11px] md:text-xs font-semibold text-[var(--foreground)]">{h.key}</div>
                          <div className="text-[9px] md:text-[10px] text-neutral-400 leading-tight">{h.desc}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs md:text-sm font-bold text-[var(--foreground)]">{loading ? '-' : count}</div>
                        <div className="text-[9px] md:text-[10px] font-medium text-neutral-400 leading-none">{loading ? '-' : `${Math.round(share)}%`}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Lead Sources */}
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-sm flex flex-col max-h-[300px]">
              <div className="p-4 md:p-6 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Lead Sources</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 md:p-2 custom-scrollbar">
                {loading ? (
                  <div className="text-center text-[10px] md:text-xs text-neutral-400 py-6 md:py-8">Loading...</div>
                ) : sourceSummary.length === 0 ? (
                  <div className="text-center text-[10px] md:text-xs text-neutral-400 py-6 md:py-8">No sources tracked yet.</div>
                ) : (
                  <ul className="space-y-0.5 md:space-y-1">
                    {sourceSummary.map((item, i) => (
                      <li key={item.source} className="flex items-center justify-between p-2 md:p-3 rounded-lg hover:bg-[var(--surface-muted)] transition">
                        <div className="flex items-center gap-2 md:gap-3 truncate pr-2">
                          <span className="text-[9px] md:text-[10px] font-medium text-neutral-400 shrink-0 w-2.5 md:w-3">{i + 1}.</span>
                          <span className="text-[11px] md:text-sm text-[var(--foreground)] truncate">{item.source}</span>
                        </div>
                        <span className="text-[11px] md:text-xs font-semibold text-[var(--foreground)]">{item.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
