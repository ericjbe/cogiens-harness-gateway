ARG BASE_IMAGE=node:24-alpine
FROM ${BASE_IMAGE}
USER root
RUN if command -v apk >/dev/null 2>&1; then apk add --no-cache git; else apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*; fi
WORKDIR /app
COPY . ./
USER node
EXPOSE 8787
CMD ["node", "apps/gateway/src/server.mjs"]
