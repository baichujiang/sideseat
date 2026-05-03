-- Track when a user was last seen so Discover can use recency as a tie-breaker.
-- Nullable because existing users have never been "bumped" yet; we fall back to
-- createdAt when ordering.

ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
