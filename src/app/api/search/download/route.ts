import { NextResponse } from 'next/server';
import { ProwlarrService } from '@/services/prowlarr';
import { SabnzbdService } from '@/services/sabnzbd';
import { DeezerProvider } from '@/services/metadata/providers/DeezerProvider';
import { DeemixService } from '@/services/DeemixService';
import db from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  try {
    const deezer = new DeezerProvider();
    const [prowlarrResults, deezerArtists, deezerAlbums] = await Promise.all([
      ProwlarrService.search(query).catch(e => { console.error(e); return []; }),
      deezer.searchArtist(query).catch(e => { console.error(e); return []; }),
      DeemixService.searchAlbumWithQuality(query).catch(e => { console.error(e); return []; })
    ]);

    // Mapper Prowlarr
    const mappedProwlarr = prowlarrResults.map((item: any) => ({
      guid: item.guid,
      title: item.title,
      indexer: item.indexer,
      size: item.size,
      publishDate: item.publishDate,
      downloadUrl: item.downloadUrl,
      infoUrl: item.infoUrl,
      protocol: item.protocol || (item.downloadUrl?.includes('.nzb') ? 'usenet' : 'torrent'),
      ageInDays: item.ageInDays || 0
    }));

    // Mapper Deezer
    const allDeezerAlbumsMap = new Map<string, any>();
    deezerAlbums.forEach((album: any) => {
      allDeezerAlbumsMap.set(album.deezerId!, {
        guid: `deezer-${album.deezerId}`,
        title: `[Deezer] ${(album as any).artistName || 'Artiste inconnu'} - ${album.name}`,
        indexer: 'Deezer',
        size: 0,
        publishDate: album.releaseDate,
        downloadUrl: album.deezerId,
        infoUrl: `https://www.deezer.com/album/${album.deezerId}`,
        protocol: 'deemix',
        ageInDays: 0,
        qualities: (album as any).qualities
      });
    });

    if (deezerArtists.length > 0 && deezerAlbums.length === 0) {
      const bestArtist = deezerArtists[0];
      const artistAlbums = await deezer.getArtistAlbums(bestArtist.deezerId!);
      artistAlbums.forEach(album => {
        if (!allDeezerAlbumsMap.has(album.deezerId!)) {
          allDeezerAlbumsMap.set(album.deezerId!, {
            guid: `deezer-${album.deezerId}`,
            title: `[Deezer] ${bestArtist.name} - ${album.name}`,
            indexer: 'Deezer',
            size: 0,
            publishDate: album.releaseDate,
            downloadUrl: album.deezerId,
            infoUrl: `https://www.deezer.com/album/${album.deezerId}`,
            protocol: 'deemix',
            ageInDays: 0
          });
        }
      });
    }

    const mappedDeezer = Array.from(allDeezerAlbumsMap.values());
    const albumId = searchParams.get('albumId');

    // 3. Enrichir avec les informations de mise à niveau si albumId est présent
    let currentAlbum: any = null;
    if (albumId) {
      currentAlbum = db.prepare(`
        SELECT a.quality, a.metadata
        FROM albums a
        WHERE a.id = ?
      `).get(albumId) as any;
      if (currentAlbum && currentAlbum.metadata) {
        currentAlbum.metadata = JSON.parse(currentAlbum.metadata);
      }
    }

    const isUpgradeFlag = (resQuality: string) => {
      if (!currentAlbum) return false;
      const currQ = (currentAlbum.quality || '').toLowerCase();
      const currB = currentAlbum.metadata?.bitrate || 0;
      
      const targetQ = resQuality.toLowerCase();

      // Si le résultat est FLAC et qu'on a du MP3/MPEG
      if (targetQ.includes('flac')) {
        return !currQ.includes('flac');
      }
      
      // Si le résultat est du 320 et qu'on a moins
      if (targetQ.includes('320')) {
        if (currQ.includes('flac')) return false;
        return currB < 310; // Marge pour les bitrates variables
      }

      return false;
    };

    const results = [
      ...mappedDeezer.map((r: any) => ({ ...r, isUpgrade: isUpgradeFlag('FLAC/320') })), 
      ...mappedProwlarr.map((r: any) => ({ ...r, isUpgrade: isUpgradeFlag(r.title) }))
    ];

    return NextResponse.json(results);
  } catch (error: any) {
    console.error('Search API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { url, title, protocol, albumId } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (protocol?.toLowerCase() === 'deemix') {
      const response = await DeemixService.downloadAlbum(url, albumId ? parseInt(albumId) : undefined);
      return NextResponse.json({ 
        success: response.success, 
        activityId: `local-${response.activityId}` 
      });
    }

    if (protocol?.toLowerCase() === 'usenet') {
      const success = await SabnzbdService.addNzbFromUrl(url, title || 'Musicarr Download');
      
      let activityId = null;
      if (success) {
        activityId = db.prepare(`
          INSERT INTO activity (type, status, title, message, album_id)
          VALUES ('download', 'pending', ?, ?, ?)
        `).run(title, `Téléchargement NZB lancé : ${title}`, albumId || null).lastInsertRowid;
      }

      return NextResponse.json({ 
        success, 
        activityId: activityId ? `local-${activityId}` : null 
      });
    } else {
      return NextResponse.json({ error: 'Protocol non supporté pour le moment (Usenet ou Deezer seulement)' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Download API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
