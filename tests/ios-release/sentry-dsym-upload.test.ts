import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";

const uploader = resolve("ios-native/scripts/upload-sentry-dsyms.sh");
const temporaryDirectories: string[] = [];

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "sideseat-sentry-"));
  temporaryDirectories.push(directory);
  return directory;
}

function runUploader(environment: Record<string, string | undefined>) {
  return spawnSync("/bin/sh", [uploader], {
    encoding: "utf8",
    env: {
      NODE_ENV: process.env.NODE_ENV ?? "test",
      PATH: process.env.PATH,
      ...environment,
    },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("Production Sentry dSYM upload", () => {
  it("does nothing for Development and non-archive actions", () => {
    const development = runUploader({ CONFIGURATION: "Development", ACTION: "install" });
    const ordinaryBuild = runUploader({ CONFIGURATION: "Production", ACTION: "build" });

    assert.equal(development.status, 0, development.stderr);
    assert.equal(ordinaryBuild.status, 0, ordinaryBuild.stderr);
    assert.equal(development.stdout, "");
    assert.equal(ordinaryBuild.stdout, "");
  });

  it("fails a Production archive before upload when credentials are missing", () => {
    const result = runUploader({
      CONFIGURATION: "Production",
      ACTION: "install",
      SENTRY_KEYCHAIN_ACCOUNT: "missing-test-account",
      SENTRY_KEYCHAIN_SERVICE: `missing-test-service-${Date.now()}`,
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Sentry auth is required/);
  });

  it("uploads the exact generated dSYM with the configured organization and project", () => {
    const directory = makeTemporaryDirectory();
    const dsymFolder = join(directory, "dSYMs");
    const dsymName = "SideSeat.app.dSYM";
    const dsymPath = join(dsymFolder, dsymName);
    const fakeCLI = join(directory, "sentry-cli");
    const capturedArguments = join(directory, "arguments.txt");

    mkdirSync(dsymPath, { recursive: true });
    writeFileSync(fakeCLI, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$FAKE_SENTRY_ARGS\"\n");
    chmodSync(fakeCLI, 0o755);

    const result = runUploader({
      ACTION: "install",
      CONFIGURATION: "Production",
      DEBUG_INFORMATION_FORMAT: "dwarf-with-dsym",
      DWARF_DSYM_FILE_NAME: dsymName,
      DWARF_DSYM_FOLDER_PATH: dsymFolder,
      FAKE_SENTRY_ARGS: capturedArguments,
      SENTRY_AUTH_TOKEN: "test-token",
      SENTRY_CLI_PATH: fakeCLI,
      SENTRY_ORG: "sideseat",
      SENTRY_PROJECT: "ios",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /SideSeat Sentry symbols uploaded/);
    assert.deepEqual(readFileSync(capturedArguments, "utf8").trim().split("\n"), [
      "debug-files",
      "upload",
      "--org",
      "sideseat",
      "--project",
      "ios",
      dsymPath,
    ]);
  });

  it("loads the upload token from the macOS Keychain fallback", () => {
    const directory = makeTemporaryDirectory();
    const dsymFolder = join(directory, "dSYMs");
    const dsymName = "SideSeat.app.dSYM";
    const dsymPath = join(dsymFolder, dsymName);
    const fakeCLI = join(directory, "sentry-cli");
    const fakeSecurity = join(directory, "security");
    const capturedToken = join(directory, "token.txt");

    mkdirSync(dsymPath, { recursive: true });
    writeFileSync(fakeSecurity, "#!/bin/sh\nprintf '%s' 'keychain-test-token'\n");
    writeFileSync(fakeCLI, "#!/bin/sh\nprintf '%s' \"$SENTRY_AUTH_TOKEN\" > \"$FAKE_SENTRY_TOKEN\"\n");
    chmodSync(fakeSecurity, 0o755);
    chmodSync(fakeCLI, 0o755);

    const result = runUploader({
      ACTION: "install",
      CONFIGURATION: "Production",
      DEBUG_INFORMATION_FORMAT: "dwarf-with-dsym",
      DWARF_DSYM_FILE_NAME: dsymName,
      DWARF_DSYM_FOLDER_PATH: dsymFolder,
      FAKE_SENTRY_TOKEN: capturedToken,
      PATH: `${directory}:/usr/bin:/bin`,
      SENTRY_CLI_PATH: fakeCLI,
      SENTRY_KEYCHAIN_ACCOUNT: "release-test",
      SENTRY_KEYCHAIN_SERVICE: "app.sideseat.mobile.sentry-dsym-test",
      SENTRY_ORG: "sideseat",
      SENTRY_PROJECT: "apple-ios",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(capturedToken, "utf8"), "keychain-test-token");
  });
});
