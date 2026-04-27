#!/bin/bash
# bump-version.sh — Increment APP_VERSION + sync to index.html
# Run before every git commit to keep cache busting in sync

set -e

# Read current version from config.js
OLD_VERSION=$(grep "APP_VERSION:" js/core/config.js | sed -E "s/.*'([0-9.]+)'.*/\1/")
echo "Current version: $OLD_VERSION"

if [ -z "$1" ]; then
  echo "Usage: ./bump-version.sh <new_version>"
  echo "Example: ./bump-version.sh 2.7.9"
  exit 1
fi

NEW_VERSION=$1
echo "New version: $NEW_VERSION"

# Update config.js
sed -i.bak "s/APP_VERSION: '$OLD_VERSION'/APP_VERSION: '$NEW_VERSION'/" js/core/config.js
rm -f js/core/config.js.bak

# Update index.html cache-bust query strings
sed -i.bak "s/?v=$OLD_VERSION/?v=$NEW_VERSION/g" index.html
rm -f index.html.bak

echo "Updated:"
echo "  ✓ js/core/config.js"
echo "  ✓ index.html (cache-bust)"
echo ""
echo "Next: git add -A && git commit -m \"v$NEW_VERSION\" && git push"
