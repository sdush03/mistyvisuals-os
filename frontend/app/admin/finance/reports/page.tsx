import Link from 'next/link'

const cardClass = 'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm'

const reportCards = [
  {
    title: 'Profit Dashboard',
    description: 'FY profitability rollups across projects.',
    href: '/admin/finance/reports/profit',
  },
  {
    title: 'Cashflow',
    description: 'Monthly cash in/out plus runway planning.',
    href: '/admin/finance/reports/cashflow',
  },
  {
    title: 'Summaries',
    description: 'Lead, vendor, and employee summaries for export.',
    href: '/admin/finance/reports/summaries',
  },
  {
    title: 'Project P&L',
    description: 'Open a lead-level P&L with Quick P&L search.',
    href: '/admin/finance/ledger',
  },
]

export default function FinanceReportsHub() {
  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Finance · Reports</div>
        <h2 className="text-2xl md:text-3xl font-semibold mt-2">Reports</h2>
        <p className="text-sm text-neutral-600 mt-1">Quick access to finance rollups and exports.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {reportCards.map(card => (
          <Link
            key={card.href}
            href={card.href}
            className={`${cardClass} transition hover:-translate-y-0.5 hover:shadow-md`}
          >
            <div className="text-lg font-semibold text-neutral-900">{card.title}</div>
            <div className="text-sm text-neutral-600 mt-2">{card.description}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
