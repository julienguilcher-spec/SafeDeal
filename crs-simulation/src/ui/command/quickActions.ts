/* =====================================================================================
 * Bloc d'ordres du HUD (zone 'left', sous la mini-carte) — toujours visible, au clavier seul comme au toucher.
 *
 * Ordinateur (262 px, une idée par ligne ; textes de fieldHud.ts, mêmes mots que la carte de commandement) :
 *   « AVEC VOUS · 3 sections + BRAV-M · en ligne face à la foule »   ligne d'état ;
 *   « Entrée  Bloquer la rue Saint-Gilles · MISTRAL 1 · 90 m »        ordre prêt (Entrée, ou un clic sur la ligne) ;
 *   « Maj+Entrée  Disperser la foule · MISTRAL 1 »                    ligne « autre », quand elle existe ;
 *   « A avec moi · U autre unité · F tous les ordres · Tab carte »    touches (chacune cliquable), « ⌫ annuler — … »
 *                                                                     pendant 5 s après un ordre ;
 *   « Secours ici »              F puis 7   déplie « Pompiers ici » / « SAMU ici » : la demande part à la radio et au
 *                                           service des secours, au point où se trouve le joueur, liée à l'incident
 *                                           qu'on lui a confié s'il y en a un (requestRescueAtPlayer, aussi pour la roue) ;
 *   « Vue drone »                O          seulement quand un drone de police est engagé dans la session ;
 *   unités détachées (2 au plus, « +1 ») : leur ticket ou ce qu'elles tiennent.
 * Dessous, selon la situation :
 *   « Un véhicule vous bloque (rue X) : Envoyer le blindé Centaure »  tant que police.obstacle.blocked() signale un
 *                                           véhicule qui barre la route du joueur (exécutant : « Demander le Centaure »,
 *                                           demande radio) ;
 *   « L'ADJOINT PROPOSE »        titre en clair (adjointPlays.ts) + « Accepter » (P) / « Plus tard » (Maj + P) ; une
 *                                           nasse préparée sur la carte passe avant (« FERMER LA NASSE — À VALIDER »).
 *                                           Fenêtre basse (< 760 px) : réduite à une ligne.
 * Téléphone (surcouche tactile) : deux pastilles SOUS la mini-carte — « Avec moi » (le même ordre que A : tout le
 * monde revient et le suit, à pied ou en véhicules selon qu'il marche ou roule) et « Secours ici » ; la ligne d'état
 * est la puce du haut (hud.ts), l'ordre prêt est la pastille du module tactile ; la proposition de l'adjoint et le
 * véhicule qui bloque deviennent des bandeaux en haut au centre (élément de HUD 'command.banner', zone 'top',
 * quickBanner()). Tout ce qui se touche fait au moins 44 px de haut (pastilles, boutons des bandeaux).
 * Les boutons ne prennent jamais le focus : Entrée ne « clique » pas un bouton du HUD resté sélectionné (elle donne
 * l'ordre prêt, et rien d'autre).
 * Demande du commanditaire : « la carte tactique, que ce soit plus intuitif à l'écran plutôt que mettre retour et
 * cliquer sur la carte tactique » ; « il n'y a pas de bouton pour appeler les pompiers, les médecins, le SAMU ».
 * ===================================================================================== */

import type { HudWidget, RescueKind } from '@/core/extensions';
import { el, icon, setClass, setText } from '../maps/icons';
import type { IconName } from '../maps/icons';
import { isPoliceRole } from '../maps/visibility';
import type { DroneFeedApi } from '../drone/api';
import { DRONE_FEED_SERVICE } from '../drone/api';
import { proposalTitle } from './adjointPlays';
import type { CommandCore } from './core';
import { REFUS } from './direct/caps';
import { keyedLine } from './direct/words';
import type { DirectApi, GiveResult } from './direct/runtime';
import { FIELD_DIRECT_SERVICE, fieldKeyLabels, sharedFieldHud, splitHead } from './fieldHud';
import type { FieldHudModel, FieldOrderLine } from './fieldHud';
import { acceptNasse } from './nasse';
import { radioFrame, rescueRequest } from './phrases';
import { ensureCommandStyle } from './style';
import { openTacticalAt } from './tacticalOpen';

/** Relecture du bloc (s) : l'ordre prêt change au plus toutes les 0,5 s et clignote 0,3 s quand il change. */
const PERIOD = 0.25;
/** Écran de la roue d'ordres (orderWheel.ts WHEEL_SCREEN). */
const WHEEL_SCREEN_ID = 'roue_ordres';
/** Séparateur de la touche et du texte d'une ligne d'ordre (direct/words.ts keyedLine). */
const KEY_SEPARATOR = keyedLine('', '');

/** Vue minimale d'une proposition de l'adjoint (police.command). */
interface ProposalLike { id: number; key: string; text: string; t: number; saidAt: number; priority: number; executable: boolean }
/** Vue minimale du service 'police.obstacle' (src/sim/police/command/obstacle.ts). */
interface ObstacleLike {
  blocked(): { blockerId: number; x: number; z: number; street: string } | null;
  radioRequest(from: string): { ok: boolean; name: string; reason: string };
}
/** Délai minimal entre deux demandes de secours (s) : pas d'appel en rafale. */
const RESCUE_COOLDOWN = 8;
/** Touche d'acceptation des propositions de l'adjoint (code physique : même place en AZERTY). */
const PROPOSAL_KEY = 'KeyP';
/**
 * Arrêt (s) avant d'afficher « Un véhicule vous bloque » : un feu rouge ou un bouchon d'un instant ne doit pas faire
 * proposer le Centaure.
 */
const BLOCK_SHOW_AFTER = 4;
/** « Pousser un véhicule » : « Plus… » (8) puis 9 dans la roue des ordres directs (direct/words.ts). */
const WHEEL_MORE = 8;
const WHEEL_PUSH = 9;
/** « Secours ici » : secteur 7 de la roue. */
const WHEEL_RESCUE = 7;

const STYLE_ID = 'cm-quick-style';

