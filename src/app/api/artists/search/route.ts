import { NextResponse } from 'next/server';
import { MetadataEngine } from '@/services/metadata/MetadataEngine';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const provider = searchParams.get('provider') || undefined;

  if (!query) {
    return NextResponse.json({ error: 'Query missing' }, { status: 400 });
  }

  try {
    const engine = new MetadataEngine();
    const results = await engine.searchArtist(query, provider);

    // Normalize format for frontend
    const formattedResults = results.slice(0, 10).map((artist: any) => ({
      name: artist.name,
      mbid: artist.mbid || null,
      discogsId: artist.discogsId || null,
      deezerId: artist.deezerId || null,
      itunesId: artist.itunesId || null,
      image: artist.image || null,
      genre: artist.genres?.join(', ') || artist.type || 'Unknown',
      country: artist.description || artist.country || ''
    }));

    return NextResponse.json(formattedResults);
  } catch (error: any) {
    console.error('API Artist Search Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
