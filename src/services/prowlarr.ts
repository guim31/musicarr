import axios from 'axios';
import db from '@/lib/db';

export interface ProwlarrIndexer {
  id: number;
  name: string;
  protocol: string;
  enable: boolean;
  fields: any[];
}

export class ProwlarrService {
  private static async getSettings() {
    const url = db.prepare('SELECT value FROM settings WHERE key = ?').get('prowlarr_url') as { value: string } | undefined;
    const apiKey = db.prepare('SELECT value FROM settings WHERE key = ?').get('prowlarr_api_key') as { value: string } | undefined;
    
    return {
      url: url?.value,
      apiKey: apiKey?.value
    };
  }

  static async testConnection(url: string, apiKey: string) {
    try {
      const response = await axios.get(`${url}/api/v1/system/status`, {
        headers: { 'X-Api-Key': apiKey },
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      console.error('Prowlarr connection test failed:', error);
      return false;
    }
  }

  static async fetchIndexers() {
    const { url, apiKey } = await this.getSettings();
    if (!url || !apiKey) throw new Error('Prowlarr not configured');

    try {
      const response = await axios.get(`${url}/api/v1/indexer`, {
        headers: { 'X-Api-Key': apiKey }
      });
      return response.data as ProwlarrIndexer[];
    } catch (error) {
      console.error('Failed to fetch Prowlarr indexers:', error);
      throw error;
    }
  }

  static async syncIndexers() {
    const indexers = await this.fetchIndexers();
    
    const insert = db.prepare(`
      INSERT INTO indexers (prowlarrId, name, protocol, enabled, config)
      VALUES (@id, @name, @protocol, @enable, @config)
      ON CONFLICT(prowlarrId) DO UPDATE SET
        name = excluded.name,
        protocol = excluded.protocol,
        enabled = excluded.enabled,
        config = excluded.config
    `);

    const transaction = db.transaction((data) => {
      for (const indexer of data) {
        insert.run({
          id: indexer.id,
          name: indexer.name,
          protocol: indexer.protocol,
          enable: indexer.enable ? 1 : 0,
          config: JSON.stringify(indexer.fields)
        });
      }
    });

    transaction(indexers);
    return indexers.length;
  }

  static async search(query: string) {
    const { url, apiKey } = await this.getSettings();
    if (!url || !apiKey) throw new Error('Prowlarr non configuré');

    console.log(`Searching Prowlarr for: "${query}" at ${url}`);

    try {
      // On retire le filtre Usenet exclusif pour ré-inclure les torrents (YGG)
      // mais on conserve les IDs d'indexeurs pour plus de sûreté si besoin
      const indexers = db.prepare('SELECT prowlarrId FROM indexers').all() as any[];
      const indexerIds = indexers.map(row => row.prowlarrId);

      const searchUrl = `${url}/api/v1/search`;
      const searchParams = {
        query: query,
        type: 'search',
        limit: 100, // Important : Prowlarr utilise 'limit' et non 'pageSize'
        offset: 0,
        categories: [3000, 3010, 3020, 3030, 3040], // Restauration des catégories Audio
        indexerIds: indexerIds.length > 0 ? indexerIds : undefined
      };

      console.log(`Prowlarr Global Search: ${searchUrl} for "${query}"`);

      const response = await axios.get(searchUrl, {
        params: searchParams,
        paramsSerializer: {
          indexes: null // Format ?categories=3000&categories=3010...
        },
        headers: { 'X-Api-Key': apiKey }
      });
      
      const allResults = response.data || [];
      console.log(`Prowlarr Results Count: ${allResults.length}`);
      
      const stats = allResults.reduce((acc: any, curr: any) => {
        acc[curr.indexer] = (acc[curr.indexer] || 0) + 1;
        return acc;
      }, {});
      console.log('Usenet results per indexer:', stats);

      return allResults;
    } catch (error: any) {
      if (error.response) {
        console.error('Prowlarr API Error Details:', error.response.data);
      }
      console.error('Prowlarr search failed:', error.message);
      throw error;
    }
  }
}