/** Feuille du bloc d'ordres (exportée : les tests vérifient les 44 px de tout ce qui se touche). */
export const QUICK_CSS = `
.cq{display:flex;flex-direction:column;align-items:flex-start;align-self:flex-start;gap:6px;margin-top:8px;pointer-events:auto;width:max-content;max-width:100%}
.cq.is-off,.cq .is-off,.cq-banner .is-off{display:none!important}
.cq-block{display:flex;flex-direction:column;gap:1px;width:262px;padding:3px 4px 4px;border-radius:10px;background:rgba(11,18,32,.84);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(4px)}
.cq .cm-btn{justify-content:flex-start;width:100%;min-height:34px;padding:3px 8px;border-radius:7px;background:transparent;border:1px solid transparent;color:#e8ecf3;font-weight:600;font-size:13px;gap:8px;text-align:left}
.cq .cm-btn:hover,.cq .cm-btn.is-on{background:rgba(30,44,70,.92);border-color:rgba(255,255,255,.12)}
.cq .cq-key{margin-left:auto;flex:none;padding:1px 6px;border-radius:5px;background:rgba(255,255,255,.12);font-size:11px;font-weight:600;color:#c3cbda;white-space:nowrap}
.cq .cq-sm{display:none}
.cq-sub{display:flex;gap:6px;padding:1px 0 4px 30px}
.cq-sub .cm-btn{width:auto;min-height:32px;font-size:12px;background:rgba(20,30,50,.95);border-color:rgba(255,255,255,.14)}
.cq .cq-fire{border-color:rgba(239,65,53,.55)}
.cq .cq-samu{border-color:rgba(80,160,255,.55)}
.cq .cq-drone.is-on{border-color:rgba(255,90,79,.7);background:rgba(60,18,22,.86)}
/* ligne d'état : « AVEC VOUS » en tête, le reste à côté (deux lignes au plus) */
.cq-state{display:flex;align-items:baseline;gap:6px;padding:4px 7px 3px;font-size:12px;line-height:1.3;color:#dfe6f1}
.cq-state b{flex:none;font-size:10.5px;font-weight:800;letter-spacing:.07em;color:#9fd0ff;white-space:nowrap}
.cq-state span{min-width:0;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
/* ordre prêt et ligne « autre » : la touche en pastille, le texte sur deux lignes au plus */
.cq .cq-go{align-items:flex-start;min-height:34px;padding:5px 7px;font-size:12.5px;font-weight:650;line-height:1.3;white-space:normal;border-color:rgba(88,166,255,.35);background:rgba(20,34,58,.7)}
.cq .cq-go .cq-k{flex:none;margin-top:1px;padding:1px 6px;border-radius:5px;background:rgba(255,255,255,.18);font-size:11px;font-weight:700;color:#fff;white-space:nowrap}
.cq .cq-go .cq-t{min-width:0;overflow:hidden;white-space:normal;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3}
.cq .cq-go.cq-other{border-color:rgba(255,196,64,.35);background:rgba(40,32,14,.55);font-weight:600}
.cq .cq-go.is-dim{border-color:rgba(255,255,255,.08);background:transparent;color:#98a4b8;font-weight:600}
.cq .cq-go.is-dim .cq-k{background:rgba(255,255,255,.08);color:#aab4c5}
.cq .cq-go.is-flash{animation:cq-flash .3s ease-out}
@keyframes cq-flash{0%{background:rgba(88,166,255,.55)}100%{background:rgba(20,34,58,.7)}}
.cq-hint{padding:0 8px 3px;font-size:11px;line-height:1.3;color:#ffc27a}
/* touches : chacune se clique (trackpad), aucune ne prend le focus */
.cq-keys{display:flex;flex-wrap:wrap;gap:1px 2px;padding:1px 2px 2px;font-size:11px;color:#aab6c9}
.cq-keys button{background:none;border:0;border-radius:4px;padding:2px 4px;color:inherit;font:inherit;cursor:pointer;white-space:nowrap}
.cq-keys button:hover{background:rgba(255,255,255,.1);color:#e8ecf3}
.cq-keys b{font-weight:800;color:#e8ecf3}
.cq-keys.is-undo button{color:#ffd58a}
.cq-keys .cq-sep{align-self:center;color:#6f7b90}
.cq-det{padding:1px 8px;font-size:11.5px;line-height:1.35;color:#c9d3e2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:254px}
.cq-det.is-more{color:#8f9bb0}
.cq .cq-withme{display:none}
.cq-blocked,.cq-prop{width:262px;padding:7px 9px;border-radius:10px;background:rgba(11,18,32,.9);color:#e8ecf3;font-size:12px;line-height:1.35;pointer-events:auto}
.cq-blocked{border:1px solid rgba(255,159,10,.7)}
.cq-blocked-t{display:block;font-weight:650;margin-bottom:5px}
.cq-blocked .cm-btn{min-height:34px;background:rgba(80,46,10,.75);border-color:rgba(255,159,10,.6)}
.cq-prop{border:1px solid rgba(255,196,64,.5)}
.cq-prop-h{display:block;color:#ffc440;font-size:11px;letter-spacing:.06em;margin-bottom:3px}
.cq-prop-lead{display:none;color:#ffc440;font-weight:700}
.cq-prop-t{display:block;font-size:12.5px;font-weight:600}
.cq-row{display:flex;gap:6px;margin-top:6px}
.cq-row .cm-btn{width:auto;min-height:32px;font-size:12px;padding:3px 10px;background:rgba(20,30,50,.95);border-color:rgba(255,255,255,.16)}
.cq-row .cq-ok{border-color:rgba(64,200,120,.6)}
/* « Accepter P » et « Plus tard Maj+P » tiennent dans les 262 px de la carte (sans icône : la touche et la couleur
   du bord suffisent) */
.cq .cq-prop .cq-row .cm-btn{flex:1 1 auto;min-width:0;justify-content:center;padding:3px 7px}
.cq .cq-prop .cq-row .cm-btn>svg{display:none}
/* fenêtre basse (MacBook Air avec les barres du navigateur) : la proposition tient sur une ligne */
@media (max-height:759px){
  .ui-hud[data-touch="none"] .cq-prop{display:flex;align-items:center;gap:6px;padding:4px 6px 4px 9px}
  .ui-hud[data-touch="none"] .cq-prop-h{display:none}
  /* le titre en clair sur deux lignes au plus (sur une seule, il ne restait que « Te… ») ; « Adjoint : » en tête */
  .ui-hud[data-touch="none"] .cq-prop-t{flex:1;min-width:0;overflow:hidden;font-size:12px;line-height:1.25;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
  .ui-hud[data-touch="none"] .cq-prop-lead{display:inline;font-size:0}
  .ui-hud[data-touch="none"] .cq-prop-lead::before{content:"Adjoint : ";font-size:12px}
  .ui-hud[data-touch="none"] .cq-prop .cq-row{margin-top:0;flex:none}
  .ui-hud[data-touch="none"] .cq-prop .cq-later{display:none}
}
/* écran tactile : deux pastilles sous la mini-carte (« Avec moi », « Secours ici ») ; la ligne d'état est la puce du
   haut, l'ordre prêt la pastille du module tactile ; tout ce qui se touche : 44 px au moins */
.ui-hud:not([data-touch="none"]) .cq{margin-top:4px}
.ui-hud:not([data-touch="none"]) .cq-block{flex-direction:row;flex-wrap:nowrap;gap:5px;width:auto;padding:0;background:none;border:0;backdrop-filter:none}
.ui-hud:not([data-touch="none"]) .cq-state,.ui-hud:not([data-touch="none"]) .cq .cq-go,.ui-hud:not([data-touch="none"]) .cq-hint,
.ui-hud:not([data-touch="none"]) .cq-keys,.ui-hud:not([data-touch="none"]) .cq-det{display:none!important}
.ui-hud:not([data-touch="none"]) .cq .cq-withme{display:inline-flex}
.ui-hud:not([data-touch="none"]) .cq .cm-btn{width:auto;min-height:44px;padding:4px 11px;font-size:12px;border-radius:9px;background:rgba(11,18,32,.84);border-color:rgba(255,255,255,.14)}
.ui-hud:not([data-touch="none"]) .cq .cq-key{display:none}
/* sans pictogramme : la rangée reste étroite, les sous-titres passent à sa droite */
.ui-hud:not([data-touch="none"]) .cq-block .cm-ico{display:none}
.ui-hud:not([data-touch="none"]) .cq-sub{padding:0;gap:5px}
.ui-hud:not([data-touch="none"]) .cq.is-rescue .cq-withme{display:none}
.ui-hud:not([data-touch="none"]) .cq-row .cm-btn{min-height:44px;min-width:44px}
@media (pointer:coarse){.cq .cq-key{display:none}.cq .cm-btn{min-height:44px}}
/* bandeaux du téléphone, en haut au centre (élément 'command.banner') */
.cq-banner{display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;max-width:100%}
.cq-banner:empty{display:none}
.cq-banner .cq-prop,.cq-banner .cq-blocked{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px 6px;width:auto;max-width:100%;padding:4px 8px;font-size:11.5px;line-height:1.3;text-align:center}
.cq-banner .cq-prop-h{display:none}
.cq-banner .cq-prop-lead{display:inline}
.cq-banner .cq-prop-t,.cq-banner .cq-blocked-t{display:inline;margin:0;font-size:11.5px}
.cq-banner .cq-row{margin:0}
.cq-banner .cq-key,.cq-banner .cq-lg{display:none}
.cq-banner .cq-sm{display:inline}
.cq-banner .cm-btn{width:auto;min-height:44px;min-width:44px;padding:3px 10px;font-size:12px;border-radius:8px;color:#e8ecf3;font-weight:650;gap:6px}
.cq-banner .cq-blocked .cm-btn{background:rgba(80,46,10,.85);border:1px solid rgba(255,159,10,.6)}
.cq-banner .cq-row .cm-btn{background:rgba(20,30,50,.95);border:1px solid rgba(255,255,255,.16)}
.cq-banner .cq-row .cq-ok{border-color:rgba(64,200,120,.6)}
`;

function ensureQuickStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = QUICK_CSS;
  document.head.appendChild(s);
}

/** Libellés du bloc d'ordres : les mêmes mots que la roue d'ordres et la carte de commandement. */
export const QUICK_LABELS = {
  /** Pastille du téléphone : le même ordre que A (direct/words.ts, secteur 1 de la roue). */
  withMe: 'Avec moi',
  rescue: 'Secours ici',
  pompiers: 'Pompiers ici',
  samu: 'SAMU ici',
  drone: 'Vue drone',
  push: 'Envoyer le blindé Centaure',
  pushAsk: 'Demander le Centaure',
} as const;

/** « Avec moi » (A, pastille du téléphone) : montré à tout policier qui a une unité avec lui. */
export function followButtonsShown(core: CommandCore): boolean {
  return core.followUnit() !== null;
}

/** Rappel de touche de la roue d'ordres : « F puis 7 » (jamais « F 7 » ni « F7 » : sur un Mac, F7 est une touche de fonction). */
export function wheelHint(ordersKey: string, sector: number): string {
  return `${ordersKey !== '' ? ordersKey : 'F'} puis ${sector}`;
}

/**
 * Infobulles de « Avec moi » selon l'unité qui suit : la compagnie (commandant, commissaire), la section (chef de
 * section), le groupe (chef de groupe, CRS), l'équipage (engin) ; à pied, ou derrière son véhicule.
 */
export function followTitles(kind: string): { foot: string; column: string } {
  switch (kind) {
    case 'compagnie':
      return { foot: 'Toute la compagnie descend et vous suit à pied', column: 'Toute la compagnie remonte et suit votre véhicule' };
    case 'section':
    case 'peloton':
      return { foot: 'Toute la section descend et vous suit à pied', column: 'Toute la section remonte et suit votre véhicule' };
    case 'equipage':
      return { foot: 'Votre équipage vous suit à pied', column: 'Votre équipage suit votre véhicule' };
    default:
      return { foot: 'Votre groupe vous suit à pied', column: 'Votre groupe suit votre véhicule' };
  }
}

/**
 * « Avec moi » s'adapte à la façon dont le joueur se déplace : en véhicule (au volant ou passager) ses unités
 * remontent et suivent son véhicule, à pied elles le suivent à pied. true : en véhicules.
 */
export function smartFollowColumn(playerVehicleId: number): boolean {
  return playerVehicleId !== 0;
}

