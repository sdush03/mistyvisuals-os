'use client'

export type DuplicateLeadMatch = {
  id: number
  name: string
  status: string
  primary_phone?: string | null
}

export type DuplicateGroup = {
  value: string
  matches: DuplicateLeadMatch[]
}

export type DuplicateResults = {
  phones: DuplicateGroup[]
  emails: DuplicateGroup[]
  instagrams: DuplicateGroup[]
}

type Props = {
  open: boolean
  duplicates: DuplicateResults | null
  onContinue: () => void
  onOpenLeads: (leadIds: number[]) => void
}

const renderGroup = (title: string, groups: DuplicateGroup[]) => {
  if (!groups.length) return null
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">{title}</div>
      <div className="space-y-2">
        {groups.map(group => {
          const matchesToShow = group.matches.slice(0, 3)
          const remaining = group.matches.length - matchesToShow.length
          return (
          <div key={`${title}-${group.value}`} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">
            <div className="text-xs text-neutral-500">Value: {group.value}</div>
            <div className="mt-2 space-y-2">
              {matchesToShow.map(match => (
                <div key={`${group.value}-${match.id}`} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <a
                      className="font-medium text-neutral-900 hover:underline hover:decoration-2 hover:decoration-neutral-500 underline-offset-2"
                      href={`/leads/${match.id}?tab=dashboard`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {match.name || 'Unnamed Lead'}
                    </a>
                    <div className="text-xs text-neutral-500">{match.status}</div>
                  </div>
                  <div className="text-xs text-neutral-600">
                    Primary contact: {match.primary_phone || '—'}
                  </div>
                </div>
              ))}
              {remaining > 0 && (
                <div className="text-xs text-neutral-500">+{remaining} more</div>
              )}
            </div>
          </div>
        )})}
      </div>
    </div>
  )
}

export default function DuplicateContactModal({
  open,
  duplicates,
  onContinue,
  onOpenLeads,
}: Props) {
  if (!open || !duplicates) return null

  const { phones, emails, instagrams } = duplicates
  const allMatches = [
    ...phones.flatMap(group => group.matches),
    ...emails.flatMap(group => group.matches),
    ...instagrams.flatMap(group => group.matches),
  ]
  const uniqueLeadIds = Array.from(new Set(allMatches.map(match => match.id)))
  const primaryLabel = uniqueLeadIds.length > 1 ? 'See Leads' : 'See Lead'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
        <div className="text-lg font-semibold">Possible Duplicate Found</div>
        <div className="mt-2 text-sm text-neutral-700">
          One or more contact details already exist in other leads.
        </div>

        <div className="mt-4 space-y-4">
          {renderGroup('Phone', phones)}
          {renderGroup('Email', emails)}
          {renderGroup('Instagram', instagrams)}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-neutral-700"
            onClick={() => onOpenLeads(uniqueLeadIds)}
            disabled={uniqueLeadIds.length === 0}
          >
            {primaryLabel}
          </button>
          <button
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
            onClick={onContinue}
          >
            Continue &amp; Save
          </button>
        </div>
      </div>
    </div>
  )
}
