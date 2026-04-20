-- Normalize existing avatarUrl values. Uploaded filesystem paths never
-- survived on serverless deploys, so anything that isn't already one of the
-- 20 preset ids (p01-p20) gets replaced with a random preset. This also
-- guarantees every user has a non-null avatar.

UPDATE "User"
SET "avatarUrl" = 'p' || lpad(((floor(random() * 20) + 1)::int)::text, 2, '0')
WHERE "avatarUrl" IS NULL
   OR "avatarUrl" !~ '^p([0-1][0-9]|20)$';
