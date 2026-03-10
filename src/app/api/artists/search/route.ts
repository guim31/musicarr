import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Query missing' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(query)}&fmt=json`, {
      headers: {
        'User-Agent': 'Musicarr/0.1.0 ( https://github.com/yourusername/musicarr )'
      }
    });
    const data = await res.json();
    
    // Normalize format
    const results = data.artists.slice(0, 10).map((artist: any) => ({
      name: artist.name,
      mbid: artist.id,
      itunesId: null,
      image: null, // MusicBrainz doesn't provide artist images directly
      genre: artist.disambiguation || artist.type || 'Unknown',
      country: artist.country || ''
    }));

    return NextResponse.json(results);
  } catch (error: any) {
    console.error('API Artist Search Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
