import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '40') || 40));
    const sortBy = searchParams.get('sortBy') || 'recent'; // 'recent', 'date', 'title', 'artist'
    // Interpolé dans la requête : seule une liste blanche écarte l'injection SQL.
    const order = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
    const search = searchParams.get('search') || '';
    const format = searchParams.get('format') || '';

    const offset = (page - 1) * limit;

    // Base WHERE clause
    let whereClause = "WHERE al.status = 'downloaded'";
    const params: (string | number)[] = [];

    if (search) {
      whereClause += " AND (al.name LIKE ? OR ar.name LIKE ? OR al.album_artist LIKE ?)";
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    if (format === 'lossless') {
      whereClause += " AND al.quality IN ('FLAC', 'WAVE')";
    } else if (format === 'lossy') {
      whereClause += " AND (al.quality IS NULL OR al.quality NOT IN ('FLAC', 'WAVE'))";
    }

    // Determine ORDER BY
    let orderBy = "";
    if (sortBy === 'title') {
      orderBy = `al.name COLLATE NOCASE ${order}`;
    } else if (sortBy === 'artist') {
      orderBy = `COALESCE(al.album_artist, ar.name) COLLATE NOCASE ${order}, al.release_date DESC`;
    } else if (sortBy === 'date') {
      // Année de sortie, pas date d'ajout : la table n'horodate pas les albums.
      orderBy = `al.release_date ${order}, al.id DESC`;
    } else {
      // Les identifiants sont croissants : le plus grand est le dernier arrivé.
      orderBy = `al.id ${order}`;
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
