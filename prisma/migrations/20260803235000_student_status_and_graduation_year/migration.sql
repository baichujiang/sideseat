CREATE TYPE "StudentStatus" AS ENUM ('CURRENT_STUDENT', 'EXCHANGE_STUDENT', 'ALUMNI');

ALTER TABLE "User"
  ADD COLUMN "studentStatus" "StudentStatus",
  ADD COLUMN "graduationYear" INTEGER;
