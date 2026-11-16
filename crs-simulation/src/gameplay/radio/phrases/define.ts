/* =====================================================================================
 * Radio — définition des phrases.
 *
 * Une phrase = une situation (clé) + plusieurs variantes du corps du message. La formule d'appel
 * « APPELÉ ICI APPELANT. » et la formule de fin (« PARLEZ. » / « TERMINÉ. ») sont ajoutées à la composition
 * d'après les rôles et le type de fin (docs/research/00-bible-realisme.md, E.6).
 * Paramètres : {nom}, remplacés par la valeur fournie ou par une valeur par défaut (voir defaults.ts).
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
  readonly variants: readonly string[];
}

export interface PhraseSpec {
  /** Qui parle (défaut : l'unité, paramètre {unite}). */
  de?: PhraseRole;
  /** À qui (défaut : la salle de commandement). */
  a?: PhraseRole;
  canal?: RadioChannel;
  prio?: 0 | 1 | 2;
  /** Formule de fin (défaut : « PARLEZ »). */
  fin?: PhraseEnd;
}

/** Fabrique d'un groupe de phrases : toutes partagent la famille `group`. */
export function group(name: string): (key: string, spec: PhraseSpec, variants: readonly string[]) => PhraseDef {
  return (key, spec, variants) => ({
    key,
    group: name,
    from: spec.de ?? 'unite',
    to: spec.a ?? 'central',
    channel: spec.canal ?? 'unite',
    priority: spec.prio ?? 1,
    end: spec.fin ?? 'parlez',
    variants,
  });
}
