export type FeedbackRankingInput = {
  id: string;
  up: number;
  down: number;
  commentCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function timestamp(value: Date | string): number {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function feedbackRankingScore(
  post: FeedbackRankingInput,
  now: Date = new Date(),
): number {
  const up = Math.max(0, post.up);
  const down = Math.max(0, post.down);
  const comments = Math.max(0, post.commentCount);
  const votes = up + down;
  const netApproval = up - down;
  const approvalRatio = votes === 0 ? 0 : netApproval / votes;
  const participation = Math.log2(1 + votes + comments * 1.5);
  const activityAgeHours = Math.max(0, now.getTime() - timestamp(post.updatedAt)) / 3_600_000;
  const freshness = Math.max(0, 1 - activityAgeHours / (24 * 30));

  return (
    netApproval * 2 +
    approvalRatio * 2 +
    participation +
    Math.min(comments, 20) * 0.35 +
    freshness * 4
  );
}

export function rankFeedbackPosts<T extends FeedbackRankingInput>(
  posts: readonly T[],
  now: Date = new Date(),
): T[] {
  return [...posts].sort((left, right) => {
    const rankDifference =
      feedbackRankingScore(right, now) - feedbackRankingScore(left, now);
    if (Math.abs(rankDifference) > Number.EPSILON) return rankDifference;

    const activityDifference = timestamp(right.updatedAt) - timestamp(left.updatedAt);
    if (activityDifference !== 0) return activityDifference;
    return left.id.localeCompare(right.id);
  });
}
