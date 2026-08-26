# Audit fonctionnel — Musicarr

**Date :** 26 août 2026 · **Version auditée :** `dev` @ `0afa603` (v0.2.0)
**Périmètre :** fonctionnalités livrées, parcours utilisateur, et diagnostic
approfondi de la récupération des discographies.

Complète l'audit technique ([`AUDIT.md`](./AUDIT.md), 4 août 2026) qui traitait
sécurité, dépendances et qualité de code. Le présent document ne les rejoue pas :
il regarde **ce que l'application fait**, pas comment elle est écrite.

---

## Synthèse

Le socle technique est sain — c'était déjà la conclusion de l'audit précédent.
Le problème est ailleurs : **Musicarr fait très bien la moitié de son travail.**

La moitié qui marche, c'est la partie « miroir du disque » : scanner,
indexer, éditer les tags, réorganiser les fichiers, télécharger à la demande.
C'est solide, bien transactionnel, et ça répond au besoin.

La moitié qui manque, c'est la partie « catalogue » : savoir ce qui **existe**
en face de ce qu'on possède. Or c'est précisément ce qui distingue un
gestionnaire de bibliothèque d'un simple indexeur — et c'est exactement là que
se logent les symptômes que vous décrivez sur les discographies.

| Domaine | État | Commentaire |
|---|---|---|
| Scan & indexation locale | 🟢 Solide | Transactions, détection de compilations, replis sur l'arborescence |
| Édition de tags / pochettes | 🟢 Solide | ffmpeg sans shell, réorganisation physique, aperçu avant application |
| Téléchargement Deemix | 🟢 Solide | Reprise, sauvegarde avant mise à niveau, restauration en cas d'échec |
| Recherche & acquisition | 🟠 Incomplet | Torrents affichés mais non téléchargeables, deux routes divergentes |
| Import automatique | 🟠 Fragile | Ne tourne que si un navigateur est ouvert |
| **Discographies** | 🔴 **Défaillant** | **Cause n° 1 des symptômes constatés — détaillé en partie 2** |
| Albums manquants | 🔴 Non fonctionnel | Ne peut structurellement lister que des albums perdus, jamais des albums jamais possédés |
| Surveillance / automatisation | 🔴 Absent | `monitored` n'est lu nulle part, aucune acquisition automatique |

**Le fil conducteur :** une discographie distante n'est jamais transformée en
données. Elle reste un blob JSON de cache, rapproché à la volée par comparaison
de chaînes, à chaque affichage. Tout ce qui devrait en découler — la liste des
manquants, la surveillance, l'acquisition automatique, la fiabilité du
rapprochement — s'écroule en cascade.

---

# Partie 1 — Audit général des fonctionnalités

## 1.1 Ce qui fonctionne bien

Il faut le dire avant le reste, parce que c'est réel et que ça a coûté du travail.