/** Dernière demande de secours de chaque partie (anti-rafale partagé par le HUD et la roue d'ordres). */
const lastRescueCall = new WeakMap<CommandCore, number>();

/**
 * « Pompiers ici » / « SAMU ici » : demande de secours au point du joueur (liée à l'incident qui lui est confié),
 * annoncée à la radio et transmise au service des secours. Même appel depuis le HUD et depuis la roue d'ordres
 * (secteur 7). false si rien n'est parti (pas de joueur, demande déjà en cours).
 */
export function requestRescueAtPlayer(core: CommandCore, kind: RescueKind): boolean {
  const ctx = core.ctx;
  const p = core.player();
  if (!p) return false;
  const now = core.maps.time;
  if (now - (lastRescueCall.get(core) ?? -1e9) < RESCUE_COOLDOWN) {
    ctx.ui.notify('Demande déjà transmise : les secours sont en route.', 'info', 3);
    return false;
  }
  lastRescueCall.set(core, now);
  const sector = ctx.world.sectorName(p.x, p.z);
  const label = kind === 'pompiers' ? 'Pompiers' : 'SAMU';
  if (isPoliceRole(ctx.player.state.role)) {
    ctx.radio.say({ channel: 'secours', from: core.callsign(), text: rescueRequest(core.callsign(), sector, kind), priority: 2, personId: p.id });
  } else {
    const who = kind === 'pompiers' ? 'les pompiers' : 'le SAMU';
    ctx.radio.say({ channel: 'public', from: p.name, priority: 2, personId: p.id,
      text: radioFrame(label, p.name, `J’appelle ${who} : il y a besoin de secours${sector ? ', ' + sector : ''}`, false) });
  }
  ctx.audio.play('radio_bip');
  const rescue = core.rescue;
  if (!rescue) {
    ctx.ui.notify('Message transmis. Aucun service de secours n’est joignable pour cette mission.', 'warn', 4);
    return true;
  }
  const incidents = core.incidents;
  const c = rescue.request(kind, p.x, p.z, p.id, incidents && incidents.playerIncidentId !== 0 ? incidents.playerIncidentId : undefined);
  const minutes = Math.max(1, Math.round(Math.max(0, c.eta) / 60));
  ctx.ui.notify(`${label} demandés — arrivée estimée dans environ ${minutes} min.`, 'ok', 4);
  return true;
}

/**
 * Un bouton du HUD ne garde jamais le focus : sinon Entrée (l'ordre prêt) ou Espace « cliqueraient » aussi le dernier
 * bouton touché (deux ordres d'un seul appui).
 */
function noFocus(b: HTMLButtonElement): void {
  b.tabIndex = -1;
  b.addEventListener('mousedown', (e) => e.preventDefault());
}

/** Bouton du bloc : pictogramme, libellé (long à l'ordinateur, court dans les bandeaux du téléphone), touche. */
function chip(label: string, onClick: () => void, opts: { icon?: IconName; id?: string; className?: string; title?: string; short?: string; key?: string }): {
  btn: HTMLButtonElement; label: HTMLElement; key: HTMLElement;
} {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cm-btn' + (opts.className ? ' ' + opts.className : '');
  if (opts.icon) b.innerHTML = icon(opts.icon);
  const lg = el('span', 'cm-btn-t cq-lg', label);
  b.appendChild(lg);
  if (opts.short) b.appendChild(el('span', 'cm-btn-t cq-sm', opts.short));
  const key = el('span', 'cq-key', opts.key ?? '');
  setClass(key, 'is-off', !opts.key);
  b.appendChild(key);
  if (opts.title) b.title = opts.title;
  if (opts.id) b.dataset.id = opts.id;
  noFocus(b);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    b.blur();
    onClick();
  });
  return { btn: b, label: lg, key };
}

/** Ligne d'ordre cliquable (ordre prêt, ligne « autre ») : la touche en pastille, le texte. */
interface OrderRow {
  btn: HTMLButtonElement;
  key: HTMLElement;
  text: HTMLElement;
  hint: HTMLElement;
  shown: string;
}

function orderRow(id: string, className: string, onClick: () => void): OrderRow {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cm-btn cq-go is-off' + (className ? ' ' + className : '');
  b.dataset.id = id;
  const key = el('span', 'cq-k');
  const text = el('span', 'cq-t');
  b.append(key, text);
  noFocus(b);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    b.blur();
    onClick();
  });
  const hint = el('div', 'cq-hint is-off');
  hint.dataset.id = id + '-hint';
  return { btn: b, key, text, hint, shown: '' };
}

/** Action d'un morceau de la ligne des touches, d'après ses mots (« A avec moi », « U autre unité »…). */
export type KeyPartAction = 'with_me' | 'who' | 'wheel' | 'map' | 'undo' | 'none';

export function keyPartAction(part: string): KeyPartAction {
  if (/annuler\b/.test(part)) return 'undo';
  if (/avec moi$/.test(part)) return 'with_me';
  if (/autre unité$/.test(part)) return 'who';
  if (/ordres$/.test(part)) return 'wheel';
  if (/carte$/.test(part)) return 'map';
  return 'none';
}

