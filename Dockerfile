from node:18-alpine as build

COPY index.js package.json package-lock.json ./

RUN npm ci && \
    npm prune

from node:18-alpine 

WORKDIR /app

COPY --from=build index.js package.json package-lock.json ./
COPY --from=build ./node_modules ./node_modules

CMD [ "node", "index.js" ]