- **Le scan est robuste.** `LibraryService.scan` regroupe par répertoire avant de
  décider, ce qui permet une vraie détection de compilation (plusieurs artistes,
  même album, pas d'`albumartist` cohérent) plutôt qu'une heuristique par
  fichier. Les replis sont sensés : tag manquant → nom de dossier, titre
  générique → nom de fichier, numéro de piste absent → préfixe numérique du nom
  de fichier. Les écritures passent par des transactions.
- **L'édition de tags est sûre.** Depuis le correctif d'injection shell,
  `runFfmpeg` passe par `execFile` avec un tableau d'arguments. L'écriture se
  fait dans un fichier temporaire puis renomme — pas de fichier corrompu à
  mi-parcours.
- **Le téléchargement Deemix est le module le plus abouti du projet.** Trois
  tentatives par piste, sauvegarde des fichiers existants en `.upgrade_backup`
  avant une mise à niveau, restauration automatique si le téléchargement échoue,
  remux ffmpeg pour la compatibilité Navidrome, scan de la destination à la fin.
  C'est du travail sérieux.
- **La résolution de dossiers évite les doublons physiques.**
  `DeemixService.findExistingPath` retrouve un dossier existant malgré les
  différences de casse, d'underscores et de ponctuation, au lieu d'en créer un
  second à côté.
- **Le suivi d'activité est cohérent.** Toute opération longue crée une ligne
  `activity` avec progression, et les activités `processing` orphelines sont
  marquées en échec au redémarrage.

## 1.2 🔴 La boucle « \*arr » n'est pas fermée

`.agents/rules/concept.md` annonce le cycle : *Import → Enrich → **Monitor** →
**Acquire***. Les deux dernières étapes n'existent pas dans le code.

| Élément | État réel |
|---|---|
| `artists.monitored`, `albums.monitored` | Colonnes créées (`src/lib/db.ts:42`, `:59`) — **lues nulle part** |
| Statut `'wanted'` | Documenté dans le schéma — **jamais écrit** |
| Insertion d'un album distant en base | **N'existe pas.** Le seul `INSERT INTO albums` du projet est celui du scan (`src/services/library.ts:96`) |
| Recherche automatique des manquants | Absente |

Le badge « Surveillé » de la fiche artiste est écrit en dur dans le JSX
(`src/app/library/artist/[id]/page.tsx:230`). Il ne reflète aucun état.

### Conséquence directe : la page « Albums manquants » ne peut pas fonctionner

Un album n'entre en base que si le scan a trouvé ses fichiers. Il passe en
`'missing'` uniquement quand `cleanupTransaction` constate leur disparition
(`src/services/library.ts:192`). Donc :

> **« Albums manquants » ne liste que les albums que vous avez eus puis perdus.**
> Un album de votre artiste préféré que vous n'avez jamais téléchargé n'y
> apparaîtra jamais.

Idem pour le compteur `missing_count` de la page Artistes
(`src/app/api/artists/route.ts:11`) : structurellement proche de zéro.

C'est le point le plus important de cet audit après les discographies, et les
deux ont la même racine (voir §2.5, recommandation R1).

## 1.3 🟠 Acquisition : deux chemins divergents, et une impasse

**Deux routes font le même métier, différemment :**

| | `POST /api/download` | `POST /api/search/download` |
|---|---|---|
| Utilisée par | `src/app/search/page.tsx:51` | `SearchModal` (fiche artiste, manquants) |
| Lien avec un album local | Non | Oui (`albumId`) |
| Ligne d'activité Usenet créée | Non | Oui, avec `nzo_id` |
| Détection de mise à niveau | Non | Oui (`isUpgrade`) |

La recherche globale est donc la version dégradée : pas de suivi de
progression rattaché à l'album, pas d'indication de mise à niveau.

**Bug concret :** `src/app/api/download/route.ts:15` et `:28` testent
`if (success)` sur une valeur qui est un **objet** — `DeemixService.downloadAlbum`
retourne `{ success, activityId }` et `SabnzbdService.addNzbFromUrl` retourne
`{ success, ids }`. Un objet est toujours *truthy* : la route **répond toujours
« succès »**, y compris quand SABnzbd a refusé le NZB.

**Impasse torrents :** `ProwlarrService.search` interroge les catégories audio
sans filtrer le protocole, et le commentaire ligne 87 confirme que c'est
volontaire (« ré-inclure les torrents (YGG) »). Les torrents s'affichent donc
dans les résultats — mais les deux routes de téléchargement les refusent
explicitement. L'utilisateur clique sur un résultat parfaitement valide et reçoit
une erreur.

> **Recommandation.** Fusionner les deux routes sur l'implémentation la plus
> complète (`/api/search/download`), corriger le test de succès, et soit masquer
> les résultats torrent, soit les griser avec une infobulle « client torrent non
> configuré ». Un résultat non actionnable est pire qu'un résultat absent.

## 1.4 🟠 L'import automatique dépend d'un navigateur ouvert

`ImportService.processSabnzbdDownloads()` — qui récupère les téléchargements
SABnzbd terminés, les déplace dans la bibliothèque, applique les permissions et
déclenche un scan — n'est appelé qu'à un seul endroit : en **effet de bord d'un
`GET`**, au tout début de `src/app/api/activity/route.ts:9`.

Deux problèmes :

1. **Un `GET` qui déplace des fichiers sur le disque.** Ce n'est pas seulement
   une entorse à la sémantique HTTP : n'importe quel préchargement de lien,
   sonde de supervision ou rechargement de page déclenche un import.
2. **Aucun import si personne ne regarde.** Fermez l'onglet : les
   téléchargements SABnzbd s'accumulent dans `_A_TRIER` indéfiniment. C'est le
   scénario nominal d'une application de NAS — elle tourne sans surveillance.

Le garde-fou `if (activeSync) return;` (ligne 36) ajoute un cas d'oubli
silencieux : une synchronisation d'artiste en cours suspend tous les imports, et
rien ne les reprend une fois la synchronisation finie.

> **Recommandation.** Un `setInterval` unique côté serveur (module d'init, ou
> route `instrumentation.ts` de Next), toutes les 60 s, indépendant de l'UI. Le
> verrou `isProcessing` existant suffit à éviter la réentrance.

## 1.5 🟡 Le verrou de scan avale silencieusement les scans post-téléchargement

`LibraryService.scan` retourne `0` immédiatement si un scan est déjà en cours
(`src/services/library.ts:230`). Comme le scan de fin de téléchargement Deemix
(`DeemixService.ts:302`) et celui de fin d'import (`ImportService.ts:233`)
passent par la même méthode, un album fraîchement téléchargé pendant un scan
complet **n'est jamais indexé**. Il faudra un scan manuel pour qu'il apparaisse.

> **Recommandation.** Mettre en file les demandes de scan ciblé plutôt que de les
> rejeter, ou au minimum enregistrer les chemins refusés pour les rejouer à la
> fin du scan en cours.

## 1.6 🟡 Points mineurs relevés

- **`albums.mbid` / `albums.discogs_id` ne sont jamais écrits.** Vérifié :
  aucune occurrence dans `library.ts`, `ImportService.ts`, `DeemixService.ts`.
  Ces colonnes existent depuis le premier schéma et sont vides sur toute
  installation. Conséquences en cascade — voir §2.3 (C7) et §2.4.
- **Le repli distant de `/api/albums/[id]/tracks:31` est du code mort** : il
  s'active si `album.mbid || meta.deezerId`, deux valeurs jamais renseignées pour
  un album issu du scan.
- **La création d'artiste met le nom en majuscules** (`api/artists/route.ts:58`)
  et le scan aussi (`library.ts:68`). C'est un choix d'arborescence qui remonte
  jusqu'à l'affichage : la fiche artiste montre `IRON MAIDEN`.
- **`POST /api/artists` peut lever une `TypeError`** : en cas de conflit `UNIQUE`
  sur `mbid` ou `discogs_id` (et non sur `name`), le repli cherche l'artiste par
  nom, ne le trouve pas, et déréférence `existing.id` sur `undefined`
  (`api/artists/route.ts:76-77`).
- **Le journal reste en mémoire.** Déjà signalé (`AUDIT.md` §2.3) — toujours
  ouvert, et c'est ce qui rendrait le diagnostic des syncs bien plus simple.
- **Cinq boucles d'interrogation** à 2–3 s (`ToastContext` ×2, Activité, Debug,
  Réglages). Déjà signalé (`AUDIT.md` §2.4).

