export const DIRECT_V1_BACKFILL_PHASES = ["actions", "interests"] as const;

export type DirectV1BackfillPhase = (typeof DIRECT_V1_BACKFILL_PHASES)[number];

export type DirectV1BackfillCheckpoint = {
  version: 1;
  phase: DirectV1BackfillPhase;
  through: string;
  createdAt: string;
  id: string;
};

export type DirectV1BackfillCliOptions = {
  mode: "dry-run" | "apply";
  phase: DirectV1BackfillPhase | "all";
  batchSize: number;
  maxFindings: number;
  through: Date | null;
  checkpoint: DirectV1BackfillCheckpoint | null;
  databaseUrlEnv: string;
  format: "human" | "json";
  help: boolean;
};

export type DirectV1VerifyCliOptions = Omit<
  DirectV1BackfillCliOptions,
  "mode" | "phase" | "checkpoint"
> & {
  phase: "all";
  checkpoint: null;
};

const PHASES = new Set<string>(DIRECT_V1_BACKFILL_PHASES);
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

export function parseDirectV1BackfillArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): DirectV1BackfillCliOptions {
  let mode: DirectV1BackfillCliOptions["mode"] = "dry-run";
  let phase: DirectV1BackfillCliOptions["phase"] = "all";
  let batchSize = 100;
  let maxFindings = 100;
  let through: Date | null = null;
  let checkpoint: DirectV1BackfillCheckpoint | null = null;
  let databaseUrlEnv = env.DATABASE_URL_UNPOOLED?.trim()
    ? "DATABASE_URL_UNPOOLED"
    : "DATABASE_URL";
  let format: DirectV1BackfillCliOptions["format"] = "human";
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "--apply") {
      mode = "apply";
      continue;
    }
    if (argument === "--dry-run") {
      mode = "dry-run";
      continue;
    }
    if (argument === "--json") {
      format = "json";
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }

    const [name, inlineValue] = splitOption(argument);
    if (
      name === "--phase" ||
      name === "--batch-size" ||
      name === "--max-findings" ||
      name === "--through" ||
      name === "--cursor" ||
      name === "--database-url-env"
    ) {
      const value = inlineValue ?? requireValue(argv, ++index, name);
      switch (name) {
        case "--phase":
          if (value !== "all" && !PHASES.has(value)) {
            throw new Error("--phase must be actions, interests, or all.");
          }
          phase = value as DirectV1BackfillCliOptions["phase"];
          break;
        case "--batch-size":
          batchSize = boundedInteger(value, name, 1, 500);
          break;
        case "--max-findings":
          maxFindings = boundedInteger(value, name, 1, 500);
          break;
        case "--through":
          through = parseInstant(value, name);
          break;
        case "--cursor":
          checkpoint = decodeDirectV1BackfillCheckpoint(value);
          break;
        case "--database-url-env":
          if (!ENV_NAME.test(value)) {
            throw new Error("--database-url-env must name an environment variable.");
          }
          databaseUrlEnv = value;
          break;
      }
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  if (checkpoint) {
    if (through && through.toISOString() !== checkpoint.through) {
      throw new Error("--through must match the through value embedded in --cursor.");
    }
    through = new Date(checkpoint.through);
    if (phase !== "all" && phase !== checkpoint.phase) {
      throw new Error("--phase must match the phase embedded in --cursor.");
    }
  }
  if (mode === "apply" && !through && !help) {
    throw new Error(
      "--apply requires an explicit --through timestamp from a reviewed dry run.",
    );
  }

  return {
    mode,
    phase,
    batchSize,
    maxFindings,
    through,
    checkpoint,
    databaseUrlEnv,
    format,
    help,
  };
}

/**
 * The verifier deliberately has no mutation mode. Keep this separate from the
 * backfill entry point so an operator cannot accidentally turn verification
 * into an apply run by reusing familiar flags.
 */
