import { spawnSync } from "node:child_process";

const timeZones = ["UTC", "Europe/Berlin", "America/Los_Angeles"];
const tests = [
  "tests/calendar/ical-subscription.test.ts",
  "tests/calendar/ical-import-export.test.ts",
];

for (const timeZone of timeZones) {
  console.log(`[calendar-parser] Running in ${timeZone}`);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", ...tests],
    {
      cwd: process.cwd(),
      env: { ...process.env, TZ: timeZone },
      stdio: "inherit",
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
