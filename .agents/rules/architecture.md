# Architecture & Data Schema

## Database Schema (SQLite)
Access via `@/lib/db`. Synchronous calls using `better-sqlite3`.

- **`artists`**: MBID, name, discogs_id, metadata (JSON).
- **`albums`**: Path, quality, status (missing/downloaded/wanted), MBID, artist_id.
- **`tracks`**: File info, duration, bitrate, quality, path, album_id.
- **`activity`**: System events, progress tracking, status (processing/completed/failed).
- **`artist_cache`**: Raw per-provider results, with `status` / `scope` / `message`. Diagnostics only — the UI never reads it.
- **`artist_releases`**: Merged, cross-provider discography. One row per release, editions collapsed via `CompareUtils.releaseKey`. Carries `album_id` (local match), `monitored`, `locked`.
- **`settings`**: Key-value pairs for app configuration.

## Folder Structure (`/src`)
- **`/app`**: Next.js App Router (Routes & API).
- **`/services`**: Business logic. Mono-responsibility services.
    - `metadata/`: Engines and providers (MusicBrainz, Discogs, Deezer).
    - `library.ts`: Local file system and database sync.
- **`/lib`**: Shared utilities (DB connection, Logging, Comparators).
- **`/components`**: Reusable React components.

## Patterns
- **Service-Oriented**: Logic belongs in `src/services`, not in `src/app/api`.
- **Activity Logging**: Any operation taking > 1s should create an entry in the `activity` table with `status = 'processing'`.
- **Normalized Comparison**: `CompareUtils.normalize` for strict comparison (artist names); `CompareUtils.releaseKey` to group editions of one release. Never widen `normalize` — it recreates collisions.
- **Canonical Types**: All provider type vocabularies translate through `services/metadata/releaseTypes.ts`. Never map a provider type inline.
- **Provider Pattern**: Metadata sources implement `MetadataProvider` and go through `lib/http.ts` for throttling, retries and real cancellation.
- **Strong Match Only**: Never fall back to the first search result when identifying an artist at a provider. An empty source beats a homonym's discography.

---
*Refer to `src/lib/db.ts` for the full SQL schema.*
