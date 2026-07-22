#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$ROOT_DIR/.." && pwd)
VERSION="1.13.0"
BINARY="$ROOT_DIR/.build-tools/swift-openapi-generator/$VERSION/source/.build/release/swift-openapi-generator"
OUTPUT_DIR="$ROOT_DIR/SideSeat/Generated/OpenAPI"
TEMP_DIR=$(mktemp -d -t sideseat-openapi.XXXXXX)
DIAGNOSTICS="$TEMP_DIR/diagnostics.yaml"
trap 'rm -rf "$TEMP_DIR"' EXIT

"$ROOT_DIR/scripts/bootstrap-swift-openapi-generator.sh" >/dev/null
"$BINARY" generate \
  --config "$ROOT_DIR/openapi-generator-config.yaml" \
  --diagnostics-output-path "$DIAGNOSTICS" \
  --output-directory "$TEMP_DIR" \
  "$REPOSITORY_ROOT/openapi/v1.json"

if ! grep -q '^diagnostics: \[\]$' "$DIAGNOSTICS"; then
  cat "$DIAGNOSTICS" >&2
  exit 1
fi
rm -f "$DIAGNOSTICS"

rm -rf "$OUTPUT_DIR"
mkdir -p "$(dirname "$OUTPUT_DIR")"
mv "$TEMP_DIR" "$OUTPUT_DIR"
trap - EXIT
