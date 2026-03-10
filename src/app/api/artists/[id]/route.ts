import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artistId } = await params;
    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId);
    
    if (!artist) {
      return NextResponse.json({ error: 'Artiste non trouvé' }, { status: 404 });
    }

    return NextResponse.json(artist);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