export function parseDirectV1VerifyArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): DirectV1VerifyCliOptions {
  if (argv.some((argument) => argument === "--apply" || argument.startsWith("--apply="))) {
    throw new Error("The verifier is read-only and does not accept --apply.");
  }
  if (
    argv.some(
      (argument) => argument === "--cursor" || argument.startsWith("--cursor="),
    )
  ) {
    throw new Error(
      "The verifier does not accept --cursor; release verification must scan the full dataset from the beginning.",
    );
  }
  const options = parseDirectV1BackfillArgs(argv, env);
  if (options.phase !== "all") {
    throw new Error(
      "The verifier requires --phase all so release verification scans actions then interests in full.",
    );
  }
  return {
    phase: "all",
    batchSize: options.batchSize,
    maxFindings: options.maxFindings,
    through: options.through,
    checkpoint: null,
    databaseUrlEnv: options.databaseUrlEnv,
    format: options.format,
    help: options.help,
  };
}

export function requireDatabaseUrlFromEnvironment(
  environmentName: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  if (!ENV_NAME.test(environmentName)) {
    throw new Error("Database environment variable name is invalid.");
  }
  const value = env[environmentName]?.trim();
  if (!value) {
    throw new Error(`Database URL environment variable ${environmentName} is not set.`);
  }
  return value;
}

export function redactDirectV1CliError(
  error: unknown,
  secrets: readonly string[] = [],
): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  // Defense in depth for driver errors that happen to echo a connection URI.
  return message.replace(
    /(?:postgres(?:ql)?|prisma\+postgres):\/\/[^\s'"`]+/gi,
    "postgresql://[REDACTED]",
  );
}

export function encodeDirectV1BackfillCheckpoint(
  checkpoint: DirectV1BackfillCheckpoint,
): string {
  validateCheckpoint(checkpoint);
  return Buffer.from(JSON.stringify(checkpoint), "utf8").toString("base64url");
}

export function decodeDirectV1BackfillCheckpoint(
  encoded: string,
): DirectV1BackfillCheckpoint {
  if (!/^[A-Za-z0-9_-]{8,4096}$/.test(encoded)) {
    throw new Error("--cursor is not a valid checkpoint token.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("--cursor is not a valid checkpoint token.");
  }
  validateCheckpoint(parsed);
  return parsed;
}

function validateCheckpoint(value: unknown): asserts value is DirectV1BackfillCheckpoint {
  if (!isRecord(value) || value.version !== 1 || !PHASES.has(String(value.phase))) {
    throw new Error("--cursor has an unsupported checkpoint shape.");
  }
  if (typeof value.id !== "string" || value.id.length < 1 || value.id.length > 512) {
    throw new Error("--cursor has an invalid row identifier.");
  }
  const through = parseInstant(value.through, "checkpoint through").toISOString();
  const createdAt = parseInstant(value.createdAt, "checkpoint createdAt").toISOString();
  if (through !== value.through || createdAt !== value.createdAt) {
    throw new Error("--cursor timestamps must use canonical ISO-8601 form.");
  }
  if (createdAt > through) {
    throw new Error("--cursor cannot advance beyond its through timestamp.");
  }
}

function splitOption(argument: string): [string, string | undefined] {
  const separator = argument.indexOf("=");
  if (separator === -1) return [argument, undefined];
  const name = argument.slice(0, separator);
  const value = argument.slice(separator + 1);
  if (!value) throw new Error(`${name} requires a value.`);
  return [name, value];
}

function requireValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

function boundedInteger(
  raw: string,
  option: string,
  minimum: number,
  maximum: number,
): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${option} must be an integer between ${minimum} and ${maximum}.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${option} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function parseInstant(value: unknown, label: string): Date {
  if (typeof value !== "string" || value.length > 64) {
    throw new Error(`${label} must be an ISO-8601 timestamp.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be an ISO-8601 timestamp.`);
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
