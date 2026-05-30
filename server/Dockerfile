FROM node:22-alpine

WORKDIR /app

# Bring in the frontend's shared math module (server imports from
# ../src/casino/math.js + ../src/state/config.js).
COPY src ./src
COPY server ./server

WORKDIR /app/server

RUN npm install --omit=dev

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/data/casino.sqlite

EXPOSE 4000
VOLUME ["/data"]

CMD ["node", "index.js"]
