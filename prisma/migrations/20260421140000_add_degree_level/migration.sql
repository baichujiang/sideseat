-- Add a structured degree level so Bachelor/Master students can be filtered
-- separately. Existing rows stay NULL until users re-save their profile.

CREATE TYPE "DegreeLevel" AS ENUM ('BACHELOR', 'MASTER', 'PHD', 'OTHER');

ALTER TABLE "User"
  ADD COLUMN "degreeLevel" "DegreeLevel";
