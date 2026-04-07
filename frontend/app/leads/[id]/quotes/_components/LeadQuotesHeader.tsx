'use client'

import Link from 'next/link'
import { formatLeadName } from '@/lib/leadNameFormat'

type LeadSummary = {
  id: number
  lead_number?: number | null
  name?: string | null
  bride_name?: string | null
  groom_name?: string | null
}

type LeadQuotesHeaderProps = {
  leadId: string
  lead: LeadSummary | null
  backHref: string
  backLabel: string
}

const tabs = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'contact', label: 'Contact' },
  { key: 'notes', label: 'Notes' },
  { key: 'activity', label: 'Activity' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'quotes', label: 'Quotes' },
] as const

export default function LeadQuotesHeader({ leadId, lead, backHref, backLabel }: LeadQuotesHeaderProps) {
  const formatted = lead ? formatLeadName(lead) : { leadName: 'Lead', suffix: '' }
  const leadLabel = lead?.lead_number ? `L#${lead.lead_number}` : lead?.id ? `Lead #${lead.id}` : 'Lead'

  const buildHref = (key: typeof tabs[number]['key']) => {
    if (key === 'quotes') return `/leads/${leadId}/quotes`
    return `/leads/${leadId}?tab=${key}`
  }

  return (
    <div className="sticky top-0 z-30 -mx-4 md:-mx-8 px-4 md:px-8 pt-6 pb-2 bg-[var(--background)] flex flex-col gap-2 shadow-[0_6px_12px_-8px_rgba(0,0,0,0.25)]">
      <Link
        href={backHref}
        className="btn-pill inline-flex w-fit rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800"
      >
        {backLabel}
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">
            {formatted.leadName || 'Lead'}
            {formatted.suffix ? (
              <span className="ml-2 text-xl md:text-2xl font-semibold text-neutral-700">
                ({formatted.suffix})
              </span>
            ) : null}
          </h1>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-xs font-medium text-neutral-500">{leadLabel}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map(tab => {
          const isActive = tab.key === 'quotes'
          return (
            <Link
              key={tab.key}
              href={buildHref(tab.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${isActive
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-700 border border-[var(--border)] hover:bg-[var(--surface-muted)]'
                }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
