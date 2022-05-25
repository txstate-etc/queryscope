# queryscope
Client QueryScope token build time generator for TypeScript based GraphQL projects

## Overview
This library contains a QueryScope type that sets up queries to be signed at build
time for a service that will be identified by the client_id in the authentication
token. The typescript transformer utilizes a private key `QUERYSCOPE_PRIVATE_KEY`,
issuer `QUERYSCOPE_ISSUER`, and client_id `QUERYSCOPE_CLIENT_ID` (i.e. service name)
environment variables to generate tokens for graphql QueryScope typed queries as part
of the build process. Dockerfiles may use ARG fields, so that the key is not stored
in the image. This will generate a custom image per private key/service. If these
environment variables are missing the transformer will print out a warning, but will
not error out. This is because developers may not have access to these keys, however
they may still want to be able to test their application against a development tier
backend with QueryScope turned off.

## Application Dependency setup
This module utilizes typescript transformers (codemods) to inject json webtokens into
QueryScope type token fields at build time. Because of this the application utilizing
this module will require the **ttypescript** module to run the transformers.

### Add ttypescript to dependencies of typescript based application
The **package.json** file will include something like the following:
```json
{
  ...
  "devDependencies": {
    "@types/mocha": "^9.0.0",
    "@types/node": "^14.14.34",
    "ts-node": "^9.1.1",
    "ttypescript": "^1.5.8",
    "typescript": "^4.0.3",
    "mocha": "^9.1.2"
  },
  "dependencies": {
    "queryscope": "^1.0.1",
  }
}
```

The ts-node module if run by mocha testing can be told to utilize ttypescript. This
is only a helpful feature when wanting queryscope module to sign queries during
testing. Otherwise this typescript config can be left out. The compiler options
should include where ttypescript can find the queryscope tokenizer. This will be
required for the build process to sign QueryScope typed constants and is required.
The following **tsconfig.json** file is an example of how to add the ts-node
compiler and the transformer plugin:
```json
{
  "ts-node": {
    "compiler": "ttypescript"
  },
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "declaration": true,
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "plugins": [
      {
        "transform": "./node_modules/queryscope/dist/transformers/tokenizer.js",
       	"type": "raw"
      }
    ]
  },
  "include": [
    "src"
  ]
}
```

### May utilize an env.sh environment file for key
Note that this env.sh could be replaced with a docker-compose.override.yml that has
credentials that don't get checked into the repo. The private key and client_id may
also be stored in a CI that builds the images. An example of how to generate the
fingerprint, which identifies the public key is also shown here. This may be helpful
when labeling docker containers to identify what public key is being used by that
image and if a container needs to be rebuilt should a new private key have been
issued. In the future a fingerprint may be required to identify the private key used
to generate the token, should multiple private keys be allowed. This would be the
case if their was a key rotation window.
```bash
#!/bin/bash
export DECRYPT_CMD="<decryption command here>"
export KEYS_DIR=${KEYS_DIR:-<queryscope key directory>}

# Example of how to generate RSA private and public keys for queryscope module usage
# mkdir -p "$KEYS_DIR/"
# echo "QSExampleIssuer" > "$KEYS_DIR/issuer.txt"
# openssl genrsa 3072 2>/dev/null >"$KEYS_DIR/private"
# cat "$KEYS_DIR/private" | openssl rsa -outform PEM -pubout 2>/dev/null >"$KEYS_DIR/public"
# ssh-keygen -yf "$KEYS_DIR/private" | ssh-keygen -E md5 -lf - >"$KEYS_DIR/fingerprint"
# <encryption command here> "${KEYS_DIR}/private"

export QUERYSCOPE_PRIVATE_KEY="$($DECRYPT_CMD $KEYS_DIR/private)"
export QUERYSCOPE_ISSUER=$(cat $KEYS_DIR/issuer.txt)
# export QUERYSCOPE_KEY_FINGERPRINT="$(cat $KEYS_DIR/fingerprint)"

# The QUERYSCOPE_CLIENT_ID may come from a file in the project, or pulled from the package.json
export QUERYSCOPE_CLIENT_ID=QSExampleClientId
```

## Building examples with queryscope

### Manual or local developer build
During development work the `tsc` command may be used which skips token generation
if the application is setup to ignore queryscope verification for development
environments. This makes for an easier development workflow and doesn't require the
developers to have access to the queryscope issuer's private key. However if we wish
to generate tokens in the build, once we import the queryscope module (or copy over
the npm package) we can build with the typescript transformer command. Notice that
we run the **env.sh** script first as the transformer will required the private key
and the client id environment variables set.
```bash
. env.sh
./node_modules/.bin/ttsc
```

### Docker build
The following is an example docker file. Note that the private key and client id are
setup as ARGs. This will first keep the private key from being stored in the image.
Second the ARGs will force the build process to provide the private key, client id
and issuer variables, otherwise it will bail out. This is necessary for a CI as the
transformer is designed to not error out if these variables are not set.
```Dockerfile
FROM node:14-alpine as build
RUN echo -e "\nADDING ARGUMENTS (for building):"
ARG QUERYSCOPE_PRIVATE_KEY
ARG QUERYSCOPE_CLIENT_ID
ARG QUERYSCOPE_ISSUER
WORKDIR /usr/app
COPY package.json package-lock.json ./
RUN npm ci
COPY src src
COPY tsconfig.json ./
RUN npm run build

FROM node:14-alpine
RUN echo -e "\nADDING ARGUMENTS (for testing):"
ARG QUERYSCOPE_CLIENT_ID
ARG QUERYSCOPE_ISSUER
WORKDIR /usr/app
COPY --from=build /usr/app/dist dist
COPY package.json package-lock.json ./
RUN npm ci --production
RUN npm run test
RUN echo -e "\nADDING ENVIRONMENT (for production image):"
ENV QUERYSCOPE_CLIENT_ID=$QUERYSCOPE_CLIENT_ID
ENV NODE_ENV='production'
RUN echo -e "\nADDING LABLES (for production image):"
LABEL queryscope-client-id=$QUERYSCOPE_CLIENT_ID
LABEL queryscope-issuer=$QUERYSCOPE_ISSUER
CMD [ "npm", "run", "start" ]
```

This is what a docker-build.sh build script may look like (which could also be replaced by a docker-compose.yml file):
```
#!/bin/bash
. env.sh
REGISTRY=registry.mydomain.local
APPLICATION=myapp
TAG=mytag
docker build --build-arg QUERYSCOPE_PRIVATE_KEY="$QUERYSCOPE_PRIVATE_KEY" \
	     --build-arg QUERYSCOPE_CLIENT_ID="$QUERYSCOPE_CLIENT_ID" \
	     --build-arg QUERYSCOPE_ISSUER="$QUERYSCOPE_ISSUER" \
	     -t $REGISTRY/$APPLICATION:$TAG .
```
The image will now include the generated tokens for all the QueryScope types found within the TypeScript code.
