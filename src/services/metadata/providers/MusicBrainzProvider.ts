import { MetadataProvider, RemoteAlbum, RemoteArtist } from '../types';

export class MusicBrainzProvider implements MetadataProvider {
  name = 'MusicBrainz';
  private baseUrl = 'https://musicbrainz.org/ws/2';
  private userAgent = 'Musicarr/0.1.0 ( https://github.com/guilhem/musicarr )';

  private async fetchMB(endpoint: string, params: Record<string, string> = {}) {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    params.fmt = 'json';
    Object.entries(params).forEach(([key, val]) => url.searchParams.append(key, val));

    const res = await fetch(url, {
      headers: { 'User-Agent': this.userAgent }
    });

    if (!res.ok) throw new Error(`MusicBrainz error: ${res.statusText}`);
    return res.json();
  }

  async searchArtist(query: string): Promise<RemoteArtist[]> {
    const data = await this.fetchMB('artist', { query });
    return (data.artists || []).map((a: any) => ({
      name: a.name,
      mbid: a.id,
      genres: a.tags?.map((t: any) => t.name) || [],
      description: a.area?.name ? `Origine: ${a.area.name}` : ''
    }));
  }

  async getArtistAlbums(artistMbid: string): Promise<RemoteAlbum[]> {
    const data = await this.fetchMB('release-group', {
      artist: artistMbid,
      limit: '100'
    });

    const validReleaseGroups = (data['release-groups'] || []).filter((rg: any) => {
      const primaryType = rg['primary-type']?.toLowerCase();
      if (primaryType !== 'album' && primaryType !== 'ep') return false;

      const secondaryTypes = rg['secondary-types'] || [];
      const isInvalidSecondary = secondaryTypes.some((t: string) => 
        ['Live', 'Compilation', 'Remix', 'Interview', 'Spokenword', 'Audiobook', 'Mixtape/Street'].includes(t)
      );
      
      return !isInvalidSecondary;
    });

    return validReleaseGroups.map((rg: any) => ({
      name: rg.title,
      mbid: rg.id,
      releaseDate: rg['first-release-date'],
      type: rg['primary-type']?.toLowerCase() || 'album',
      image: `https://coverartarchive.org/release-group/${rg.id}/front`
    }));
  }
}
