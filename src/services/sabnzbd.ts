import axios from 'axios';
import db from '@/lib/db';

export class SabnzbdService {
  private static async getSettings() {
    const url = db.prepare('SELECT value FROM settings WHERE key = ?').get('sabnzbd_url') as { value: string } | undefined;
    const apiKey = db.prepare('SELECT value FROM settings WHERE key = ?').get('sabnzbd_api_key') as { value: string } | undefined;
    const category = db.prepare('SELECT value FROM settings WHERE key = ?').get('sabnzbd_category') as { value: string } | undefined;
    
    return {
      url: url?.value,
      apiKey: apiKey?.value,
      category: category?.value || 'music'
    };
  }

  static async testConnection(url: string, apiKey: string) {
    try {
      const response = await axios.get(`${url}/api?mode=status&output=json&apikey=${apiKey}`, {
        timeout: 5000
      });
      return response.status === 200 && !response.data.error;
    } catch (error) {
      console.error('SABnzbd connection test failed:', error);
      return false;
    }
  }

  static async addNzbFromUrl(nzbUrl: string, name: string) {
    const { url, apiKey, category } = await this.getSettings();
    if (!url || !apiKey) throw new Error('SABnzbd not configured');

    try {
      const response = await axios.get(`${url}/api?mode=addurl&name=${encodeURIComponent(nzbUrl)}&nzbname=${encodeURIComponent(name)}&cat=${category}&output=json&apikey=${apiKey}`);
      return response.data.status === true;
    } catch (error) {
      console.error('Failed to add NZB to SABnzbd:', error);
      throw error;
    }
  }

  static async getQueue() {
    const { url, apiKey } = await this.getSettings();
    if (!url || !apiKey) return { slots: [], speed: '0', mbleft: '0' };

    try {
      const response = await axios.get(`${url}/api?mode=queue&output=json&apikey=${apiKey}`);
      return response.data.queue;
    } catch (error) {
      console.error('Failed to get SABnzbd queue:', error);
      return { slots: [], speed: '0', mbleft: '0' };
    }
  }
}
