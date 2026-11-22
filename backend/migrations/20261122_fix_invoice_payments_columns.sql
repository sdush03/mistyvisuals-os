-- Align invoice_payments table columns across finance v1 and quotation/proposal modules

ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2);
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS method TEXT;
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS note TEXT;

-- Drop NOT NULL constraints if table was created with them in 20260228_add_finance_v1_invoices.sql
ALTER TABLE invoice_payments ALTER COLUMN finance_transaction_id DROP NOT NULL;
ALTER TABLE invoice_payments ALTER COLUMN amount_applied DROP NOT NULL;

-- Backfill amount and amount_applied so existing records match on both columns
UPDATE invoice_payments 
SET amount = amount_applied 
WHERE amount IS NULL AND amount_applied IS NOT NULL;

UPDATE invoice_payments 
SET amount_applied = amount 
WHERE amount_applied IS NULL AND amount IS NOT NULL;

-- Backfill paid_at from created_at where missing
UPDATE invoice_payments 
SET paid_at = created_at 
WHERE paid_at IS NULL AND created_at IS NOT NULL;
