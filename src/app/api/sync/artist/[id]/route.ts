import { NextRequest, NextResponse } from 'next/server';
import { SyncService } from '@/services/metadata/SyncService';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artistId } = await params;
    const { types, deep } = await request.json().catch(() => ({}));
    const sync = new SyncService();
    
    // On lance la synchro en arrière-plan car elle peut être longue
    // SyncService gère lui-même son enregistrement dans la table 'activity'
    sync.syncArtist(parseInt(artistId), types, deep).catch(err => {
      console.error(`Background Sync Error for artist ${artistId}:`, err);
    });
    
    return NextResponse.json({ 
      success: true, 
      message: 'Synchronisation démarrée en arrière-plan'
    });
  } catch (error: any) {
    console.error('Sync Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
