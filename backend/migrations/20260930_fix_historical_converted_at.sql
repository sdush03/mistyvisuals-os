-- Fix historical converted_at to be when the user signed first, or earliest activity/project
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
  AND (l.converted_at IS NULL OR l.converted_at > fs.first_signed_at);

-- Check earliest proposal snapshots signed
WITH first_snapshot_signed AS (
  SELECT qg.lead_id, MIN(COALESCE(
    NULLIF(ps.snapshot_json->'draftData'->>'agreementSignedAt', '')::timestamp,
    ps.created_at
  )) AS first_signed_at
  FROM proposal_snapshots ps
  JOIN quote_versions qv ON qv.id = ps.quote_version_id
  JOIN quote_groups qg ON qg.id = qv.quote_group_id
  WHERE ps.snapshot_json->'draftData'->>'agreementSignedAt' IS NOT NULL
     OR ps.snapshot_json->>'status' IN ('ADVANCE_AWAITING', 'ACCEPTED')
     OR qv.status IN ('ADVANCE_AWAITING', 'ACCEPTED')
  GROUP BY qg.lead_id
)
UPDATE leads l
SET converted_at = fss.first_signed_at
FROM first_snapshot_signed fss
WHERE l.id = fss.lead_id
  AND (l.converted_at IS NULL OR l.converted_at > fss.first_signed_at);

-- Check earliest awaiting advance timestamp
UPDATE leads
SET converted_at = awaiting_advance_since
WHERE awaiting_advance_since IS NOT NULL
  AND (converted_at IS NULL OR converted_at > awaiting_advance_since);

-- Check earliest activity
WITH earliest_activity AS (
  SELECT lead_id, MIN(created_at) AS earliest_date
  FROM lead_activities
  WHERE (activity_type = 'status_change' AND metadata->>'to' IN ('Awaiting Advance', 'Converted'))
     OR activity_type IN ('converted', 'proposal_signed', 'agreement_signed')
  GROUP BY lead_id
)
UPDATE leads l
SET converted_at = ea.earliest_date
FROM earliest_activity ea
WHERE l.id = ea.lead_id
  AND (l.converted_at IS NULL OR l.converted_at > ea.earliest_date);

-- Check earliest project
WITH earliest_project AS (
  SELECT lead_id, MIN(created_at) AS earliest_date
  FROM projects
  GROUP BY lead_id
)
UPDATE leads l
SET converted_at = ep.earliest_date
FROM earliest_project ep
WHERE l.id = ep.lead_id
  AND (l.converted_at IS NULL OR l.converted_at > ep.earliest_date);
