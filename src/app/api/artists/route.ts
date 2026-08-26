import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const artists = db.prepare(`
      SELECT a.*, 
        (SELECT COUNT(*) FROM albums WHERE artist_id = a.id) as album_test_count,
        (SELECT COUNT(*) FROM albums WHERE artist_id = a.id AND status = 'downloaded') as downloaded_count,
        (SELECT COUNT(*) FROM albums WHERE artist_id = a.id AND status IN ('missing', 'wanted')) as missing_count
      FROM artists a
      ORDER BY a.name ASC
    `).all();

    const artistsProcessed = artists.map((a: any) => ({
      ...a,
      album_count: a.album_test_count, // Fallback alias
    }));

    return NextResponse.json(artistsProcessed);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, mbid, discogsId, deezerId, image, country, genre } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Le nom de l\'artiste est requis' }, { status: 400 });
    }

    const fs = await import('fs');
    const path = await import('path');

    // Create the formatted folderName
    const folderName = name.toUpperCase().replace(/\s+/g, '_');
    const libraryPathRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path') as { value: string } | undefined;
    const libraryPath = libraryPathRow?.value;
    const readOnlyRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('read_only_mode') as { value: string } | undefined;
    const isReadOnly = readOnlyRow ? readOnlyRow.value === 'true' : true;

    if (libraryPath && !isReadOnly) {
      try {
        const artistPath = path.join(libraryPath, folderName);
        if (!fs.existsSync(artistPath)) {
          fs.mkdirSync(artistPath, { recursive: true });
        }
      } catch (fsError: any) {
        console.error('Failed to create artist folder:', fsError.message);
        // On continue même si la création du dossier échoue (ex: filesystem en lecture seule)
      }
    }

    // Insert artist
    const upperName = name.toUpperCase();
    const insertArtist = db.prepare(`
      INSERT INTO artists (name, mbid, discogs_id, deezer_id, image, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let artistId: number | bigint;
    try {
      const result = insertArtist.run(
        upperName,
        mbid || null,
        discogsId || null,
        deezerId || null,
        image || null,
        JSON.stringify({ country, genre, folderName })
      );
      artistId = result.lastInsertRowid;
    } catch (e: any) {
      if (!e.message?.includes('UNIQUE constraint failed')) throw e;

      // Le conflit peut porter sur le nom, mais aussi sur `mbid` ou
      // `discogs_id` : chercher uniquement par nom renvoyait alors
      // `undefined`, et déréférencer `.id` levait une TypeError.
      const existing = db
        .prepare(
          `SELECT id FROM artists
            WHERE name = ? COLLATE NOCASE
               OR (mbid IS NOT NULL AND mbid = ?)
               OR (discogs_id IS NOT NULL AND discogs_id = ?)
               OR (deezer_id IS NOT NULL AND deezer_id = ?)
            LIMIT 1`
        )
        .get(name, mbid || null, discogsId || null, deezerId || null) as { id: number } | undefined;

      if (!existing) throw e;
      artistId = existing.id;
    }

    // Add activity log
    db.prepare('INSERT INTO activity (type, status, title, artist_id, message) VALUES (?, ?, ?, ?, ?)')
      .run('scan', 'completed', name, artistId, 'Artiste ajouté à la bibliothèque');

    return NextResponse.json({ success: true, id: artistId });
  } catch (error: any) {
    console.error('API Add Artist Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
