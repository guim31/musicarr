import { NextResponse } from 'next/server';
import { ProwlarrService } from '@/services/prowlarr';
import { DeezerProvider } from '@/services/metadata/providers/DeezerProvider';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Query missing' }, { status: 400 });
  }

  try {
    // Lancer les recherches en parallèle
    const deezer = new DeezerProvider();
    const [prowlarrResults, deezerArtists, deezerAlbums] = await Promise.all([
      ProwlarrService.search(query).catch(e => { console.error(e); return []; }),
      deezer.searchArtist(query).catch(e => { console.error(e); return []; }),
      deezer.searchAlbum(query).catch(e => { console.error(e); return []; })
    ]);

    // 1. Mapper Prowlarr
    const mappedProwlarr = prowlarrResults.map((item: any) => ({
      guid: item.guid,
      title: item.title,
      indexer: item.indexer,
      size: (item.size / (1024 * 1024)).toFixed(1) + ' MB',
      publishDate: item.publishDate,
      downloadUrl: item.downloadUrl,
      infoUrl: item.infoUrl,
      quality: item.title.toLowerCase().includes('flac') ? 'FLAC' : 'MP3',
      protocol: item.protocol || (item.downloadUrl?.includes('.nzb') ? 'usenet' : 'torrent'),
      seeders: item.seeders,
      peers: item.peers
    }));

    // 2. Mapper Deezer
    // On combine les albums trouvés via la recherche directe d'albums
    // ET éventuellement les albums des artistes trouvés (si on veut être exhaustif)
    const allDeezerAlbumsMap = new Map<string, any>();

    // Ajouter les albums trouvés directement via searchAlbum
    deezerAlbums.forEach(album => {
      allDeezerAlbumsMap.set(album.deezerId!, {
        guid: `deezer-${album.deezerId}`,
        title: `[Deezer] ${(album as any).artistName || 'Artiste inconnu'} - ${album.name}`,
        indexer: 'Deezer',
        size: 'N/A',
        publishDate: album.releaseDate,
        downloadUrl: album.deezerId,
        infoUrl: `https://www.deezer.com/album/${album.deezerId}`,
        quality: 'FLAC/320',
        protocol: 'deemix',
        image: album.image
      });
    });

    // Si on a trouvé un artiste très pertinent, on ajoute aussi ses albums (plus lents)
    if (deezerArtists.length > 0 && deezerAlbums.length === 0) {
      const bestArtist = deezerArtists[0];
      const artistAlbums = await deezer.getArtistAlbums(bestArtist.deezerId!);
      artistAlbums.forEach(album => {
        if (!allDeezerAlbumsMap.has(album.deezerId!)) {
          allDeezerAlbumsMap.set(album.deezerId!, {
            guid: `deezer-${album.deezerId}`,
            title: `[Deezer] ${bestArtist.name} - ${album.name}`,
            indexer: 'Deezer',
            size: 'N/A',
            publishDate: album.releaseDate,
            downloadUrl: album.deezerId,
            infoUrl: `https://www.deezer.com/album/${album.deezerId}`,
            quality: 'FLAC/320',
            protocol: 'deemix',
            image: album.image
          });
        }
      });
    }

    const mappedDeezer = Array.from(allDeezerAlbumsMap.values());

    // Fusionner : Deezer en premier (plus propre souvent) puis Prowlarr
    return NextResponse.json([...mappedDeezer, ...mappedProwlarr]);
  } catch (error: any) {
    console.error('API Search Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
