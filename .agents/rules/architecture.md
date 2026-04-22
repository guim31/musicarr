# Architecture & Data Schema

## Database Schema (SQLite)
Access via `@/lib/db`. Synchronous calls using `better-sqlite3`.

- **`artists`**: MBID, name, discogs_id, metadata (JSON).
- **`albums`**: Path, quality, status (missing/downloaded/wanted), MBID, artist_id.
- **`tracks`**: File info, duration, bitrate, quality, path, album_id.
- **`activity`**: System events, progress tracking, status (processing/completed/failed).
- **`artist_cache`**: JSON results from metadata providers to avoid redundant API calls.
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
- **Normalized Comparison**: Use `CompareUtils.normalize` for string matches (Artist/Album names).
- **Provider Pattern**: Metadata sources should implement a consistent interface.

---
*Refer to `src/lib/db.ts` for the full SQL schema.*
