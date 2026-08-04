# Audit technique — Musicarr

**Date :** 4 août 2026 · **Version auditée :** commit `f51016c` (+ travail non commité)
**Périmètre :** sécurité, architecture, qualité de code, performances, exploitation.

---

## Synthèse

Musicarr est un projet **cohérent et bien structuré pour son âge** : la séparation
`app` / `services` / `lib` est respectée, la couche métier ne fuit pas dans les
routes API, les conventions internes (`.agents/rules/`) sont réelles et suivies.
Le socle est sain.

Les problèmes se concentrent sur **la sécurité et l'absence de filet de sécurité
automatisé**, pas sur l'architecture. C'est cohérent avec un projet conçu pour
tourner sur un réseau domestique de confiance — mais plusieurs de ces points
deviennent critiques dès que le dépôt est publié ou l'application exposée.

| Domaine | État | Commentaire |
|---|---|---|
| Sécurité applicative | 🔴 Critique | RCE, aucune authentification, secrets en clair |
| Gestion des secrets | 🔴 Critique | Clés API réelles dans l'historique git |
| Exploitation / Docker | 🟠 À améliorer | Conteneur root, admin de base exposé |
| Architecture | 🟢 Correct | Séparation nette, motif provider bien appliqué |
| Qualité de code | 🟠 À améliorer | Lint inutilisable, 186 `any`, aucun test |
| Performances | 🟡 Acceptable | Aucun index SQL (corrigé), polling systématique |
| Documentation | 🟢 Correct | `AI_CONTEXT.md` et `.agents/rules/` de bonne tenue |

**Traité dans cette intervention :** 8 points sur 14
**Reste à traiter :** l'authentification, le chiffrement des secrets, les tests,
la validation d'entrées, la robustesse du scan, les sauvegardes.

---

## 1. Sécurité

### 1.1 🔴 Exécution de code arbitraire via les tags — **corrigé** ([#12](https://github.com/guim31/musicarr/pull/12))

`TagService` et `DeemixService` construisaient leurs commandes ffmpeg par
concaténation de chaînes, exécutées via `exec()` — donc **via un shell** :

