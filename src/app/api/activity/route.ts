import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { SabnzbdService } from '@/services/sabnzbd';

export async function GET(request: Request) {
  try {
    // L'import des téléchargements SABnzbd terminés était déclenché ici, en
    // effet de bord d'un GET : il ne tournait donc que si un navigateur était
    // ouvert. Il est désormais planifié côté serveur (`src/instrumentation.ts`).
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20') || 20));
    const offset = (page - 1) * pageSize;

    // Ce qui tourne encore est dans `active` : le lister aussi ici le faisait
    // apparaître deux fois, avec un état périmé.
    const filters = ["a.status != 'processing'"];
    const filterParams: string[] = [];
    const type = searchParams.get('type');
    if (type === 'failed') {
      filters.push("a.status = 'failed'");
    } else if (type) {
      filters.push('a.type = ?');
      filterParams.push(type);
    }
    const whereClause = `WHERE ${filters.join(' AND ')}`;

    // 1. Get History count
    const totalRow = db.prepare(`SELECT COUNT(*) as total FROM activity a ${whereClause}`).get(...filterParams) as { total: number };
    const total = totalRow.total;

    // 2. Get History from local DB with pagination
    const history = db.prepare(`
      SELECT a.*, ar.name as artist_name
      FROM activity a
      LEFT JOIN artists ar ON a.artist_id = ar.id
      ${whereClause}
      ORDER BY a.timestamp DESC, a.id DESC
      LIMIT ? OFFSET ?
    `).all(...filterParams, pageSize, offset);

    // 3. Get Active Queue from SABnzbd
    let active: any[] = [];
    try {
      const queue = await SabnzbdService.getQueue();
      if (queue && queue.slots) {
        active = queue.slots.map((slot: any) => ({
          id: `sab-${slot.nzo_id}`,
          type: 'download',
          status: 'downloading',
          title: slot.filename,
          message: `Téléchargement en cours...`,
          details: JSON.stringify({
            size: slot.size,
            percentage: slot.percentage,
            speed: slot.speed,
            timeleft: slot.timeleft,
            mbleft: slot.mbleft
          }),
          timestamp: new Date().toISOString()
        }));
      }
    } catch (e) {
      console.error('Error polling SABnzbd queue:', e);
    }

    // 4. Get local processing activities (Deemix, Scan, etc.)
    const localActive = db.prepare(`
      SELECT id, type, status, title, message, details, timestamp, artist_id
      FROM activity
      WHERE status = 'processing'
      ORDER BY timestamp DESC
    `).all().map((item: any) => ({
      ...item,
      id: `local-${item.id}`
    }));

    // Le scan de la bibliothèque n'a pas de ligne d'activité tant qu'il tourne.
    const progressRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('scan_progress') as { value: string } | undefined;
    let scan: { processed: number; total: number } | null = null;
    if (progressRow?.value) {
      try {
        scan = JSON.parse(progressRow.value);
      } catch {
        scan = null;
      }
    }

    return NextResponse.json({
      active: [...localActive, ...active],
      scan,
      history,
      total,
      page,
      pageSize
    });
  } catch (error: any) {
    console.error('Activity API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, id } = await request.json();

    if (action === 'delete_history') {
      if (id) {
        db.prepare('DELETE FROM activity WHERE id = ?').run(id);
      } else {
        db.prepare('DELETE FROM activity').run();
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
