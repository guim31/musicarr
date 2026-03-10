import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const discogsToken = db.prepare('SELECT value FROM settings WHERE key = ?').get('discogs_token') as { value: string } | undefined;
    
    return NextResponse.json({
      discogsToken: discogsToken?.value || '',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { discogsToken } = await request.json();

    if (discogsToken !== undefined) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('discogs_token', discogsToken);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
