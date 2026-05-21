-- Case-insensitive unique email (after running scripts/dedupe-user-emails.ts --apply if needed).
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_normalized_key"
  ON "User" (LOWER(TRIM("email")))
  WHERE "email" IS NOT NULL;
