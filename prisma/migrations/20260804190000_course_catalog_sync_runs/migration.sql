CREATE TYPE "CourseCatalogSyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

CREATE TABLE "CourseCatalogSyncRun" (
    "id" TEXT NOT NULL,
    "provider" "CourseExternalSource" NOT NULL,
    "school" TEXT NOT NULL,
    "semesterLabel" TEXT NOT NULL,
    "semesterKey" TEXT NOT NULL,
    "status" "CourseCatalogSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "preparedCount" INTEGER NOT NULL DEFAULT 0,
    "upsertedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CourseCatalogSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseCatalogSyncRun_provider_semesterLabel_startedAt_idx"
ON "CourseCatalogSyncRun"("provider", "semesterLabel", "startedAt");

CREATE INDEX "CourseCatalogSyncRun_status_startedAt_idx"
ON "CourseCatalogSyncRun"("status", "startedAt");
