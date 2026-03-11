import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { SabnzbdService } from '@/services/sabnzbd';

export async function GET() {
  try {
    // 1. Get History from local DB
    const history = db.prepare(`
      SELECT a.*, ar.name as artist_name 
      FROM activity a
      LEFT JOIN artists ar ON a.artist_id = ar.id
      ORDER BY a.timestamp DESC
      LIMIT 100
    `).all();

    // 2. Get Active Queue from SABnzbd
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

    // 3. Get local processing activities (Deemix, Scan, etc.)
    const localActive = db.prepare(`
      SELECT id, type, status, title, message, details, timestamp
      FROM activity
      WHERE status = 'processing'
      ORDER BY timestamp DESC
    `).all().map((item: any) => ({
      ...item,
      id: `local-${item.id}`
    }));

    return NextResponse.json({
      active: [...localActive, ...active],
      history
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
