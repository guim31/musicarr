import { NextResponse } from 'next/server';
import { SabnzbdService } from '@/services/sabnzbd';
import { DeemixService } from '@/services/DeemixService';

export async function POST(request: Request) {
  try {
    const { url, title, protocol } = await request.json();

    if (!url || !title) {
      return NextResponse.json({ error: 'URL et Titre requis' }, { status: 400 });
    }

    if (protocol === 'deemix') {
      // Pour Deezer, 'url' contient le deezerAlbumId
      const success = await DeemixService.downloadAlbum(url);
      if (success) {
        return NextResponse.json({ success: true, message: 'Téléchargement Deezer démarré' });
      } else {
        return NextResponse.json({ error: 'Échec du démarrage du téléchargement Deezer' }, { status: 500 });
      }
    }

    if (protocol === 'torrent') {
      return NextResponse.json({ error: 'Le téléchargement de torrents n\'est pas encore supporté (SABnzbd uniquement configuré)' }, { status: 400 });
    }

    // Le paramètre URL devrait être le downloadUrl fourni par Prowlarr
    const success = await SabnzbdService.addNzbFromUrl(url, title);
    
    if (success) {
      return NextResponse.json({ success: true, message: 'Ajouté à SABnzbd avec succès' });
    } else {
      return NextResponse.json({ error: 'Échec de l\'ajout à SABnzbd' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('API Download Error:', error);
    return NextResponse.json({ error: error.message || 'Erreur interne lors du téléchargement' }, { status: 500 });
  }
}
