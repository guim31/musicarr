import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import db from '@/lib/db';
import { ProwlarrService } from '@/services/prowlarr';

export async function POST(request: Request) {
  try {
    const { url, apiKey, action } = await request.json();

    if (action === 'test') {
      const success = await ProwlarrService.testConnection(url, apiKey);
      return NextResponse.json({ success });
    }

    if (action === 'save') {
      const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      upsert.run('prowlarr_url', url);
      upsert.run('prowlarr_api_key', apiKey);
      
      // Try to sync immediately if save is successful
      try {
        const count = await ProwlarrService.syncIndexers();
        return NextResponse.json({ success: true, indexersSynced: count });
      } catch (e) {
        return NextResponse.json({ success: true, syncError: true });
      }
    }

    if (action === 'sync') {
      const count = await ProwlarrService.syncIndexers();
      return NextResponse.json({ success: true, count });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('API Prowlarr POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const url = db.prepare('SELECT value FROM settings WHERE key = ?').get('prowlarr_url') as { value: string } | undefined;
    const apiKey = db.prepare('SELECT value FROM settings WHERE key = ?').get('prowlarr_api_key') as { value: string } | undefined;
    const indexers = db.prepare('SELECT * FROM indexers').all();

    return NextResponse.json({
      config: {
        url: url?.value || '',
        apiKey: apiKey?.value || ''
      },
      indexers
    });
  } catch (error: any) {
    console.error('API Prowlarr GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
