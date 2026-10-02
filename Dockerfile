FROM node:24-alpine AS build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# server.js serves the build under /Nexus/ and redirects / there, so the asset URLs baked
# into the HTML must carry the same prefix. Without this the build emits /assets/... and
# every script and stylesheet 404s behind the proxy.
ENV BASE_PATH=/Nexus/
RUN npm run build

FROM node:24-alpine

ENV PORT=8080
WORKDIR /app
COPY --from=build /app/frontend/dist/ ./frontend/dist/
COPY server.js ./server.js

EXPOSE 8080
CMD ["node", "server.js"]
