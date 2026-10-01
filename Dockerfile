FROM node:24-alpine AS build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine

ENV PORT=8080
COPY --from=build /app/frontend/dist/ /usr/share/nginx/html/Nexus/
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080
