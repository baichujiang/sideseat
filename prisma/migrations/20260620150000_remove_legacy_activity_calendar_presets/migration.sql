-- Calendar defaults should no longer mirror the old fixed Find Buddies buckets.
-- Existing events are preserved; CalendarEntry.categoryId uses ON DELETE SET NULL.
DELETE FROM "UserCalendarCategory"
WHERE "presetKey" IN ('course', 'study', 'meal', 'language', 'sports');
