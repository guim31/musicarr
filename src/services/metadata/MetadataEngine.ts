import { CompareUtils } from '@/lib/CompareUtils';
import { MusicBrainzProvider } from './providers/MusicBrainzProvider';
import { DiscogsProvider } from './providers/DiscogsProvider';
import { DeezerProvider } from './providers/DeezerProvider';
import { ITunesProvider } from './providers/ITunesProvider';
import type { MetadataProvider, RemoteAlbum, RemoteArtist, RemoteTrack } from './types';

const SEARCH_TIMEOUT_MS = 15_000;

export class MetadataEngine {
  private buildProviders(): MetadataProvider[] {
    return [
      new MusicBrainzProvider(),
      new DiscogsProvider(),
      new DeezerProvider(),
      new ITunesProvider(),
    ];
  }

  /**
   * Recherche un artiste chez un ou tous les fournisseurs.
   *
   * Les résultats ne sont **plus fusionnés entre fournisseurs**. Ils l'étaient
   * par nom normalisé, ce qui produisait, pour les innombrables homonymes de
   * la musique — « Nirvana », « Bad Company », « Prince » — une fiche unique
   * portant le MBID de l'un et l'identifiant Deezer de l'autre. Cette fiche
   * était ensuite enregistrée telle quelle : l'artiste naissait en base avec
   * des identifiants désignant deux personnes différentes.
   *
   * Chaque résultat porte donc sa source et ses seuls identifiants. C'est à
   * l'utilisateur — ou à la correspondance forte de `SyncService` — de relier
   * les fournisseurs entre eux.
   */
  async searchArtist(query: string, providerName?: string): Promise<RemoteArtist[]> {
    const providers = providerName
      ? this.buildProviders().filter(p => p.name.toLowerCase() === providerName.toLowerCase())
      : this.buildProviders();

    const results = await Promise.all(
      providers.map(async provider => {
        try {
          return await provider.searchArtist(query, AbortSignal.timeout(SEARCH_TIMEOUT_MS));
        } catch (error) {
          console.warn(`[Recherche] ${provider.name} a échoué :`, (error as Error).message);
          return [] as RemoteArtist[];
        }
      }),
    );

    // Dédoublonnage **à l'intérieur** d'un fournisseur seulement : un même
    // artiste renvoyé deux fois par MusicBrainz est un doublon, le même nom
    // chez deux fournisseurs ne l'est pas forcément.
    const merged: RemoteArtist[] = [];
    for (const providerResults of results) {
      const seen = new Set<string>();
      for (const artist of providerResults) {
        const key = `${artist.source}|${CompareUtils.normalize(artist.name)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(artist);
      }
    }

    // Les correspondances exactes d'abord, puis le score du fournisseur.
    const normalizedQuery = CompareUtils.normalize(query);
    return merged.sort((a, b) => {
      const exactA = CompareUtils.normalize(a.name) === normalizedQuery ? 1 : 0;
      const exactB = CompareUtils.normalize(b.name) === normalizedQuery ? 1 : 0;
      if (exactA !== exactB) return exactB - exactA;
      return (b.score ?? 0) - (a.score ?? 0);
    });
  }

  /** Complète les fiches sans image par la pochette d'un de leurs albums. */
  async enrichArtistImages(artists: RemoteArtist[], limit = 5): Promise<void> {
    const itunes = new ITunesProvider();
    await Promise.all(
      artists.slice(0, limit).map(async artist => {
        if (artist.image) return;
        try {
          artist.image = await itunes.getArtistImage(artist.name, AbortSignal.timeout(3000));
        } catch {
          // Enrichissement d'agrément : son échec ne doit rien interrompre.
        }
      }),
    );
  }

  async getAlbumTracks(mbid?: string, deezerId?: string): Promise<RemoteTrack[]> {
    const signal = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
    if (deezerId) return new DeezerProvider().getAlbumTracks(deezerId, signal);
    if (mbid) return new MusicBrainzProvider().getAlbumTracks(mbid, signal);
    return [];
  }

  /**
   * Retrouve **une** sortie précise.
   *
   * Remplace l'appel à la discographie complète que faisaient les routes de
   * suggestion : récupérer 500 release-groups, 5 pages Discogs et 300 albums
   * Deezer pour en garder un seul coûtait une minute et des centaines de
   * requêtes externes, sans jamais consulter le cache.
   */
  async findRelease(
    artistName: string,
    title: string,
  ): Promise<(RemoteAlbum & { artistName?: string }) | null> {
    const deezer = new DeezerProvider();
    const signal = AbortSignal.timeout(SEARCH_TIMEOUT_MS);

    let candidates: (RemoteAlbum & { artistName?: string })[] = [];
    try {
      candidates = await deezer.searchAlbum(`${artistName} ${title}`, signal);
    } catch (error) {
      console.warn('[Recherche sortie] Deezer a échoué :', (error as Error).message);
      return null;
    }

    const wantedArtist = CompareUtils.normalize(artistName);
    const wantedRelease = CompareUtils.releaseKey(title);

    // Correspondance exacte sur l'artiste *et* la sortie, éditions confondues.
    const exact = candidates.find(
      c =>
        CompareUtils.releaseKey(c.name) === wantedRelease &&
        (!c.artistName || CompareUtils.normalize(c.artistName) === wantedArtist),
    );
    if (exact) return exact;

    // À défaut, une correspondance sur la seule sortie — mieux vaut rien que
    // le rapprochement par sous-chaîne d'avant, qui associait « Live » à
    // « Live After Death ».
    return candidates.find(c => CompareUtils.releaseKey(c.name) === wantedRelease) ?? null;
  }
}
