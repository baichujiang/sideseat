import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const performanceScript = readFileSync(
  `${repoRoot}/ios-native/scripts/run-performance-gates.sh`,
  "utf8",
);
const workflow = readFileSync(`${repoRoot}/.github/workflows/ci.yml`, "utf8");

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

describe("native performance CI configuration", () => {
  it("runs every performance test in isolation from the functional suite", () => {
    const isolatedTests = sortedUnique(
      performanceScript.match(/\btest[A-Z][A-Za-z0-9]+/g) ?? [],
    );
    const skippedInFunctionalSuite = sortedUnique(
      [...workflow.matchAll(
        /-skip-testing:SideSeatUITests\/AuthenticationUITests\/(test[A-Z][A-Za-z0-9]+)/g,
      )].map((match) => match[1]),
    );

    assert.equal(isolatedTests.length, 11);
    assert.deepEqual(skippedInFunctionalSuite, isolatedTests);
    assert.match(workflow, /run: ios-native\/scripts\/run-performance-gates\.sh/);
    assert.match(workflow, /path: ios-native\/TestResults/);
  });
});