```ts
`-metadata title="${update.title.replace(/"/g, '\\"')}"`
```

Seuls les guillemets doubles étaient échappés. À l'intérieur de guillemets
doubles, le shell interprète pourtant toujours `$(…)`, les backticks et `\`.

**Chemin d'attaque :** éditeur de tags de l'interface → `POST /api/albums/[id]/tags`
→ `TagService.updateTrackTags`. Également atteignable **sans interaction** via
les noms de pistes renvoyés par l'API Deezer lors d'un téléchargement.

**Impact :** exécution de commandes avec les droits du serveur — root dans
l'image actuelle. Vérifié par preuve d'exploitation : un titre
`Song $(touch /tmp/PWNED)` créait bien le fichier.

**Correctif :** `src/lib/ffmpeg.ts`, `execFile` avec un tableau d'arguments.
Aucun shell n'est impliqué.

### 1.2 🔴 Clés API réelles dans l'historique git — **corrigé**

Le fichier `data/musicarr.db` a été commité entre les commits `5ccd676` et
`bd6f1d3`. Les blobs contenaient, en clair :

| Secret | Portée |
|---|---|
| `prowlarr_api_key` | Accès complet à l'instance Prowlarr |
| `sabnzbd_api_key` | Ajout/suppression de téléchargements SABnzbd |
| `discogs_token` | Jeton personnel Discogs |
| URL et IP privée du NAS | Cartographie du réseau interne |

**Correctif :** historique réécrit (`git filter-branch`) avant toute publication,
sauvegarde intégrale conservée, `.gitignore` renforcé.

> ⚠️ **Action manuelle indispensable :** une clé ayant existé dans un dépôt doit
> être considérée comme compromise. **Régénérez les trois** dans Prowlarr,
> SABnzbd et Discogs. La réécriture protège des lectures futures, pas de ce qui
> aurait déjà pu être copié.

### 1.3 🔴 Aucune authentification — **ouvert**

L'application n'a aucun mécanisme d'authentification. Toute personne joignant le
port 3005 peut :

- lire les clés API en clair (`GET /api/sabnzbd`, `GET /api/prowlarr`, `GET /api/metadata`
  les renvoient telles quelles) ;
- déclencher des téléchargements ;
- **supprimer des artistes et leurs fichiers** (`DELETE /api/artists/[id]?deleteFiles=true`).

C'est acceptable sur un LAN de confiance, et c'est le choix par défaut de
plusieurs applications du même écosystème — mais cela doit être **un choix
conscient et documenté**, pas un impensé.

> **Recommandation.** Court terme : ne jamais exposer le port directement, et
> documenter la contrainte (fait dans le README). Moyen terme : un middleware
> Next.js avec un mot de passe unique et un cookie de session suffit largement
> pour un usage domestique — environ 100 lignes. Ne cherchez pas un OAuth
> complet pour un service mono-utilisateur.

### 1.4 🟠 Accès non contrôlés au système de fichiers — **corrigé** ([#13](https://github.com/guim31/musicarr/pull/13))

| Route | Problème |
|---|---|
| `GET /api/albums/[id]/cover` | Identifiant d'URL interpolé dans un chemin disque → traversée de répertoire |
| `GET /api/albums/[id]/cover` | Redirection vers une URL issue d'API externes → redirecteur ouvert |
| `DELETE /api/artists/[id]` | `rmSync` récursif sur un chemin lu en base, sans vérification |

Le troisième est le plus sérieux : un champ `path` corrompu — scan interrompu,
migration, saisie manuelle via `sqlite-web` — suffisait à faire supprimer
récursivement un dossier arbitraire.

### 1.5 🟠 Secrets en clair dans la base — **ouvert**

Les clés API, dont l'**ARL Deezer** (équivalent d'un cookie de session complet
sur le compte), sont stockées en clair dans la table `settings` et **renvoyées
telles quelles** par les routes GET correspondantes.

> **Recommandation.** Deux niveaux, du plus rentable au plus coûteux :
> 1. **Ne plus les renvoyer au client.** L'interface n'a besoin que de savoir si
>    la clé est configurée. Renvoyez `{ configured: true, hint: "…abcc" }` et
>    n'écrivez la valeur en base que si le client en envoie une nouvelle. Effort
>    faible, gain immédiat.
> 2. **Chiffrer au repos** avec une clé passée par variable d'environnement.
>    Utile surtout si la base peut être lue par ailleurs (sauvegardes, partage NAS).

### 1.6 🟠 Interface d'administration de la base exposée — **corrigé** ([#13](https://github.com/guim31/musicarr/pull/13))

`docker-compose.yml` démarrait `sqlite-web` **par défaut**, sans authentification,
sur `0.0.0.0:8090`. Soit un accès lecture/écriture anonyme à une base contenant
les clés API. Désormais en profil `debug`, lié à `127.0.0.1`.

### 1.7 🟠 Conteneur en root — **corrigé** ([#13](https://github.com/guim31/musicarr/pull/13))

`USER nextjs` avait été commenté (`551a69f`) pour que l'application puisse
réécrire les fichiers du partage NAS. Le besoin est légitime ; la solution ne
l'était pas — elle transformait le moindre défaut de traitement des métadonnées
en compromission totale (voir 1.1). Remplacé par le motif `PUID`/`PGID` habituel
des applications de NAS.

### 1.8 🟡 Messages d'erreur renvoyés bruts — **ouvert**

36 routes API renvoient `{ error: error.message }`. Ces messages contiennent des
chemins absolus, des extraits SQL et parfois des URL d'API avec paramètres.

> **Recommandation.** Un helper `apiError(e)` qui journalise le détail côté
> serveur et ne renvoie qu'un message générique — sauf pour les erreurs
> métier volontairement explicites (« ARL non configuré »).

---

## 2. Architecture

### 2.1 🟢 Ce qui est bien fait

- **Séparation des responsabilités respectée.** Les routes API sont fines et
  délèguent aux services. La règle « la logique appartient à `src/services` »
  de `.agents/rules/architecture.md` est réellement suivie — c'est rare.
- **Motif provider bien appliqué.** Les quatre sources de métadonnées
  (MusicBrainz, Discogs, Deezer, iTunes) partagent une interface commune, ce qui
  rend l'ajout d'une cinquième trivial.
- **Transactions correctement utilisées.** `saveAlbumTransaction` et
  `cleanupTransaction` encapsulent bien les écritures par lot du scan.
- **Cache des métadonnées.** `artist_cache` évite de marteler les API externes.
- **Documentation pour agents.** `.agents/rules/` et `AI_CONTEXT.md` sont
  précis et à jour — un vrai atout pour la maintenance.

### 2.2 🟡 Verrou de scan en mémoire — **ouvert**

```ts
private static isScanning = false;   // src/services/library.ts:17
```

Ce verrou est doublé d'un verrou en base (`settings.scan_progress`), ce qui est
la bonne idée — mais le verrou en base n'a **ni horodatage ni expiration**. Si le
processus meurt en plein scan, la clé subsiste. Le nettoyage au démarrage dans
`db.ts:136` traite ce cas, mais uniquement au redémarrage.

> **Recommandation.** Stocker un horodatage dans `scan_progress` et considérer un
> verrou de plus de N minutes sans progression comme périmé. Supprime le besoin
> du double verrou.

### 2.3 🟡 Journalisation en mémoire — **ouvert**

`LogService` conserve les logs dans un tableau en mémoire, perdus à chaque
redémarrage — c'est-à-dire précisément quand on en a besoin pour diagnostiquer
un plantage.

> **Recommandation.** Écrire aussi dans `data/musicarr.log` avec rotation simple.

### 2.4 🟡 Interrogation périodique généralisée — **ouvert**

Cinq composants interrogent le serveur toutes les 2 à 3 secondes
(`ToastContext`, page Activité, page Debug, page Réglages). Chaque appel ouvre
la base SQLite. C'est sans conséquence à l'échelle d'un usage domestique, mais
c'est du travail inutile en continu.

> **Recommandation.** Un unique flux SSE (`GET /api/events`) remplacerait les
> cinq boucles. Les *route handlers* Next.js gèrent nativement les `ReadableStream`.

---

## 3. Qualité de code

### 3.1 🟠 Lint inutilisable — **corrigé** ([#11](https://github.com/guim31/musicarr/pull/11))

**221 erreurs** avant intervention : impossible d'y repérer un vrai défaut, et
impossible d'en faire une étape bloquante. Un linter qui échoue toujours
n'apporte rien.

Le bruit a été reclassé en avertissements (186 `any`, apostrophes françaises) et
les **vrais défauts corrigés** — dont un accès à `removeToast` avant sa
déclaration dans `ToastContext`, qui ne fonctionnait que grâce au délai de 5 s du
`setTimeout`.

Résultat : **0 erreur**, 237 avertissements assumés et visibles.

### 3.2 🟠 Aucun test — **ouvert**

Zéro fichier de test dans le dépôt. Or le projet contient exactement le genre de
logique qui en réclame : normalisation et rapprochement de noms
(`CompareUtils`), extraction de numéro de piste depuis un nom de fichier,
détection de compilation, fusion des métadonnées multi-sources. Ce sont des
fonctions pures, faciles à tester, et dont les régressions sont silencieuses.

> **Recommandation.** Commencez par Vitest sur `CompareUtils` et la logique de
> rapprochement de `SyncService` — le meilleur rapport effort/bénéfice du projet.
> N'essayez pas de tester le scan de bout en bout.

### 3.3 🟡 `zod` déclaré mais jamais utilisé — **ouvert**

La dépendance est présente ; aucune route ne l'importe. Les corps de requête sont
déstructurés sans validation :

```ts
const { url, apiKey, action } = await request.json();
```

> **Recommandation.** Un schéma zod par route, appliqué en tête de handler.
> Supprime aussi une partie des `any` au passage.

### 3.4 🟡 186 `any` — **ouvert (dette assumée)**

Concentrés dans les providers de métadonnées et les lignes SQLite. Typer les
réponses d'API externes est fastidieux mais mécanique.

> **Recommandation.** Ne faites pas de grande campagne de typage. Typez au fil
> de l'eau, à chaque fois que vous touchez un fichier. Les avertissements de lint
> gardent la dette visible.

### 3.5 🟡 Code mort et trompeur — **ouvert**

`DeemixService.decryptBuffer` (ligne 100) porte un commentaire annonçant un
« mock » et retourne le buffer inchangé, alors que le vrai déchiffrement Blowfish
est implémenté plus bas dans `processDownloadStream`. Un lecteur — humain ou
agent — peut raisonnablement conclure que le déchiffrement n'est pas implémenté.

> **Recommandation.** Supprimer la fonction.

---

## 4. Performances

### 4.1 🟠 Aucun index SQL — **corrigé** ([#15](https://github.com/guim31/musicarr/pull/15))

Le schéma ne déclarait **aucun `CREATE INDEX`**. Deux requêtes très chaudes
faisaient un balayage complet de table, confirmé par `EXPLAIN QUERY PLAN` :

| Requête | Avant | Fréquence |
|---|---|---|
| `tracks WHERE path = ?` | `SCAN tracks` | Une fois **par fichier** pendant un scan |
| `albums WHERE status = ?` | `SCAN albums` | Pages Bibliothèque et Manquants |

Également indexés : `albums.path`, `activity.status`, `activity.timestamp`.

**À noter :** `albums(artist_id)` et `tracks(album_id)` semblaient manquer, mais
`EXPLAIN QUERY PLAN` montre qu'ils sont déjà couverts par les index implicites
des contraintes `UNIQUE`, dont ils sont le préfixe gauche. Les ajouter n'aurait
fait que ralentir les écritures pendant les scans. Vérifier avant d'indexer.

### 4.2 🟡 Rapprochement d'artistes en O(n) par album — **corrigé** ([#15](https://github.com/guim31/musicarr/pull/15))

`saveAlbumTransaction` chargeait **toute** la table `artists` en mémoire pour
chaque album dont le nom ne correspondait pas exactement, et recalculait la
normalisation de chaque nom à chaque fois.

L'index `nom normalisé → id` est désormais construit une fois par scan et tenu à
jour lors des insertions.

### 4.3 🟡 Le scan sort avant le nettoyage si aucun fichier n'est trouvé — **ouvert**

`library.ts:240` fait un `return 0` quand aucun fichier audio n'est trouvé, avant
d'appeler `cleanupTransaction`. Si le montage musical est temporairement absent
ou vide, les albums restent marqués `downloaded` avec des chemins qui n'existent
plus.

C'est sans doute volontaire — un garde-fou contre un montage manquant qui
viderait la base. Mais c'est implicite.

> **Recommandation.** Rendre l'intention explicite : journaliser un
> avertissement clair, et distinguer « dossier absent » (on ne touche à rien) de
> « dossier présent mais vide » (nettoyage légitime).

---

## 5. Exploitation et dépendances

### 5.1 🟠 9 vulnérabilités dans les dépendances — **corrigé** ([#13](https://github.com/guim31/musicarr/pull/13))

Dont 7 de sévérité haute (`next`, `axios`, `form-data`, `music-metadata`,
`brace-expansion`). Ramenées à **0**. Dependabot est désormais configuré pour
que la dérive ne se reproduise pas.

### 5.2 🟠 Dépendance `crypto` factice — **corrigé**

Le paquet npm `crypto` (une coquille vide de 2014) était déclaré et masquait le
module natif de Node. Supprimé.

### 5.3 🟡 Absence de sauvegarde de la base — **ouvert**

Un `musicarr.db.bak` traîne dans `data/`, visiblement copié à la main. La base
contient toute la correspondance entre fichiers et métadonnées : la reconstruire
demande un scan complet plus une resynchronisation de toutes les discographies.

> **Recommandation.** Une tâche planifiée exécutant `VACUUM INTO` (sûr même à
> chaud, contrairement à une copie de fichier en mode WAL), avec rotation sur
> 7 jours.

---

## 6. Ce qui a été mis en place

| Élément | Détail |
|---|---|
| Dépôt GitHub | [guim31/musicarr](https://github.com/guim31/musicarr), **privé** tant que les clés ne sont pas régénérées |
| Historique | Purgé de tout fichier de base ; sauvegarde intégrale hors dépôt |
| Branches | `main` (déployable) ← `dev` (intégration) ← branches éphémères |
| CI | Lint, types, build, image Docker, audit npm — sur chaque PR |
| Gabarits | Pull Request, rapport de bug, demande de fonctionnalité |
| Dependabot | npm, GitHub Actions et Docker, groupés, ciblant `dev` |
| Conventions | `CONTRIBUTING.md` : branches, commits, règles de sécurité |
| Protections | `scripts/setup-branch-protection.sh`, à lancer au passage en public ou en plan Pro |

---

## 7. Ordre de priorité recommandé

1. **Régénérer les trois clés API** (Prowlarr, SABnzbd, Discogs). Cinq minutes,
   et c'est le seul point que je ne peux pas faire à votre place.
2. **Ne plus renvoyer les clés au client** dans les routes GET (§1.5). Effort
   faible, gain immédiat.
3. **Authentification par mot de passe unique** (§1.3), avant toute exposition
   hors du réseau local.
4. **Premiers tests** sur `CompareUtils` et la logique de rapprochement (§3.2).
5. Le reste au fil de l'eau : validation zod, typage, SSE, sauvegardes.

---

*Audit réalisé par Claude Opus 5. Chaque constat de sécurité a été vérifié sur le
code — les points 1.1, 1.4 et 1.7 ont été reproduits avant correction.*
