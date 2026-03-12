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
      // On accepte plus de types maintenant pour permettre le tri dans l'UI
      const primaryType = rg['primary-type']?.toLowerCase();
      // On ignore juste les types vraiment non musicaux si besoin, mais ici on va être large
      if (!primaryType) return true;
      
      const secondaryTypes = rg['secondary-types'] || [];
      const isInvalidSecondary = secondaryTypes.some((t: string) => 
        ['Interview', 'Spokenword', 'Audiobook'].includes(t)
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

  async getAlbumTracks(releaseGroupId: string): Promise<any[]> {
    const data = await this.fetchMB(`release-group/${releaseGroupId}`, { inc: 'releases+recordings' });
    const release = data.releases?.[0]; // On prend la première release du groupe
    if (!release) return [];

    // On recharge pour avoir le détail de la release (médias/pistes)
    const releaseData = await this.fetchMB(`release/${release.id}`, { inc: 'recordings' });
    
    const tracks: any[] = [];
    (releaseData.media || []).forEach((m: any) => {
      (m.tracks || []).forEach((t: any) => {
        tracks.push({
          name: t.title,
          number: t.position,
          duration: t.length ? t.length / 1000 : 0,
          disc: m.position || 1
        });
      });
    });

    return tracks;
  }
}
