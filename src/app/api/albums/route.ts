import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '40');
    const sortBy = searchParams.get('sortBy') || 'date'; // 'date', 'title', 'artist'
    const order = searchParams.get('order') || 'desc'; // 'asc', 'desc'
    const search = searchParams.get('search') || '';

    const offset = (page - 1) * limit;

    // Base WHERE clause
    let whereClause = "WHERE al.status = 'downloaded'";
    const params: any[] = [];

    if (search) {
      whereClause += " AND (al.name LIKE ? OR ar.name LIKE ? OR al.album_artist LIKE ?)";
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    // Determine ORDER BY
    let orderBy = "";
    if (sortBy === 'title') {
      orderBy = `al.name COLLATE NOCASE ${order}`;
    } else if (sortBy === 'artist') {
      orderBy = `COALESCE(al.album_artist, ar.name) COLLATE NOCASE ${order}`;
    } else if (sortBy === 'date') {
      orderBy = `al.release_date ${order}, al.id DESC`;
    } else {
      // Default: manual/fixed sort originally was: ORDER BY COALESCE(al.album_artist, ar.name) ASC, al.release_date DESC
      orderBy = `COALESCE(al.album_artist, ar.name) COLLATE NOCASE ASC, al.release_date DESC`;
    }

    // Get total count for pagination
    const countResult = db.prepare(`
      SELECT COUNT(*) as total
      FROM albums al
      LEFT JOIN artists ar ON al.artist_id = ar.id
      ${whereClause}
    `).get(...params) as { total: number };

    // Get paginated albums
    const albums = db.prepare(`
      SELECT 
        al.*, 
        ar.name as artist_name,
        (SELECT COUNT(*) FROM tracks WHERE album_id = al.id) as track_count
      FROM albums al
      LEFT JOIN artists ar ON al.artist_id = ar.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return NextResponse.json({
      albums,
      total: countResult.total,
      page,
      limit,
      totalPages: Math.ceil(countResult.total / limit)
    });
  } catch (error: any) {
    console.error('[API Albums] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
