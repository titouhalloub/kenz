# Kenz web + API (Express). Includes ffmpeg for the video channels pipeline.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Public (VITE_*) values are baked into the web bundle at build time.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_CHANNEL_SIGNING_PUBLIC_KEY
ARG VITE_CHANNEL_TRACKERS
ARG VITE_CHANNEL_STUN
ARG VITE_API_BASE_URL
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.ts"]
