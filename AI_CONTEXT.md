# Musicarr - Contexte Technique & Architecture

Fichier de référence pour les outils d'IA pour comprendre la structure et le fonctionnement de Musicarr.

## 📝 Présentation
Musicarr est une alternative moderne à Lidarr, conçue avec la stack **Next.js (App Router)** et **TypeScript**. C'est un gestionnaire de bibliothèque musicale automatisé qui gère le scan, le tagging (métadonnées), la recherche multi-indexeurs et le téléchargement automatisé.

## 🏗️ Architecture Technique
- **Framework** : [Next.js](https://nextjs.org/) (App Router)
- **Langage** : [TypeScript](https://www.typescriptlang.org/)
- **Base de données** : SQLite (via `better-sqlite3`)
- **UI/Styling** : Vanilla CSS / Google Fonts / Lucide React (Icônes)
- **Déploiement** : Docker / Docker Compose

## 📂 Structure du Projet

### `/src` (Source)
- **`/app`** : Contient les routes de l'application (API et Pages). Utilise la structure standard de Next.js App Router.
- **`/services`** : Cœur de la logique métier (Services mono-responsabilité).
    - `DeemixService.ts` : Interaction avec Deemix pour le téléchargement direct.
    - `library.ts` : Gestion de la bibliothèque locale (artistes, albums, scans).
    - `prowlarr.ts` : Recherche via Prowlarr (Torrents/Usenet).
    - `sabnzbd.ts` : Enregistrement et suivi des téléchargements Usenet.
    - `tags.ts` : Manipulation des tags ID3 des fichiers audio.
    - **`/metadata`** : Moteur de métadonnées.
        - `MetadataEngine.ts` : Orchestre la récupération des données.
        - `SyncService.ts` : Synchronisation des données locales avec les sources externes.
- **`/lib`** : Utilitaires partagés et configuration système.
    - `db.ts` : Initialisation et accès à la base de données SQLite (`musicarr.db`).
    - `LogService.ts` : Système de logs centralisé.
- **`/components`** : Composants UI réutilisables (Tableaux, Modales, Cartes).
- **`/hooks`** : Hooks React personnalisés pour la gestion de l'état.

### ⚙️ Fichiers de Configuration
- `package.json` : Scripts (`dev`, `build`, `start`) et dépendances.
- `.env` : Variables d'environnement (API Keys, Chemins de dossiers).
- `Dockerfile` / `docker-compose.yml` : Configuration de l'environnement conteneurisé.
- `musicarr.db` : Fichier de base de données SQLite local.

## 🔗 Intégrations Externes
- **Prowlarr** : Recherche multi-indexeurs.
- **SABnzbd** : Téléchargement Usenet.
- **Deemix** : Téléchargement direct haute qualité.
- **MusicBrainz** : Source principale de métadonnées musicales.
- **Music-Metadata** : Librairie Node.js pour la lecture/écriture des tags ID3 locaux.

## 🛠️ Modules Externes Clés
- `better-sqlite3` : Driver SQLite performant et synchrone.
- `axios` : Client HTTP pour les appels API.
- `zod` : Validation de schémas (données API, formulaires).
- `lucide-react` : Bibliothèque d'icônes.

## 🚀 Flux de Fonctionnement
1. **Scan** : Le système scanne les dossiers définis dans `.env`.
2. **Tagging** : Les fichiers sont analysés (`music-metadata`) et leurs tags sont importés en base.
3. **Optimisation** : Les métadonnées manquantes sont complétées via `MetadataEngine` (MusicBrainz).
4. **Acquisition** : Recherche via `Prowlarr` -> Téléchargement via `SABnzbd` ou `Deemix`.
5. **Update** : `SyncService` maintient la cohérence entre les fichiers physiques et la base de données.

## 💡 Conseils pour l'IA
- Les services se trouvent dans `src/services` et utilisent souvent des méthodes statiques ou des singletons.
- La base de données est accessible via `lib/db.ts`. Le schéma peut être déduit des appels dans les services de bibliothèque.
- L'interface utilise principalement des composants côté client (`use client`) avec des appels API vers `/api/*`.
