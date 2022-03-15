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
At this time for testing we are using local_modules to store the QueryScope module, however, as an npm package that will not be necessary.

The following package.json file will have something like the following:
```json
{
  "dependencies": {
    "@types/node": "^14.14.34",
    "queryscope": "file:./local_modules/queryscope-0.1.3.tgz",
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


### Add environment file
NOTE may wish to add this file to `.gitignore`:
```bash
#!/bin/bash
PRIVATE_KEY_FILE=${PRIVATE_KEY_FILE:-~/<location>/queryscope/private}
export QUERYSCOPE_PRIVATE_KEY="$(<unencrypt-tool> $PRIVATE_KEY_FILE)"
export QUERYSCOPE_ISSUER=$(cat $PRIVATE_KEY_FILE.issuer_name.txt)
export QUERYSCOPE_CLIENT_ID=$(cat ./application_name.txt)

## Build

### Manual or local developer build
During development work the `tsc` command may be used which skips token generation if the application is setup to ignore queryscope verification for development environments. This makes for an easier development workflow and doesn't require the developers to have access to the queryscope issuer's private key. However if we wish to generate tokens in the build, once we import the queryscope module (or copy over the npm package) we can build with the typescript transformer command.
```bash
. env.sh
./node_modules/.bin/ttsc
```

### Docker build
At this time for testing we are pulling in the local_modules directory where we store the QueryScope npm package. When using npm install to download queryscope package these steps may be removed.
```Dockerfile
Dockerfile 
FROM node:14-alpine as build
ARG QUERYSCOPE_PRIVATE_KEY
ARG QUERYSCOPE_CLIENT_ID
ARG QUERYSCOPE_ISSUER
WORKDIR /usr/app
COPY package.json package-lock.json ./
COPY local_modules local_modules
RUN npm ci
COPY src src
#COPY test test
COPY tsconfig.json ./
RUN npm run build
#RUN npm test

FROM node:14-alpine
ENV QUERYSCOPE_VERSION=0.1.3
WORKDIR /usr/app
#RUN mkdir -p /usr/app/src/static
#COPY src/static ./src/static
COPY --from=build /usr/app/dist dist
COPY package.json package-lock.json ./
COPY local_modules local_modules
RUN npm ci --production
RUN npm test
ENV NODE_ENV='production'
ENV TZ='America/Chicago'
ENTRYPOINT [ "npm" ]
CMD [ "start" ]
```

This is what a docker-build.sh build script may look like:
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
