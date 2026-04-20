-- AlterTable
ALTER TABLE "Course" ADD COLUMN "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_school_semesterLabel_key" ON "Course"("code", "school", "semesterLabel");
