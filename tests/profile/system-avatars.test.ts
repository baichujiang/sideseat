import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  AVATAR_IDS,
  getAvatarSrc,
  resolveAvatarImageSrc,
} from "../../lib/constants/avatars";

test("all 20 stable preset ids have identical original web and native assets", () => {
  assert.equal(AVATAR_IDS.length, 20);
  const assets = new Set<string>();
  for (const id of AVATAR_IDS) {
    const web = readFileSync(
      join(process.cwd(), "public", getAvatarSrc(id)),
      "utf8",
    );
    const native = readFileSync(
      join(
        process.cwd(),
        "ios-native/SideSeat/Resources/Assets.xcassets",
        `SystemAvatar-${id}.imageset/avatar.svg`,
      ),
      "utf8",
    );
    assert.equal(native, web);
    assert.match(web, /viewBox="0 0 100 100"/);
    assert.doesNotMatch(web, /<script|<image|https?:\/\/(?!www.w3.org)/);
    assets.add(web);
  }
  assert.equal(assets.size, 20);
});

test("custom photos stay unchanged and missing avatars use the shared p01 default", () => {
  const photo =
    "https://example.public.blob.vercel-storage.com/avatars/custom/user/photo.jpg";
  assert.equal(resolveAvatarImageSrc(photo), photo);
  assert.equal(resolveAvatarImageSrc(null), getAvatarSrc("p01"));
  assert.equal(resolveAvatarImageSrc("p99"), getAvatarSrc("p01"));
  assert.equal(getAvatarSrc("p07"), "/avatars/companions-v1/p07.svg");
});
