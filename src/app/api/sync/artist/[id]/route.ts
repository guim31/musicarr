import { NextRequest, NextResponse } from 'next/server';
import { SyncService } from '@/services/metadata/SyncService';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artistId } = await params;
    const sync = new SyncService();
    const count = await sync.syncArtist(parseInt(artistId));
    
    return NextResponse.json({ 
      success: true, 
      newAlbumsFound: count 
    });
  } catch (error: any) {
    console.error('Sync Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
