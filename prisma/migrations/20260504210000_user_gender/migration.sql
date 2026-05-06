-- CreateEnum
CREATE TYPE "UserGender" AS ENUM ('MALE', 'FEMALE', 'PRIVATE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "gender" "UserGender" NOT NULL DEFAULT 'PRIVATE';
