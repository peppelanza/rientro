# Rientro: Node server with SQLite (node:sqlite). No npm dependencies to install.
FROM node:22-slim
# ffmpeg converts profile videos to a light MP4 and checks their length
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
ENV NODE_ENV=production \
    PORT=10000 \
    TRUST_PROXY=1 \
    DB_PATH=/var/data/rientro.db \
    UPLOAD_DIR=/var/data/uploads
EXPOSE 10000
CMD ["npm", "start"]
