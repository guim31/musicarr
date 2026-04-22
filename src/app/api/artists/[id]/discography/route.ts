import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { CompareUtils } from '@/lib/CompareUtils';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const artistId = parseInt(id);

    // 1. Récupérer les albums locaux (déjà téléchargés ou surveillés)
    const localAlbums = db.prepare(`
      SELECT id, name, mbid, discogs_id, release_date, type, status, metadata 
      FROM albums 
      WHERE artist_id = ?
    `).all(artistId) as any[];

    // 2. Récupérer le cache des discographies
    const cacheEntries = db.prepare(`
      SELECT provider, data, updated_at 
      FROM artist_cache 
      WHERE artist_id = ?
    `).all(artistId) as any[];

    const discography: Record<string, any[]> = {
      deezer: [],
      musicbrainz: [],
      discogs: []
    };

    cacheEntries.forEach(entry => {
      try {
        discography[entry.provider] = JSON.parse(entry.data);
      } catch (e) {
        console.error(`Error parsing cache for ${entry.provider}:`, e);
      }
    });

    // 3. Marquer les albums distants comme "possédés" s'ils sont en local
    // On utilise les MBID, DiscogsID ou le nom normalisé
    const localSlugs = new Set(localAlbums.map(a => CompareUtils.normalize(a.name)));
    const localMbids = new Set(localAlbums.map(a => a.mbid).filter(Boolean));
    const localDiscogsIds = new Set(localAlbums.map(a => a.discogs_id).filter(Boolean));

    const artist = db.prepare('SELECT name FROM artists WHERE id = ?').get(artistId) as any;
    const normalizedArtist = artist ? CompareUtils.normalize(artist.name) : '';

    Object.keys(discography).forEach(provider => {
      discography[provider] = discography[provider].map(item => {
        const matchingLocal = localAlbums.find(a => {
          // 1. Match par MBID (si présent des deux côtés)
          if (item.mbid && a.mbid && item.mbid === a.mbid) return true;
          
          // 2. Match par Discogs ID (si présent des deux côtés)
          if (item.discogsId && a.discogs_id && item.discogsId.toString() === a.discogs_id.toString()) return true;
          
          // 3. Match par Nom normalisé
          const normalizedItem = CompareUtils.normalize(item.name);
          const normalizedLocal = CompareUtils.normalize(a.name);
          if (normalizedItem === normalizedLocal) return true;

          // 4. Match en ignorant le nom de l'artiste au début du nom de l'album (ex: "Iron Maiden - Killers" vs "Killers")
          if (normalizedArtist) {
            const itemWithoutArtist = normalizedItem.replace(new RegExp(`^${normalizedArtist}`), '').trim();
            const localWithoutArtist = normalizedLocal.replace(new RegExp(`^${normalizedArtist}`), '').trim();
            if (itemWithoutArtist && localWithoutArtist && itemWithoutArtist === localWithoutArtist) return true;
          }
          
          return false;
        });
        
        return {
          ...item,
          isOwned: matchingLocal ? matchingLocal.status === 'downloaded' : false,
          localId: matchingLocal?.id
        };
      });
    });

    return NextResponse.json({
      success: true,
      localCount: localAlbums.length,
      discography,
      lastUpdate: cacheEntries[0]?.updated_at || null
    });

  } catch (error: any) {
    console.error('Discography API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
