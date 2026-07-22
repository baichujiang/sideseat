#!/bin/sh
set -eu

VERSION="2.45.4"
ARCHIVE_SHA256="090ec29491aad50aec10631bf6e62253fed733c50f3aab0f5ffc86bc170bdbef"
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TOOLS_DIR="$ROOT_DIR/.build-tools/xcodegen/$VERSION"
BINARY="$TOOLS_DIR/bin/xcodegen"

if [ -x "$BINARY" ]; then
  "$BINARY" version
  exit 0
fi

ARCHIVE=$(mktemp -t xcodegen.XXXXXX.zip)
EXTRACTED=$(mktemp -d -t xcodegen.XXXXXX)
trap 'rm -f "$ARCHIVE"; rm -rf "$EXTRACTED"' EXIT

curl --fail --location --silent --show-error \
  "https://github.com/yonaskolb/XcodeGen/releases/download/$VERSION/xcodegen.zip" \
  --output "$ARCHIVE"

ACTUAL_SHA256=$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')
if [ "$ACTUAL_SHA256" != "$ARCHIVE_SHA256" ]; then
  echo "XcodeGen archive checksum mismatch." >&2
  exit 1
fi

ditto -x -k "$ARCHIVE" "$EXTRACTED"
mkdir -p "$(dirname "$TOOLS_DIR")"
rm -rf "$TOOLS_DIR"
mv "$EXTRACTED/xcodegen" "$TOOLS_DIR"
"$BINARY" version
