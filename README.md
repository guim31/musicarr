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
