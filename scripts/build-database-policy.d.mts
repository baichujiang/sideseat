export type BuildMigrationPolicy =
  | { run: true; reason: string; host?: string }
  | { run: false; reason: string; host?: string };

export function buildMigrationPolicy(
  env?: Record<string, string | undefined>,
): BuildMigrationPolicy;
