'use client'

import { useEffect, useState } from 'react'

interface LineItem {
  description: string
  amount: number
  quantity: number
}

interface ScheduleStep {
  label: string
  percentage: number | null
  amount: number
  dueDate: string | null
  stepOrder: number
  status: string
}

interface PaymentReceived {
  amount: number
  paidAt: string | null
  method: string | null
}

interface ProformaData {
  coupleName: string
  totalAmount: number
  advanceAmount: number
  balanceAmount: number
  advancePaid: boolean
  status: string
  createdAt: string
  firstEvent: { event_date: string; event_type: string } | null
  lineItems: LineItem[]
  paymentSchedule: ScheduleStep[]
  paymentsReceived: PaymentReceived[]
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'paid': return '#16a34a'
    case 'overdue': return '#dc2626'
    case 'pending': return '#d97706'
    default: return '#6b7280'
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case 'paid': return '#f0fdf4'
    case 'overdue': return '#fef2f2'
    case 'pending': return '#fffbeb'
    default: return '#f9fafb'
  }
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (status === 'paid') return false
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

export default function ProformaClient({ token }: { token: string }) {
  const [data, setData] = useState<ProformaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/proforma/${token}`)
      .then(r => {
        if (!r.ok) throw new Error('Not found')
        return r.json()
      })
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('Payment schedule not found.'); setLoading(false) })
  }, [token])

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Loading payment schedule...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>{error || 'Something went wrong'}</p>
      </div>
    )
  }

  const totalPaid = data.paymentsReceived.reduce((sum, p) => sum + p.amount, 0)
  const totalDue = data.totalAmount - totalPaid
  const progressPercent = data.totalAmount > 0 ? Math.min((totalPaid / data.totalAmount) * 100, 100) : 0

  // Compute effective status for each step
  const schedule = data.paymentSchedule.map(step => ({
    ...step,
    effectiveStatus: isOverdue(step.dueDate, step.status) ? 'overdue' : step.status,
  }))

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logoSection}>
            <div style={styles.logoMark}>MV</div>
            <div>
              <h1 style={styles.companyName}>Misty Visuals</h1>
              <p style={styles.subtitle}>Payment Schedule</p>
            </div>
          </div>
          {data.firstEvent && (
            <div style={styles.eventBadge}>
              <span style={styles.eventLabel}>{data.firstEvent.event_type || 'Event'}</span>
              <span style={styles.eventDate}>{formatDate(data.firstEvent.event_date)}</span>
            </div>
          )}
        </div>
      </header>

      {/* Client Info */}
      <section style={styles.clientSection}>
        <p style={styles.preparedFor}>Prepared for</p>
        <h2 style={styles.coupleName}>{data.coupleName}</h2>
        <p style={styles.issuedDate}>Issued on {formatDate(data.createdAt)}</p>
      </section>

      {/* Summary Card */}
      <section style={styles.summaryCard}>
        <div style={styles.summaryGrid}>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Total Package</span>
            <span style={styles.summaryValue}>{formatCurrency(data.totalAmount)}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Received</span>
            <span style={{ ...styles.summaryValue, color: '#16a34a' }}>{formatCurrency(totalPaid)}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Outstanding</span>
            <span style={{ ...styles.summaryValue, color: totalDue > 0 ? '#d97706' : '#16a34a' }}>
              {formatCurrency(Math.max(totalDue, 0))}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={styles.progressOuter}>
          <div style={{ ...styles.progressInner, width: `${progressPercent}%` }} />
        </div>
        <p style={styles.progressLabel}>
          {Math.round(progressPercent)}% collected
        </p>
      </section>

      {/* Payment Schedule */}
      <section style={styles.scheduleSection}>
        <h3 style={styles.sectionTitle}>Payment Schedule</h3>
        <div style={styles.timeline}>
          {schedule.map((step, i) => (
            <div key={i} style={styles.timelineItem}>
              <div style={styles.timelineDot}>
                <div style={{
                  ...styles.dot,
                  backgroundColor: getStatusColor(step.effectiveStatus),
                  boxShadow: step.effectiveStatus === 'paid'
                    ? '0 0 0 4px rgba(22, 163, 74, 0.15)'
                    : step.effectiveStatus === 'overdue'
                    ? '0 0 0 4px rgba(220, 38, 38, 0.15)'
                    : '0 0 0 4px rgba(217, 119, 6, 0.15)',
                }}>
                  {step.effectiveStatus === 'paid' && (
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8.5L6.5 12L13 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                {i < schedule.length - 1 && (
                  <div style={{
                    ...styles.timelineLine,
                    backgroundColor: step.effectiveStatus === 'paid' ? '#16a34a' : '#e5e7eb',
                  }} />
                )}
              </div>
              <div style={{
                ...styles.timelineContent,
                backgroundColor: getStatusBg(step.effectiveStatus),
                borderLeft: `3px solid ${getStatusColor(step.effectiveStatus)}`,
              }}>
                <div style={styles.stepHeader}>
                  <span style={styles.stepLabel}>{step.label}</span>
                  <span style={{
                    ...styles.statusBadge,
                    color: getStatusColor(step.effectiveStatus),
                    backgroundColor: step.effectiveStatus === 'paid' ? '#dcfce7'
                      : step.effectiveStatus === 'overdue' ? '#fee2e2' : '#fef3c7',
                  }}>
                    {step.effectiveStatus === 'paid' ? '✓ Received'
                      : step.effectiveStatus === 'overdue' ? 'Overdue' : 'Upcoming'}
                  </span>
                </div>
                <div style={styles.stepDetails}>
                  <span style={styles.stepAmount}>{formatCurrency(step.amount)}</span>
                  {step.percentage && (
                    <span style={styles.stepPct}>({step.percentage}%)</span>
                  )}
                </div>
                {step.dueDate && step.effectiveStatus !== 'paid' && (
                  <p style={{
                    ...styles.stepDue,
                    color: step.effectiveStatus === 'overdue' ? '#dc2626' : '#6b7280',
                  }}>
                    Due by {formatDate(step.dueDate)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Package Breakdown */}
      {data.lineItems.length > 0 && (
        <section style={styles.breakdownSection}>
          <h3 style={styles.sectionTitle}>Package Breakdown</h3>
          <div style={styles.breakdownTable}>
            {data.lineItems.map((item, i) => (
              <div key={i} style={{
                ...styles.breakdownRow,
                borderBottom: i < data.lineItems.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                <div>
                  <span style={styles.itemName}>{item.description}</span>
                  {item.quantity > 1 && (
                    <span style={styles.itemQty}> × {item.quantity}</span>
                  )}
                </div>
                <span style={{
                  ...styles.itemAmount,
                  color: item.amount < 0 ? '#16a34a' : '#111827',
                }}>
                  {item.amount < 0 ? `- ${formatCurrency(Math.abs(item.amount))}` : formatCurrency(item.amount * item.quantity)}
                </span>
              </div>
            ))}
            <div style={styles.breakdownTotal}>
              <span style={styles.totalLabel}>Total</span>
              <span style={styles.totalValue}>{formatCurrency(data.totalAmount)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer style={styles.footer}>
        <p style={styles.footerNote}>
          This is a proforma invoice for reference purposes only.
          A formal tax invoice will be issued upon each payment.
        </p>
        <p style={styles.footerBrand}>Misty Visuals • Premium Wedding Photography</p>
      </footer>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#fafafa',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: '#111827',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    gap: '16px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e5e7eb',
    borderTopColor: '#111827',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: '#6b7280',
    fontSize: '14px',
  },
  errorContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '16px',
  },
  header: {
    background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
    padding: '24px 20px',
  },
  headerInner: {
    maxWidth: '600px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoMark: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #f5f4f0 0%, #e5e3db 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 700,
    color: '#111827',
    letterSpacing: '1px',
  },
  companyName: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#ffffff',
    margin: 0,
    letterSpacing: '0.5px',
  },
  subtitle: {
    fontSize: '12px',
    color: '#9ca3af',
    margin: 0,
    marginTop: '2px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
  },
  eventBadge: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
  },
  eventLabel: {
    fontSize: '11px',
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  eventDate: {
    fontSize: '14px',
    color: '#ffffff',
    fontWeight: 500,
  },
  clientSection: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '32px 20px 0',
    textAlign: 'center' as const,
  },
  preparedFor: {
    fontSize: '12px',
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
    margin: 0,
  },
  coupleName: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#111827',
    margin: '8px 0 4px',
    letterSpacing: '-0.5px',
  },
  issuedDate: {
    fontSize: '13px',
    color: '#6b7280',
    margin: 0,
  },
  summaryCard: {
    maxWidth: '600px',
    margin: '24px auto 0',
    padding: '0 20px',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '12px',
    marginBottom: '16px',
  },
  summaryItem: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '16px 12px',
    textAlign: 'center' as const,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    border: '1px solid #f3f4f6',
  },
  summaryLabel: {
    display: 'block',
    fontSize: '11px',
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
  },
  summaryValue: {
    display: 'block',
    fontSize: '18px',
    fontWeight: 700,
    color: '#111827',
  },
  progressOuter: {
    height: '6px',
    backgroundColor: '#e5e7eb',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressInner: {
    height: '100%',
    background: 'linear-gradient(90deg, #16a34a, #22c55e)',
    borderRadius: '3px',
    transition: 'width 0.8s ease',
  },
  progressLabel: {
    fontSize: '12px',
    color: '#6b7280',
    textAlign: 'center' as const,
    marginTop: '8px',
  },
  scheduleSection: {
    maxWidth: '600px',
    margin: '32px auto 0',
    padding: '0 20px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#111827',
    marginBottom: '20px',
    letterSpacing: '-0.3px',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0px',
  },
  timelineItem: {
    display: 'flex',
    gap: '16px',
    position: 'relative' as const,
  },
  timelineDot: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    paddingTop: '4px',
    minWidth: '20px',
  },
  dot: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  timelineLine: {
    width: '2px',
    flexGrow: 1,
    minHeight: '20px',
    marginTop: '4px',
    marginBottom: '4px',
  },
  timelineContent: {
    flex: 1,
    padding: '14px 16px',
    borderRadius: '10px',
    marginBottom: '12px',
  },
  stepHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  stepLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#111827',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  stepDetails: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
  },
  stepAmount: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#111827',
  },
  stepPct: {
    fontSize: '13px',
    color: '#6b7280',
  },
  stepDue: {
    fontSize: '12px',
    marginTop: '4px',
    margin: '4px 0 0',
  },
  breakdownSection: {
    maxWidth: '600px',
    margin: '32px auto 0',
    padding: '0 20px',
  },
  breakdownTable: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    border: '1px solid #f3f4f6',
  },
  breakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
  },
  itemName: {
    fontSize: '14px',
    color: '#374151',
  },
  itemQty: {
    fontSize: '12px',
    color: '#9ca3af',
  },
  itemAmount: {
    fontSize: '14px',
    fontWeight: 600,
  },
  breakdownTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    backgroundColor: '#f9fafb',
    borderTop: '2px solid #e5e7eb',
  },
  totalLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#111827',
  },
  totalValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#111827',
  },
  footer: {
    maxWidth: '600px',
    margin: '40px auto 0',
    padding: '24px 20px 40px',
    textAlign: 'center' as const,
    borderTop: '1px solid #e5e7eb',
  },
  footerNote: {
    fontSize: '12px',
    color: '#9ca3af',
    lineHeight: '1.5',
    margin: '0 0 8px',
  },
  footerBrand: {
    fontSize: '12px',
    color: '#d1d5db',
    fontWeight: 500,
    letterSpacing: '0.5px',
  },
}