---

# Partie 2 — Discographies : diagnostic

C'est le cœur du sujet. Vos trois symptômes — **doublons**, **trop d'entrées pour
les artistes très connus**, **peu de cohérence** — ne sont pas trois bugs. Ce
sont trois faces d'un même défaut de conception, aggravées par une poignée
d'erreurs de logique bien localisées.

## 2.0 Comment ça marche aujourd'hui

```
Fiche artiste ──► POST /api/sync/artist/[id]  (fire-and-forget)
                        │
                        ▼
                  SyncService.syncArtist
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
    Deezer          MusicBrainz      Discogs      ← séquentiel, ID ré-résolu
        │               │               │           par nom à chaque fois
        ▼               ▼               ▼
   artist_cache    artist_cache    artist_cache   ← 3 lignes, 3 blobs JSON
        └───────────────┼───────────────┘
                        ▼
              GET /api/artists/[id]/discography
                        │
                        ▼   rapprochement par chaîne, O(N×M), à chaque appel
              3 colonnes affichées côte à côte
```

Le point clé, en une phrase : **il n'y a aucune étape de fusion.** Le moteur qui
saurait le faire — `MetadataEngine.syncArtistDiscography` — existe, mais la fiche
artiste ne l'appelle **jamais**. Il n'est utilisé que par `suggest-cover` et
`suggest-tags`.

## 2.1 Symptôme « doublons »

### A1 — 🔴 Trois colonnes non fusionnées, par construction

`src/app/library/artist/[id]/page.tsx:311-342` affiche trois
`<DiscographyColumn>` : Deezer, MusicBrainz, Discogs. `discography/route.ts:29`
renvoie trois listes séparées, sans jamais les croiser.

**Chaque album existe donc jusqu'à trois fois à l'écran.** Ce n'est pas un bug de
déduplication, c'est l'absence de l'étape qui devrait dédupliquer.

### A2 — 🔴 Les mentions d'édition ne sont jamais neutralisées

`CompareUtils.normalize` retire accents, ponctuation et articles. Il ne retire
**rien** de ce qui crée réellement les doublons dans les catalogues :
« Remastered », « Deluxe Edition », « Bonus Track Version », « Anniversary »…

Mesuré sur le code actuel :

| Titre A | Titre B | Clés produites | Résultat |
|---|---|---|---|
| `Killers` | `Killers (Remastered 2015)` | `killers` / `killersremastered2015` | ❌ **doublon** |
| `Discovery` | `Discovery (Deluxe)` | `discovery` / `discoverydeluxe` | ❌ **doublon** |
| `Live After Death` | `Live After Death (2020 Remaster)` | `liveafterdeath` / `liveafterdeath2020remaster` | ❌ **doublon** |
| `Random Access Memories` | `… (10th Anniversary Edition)` | ≠ | ❌ **doublon** |

Sur Deezer, un album de catalogue connu existe couramment en 4 à 8 variantes
(remaster, deluxe, éditions régionales, versions explicite/clean). Toutes
arrivent comme des entrées distinctes.

### A3 — 🟠 Le même normalisateur produit des faux positifs

Le problème est symétrique : trop laxiste sur les éditions, trop agressif sur le
reste. Les articles sont supprimés **partout dans la chaîne**
(`src/lib/CompareUtils.ts:25`), et non en tête comme l'annonce la
documentation de la fonction juste au-dessus (ligne 12).

| Entrée | Clé | Collision avec |
|---|---|---|
| `Kid A` | `kid` | `Kid` |
| `La Femme` | `femme` | `Femme` |
| `Die Mensch-Maschine` | `menschmaschine` | `Mensch Maschine` |
| `An Anthology` | `anthology` | `Anthology` |
| `19 84` | `1984` | `1984` |

