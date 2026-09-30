-- Derive deadlines for existing dated intentions; undecided timing remains open-ended.
-- Preserve any previously assigned deadline and all relationships/history.
UPDATE "WeeklyIntent" AS intent
SET "expiresAt" = CASE
  WHEN intent."timePreference"->>'kind' = 'FLEXIBLE' THEN
    ((intent."timePreference"->>'endDate')::date + time '23:59:59.999')
      AT TIME ZONE intent."timeZone"
  ELSE (
    SELECT max((slot->>'endAt')::timestamptz)
    FROM jsonb_array_elements(intent."timeWindows") AS slot
  )
END
WHERE intent."expiresAt" IS NULL
  AND intent."status" IN ('ACTIVE', 'PAUSED')
  AND coalesce(intent."timePreference"->>'kind', 'EXACT') <> 'UNDECIDED';
