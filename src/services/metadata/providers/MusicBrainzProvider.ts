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

  async getArtistAlbums(
    artistMbid: string, 
    onProgress?: (current: number, total: number) => void, 
    filterTypes?: string[],
    deep?: boolean
  ): Promise<RemoteAlbum[]> {
    let allReleaseGroups: any[] = [];
    let offset = 0;
    let total = 0;
    const maxLimit = deep ? 5000 : 500;

    // Map filterTypes to MusicBrainz primary types
    const mbTypes: string[] = [];
    if (filterTypes && filterTypes.length > 0) {
      if (filterTypes.includes('album') || filterTypes.includes('compilation')) mbTypes.push('album');
      if (filterTypes.includes('ep')) mbTypes.push('ep');
      if (filterTypes.includes('single')) mbTypes.push('single');
      if (filterTypes.includes('appearance')) {
        mbTypes.push('album');
        mbTypes.push('ep');
        mbTypes.push('single');
      }
    }

    do {
      const params: Record<string, string> = {
        artist: artistMbid,
        limit: '100',
        offset: offset.toString()
      };

      if (mbTypes.length > 0) {
        params.type = mbTypes.join('|');
      }

      const data = await this.fetchMB('release-group', params);

      total = data['release-group-count'] || 0;
      const groups = data['release-groups'] || [];
      allReleaseGroups = [...allReleaseGroups, ...groups];
      
      offset += groups.length;
      if (onProgress) onProgress(allReleaseGroups.length, total);
      
      // Petit délai pour respecter les limites de débit de MusicBrainz (1 req/sec recommandé)
      if (offset < total && offset < maxLimit) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } while (offset < total && offset < maxLimit); // On met une limite basée sur deep pour éviter les lenteurs

    const validReleaseGroups = allReleaseGroups.filter((rg: any) => {
      const primaryType = rg['primary-type']?.toLowerCase();
      if (!primaryType) return true;
      
      const secondaryTypes = rg['secondary-types'] || [];
      const isInvalidSecondary = secondaryTypes.some((t: string) => 
        ['Interview', 'Spokenword', 'Audiobook'].includes(t)
      );
      
      if (isInvalidSecondary) return false;

      // Filter by requested types
      if (filterTypes && filterTypes.length > 0) {
        let type = primaryType;
        if (secondaryTypes.includes('Compilation')) type = 'compilation';
        if (secondaryTypes.includes('Split')) type = 'appearance';
        
        // Map MB types to our types
        if (!filterTypes.includes(type)) return false;
      }

      return true;
    });

    console.log(`[MusicBrainz] Filtered ${allReleaseGroups.length} items down to ${validReleaseGroups.length} valid items.`);

    return validReleaseGroups.map((rg: any) => {
      const primaryType = rg['primary-type']?.toLowerCase() || 'album';
      const secondaryTypes = rg['secondary-types'] || [];
      
      let type: any = primaryType;
      if (secondaryTypes.includes('Compilation')) type = 'compilation';
      if (secondaryTypes.includes('Split')) type = 'appearance';

      return {
        name: rg.title,
        mbid: rg.id,
        releaseDate: rg['first-release-date'],
        type,
        image: `https://coverartarchive.org/release-group/${rg.id}/front`
      };
    });
  }

  async getAlbumTracks(releaseGroupId: string): Promise<any[]> {
    const data = await this.fetchMB(`release-group/${releaseGroupId}`, { inc: 'releases' });
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
