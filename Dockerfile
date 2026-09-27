FROM node:20-alpine

# @libsql/client ships prebuilt binaries, so no build tools are needed
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY . .

# Render/Railway provide PORT; production data lives in Turso (see render.yaml)
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
