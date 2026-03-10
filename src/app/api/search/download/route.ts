import { NextResponse } from 'next/server';
import { ProwlarrService } from '@/services/prowlarr';
import { SabnzbdService } from '@/services/sabnzbd';
import db from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  try {
    const results = await ProwlarrService.search(query);
    return NextResponse.json(results);
  } catch (error: any) {
    console.error('Search API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { url, title, protocol } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (protocol?.toLowerCase() === 'usenet') {
      const success = await SabnzbdService.addNzbFromUrl(url, title || 'Musicarr Download');
      
      if (success) {
        db.prepare(`
          INSERT INTO activity (type, status, title, message)
          VALUES ('download', 'pending', ?, ?)
        `).run(title, `Téléchargement NZB lancé : ${title}`);
      }

      return NextResponse.json({ success });
    } else {
      // Torrent logic could go here (e.g., Transmission/qBittorrent)
      return NextResponse.json({ error: 'Protocol non supporté pour le moment (Usenet seulement)' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Download API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
