-- Migration to ensure type and missing columns exist on finance and project deliverables tables

-- 1. finance_categories: add type and parent_id
ALTER TABLE finance_categories ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'income';
ALTER TABLE finance_categories ADD COLUMN IF NOT EXISTS parent_id INT REFERENCES finance_categories(id);

-- 2. finance_transactions: add type, description, metadata, transaction_type, project_uuid
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS transaction_type TEXT;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS project_uuid UUID REFERENCES projects(id);

-- Allow money_source_id to be nullable so transactions from proposals can be created cleanly
ALTER TABLE finance_transactions ALTER COLUMN money_source_id DROP NOT NULL;

-- 3. Backfill type and transaction_type
UPDATE finance_transactions
SET type = CASE WHEN direction = 'in' THEN 'income' ELSE 'expense' END
WHERE type IS NULL AND direction IS NOT NULL;

UPDATE finance_transactions
SET transaction_type = 'invoice_payment'
WHERE transaction_type IS NULL AND direction = 'in' AND (lead_id IS NOT NULL OR project_uuid IS NOT NULL);

-- 4. project_deliverables: ensure type column exists
ALTER TABLE project_deliverables ADD COLUMN IF NOT EXISTS type TEXT;
