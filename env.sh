#!/bin/bash
# The QUERYSCOPE_CLIENT_ID may come from a file in the project, or pulled from the package.json
export QUERYSCOPE_CLIENT_ID=QSClientId
export QUERYSCOPE_ISSUER=QSIssuer
export QUERYSCOPE_PRIVATE_KEY="$(openssl genrsa 3072 2>/dev/null)"
export QUERYSCOPE_PUBLIC_KEY="$(echo "$QUERYSCOPE_PRIVATE_KEY" | openssl rsa -outform PEM -pubout 2>/dev/null)"
#ssh-keygen -yf "${KEYS_DIR}/private" | ssh-keygen -E md5 -lf - >"$KEYS_DIR/fingerprint"
#export QUERYSCOPE_KEY_FINGERPRINT="$(cat $KEYS_DIR/fingerprint)"
