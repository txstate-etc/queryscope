# queryscope
Client QueryScope token build time generator for TypeScript based GraphQL projects

## Overview
This library contains a QueryScope type that sets up queries to be signed. Included
is a typescript transformer that will utilize the private key `QUERYSCOPE_PRIVATE_KEY`,
issuer `QUERYSCOPE_ISSUER`, and client_id `QUERYSCOPE_CLIENT_ID` (i.e service)
environment variables to generate tokens for graphql QueryScope typed queries as part
of the build process. Dockerfiles may use ARG fields so that the key is not stored in
the image. This will generate a custom image per private key/service.

## Dependent application setup
This module utilizes transformers to inject tokens into QueryScope types at build time,
and thus the application utilizing this module will require the ttypescript module to
run the transformers.

### Add ttypescript to dependencies of typescript based application
The following package.json file will have something like the following:
```json
{
  "dependencies": {
    "@types/node": "^14.14.34",
    "queryscope": "^1.0.0",
    "ts-node": "^9.1.1",
    "ttypescript": "^1.5.8",
    "typescript": "^4.0.3",
  }
}
```

The following tsconfig.json file will add the transformer plugin like the following:
```json
{
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

### Add env.sh environment file
NOTE: This would be like a docker-compose.override.yml that has credentials that doesn't get checked into the repo.
```bash
#!/bin/bash
export DECRYPT_CMD="<decryption command here>"
export KEYS_DIR=${KEYS_DIR:-<queryscope key directory>}

# Example of how to generate RSA private and public keys for queryscope module usage
# mkdir -p "$KEYS_DIR/"
# echo "QSExampleIssuer" > "$KEYS_DIR/issuer.txt"
# openssl genrsa 2048 2>/dev/null >"$KEYS_DIR/private"
# cat "${KEYS_DIR}/private" | openssl rsa -outform PEM -pubout 2>/dev/null >"$KEYS_DIR/public"
# <encryption command here> "${KEYS_DIR}/private"

export QUERYSCOPE_PRIVATE_KEY="$($DECRYPT_CMD $KEYS_DIR/private)"
export QUERYSCOPE_ISSUER=$(cat $KEYS_DIR/issuer.txt)

# The QUERYSCOPE_CLIENT_ID may come from a file in the project, or pulled from the package.json
export QUERYSCOPE_CLIENT_ID=QSExampleClientId
```

## Building with queryscope

### Manual or local developer build
During development work the `tsc` command may be used which skips token generation if the application is setup to ignore queryscope verification for development environments. This makes for an easier development workflow and doesn't require the developers to have access to the queryscope issuer's private key. However if we wish to generate tokens in the build, once we import the queryscope module (or copy over the npm package) we can build with the typescript transformer command.
```bash
. env.sh
./node_modules/.bin/ttsc
```

### Docker build
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

This is what a docker-build.sh build script may look like (which could be replaced by a docker-compose.yml file):
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
