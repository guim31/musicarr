import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import db from '@/lib/db';
import { SabnzbdService } from '@/services/sabnzbd';

export async function POST(request: Request) {
  try {
    const { url, apiKey, category, action } = await request.json();

    if (action === 'test') {
      const success = await SabnzbdService.testConnection(url, apiKey);
      return NextResponse.json({ success });
    }

    if (action === 'save') {
      const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      upsert.run('sabnzbd_url', url);
      upsert.run('sabnzbd_api_key', apiKey);
      upsert.run('sabnzbd_category', category);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('API Sabnzbd POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const url = db.prepare('SELECT value FROM settings WHERE key = ?').get('sabnzbd_url') as { value: string } | undefined;
    const apiKey = db.prepare('SELECT value FROM settings WHERE key = ?').get('sabnzbd_api_key') as { value: string } | undefined;
    const category = db.prepare('SELECT value FROM settings WHERE key = ?').get('sabnzbd_category') as { value: string } | undefined;

    return NextResponse.json({
      url: url?.value || '',
      apiKey: apiKey?.value || '',
      category: category?.value || 'music'
    });
  } catch (error: any) {
    console.error('API Sabnzbd GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
