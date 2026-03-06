# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

ENV TZ=Asia/Tashkent
ENV NODE_ENV=production

RUN apk add --no-cache tzdata curl

# Dependencies
COPY --from=builder /app/node_modules ./node_modules

# Bot kodi
COPY . .

RUN mkdir -p logs

# Non-root user
RUN addgroup -S botgroup && adduser -S botuser -G botgroup \
 && chown -R botuser:botgroup /app
USER botuser

# Render.com PORT ni ochish
EXPOSE 3000

# Webhook rejimida ishlaydi (index.js auto-detect qiladi)
CMD ["node", "index.js"]
