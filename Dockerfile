# Build the frontend
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime: server + built frontend only
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 PM_DB_PATH=/data/data.db PM_BACKUP_DIR=/data/backups
COPY server/package.json server/package-lock.json server/
RUN npm --prefix server ci --omit=dev
COPY server server
COPY --from=build /app/dist dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3001
CMD ["node", "server/index.js"]
