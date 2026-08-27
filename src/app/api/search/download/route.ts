import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ProwlarrService } from '@/services/prowlarr';
import { DeezerProvider } from '@/services/metadata/providers/DeezerProvider';
import { DownloadService, UnsupportedProtocolError } from '@/services/DownloadService';
import { DeemixService } from '@/services/DeemixService';
import db from '@/lib/db';

const DownloadBody = z.object({
  url: z.string().min(1),
  title: z.string().optional(),
  protocol: z.string().optional(),
  albumId: z.coerce.number().int().positive().optional(),
});

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
    const parsed = DownloadBody.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Requête de téléchargement invalide', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await DownloadService.start(parsed.data);
    if (!result.success) {
      return NextResponse.json({ error: 'Le client de téléchargement a refusé la demande' }, { status: 502 });
    }

    return NextResponse.json({ success: true, activityId: result.activityId });
  } catch (error) {
    if (error instanceof UnsupportedProtocolError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[Téléchargement] Erreur :', error);
    return NextResponse.json({ error: (error as Error).message || 'Erreur interne' }, { status: 500 });
  }
}
