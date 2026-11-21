/* =====================================================================================
 * Radio — définition des phrases.
 *
 * Une phrase = une situation (clé) + plusieurs variantes du corps du message. La formule d'appel
 * « APPELÉ ICI APPELANT. » (ou « ICI APPELANT. » pour une réponse) et la formule de fin (« PARLEZ. » /
 * « TERMINÉ. ») sont ajoutées à la composition d'après les rôles et le type de fin
 * (docs/research/00-bible-realisme.md, E.6).
 * Paramètres : {nom}, remplacés par la valeur fournie ou par une valeur par défaut (voir defaults.ts).
 *
 * Règles de rédaction des variantes (vérifiées par tests/unit/radio.phrases.test.ts) :
 *   - les variantes d'une même clé disent LA MÊME CHOSE avec d'autres mots : aucune n'invente un fait que
 *     l'appelant n'a pas fourni (vent, nombre, moyen employé…), puisque la variante est tirée au hasard ;
 *   - un paramètre de quantité est toujours suivi de son nom ({nombre} personnes, {distance} mètres), ou
 *     placé derrière un libellé (« Volume : {volume} ») : la valeur par défaut donne ainsi une phrase correcte ;
 *   - ni indicatif ni « PARLEZ / TERMINÉ » dans le corps : la composition s'en charge.
 * ===================================================================================== */

import type { RadioChannel } from '@/core/contracts';
import type { PhraseEnd, PhraseRole } from '../api';

export interface PhraseDef {
  readonly key: string;
  readonly group: string;
  readonly from: PhraseRole;
  readonly to: PhraseRole;
  readonly channel: RadioChannel;
  readonly priority: 0 | 1 | 2;
  readonly end: PhraseEnd;
  /** Réponse à un appel : la formule d'appel se réduit à « ICI APPELANT. » (bible E.7). */
  readonly reply: boolean;
  readonly variants: readonly string[];
}

export interface PhraseSpec {
  /** Qui parle (défaut : l'unité, paramètre {unite}). */
  de?: PhraseRole;
  /** À qui (défaut : la salle de commandement). */
  a?: PhraseRole;
  /**
   * Canal (défaut : « commandement » dès que la salle est l'un des deux correspondants, « unite » sinon) :
   * un appel et sa réponse passent ainsi par le même canal et ne se chevauchent jamais.
   */
  canal?: RadioChannel;
  prio?: 0 | 1 | 2;
  /** Formule de fin (défaut : « PARLEZ »). */
  fin?: PhraseEnd;
  /** Réponse à un appel : « ICI APPELANT. » sans rappeler l'appelé. */
  reponse?: boolean;
}

/** Fabrique d'un groupe de phrases : toutes partagent la famille `group` et les réglages par défaut `base`. */
export function group(name: string, base: PhraseSpec = {}): (key: string, spec: PhraseSpec, variants: readonly string[]) => PhraseDef {
  return (key, own, variants) => {
    const spec: PhraseSpec = { ...base, ...own };
    const from = spec.de ?? 'unite';
    const to = spec.a ?? 'central';
    return {
      key,
      group: name,
      from,
      to,
      channel: spec.canal ?? (from === 'central' || to === 'central' ? 'commandement' : 'unite'),
      priority: spec.prio ?? 1,
      end: spec.fin ?? 'parlez',
      reply: spec.reponse === true,
      variants,
    };
  };
}
