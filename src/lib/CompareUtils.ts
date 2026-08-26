/**
 * Utilitaires de comparaison de noms d'artistes et de titres de sorties.
 *
 * Deux fonctions distinctes, volontairement :
 *
 * - `normalize` sert à la **comparaison stricte**. Elle neutralise ce qui ne
 *   porte pas de sens (accents, casse, ponctuation, article de tête) et rien
 *   d'autre : deux titres réellement différents doivent produire deux clés
 *   différentes.
 * - `releaseKey` sert au **regroupement des éditions** d'une même sortie.
 *   Elle retire en plus les mentions d'édition — « Remastered 2015 »,
 *   « Deluxe Edition », « Bonus Track Version » — qui sont la première cause
 *   de doublons dans les catalogues.
 *
 * Ne pas confondre : élargir `normalize` recréerait les collisions
 * (« Kid A » ≡ « Kid »), restreindre `releaseKey` recréerait les doublons.
 */

/**
 * Article de tête retiré par `normalize`, une fois la chaîne dé-accentuée.
 *
 * Deux formes : l'article suivi d'une espace (« The Beatles ») et l'article
 * élidé (« L'Impératrice »). Seul `l'` est traité en élision : `d'` fait
 * partie de noms propres (« D'Angelo ») où le retirer serait faux.
 *
 * Conséquence assumée : « La Femme » et « Femme » produisent la même clé, au
 * même titre que « The Beatles » et « Beatles ». C'est le comportement
 * recherché — les arborescences de fichiers omettent régulièrement l'article.
 */
const LEADING_ARTICLE = /^(?:l['\u2019]\s*|(?:the|a|an|le|la|les|un|une|der|die|das|el|los|las|il|lo|gli)\s+)/;

/** Conjonctions alignées entre elles : « Simon & Garfunkel » ≡ « Simon and Garfunkel ». */
const CONJUNCTION = /\s+(?:&|and|et|\+)\s+/g;

/**
 * Mentions d'édition. Volontairement absentes : `live`, `remix`, `acoustic`,
 * `instrumental`, `demo` — ce sont des sorties distinctes, pas des rééditions
 * d'une même sortie, et les fusionner ferait disparaître des albums réels.
 */
const EDITION_MARKER =
  /\b(?:remaster\w*|remasteris\w*|remasterizad\w*|deluxe|expanded|anniversary|anniversaire|bonus|reissue|re-issue|reedition|reedicion|collectors?|explicit|clean|digipak|editions?|edicion|edizione|mono|stereo|remixed\s+and\s+remastered)\b/;

/** Une année seule entre parenthèses : « (2011) » accompagne presque toujours un remaster. */
const BARE_YEAR = /^(?:19|20)\d{2}$/;

/** Mention d'édition traînant en fin de titre sans séparateur : « Killers Remastered ». */
const TRAILING_MARKER =
  /[\s,]+(?:(?:19|20)\d{2}\s+)?(?:remaster\w*|remasteris\w*|deluxe|reissue|reedition)\s*$/;

export class CompareUtils {
  /** Minuscules sans diacritiques — base commune à toutes les comparaisons. */
  private static deaccent(str: string): string {
    return str
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  /**
   * Normalise une chaîne pour une comparaison stricte.
   *
   * - dé-accentue et passe en minuscules ;
   * - retire l'article **de tête uniquement** — « The Beatles » ≡ « Beatles »,
   *   mais « Kid A » reste distinct de « Kid » ;
   * - aligne les conjonctions (`&` / `and` / `et` / `+`) ;
   * - retire tout ce qui n'est ni lettre ni chiffre.
   */
  static normalize(str: string | null | undefined): string {
    if (!str) return '';

    const base = CompareUtils.deaccent(str);
    const withoutArticle = base.replace(LEADING_ARTICLE, '');

    // Un titre entièrement composé d'un article (« A » de Jethro Tull) doit
    // rester comparable : on ne le vide pas.
    const source = withoutArticle.trim() ? withoutArticle : base;

    return source.replace(CONJUNCTION, ' ').replace(/[^a-z0-9]/g, '');
  }

  /** Vrai si ce segment ne désigne qu'une édition, et non la sortie elle-même. */
  private static isEditionSegment(segment: string): boolean {
    const s = segment.trim();
    if (!s) return false;
    if (BARE_YEAR.test(s)) return true;
    return EDITION_MARKER.test(s);
  }

  /**
   * Retire les mentions d'édition d'un titre, sans toucher au reste.
   *
   * Traite les trois formes rencontrées dans les catalogues :
   * `Titre (Deluxe Edition)`, `Titre [2011]`, `Titre - Remastered 2015`.
   */
  static stripEditionQualifiers(title: string | null | undefined): string {
    if (!title) return '';

    let s = CompareUtils.deaccent(title);

    // 1. Segments entre parenthèses, crochets ou accolades.
    s = s.replace(/[([{]([^)\]}]*)[)\]}]/g, (match, inner: string) =>
      CompareUtils.isEditionSegment(inner) ? ' ' : match,
    );

    // 2. Suffixes après un tiret, éventuellement empilés
    //    (« Titre - Deluxe - Remastered 2015 »).
    let previous: string;
    do {
      previous = s;
      s = s.replace(/\s+[-–—]\s+([^-–—]+)$/, (match, tail: string) =>
        CompareUtils.isEditionSegment(tail) ? '' : match,
      );
    } while (s !== previous);

    // 3. Mention traînante sans séparateur.
    s = s.replace(TRAILING_MARKER, '');

    const cleaned = s.replace(/[\s\-–—,:;]+$/, '').trim();

    // Un titre qui n'était *que* la mention d'édition reste lui-même.
    return cleaned || CompareUtils.deaccent(title);
  }

  /**
   * Clé de regroupement d'une sortie : toutes les éditions d'un même album
   * produisent la même clé.
   *
   * Volontairement indépendante du type : les fournisseurs se contredisent
   * régulièrement sur le type d'une même sortie (un maxi vinyle vu comme album
   * chez l'un, comme single chez l'autre), et intégrer le type à la clé
   * recréerait un doublon à chaque désaccord. Le type est résolu par vote,
   * après regroupement.
   */
  static releaseKey(title: string | null | undefined): string {
    if (!title) return '';
    return CompareUtils.normalize(CompareUtils.stripEditionQualifiers(title));
  }

  /** Compare deux chaînes de manière tolérante à la casse et à la ponctuation. */
  static compare(str1: string, str2: string): boolean {
    const n1 = CompareUtils.normalize(str1);
    const n2 = CompareUtils.normalize(str2);
    return n1 !== '' && n1 === n2;
  }

  /** Vrai si deux titres désignent la même sortie, éditions confondues. */
  static sameRelease(title1: string, title2: string): boolean {
    const k1 = CompareUtils.releaseKey(title1);
    const k2 = CompareUtils.releaseKey(title2);
    return k1 !== '' && k1 === k2;
  }
}
