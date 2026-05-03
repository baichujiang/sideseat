DO $$
BEGIN
  CREATE TYPE "ClassmatePostCategory" AS ENUM ('STUDY', 'MEALS', 'LANGUAGE', 'SPORTS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ClassmatePostStatus" AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ClassmatePost" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "category" "ClassmatePostCategory" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "status" "ClassmatePostStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassmatePost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClassmatePost_category_status_city_createdAt_idx"
  ON "ClassmatePost"("category", "status", "city", "createdAt");
CREATE INDEX IF NOT EXISTS "ClassmatePost_userId_category_status_idx"
  ON "ClassmatePost"("userId", "category", "status");
CREATE INDEX IF NOT EXISTS "ClassmatePost_expiresAt_idx"
  ON "ClassmatePost"("expiresAt");

DO $$
BEGIN
  ALTER TABLE "ClassmatePost"
    ADD CONSTRAINT "ClassmatePost_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
