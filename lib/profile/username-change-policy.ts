export const USERNAME_CHANGE_LIMIT = 3;
export const USERNAME_CHANGE_WINDOW_DAYS = 7;

const USERNAME_CHANGE_WINDOW_MS = USERNAME_CHANGE_WINDOW_DAYS * 24 * 60 * 60_000;

export type UsernameChangePolicySource = {
  usernameChangeWindowStartedAt: Date | null;
  usernameChangeCount: number;
};

export type UsernameChangePolicy = {
  limit: number;
  windowDays: number;
  changesUsed: number;
  changesRemaining: number;
  nextAllowedAt: Date | null;
};

function activeWindowEnd(source: UsernameChangePolicySource, now: Date) {
  const startedAt = source.usernameChangeWindowStartedAt;
  if (!startedAt || source.usernameChangeCount <= 0) return null;

  const end = new Date(startedAt.getTime() + USERNAME_CHANGE_WINDOW_MS);
  return end.getTime() > now.getTime() ? end : null;
}

export function usernameChangePolicy(
  source: UsernameChangePolicySource,
  now = new Date(),
): UsernameChangePolicy {
  const windowEnd = activeWindowEnd(source, now);
  const changesUsed = windowEnd
    ? Math.min(USERNAME_CHANGE_LIMIT, Math.max(0, source.usernameChangeCount))
    : 0;
  const changesRemaining = USERNAME_CHANGE_LIMIT - changesUsed;

  return {
    limit: USERNAME_CHANGE_LIMIT,
    windowDays: USERNAME_CHANGE_WINDOW_DAYS,
    changesUsed,
    changesRemaining,
    nextAllowedAt: changesRemaining === 0 ? windowEnd : null,
  };
}

export function nextUsernameChangeWindow(
  source: UsernameChangePolicySource,
  now = new Date(),
) {
  const windowEnd = activeWindowEnd(source, now);
  if (!windowEnd) {
    return {
      usernameChangeWindowStartedAt: now,
      usernameChangeCount: 1,
    };
  }

  return {
    usernameChangeWindowStartedAt: source.usernameChangeWindowStartedAt,
    usernameChangeCount: source.usernameChangeCount + 1,
  };
}

export function usernameChangePolicyDto(
  source: UsernameChangePolicySource,
  now = new Date(),
) {
  const policy = usernameChangePolicy(source, now);
  return {
    ...policy,
    nextAllowedAt: policy.nextAllowedAt?.toISOString() ?? null,
  };
}
