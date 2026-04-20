-- AlterTable
ALTER TABLE "User" ADD COLUMN     "username" TEXT;
ALTER TABLE "User" ADD COLUMN     "isGuest" BOOLEAN NOT NULL DEFAULT false;

-- Backfill username before constraints (guaranteed unique per id)
UPDATE "User" SET "username" = 'user_' || "id";

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

DROP INDEX IF EXISTS "User_email_key";

ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
