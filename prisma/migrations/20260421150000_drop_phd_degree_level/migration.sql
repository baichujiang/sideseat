-- Drop PHD from the DegreeLevel enum. The app is for finding classmates and
-- PhD candidates rarely take classes, so the option just adds noise. Any
-- existing rows that picked PHD are reclassified as OTHER (the catch-all
-- bucket already used for state exams / certificates).
--
-- Postgres can't remove a single enum value in place, so we recreate the type.

ALTER TYPE "DegreeLevel" RENAME TO "DegreeLevel_old";

CREATE TYPE "DegreeLevel" AS ENUM ('BACHELOR', 'MASTER', 'OTHER');

ALTER TABLE "User"
  ALTER COLUMN "degreeLevel" TYPE "DegreeLevel"
  USING (
    CASE "degreeLevel"::text
      WHEN 'PHD' THEN 'OTHER'
      ELSE "degreeLevel"::text
    END
  )::"DegreeLevel";

DROP TYPE "DegreeLevel_old";
