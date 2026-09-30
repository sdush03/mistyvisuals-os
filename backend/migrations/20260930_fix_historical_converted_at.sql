-- Fix historical converted_at if earlier activity, project, or quote acceptance exists
WITH earliest_activity AS (
  SELECT lead_id, MIN(created_at) AS earliest_date
  FROM lead_activities
  WHERE (activity_type = 'status_change' AND metadata->>'to' = 'Converted')
     OR activity_type = 'converted'
  GROUP BY lead_id
)
UPDATE leads l
SET converted_at = ea.earliest_date
FROM earliest_activity ea
WHERE l.id = ea.lead_id
  AND (l.converted_at IS NULL OR l.converted_at > ea.earliest_date);

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