export class QuickActionsHud implements HudWidget {
  readonly root: HTMLDivElement;
  private readonly block: HTMLDivElement;
  private readonly rescueBtn: HTMLButtonElement;
  private readonly rescueKey: HTMLElement;
  private readonly droneBtn: HTMLButtonElement;
  private droneShown = false;
  /** Téléphone : « Avec moi » (même ordre que A). */
  private readonly withMeBtn: HTMLButtonElement;
  private withMeShown = false;
  private withMeTitle = '';
  // ordres directs (ordinateur) : ligne d'état, ordre prêt, ligne « autre », touches, unités détachées
  private readonly stateEl: HTMLDivElement;
  private readonly stateHead: HTMLElement;
  private readonly stateRest: HTMLElement;
  private readonly go: OrderRow;
  private readonly other: OrderRow;
  private readonly keysEl: HTMLDivElement;
  private keysText = '';
  private readonly detEls: HTMLDivElement[];
  private readonly moreEl: HTMLDivElement;
  /** Ligne des interpellés (« Interpellés 5 · CELLULAIRE 1 3/8 · 2 au commissariat »), dès la première interpellation. */
  private readonly custodyEl: HTMLDivElement;
  /** Dernier modèle lu (les clics donnent l'ordre affiché, jamais un ordre recalculé). */
  private model: FieldHudModel | null = null;
  private readonly sub: HTMLDivElement;
  private last = -1;
  private open = false;
  private commander = false;
  /** Rappels de touches affichés (touche « Ordres » telle qu'imprimée, rôle) : réécrits seulement s'ils changent. */
  private hintsFor = '';
  // véhicule qui bloque
  private readonly blocked: HTMLDivElement;
  private readonly blockedText: HTMLElement;
  private readonly blockedBtnLabel: HTMLElement;
  private readonly blockedKey: HTMLElement;
  private blockSeenId = 0;
  private blockSeenAt = 0;
  private blockShown = false;
  // proposition de l'adjoint
  private readonly prop: HTMLDivElement;
  private readonly propHead: HTMLElement;
  private readonly propLead: HTMLElement;
  private readonly propText: HTMLElement;
  private propId = 0;
  /** Bandeaux du téléphone (zone 'top') : la proposition et le véhicule qui bloque y passent sur écran tactile. */
  private banner: HTMLElement | null = null;
  private inBanner = false;
  private readonly onKey: (e: KeyboardEvent) => void;

