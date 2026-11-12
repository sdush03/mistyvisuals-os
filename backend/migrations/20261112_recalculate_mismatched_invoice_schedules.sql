-- Recalculate percentage-based invoice payment schedules whose stored milestone amounts
-- do not sum to the invoice's agreed total_amount (e.g. from stale pre-discount quote drafts).
UPDATE invoice_payment_schedule ips
SET amount = ROUND((ips.percentage / 100.0) * i.total_amount)
FROM invoices i
WHERE ips.invoice_id = i.id
  AND i.total_amount > 0
  AND ips.percentage IS NOT NULL
  AND ips.percentage > 0
  AND i.id IN (
    SELECT s.invoice_id
    FROM invoice_payment_schedule s
    JOIN invoices inv ON inv.id = s.invoice_id
    WHERE inv.total_amount > 0
    GROUP BY s.invoice_id, inv.total_amount
    HAVING COUNT(*) > 0
       AND BOOL_AND(s.percentage IS NOT NULL AND s.percentage > 0)
       AND ABS(SUM(s.percentage) - 100) < 0.01
       AND ABS(SUM(COALESCE(s.amount, 0)) - inv.total_amount) > 1
  );
