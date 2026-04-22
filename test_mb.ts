import { MusicBrainzProvider } from './src/services/metadata/providers/MusicBrainzProvider';

async function run() {
  const p = new MusicBrainzProvider();
  const albums = await p.getArtistAlbums('ca891d65-d9b0-4258-89f7-e6ba29d83767', undefined, ['album', 'ep']);
  console.log(`MusicBrainz returned ${albums.length} albums`);
}

run().catch(console.error);
