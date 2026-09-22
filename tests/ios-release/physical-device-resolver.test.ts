import assert from "node:assert/strict";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const resolver = resolve("ios-native/scripts/resolve-physical-iphone-udid.sh");

function runResolver(environment: Record<string, string | undefined>) {
  return spawnSync("/bin/sh", [resolver], {
    encoding: "utf8",
    env: {
      NODE_ENV: process.env.NODE_ENV ?? "test",
      PATH: process.env.PATH,
      ...environment,
    },
  });
}

describe("physical iPhone destination resolver", () => {
  it("selects the hardware iPhone UDID and ignores iPad and Simulator IDs", () => {
    const result = runResolver({
      XCTRACE_DEVICES_OUTPUT: `== Devices ==
Mac (AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE)
Test iPad (26.0) (00008120-0000000000000001)
Baichu iPhone (26.0.1) (00008140-000151980C69801C)

== Simulators ==
iPhone 17 Pro Simulator (26.5) (386193D3-AB27-41F4-8B13-4DB3ACEE3907)`,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "00008140-000151980C69801C");
  });

  it("honors an explicitly selected physical device", () => {
    const result = runResolver({
      DEVICE_UDID: "00008140-EXPLICITDEVICE1",
      XCTRACE_DEVICES_OUTPUT: "",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "00008140-EXPLICITDEVICE1");
  });

  it("fails instead of mistaking an iPhone Simulator for hardware", () => {
    const result = runResolver({
      XCTRACE_DEVICES_OUTPUT: `== Devices ==
Mac (AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE)

== Simulators ==
iPhone 17 Pro Simulator (26.5) (386193D3-AB27-41F4-8B13-4DB3ACEE3907)`,
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /no paired physical iPhone/);
  });
});
