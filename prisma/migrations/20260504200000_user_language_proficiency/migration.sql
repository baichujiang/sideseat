-- Per-language proficiency (replaces flat User.languages[]).
CREATE TYPE "LanguageProficiency" AS ENUM ('NATIVE', 'FLUENT', 'CONVERSATIONAL', 'BASIC', 'LEARNING');

CREATE TABLE "UserLanguage" (
    "userId" TEXT NOT NULL,
    "tag" "LanguageTag" NOT NULL,
    "proficiency" "LanguageProficiency" NOT NULL,

    CONSTRAINT "UserLanguage_pkey" PRIMARY KEY ("userId", "tag"),
    CONSTRAINT "UserLanguage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserLanguage_userId_idx" ON "UserLanguage"("userId");

INSERT INTO "UserLanguage" ("userId", "tag", "proficiency")
SELECT u."id", t."tag", 'FLUENT'::"LanguageProficiency"
FROM "User" u
CROSS JOIN LATERAL (
    SELECT unnest(COALESCE(u."languages", ARRAY[]::"LanguageTag"[])) AS "tag"
) AS t;

INSERT INTO "UserLanguage" ("userId", "tag", "proficiency")
SELECT u."id", 'ENGLISH'::"LanguageTag", 'FLUENT'::"LanguageProficiency"
FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "UserLanguage" ul WHERE ul."userId" = u."id");

ALTER TABLE "User" DROP COLUMN "languages";
