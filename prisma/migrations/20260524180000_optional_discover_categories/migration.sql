-- ClassmatePostCategory: optional catch-all for posts without a fixed type
ALTER TYPE "ClassmatePostCategory" ADD VALUE 'OTHER';

-- DiscoverActivity.category is optional (title + description carry the intent)
ALTER TABLE "DiscoverActivity" ALTER COLUMN "category" DROP NOT NULL;
