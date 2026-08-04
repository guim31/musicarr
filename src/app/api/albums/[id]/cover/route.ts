import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { resolveCoverPath } from '@/lib/paths';

/** Hôtes autorisés pour la redirection de pochette (CDN des providers). */
const ALLOWED_ARTWORK_HOSTS = [
  'e-cdns-images.dzcdn.net',
  'cdns-images.dzcdn.net',
  'coverartarchive.org',
  'ia801504.us.archive.org',
  'i.discogs.com',
  'img.discogs.com',
  'is1-ssl.mzstatic.com',
];

function isAllowedArtworkUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    return ALLOWED_ARTWORK_HOSTS.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: albumId } = await params;

  const coverPath = resolveCoverPath(albumId);
  if (!coverPath) {
    return new NextResponse('Identifiant invalide', { status: 400 });
  }

  if (!fs.existsSync(coverPath)) {
    // Fallback to metadata artworkUrl
    const db = (await import('@/lib/db')).default;
    const album = db.prepare('SELECT metadata FROM albums WHERE id = ?').get(albumId) as { metadata: string } | undefined;
    
    if (album?.metadata) {
      try {
        const metadata = JSON.parse(album.metadata);
        // L'URL vient d'une API externe : on ne redirige que vers les CDN
        // connus, pour ne pas transformer cette route en redirecteur ouvert.
        if (metadata.artworkUrl && isAllowedArtworkUrl(metadata.artworkUrl)) {
          return NextResponse.redirect(metadata.artworkUrl);
        }
      } catch (e) {
        // Ignore json parse error
      }
    }

    // Return a 404 if really nothing
    return new NextResponse('Not Found', { status: 404 });
  }

  const imageBuffer = fs.readFileSync(coverPath);
  
  return new NextResponse(imageBuffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}
