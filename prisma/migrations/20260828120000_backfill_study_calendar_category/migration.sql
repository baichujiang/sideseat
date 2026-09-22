-- "Study" became a starter calendar after calendar categories had already been initialized for
-- some users. Backfill it once for those accounts; future user deletions remain respected because
-- the runtime initializer still does not recreate missing presets after initialization.
INSERT INTO "UserCalendarCategory" (
    "id",
    "userId",
    "name",
    "color",
    "sortOrder",
    "presetKey",
    "icsSubscriptionUrl",
    "createdAt",
    "updatedAt"
)
SELECT
    CONCAT('calendar_study_', MD5("User"."id")),
    "User"."id",
    'Study',
    '#7C3AED',
    0,
    'study',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User"
WHERE "User"."calendarCategoriesInitializedAt" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM "UserCalendarCategory"
      WHERE "UserCalendarCategory"."userId" = "User"."id"
        AND "UserCalendarCategory"."presetKey" = 'study'
  )
ON CONFLICT ("userId", "presetKey") DO NOTHING;

-- Upgrade only colors that still match a previously shipped default. User-selected colors are
-- deliberately left unchanged.
UPDATE "UserCalendarCategory"
SET "color" = CASE "presetKey"
    WHEN 'study' THEN '#7C3AED'
    WHEN 'work' THEN '#2563EB'
    WHEN 'personal' THEN '#DB2777'
END,
"updatedAt" = CURRENT_TIMESTAMP
WHERE ("presetKey" = 'study' AND UPPER("color") = '#2563EB')
   OR ("presetKey" = 'work' AND UPPER("color") IN ('#1E40AF', '#1E3A8A', '#0D9488'))
   OR ("presetKey" = 'personal' AND UPPER("color") IN ('#6B7280', '#EA580C'));

-- Keep the built-in starter categories in their current canonical order. Custom categories are
-- untouched and continue after the built-ins.
UPDATE "UserCalendarCategory"
SET "sortOrder" = CASE "presetKey"
    WHEN 'study' THEN 0
    WHEN 'work' THEN 1
    WHEN 'personal' THEN 2
END,
"updatedAt" = CURRENT_TIMESTAMP
WHERE "presetKey" IN ('study', 'work', 'personal');
