FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
RUN mkdir -p /data/inbox && chown -R node:node /data
USER node
EXPOSE 8080
VOLUME ["/data"]
CMD ["node","src/server.js"]
