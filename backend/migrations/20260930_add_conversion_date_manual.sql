-- 1. Ensure column conversion_date_manual exists
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_date_manual boolean DEFAULT false;

-- 2. Heal converted_at for any converted lead where conversion_date_manual is false
-- Reset converted_at back to the true conversion date (removing the erroneous awaiting_advance_since assignment):

-- Priority 1: First agreement signature timestamp
WITH first_signature AS (
  SELECT qg.lead_id, MIN((qv.draft_data_json->>'agreementSignedAt')::timestamp) AS first_signed_at
  FROM quote_versions qv
  JOIN quote_groups qg ON qg.id = qv.quote_group_id
  WHERE qv.draft_data_json->>'agreementSignedAt' IS NOT NULL
  GROUP BY qg.lead_id
)
UPDATE leads l
SET converted_at = fs.first_signed_at
FROM first_signature fs
WHERE l.id = fs.lead_id
  AND l.status = 'Converted'
  AND l.conversion_date_manual = false;

-- Priority 2: For converted leads without digital agreement signature, find when status was changed to 'Converted' (NOT Awaiting Advance!)
WITH first_converted_activity AS (
  SELECT lead_id, MIN(created_at) AS converted_activity_at
  FROM lead_activities
  WHERE (activity_type = 'status_change' AND metadata->>'to' = 'Converted')
     OR activity_type IN ('converted', 'agreement_signed')
  GROUP BY lead_id
)
UPDATE leads l
SET converted_at = fca.converted_activity_at
FROM first_converted_activity fca
WHERE l.id = fca.lead_id
  AND l.status = 'Converted'
  AND l.conversion_date_manual = false
  AND NOT EXISTS (
    SELECT 1 FROM quote_versions qv
    JOIN quote_groups qg ON qg.id = qv.quote_group_id
    WHERE qg.lead_id = l.id AND qv.draft_data_json->>'agreementSignedAt' IS NOT NULL
  );

-- Priority 3: Earliest project creation if no earlier converted activity
WITH first_project AS (
  SELECT lead_id, MIN(created_at) AS project_created_at
  FROM projects
  GROUP BY lead_id
)
UPDATE leads l
SET converted_at = fp.project_created_at
FROM first_project fp
WHERE l.id = fp.lead_id
  AND l.status = 'Converted'
  AND l.conversion_date_manual = false
  AND NOT EXISTS (
    SELECT 1 FROM quote_versions qv
    JOIN quote_groups qg ON qg.id = qv.quote_group_id
    WHERE qg.lead_id = l.id AND qv.draft_data_json->>'agreementSignedAt' IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM lead_activities a
    WHERE a.lead_id = l.id
      AND ((a.activity_type = 'status_change' AND a.metadata->>'to' = 'Converted') OR a.activity_type IN ('converted', 'agreement_signed'))
  );
