# Musicarr

Musicarr est une alternative moderne à Lidarr pour la gestion de votre bibliothèque musicale, conçue pour être performante, simple et élégante.

## Fonctionnalités (En cours de développement)
- 🎵 **Analyse de bibliothèque** : Scan intelligent de vos fichiers locaux.
- 🔍 **Recherche multi-indexeurs** : Support de Prowlarr et d'autres services populaires.
- 📥 **Téléchargement automatisé** : Intégration avec Usenet (SABnzbd) et Torrents.
- 💎 **Qualité Premium** : Priorité au format FLAC.
- 🐳 **Docker-Ready** : Installation facile sur NAS Unraid via Docker Compose.

## Installation Rapide (Développement)

Pour tester l'application sur votre environnement de développement :

1. Assurez-vous d'avoir Docker et Docker Compose installés.
2. Lancez le projet :
   ```bash
   docker-compose up
   ```
3. L'application sera accessible sur : [http://localhost:3005](http://localhost:3005)

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
- `src/app` : Routes et pages via Next.js App Router.
- `src/components` : Composants UI réutilisables.
- `src/app/globals.css` : Système de design global.
- `Dockerfile` & `docker-compose.yml` : Configuration pour le déploiement.

## Roadmap
- [ ] Implémenter le scanner de fichiers locaux.
- [ ] Connecter l'API Prowlarr pour la recherche.
- [ ] Intégration API SABnzbd pour le push des téléchargements.
- [ ] Support de MusicBrainz pour le metadata tagging.
