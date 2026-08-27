# Contribuer à Musicarr

## Modèle de branches

Musicarr suit un **GitHub Flow enrichi** : deux branches permanentes, des branches
éphémères pour le travail en cours.

| Branche | Rôle | Protégée |
|---|---|---|
| `main` | État déployable. Reflète ce qui tourne en production (NAS). | ✅ |
| `dev` | Branche d'intégration. Toutes les fonctionnalités y sont fusionnées avant release. | ✅ |
| `feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*`, `perf/*` | Travail en cours, éphémère. | — |

```
feat/ma-fonctionnalite ──PR──▶ dev ──PR (release)──▶ main
```

### Règles

1. **Jamais de commit direct** sur `main` ni sur `dev` : tout passe par une Pull Request.
2. Une branche = un sujet. Si la PR dépasse ~400 lignes de diff, découpez-la.
3. La branche part toujours de `dev` à jour :
   ```bash
   git switch dev && git pull && git switch -c feat/ma-fonctionnalite
   ```
4. Avant d'ouvrir la PR, rebasez plutôt que de merger :
   ```bash
   git fetch origin && git rebase origin/dev
   ```
5. La CI (lint + types + build + image Docker) doit être verte pour fusionner.
6. Fusion en **squash merge** vers `dev` (historique linéaire et lisible).
7. Release : PR `dev` → `main`, en **merge commit** pour garder la traçabilité.
8. Publication Docker Hub : une fois la release fusionnée sur `main`, montez la
   version dans `package.json` si ce n'est pas déjà fait, puis posez un tag —
   le workflow `docker-publish` rejoue la CI et pousse l'image
   `guilhem31/musicarr` (tags `latest`, `vX.Y.Z` et SHA court) :
   ```bash
   git switch main && git pull
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
   C'est le tag `latest` qui permet à Unraid de détecter les mises à jour
   du container. Prérequis (une seule fois) : les secrets `DOCKERHUB_USERNAME`
   et `DOCKERHUB_TOKEN` dans les réglages GitHub du dépôt.

## Convention de commits

[Conventional Commits](https://www.conventionalcommits.org/fr/) :

```
<type>(<portée optionnelle>): <description à l'impératif>
```

Types utilisés : `feat`, `fix`, `perf`, `refactor`, `docs`, `chore`, `test`, `ci`, `style`.

Exemples :
```
feat(library): scan incrémental par dossier
fix(deemix): gérer les ARL expirés (403)
chore(deps): monter Next.js en 16.3.0
```

## Mise en route

```bash
npm install
cp .env.example .env   # puis ajustez MUSIC_DIR
npm run dev            # http://localhost:3000
```

Ou en conteneur :

```bash
docker compose -f docker-compose.dev.yml up --build   # http://localhost:3005
```

## Avant de pousser

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Les tests tournent sous le « type stripping » natif de Node, sans dépendance ni
étape de compilation. Ils vivent dans `tests/` et importent les sources avec
leur extension `.ts`. Toute logique pure de rapprochement — normalisation,
regroupement des éditions, traduction des types de sortie — doit être couverte :
ses régressions sont silencieuses.

## Sécurité — à ne jamais faire

- ❌ Committer `data/`, un fichier `.db`/`.sqlite`, ou un `.env`.
  La base contient les **clés API en clair** (Prowlarr, SABnzbd, Discogs, ARL Deezer).
- ❌ Écrire une adresse IP privée, un identifiant ou une clé dans le code ou la doc :
  utilisez une variable d'environnement (voir `.env.example`).
- ❌ Construire une commande shell par concaténation de chaînes.
  Utilisez `execFile` avec un tableau d'arguments (cf. `src/lib/ffmpeg.ts`).

Si une clé fuite malgré tout : révoquez-la immédiatement côté service,
puis purgez l'historique (`git filter-repo`) avant tout push.
