-- CreateTable
CREATE TABLE "ClassmatePostCourse" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "ClassmatePostCourse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassmatePostCourse_courseId_idx" ON "ClassmatePostCourse"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassmatePostCourse_postId_courseId_key" ON "ClassmatePostCourse"("postId", "courseId");

-- AddForeignKey
ALTER TABLE "ClassmatePostCourse" ADD CONSTRAINT "ClassmatePostCourse_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ClassmatePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassmatePostCourse" ADD CONSTRAINT "ClassmatePostCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
