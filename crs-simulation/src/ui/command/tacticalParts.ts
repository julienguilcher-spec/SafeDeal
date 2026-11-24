/* =====================================================================================
 * Carte de commandement — BRANCHEMENT des morceaux de l'écran (setTacticalParts de tacticalScreen.ts).
 *
 * L'écran (tacticalScreen.ts) tient la machine à états et ne connaît les autres fichiers que par des interfaces ;
 * ce fichier lui fournit, une fois pour toutes (installTacticalParts, appelée par CommandSystem.init) :
 *   proposeWho / whoEnv           qui envoyer (bestUnit.ts ; renforts et exclusions des commissariats, commissariatsLink.ts) ;
 *   previewOf / sentenceOf        l'aperçu dessiné et la phrase « Ce qui va se passer » (preview.ts) ;
 *   sendCardLine / legalPlan      l'envoi d'une ligne et les étapes légales de S3 (sendLine.ts) ;
 *   todo                          « À traiter » dans l'ordre du panneau (panelFollow.todoItems), pour Espace ;
 *   createCardPanel               la fiche (panelCard.ts) ;
 *   createFollowPanel             « À traiter » + « Mes unités » (panelFollow.ts) ;
 *   createMorePanel               « Plus… » (panelMore.ts) ;
 *   createLegalPanel              « Cadre légal » (panelLegal.ts).
 * Les feuilles de style de la fiche et des panneaux sont ajoutées par ensureCommandStyle (style.ts).
 * ===================================================================================== */

import { coarsePointer } from '../maps/style';
import { proposeWho, whoEnvFromCore } from './bestUnit';
import type { Repere } from './cardTypes';
import { stationWhoExt } from './commissariatsLink';
import { CardPanel } from './panelCard';
import { FollowPanel, chainOf, todoItems } from './panelFollow';
import { LegalPanel } from './panelLegal';
import { MorePanel } from './panelMore';
import { previewOf, sentenceOf } from './preview';
import { legalCheck, sendCardLine } from './sendLine';
import { setTacticalParts } from './tacticalScreen';
import type { TacticalScreen } from './tacticalScreen';

let installed = false;

/** Ouvre la fiche d'un repère depuis un panneau (rangée cliquée) : sans intention, la carte va vers lui. */
function pickFromPanel(screen: TacticalScreen, r: Repere): void {
  const st = screen.state;
  st.intent = null;
  st.where = null;
  st.candidates = [];
  st.sheet = 'card';
  screen.map.flyTo(r.x, r.z);
  screen.openRepere(r);
}

/** Branche la fiche, les panneaux et les calculs de Qui, d'aperçu et d'envoi dans la carte de commandement. */
export function installTacticalParts(): void {
  if (installed) return;
  installed = true;
  setTacticalParts({
    proposeWho: (line, where, env) => proposeWho(line, where, env),
    // commissariats : unités au poste ou en alerte écartées ; unités prêtes des postes en « Renforts des commissariats »
    whoEnv: (core, env, selection) => whoEnvFromCore(core, env, selection, stationWhoExt(core)),
    previewOf: (line, who, where, env) => previewOf(line, who, where, env),
    sentenceOf: (line, who, where) => sentenceOf(line, who, where),
    sendCardLine: (env, line, who, where) => sendCardLine(env, line, who, where),
    legalPlan: (line, who, where, env, core) => {
      const r = legalCheck(core, env, line, who, where);
      return { plan: r.plan, reason: r.reason, steps: r.steps };
    },
    todo: (env, core) => todoItems(env, chainOf(core), 3, !coarsePointer()).flatMap((i) => (i.repere ? [i.repere] : [])),
    createCardPanel: (host) => new CardPanel(host),
    createFollowPanel: (host, screen) => new FollowPanel(screen.core, host, {
      onPickRepere: (r) => pickFromPanel(screen, r),
      onOpenLegal: () => screen.openSheet('legal'),
      env: () => screen.cardEnv(),
      state: screen.state,
    }),
    createMorePanel: (host, screen) => new MorePanel(screen.core, host, {
      state: screen.state, map: screen.map, tmap: screen.tmap,
      onVerbFirst: (type) => screen.verbFirst(type),
      onPickRepere: (r) => pickFromPanel(screen, r),
      onHelp: () => screen.openSheet('help'),
      onClose: () => screen.closeSheet(),
      where: () => {
        const v = screen.state.visee;
        return v ? { x: v.x, z: v.z, name: v.name } : null;
      },
    }),
    createLegalPanel: (host, screen) => new LegalPanel(screen.core, host, { onClose: () => screen.closeSheet() }),
  });
}
