#!/bin/zsh
cd "$(dirname "$0")"
mkdir -p dist
rm -f dist/skct-practice.zip
zip -r dist/skct-practice.zip \
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
open dist
echo "업로드할 파일: $(pwd)/dist/skct-practice.zip"
