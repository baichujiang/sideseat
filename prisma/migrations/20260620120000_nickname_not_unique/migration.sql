DROP INDEX IF EXISTS "User_nicknameKey_key";

CREATE INDEX IF NOT EXISTS "User_nicknameKey_idx" ON "User"("nicknameKey");