Deux albums réellement différents peuvent donc fusionner — et comme la fusion
conserve un seul titre, l'autre disparaît sans trace.

### A4 — 🟠 Deux stratégies de déduplication incompatibles cohabitent

| Emplacement | Clé de déduplication |
|---|---|
| `DiscogsProvider.ts:105` | `type + titre normalisé` |
| `MetadataEngine.ts:122` | `titre normalisé` seul |

La seconde fusionne un single et un album homonymes (fréquent — le single-titre
qui donne son nom à l'album) ; la première les sépare. Aucune des deux n'est
appliquée à ce que voit l'utilisateur sur la fiche artiste.

## 2.2 Symptôme « trop d'entrées pour les artistes très connus »

### B1 — 🔴 Les plafonds s'appliquent **avant** le filtre de type

C'est le défaut le plus contre-intuitif du lot, et il explique à lui seul la
sensation de « ça part en vrille sur les gros artistes ».

| Provider | Plafond par défaut | Filtre appliqué… |
|---|---|---|
| Deezer | 300 items (`DeezerProvider.ts:41`) | …**après** le `map`, ligne 80 |
| Discogs | 5 pages = 500 releases (`DiscogsProvider.ts:50`) | …**dans** la boucle de transformation, ligne 99 |
| MusicBrainz | 500 release-groups (`MusicBrainzProvider.ts:40`) | serveur (`type=`) **puis** client, ligne 93 |

Pour un artiste à 900 sorties dont 700 singles, vous téléchargez 300 entrées de
bruit pour en garder une quarantaine — **et les albums au-delà du plafond sont
purement absents**. Vous obtenez donc simultanément trop d'entrées à l'écran et
une discographie incomplète. Seul MusicBrainz filtre côté serveur, et c'est
aussi la seule colonne à peu près exploitable.

### B2 — 🔴 Discogs est trié par année décroissante

`DiscogsProvider.ts:56` : `sort: 'year', sort_order: 'desc'`. Combiné au plafond
de 500 releases, les 500 lignes récupérées pour un artiste majeur sont les
**pressages les plus récents** — c'est-à-dire les rééditions. Les pressages
d'origine des albums historiques sont hors plafond.

Le pire des deux mondes : beaucoup de lignes, et pas les bonnes.

### B3 — 🔴 Aucun filtrage des rôles Discogs

`/artists/{id}/releases` renvoie **tous les rôles** : `Main`, `Appearance`,
`TrackAppearance`, `Producer`, `Remix`, `Arranged By`, `Featuring`, `Written-By`…

`DiscogsProvider.ts:85` n'en traite que deux :

```ts
if (r.role === 'Appearance' || r.role === 'TrackAppearance') return 'appearance';
```

**Tous les autres rôles retombent dans le classifieur par format et finissent en
`'album'`.** Pour un artiste qui a produit ou remixé — c'est-à-dire à peu près
tout artiste connu — cela représente des centaines de disques qui ne sont pas les
siens, présentés comme ses albums.

### B4 — 🟠 MusicBrainz ne traite que 2 types secondaires sur 8

`MusicBrainzProvider.ts:110-113` reclasse `Compilation` et `Split`. Restent non
traités et donc classés `'album'` :

`Live` · `Remix` · `Soundtrack` · `Demo` · `DJ-mix` · `Mixtape/Street` ·
`Audio drama` · `Field recording`

Pour un artiste avec trente albums live officiels et une poignée de bandes
originales, tout arrive dans la colonne « albums ».

### B5 — 🟡 Le mode « recherche approfondie » amplifie tout

`deep` porte les plafonds à 5000 (MusicBrainz), 5000 (Discogs, 50 pages) et 1000
(Deezer). Sans correction des points ci-dessus, c'est un multiplicateur de bruit
— et un blob JSON de plusieurs mégaoctets stocké dans `artist_cache`, reparsé et
recomparé à chaque affichage de la fiche.

## 2.3 Symptôme « peu de cohérence »

### C1 — 🔴 L'artiste distant est ré-identifié à chaque sync, par nom, avec un repli dangereux

C'est, à mon avis, **la cause n° 1 de l'incohérence perçue**.

`SyncService.ts:71`, `:90`, `:109` — trois fois le même motif :

```ts
const search = await dzProvider.searchArtist(artist.name);
const match = search.find(r => normalize(r.name) === normalize(artist.name))
           || search[0];          // ← repli sur le premier résultat
```

Deux défauts cumulés :

1. **Le repli `|| search[0]`.** Si le provider ne trouve pas exactement
   l'artiste, on prend son premier résultat — un homonyme, un tribute band, un
   artiste au nom proche. La colonne se remplit alors avec la discographie de
   quelqu'un d'autre, sans le moindre avertissement.
2. **L'identifiant trouvé n'est jamais enregistré.** Aucune écriture vers
   `artists.mbid`, `artists.discogs_id` ou `metadata.deezerId` après résolution.
   Chaque synchronisation refait la recherche — et le classement des moteurs de
   recherche évolue. **Deux syncs du même artiste peuvent viser deux artistes
   différents.**

### C2 — 🔴 Le classifieur de type Discogs est faux

`DiscogsProvider.ts:87-95` :

```ts
const formats = Array.isArray(r.format) ? r.format.join(',').toLowerCase() : …;
if (formats.includes('album') || formats.includes('lp') || formats.includes('vinyl')) return 'album';
if (formats.includes('ep')) return 'ep';
…
if (formats.includes('single')) return 'single';
return 'album';   // ← repli
```

Deux erreurs :

- **Le support est testé avant le type.** Discogs met les deux dans le même
  champ. Un maxi 45 tours dont le format est `Vinyl, 12", Single` matche
  `'vinyl'` en premier et devient un **album**. Tout single vinyle est un album.
- **Les entrées `type: 'master'` n'ont pas de champ `format`** → chaîne vide →
  repli final `return 'album'`. Or les masters sont précisément les entrées les
  plus fiables du lot.

Combiné à la clé de déduplication `type + titre` (`ligne 105`), l'effet est
mécanique : le même album classé `'album'` en vinyle et `'single'` en CD produit
**deux entrées**. La déduplication échoue exactement là où on en a besoin.

### C3 — 🔴 Le cache n'est ni atomique ni daté par périmètre

`SyncService.ts:55-63` écrit une ligne `artist_cache` **par provider**, au fil de
l'eau. Si un provider échoue, expire, ou n'a pas d'identifiant, sa ligne
**conserve silencieusement l'ancien contenu**.

Vous comparez donc, dans la même vue :

- une colonne MusicBrainz produite aujourd'hui avec le filtre `[album, ep]`,
- à côté d'une colonne Deezer produite il y a trois semaines avec
  `[album, ep, single, compilation]`,
- à côté d'une colonne Discogs vide parce que le jeton avait expiré ce jour-là.

Rien en base ne mémorise **quels filtres** ont produit quelle ligne, ni **si**
elle a échoué. L'UI affiche une seule date (`discography/route.ts:103`), prise
sur la première entrée renvoyée par SQLite — c'est-à-dire arbitraire.

**C'est très exactement « peu de cohérence », et c'est mesurable dans la base.**

### C4 — 🟠 Aucune canonisation des taxonomies

Trois vocabulaires sources, mappés indépendamment vers cinq valeurs, par trois
règles écrites séparément :

| Source | Vocabulaire | Mappé par |
|---|---|---|
| MusicBrainz | `primary-type` + `secondary-types[]` | `MusicBrainzProvider.ts:107-113` |
| Deezer | `record_type` (`album`/`single`/`ep`/`compilation`) | `DeezerProvider.ts:65-70` |
| Discogs | chaîne `format` libre + `role` | `DiscogsProvider.ts:84-96` |

Il n'existe nulle part de fonction unique « type canonique ». Le même disque peut
être `album` chez l'un, `single` chez l'autre, `compilation` chez le troisième —
ce que l'affichage en trois colonnes rend directement visible.

### C5 — 🟠 Les délais d'expiration n'annulent rien

`MetadataEngine.ts:86-94` et `SyncService.ts:45-53` utilisent le même motif :

```ts
Promise.race([promise, new Promise((_, rej) => setTimeout(rej, 300000))])
```

`Promise.race` abandonne **l'attente**, pas **le travail**. Aucun
`AbortController` n'est passé à `fetch`. Une pagination Deezer déclarée expirée
au bout de 5 minutes continue donc de tourner et de taper l'API pendant que
MusicBrainz et Discogs s'exécutent — et le `setTimeout` n'est jamais annulé,
même quand la requête réussit.

### C6 — 🟠 Aucun verrou sur la synchronisation

`POST /api/sync/artist/[id]` lance `syncArtist` en tâche de fond sans vérifier
qu'une synchronisation tourne déjà pour cet artiste. Deux clics = deux
synchronisations concurrentes qui écrivent les mêmes lignes de cache, provider
par provider, dans un ordre non déterministe. Le nettoyage ligne 17 marque
l'ancienne activité en échec, mais **n'arrête pas** le travail correspondant.

### C7 — 🔴 Le rapprochement « possédé » est purement textuel

`discography/route.ts:74-89` applique quatre règles dans l'ordre :

| # | Règle | État réel |
|---|---|---|
| 1 | Correspondance MBID | ⚰️ **morte** — `albums.mbid` n'est jamais écrit |
| 2 | Correspondance Discogs ID | ⚰️ **morte** — `albums.discogs_id` n'est jamais écrit |
| 3 | Nom normalisé identique | ✅ seule règle active |
| 4 | Nom sans le préfixe artiste | ✅ active |

Il ne reste donc que la comparaison de chaînes — qui échoue précisément sur les
cas d'édition (A2). Un album possédé sous le nom `Killers (Remastered)` ne sera
pas rapproché de l'entrée `Killers` de MusicBrainz : **il s'affichera comme
manquant alors que vous l'avez.**

### C8 — 🟡 Rapprochement O(N×M) refait à chaque affichage

`discography/route.ts:67-97` : pour chaque item distant, un `find()` linéaire sur
tous les albums locaux. Avec 3 000 items en cache et 300 albums locaux, cela fait
**900 000 comparaisons par chargement de page** — et la page se recharge à chaque
événement `musicarr:activity-finished` (`page.tsx:87`).

### C9 — 🟡 Le filtre de la fiche artiste n'est pas normalisé

`page.tsx:316` : `a.name.toLowerCase().includes(filterQuery.toLowerCase())`.
Chercher `elephant` ne trouve pas `Éléphant`, alors que `CompareUtils` est déjà
importé ailleurs dans le même flux.

### C10 — 🟡 User-Agent MusicBrainz invalide

`MusicBrainzProvider.ts:6` :
`Musicarr/0.1.0 ( https://github.com/guilhem/musicarr )` — dépôt inexistant (le
vrai est `guim31/musicarr`), et version périmée (0.2.0 depuis `1f32d72`).

MusicBrainz exige un agent identifiable et applique des restrictions plus dures
aux clients non identifiables. En face, `fetchMB` lève sur n'importe quel
`!res.ok` : un seul `503` à la page 7 sur 12 fait perdre toute la pagination, la
ligne de cache n'est pas mise à jour, et l'ancienne subsiste — ce qui renforce
C3, en silence.

### C11 — 🔴 La fusion d'artistes homonymes mélange les identifiants

`MetadataEngine.searchArtist:36-57` fusionne les résultats des quatre providers
**par nom normalisé**. Or les homonymes sont la norme en musique (« Nirvana »,
« Bad Company », « Prince »…).

Le résultat fusionné combine le `mbid` du premier provider et le `deezerId`
d'un autre — **sans jamais vérifier qu'il s'agit du même artiste**. Cet objet
est ensuite envoyé tel quel à `POST /api/artists` par la page d'ajout, ou
utilisé par `suggest-cover` / `suggest-tags`. L'artiste peut donc être créé en
base avec des identifiants pointant vers deux personnes différentes.

## 2.4 🟠 Effet de bord : une discographie complète pour une pochette

`suggest-cover/route.ts:28` et `suggest-tags/route.ts:41` appellent
`engine.syncArtistDiscography(...)` pour retrouver **un seul** album.

Cet appel :

- ignore complètement `artist_cache` ;
- pagine MusicBrainz avec 1 seconde d'attente entre chaque page ;
- pagine Discogs sur 5 pages ;
- pagine Deezer sur 300 albums ;
- et rapproche ensuite par `includes()` de sous-chaîne (`ligne 30`), ce qui fait
  matcher `Live` avec `Live After Death`.

Un clic sur « suggérer une pochette » peut ainsi coûter une minute et des
centaines de requêtes externes, pour une URL d'image.

## 2.5 🔴 La racine commune : une discographie n'est pas une donnée

Tout ce qui précède découle d'un seul choix : `artist_cache` stocke un **blob
JSON opaque** (`db.ts:101-108`), pas des entités.

| Ce qu'on ne peut pas faire | Pourquoi |
|---|---|
| Dédupliquer entre providers | Aucune identité stable pour une sortie |
| Marquer une sortie « surveillée » | Rien à quoi accrocher un booléen |
| Lister les manquants réels | Le manquant n'existe pas en base |
| Paginer / trier / filtrer en SQL | Il faut désérialiser tout le blob |
| Se souvenir d'un rapprochement | Recalculé de zéro à chaque requête |
| Corriger manuellement une erreur | Écrasé à la prochaine sync |

Tant que ce point n'est pas traité, chaque correction ponctuelle ne fera que
déplacer le symptôme.

---

# Partie 3 — Recommandations

Classées par rapport valeur / effort. Les trois premières traitent l'essentiel
des symptômes ; les suivantes consolident.

## R1 — 🥇 Matérialiser les sorties en base

**Le changement structurant.** Une table dédiée, alimentée par la sync, qui
remplace le blob :

```sql
CREATE TABLE artist_releases (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id          INTEGER NOT NULL,
  release_key        TEXT    NOT NULL,  -- clé canonique de regroupement (R3)
  title              TEXT    NOT NULL,  -- titre d'affichage retenu
  type               TEXT    NOT NULL,  -- album|ep|single|compilation|live|appearance
  first_release_date TEXT,
  image              TEXT,
  mbid TEXT, discogs_id TEXT, deezer_id TEXT,
  sources            TEXT,              -- JSON: ["musicbrainz","deezer"]
  album_id           INTEGER,           -- lien vers l'album local, si possédé
  monitored          INTEGER DEFAULT 0,
  updated_at         DATETIME,
  UNIQUE(artist_id, release_key),
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (album_id)  REFERENCES albums(id)  ON DELETE SET NULL
);
```

Ce que ça débloque immédiatement :

- la fusion se fait **une fois, à la sync**, pas à chaque affichage (résout A1, C8) ;
- « Albums manquants » devient réel : `WHERE album_id IS NULL AND monitored = 1` (résout §1.2) ;
- le rapprochement est **persistant** — une fois `album_id` posé, il ne se
  recalcule plus et ne se reperd plus (résout C7) ;
- pagination, tri et filtres passent en SQL ;
- une correction manuelle peut survivre à la sync (colonne `locked`).

Garder `artist_cache` comme cache brut par provider est utile pour le
débogage — mais l'UI ne doit plus le lire.

## R2 — 🥇 Une seule liste fusionnée ; la source devient un attribut

Remplacer les trois colonnes par **une liste unique**, groupée par année, avec :

- des pastilles de provenance sur chaque ligne (`MB` `DZ` `DC`) ;
- un filtre par type en onglets (Albums · EP · Singles · Compilations · Live · Apparitions) ;
- le compteur `n possédés / N` en tête ;
- un mode « comparer les sources » relégué derrière un bouton, pour le diagnostic.

C'est le changement qui fera disparaître 90 % des doublons perçus, parce qu'il
supprime la triplication structurelle. `MetadataEngine.syncArtistDiscography`
devient le point de fusion unique, appelé par `SyncService`, et son résultat est
écrit dans `artist_releases`.

## R3 — 🥇 Une vraie clé de regroupement, et des tests dessus

Séparer deux fonctions aujourd'hui confondues :

**`normalize(s)`** — comparaison stricte. Corriger :
- articles supprimés **en tête uniquement** (résout A3) ;
- ne plus supprimer `l'` en milieu de mot ;
- garder les chiffres significatifs.

**`releaseKey(titre, type)`** — regroupement des éditions. Nouveau :
1. retirer les segments parenthésés/crochetés contenant
   `remaster(ed)` · `deluxe` · `expanded` · `edition` · `anniversary` ·
   `bonus` · `reissue` · `version` · `mono` · `stereo` · `explicit` · `clean` ·
   `remix` · `special` · `collector` · un millésime seul ;
2. retirer les suffixes après ` - ` répondant aux mêmes motifs
   (`- Remastered 2011`, `- Deluxe Edition`) ;
3. `normalize()` sur le reste ;
4. clé finale = `${typeCanonique}|${reste}`, départagée par année à ±1 an en cas
   de collision.

> **C'est ici qu'il faut écrire les premiers tests du projet.** `AUDIT.md` §3.2 le
> recommandait déjà pour `CompareUtils` ; avec `releaseKey` l'argument devient
> imparable : une fonction pure, un corpus d'une centaine de titres réels tirés de
> votre propre bibliothèque, et toute régression devient visible. Sans ce filet,
> chaque ajustement du normalisateur cassera silencieusement autre chose — c'est
> déjà ce qui s'est produit (A3).

## R4 — 🥈 Persister les identifiants, supprimer le repli hasardeux

Trois changements courts dans `SyncService` :

1. **Supprimer `|| search[0]`.** Sans correspondance forte, on ne synchronise pas
   ce provider et on l'inscrit dans l'activité : « Deezer : artiste non
   identifié ». Une colonne vide vaut mieux qu'une fausse discographie (C1).
2. **Écrire l'identifiant dès qu'il est résolu** dans `artists.mbid`,
   `artists.discogs_id`, `artists.metadata.deezerId`. Une seule recherche dans la
   vie de l'artiste, et un résultat stable d'une sync à l'autre.
3. **Offrir un rattachement manuel** dans l'UI : coller une URL MusicBrainz,
   Discogs ou Deezer sur la fiche artiste. C'est la porte de sortie indispensable
   pour les homonymes (C11), et c'est vingt lignes.

Symétriquement, écrire `mbid` / `discogs_id` / `deezer_id` sur `albums` dès qu'un
rapprochement est confirmé — ce qui réanime les règles 1 et 2 de C7.

## R5 — 🥈 Filtrer à la source, pas après

**Discogs** (`DiscogsProvider`) :
- ne garder que `role === 'Main'` par défaut ; `Appearance` / `TrackAppearance`
  seulement si l'utilisateur coche « Apparitions » ; **écarter les autres rôles**
  au lieu de les faire retomber sur `'album'` (résout B3) ;
- dédupliquer sur `master_id` quand il est présent, pas sur le titre (résout C2) ;
- inverser l'ordre du classifieur : `single` et `ep` **avant** `vinyl`/`lp`, et
  ne jamais déduire un type d'un support (résout C2).

**MusicBrainz** (`MusicBrainzProvider`) :
- mapper les huit types secondaires vers des types canoniques, avec `Live`,
  `Remix`, `Soundtrack`, `Demo`, `DJ-mix` exclus par défaut (résout B4) ;
- conserver le filtrage serveur via `type=`, déjà en place et efficace.

**Deezer** (`DeezerProvider`) :
- `record_type` est fiable, mais le filtrage ne peut se faire que côté client :
  **paginer jusqu'à obtenir N items du type demandé**, pas N items bruts
  (résout B1) ;
- filtrer les rééditions évidentes à l'aide de `releaseKey` dès la collecte.

## R6 — 🥈 Rendre la synchronisation atomique, verrouillée et traçable

- **Un verrou par artiste**, avec horodatage et expiration (le même besoin que
  `AUDIT.md` §2.2 sur le scan — une brique partagée réglerait les deux).
- **Écriture transactionnelle en fin de sync** plutôt que provider par provider.
- **Stocker le périmètre à côté des données** : `filter_types`, `deep`,
  `status` (`ok` / `échec` / `non identifié`), `updated_at` — par provider.
- **Afficher ce périmètre dans l'UI** : « MusicBrainz · albums + EP · il y a
  2 h » / « Discogs · échec · il y a 3 semaines ». La cohérence redevient
  vérifiable d'un coup d'œil (résout C3).

## R7 — 🥉 Annulation réelle et respect des quotas

- Remplacer `Promise.race` par `AbortSignal.timeout()` passé à `fetch`, et
  propager le signal dans les boucles de pagination (résout C5).
- Ajouter un garde-fou `if (items.length === 0) break;` dans chaque boucle de
  pagination : aujourd'hui, une page vide renvoyée avec un `total` non nul fait
  tourner la boucle indéfiniment (`MusicBrainzProvider.ts:72`,
  `DeezerProvider.ts:55`).
- Un `RateLimiter` partagé dans `src/lib` : 1 req/s pour MusicBrainz, lecture de
  `X-Discogs-Ratelimit-Remaining` pour Discogs, et un backoff exponentiel sur
  `503` / `429` — au lieu de perdre toute une pagination sur un seul échec (C10).
- Corriger le User-Agent : `Musicarr/0.2.0 ( https://github.com/guim31/musicarr )`.

## R8 — 🥉 Découpler les suggestions de la synchronisation

`suggest-cover` et `suggest-tags` doivent :

1. lire `artist_releases` (ou `artist_cache`) **d'abord** ;
2. à défaut, ne chercher que l'album ciblé (`search/album?q=artiste album`), pas
   la discographie entière ;
3. remplacer le rapprochement par `includes()` de sous-chaîne par `releaseKey`
   (résout §2.4).

## R9 — 🥉 Fermer la boucle

Une fois R1 en place, les briques manquantes deviennent petites :

- `monitored` sur `artist_releases`, positionné par type (« surveiller les
  albums studio de cet artiste ») ;
- une tâche périodique — la même que celle de §1.4 — qui cherche les sorties
  surveillées non possédées via Prowlarr / Deezer ;
- la page « Manquants » alimentée par `artist_releases WHERE album_id IS NULL`.

C'est à ce moment-là que Musicarr tient la promesse de son concept.

## R10 — Correctifs courts, sans dépendance

À faire au fil de l'eau, chacun est local :

| Correctif | Fichier |
|---|---|
| `if (success)` sur un objet toujours *truthy* | `api/download/route.ts:15`, `:28` |
| Fusionner les deux routes de téléchargement | `api/download` → `api/search/download` |
| Griser ou masquer les résultats torrent | `search/page.tsx`, `SearchModal.tsx` |
| Import SABnzbd hors du `GET /api/activity` | `api/activity/route.ts:9` |
| Normaliser le filtre de la fiche artiste | `library/artist/[id]/page.tsx:316` |
| `TypeError` sur conflit `UNIQUE` non-`name` | `api/artists/route.ts:76` |
| Mettre en file les scans refusés au lieu de les perdre | `services/library.ts:230` |
| Supprimer `SyncService.engine`, jamais utilisé | `SyncService.ts:10` |
| Supprimer `DeemixService.decryptBuffer` (déjà signalé) | `DeemixService.ts:100` |

---

## Ordre de traitement suggéré

| # | Chantier | Effort | Ce que ça règle |
|---|---|---|---|
| 1 | **R3** — `releaseKey` + tests | ~1 j | A2, A3, A4 — les doublons de titre |
| 2 | **R2** — liste fusionnée unique | ~1 j | A1 — la triplication à l'écran |
| 3 | **R4** — identifiants persistés, plus de `search[0]` | ~½ j | C1, C11 — les mauvais artistes |
| 4 | **R5** — filtrage à la source | ~1 j | B1–B4 — le volume sur les gros artistes |
| 5 | **R1** — table `artist_releases` | ~2 j | C7, C8, §1.2 — la racine |
| 6 | **R6** — sync atomique et tracée | ~1 j | C3, C6 — la cohérence dans le temps |
| 7 | R7, R8, R10 | ~1 j | Robustesse, quotas, correctifs |
| 8 | **R9** — surveillance et acquisition | ~2 j | La promesse du produit |

Les quatre premières lignes ne touchent pas au schéma et se font en PR
indépendantes. À elles seules, elles devraient supprimer l'essentiel de ce que
vous constatez aujourd'hui.

---

*Audit réalisé sur le code de la branche `dev` au commit `0afa603`. Les
comportements de normalisation (§2.1) ont été reproduits en exécutant la
fonction réelle ; les autres constats sont établis par lecture du code, avec
les références de fichier et de ligne pour vérification. L'accès réseau aux API
externes n'était pas disponible pendant l'audit : les volumétries évoquées pour
les artistes très connus sont des ordres de grandeur, pas des mesures.*
