import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import db from '@/lib/db';

export async function GET() {
  try {
    const discogsToken = db.prepare('SELECT value FROM settings WHERE key = ?').get('discogs_token') as { value: string } | undefined;
    const deezerArl = db.prepare('SELECT value FROM settings WHERE key = ?').get('deezer_arl') as { value: string } | undefined;
    const deezerQuality = db.prepare('SELECT value FROM settings WHERE key = ?').get('deezer_quality') as { value: string } | undefined;
    
    return NextResponse.json({
      discogsToken: discogsToken?.value || '',
      deezerArl: deezerArl?.value || '',
      deezerQuality: deezerQuality?.value || 'MP3_320',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { discogsToken, deezerArl, deezerQuality } = await request.json();

    if (discogsToken !== undefined) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('discogs_token', discogsToken);
    }

    if (deezerArl !== undefined) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('deezer_arl', deezerArl);
    }

    if (deezerQuality !== undefined) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('deezer_quality', deezerQuality);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
