#!/bin/sh
#
# Aligne l'utilisateur applicatif sur le propriétaire du partage musical, puis
# abandonne les privilèges root.
#
# L'application écrit dans les fichiers de la bibliothèque (tags, renommage) :
# elle doit donc tourner avec un UID/GID qui a les droits sur le montage.
# Sur Unraid, c'est nobody:users, soit PUID=99 / PGID=100.
#
# Le conteneur tournait auparavant en root en permanence — le moindre défaut
# dans le traitement des métadonnées s'exécutait alors avec tous les droits sur
# la bibliothèque.

set -e

PUID="${PUID:-1001}"
PGID="${PGID:-1001}"

if [ "$(id -u)" = "0" ]; then
    # Réaligne le groupe puis l'utilisateur applicatifs sur PUID/PGID.
    if [ "$(id -g nextjs)" != "$PGID" ]; then
        groupmod -o -g "$PGID" nodejs 2>/dev/null || addgroup -g "$PGID" appgroup 2>/dev/null || true
    fi
    if [ "$(id -u nextjs)" != "$PUID" ]; then
        usermod -o -u "$PUID" nextjs 2>/dev/null || true
    fi

    # Seul /app/data doit appartenir à l'utilisateur applicatif : la
    # bibliothèque musicale garde le propriétaire défini côté hôte.
    chown -R "$PUID:$PGID" /app/data 2>/dev/null || true

    echo "[entrypoint] Démarrage en tant que UID=$PUID GID=$PGID"
    exec su-exec "$PUID:$PGID" "$@"
fi

# Déjà non-root (par exemple via `user:` dans docker-compose) : on exécute tel quel.
echo "[entrypoint] Démarrage en tant que $(id -u):$(id -g)"
exec "$@"
