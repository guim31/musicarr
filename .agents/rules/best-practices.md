# Best Practices: Musicarr

## Database & State
- **Synchronous DB**: `better-sqlite3` is synchronous. Avoid wrapping queries in unnecessary async/await unless part of an async service flow.
- **Transactions**: Use `db.transaction()` for batch operations (e.g., library scan).
- **Caching**: Always check `artist_cache` before querying external metadata APIs.

## Logging & Feedback
- **LogService**: Use `@/lib/LogService` for terminal logging.
- **User Activity**: For long tasks (Sync, Scan, Download), update the `activity` table regularly to provide UI feedback.
- **Errors**: Catch exceptions in services and update `activity` status to `failed` with a descriptive message.

## UI & Styling
- **Vanilla CSS**: Use standard CSS files. Avoid inline styles where possible.
- **Responsiveness**: Mobile-first approach for new layouts.
- **Icons**: Use `lucide-react` exclusively.

## Code Quality
- **TypeScript**: Define interfaces for all API responses and service outputs.
- **Single Source of Truth**: The database is the authority for file locations and metadata.

---
*Follow the established patterns in `SyncService.ts` for orchestrating complex flows.*
