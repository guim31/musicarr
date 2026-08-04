import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import db from '@/lib/db';
import { maskSecret, resolveSecret } from '@/lib/secrets';
import { SabnzbdService } from '@/services/sabnzbd';

export async function POST(request: Request) {
  try {
    const { url, apiKey, category, action } = await request.json();

    // Le client renvoie le marqueur quand l'utilisateur n'a pas touché au champ :
    // on retombe alors sur la clé déjà en base.
    const resolvedKey = resolveSecret(apiKey, 'sabnzbd_api_key');

    if (action === 'test') {
      const success = await SabnzbdService.testConnection(url, resolvedKey);
      return NextResponse.json({ success });
    }

    if (action === 'save') {
      const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      upsert.run('sabnzbd_url', url);
      upsert.run('sabnzbd_api_key', resolvedKey);
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
      // Jamais la vraie clé : le client n'a besoin que de savoir qu'elle existe.
      apiKey: maskSecret(apiKey?.value),
      category: category?.value || 'music'
    });
  } catch (error: any) {
    console.error('API Sabnzbd GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
