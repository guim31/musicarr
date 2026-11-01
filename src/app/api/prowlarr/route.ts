import { NextResponse } from "next/server";
import { errorResponse } from '@/lib/apiError';
export const dynamic = "force-dynamic";
import db from '@/lib/db';
import { maskSecret, resolveServiceSecret } from '@/lib/secrets';
import { ProwlarrService } from '@/services/prowlarr';

export async function POST(request: Request) {
  try {
    const { url, apiKey, action } = await request.json();

    // Le client renvoie le marqueur quand l'utilisateur n'a pas touché au champ :
    // on retombe alors sur la clé déjà en base — à condition que l'adresse
    // n'ait pas changé, sinon la clé partirait vers un serveur quelconque.
    const needsKey = action === 'test' || action === 'save';
    const secret = needsKey
      ? resolveServiceSecret(apiKey, 'prowlarr_api_key', url, 'prowlarr_url')
      : { key: '' };
    if (secret.error !== undefined) {
      return NextResponse.json({ success: false, error: secret.error }, { status: 400 });
    }
    const resolvedKey = secret.key;

    if (action === 'test') {
      const success = await ProwlarrService.testConnection(url, resolvedKey);
      return NextResponse.json({ success });
    }

    if (action === 'save') {
      const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      upsert.run('prowlarr_url', url);
      upsert.run('prowlarr_api_key', resolvedKey);
      
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
    return errorResponse(error);
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
        // Jamais la vraie clé : le client n'a besoin que de savoir qu'elle existe.
        apiKey: maskSecret(apiKey?.value)
      },
      indexers
    });
  } catch (error: any) {
    console.error('API Prowlarr GET Error:', error);
    return errorResponse(error);
  }
}
