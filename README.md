# Musicarr

Musicarr est une alternative moderne à Lidarr pour la gestion de votre bibliothèque musicale, conçue pour être performante, simple et élégante.

## Fonctionnalités

- 🎵 **Analyse de bibliothèque** — scan des fichiers locaux avec détection des
  compilations, repli sur l'arborescence quand les tags manquent, et
  rapprochement tolérant aux variantes de casse et de ponctuation.
- 🔍 **Métadonnées multi-sources** — MusicBrainz, Discogs, Deezer et iTunes,
  fusionnées avec priorité par type de sortie et mises en cache.
- 📥 **Téléchargement** — Prowlarr (recherche), SABnzbd (Usenet) et Deemix
  (téléchargement direct Deezer, FLAC compris).
- 🏷️ **Édition des tags** — éditeur intégré, suggestions de pochettes et de
  tags, réorganisation physique des fichiers après modification.
- 📊 **Suivi en direct** — journal d'activité et notifications de progression
  pour les scans, synchronisations et téléchargements.
- 🐳 **Docker** — déploiement sur NAS Unraid via Docker Compose.

## Installation rapide

```bash
git clone https://github.com/guim31/musicarr.git
cd musicarr
cp .env.example .env      # puis ajustez MUSIC_DIR, PUID et PGID
docker compose up -d
```

L'application est alors accessible sur
[http://localhost:3005](http://localhost:3005).

Rendez-vous ensuite dans **Réglages** pour indiquer le chemin de la
bibliothèque et vos clés API, puis lancez un premier scan.

### Développement

```bash
npm install
npm run dev               # http://localhost:3000
```

Ou en conteneur, avec rechargement à chaud :

```bash
docker compose -f docker-compose.dev.yml up --build
```

## Configuration Docker

Copiez `.env.example` vers `.env` puis ajustez :

| Variable | Défaut | Rôle |
|---|---|---|
| `MUSIC_DIR` | `/mnt/user/data/media/music` | Dossier musique monté dans le conteneur |
| `PUID` / `PGID` | `99` / `100` | UID/GID sous lesquels tourne l'application |

**`PUID`/`PGID` doivent correspondre au propriétaire de votre dossier musique**,
sinon Musicarr ne pourra pas réécrire les tags ni réorganiser les fichiers.
Sur Unraid, c'est `nobody:users`, soit `99:100`. Pour le trouver :

```bash
stat -c '%u %g' /chemin/vers/votre/musique
```

Le conteneur démarre en root le temps d'aligner cet utilisateur, puis abandonne
ses privilèges : l'application elle-même ne tourne **jamais** en root.

### Administration de la base

Le service `sqlite-web` n'a aucune authentification et la base contient vos
**clés API en clair**. Il est donc désactivé par défaut et lié à `127.0.0.1`.
Pour l'ouvrir ponctuellement :

```bash
docker compose --profile debug up sqlite-web
```

## Sécurité

Musicarr n'a **pas de système d'authentification**. Toute personne pouvant
joindre le port 3005 peut lire vos clés API et déclencher des téléchargements.
Ne l'exposez jamais directement sur Internet : gardez-le sur votre réseau local,
ou placez-le derrière un reverse proxy assurant l'authentification.

## Structure du projet

| Chemin | Rôle |
|---|---|
| `src/app` | Routes et pages (Next.js App Router) ; `src/app/api` pour les routes API |
| `src/services` | Logique métier — un service par responsabilité |
| `src/services/metadata` | Moteur de métadonnées et providers (MusicBrainz, Discogs, Deezer, iTunes) |
| `src/lib` | Utilitaires partagés — base de données, journalisation, chemins, ffmpeg |
| `src/components` | Composants d'interface réutilisables |
| `.agents/rules` | Conventions du projet (source de vérité pour les agents IA) |

Détails techniques dans [`AI_CONTEXT.md`](./AI_CONTEXT.md), conventions de
contribution dans [`CONTRIBUTING.md`](./CONTRIBUTING.md), état technique du
projet dans [`AUDIT.md`](./AUDIT.md).

## Stack

Next.js 16 (App Router) · TypeScript · SQLite (`better-sqlite3`) · CSS Modules ·
ffmpeg pour l'écriture des tags.

## Feuille de route

Les bases sont en place (scan, métadonnées, téléchargement, tags). Les
prochains chantiers, par priorité — voir [`AUDIT.md`](./AUDIT.md) :

- [ ] Authentification (mot de passe unique) avant toute exposition hors LAN
- [ ] Chiffrement des clés API au repos
- [ ] Tests automatisés sur la logique de rapprochement
- [ ] Validation des entrées d'API avec zod
- [ ] Flux SSE en remplacement des interrogations périodiques
- [ ] Sauvegarde automatique de la base
