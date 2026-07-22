#!/bin/sh
set -eu

VERSION="1.13.0"
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CHECKOUT="$ROOT_DIR/.build-tools/swift-openapi-generator/$VERSION/source"
BINARY="$CHECKOUT/.build/release/swift-openapi-generator"

if [ -x "$BINARY" ]; then
  echo "swift-openapi-generator $VERSION"
  exit 0
fi

mkdir -p "$(dirname "$CHECKOUT")"
rm -rf "$CHECKOUT"
git -c advice.detachedHead=false clone \
  --branch "$VERSION" \
  --depth 1 \
  https://github.com/apple/swift-openapi-generator.git \
  "$CHECKOUT"

swift build \
  --package-path "$CHECKOUT" \
  --configuration release \
  --product swift-openapi-generator

echo "swift-openapi-generator $VERSION"
