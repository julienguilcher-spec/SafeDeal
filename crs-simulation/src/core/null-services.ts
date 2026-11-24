/* =====================================================================================
 * Services neutres du GameContext : une implémentation saine de chaque service, pour que le jeu
 * et les tests tournent avec n'importe quel sous-ensemble de modules. Un module remplace le
 * service neutre dans son provide() : `ctx.hazards = this.api`.
 *
 *   world         plan infini à y = 0, aucune collision, chemins en ligne droite     (null-world)
 *   env           midi, temps clair ; modifiable                                    (null-sim)
 *   hazards       aucun gaz, aucune fumée, aucun feu                                (null-sim)
 *   health        hurt retire des points de vie, met à terre à zéro, événements     (null-sim)
 *   director      aucune phase, tension 0                                           (null-sim)
 *   actions       inventaire réel ; aucun usage possible                            (null-items)
 *   interactions  registre fonctionnel avec durée et annulation                     (null-items)
 *   archetypes    spawn = people.spawn                                              (null-items)
 *   law           journaux tenus, sommations qui progressent, verdict « licite »    (null-law)
 *   radio         journal + événement radio:message                                 (null-law)
 *   player        état, possess, bascule de caméra                                  (null-presentation)
 *   ui            journalise en console en mode debug                               (null-presentation)
 *   audio         sans effet                                                        (null-presentation)
 *   input         tout à zéro                                                       (null-presentation)
 * ===================================================================================== */

import type {
  ActionApi, ArchetypeApi, AudioApi, DirectorApi, GameContext, HazardApi, HealthApi, InputState,
  LawApi, RadioApi,
} from './contracts';
import { createNullActions, createNullArchetypes, createNullInteractions } from './null-items';
import type { NullInteractions } from './null-items';
import { createNullLaw, createNullRadio } from './null-law';
import { createNullAudio, createNullInput, createNullPlayer, createNullUi } from './null-presentation';
import type { NullPlayer, NullUi } from './null-presentation';
import { createNullDirector, createNullEnv, createNullHazards, createNullHealth } from './null-sim';
import type { NullEnv } from './null-sim';
import { createNullWorld } from './null-world';
import type { NullWorld } from './null-world';

export { createNullWorld, clearRayHit, makeRayHit, NOMINAL_BOUNDS } from './null-world';
export { createNullEnv, createNullHazards, createNullHealth, createNullDirector, injuryForHealth } from './null-sim';
export { createNullActions, createNullInteractions, createNullArchetypes } from './null-items';
export { createNullLaw, createNullRadio, isAuthority } from './null-law';
export { createNullPlayer, createNullUi, createNullAudio, createNullInput } from './null-presentation';

/** Jeu complet de services neutres créés pour un contexte. */
export interface NeutralServices {
  world: NullWorld;
  env: NullEnv;
  hazards: HazardApi;
  health: HealthApi;
  actions: ActionApi;
  interactions: NullInteractions;
  archetypes: ArchetypeApi;
  law: LawApi;
  director: DirectorApi;
  radio: RadioApi;
  player: NullPlayer;
  ui: NullUi;
  audio: AudioApi;
  input: InputState;
}

/** Crée les services neutres d'un contexte (ctx.events, ctx.clock et les magasins doivent exister). */
export function createNeutralServices(ctx: GameContext, debug: boolean): NeutralServices {
  return {
    world: createNullWorld(),
    env: createNullEnv(ctx),
    hazards: createNullHazards(),
    health: createNullHealth(ctx),
    actions: createNullActions(),
    interactions: createNullInteractions(ctx),
    archetypes: createNullArchetypes(ctx),
    law: createNullLaw(ctx),
    director: createNullDirector(),
    radio: createNullRadio(ctx),
    player: createNullPlayer(ctx),
    ui: createNullUi(debug),
    audio: createNullAudio(),
    input: createNullInput(),
  };
}
