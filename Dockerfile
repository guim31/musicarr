FROM node:24-alpine AS base

# Dépendances système : ffmpeg pour le tagging, su-exec + shadow pour la
# bascule d'utilisateur au démarrage (usermod/groupmod ne sont pas dans busybox)
RUN apk add --no-cache ffmpeg flac su-exec shadow

# Install dependencies only when needed
FROM base AS deps
# better-sqlite3 expose un binding.gyp : npm lui ajoute un script d'installation
# `node-gyp rebuild` implicite et compile depuis les sources, même si le paquet
# fournit un binaire musl précompilé. La chaîne de compilation est donc requise.
# Elle reste confinée à cette étape : seul node_modules est copié ensuite.
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN npm ci

# Dev stage
FROM base AS development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=development
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# L'UID/GID réels sont ajustés au démarrage par l'entrypoint (PUID/PGID),
# afin de correspondre au propriétaire du partage musical sur le NAS.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/public ./public

# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Point de montage des données (base SQLite + pochettes)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# UID/GID sous lesquels tourne l'application. Par défaut nobody:users, le
# propriétaire des partages sur Unraid — la cible principale du projet.
# Le conteneur démarre root puis abandonne ses privilèges (docker-entrypoint.sh).
# Sur un autre hôte, surchargez via .env : stat -c '%u %g' /chemin/musique
ENV PUID=99
ENV PGID=100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
