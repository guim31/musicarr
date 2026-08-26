import pkg from '../../package.json';

/** Version publiée, lue à la source pour ne pas dériver des tags Docker. */
export const APP_VERSION: string = pkg.version;

export const APP_REPOSITORY = 'https://github.com/guim31/musicarr';

/**
 * User-Agent envoyé aux API de métadonnées.
 *
 * MusicBrainz l'impose et applique des restrictions plus dures aux clients
 * qu'il ne peut pas identifier. L'ancienne valeur pointait vers un dépôt
 * inexistant (`guilhem/musicarr`) et annonçait une version périmée.
 */
export const USER_AGENT = `Musicarr/${APP_VERSION} ( ${APP_REPOSITORY} )`;
