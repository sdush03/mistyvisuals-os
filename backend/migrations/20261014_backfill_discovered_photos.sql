-- Backfill discovered flag on photos that have recorded impression events in gallery_analytics_events
UPDATE photos 
SET discovered = TRUE 
WHERE discovered = FALSE 
  AND id IN (
    SELECT DISTINCT CAST(media_id AS INTEGER) 
    FROM gallery_analytics_events 
    WHERE event_type = 'IMPRESSION' 
      AND media_id IS NOT NULL 
      AND media_id ~ '^[0-9]+$'
  );
