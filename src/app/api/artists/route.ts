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
    const { name, mbid, image, country, genre } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Le nom de l\'artiste est requis' }, { status: 400 });
    }

    const fs = await import('fs');
    const path = await import('path');

    // Create the formatted folderName
    const folderName = name.toUpperCase().replace(/\s+/g, '_');
    const libraryPathRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path') as { value: string } | undefined;
    const libraryPath = libraryPathRow?.value;

    if (libraryPath) {
      const artistPath = path.join(libraryPath, folderName);
      if (!fs.existsSync(artistPath)) {
        fs.mkdirSync(artistPath, { recursive: true });
      }
    }

    // Insert artist
    const insertArtist = db.prepare(`
      INSERT INTO artists (name, mbid, image, metadata)
      VALUES (?, ?, ?, ?)
    `);
    
    let artistId;
    try {
      const result = insertArtist.run(
        name, 
        mbid || null, 
        image || null, 
        JSON.stringify({ country, genre, folderName })
      );
      artistId = result.lastInsertRowid;
    } catch (e: any) {
      if (e.message.includes('UNIQUE constraint failed')) {
        const existing = db.prepare('SELECT id FROM artists WHERE name = ? COLLATE NOCASE').get(name) as { id: number };
        artistId = existing.id;
      } else {
        throw e;
      }
    }

    // Fetch albums from MusicBrainz
    if (mbid) {
      const albumsRes = await fetch(`https://musicbrainz.org/ws/2/release-group?artist=${mbid}&fmt=json&limit=100`, {
        headers: {
          'User-Agent': 'Musicarr/0.1.0'
        }
      });
      const albumsData = await albumsRes.json();
      
      if (albumsData['release-groups']) {
        const insertAlbum = db.prepare(`
          INSERT OR IGNORE INTO albums (artist_id, name, release_date, status, metadata)
          VALUES (?, ?, ?, 'missing', ?)
        `);

        albumsData['release-groups'].forEach((item: any) => {
          // Filtrer les types primaires (Album, EP)
          const primaryType = item['primary-type'];
          if (primaryType !== 'Album' && primaryType !== 'EP') {
            return;
          }
          
          // Filtrer les types secondaires indésirables (Live, Compilation, etc.)
          const secondaryTypes = item['secondary-types'] || [];
          const isInvalidSecondary = secondaryTypes.some((t: string) => 
            ['Live', 'Compilation', 'Remix', 'Interview', 'Spokenword', 'Audiobook', 'Mixtape/Street'].includes(t)
          );
          
          if (isInvalidSecondary) {
            return;
          }

          // Generate cover image via Cover Art Archive
          const artworkUrl = `https://coverartarchive.org/release-group/${item.id}/front`;

          insertAlbum.run(
            artistId,
            item.title,
            item['first-release-date'] || null,
            JSON.stringify({
              mbid: item.id,
              artworkUrl: artworkUrl,
              primaryType: primaryType
            })
          );
        });
      }
    }

    // Add activity log
    db.prepare('INSERT INTO activity (type, status, title, artist_id, message) VALUES (?, ?, ?, ?, ?)')
      .run('scan', 'completed', name, artistId, 'Artiste ajouté et albums synchronisés via MusicBrainz');

    return NextResponse.json({ success: true, id: artistId });
  } catch (error: any) {
    console.error('API Add Artist Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
