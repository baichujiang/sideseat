-- Existing registrations predate environment reporting. Production is the safe
-- fallback; updated apps overwrite this value when they next register the token.
ALTER TABLE "NativePushDevice"
ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'production';
