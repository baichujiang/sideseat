-- Course timetable mirror rows always belong to the user's `presetKey = course` category.
UPDATE "CalendarEntry" AS ce
SET "categoryId" = ucc.id
FROM "UserCalendarCategory" AS ucc
WHERE ce."userId" = ucc."userId"
  AND ucc."presetKey" = 'course'
  AND (
    ce."courseScheduleMirrorKey" IS NOT NULL
    OR ce."source" = 'course_mirror'
  )
  AND ce."categoryId" IS DISTINCT FROM ucc.id;
