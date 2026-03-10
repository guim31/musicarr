import { NextResponse } from 'next/server';
import { ProwlarrService } from '@/services/prowlarr';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Query missing' }, { status: 400 });
  }

  try {
    const results = await ProwlarrService.search(query);
    
    // Normalisation des résultats pour le frontend
    const mappedResults = results.map((item: any) => ({
      guid: item.guid,
      title: item.title,
      indexer: item.indexer,
      size: (item.size / (1024 * 1024)).toFixed(1) + ' MB',
      publishDate: item.publishDate,
      downloadUrl: item.downloadUrl,
      infoUrl: item.infoUrl,
      // Détection de la qualité
      quality: item.title.toLowerCase().includes('flac') ? 'FLAC' : 'MP3',
      // Détection du protocole
      protocol: item.protocol || (item.downloadUrl?.includes('.nzb') ? 'usenet' : 'torrent'),
      seeders: item.seeders,
      peers: item.peers
    }));

    return NextResponse.json(mappedResults);
  } catch (error: any) {
    console.error('API Search Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
