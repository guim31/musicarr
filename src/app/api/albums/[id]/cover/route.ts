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
    // Return a default placeholder or 404
    return new NextResponse('Not Found', { status: 404 });
  }

  const imageBuffer = fs.readFileSync(coverPath);
  
  return new NextResponse(imageBuffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
