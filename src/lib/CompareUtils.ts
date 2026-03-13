/**
 * Utilitaires pour la comparaison robuste de noms d'artistes et d'albums.
 * Permet d'éviter les doublons dus à la ponctuation, aux accents, 
 * aux articles ou aux caractères spéciaux.
 */

export class CompareUtils {
  /**
   * Normalise une chaîne pour la comparaison.
   * - Retire les accents (diacritiques)
   * - Passage en minuscule
   * - Retire les articles au début (The, A, An, L', Le, La...)
   * - Remplace les '&' par 'and' (optionnel, mais ici on va juste tout simplifier)
   * - Retire toute la ponctuation et les caractères non-alphanumériques
   */
  static normalize(str: string | null | undefined): string {
    if (!str) return '';

    return str
      .trim()
      .normalize('NFD') // Décompose les caractères accentués (ex: é -> e + ´)
      .replace(/[\u0300-\u036f]/g, '') // Supprime les marques d'accents
      .toLowerCase()
      // Gestion des articles au début (français et anglais)
      .replace(/^(the|a|an|le|la|les|l'|der|die|das)\s+/i, '')
      .replace(/^l'/i, '')
      // Gestion des conjonctions communes pour les aligner
      .replace(/\s+&\s+/g, 'and')
      // Suppression de tout ce qui n'est pas lettre ou chiffre
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Compare deux chaînes de manière "floue" mais robuste.
   */
  static compare(str1: string, str2: string): boolean {
    const n1 = this.normalize(str1);
    const n2 = this.normalize(str2);
    return n1 !== '' && n1 === n2;
  }
}
