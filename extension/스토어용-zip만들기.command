#!/bin/zsh
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p dist
rm -f dist/skct-practice.zip
STAGE="$(mktemp -d)"
cp extension/manifest.json extension/background.js "$STAGE/"
cp -R extension/icons "$STAGE/icons"
cp FE/index.html FE/styles.css FE/app.js FE/firebase-config.js FE/privacy.html "$STAGE/"
cp -R FE/vendor "$STAGE/vendor"
(
  cd "$STAGE"
  zip -r "$ROOT/dist/skct-practice.zip" \
    manifest.json \
    background.js \
    index.html \
    styles.css \
    app.js \
    firebase-config.js \
    privacy.html \
    icons/icon16.png \
    icons/icon48.png \
    icons/icon128.png \
    vendor/firebase-app-compat.js \
    vendor/firebase-auth-compat.js \
    vendor/firebase-firestore-compat.js
)
rm -rf "$STAGE"
open "$ROOT/dist"
echo "업로드할 파일: $ROOT/dist/skct-practice.zip"
