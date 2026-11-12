# Match @playwright/test in the root lockfile; browsers and OS dependencies are preinstalled.
FROM node:24-bookworm-slim AS node-runtime
FROM mcr.microsoft.com/playwright:v1.60.0-noble
COPY --from=node-runtime /usr/local/ /usr/local/
WORKDIR /work
