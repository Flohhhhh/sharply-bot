# Build stage
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Production stage
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

RUN groupadd --system --gid 1001 bot && useradd --system --uid 1001 --gid bot bot

USER bot

CMD ["npm", "run", "start"]
