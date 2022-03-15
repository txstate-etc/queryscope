#!/bin/bash
DEPLOY_DIR=${1:-local_modules}
rm -rf "$DEPLOY_DIR"/queryscope-*.tgz dist/
npm run build && npm pack --pack-destination ./
mkdir -p "$DEPLOY_DIR/"
mv queryscope-*.tgz  "$DEPLOY_DIR/"
