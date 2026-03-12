import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: albumId } = await params;
  const coverPath = path.join(process.cwd(), 'data', 'covers', `album_${albumId}.jpg`);

  if (!fs.existsSync(coverPath)) {
    // Fallback to metadata artworkUrl
    const db = (await import('@/lib/db')).default;
    const album = db.prepare('SELECT metadata FROM albums WHERE id = ?').get(albumId) as { metadata: string } | undefined;
    
    if (album?.metadata) {
      try {
        const metadata = JSON.parse(album.metadata);
        if (metadata.artworkUrl) {
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
