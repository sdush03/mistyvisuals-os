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


const renderGroup = (title: string, groups: DuplicateGroup[]) => {
  if (!groups.length) return null
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{title}</div>
      <div className="space-y-2">
        {groups.map(group => {
          const matchesToShow = group.matches.slice(0, 3)
          const remaining = group.matches.length - matchesToShow.length
          return (
            <div key={`${title}-${group.value}`} className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm">
              <div className="text-[10px] text-neutral-400 font-mono">Matched: {group.value}</div>
              <div className="mt-2.5 divide-y divide-neutral-100">
                {matchesToShow.map(match => (
                  <div key={`${group.value}-${match.id}`} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0 pr-4">
                      <div className="font-semibold text-neutral-800 text-xs truncate">
                        {match.name || 'Unnamed Lead'}
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5 font-mono">
                        Status: <span className="font-medium text-neutral-600">{match.status}</span>
                        {match.primary_phone && ` · ${match.primary_phone}`}
                      </div>
                    </div>
                    <a
                      className="shrink-0 text-[10px] font-bold text-neutral-600 hover:text-neutral-900 border border-neutral-200 hover:bg-neutral-50 px-2.5 py-1 rounded-lg transition"
                      href={`/leads/${match.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View Lead →
                    </a>
                  </div>
                ))}
                {remaining > 0 && (
                  <div className="text-[10px] text-neutral-400 pt-2 font-mono">+{remaining} more leads match this contact info</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type Props = {
  open: boolean
  duplicates: DuplicateResults | null
  onContinue: () => void
  onOpenLeads?: (leadIds: number[]) => void
  onCancel?: () => void
  showContinue?: boolean
  continueLabel?: string
}

export default function DuplicateContactModal({
  open,
  duplicates,
  onContinue,
  onCancel,
  showContinue = true,
  continueLabel = 'Continue & Save',
}: Props) {
  if (!open || !duplicates) return null

  const { phones, emails, instagrams } = duplicates

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2 mb-2 text-amber-800 font-bold text-sm">
          <span>⚠️</span> Possible Duplicate Found
        </div>
        <div className="text-xs text-neutral-500 leading-relaxed mb-4">
          One or more contact details (phone, email, or Instagram) already exist in other leads. Please check them before proceeding.
        </div>

        <div className="max-h-[300px] overflow-y-auto space-y-4 pr-1 custom-scrollbar">
          {renderGroup('Phone Matches', phones)}
          {renderGroup('Email Matches', emails)}
          {renderGroup('Instagram Matches', instagrams)}
        </div>

        <div className="mt-6 flex justify-end gap-2.5 border-t border-neutral-100 pt-4">
          {showContinue ? (
            <>
              {onCancel && (
                <button
                  className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800 transition"
                  onClick={onCancel}
                >
                  Cancel
                </button>
              )}
              <button
                className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 transition"
                onClick={onContinue}
              >
                {continueLabel}
              </button>
            </>
          ) : (
            <button
              className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 transition"
              onClick={onContinue}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
