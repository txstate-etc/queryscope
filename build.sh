#!/bin/bash
DEPLOY_DIR=${1:-local_modules}
mkdir -p "${DEPLOY_DIR}"
rm -rf "$DEPLOY_DIR"/queryscope-*.tgz dist/
npm run build && npm pack --pack-destination ./
mkdir -p "$DEPLOY_DIR/"
mv queryscope-*.tgz  "$DEPLOY_DIR/"