  constructor(private readonly core: CommandCore, host: HTMLElement) {
    // P : accepter la proposition de l'adjoint ; Maj + P : plus tard (sans souris, depuis le poste de commandement)
    this.onKey = (e: KeyboardEvent): void => {
      if (e.code !== PROPOSAL_KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (this.core.ctx.session.phase !== 'playing') return;
      // « Fermer la nasse » préparée sur la carte tactique : P la valide, Maj + P l'écarte (avant celles de l'adjoint)
      if (this.core.nasse) {
        e.preventDefault();
        this.answerNasse(!e.shiftKey);
        return;
      }
      if (this.propId === 0) return;
      e.preventDefault();
      this.answer(!e.shiftKey);
    };
    if (typeof window !== 'undefined') window.addEventListener('keydown', this.onKey);
    ensureCommandStyle();
    ensureQuickStyle();
    this.root = el('div', 'cq is-off');
    this.root.dataset.id = 'hud-quick';

    // bloc d'ordres
    this.block = el('div', 'cq-block');
    this.block.dataset.id = 'hud-orders';
    this.stateEl = el('div', 'cq-state is-off');
    this.stateEl.dataset.id = 'hud-state';
    this.stateHead = el('b');
    this.stateRest = el('span');
    this.stateEl.append(this.stateHead, this.stateRest);
    this.go = orderRow('hud-ready', '', () => this.giveShown('go'));
    this.other = orderRow('hud-other', 'cq-other', () => this.giveShown('autre'));
    this.keysEl = el('div', 'cq-keys is-off');
    this.keysEl.dataset.id = 'hud-keys';
    this.withMeBtn = chip(QUICK_LABELS.withMe, () => this.withMe(), { icon: 'arrow', id: 'quick-with-me', className: 'cq-withme is-off' }).btn;
    const rescue = chip(QUICK_LABELS.rescue, () => this.toggleRescue(), { icon: 'cross', id: 'quick-rescue', title: 'Appeler les pompiers ou le SAMU là où vous êtes' });
    this.rescueBtn = rescue.btn;
    this.rescueKey = rescue.key;
    this.sub = el('div', 'cq-sub is-off');
    this.sub.append(
      chip(QUICK_LABELS.pompiers, () => this.call('pompiers'), { icon: 'fire', id: 'quick-pompiers', className: 'cq-fire', title: 'Pompiers à votre position' }).btn,
      chip(QUICK_LABELS.samu, () => this.call('samu'), { icon: 'cross', id: 'quick-samu', className: 'cq-samu', title: 'SAMU (médecin) à votre position' }).btn,
    );
    this.droneBtn = chip(QUICK_LABELS.drone, () => this.toggleDrone(), { icon: 'drone', id: 'quick-drone', className: 'cq-drone is-off', key: 'O', title: 'Retour vidéo du drone (O)' }).btn;
    this.detEls = [];
    for (let i = 0; i < 2; i++) {
      const d = el('div', 'cq-det is-off');
      d.dataset.id = 'hud-detached-' + i;
      this.detEls.push(d);
    }
    this.moreEl = el('div', 'cq-det is-more is-off');
    this.moreEl.dataset.id = 'hud-detached-more';
    // interpellés : combien, le fourgon cellulaire de la remise et sa charge, combien au commissariat (plan §5.2)
    this.custodyEl = el('div', 'cq-det is-off');
    this.custodyEl.dataset.id = 'hud-custody';
    this.block.append(
      this.stateEl, this.go.btn, this.go.hint, this.other.btn, this.other.hint, this.keysEl,
      this.withMeBtn, this.rescueBtn, this.sub, this.droneBtn, ...this.detEls, this.moreEl, this.custodyEl,
    );

    // véhicule qui bloque la colonne du joueur
    this.blocked = el('div', 'cq-blocked is-off');
    this.blocked.dataset.id = 'hud-blocked';
    this.blockedText = el('span', 'cq-blocked-t', 'Un véhicule vous bloque :');
    const push = chip(QUICK_LABELS.push, () => this.sendCentaure(), { icon: 'shield', id: 'quick-centaure', short: 'Centaure', title: 'Le blindé Centaure pousse le véhicule hors de la chaussée' });
    this.blockedBtnLabel = push.label;
    this.blockedKey = push.key;
    this.blocked.append(this.blockedText, push.btn);

    // proposition de l'adjoint
    this.prop = el('div', 'cq-prop is-off');
    this.prop.dataset.id = 'hud-proposal';
    this.propHead = el('b', 'cq-prop-h', 'L’ADJOINT PROPOSE');
    const txt = el('span', 'cq-prop-t');
    this.propLead = el('span', 'cq-prop-lead', 'L’adjoint propose : ');
    this.propText = el('span');
    txt.append(this.propLead, this.propText);
    const row = el('div', 'cq-row');
    row.append(
      chip('Accepter', () => this.answer(true), { icon: 'check', id: 'proposal-accept', className: 'cq-ok', short: 'Oui', key: 'P', title: 'Accepter (P)' }).btn,
      chip('Plus tard', () => this.answer(false), { icon: 'close', id: 'proposal-dismiss', className: 'cq-later', key: 'Maj+P', title: 'Plus tard (Maj + P)' }).btn,
    );
    this.prop.append(this.propHead, txt, row);
    this.root.append(this.block, this.blocked, this.prop);
    host.appendChild(this.root);
  }

  /**
   * Bandeaux du téléphone (zone 'top' du HUD) : sur écran tactile, la proposition de l'adjoint et le véhicule qui
   * bloque y passent, en haut au centre ; à l'ordinateur ils restent sous le bloc d'ordres.
   */
  attachBanner(host: HTMLElement): void {
    const b = el('div', 'cq-banner');
    b.dataset.id = 'hud-banner';
    host.appendChild(b);
    this.banner = b;
    this.inBanner = false;
    this.last = -1;
  }

  detachBanner(): void {
    if (this.inBanner) this.root.append(this.blocked, this.prop);
    this.inBanner = false;
    this.banner?.remove();
    this.banner = null;
  }

  /** Écran tactile (surcouche du module d'entrées) : les deux bandeaux en haut au centre. */
  private placeBanners(): void {
    const want = this.touch() && this.banner !== null;
    if (want === this.inBanner) return;
    this.inBanner = want;
    if (want) this.banner!.append(this.blocked, this.prop);
    else this.root.append(this.blocked, this.prop);
  }

  private touch(): boolean {
    const hud = this.root.closest('.ui-hud');
    return !!hud && (hud.getAttribute('data-touch') ?? 'none') !== 'none';
  }

  /** Proposition « Fermer la nasse » : P exécute les ordres « Barrer la rue », Maj + P l'écarte. */
  private answerNasse(yes: boolean): void {
    const core = this.core;
    if (!core.nasse) return;
    if (yes) {
      const r = acceptNasse(core);
      core.ctx.ui.notify(r.text, r.ok ? 'ok' : 'warn', 5);
    } else {
      core.nasse = null;
      core.ctx.ui.notify('Fermeture de la nasse écartée.', 'info', 3);
    }
    this.propId = 0;
    setClass(this.prop, 'is-off', true);
    this.last = -1;
  }

  /** Proposition affichée : la plus urgente déjà dite à la radio, exécutable, sous son titre en clair. */
  private refreshProposal(): void {
    // « Fermer la nasse » en attente : elle passe avant les propositions de l'adjoint (même touche P)
    const nasse = this.commander ? this.core.nasse : null;
    if (nasse) {
      this.propId = -1;
      setText(this.propHead, 'FERMER LA NASSE — À VALIDER');
      setText(this.propLead, 'Fermer la nasse : ');
      setText(this.propText, nasse.text);
      this.prop.title = nasse.text;
      setClass(this.prop, 'is-off', false);
      return;
    }
    if (this.propId === -1) this.propId = 0;
    setText(this.propHead, 'L’ADJOINT PROPOSE');
    setText(this.propLead, 'L’adjoint propose : ');
    const cmd = this.core.ctx.service<{ proposals: readonly ProposalLike[] }>('police.command');
    let best: ProposalLike | null = null;
    if (cmd && this.commander) {
      for (const p of cmd.proposals) {
        if (!p.executable || p.saidAt < 0) continue;
        if (!best || p.priority > best.priority || (p.priority === best.priority && p.t > best.t)) best = p;
      }
    }
    if (!best) {
      this.propId = 0;
      setClass(this.prop, 'is-off', true);
      return;
    }
    if (best.id !== this.propId) {
      this.propId = best.id;
      const title = proposalTitle(best);
      setText(this.propText, title);
      this.prop.title = title;
    }
    setClass(this.prop, 'is-off', false);
  }

  private answer(yes: boolean): void {
    if (this.core.nasse) {
      this.answerNasse(yes);
      return;
    }
    const cmd = this.core.ctx.service<{ accept(id: number): boolean; dismiss(id: number): void }>('police.command');
    const id = this.propId;
    if (!cmd || id === 0) return;
    if (yes) {
      const ok = cmd.accept(id);
      this.core.ctx.ui.notify(ok ? 'Proposition acceptée : l’adjoint fait exécuter.' : 'Cette proposition n’est plus d’actualité.', ok ? 'ok' : 'info', 3);
    } else cmd.dismiss(id);
    this.propId = 0;
    setClass(this.prop, 'is-off', true);
    this.last = -1;
  }

  private direct(): DirectApi | undefined {
    const d = this.core.ctx.service<DirectApi>(FIELD_DIRECT_SERVICE);
    return d && typeof d.ready === 'function' ? d : undefined;
  }

  update(): void {
    const core = this.core;
    const t = core.maps.time;
    if (t - this.last < PERIOD) return;
    this.last = t;
    const ctx = core.ctx;
    const p = core.player();
    if (!p || ctx.session.phase !== 'playing') {
      setClass(this.root, 'is-off', true);
      setClass(this.blocked, 'is-off', true);
      setClass(this.prop, 'is-off', true);
      return;
    }
    setClass(this.root, 'is-off', false);
    this.placeBanners();
    const commander = isPoliceRole(ctx.player.state.role) && core.scope().level !== 'lecture';
    if (commander !== this.commander) this.commander = commander;
    this.refreshDrone();
    this.refreshDirect();
    this.refreshWithMe(p.vehicleId);
    this.refreshHints(isPoliceRole(ctx.player.state.role) && (commander || core.followUnit() !== null));
    this.refreshBlocked(commander);
    this.refreshProposal();
  }

  /** Ligne d'état, ordre prêt, ligne « autre », touches, unités détachées (ordinateur ; cachés au toucher). */
  private refreshDirect(): void {
    const direct = this.direct();
    const m = direct && isPoliceRole(this.core.ctx.player.state.role)
      ? sharedFieldHud(this.core, direct)
      : null;
    this.model = m;
    // ligne d'état
    const state = m ? m.state : '';
    setClass(this.stateEl, 'is-off', state === '');
    if (state !== '') {
      const h = splitHead(state);
      setText(this.stateHead, h.head);
      setText(this.stateRest, h.rest);
      if (this.stateEl.title !== state) this.stateEl.title = state;
    }
    this.paintOrder(this.go, m ? m.go : null);
    this.paintOrder(this.other, m ? m.other : null);
    // hors de la police (journaliste, secours, manifestant) : la carte simple, d'un clic ou de sa touche
    this.paintKeys(m ? m.keys : `${fieldKeyLabels(this.core).map} carte`, m !== null && m.undo !== null);
    // unités détachées : 2 au plus, puis « +N »
    const det = m ? m.detached : [];
    for (let i = 0; i < this.detEls.length; i++) {
      const d = this.detEls[i]!;
      const line = det[i] ?? '';
      setClass(d, 'is-off', line === '');
      if (line !== '') {
        setText(d, line);
        if (d.title !== line) d.title = line;
      }
    }
    const more = m ? m.more : 0;
    setClass(this.moreEl, 'is-off', more === 0);
    if (more > 0) setText(this.moreEl, `+${more} ${more > 1 ? 'autres unités' : 'autre unité'} (Tab : la carte)`);
    const custody = m && m.commander ? m.custody : '';
    setClass(this.custodyEl, 'is-off', custody === '');
    if (custody !== '') {
      setText(this.custodyEl, custody);
      if (this.custodyEl.title !== custody) this.custodyEl.title = custody;
    }
  }

  private paintOrder(row: OrderRow, line: FieldOrderLine | null): void {
    setClass(row.btn, 'is-off', !line);
    setClass(row.hint, 'is-off', !line || line.hint === '');
    if (!line) {
      row.shown = '';
      return;
    }
    // « Entrée  Bloquer la rue … » (direct/words.ts keyedLine : la touche, une espace demi-cadratin, le texte) : la
    // touche dans sa pastille, le texte à côté ; la ligne grise du rien visé n'a pas de touche
    const sp = line.order.rule === 'i' ? -1 : line.text.indexOf(KEY_SEPARATOR);
    const key = sp > 0 ? line.text.slice(0, sp) : '';
    const text = sp > 0 ? line.text.slice(sp + KEY_SEPARATOR.length) : line.text;
    setText(row.key, key);
    setClass(row.key, 'is-off', key === '');
    setText(row.text, text);
    setClass(row.btn, 'is-dim', !line.enabled);
    const title = line.hint !== '' ? `${line.text}\n${line.hint}` : line.text;
    if (row.btn.title !== title) row.btn.title = title;
    if (line.hint !== '') setText(row.hint, line.hint);
    // une ligne qui vient de changer clignote (le joueur voit ce qu'il ordonne)
    if (line.flash && row.shown !== line.order.key) {
      row.btn.classList.remove('is-flash');
      void row.btn.offsetWidth;
      row.btn.classList.add('is-flash');
    }
    row.shown = line.order.key;
  }

  /** Ligne des touches : chaque morceau se clique (A avec moi, U autre unité, F tous les ordres, Tab carte, ⌫ annuler). */
  private paintKeys(text: string, undo: boolean): void {
    setClass(this.keysEl, 'is-off', text === '');
    setClass(this.keysEl, 'is-undo', undo);
    if (text === this.keysText) return;
    this.keysText = text;
    this.keysEl.textContent = '';
    const parts = text === '' ? [] : undo ? [text] : text.split(' · ');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (i > 0) this.keysEl.appendChild(el('span', 'cq-sep', '·'));
      const b = document.createElement('button');
      b.type = 'button';
      const sp = part.indexOf(' ');
      const key = undo ? part.split(' ')[0]! : sp > 0 ? part.slice(0, sp) : part;
      b.append(el('b', undefined, key), document.createTextNode(part.slice(key.length)));
      const action = keyPartAction(part);
      b.dataset.id = 'hud-key-' + action;
      noFocus(b);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        b.blur();
        this.keyAction(action);
      });
      this.keysEl.appendChild(b);
    }
  }

  private keyAction(action: KeyPartAction): void {
    const direct = this.direct();
    const ctx = this.core.ctx;
    this.closeRescue();
    switch (action) {
      case 'with_me':
        this.withMe();
        return;
      case 'who':
        direct?.cycle(1);
        break;
      case 'wheel':
        ctx.ui.open(WHEEL_SCREEN_ID);
        return;
      case 'map':
        this.openMap();
        return;
      case 'undo':
        if (direct) {
          const r = direct.undo();
          if (r.ok && r.text !== '') ctx.ui.notify(r.text, 'info', 3);
        }
        break;
      default:
        return;
    }
    this.last = -1;
  }

  /** Clic sur l'ordre prêt (ou la ligne « autre ») : la ligne affichée part, comme Entrée ; trop loin : la carte s'ouvre dessus. */
  private giveShown(which: 'go' | 'autre'): void {
    const direct = this.direct();
    const line = which === 'go' ? this.model?.go : this.model?.other;
    this.closeRescue();
    if (!direct || !line) return;
    if (!line.order.enabled && line.order.lock === REFUS.tropLoin) {
      openTacticalAt(this.core, line.order.x, line.order.z, line.order.who ? line.order.who.squadIds : [], 'envoyer');
      return;
    }
    this.feedback(direct.give(which));
  }

  /** « Avec moi » (pastille du téléphone, « A avec moi » du bloc) : le même ordre que A. */
  private withMe(): void {
    const direct = this.direct();
    this.closeRescue();
    if (!direct) return;
    this.feedback(direct.avecMoi());
  }

  /** Un ordre parti : le bip de la radio (le refus a déjà son message, l'appui ignoré ne fait rien). */
  private feedback(r: GiveResult): void {
    if (!r.ignored) this.core.ctx.audio.play(r.ok ? 'radio_bip' : 'ui_alerte');
    this.last = -1;
  }

  /** Pastille « Avec moi » du téléphone : à tout policier qui a une unité avec lui (ou qui commande). */
  private refreshWithMe(vehicleId: number): void {
    const m = this.model;
    const shown = m !== null && m.canFollow;
    if (shown !== this.withMeShown) {
      this.withMeShown = shown;
      setClass(this.withMeBtn, 'is-off', !shown);
    }
    const unit = this.core.followUnit();
    const titles = followTitles(unit ? unit.kind : '');
    const title = smartFollowColumn(vehicleId) ? titles.column : titles.foot;
    if (title !== this.withMeTitle) {
      this.withMeTitle = title;
      this.withMeBtn.title = title;
    }
  }

  /** Rappels de touches de la roue (« F puis 7 ») : seulement pour qui a une roue d'ordres (tout policier avec une unité). */
  private refreshHints(wheel: boolean): void {
    const kit = this.core.kit;
    let key = 'F';
    if (kit) {
      try {
        key = kit.keyLabel('orders') || 'F';
      } catch {
        key = 'F';
      }
    }
    const state = `${wheel ? 1 : 0}:${key}:${this.commander ? 1 : 0}`;
    if (state === this.hintsFor) return;
    this.hintsFor = state;
    setText(this.rescueKey, wheel ? wheelHint(key, WHEEL_RESCUE) : '');
    setClass(this.rescueKey, 'is-off', !wheel);
    // « Pousser un véhicule » est dans « Plus… » de la roue de ceux qui commandent : « F puis 8 puis 9 »
    setText(this.blockedKey, this.commander ? `${wheelHint(key, WHEEL_MORE)} puis ${WHEEL_PUSH}` : '');
    setClass(this.blockedKey, 'is-off', !this.commander);
  }

  private obstacle(): ObstacleLike | undefined {
    const o = this.core.ctx.service<ObstacleLike>('police.obstacle');
    return o && typeof o.blocked === 'function' ? o : undefined;
  }

  /** « Un véhicule vous bloque (rue X) » : après quelques secondes d'arrêt derrière un véhicule qui barre la voie. */
  private refreshBlocked(commander: boolean): void {
    const ctx = this.core.ctx;
    const b = isPoliceRole(ctx.player.state.role) ? this.obstacle()?.blocked() ?? null : null;
    const now = this.core.maps.time;
    if (!b) this.blockSeenId = 0;
    else if (b.blockerId !== this.blockSeenId) {
      this.blockSeenId = b.blockerId;
      this.blockSeenAt = now;
    }
    const show = !!b && now - this.blockSeenAt >= BLOCK_SHOW_AFTER;
    if (show) {
      const street = b!.street && b!.street !== 'secteur inconnu' ? ` (${b!.street})` : '';
      setText(this.blockedText, `Un véhicule vous bloque${street} :`);
      setText(this.blockedBtnLabel, commander ? QUICK_LABELS.push : QUICK_LABELS.pushAsk);
    }
    if (show !== this.blockShown) {
      this.blockShown = show;
      setClass(this.blocked, 'is-off', !show);
    }
  }

  /** Centaure : ordre « Pousser un véhicule » à l'obstacle (qui commande), sinon demande radio (exécutant). */
  private sendCentaure(): void {
    const core = this.core;
    const ctx = core.ctx;
    const desk = this.obstacle();
    const b = desk ? desk.blocked() : null;
    if (!desk || !b) {
      ctx.ui.notify('Plus rien ne vous bloque.', 'info', 3);
      return;
    }
    if (this.commander) {
      const r = core.issue('degager_obstacle', [], [{ x: b.x, z: b.z, heading: 0, width: 0 }]);
      if (!r.ok) {
        ctx.ui.notify(r.reason, 'warn', 5);
        ctx.audio.play('ui_alerte');
      } else ctx.ui.notify('Ordre donné : le blindé Centaure vient pousser le véhicule. Restez à distance.', 'ok', 4);
    } else {
      const r = desk.radioRequest(core.callsign());
      ctx.audio.play('radio_bip');
      ctx.ui.notify(r.ok ? `${r.name} vient dégager l’obstacle : restez à distance du véhicule.` : `Demande refusée : ${r.reason.charAt(0).toLowerCase()}${r.reason.slice(1)}`, r.ok ? 'ok' : 'warn', 5);
    }
    this.last = -1;
  }

  private droneFeed(): DroneFeedApi | undefined {
    const f = this.core.ctx.service<DroneFeedApi>(DRONE_FEED_SERVICE);
    return f && typeof f.toggle === 'function' ? f : undefined;
  }

  /** Bouton « Vue drone » : seulement si un drone de police est engagé ; allumé quand le retour vidéo est ouvert. */
  private refreshDrone(): void {
    const feed = this.droneFeed();
    const shown = !!feed && isPoliceRole(this.core.ctx.player.state.role) && feed.engaged();
    if (shown !== this.droneShown) {
      this.droneShown = shown;
      setClass(this.droneBtn, 'is-off', !shown);
    }
    setClass(this.droneBtn, 'is-on', shown && !!feed && feed.open);
  }

  private toggleDrone(): void {
    const feed = this.droneFeed();
    this.closeRescue();
    if (!feed) return;
    feed.toggle();
    setClass(this.droneBtn, 'is-on', feed.open);
  }

  /** « Tab carte » : la carte de commandement (« M carte » : la carte simple pour qui ne commande pas). */
  private openMap(): void {
    const ctx = this.core.ctx;
    this.closeRescue();
    if (this.commander || (this.model !== null && this.model.commander)) ctx.ui.open('carte_tactique');
    else ctx.ui.open('carte');
  }

  private toggleRescue(): void {
    this.open = !this.open;
    setClass(this.sub, 'is-off', !this.open);
    setClass(this.rescueBtn, 'is-on', this.open);
    setClass(this.root, 'is-rescue', this.open);
  }

  private closeRescue(): void {
    if (!this.open) return;
    this.open = false;
    setClass(this.sub, 'is-off', true);
    setClass(this.rescueBtn, 'is-on', false);
    setClass(this.root, 'is-rescue', false);
  }

  /** Demande de secours au point du joueur (liée à l'incident qui lui est confié), annoncée à la radio. */
  private call(kind: RescueKind): void {
    this.closeRescue();
    requestRescueAtPlayer(this.core, kind);
  }

  dispose(): void {
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onKey);
    this.detachBanner();
    this.root.remove();
  }
}

/**
 * Élément de HUD 'command.banner' (zone 'top') : l'hôte des bandeaux du téléphone, rempli par les actions rapides.
 * Sans actions rapides (création refusée), il reste vide.
 */
export function quickBanner(quick: QuickActionsHud | null, host: HTMLElement): HudWidget {
  quick?.attachBanner(host);
  return {
    dispose(): void {
      quick?.detachBanner();
    },
  };
}
