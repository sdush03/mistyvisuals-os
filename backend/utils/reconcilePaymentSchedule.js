/**
 * Reconciles percentage-based payment schedule amounts against the agreed total
 * whenever every milestone has a positive percentage summing to 100%,
 * but the stored milestone amounts sum to a different total (e.g., stale pre-discount draft).
 */
function reconcilePaymentSchedule(schedule, agreedTotal) {
  const total = Number(agreedTotal || 0)
  if (!total || total <= 0 || !Array.isArray(schedule) || schedule.length === 0) {
    return schedule
  }

  const allHavePct = schedule.every(s => Number(s.percentage) > 0)
  const totalPct = schedule.reduce((sum, s) => sum + Number(s.percentage || 0), 0)
  const currentAmtSum = schedule.reduce((sum, s) => sum + Number(s.amount || 0), 0)

  if (allHavePct && Math.abs(totalPct - 100) < 0.01 && Math.abs(currentAmtSum - total) > 1) {
    let runningSum = 0
    return schedule.map((step, idx, arr) => {
      const pct = Number(step.percentage)
      let amt = Math.round((pct / 100) * total)
      if (idx === arr.length - 1) {
        amt = Math.max(0, total - runningSum)
      } else {
        runningSum += amt
      }
      return { ...step, amount: amt }
    })
  }

  return schedule
}

module.exports = { reconcilePaymentSchedule }
