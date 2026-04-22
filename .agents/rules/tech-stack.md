# Tech Stack: Musicarr

## Core
- **Next.js 15+** (App Router)
- **React 19**
- **TypeScript** (Strict mode)
- **Node.js 20+**
- **SQLite** (via `better-sqlite3`)

## Frontend
- **Vanilla CSS** (No TailwindCSS unless requested)
- **Lucide React** (Icons)
- **Google Fonts** (Outfit / Inter)

## Backend & Services
- **Axios**: HTTP client for API integrations.
- **Zod**: Runtime validation and schema definitions.
- **Music-metadata**: Audio file tagging and metadata extraction.
- **Blowfish-node**: Cryptographic utilities (Deezer/Deemix).

## External Integrations
- **MusicBrainz**: Primary source for metadata.
- **Discogs**: Secondary metadata and discography source.
- **Deezer**: Direct download and streaming metadata.
- **Prowlarr**: Search indexer (Torrents/Usenet).
- **SABnzbd**: Usenet download manager.

---
*Reference for agent logic. Keep implementations modern and type-safe.*
