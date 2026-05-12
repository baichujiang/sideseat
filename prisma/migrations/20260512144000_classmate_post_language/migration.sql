-- CreateTable
CREATE TABLE "ClassmatePostLanguage" (
    "postId" TEXT NOT NULL,
    "offers" JSONB NOT NULL DEFAULT '[]',
    "targets" "LanguageTag"[] DEFAULT ARRAY[]::"LanguageTag"[],

    CONSTRAINT "ClassmatePostLanguage_pkey" PRIMARY KEY ("postId")
);

-- AddForeignKey
ALTER TABLE "ClassmatePostLanguage" ADD CONSTRAINT "ClassmatePostLanguage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ClassmatePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
