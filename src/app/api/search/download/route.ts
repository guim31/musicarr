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
      deezer.searchAlbum(query).catch(e => { console.error(e); return []; })
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
    deezerAlbums.forEach(album => {
      allDeezerAlbumsMap.set(album.deezerId!, {
        guid: `deezer-${album.deezerId}`,
        title: `[Deezer] ${(album as any).artistName || 'Artiste inconnu'} - ${album.name}`,
        indexer: 'Deezer',
        size: 0,
        publishDate: album.releaseDate,
        downloadUrl: album.deezerId,
        infoUrl: `https://www.deezer.com/album/${album.deezerId}`,
        protocol: 'deemix',
        ageInDays: 0
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

    return NextResponse.json([...mappedDeezer, ...mappedProwlarr]);
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
      const response = await DeemixService.downloadAlbum(url);
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
