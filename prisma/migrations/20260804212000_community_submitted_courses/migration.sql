ALTER TABLE "Course" ADD COLUMN "submittedById" TEXT;

ALTER TABLE "Course"
ADD CONSTRAINT "Course_submittedById_fkey"
FOREIGN KEY ("submittedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Course_submittedById_createdAt_idx"
ON "Course"("submittedById", "createdAt");
