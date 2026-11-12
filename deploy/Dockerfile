FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build --workspace @workflow/api && npm run build --workspace @workflow/web

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app /app
COPY --chown=node:node deploy /app/deploy
ARG RELEASE_SHA
RUN test "${#RELEASE_SHA}" = 40
ENV RELEASE_SHA=$RELEASE_SHA
LABEL org.opencontainers.image.revision=$RELEASE_SHA
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "deploy/start.ts"]
