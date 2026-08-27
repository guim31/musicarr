import { NextResponse } from 'next/server';
import { MetadataEngine } from '@/services/metadata/MetadataEngine';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();
  const provider = searchParams.get('provider') || undefined;

  if (!query) {
    return NextResponse.json({ error: 'Requête manquante' }, { status: 400 });
  }

  try {
    const engine = new MetadataEngine();
    const results = (await engine.searchArtist(query, provider)).slice(0, 15);
    await engine.enrichArtistImages(results);

    return NextResponse.json(
      results.map(artist => ({
        name: artist.name,
        mbid: artist.mbid ?? null,
        discogsId: artist.discogsId ?? null,
        deezerId: artist.deezerId ?? null,
        itunesId: artist.itunesId ?? null,
        image: artist.image ?? null,
        // La source est désormais affichée : les résultats ne sont plus
        // fusionnés entre fournisseurs, l'utilisateur doit savoir d'où vient
        // la fiche qu'il ajoute.
        source: artist.source ?? null,
        genre: artist.genres?.join(', ') || '',
        country: artist.description || '',
      })),
    );
  } catch (error) {
    console.error('[Recherche artiste] Erreur :', error);
    return NextResponse.json({ error: 'La recherche a échoué' }, { status: 500 });
  }
}
