#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
"$ROOT_DIR/scripts/bootstrap-xcodegen.sh" >/dev/null
"$ROOT_DIR/.build-tools/xcodegen/2.45.4/bin/xcodegen" \
  generate \
  --spec "$ROOT_DIR/project.yml" \
  --project "$ROOT_DIR"
