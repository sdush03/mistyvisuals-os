'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

const tabs = [
  { label: 'Dashboard', href: '/admin/finance' },
  { label: 'Invoices', href: '/admin/finance/invoices' },
  { label: 'Bills', href: '/admin/finance/bills' },
  { label: 'Ledger', href: '/admin/finance/ledger' },
  { label: 'Reports', href: '/admin/finance/reports' },
  { label: 'Accounts', href: '/admin/finance/accounts' },
]

const quickEntryItems = [
  { label: 'Receive Client Payment', href: '/admin/finance/transactions/receive' },
  { label: 'Pay Vendor / Project Expense', href: '/admin/finance/transactions/project-expense' },
  { label: 'Record Overhead', href: '/admin/finance/transactions/overheads' },
  { label: 'Payroll Payout', href: '/admin/finance/payroll' },
  { label: 'Transfer Between Accounts', href: '/admin/finance/transactions/transfer' },
]

const buttonPrimary = 'btn-pill bg-neutral-900 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-neutral-800'
const buttonOutline = 'rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-muted)]'

const titleCase = (value: string) =>
  value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())

const buildBreadcrumbs = (pathname: string) => {
  const base = '/admin/finance'
  const crumbs: { label: string; href?: string }[] = [{ label: 'Finance', href: base }]
  if (!pathname.startsWith(base)) return crumbs
  const rest = pathname.slice(base.length).replace(/^\/+/, '')
  if (!rest) {
    crumbs.push({ label: 'Dashboard' })
    return crumbs
  }

  const segments = rest.split('/').filter(Boolean)
  const [section, sub, third] = segments

  const sectionMap: Record<string, { label: string; href?: string }> = {
    invoices: { label: 'Invoices', href: '/admin/finance/invoices' },
    bills: { label: 'Bills', href: '/admin/finance/bills' },
    ledger: { label: 'Ledger', href: '/admin/finance/ledger' },
    reports: { label: 'Reports', href: '/admin/finance/reports' },
    accounts: { label: 'Accounts', href: '/admin/finance/accounts' },
    transactions: { label: 'Record', href: '/admin/finance/transactions/receive' },
    payroll: { label: 'Payroll', href: '/admin/finance/payroll' },
    balances: { label: 'Balances', href: '/admin/finance/balances' },
    vendors: { label: 'Vendors', href: '/admin/finance/accounts#vendors' },
    categories: { label: 'Categories', href: '/admin/finance/accounts#categories' },
    'money-sources': { label: 'Money Sources', href: '/admin/finance/accounts#money-sources' },
    projects: { label: 'Projects' },
  }

  if (section === 'vendors' && sub === 'bills') {
    crumbs.push({ label: 'Bills', href: '/admin/finance/bills' })
    if (third) {
      const label = Number.isFinite(Number(third)) ? `Bill #${third}` : titleCase(third)
      crumbs.push({ label })
    }
    return crumbs
  }

  if (section === 'ledger-audit') {
    crumbs.push({ label: 'Accounts', href: '/admin/finance/accounts' })
    crumbs.push({ label: 'Ledger Audit' })
    return crumbs
  }

  const sectionInfo = sectionMap[section] || { label: titleCase(section) }
  crumbs.push(sectionInfo)

  if (!sub) return crumbs

  if (section === 'invoices') {
    if (sub === 'new') {
      crumbs.push({ label: 'New Invoice' })
      return crumbs
    }
    if (Number.isFinite(Number(sub))) {
      crumbs.push({ label: `Invoice #${sub}` })
      return crumbs
    }
  }

  if (section === 'bills') {
    if (Number.isFinite(Number(sub))) {
      crumbs.push({ label: `Bill #${sub}` })
      return crumbs
    }
  }

  if (section === 'reports') {
    if (sub === 'profit') crumbs.push({ label: 'Profit' })
    else if (sub === 'cashflow') crumbs.push({ label: 'Cashflow' })
    else if (sub === 'summaries') crumbs.push({ label: 'Summaries' })
    else if (sub) crumbs.push({ label: titleCase(sub) })
    return crumbs
  }

  if (section === 'transactions') {
    const map: Record<string, string> = {
      receive: 'Receive Money',
      'project-expense': 'Project Expense',
      overheads: 'Overheads',
      transfer: 'Transfer',
    }
    crumbs.push({ label: map[sub] || titleCase(sub) })
    return crumbs
  }

  if (section === 'projects' && third) {
    if (third === 'pnl') {
      crumbs.push({ label: `P&L #${sub}` })
      return crumbs
    }
    if (third === 'contribution-units') {
      crumbs.push({ label: `Contribution Units #${sub}` })
      return crumbs
    }
  }

  if (sub) crumbs.push({ label: titleCase(sub) })
  return crumbs
}

export default function FinanceHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const crumbs = useMemo(() => buildBreadcrumbs(pathname || ''), [pathname])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Admin · Finance</div>
          <h1 className="text-2xl md:text-3xl font-semibold mt-2">Finance</h1>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            className={buttonPrimary}
            type="button"
            onClick={() => setOpen((prev) => !prev)}
          >
            + Record
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-lg py-2 z-40">
              {quickEntryItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <div key={`${crumb.label}-${index}`} className="flex items-center gap-2">
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="hover:text-[var(--foreground)]">
                  {crumb.label}
                </Link>
              ) : (
                <span className={isLast ? 'text-neutral-800' : ''}>{crumb.label}</span>
              )}
              {!isLast && <span className="text-neutral-400">›</span>}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {tabs.map((tab) => {
          const isActive =
            tab.href === '/admin/finance'
              ? pathname === '/admin/finance'
              : tab.href === '/admin/finance/ledger'
                ? pathname?.startsWith('/admin/finance/ledger') || pathname?.startsWith('/admin/finance/transactions')
                : pathname?.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={isActive ? buttonPrimary : buttonOutline}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
