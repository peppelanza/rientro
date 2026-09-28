# Rientro: Node server with SQLite (node:sqlite). No npm dependencies to install.
FROM node:22-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production \
    PORT=10000 \
    TRUST_PROXY=1 \
    DB_PATH=/var/data/rientro.db \
    UPLOAD_DIR=/var/data/uploads
EXPOSE 10000
CMD ["npm", "start"]
