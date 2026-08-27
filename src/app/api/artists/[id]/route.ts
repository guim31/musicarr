import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { isInsideLibrary, resolveCoverPath } from '@/lib/paths';
import { parseProviderRef, type ProviderRefKind } from '@/lib/providerRefs';

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

const LinkBody = z.object({
  /** URL d'artiste, MBID nu, ou identifiant numérique accompagné de `provider`. */
  reference: z.string().min(1),
  provider: z.enum(['mbid', 'discogsId', 'deezerId']).optional(),
});

const COLUMNS: Record<ProviderRefKind, 'mbid' | 'discogs_id' | 'deezer_id'> = {
  mbid: 'mbid',
  discogsId: 'discogs_id',
  deezerId: 'deezer_id',
};

/**
 * Rattache manuellement un artiste à une fiche de fournisseur.
 *
 * La recherche automatique ne retient plus qu'une correspondance exacte, ce
 * qui laisse sans source les homonymes et les noms mal orthographiés. Coller
 * l'URL de la bonne fiche est la sortie de secours — et la seule façon
 * honnête de trancher entre deux artistes qui portent le même nom.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const artistId = Number.parseInt(id, 10);
    if (!Number.isInteger(artistId)) {
      return NextResponse.json({ error: 'Identifiant d\u2019artiste invalide' }, { status: 400 });
    }

    const parsed = LinkBody.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Corps de requête invalide', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const artist = db.prepare('SELECT id FROM artists WHERE id = ?').get(artistId);
    if (!artist) {
      return NextResponse.json({ error: 'Artiste non trouvé' }, { status: 404 });
    }

    const ref = parseProviderRef(parsed.data.reference, parsed.data.provider);
    if (!ref) {
      return NextResponse.json(
        {
          error:
            'Référence non reconnue. Collez une URL MusicBrainz, Discogs ou Deezer, ou un MBID.',
        },
        { status: 400 },
      );
    }

    const column = COLUMNS[ref.kind];

    const holder = db
      .prepare(`SELECT id FROM artists WHERE ${column} = ? AND id != ?`)
      .get(ref.id, artistId) as { id: number } | undefined;
    if (holder) {
      return NextResponse.json(
        { error: `Cet identifiant est déjà rattaché à un autre artiste (#${holder.id})` },
        { status: 409 },
      );
    }

    db.prepare(`UPDATE artists SET ${column} = ? WHERE id = ?`).run(ref.id, artistId);

    // Le cache de ce fournisseur devient caduc : il décrivait peut-être
    // quelqu'un d'autre.
    const providerKey = ref.kind === 'mbid' ? 'musicbrainz' : ref.kind === 'discogsId' ? 'discogs' : 'deezer';
    db.prepare('DELETE FROM artist_cache WHERE artist_id = ? AND provider = ?').run(artistId, providerKey);

    return NextResponse.json({ success: true, provider: providerKey, id: ref.id });
  } catch (error) {
    console.error('[Artiste] Rattachement impossible :', error);
    return NextResponse.json({ error: 'Impossible de rattacher cet artiste' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artistId } = await params;
    const { searchParams } = new URL(request.url);
    const deleteFiles = searchParams.get('deleteFiles') === 'true';

    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId) as any;
    if (!artist) {
      return NextResponse.json({ error: 'Artiste non trouvé' }, { status: 404 });
    }

    if (deleteFiles) {
      const albums = db.prepare('SELECT id, path FROM albums WHERE artist_id = ?').all(artistId) as any[];
      const fs = (await import('fs')).default;
      const path = (await import('path')).default;
      
      const artistDirsToCleanup = new Set<string>();

      for (const album of albums) {
        // Delete album folder if it exists.
        // Garde-fou : un champ `path` corrompu (scan interrompu, migration)
        // ne doit jamais faire cibler un dossier hors bibliothèque à rmSync.
        if (album.path && fs.existsSync(album.path)) {
          if (!isInsideLibrary(album.path)) {
            console.error(
              `Suppression refusée : ${album.path} est hors de la bibliothèque configurée`,
            );
          } else {
            try {
              fs.rmSync(album.path, { recursive: true, force: true });
              artistDirsToCleanup.add(path.dirname(album.path));
            } catch (e) {
              console.error(`Error deleting album folder ${album.path}:`, e);
            }
          }
        }

        // Delete cover cache if exists
        const coverPath = resolveCoverPath(String(album.id));
        if (coverPath && fs.existsSync(coverPath)) {
          fs.rmSync(coverPath, { force: true });
        }
      }

      // Try to delete artist directory if it's empty
      for (const dir of artistDirsToCleanup) {
        try {
          if (isInsideLibrary(dir) && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
            fs.rmdirSync(dir);
          }
        } catch (e) {
          console.error(`Error cleaning up artist folder ${dir}:`, e);
        }
      }
    }

    // Delete from DB (foreign keys with CASCADE will delete albums, tracks)
    db.prepare('DELETE FROM artists WHERE id = ?').run(artistId);

    db.prepare(`
      INSERT INTO activity (type, status, title, message)
      VALUES ('scan', 'completed', ?, 'Artiste supprimé')
    `).run(artist.name);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete Artist Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

