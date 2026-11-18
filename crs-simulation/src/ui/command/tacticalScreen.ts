/* =====================================================================================
 * Écran « carte_tactique » : la CARTE DE COMMANDEMENT. Non bloquante pour la simulation (le temps continue, avec
 * « Ralentir »). Disposition (§2 du plan) :
 *   bandeau      titre, phase · tension · foule · heure, pastille légale (L), Vue drone, Ralentir (V), Fermer (Tab) ;
 *   carte        visée (réticule jaune sur un repère), Rechercher un lieu (R), + / − / ◎ Moi (G), vent, échelle ;
 *   barre du bas six intentions (E B N D I S) + « Plus… » (O), sous la carte seulement ;
 *   colonne      trois points de montage : « follow » (À traiter + Mes unités), « card » (la fiche), « sheet »
 *                (Plus…, Cadre légal) ; téléphone (< 980 × 520) : une feuille de 380 px à la fois, barre du bas masquée.
 * Lecture seule (CRS, gardien…) : bandeau « ORDRE DU … », carte cadrée sur le joueur et sa destination, Fermer, +, −, Moi.
 *
 * L'écran tient la machine à états (repos S0 → fiche S1 → Qui S2 → confirmation légale S3 → ordre donné S4) et le
 * modèle du clavier (§2.0) : la carte garde le focus ; la racine annule « ui:nav » et en fait des flèches (croix de
 * la manette) ; un seul écouteur clavier, en phase de capture, ne retient que ses touches (tacticalKeys.mapKey) ;
 * Entrée est ignorée 0,6 s après un envoi ; Échap passe par back() (tacticalKeys.backStep).
 *
 * BRANCHEMENTS (paquet d'intégration) — setTacticalParts({...}) fournit ce que d'autres fichiers construisent :
 *   proposeWho / previewOf / sentenceOf / sendCardLine / legalPlan   (bestUnit.ts, preview.ts, sendLine.ts, legalChain.ts)
 *   createCardPanel(hôte, écran)   la fiche (panelCard.ts) : interface CardPanelLike ci-dessous ;
 *   createFollowPanel / createMorePanel / createLegalPanel(hôte, écran)  panneaux de côté : SidePanelLike ;
 *   todo(env, core)                « À traiter » (sinon todoReperes de tacticalState.ts) ;
 *   whoEnv(core, env, sélection)   environnement de Qui (sinon celui que l'écran construit).
 * L'écran appelle aussi, s'ils existent : core.legalChain (start / cancel / status), TacticalMap.onRepereTap /
 * onRepereHover / drawCard et MapCanvas.keyCursor / setCursor. Méthodes publiques pour les panneaux : openRepere,
 * verbFirst, openSheet, closeSheet, openMore.
 * ===================================================================================== */

import type { CrowdPhase, ForceLevel, InputState, OrderType } from '@/core/contracts';
import type { ScreenInstance } from '@/core/extensions';
import type { MissionBrief } from '@/gameplay/session/mission-api';
import { MISSION_SERVICE } from '@/gameplay/session/mission-api';
import { PATROL_MODE_SERVICE } from '@/gameplay/patrols/model';
import type { PatrolModeApi } from '@/gameplay/patrols/model';
import type { DroneFeedApi } from '../drone/api';
import { DRONE_FEED_SERVICE } from '../drone/api';
import { iconMarkup } from '../core/icons';
import { button, el, setClass, setText } from '../maps/icons';
import { MapCanvas } from '../maps/mapCanvas';
import { searchPlaces } from '../maps/search';
import { coarsePointer } from '../maps/style';
import { ScaleBar, WindRose } from '../maps/widgets';
import type { TacticalOpenData, TacticalTab } from './api';
import type {
  Card, CardEnv, CardLine, CardPreview, IntentId, LegalPlan, LegalStatus, LegalStep, Repere, SendEnv, WhoCandidate, WhoEnv,
} from './cardTypes';
import { noUnitText, whoAt } from './bestUnit';
import type { CommandCore } from './core';
import { INTENTS, LEGAL_CHIP_TOOLTIP, MORE_BUTTON, buildCard, intentById, intentCandidates, plainLine } from './intents';
import { buildNasseProposal, holdingSquads, nasseCandidates } from './nasse';
import { forceWord } from './orders';
import { cardEnvFromCore, collectReperes, nextInDirection, pickAt, placeRepere, unitRepere } from './reperes';
import type { Direction } from './reperes';
import { coreLegalDeps, sentDetail } from './sendLine';
import { stationWhoAt } from './commissariatsLink';
import { cycleStation } from './commissariatsModel';
import type { StationCycle } from './commissariatsModel';
import { ensureCommandStyle } from './style';
import { TacticalMap } from './tacticalMap';
import {
  CARD_HINT, CARD_HINT_READONLY, HELP_LINES, HELP_MODEL, SENT_SECONDS, UNDO_SECONDS, backStep, commandableUnits, enterAllowed, isSticky, keyboardSections,
  mapKey, stickyNext, unitsByRecentOrder,
} from './tacticalKeys';
import type { KeyCommand, Sheet } from './tacticalKeys';
import {
  TacticalState, arrowChar, fixedCandidate, legalChip, readOnlyBanner, readOnlyFrame, stackOf, tacticalFrame, todoReperes, withVerbFirst,
} from './tacticalState';
import type { ReadOnlyCall } from './tacticalState';

// ───────────────────────────── branchements ─────────────────────────────

/** Ce que l'écran montre en plus de la fiche elle-même (tout est déjà calculé). */
export interface CardExtra {
  /** « Autres ordres ici… » déplié : `line` désigne alors une ligne de `card.others`. */
  othersOpen: boolean;
  /** Toutes les lignes montrent leur explication (sinon seulement la ligne surlignée : fenêtre basse, téléphone). */
  explainAll: boolean;
  /** Ligne d'indication du clavier (« ↑↓ autre action · ←→ autre endroit · U autre unité »), '' au pointeur. */
  hint: string;
  /** « 1 / 7 » : rang du lieu parmi les candidats de l'intention, '' sinon. */
  position: string;
  /** Onglet surligné parmi `card.stack`. */
  stackIndex: number;
  /** Intention collante : « Rue suivante (2 / 7) — Entrée : la bloquer aussi · Échap : terminer », '' sinon. */
  sticky: string;
  /** Bouton T : « Toute la compagnie », « Toute la section », « Tout le groupe » ; '' : pas de bouton. */
  wholeLabel: string;
  /** T est actif. */
  whole: boolean;
  /** Qui est imposé (fiche d'une unité, unité déjà choisie) : ni « Autre unité » ni T. */
  whoFixed: boolean;
}

/** Confirmation légale (S3) : les étapes dans l'ordre, ou la raison pour laquelle on ne peut pas les faire. */
export interface ConfirmModel {
  title: string;
  steps: LegalStep[];
  /** Ligne permise avant la dernière sommation (⚖) : « Donner l'ordre quand même » / « Faire d'abord les sommations ». */
  coercive: boolean;
  /** Pourquoi la chaîne est impossible (« Vous devez porter l'écharpe tricolore… »), '' sinon. */
  reason: string;
  /** « Faire les étapes dans l'ordre » est proposé. */
  canChain: boolean;
  /** Chef de groupe au-dessus de son plafond : « Demander plus de force (radio) ». */
  request?: boolean;
}

export type ConfirmChoice = 'chain' | 'anyway' | 'sommations' | 'request';

/** La fiche (panelCard.ts) telle que l'écran s'en sert (§8.0). Les rappels sont posés par l'écran. */
export interface CardPanelLike {
  readonly root: HTMLElement;
  show(card: Card, who: WhoCandidate | null, line: number, sentence: { what: string; rule: string }, compact: boolean, extra?: CardExtra): void;
  showWho(list: WhoCandidate[], highlighted?: number, ticked?: readonly number[]): void;
  showConfirm(model: ConfirmModel): void;
  showSent(text: string, undo: boolean): void;
  dispose?(): void;
  /** Survol d'une ligne (−1 : le pointeur quitte la fiche). Indices dans la liste montrée (lignes ou « Autres »). */
  onLineHover?: (index: number) => void;
  /** Toucher d'une ligne (doigt) : la surligne. */
  onLineTap?: (index: number) => void;
  /** Envoi d'une ligne (clic, second toucher) ; sans indice : la ligne surlignée (« Donner l'ordre »). */
  onSend?: (index?: number) => void;
  onBack?: () => void;
  onOthers?: () => void;
  onWhoNext?: (step?: 1 | -1) => void;
  onWhoAll?: () => void;
  onWhoList?: () => void;
  /** Liste Qui validée : indices des rangées choisies. */
  onWhoPick?: (indices: number[]) => void;
  onConfirm?: (choice: ConfirmChoice) => void;
  onUndo?: () => void;
  /** ‹ › : lieu précédent / suivant ; onglets des repères empilés. */
  onCandidate?: (step: 1 | -1) => void;
  onStack?: (index: number) => void;
}

/** Panneau de côté (À traiter + Mes unités, Plus…, Cadre légal). */
export interface SidePanelLike {
  readonly root: HTMLElement;
  refresh(force: boolean): void;
  dispose(): void;
  /** Ouvre une section (« journal », « incidents », « commissariats »…). */
  open?(section: string): void;
  /** Nombre d'éléments « À traiter » (pastille de « Suivi » au téléphone). */
  readonly todoCount?: number;
  /** Échap : d'une section au menu (« Plus… ») ; false s'il n'y avait rien à refermer. */
  back?(): boolean;
  /** → / ← dans « Suivi » : déplie / replie la rangée surlignée. */
  fold?(open: boolean): boolean;
}

export interface TacticalParts {
  proposeWho?(line: CardLine, where: { x: number; z: number }, env: WhoEnv): WhoCandidate[];
  previewOf?(line: CardLine, who: WhoCandidate | null, where: Repere, env: CardEnv): CardPreview;
  sentenceOf?(line: CardLine, who: WhoCandidate | null, where: Repere): { what: string; rule: string };
  sendCardLine?(env: SendEnv, line: CardLine, who: WhoCandidate | null, where: Repere): { ok: boolean; text: string; squads: number[] };
  /** Étapes légales de S3 (pré-vérifiées) ; plan null : chaîne impossible, `reason` dit pourquoi. */
  legalPlan?(line: CardLine, who: WhoCandidate | null, where: Repere, env: CardEnv, core: CommandCore): { plan: LegalPlan | null; reason: string; steps?: LegalStep[] };
  todo?(env: CardEnv, core: CommandCore): Repere[];
  /** Environnement de Qui (bestUnit.whoEnvFromCore, avec les exclusions des commissariats) ; sinon celui de l'écran. */
  whoEnv?(core: CommandCore, env: CardEnv, selection: readonly number[]): WhoEnv;
  createCardPanel?(host: HTMLElement, screen: TacticalScreen): CardPanelLike;
  createFollowPanel?(host: HTMLElement, screen: TacticalScreen): SidePanelLike;
  createMorePanel?(host: HTMLElement, screen: TacticalScreen): SidePanelLike;
  createLegalPanel?(host: HTMLElement, screen: TacticalScreen): SidePanelLike;
}

const PARTS: TacticalParts = {};

/** Branche les morceaux construits ailleurs (fiche, panneaux, Qui, aperçu, envoi). Retourne la fonction de retrait. */
export function setTacticalParts(parts: TacticalParts): () => void {
  const before: TacticalParts = { ...PARTS };
  Object.assign(PARTS, parts);
  return () => {
    for (const k of Object.keys(parts) as (keyof TacticalParts)[]) delete PARTS[k];
    Object.assign(PARTS, before);
  };
}

/** Chaîne légale du noyau (legalChain.ts), si elle existe. */
interface LegalChainLike {
  start(plan: LegalPlan): void;
  cancel(): void;
  status(): LegalStatus | null;
}

/** Ajouts de la carte (paquet des gestes) lus s'ils existent. */
interface MapCanvasHooks {
  keyCursor?: 'free' | 'shiftOnly';
  setCursor?(sx: number, sy: number): void;
}
interface TacticalMapHooks {
  onRepereTap?: ((stack: Repere[], sx: number, sy: number, touch: boolean) => void) | null;
  onRepereHover?: ((stack: Repere[], sx: number, sy: number) => void) | null;
  drawCard?(preview: CardPreview | null, visee: Repere | null): void;
  /** Repères partagés avec l'écran (déjà relus à 10 Hz), au lieu d'une seconde lecture de la partie au survol. */
  repereSource?: (() => { env: CardEnv; reperes: readonly Repere[] }) | null;
  /** « Tracer la ligne moi-même » : deux bouts désignés (clics, ou Entrée au curseur). */
  tracing?: boolean;
  beginTrace?(done: (ax: number, az: number, bx: number, bz: number) => void): void;
  traceAtScreen?(sx: number, sy: number): boolean;
  cancelTrace?(): void;
}

// ───────────────────────────── textes ─────────────────────────────

const PHASE_LABELS: Readonly<Record<CrowdPhase, string>> = {
  aucune: 'Pas de rassemblement', rassemblement: 'Rassemblement', depart: 'Départ du cortège', cortege: 'Cortège en marche',
  tension: 'Tension', affrontement: 'Affrontements', dispersion: 'Dispersion', apres_manif: 'Après-manifestation', terminee: 'Manifestation terminée',
};

/**
 * Phase en un mot, pour le téléphone. Le premier mot du libellé long ne suffit pas : « Pas de rassemblement » devenait
 * « Pas » (mode Patrouille, sans manifestation), « Manifestation terminée » « Manifestation ».
 */
const PHASE_SHORT: Readonly<Record<CrowdPhase, string>> = {
  aucune: 'Calme', rassemblement: 'Rassemblement', depart: 'Départ', cortege: 'Cortège', tension: 'Tension',
  affrontement: 'Affrontements', dispersion: 'Dispersion', apres_manif: 'Après la manif', terminee: 'Terminée',
};

/** En-têtes du choix d'une unité à couvrir. */
const TARGET_TITLES: Readonly<Record<string, string>> = { proteger: 'QUI PROTÉGER ?', escorter: 'QUI ESCORTER ?', suivre: 'QUI SUIVRE ?' };

/** Distance de désignation au pointeur (px) : 40 à la souris et au trackpad, 48 au doigt. */
const PICK_PX = 40;
const PICK_PX_TOUCH = 48;

/** Vue et réglages retrouvés à la réouverture de la carte pendant la même session. */
interface Memory { cx: number; cz: number; mpp: number; tab: TacticalTab; selection: number[]; session: unknown; passersby: boolean }
const MEMORY = new WeakMap<CommandCore, Memory>();
/** Le modèle en deux phrases n'est montré qu'à la première ouverture (par partie). */
const MODEL_SHOWN = new WeakSet<CommandCore>();

export class TacticalScreen implements ScreenInstance {
  readonly root: HTMLDivElement;
  readonly map: MapCanvas;
  readonly state = new TacticalState();
  readonly tmap: TacticalMap;
  /** Points de montage de la colonne de droite (feuilles au téléphone). */
  readonly mounts: { follow: HTMLElement; card: HTMLElement; sheet: HTMLElement };
  private readonly cardPanel: CardPanelLike | null;
  private readonly followPanel: SidePanelLike | null;
  private readonly morePanel: SidePanelLike | null;
  private readonly legalPanel: SidePanelLike | null;

  private readonly titleEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly phaseEl: HTMLElement;
  private readonly gaugeEl: HTMLElement;
  private readonly tensionEl: HTMLElement;
  private readonly crowdEl: HTMLElement;
  private readonly clockEl: HTMLElement;
  private readonly scopeEl: HTMLElement;
  /** Pastille légale : bouton (L), simple affichage en lecture seule. */
  private readonly legalBtn: HTMLElement;
  private readonly legalText: HTMLElement;
  private readonly slowBtn: HTMLButtonElement;
  private readonly droneBtn: HTMLButtonElement;
  private readonly suiviBtn: HTMLButtonElement;
  private readonly suiviBadge: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly intentBtns = new Map<IntentId, HTMLButtonElement>();
  private readonly moreBtn: HTMLButtonElement;
  private readonly right: HTMLElement;
  private readonly mapwrap: HTMLElement;
  private readonly orderBanner: HTMLElement;
  private readonly orderLine1: HTMLElement;
  private readonly orderLine2: HTMLElement;
  private readonly searchBox: HTMLElement;
  private readonly searchBtn: HTMLButtonElement;
  private readonly searchInput: HTMLInputElement;
  private readonly searchResults: HTMLElement;
  private readonly helpBox: HTMLElement;
  private readonly modelBox: HTMLElement;
  private readonly mapCtl: HTMLElement;
  private readonly scale: ScaleBar;
  private readonly rose: WindRose;
  private readonly focus: { dispose(): void };

  /** Horloge de l'écran (s, temps réel des images) : gardes et échéances de l'interface. */
  private time = 0;
  private compact = false;
  private narrow = false;
  private short = false;
  /** Fiche qui débordait avec toutes les explications (seule la ligne surlignée garde la sienne). */
  private tightCard = '';
  /** Identité de la fiche montrée (voir tightCard). */
  private cardIdent = '';
  private slow = false;
  private savedScale = 1;
  private lastCard = -1;
  private lastStatus = -1;
  /** Sommations et forces relevées au dernier rafraîchissement du bandeau (pastille légale). */
  private legalKey = '';
  private lastSide = -1;
  /** Environnement des fiches et repères de la scène (rafraîchis à 10 Hz au plus). */
  private env: CardEnv | null = null;
  private reperes: Repere[] = [];
  private envAt = -1;
  /** Fiche affichée, sa ligne et son Qui (pour l'envoi). */
  private card: Card | null = null;
  private whoList: WhoCandidate[] = [];
  private confirmLine: CardLine | null = null;
  private confirmPlan: LegalPlan | null = null;
  /** Ordre donné non collant : la fiche « ✓ ORDRE DONNÉ » se referme à cet instant. */
  private restAt = -1;
  private todoIndex = -1;
  /** C : parcours des commissariats (même liste d'une pression à l'autre). */
  private readonly stationCycle: StationCycle = { order: [], index: -1 };
  /** Maj + flèches : la visée suit le curseur libre de la carte. */
  private freeAim = false;
  private freeAt = -1;
  private lastCursor = { x: -1, y: -1 };
  private lastSolo = -1;
  private readonly w = { x: 0, z: 0 };
  private readonly sp = { x: 0, y: 0 };
  private readonly toScreen = (x: number, z: number, out: { x: number; y: number }): void => {
    this.map.view.worldToScreen(x, z, out);
  };
  private readonly onResize = (): void => this.layout();
  private readonly onKeyDown = (e: KeyboardEvent): void => this.keyDown(e);
  private readonly onNav = (e: Event): void => this.nav(e as CustomEvent<{ dir: Direction }>);
  private readonly onTab = (e: Event): void => {
    // LB / RB de la manette : « À traiter » précédent / suivant
    const step = (e as CustomEvent<{ step: number }>).detail?.step ?? 1;
    this.run({ kind: 'todo', step: step < 0 ? -1 : 1 });
  };

  constructor(readonly core: CommandCore, host: HTMLElement, data: unknown) {
    ensureCommandStyle();
    const ctx = core.ctx;
    const open = (data && typeof data === 'object' ? data : {}) as TacticalOpenData;
    const st = this.state;
    const readOnly = core.scope().level === 'lecture';
    this.root = el('div', 'cm-root ct ct2' + (coarsePointer() ? ' cm-coarse' : '') + (readOnly ? ' is-readonly' : ''));
    this.root.dataset.id = 'tactical';
    host.appendChild(this.root);

    // ── bandeau ──
    const top = el('header', 'ct-top');
    const brand = el('div', 'ct-brand');
    this.titleEl = el('div', 'cm-title', readOnly ? 'Carte — lecture seule' : 'Carte de commandement');
    this.scopeEl = el('span', 'ct-scope');
    brand.append(this.titleEl, this.scopeEl);
    // phase · Tension (jauge) · Foule ~300 · heure (le téléphone garde la phase et l'heure)
    this.statusEl = el('div', 'ct-status');
    this.phaseEl = el('span', 'ct-st');
    this.tensionEl = el('span', 'ct-st ct-gauge');
    this.gaugeEl = el('i');
    this.tensionEl.append(el('span', undefined, 'Tension'), this.gaugeEl);
    this.crowdEl = el('span', 'ct-st ct-st-crowd');
    this.clockEl = el('span', 'ct-st');
    this.statusEl.append(this.phaseEl, this.tensionEl, this.crowdEl, this.clockEl);
    if (readOnly) {
      this.legalBtn = el('div', 'cm-btn is-small ct-chip is-readout');
      this.legalBtn.dataset.id = 'tac-legal';
      this.legalBtn.title = LEGAL_CHIP_TOOLTIP;
    } else {
      this.legalBtn = button('', () => this.run({ kind: 'legal' }), { className: 'is-small ct-chip', id: 'tac-legal', title: LEGAL_CHIP_TOOLTIP });
      this.legalBtn.tabIndex = -1;
    }
    this.legalText = el('span', 'ct-chip-t');
    this.legalBtn.appendChild(this.legalText);
    if (!coarsePointer() && !readOnly) this.legalBtn.appendChild(el('span', 'cm-kbd', 'L'));
    const actions = el('div', 'ct-actions');
    this.droneBtn = button('Vue drone', () => this.toggleDrone(), { icon: 'drone', className: 'is-small', id: 'tac-drone', title: 'Retour vidéo du drone' });
    this.droneBtn.style.display = 'none';
    this.slowBtn = button('Ralentir', () => this.toggleSlow(), { icon: 'slow', className: 'is-small', id: 'tac-slow', title: 'Ralentir le temps pendant que la carte est ouverte (V)' });
    if (!coarsePointer()) this.slowBtn.appendChild(el('span', 'cm-kbd', 'V'));
    this.suiviBtn = button('Suivi', () => this.toggleSheet('suivi'), { icon: 'list', className: 'is-small ct-suivi', id: 'tac-suivi', title: 'À traiter et mes unités' });
    this.suiviBadge = el('em', 'ct-badge');
    this.suiviBtn.appendChild(this.suiviBadge);
    const close = button('Fermer', () => ctx.ui.close('carte_tactique'), { icon: 'close', className: 'is-small ct-close', id: 'tac-close' });
    const key = core.kit ? core.kit.keyLabel('tactical') : '';
    if (key !== '' && !coarsePointer()) close.appendChild(el('span', 'cm-kbd', key));
    for (const b of [this.droneBtn, this.slowBtn, this.suiviBtn, close]) b.tabIndex = -1;
    actions.append(this.droneBtn, this.slowBtn, this.suiviBtn, close);
    top.append(brand, this.statusEl, this.legalBtn, actions);

    // ── corps : carte + barre des intentions à gauche, colonne à droite ──
    const body = el('div', 'ct-body');
    const left = el('div', 'ct-left2');
    this.orderBanner = el('div', 'ct-order');
    this.orderBanner.dataset.id = 'tac-order';
    this.orderLine1 = el('b');
    this.orderLine2 = el('span');
    this.orderBanner.append(this.orderLine1, this.orderLine2);
    this.mapwrap = el('div', 'ct-mapwrap');
    this.map = new MapCanvas(core.maps, this.mapwrap, { base: { margin: 0.3, labels: true, detail: 'plan' }, interval: 0.1 });
    this.map.canvas.tabIndex = 0;
    this.map.canvas.dataset.autofocus = '';
    this.map.canvas.dataset.id = 'tac-map';
    this.map.canvas.classList.add('cm-focusable');
    this.map.view.minMpp = 0.12;
    this.map.view.maxMpp = 7;
    this.map.overlay.selection = st.selection;
    this.map.overlay.commandable = (k) => {
      const u = core.maps.scene.unitModel.get(k);
      return u !== undefined && core.canCommand(u.squadId);
    };
    // flèches simples pour l'écran, Maj + flèches pour le curseur libre ; Entrée au clavier lue par l'écran seul
    (this.map as MapCanvas & MapCanvasHooks).keyCursor = 'shiftOnly';
    this.tmap = new TacticalMap(core, this.map, st);
    const hooks = this.tmap as TacticalMap & TacticalMapHooks;
    hooks.onRepereTap = (stack, sx, sy, touch) => this.tapRepere(stack, sx, sy, touch);
    hooks.repereSource = () => {
      const env = this.refreshEnv(false);
      return { env, reperes: this.reperes };
    };
    hooks.onRepereHover = (stack) => {
      const r = stack[0] ?? null;
      if (r?.key === st.hover?.key) return;
      st.hover = r;
      st.lastInput = 'pointer';
      this.lastCard = -1;
    };

    // rechercher un lieu (R)
    this.searchBox = el('div', 'ct-search');
    this.searchBtn = button('Rechercher un lieu', () => this.openSearch(), { icon: 'search', className: 'is-small', id: 'tac-search', title: 'Rechercher une rue, une place (R)' });
    this.searchBtn.tabIndex = -1;
    if (!coarsePointer()) this.searchBtn.appendChild(el('span', 'cm-kbd', 'R'));
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Rue, place, monument…';
    this.searchInput.autocomplete = 'off';
    this.searchInput.spellcheck = false;
    this.searchInput.setAttribute('aria-label', 'Rechercher un lieu');
    this.searchInput.dataset.id = 'tac-search-input';
    this.searchResults = el('div', 'ct-search-res');
    this.searchBox.append(this.searchBtn, this.searchInput, this.searchResults);
    this.searchInput.addEventListener('input', () => this.searchRefresh());
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = this.searchResults.querySelector('button');
        if (first) (first as HTMLButtonElement).click();
        else this.closeSearch();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeSearch();
      }
      e.stopPropagation();
    });
    // Échap / ⌫ dans le champ : le champ s'en occupe (⌫ efface une lettre, il ne ferme pas la carte)
    this.searchInput.addEventListener('ui:back', (e) => e.preventDefault());

    // aide (H) et modèle de la première ouverture
    this.helpBox = el('div', 'cm-panel ct-help');
    this.helpBox.dataset.id = 'tac-help';
    this.helpBox.appendChild(el('p', 'ct-help-model', HELP_MODEL));
    const ul = el('ul');
    for (const line of HELP_LINES) ul.appendChild(el('li', undefined, line));
    this.helpBox.appendChild(ul);
    const helpClose = button('Fermer l’aide', () => this.toggleHelp(false), { className: 'is-small', id: 'tac-help-close' });
    helpClose.tabIndex = -1;
    this.helpBox.appendChild(helpClose);
    this.modelBox = el('div', 'ct-model');
    this.modelBox.appendChild(el('span', undefined, HELP_MODEL));
    const modelOk = button('Compris', () => this.modelBox.classList.remove('is-on'), { className: 'is-small', id: 'tac-model-ok' });
    modelOk.tabIndex = -1;
    this.modelBox.appendChild(modelOk);
    // le premier geste du pointeur (ou du doigt) ailleurs referme aussi le modèle : il masquait le bouton « + » du zoom et le bas
    // de la carte tant que le joueur n'avait touché ni une touche ni « Compris »
    this.root.addEventListener('pointerdown', (e) => {
      if (!(e.target instanceof Node) || !this.modelBox.contains(e.target)) this.modelBox.classList.remove('is-on');
    }, true);

    // + / − / ◎ Moi
    this.mapCtl = el('div', 'cm-mapctl ct-mapctl');
    const zin = button('', () => this.map.zoomBy(1.6), { icon: 'plus', className: 'is-icon', title: 'Zoom avant (=)', id: 'zoom-in' });
    const zout = button('', () => this.map.zoomBy(1 / 1.6), { icon: 'minus', className: 'is-icon', title: 'Zoom arrière (−)', id: 'zoom-out' });
    const me = button('Moi', () => this.run({ kind: 'me' }), { icon: 'locate', className: 'is-small ct-me', title: 'Ma position (G)', id: 'recenter' });
    if (!coarsePointer()) me.appendChild(el('span', 'cm-kbd', 'G'));
    for (const b of [zin, zout, me]) b.tabIndex = -1;
    this.mapCtl.append(zin, zout, me);
    this.scale = new ScaleBar(this.mapwrap);
    this.rose = new WindRose(this.mapwrap, 'ct-wind');
    this.mapwrap.append(this.searchBox, this.modelBox, this.helpBox, this.mapCtl);

    // barre des intentions
    this.bar = el('nav', 'ct-intents');
    this.bar.dataset.id = 'tac-intents';
    for (const it of INTENTS) {
      const b = this.intentButton(it.label, it.sub, it.key, iconMarkup(it.icon, 'ct-ic'), it.tooltip, 'intent-' + it.id, () => this.run({ kind: 'intent', id: it.id }));
      this.intentBtns.set(it.id, b);
      this.bar.appendChild(b);
    }
    this.moreBtn = this.intentButton(MORE_BUTTON.label, MORE_BUTTON.sub, MORE_BUTTON.key, iconMarkup(MORE_BUTTON.icon, 'ct-ic'), MORE_BUTTON.tooltip, 'tac-more', () => this.run({ kind: 'more' }));
    this.bar.appendChild(this.moreBtn);
    left.append(this.orderBanner, this.mapwrap, this.bar);

    // colonne de droite : trois points de montage
    this.right = el('aside', 'ct-right2');
    const mount = (name: string): HTMLElement => {
      const m = el('div', 'ct-mount ct-mount-' + name);
      m.dataset.mount = name;
      this.right.appendChild(m);
      return m;
    };
    this.mounts = { follow: mount('follow'), card: mount('card'), sheet: mount('sheet') };
    body.append(left, this.right);
    this.root.append(top, body);

    // morceaux branchés (fiche, panneaux) : absents tant que l'intégration ne les a pas fournis
    this.cardPanel = this.tryCreate(() => PARTS.createCardPanel?.(this.mounts.card, this) ?? null);
    this.followPanel = this.tryCreate(() => PARTS.createFollowPanel?.(this.mounts.follow, this) ?? null);
    this.morePanel = this.tryCreate(() => PARTS.createMorePanel?.(this.mounts.sheet, this) ?? null);
    this.legalPanel = this.tryCreate(() => PARTS.createLegalPanel?.(this.mounts.sheet, this) ?? null);
    this.wireCardPanel();

    // ── état initial ──
    this.layout();
    core.maps.scene.invalidate();
    core.maps.use();
    const mem = MEMORY.get(core);
    const sameSession = mem !== undefined && mem.session === ctx.session.config;
    if (readOnly) this.readOnlyView();
    else if (sameSession && open.x === undefined) {
      this.map.jumpTo(mem.cx, mem.cz, mem.mpp);
      st.tab = mem.tab;
    } else this.initialView(open);
    this.refreshEnv(true);
    if (!readOnly) this.initialVisee(open);
    if (open.tab) this.openMore(open.tab);
    if (!readOnly && !MODEL_SHOWN.has(core)) {
      MODEL_SHOWN.add(core);
      this.modelBox.classList.add('is-on');
    }
    // la racine reçoit « ui:nav » (croix de la manette) et « ui:tab » (LB / RB) ; l'écouteur clavier est en capture
    this.root.addEventListener('ui:nav', this.onNav);
    host.addEventListener('ui:tab', this.onTab);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown, true);
    document.documentElement.classList.add('ct-open');
    this.focus = core.kit ? core.kit.focusGroup(this.root) : { dispose(): void {} };
    this.refresh(true);
  }

  private tryCreate<T>(make: () => T | null): T | null {
    try {
      return make();
    } catch (err) {
      console.error('[carte de commandement] panneau : création impossible', err);
      return null;
    }
  }

  /** Bouton d'intention : pictogramme, libellé, deuxième ligne, touche ; info-bulle complète. */
  private intentButton(label: string, sub: string, key: string, svg: string, tooltip: string, id: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ct-intent';
    b.dataset.id = id;
    b.tabIndex = -1;
    b.title = tooltip;
    b.innerHTML = svg;
    const txt = el('span', 'ct-intent-t');
    txt.append(el('b', undefined, label), el('small', undefined, sub));
    // téléphone : un seul mot (« Bloquer », « Encercler », « Plus »)
    txt.appendChild(el('i', 'ct-intent-w', label.replace(/…$/, '').split(' ')[0]!));
    b.appendChild(txt);
    if (!coarsePointer()) b.appendChild(el('span', 'cm-kbd', key));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.state.lastInput = (e as PointerEvent).pointerType === 'touch' ? 'touch' : 'pointer';
      onClick();
    });
    return b;
  }

  private wireCardPanel(): void {
    const p = this.cardPanel;
    if (!p) return;
    const st = this.state;
    p.onLineHover = (i) => {
      if (!st.card || st.sheet !== 'card') return;
      st.lastInput = 'pointer';
      if (i < 0) {
        // le pointeur quitte la fiche : retour à la ligne du clavier (ou à la ligne par défaut)
        if (this.hoverLine >= 0) {
          st.card.line = this.hoverLine;
          st.card.chosen = this.hoverChosen;
        }
        this.hoverLine = -1;
      } else {
        if (this.hoverLine < 0) {
          this.hoverLine = st.card.line;
          this.hoverChosen = st.card.chosen;
        }
        // la ligne survolée tient tant que le pointeur y reste (le rafraîchissement ne la ramène pas à la ligne par défaut)
        st.card.line = i;
        st.card.chosen = true;
      }
      this.lastCard = -1;
    };
    p.onLineTap = (i) => {
      if (!st.card) return;
      st.lastInput = 'touch';
      this.hoverLine = -1;
      this.highlight(i);
    };
    p.onSend = (i) => {
      this.hoverLine = -1;
      if (i !== undefined && st.card) st.card.line = i;
      this.accept(true);
    };
    p.onBack = () => this.back();
    p.onOthers = () => this.toggleOthers();
    p.onWhoNext = (step) => this.run({ kind: 'unit', step: step ?? 1 });
    p.onWhoAll = () => this.run({ kind: 'whole' });
    p.onWhoList = () => this.run({ kind: 'whoList' });
    p.onWhoPick = (indices) => this.pickWho(indices);
    p.onConfirm = (choice) => this.confirm(choice);
    p.onUndo = () => this.run({ kind: 'undo' });
    p.onCandidate = (step) => this.cycleCandidate(step);
    p.onStack = (i) => this.visitStack(i);
  }

  /** Ligne surlignée au clavier avant un survol (le pointeur qui quitte la fiche la rend). */
  private hoverLine = -1;
  private hoverChosen = false;
  /** Téléphone : une feuille vient de s'ouvrir, la carte rétrécie remontre la visée (une fois). */
  private sheetOpen = false;
  private recenter = -1;

  // ───────────────────────────── vues initiales ─────────────────────────────

  private initialView(open: TacticalOpenData): void {
    const core = this.core;
    const scene = core.maps.scene;
    const b = core.ctx.world.bounds;
    if (open.x !== undefined && open.z !== undefined) {
      this.map.jumpTo(open.x, open.z, open.mpp ?? 0.9);
      return;
    }
    // cadrer les unités du joueur (à défaut, toutes celles qu'il voit) et sa propre position
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, n = 0;
    const take = (x: number, z: number): void => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      n++;
    };
    const any = core.scope().squadIds.size === 0;
    // les voitures de patrouille sillonnent tout Paris : elles ne comptent dans le cadrage que s'il n'y a qu'elles
    // (sinon la carte s'ouvre sur la moitié de la ville et la place de la manifestation devient minuscule)
    const framed = (u: (typeof scene.units)[number]): boolean => u.childCount === 0 && (any || core.canCommand(u.squadId));
    const troops = scene.units.some((u) => framed(u) && u.symbol !== 'patrouille');
    for (let i = 0; i < scene.units.length; i++) {
      const u = scene.units[i]!;
      if (framed(u) && !(troops && u.symbol === 'patrouille')) take(u.x, u.z);
    }
    if (scene.hasPlayer) take(scene.px, scene.pz);
    if (scene.hasHead) take(scene.headX, scene.headZ);
    if (n === 0) {
      this.map.jumpTo((b.minX + b.maxX) * 0.5, (b.minZ + b.maxZ) * 0.5, 2.5);
      return;
    }
    const v = this.map.view;
    v.setSize(Math.max(200, this.map.el.clientWidth), Math.max(200, this.map.el.clientHeight));
    if (open.mpp !== undefined) {
      v.fitBounds(minX, minZ, maxX, maxZ, 90);
      v.setMpp(Math.min(2.2, Math.max(0.55, open.mpp)));
    } else {
      tacticalFrame(v, minX, minZ, maxX, maxZ, scene.hasPlayer ? { x: scene.px, z: scene.pz } : null, 0.55, 2.2);
    }
    this.map.invalidate();
  }

  /** Lecture seule : la carte cadre le joueur et la destination de son unité (§2.9). */
  private readOnlyView(): void {
    const scene = this.core.maps.scene;
    scene.refreshPlayer();
    const v = this.map.view;
    v.setSize(Math.max(200, this.map.el.clientWidth), Math.max(200, this.map.el.clientHeight));
    const brief = this.brief();
    const c = brief?.command ?? null;
    // sans ordre d'en haut, l'appel de CENTRAL que l'équipage de patrouille a pris (mode Patrouille)
    const call = c ? null : this.patrolCall();
    const dest = c && (c.x !== 0 || c.z !== 0) ? { x: c.x, z: c.z } : call ? { x: call.x, z: call.z } : null;
    if (scene.hasPlayer) readOnlyFrame(v, { x: scene.px, z: scene.pz }, dest);
    else this.initialView({});
    this.map.invalidate();
  }

  /** S0 : la visée se pose sur le premier « À traiter », sinon la foule principale, sinon « VOUS ». */
  private initialVisee(open: TacticalOpenData): void {
    const env = this.env!;
    const st = this.state;
    if (open.incidentId) {
      const r = this.reperes.find((q) => q.kind === 'incident' && q.incidentId === open.incidentId);
      if (r) {
        this.openRepere(r);
        return;
      }
    }
    if (open.commissariatId) {
      const r = this.reperes.find((q) => q.kind === 'commissariat' && q.stationId === open.commissariatId);
      if (r) {
        this.openRepere(r);
        return;
      }
    }
    if (open.squadId) {
      const u = env.units.find((q) => q.squadId === open.squadId);
      if (u) {
        this.openRepere(unitRepere(u));
        return;
      }
    }
    const todo = this.todoList();
    const crowd = this.reperes.find((r) => r.kind === 'foule' || r.kind === 'nasse');
    const vous = this.reperes.find((r) => r.kind === 'vous');
    st.visee = todo[0] ?? crowd ?? vous ?? null;
    this.placeCursor();
  }

  // ───────────────────────────── disposition ─────────────────────────────

  private layout(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    const compact = w < 980 || h < 520;
    const narrow = w < 1200;
    const short = h < 760;
    if (compact !== this.compact || narrow !== this.narrow || short !== this.short) {
      this.compact = compact;
      this.narrow = narrow;
      this.short = short;
      setClass(this.root, 'is-compact', compact);
      setClass(this.root, 'is-narrow', narrow);
      setClass(this.root, 'is-short', short);
      this.lastCard = -1;
      this.state.touch();
    }
  }

  /** Sous-titres radio en haut à gauche de la carte (à droite de « Rechercher un lieu »), messages en bas à gauche. */
  private placeNotices(): void {
    const root = document.documentElement;
    const m = this.mapwrap.getBoundingClientRect();
    if (m.width <= 0) return;
    const s = this.searchBox.getBoundingClientRect();
    const left = Math.round((s.width > 0 ? s.right : m.left) + 12);
    const set = (name: string, v: string): void => {
      if (root.style.getPropertyValue(name) !== v) root.style.setProperty(name, v);
    };
    set('--ct-sub-left', left + 'px');
    set('--ct-sub-top', Math.round(m.top + 8) + 'px');
    set('--ct-sub-max', Math.round(Math.max(160, Math.min(m.width * 0.5, m.right - left - 70))) + 'px');
    set('--ct-toast-left', Math.round(m.left + 10) + 'px');
    // au-dessus de la rose des vents et de l'échelle (bas à gauche de la carte), jamais dessus
    set('--ct-toast-bottom', Math.round(window.innerHeight - m.bottom + 100) + 'px');
    set('--ct-toast-max', Math.round(Math.max(200, m.width * 0.6)) + 'px');
  }

  // ───────────────────────────── services ─────────────────────────────

  private brief(): MissionBrief | null {
    const b = this.core.ctx.service<MissionBrief>(MISSION_SERVICE);
    return b && typeof b === 'object' ? b : null;
  }

  /**
   * Appel de CENTRAL pris par l'équipage du joueur (service 'patrol.mode', mode Patrouille) : la carte en lecture seule
   * le dit et le cadre, au lieu de « Aucun ordre reçu pour l'instant ». null hors vacation ou sans appel pris.
   */
  private patrolCall(): ReadOnlyCall | null {
    const api = this.core.ctx.service<PatrolModeApi>(PATROL_MODE_SERVICE);
    const call = api && api.active ? api.current : null;
    if (!call || (call.state !== 'acceptee' && call.state !== 'sur_place')) return null;
    return { label: call.label, place: call.place, x: call.x, z: call.z, onSite: call.state === 'sur_place' };
  }

  private chain(): LegalChainLike | null {
    const c = (this.core as unknown as { legalChain?: LegalChainLike }).legalChain;
    return c && typeof c.start === 'function' ? c : null;
  }

  private droneFeed(): DroneFeedApi | undefined {
    const f = this.core.ctx.service<DroneFeedApi>(DRONE_FEED_SERVICE);
    return f && typeof f.toggle === 'function' ? f : undefined;
  }

  private toggleDrone(): void {
    const feed = this.droneFeed();
    if (!feed) return;
    feed.toggle();
    setClass(this.droneBtn, 'is-on', feed.open);
  }

  /** « Vue drone » (s'il y a un drone engagé) ; la fiche de l'équipe drone ouvre le retour vidéo de son appareil. */
  private refreshDrone(): void {
    const feed = this.droneFeed();
    const engaged = !!feed && this.core.maps.scene.vis.police && feed.engaged();
    const display = engaged ? '' : 'none';
    if (this.droneBtn.style.display !== display) this.droneBtn.style.display = display;
    setClass(this.droneBtn, 'is-on', engaged && feed!.open);
    const r = this.state.card?.repere;
    const solo = r && r.kind === 'unite' && r.squadId ? r.squadId : 0;
    if (solo === this.lastSolo) return;
    const first = this.lastSolo < 0;
    this.lastSolo = solo;
    if (first || !engaged || solo === 0) return;
    const u = this.core.maps.scene.unitModel.get(solo);
    if (u && u.symbol === 'drone') {
      feed!.showSquad(u.squadId);
      setClass(this.droneBtn, 'is-on', feed!.open);
    }
  }

  private toggleSlow(): void {
    const clock = this.core.ctx.clock;
    if (!this.slow) {
      this.savedScale = clock.timeScale;
      clock.timeScale = 0.25;
      this.slow = true;
    } else {
      clock.timeScale = this.savedScale;
      this.slow = false;
    }
    setClass(this.slowBtn, 'is-on', this.slow);
    const t = this.slowBtn.querySelector('.cm-btn-t');
    if (t) setText(t as HTMLElement, this.slow ? 'Temps normal' : 'Ralentir');
  }

  /** Message local (bas à gauche de la carte, deux au plus : feuille de style). */
  private say(text: string, kind: 'info' | 'warn' | 'ok' = 'info', seconds = 4): void {
    if (text.trim() === '') return;
    this.core.ctx.ui.notify(text, kind, seconds);
    if (kind === 'warn') this.core.ctx.audio.play('ui_alerte');
  }

  // ───────────────────────────── environnement des fiches ─────────────────────────────

  private selectionIds(): number[] {
    return Array.from(this.state.selection).filter((k) => k > 0);
  }

  private refreshEnv(force: boolean): CardEnv {
    if (!force && this.env && this.time - this.envAt < 0.1) return this.env;
    this.envAt = this.time;
    this.env = cardEnvFromCore(this.core, this.selectionIds());
    this.reperes = collectReperes(this.env);
    return this.env;
  }

  /** Environnement des fiches de l'écran (relu à 10 Hz au plus) : les panneaux le partagent. */
  cardEnv(): CardEnv {
    return this.refreshEnv(false);
  }

  /** Repère à jour (position, nom) d'après sa clé ; un point ou une rue hors liste reste tel quel. */
  private fresh(r: Repere): Repere {
    return this.reperes.find((q) => q.key === r.key) ?? r;
  }

  /** Ce que T sélectionne : le nœud de commandement du joueur (compagnie, section, groupe). */
  private wholeOf(env: CardEnv): { squadIds: number[]; label: string } | null {
    // environnement de Qui branché (bestUnit.whoEnvFromCore) : un commandant sans unité propre prend ses unités du sommet
    if (PARTS.whoEnv) {
      try {
        const w = PARTS.whoEnv(this.core, env, []).whole;
        if (w && w.squadIds.length > 0) return { squadIds: w.squadIds.slice(), label: w.label };
      } catch {
        /* environnement indisponible : le nœud du joueur */
      }
    }
    const id = this.core.scope().ownSquadId;
    if (id === 0 || !this.core.canCommand(id)) return null;
    const label = env.command === 'groupe' ? 'Tout le groupe' : env.command === 'section' ? 'Toute la section' : 'Toute la compagnie';
    return { squadIds: [id], label };
  }

  private whoEnv(env: CardEnv): WhoEnv {
    const core = this.core;
    if (PARTS.whoEnv) {
      try {
        return PARTS.whoEnv(core, env, this.selectionIds());
      } catch (err) {
        console.error('[carte de commandement] environnement de Qui', err);
      }
    }
    const scene = core.maps.scene;
    const holding = holdingSquads(scene.barrages);
    const can = (id: number): boolean => core.canOrder(id);
    return {
      card: env, selection: this.selectionIds(), whole: this.wholeOf(env), holding, canCommand: can,
      nasse: (crowdKey) => {
        const crowd = scene.crowdExits.find((c) => c.key === crowdKey);
        if (!crowd) return null;
        const p = buildNasseProposal(crowd, nasseCandidates(core, [], keyboardSections(scene.units, can)), holding);
        if (p.lines.length === 0) return null;
        return { squadIds: p.lines.map((l) => l.squadId), label: `${p.lines.length} unité${p.lines.length > 1 ? 's choisies' : ' choisie'} par le jeu` };
      },
    };
  }

  private todoList(): Repere[] {
    const env = this.env!;
    if (PARTS.todo) {
      try {
        return PARTS.todo(env, this.core);
      } catch {
        /* liste branchée défaillante : celle par défaut */
      }
    }
    return todoReperes(env);
  }

  // ───────────────────────────── fiche ─────────────────────────────

  /** Ligne surlignée de la fiche affichée (dans les lignes, ou dans « Autres » dépliés). */
  private currentLine(): CardLine | null {
    const c = this.card;
    const s = this.state.card;
    if (!c || !s) return null;
    const list = s.othersOpen ? c.others : c.lines;
    return list[s.line] ?? null;
  }

  /** Qui de la ligne : imposé, choisi, sinon proposé par le jeu (U fait défiler, T prend tout). */
  private resolveWho(card: Card, line: CardLine | null, where: Repere, env: CardEnv): WhoCandidate | null {
    const st = this.state;
    this.whoList = [];
    // « OÙ L'ENVOYER ? » d'une unité d'un commissariat : délai recalculé pour le lieu visé
    if (st.where) return st.where.who.fromStation !== undefined ? stationWhoAt(this.core, st.where.who, where) : st.where.who;
    if (card.whoFixed && card.whoFixed.length > 0) return fixedCandidate(env, card.whoFixed, where);
    if (!line || !line.needsWho) return null;
    const sel = this.selectionIds();
    if (sel.length > 0) return fixedCandidate(env, sel, where);
    if (!st.whoAuto && st.who) return st.who;
    if (st.whole) {
      const whole = this.wholeOf(env);
      if (whole) return fixedCandidate(env, whole.squadIds, where, whole.label);
    }
    if (!PARTS.proposeWho) return null;
    try {
      this.whoList = PARTS.proposeWho(line, where, this.whoEnv(env));
    } catch (err) {
      console.error('[carte de commandement] proposition de l’unité', err);
      this.whoList = [];
    }
    if (this.whoList.length === 0) return null;
    // d'office : la première de mes unités, jamais un renfort de commissariat (U les atteint ensuite)
    return whoAt(this.whoList, st.whoIndex);
  }

  /** Recalcule la fiche ouverte (repère à jour, ligne, Qui, aperçu, phrase) et la montre. */
  private refreshCard(): void {
    const st = this.state;
    const s = st.card;
    const env = this.refreshEnv(false);
    const hooks = this.tmap as TacticalMap & TacticalMapHooks;
    if (!s) {
      this.card = null;
      // au repos : la visée (ou le repère survolé au pointeur) et son nom
      const v = st.lastInput !== 'keys' && st.hover ? st.hover : st.visee ? this.fresh(st.visee) : null;
      hooks.drawCard?.(null, v);
      this.map.overlay.focusCrowd = v && v.crowdKey ? v.crowdKey : '';
      return;
    }
    const r = this.fresh(s.repere);
    s.repere = r;
    st.visee = r;
    let card = buildCard(r, env, st.where ? null : st.intent);
    if (s.verb) {
      const target = st.where?.target ? env.units.find((u) => u.squadId === r.squadId)?.targetEntity : undefined;
      card = withVerbFirst(card, s.verb, env, target);
      if (st.where?.target) card = { ...card, lines: card.lines.slice(card.defaultLine, card.defaultLine + 1), others: [], defaultLine: 0 };
    }
    if (st.where) card = { ...card, title: st.where.title, whoFixed: null };
    card = { ...card, stack: s.stack };
    if (!s.chosen) s.line = card.defaultLine;
    const list = s.othersOpen ? card.others : card.lines;
    if (s.line >= list.length) s.line = Math.max(0, list.length - 1);
    this.card = card;
    const line = this.currentLine();
    const who = this.resolveWho(card, line, r, env);
    st.who = st.whoAuto ? who : st.who;
    let preview: CardPreview | null = null;
    let sentence = { what: '', rule: line?.rule ?? '' };
    if (line && PARTS.previewOf) {
      try { preview = PARTS.previewOf(line, who, r, env); } catch { preview = null; }
    }
    if (line && PARTS.sentenceOf) {
      try { sentence = PARTS.sentenceOf(line, who, r); } catch { /* phrase indisponible : la règle seule */ }
    }
    this.map.overlay.focusCrowd = r.crowdKey ?? '';
    hooks.drawCard?.(preview, r);
    const p = this.cardPanel;
    if (!p) return;
    if (st.sheet === 'qui') {
      p.showWho(this.whoListFull(card, line, r, env), st.whoListIndex, Array.from(st.whoTicks));
      return;
    }
    if (st.sheet === 'confirm') return;
    const pos = st.candidates.length > 1 && st.candidates.some((q) => q.key === r.key) ? `${st.candIndex + 1} / ${st.candidates.length}` : '';
    const sticky = isSticky(st.intent) && pos !== '' && st.candIndex > 0 ? this.stickyText() : '';
    const wholeLabel = this.wholeOf(env)?.label ?? '';
    // une fiche chargée (onglets, notes, règles) qui déborderait avec l'explication de chaque ligne : seule la ligne
    // surlignée garde la sienne (la fiche ne défile jamais, §2.0) ; mémorisé pour cette fiche, sans clignoter
    const ident = `${r.key}|${card.lines.length}|${s.othersOpen ? 1 : 0}|${card.notes.length}`;
    const opts = {
      othersOpen: s.othersOpen, explainAll: !this.compact && !this.short && this.tightCard !== ident,
      hint: st.lastInput === 'keys' && !this.compact ? (env.level === 'lecture' ? CARD_HINT_READONLY : CARD_HINT) : '',
      position: pos, stackIndex: Math.max(0, s.stack.findIndex((q) => q.key === r.key)), sticky, wholeLabel, whole: st.whole,
      whoFixed: !!st.where || (card.whoFixed !== null && card.whoFixed.length > 0),
    };
    this.cardIdent = ident;
    p.root.classList.toggle('is-tight', this.tightCard === ident);
    p.show(card, who, s.line, sentence, this.compact, opts);
    if (this.tightCard !== ident && overflows(p.root)) {
      // encore trop haute : explication de la seule ligne surlignée, rangées et blocs resserrés (classe is-tight)
      this.tightCard = ident;
      p.root.classList.add('is-tight');
      p.show(card, who, s.line, sentence, this.compact, { ...opts, explainAll: false });
    }
    const sent = st.lastSent;
    if (sent && this.time - sent.at < SENT_SECONDS) p.showSent(sent.text, sent.undo && this.time - sent.at < UNDO_SECONDS);
  }

  /** « Rue suivante (2 / 7) — Entrée : la bloquer aussi · Échap : terminer ». */
  private stickyText(): string {
    const st = this.state;
    const n = `(${st.candIndex + 1} / ${st.candidates.length})`;
    switch (st.intent) {
      case 'bloquer': return `Rue suivante ${n} — Entrée : la bloquer aussi · Échap : terminer`;
      case 'secours': return `Secours suivant ${n} — Entrée : y envoyer aussi · Échap : terminer`;
      case 'interpeller': return `Interpellation suivante ${n} — Entrée : interpeller aussi · Échap : terminer`;
      default: return '';
    }
  }

  /** Liste Qui (§2.4) : les candidats du jeu, puis « Toute la compagnie ». */
  private whoListFull(card: Card, line: CardLine | null, where: Repere, env: CardEnv): WhoCandidate[] {
    let list: WhoCandidate[] = [];
    if (line && PARTS.proposeWho) {
      try { list = PARTS.proposeWho(line, where, { ...this.whoEnv(env), selection: [] }).slice(); } catch { list = []; }
    }
    if (list.length === 0) {
      // sans proposition : mes unités (sections d'abord), par distance
      const scene = this.core.maps.scene;
      const secs = keyboardSections(scene.units, (id) => this.core.canOrder(id));
      for (const u of secs) list.push(fixedCandidate(env, [u.squadId], where));
      list.sort((a, b) => a.eta - b.eta);
    }
    const whole = this.wholeOf(env);
    // au plus 7 rangées (§2.4) : les meilleures de mes unités, « Toute la compagnie », un renfort de commissariat
    // (U parcourt toujours tous les candidats) ; la liste tient ainsi dans la feuille du téléphone sans défiler
    const own = list.filter((c) => c.fromStation === undefined);
    const station = list.find((c) => c.fromStation !== undefined);
    // téléphone : 3 de mes unités (la feuille de 390 px montre alors toute la liste, « Toute la compagnie » comprise)
    const best = this.compact ? 3 : 5;
    const keep = own.slice(0, whole ? best : best + 1);
    if (whole && !keep.some((c) => c.squadIds.length === 1 && c.squadIds[0] === whole.squadIds[0])) {
      keep.push(fixedCandidate(env, whole.squadIds, where, whole.label));
    }
    if (station) keep.push(station);
    void card;
    this.whoList = keep;
    return keep;
  }

  /** Ouvre la fiche d'un repère (panneaux, clic, Entrée) ; la carte va vers lui s'il est hors de la vue. */
  openRepere(r: Repere, stack: readonly Repere[] = [r], verb: OrderType | null = null): void {
    const st = this.state;
    st.openCard(r, stack, verb ?? st.where?.verb ?? null);
    this.hoverLine = -1;
    this.restAt = -1;
    this.ensureVisible(r);
    this.placeCursor();
    this.lastCard = -1;
  }

  /** « Plus… › Tous les ordres » : la fiche s'ouvre à la visée sur cet ordre seul, surligné, Qui proposé. */
  verbFirst(type: OrderType): void {
    const st = this.state;
    const env = this.refreshEnv(true);
    let r = st.visee ? this.fresh(st.visee) : null;
    if (!r) {
      const v = this.map.view;
      this.map.worldAt(v.width * 0.5, v.height * 0.5, this.w);
      r = placeRepere(this.w.x, this.w.z, env);
    }
    st.intent = null;
    st.sheet = 'card';
    this.openRepere(r, [r], type);
  }

  private highlight(i: number): void {
    const s = this.state.card;
    if (!s || !this.card) return;
    const list = s.othersOpen ? this.card.others : this.card.lines;
    if (i < 0 || i >= list.length) return;
    s.line = i;
    s.chosen = true;
    this.lastCard = -1;
  }

  private toggleOthers(): void {
    const s = this.state.card;
    if (!s || !this.card) return;
    if (!s.othersOpen && this.card.others.length === 0) return;
    s.othersOpen = !s.othersOpen;
    s.line = 0;
    s.chosen = s.othersOpen;
    this.lastCard = -1;
  }

  // ───────────────────────────── visée ─────────────────────────────

  /** Le curseur de la carte suit la visée (réticule jaune). */
  private placeCursor(): void {
    const v = this.state.visee;
    if (!v) return;
    this.map.view.worldToScreen(v.x, v.z, this.sp);
    (this.map as MapCanvas & MapCanvasHooks).setCursor?.(this.sp.x, this.sp.y);
    this.lastCursor.x = this.sp.x;
    this.lastCursor.y = this.sp.y;
  }

  /** La carte se déplace pour montrer le repère s'il est hors de la vue (ou sous la feuille du téléphone). */
  private ensureVisible(r: Repere): void {
    const v = this.map.view;
    v.worldToScreen(r.x, r.z, this.sp);
    const m = 40;
    if (this.sp.x < m || this.sp.y < m || this.sp.x > v.width - m || this.sp.y > v.height - m) this.map.flyTo(r.x, r.z);
  }

  /** Repères visibles à l'écran (les flèches ne sautent pas hors de la vue). */
  private onScreen(): Repere[] {
    const v = this.map.view;
    const out: Repere[] = [];
    for (const r of this.reperes) {
      v.worldToScreen(r.x, r.z, this.sp);
      if (this.sp.x >= 0 && this.sp.y >= 0 && this.sp.x <= v.width && this.sp.y <= v.height) out.push(r);
    }
    return out;
  }

  /** Position de la visée à l'écran (centre de la vue sans visée). */
  private viseeScreen(): { sx: number; sy: number } {
    const v = this.map.view;
    const r = this.state.visee;
    if (!r) return { sx: v.width * 0.5, sy: v.height * 0.5 };
    v.worldToScreen(r.x, r.z, this.sp);
    return { sx: this.sp.x, sy: this.sp.y };
  }

  /** Au repos (ou fiche sans intention), une flèche : la visée saute au repère voisin ; rien dans le cône : la carte défile. */
  private jump(dir: Direction): Repere | null {
    this.refreshEnv(false);
    const next = nextInDirection(this.viseeScreen(), dir, this.onScreen(), this.toScreen);
    if (!next) {
      const v = this.map.view;
      const step = Math.round(Math.min(v.width, v.height) * 0.35);
      const dx = dir === 'left' ? -step : dir === 'right' ? step : 0;
      const dy = dir === 'up' ? -step : dir === 'down' ? step : 0;
      // la vue se déplace vers la direction : le contenu glisse en sens inverse
      v.panByPixels(-dx, -dy);
      this.map.invalidate();
      return null;
    }
    this.state.visee = next;
    this.state.hover = null;
    this.placeCursor();
    this.lastCard = -1;
    return next;
  }

  /** ←/→ en fiche : repères empilés d'abord, puis lieu précédent / suivant de l'intention (ou voisin à l'écran). */
  private cycleCandidate(step: 1 | -1): void {
    const st = this.state;
    const s = st.card;
    if (s && s.stack.length > 1) {
      const i = s.stack.findIndex((q) => q.key === s.repere.key);
      const j = i + step;
      if (j >= 0 && j < s.stack.length) {
        this.visitStack(j);
        return;
      }
    }
    if (st.candidates.length > 0) {
      const n = st.candidates.length;
      st.candIndex = (((st.candIndex + step) % n) + n) % n;
      const r = st.candidates[st.candIndex]!;
      this.openRepere(r, [r], s?.verb ?? null);
      return;
    }
    const r = this.jump(step > 0 ? 'right' : 'left');
    if (r) this.openRepere(r, [r], s?.verb ?? null);
  }

  private visitStack(i: number): void {
    const s = this.state.card;
    if (!s || i < 0 || i >= s.stack.length) return;
    const stack = s.stack;
    const verb = s.verb;
    this.openRepere(stack[i]!, stack, verb);
  }

  /** Visée libre (Maj + flèches, stick de la manette) : la fiche du point sous le curseur suit, à 10 Hz. */
  private followCursor(): void {
    const m = this.map;
    if (!m.cursorOn || !this.freeAim) return;
    if (Math.abs(m.cursorX - this.lastCursor.x) < 0.5 && Math.abs(m.cursorY - this.lastCursor.y) < 0.5) return;
    if (this.time - this.freeAt < 0.1) return;
    this.freeAt = this.time;
    this.lastCursor.x = m.cursorX;
    this.lastCursor.y = m.cursorY;
    const env = this.refreshEnv(false);
    const stack = pickAt(this.reperes, m.cursorX, m.cursorY, PICK_PX, this.toScreen);
    m.worldAt(m.cursorX, m.cursorY, this.w);
    const r = stack[0] ?? placeRepere(this.w.x, this.w.z, env);
    const st = this.state;
    st.visee = r;
    if (st.card && st.card.repere.key !== r.key) {
      st.openCard(r, stack.length > 0 ? stackOf(stack) : [r], st.card.verb);
    }
    this.lastCard = -1;
  }

  // ───────────────────────────── pointeur ─────────────────────────────

  /** Clic ou toucher sur la carte (la carte a déjà accroché les repères à 40 px, 48 px au doigt). Jamais d'envoi. */
  private tapRepere(stack: Repere[], sx: number, sy: number, touch: boolean): void {
    const st = this.state;
    st.lastInput = touch ? 'touch' : 'pointer';
    this.freeAim = false;
    const env = this.refreshEnv(true);
    let list = stack;
    if (list.length === 0) list = pickAt(this.reperes, sx, sy, touch ? PICK_PX_TOUCH : PICK_PX, this.toScreen);
    this.map.worldAt(sx, sy, this.w);
    const r = list[0] ?? placeRepere(this.w.x, this.w.z, env);
    if (this.core.scope().level === 'lecture') {
      // lecture seule : une ligne d'information, rien d'autre
      st.visee = r;
      this.say(r.name, 'info', 3);
      return;
    }
    if (st.where?.target && r.kind !== 'unite' && r.kind !== 'cible') {
      this.say('Désignez une unité sur la carte.', 'info', 3);
      return;
    }
    if (st.card && st.card.repere.key === r.key && st.sheet === 'card') return;
    if (st.sheet !== 'card' && st.sheet !== 'none' && st.sheet !== 'qui') st.sheet = st.card ? 'card' : 'none';
    // un lieu choisi hors des candidats de l'intention : l'intention garde son titre, le rang disparaît
    const ci = st.candidates.findIndex((q) => q.key === r.key);
    if (ci >= 0) st.candIndex = ci;
    this.openRepere(r, list.length > 0 ? stackOf(list) : [r]);
  }

  // ───────────────────────────── clavier ─────────────────────────────

  private keyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    // écran recouvert par un autre (inerte), frappe destinée à un champ de texte ou à autre chose que la carte : rien
    if (this.root.closest('[inert]')) return;
    const t = e.target as HTMLElement | null;
    if (t && t !== document.body && t !== document.documentElement && !this.root.contains(t)) return;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const cmd = mapKey(e.code, e.shiftKey, { level: this.core.scope().level, card: this.state.card !== null });
    // Échap / ⌫ (back), Tab (raccourci global), = / − (zoom de la carte) : traités ailleurs
    if (cmd.kind === 'none' || cmd.kind === 'back' || cmd.kind === 'close' || cmd.kind === 'zoom') return;
    // Maj + flèches : le curseur libre de la carte s'en charge ; la fiche suivra
    if (cmd.kind === 'freeArrow') {
      this.freeAim = true;
      this.state.lastInput = 'keys';
      return;
    }
    if (e.repeat && cmd.kind !== 'arrow') {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.state.lastInput = 'keys';
    this.run(cmd);
  }

  /** « ui:nav » (gestionnaire de focus) : toujours annulé ; à la manette (croix), c'est une flèche. */
  private nav(e: CustomEvent<{ dir: Direction }>): void {
    e.preventDefault();
    if (this.core.ctx.input.device === 'kbm') return; // le clavier passe par keyDown
    const dir = e.detail?.dir;
    if (dir && this.core.scope().level !== 'lecture') this.run({ kind: 'arrow', dir });
  }

  /** Exécute une commande (clavier, boutons, manette). */
  run(cmd: KeyCommand): void {
    const st = this.state;
    const level = this.core.scope().level;
    const readOnly = level === 'lecture';
    if (cmd.kind !== 'help' && cmd.kind !== 'none') this.modelBox.classList.remove('is-on');
    switch (cmd.kind) {
      case 'intent':
        if (!readOnly) this.startIntent(cmd.id);
        return;
      case 'arrow':
        this.arrow(cmd.dir);
        return;
      case 'accept':
        this.accept(false);
        return;
      case 'whoList':
        if (st.card && this.card && this.currentLine()?.needsWho && !st.where) {
          st.sheet = 'qui';
          st.whoListIndex = 0;
          st.whoTicks.clear();
          this.lastCard = -1;
        }
        return;
      case 'digit':
        this.digit(cmd.n);
        return;
      case 'unit':
        this.unitKey(cmd.step);
        return;
      case 'whole':
        if (st.card && !st.where) {
          st.whole = !st.whole;
          st.whoAuto = true;
          st.clearSelection();
          this.lastCard = -1;
        }
        return;
      case 'todo':
        // Espace dans la liste Qui : cocher plusieurs unités
        if (st.sheet === 'qui') this.tickWho();
        else this.todo(cmd.step);
        return;
      case 'legal':
        if (!readOnly) this.toggleSheet('legal');
        return;
      case 'stations':
        this.stations();
        return;
      case 'more':
        if (!readOnly) this.toggleSheet('more');
        return;
      case 'search':
        if (!readOnly) this.openSearch();
        return;
      case 'me':
        this.me();
        return;
      case 'journal':
        this.openMore('journal');
        return;
      case 'slow':
        this.toggleSlow();
        return;
      case 'help':
        this.toggleHelp();
        return;
      case 'undo':
        this.undo();
        return;
      case 'filter':
        this.filterKettle();
        return;
      default:
        return;
    }
  }

  private startIntent(id: IntentId): void {
    const st = this.state;
    const env = this.refreshEnv(true);
    const from = st.visee ?? (() => {
      const v = this.map.view;
      return this.map.worldAt(v.width * 0.5, v.height * 0.5, this.w);
    })();
    const cands = intentCandidates(id, env, { x: from.x, z: from.z });
    st.where = null;
    st.intent = id;
    st.candidates = cands;
    st.candIndex = 0;
    if (st.sheet !== 'card') st.sheet = 'card';
    if (cands.length === 0) {
      const def = intentById(id);
      st.intent = null;
      st.sheet = st.card ? 'card' : 'none';
      this.say(id === 'bloquer' ? 'Aucune rue à bloquer près d’ici : désignez une rue sur la carte (Maj + flèches, ou un clic).'
        : `${def.label} : rien à désigner pour l’instant.`, 'info', 4);
      return;
    }
    // la visée garde son repère s'il fait partie des candidats (même endroit, autre intention)
    const keep = st.visee ? cands.findIndex((r) => r.key === st.visee!.key) : -1;
    if (keep > 0 && st.card) st.candIndex = keep;
    const r = cands[st.candIndex]!;
    this.openRepere(r, [r]);
  }

  private arrow(dir: Direction): void {
    const st = this.state;
    this.freeAim = false;
    if (st.sheet === 'help') return;
    if ((this.tmap as TacticalMap & TacticalMapHooks).tracing) {
      // tracé de ligne : les flèches font sauter le curseur d'un repère à l'autre (Entrée y pose le bout)
      const v = st.visee;
      this.jump(dir);
      if (st.card && v) st.visee = v;
      return;
    }
    if (st.sheet === 'qui') {
      const n = this.whoList.length;
      if (n > 0 && (dir === 'up' || dir === 'down')) {
        st.whoListIndex = (st.whoListIndex + (dir === 'down' ? 1 : -1) + n) % n;
        this.lastCard = -1;
      }
      return;
    }
    if (st.sheet === 'more' || st.sheet === 'legal' || st.sheet === 'suivi') {
      if (dir === 'up' || dir === 'down') this.listMove(dir === 'down' ? 1 : -1);
      // « Suivi » : → déplie, ← replie la rangée surlignée
      else if (st.sheet === 'suivi') this.followPanel?.fold?.(dir === 'right');
      return;
    }
    if (st.sheet === 'confirm') return;
    if (st.card && this.card) {
      if (dir === 'up' || dir === 'down') {
        const s = st.card;
        const n = (s.othersOpen ? this.card.others : this.card.lines).length;
        if (n === 0) return;
        s.line = (s.line + (dir === 'down' ? 1 : -1) + n) % n;
        s.chosen = true;
        this.lastCard = -1;
        return;
      }
      this.cycleCandidate(dir === 'right' ? 1 : -1);
      return;
    }
    this.jump(dir);
  }

  private digit(n: number): void {
    const st = this.state;
    if (st.sheet === 'qui') {
      if (n >= 1 && n <= this.whoList.length) this.pickWho([n - 1]);
      return;
    }
    if (st.sheet === 'more' || st.sheet === 'legal' || st.sheet === 'suivi') {
      if (n >= 1) this.listClick(n - 1);
      return;
    }
    if (!st.card || !this.card || st.sheet === 'confirm') return;
    if (n === 0) {
      this.toggleOthers();
      return;
    }
    this.highlight(n - 1);
  }

  private unitKey(step: 1 | -1): void {
    const st = this.state;
    if (st.card && !st.where && st.sheet !== 'qui') {
      // fiche ouverte : Qui suivant / précédent parmi les candidats du jeu
      st.clearSelection();
      st.whole = false;
      st.whoAuto = true;
      st.whoIndex += step;
      this.lastCard = -1;
      return;
    }
    if (st.card) return;
    // au repos : mes unités, l'ordre le plus récent d'abord ; la fiche de l'unité s'ouvre
    const env = this.refreshEnv(true);
    const scene = this.core.maps.scene;
    // (sans les unités d'un commissariat encore au poste, en alerte ou au repos)
    const mine = commandableUnits(scene.units, (id) => this.core.canOrder(id));
    const ordered = unitsByRecentOrder(mine, (u) => u.order ? u.order.issuedAt : -Infinity);
    if (ordered.length === 0) {
      this.say('Aucune unité sous vos ordres.', 'info', 3);
      return;
    }
    const cur = st.visee && st.visee.kind === 'unite' ? ordered.findIndex((u) => u.squadId === st.visee!.squadId) : -1;
    const next = ordered[cur < 0 ? (step > 0 ? 0 : ordered.length - 1) : (cur + step + ordered.length) % ordered.length]!;
    const cu = env.units.find((u) => u.squadId === next.squadId);
    if (!cu) return;
    const r = unitRepere(cu);
    this.map.flyTo(r.x, r.z);
    this.openRepere(r);
  }

  private todo(step: 1 | -1): void {
    if (this.core.scope().level === 'lecture') return;
    this.refreshEnv(true);
    const list = this.todoList();
    if (list.length === 0) {
      this.say('Rien à traiter pour l’instant.', 'info', 3);
      return;
    }
    this.todoIndex = (((this.todoIndex + step) % list.length) + list.length) % list.length;
    const st = this.state;
    st.intent = null;
    st.where = null;
    st.candidates = list;
    st.candIndex = this.todoIndex;
    st.sheet = 'card';
    const r = list[this.todoIndex]!;
    this.openRepere(r);
  }

  /** C : la visée sur le commissariat le plus proche qui a des unités prêtes (C encore : le suivant). */
  private stations(): void {
    const env = this.refreshEnv(true);
    const st = this.state;
    const list = env.stations.filter((s) => env.level === 'lecture' || s.entries.some((e) => e.state === 'pret'));
    const all = list.length > 0 ? list : env.stations;
    if (all.length === 0) {
      this.say('Aucun commissariat sur cette carte.', 'info', 3);
      return;
    }
    const from = st.visee ?? { x: this.map.view.cx, z: this.map.view.cz };
    const id = cycleStation(this.stationCycle, all, from, st.visee?.kind === 'commissariat');
    const s = all.find((q) => q.id === id)!;
    const r = this.reperes.find((q) => q.kind === 'commissariat' && q.stationId === s.id)
      ?? { kind: 'commissariat' as const, key: `commissariat:${s.id}`, x: s.x, z: s.z, stationId: s.id, name: s.name };
    st.intent = null;
    st.where = null;
    st.candidates = [];
    st.sheet = 'card';
    this.map.flyTo(r.x, r.z);
    this.openRepere(r);
  }

  /** G : la visée sur « VOUS » et sa fiche. */
  private me(): void {
    this.refreshEnv(true);
    const r = this.reperes.find((q) => q.kind === 'vous');
    const scene = this.core.maps.scene;
    if (!r) {
      if (scene.hasPlayer) this.map.flyTo(scene.px, scene.pz);
      return;
    }
    this.map.flyTo(r.x, r.z);
    const st = this.state;
    st.intent = null;
    st.where = null;
    st.candidates = [];
    st.sheet = 'card';
    this.openRepere(r);
  }

  /** F : la fiche de la nasse fermée la plus proche, « Ouvrir une sortie filtrée » surlignée. */
  private filterKettle(): void {
    const env = this.refreshEnv(true);
    const st = this.state;
    const from = st.visee ?? { x: this.map.view.cx, z: this.map.view.cz };
    const kettles = env.crowds.filter((c) => c.closed).sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
    const k = kettles[0];
    if (!k) {
      this.say('Aucune nasse fermée pour l’instant.', 'info', 3);
      return;
    }
    const r = this.reperes.find((q) => q.crowdKey === k.key && (q.kind === 'nasse' || q.kind === 'foule'));
    if (!r) return;
    st.intent = 'encercler';
    st.where = null;
    st.candidates = [];
    st.sheet = 'card';
    this.openRepere(r);
    const card = buildCard(r, env, 'encercler');
    const i = card.lines.findIndex((l) => l.action.kind === 'filteredExit');
    if (i >= 0 && st.card) {
      st.card.line = i;
      st.card.chosen = true;
    }
  }

  // ───────────────────────────── listes des feuilles ─────────────────────────────

  private sheetRoot(): HTMLElement | null {
    const st = this.state;
    if (st.sheet === 'more') return this.morePanel?.root ?? null;
    if (st.sheet === 'legal') return this.legalPanel?.root ?? null;
    if (st.sheet === 'suivi') return this.followPanel?.root ?? null;
    return null;
  }

  /**
   * Rangées d'une feuille (boutons visibles, dans l'ordre), sans les boutons de son bandeau (« ‹ Plus… », ✕ : Échap
   * les remplace) : ↓ va tout de suite à la première rangée de la liste.
   */
  private sheetRows(): HTMLButtonElement[] {
    const root = this.sheetRoot();
    if (!root) return [];
    const out: HTMLButtonElement[] = [];
    root.querySelectorAll('button').forEach((b) => {
      if (!b.disabled && b.offsetParent !== null && !b.closest('.cp-top')) out.push(b);
    });
    return out;
  }

  private listMove(step: 1 | -1): void {
    const rows = this.sheetRows();
    if (rows.length === 0) return;
    const st = this.state;
    st.listIndex = (st.listIndex + step + rows.length) % rows.length;
    rows.forEach((b, i) => b.classList.toggle('is-hl', i === st.listIndex));
    rows[st.listIndex]!.scrollIntoView?.({ block: 'nearest' });
  }

  private listClick(i: number): void {
    const root = this.sheetRoot();
    if (!root) return;
    // rangées numérotées (data-n) d'abord, sinon la i-ième rangée visible
    const numbered = root.querySelector<HTMLButtonElement>(`button[data-n="${i + 1}"]`);
    const b = numbered ?? this.sheetRows()[i];
    if (b && !b.disabled) b.click();
  }

  // ───────────────────────────── feuilles ─────────────────────────────

  /** Ouvre une feuille (« Plus… », « Cadre légal », « Suivi », aide). */
  openSheet(sheet: Sheet): void {
    const st = this.state;
    if (sheet === 'help') {
      this.toggleHelp(true);
      return;
    }
    st.sheet = sheet;
    st.listIndex = -1;
    this.lastSide = -1;
    this.lastCard = -1;
    if (sheet === 'more') this.morePanel?.refresh(true);
    if (sheet === 'legal') this.legalPanel?.refresh(true);
    if (sheet === 'suivi') this.followPanel?.refresh(true);
    st.touch();
  }

  /** Referme la feuille ouverte (la fiche revient si elle était ouverte). */
  closeSheet(): void {
    const st = this.state;
    st.sheet = st.card ? 'card' : 'none';
    this.lastCard = -1;
    st.touch();
  }

  private toggleSheet(sheet: Sheet): void {
    if (this.state.sheet === sheet) this.closeSheet();
    else this.openSheet(sheet);
  }

  /** « Plus… » ouvert sur une section (« journal », « incidents », « circulation », « commissariats »…). */
  openMore(section: TacticalTab | string): void {
    // (« commissariats:<poste> » : la liste dépliée sur ce poste)
    const id = String(section).split(':')[0]!;
    if (this.core.scope().level === 'lecture' && id !== 'commissariats') return;
    this.state.tab = (id === 'ordres' || id === 'incidents' || id === 'circulation' || id === 'journal' || id === 'commissariats')
      ? id : this.state.tab;
    this.openSheet('more');
    this.morePanel?.open?.(section);
  }

  private toggleHelp(on?: boolean): void {
    const st = this.state;
    const show = on ?? st.sheet !== 'help';
    if (show) {
      this.helpReturn = st.sheet === 'help' ? this.helpReturn : st.sheet;
      st.sheet = 'help';
    } else st.sheet = this.helpReturn === 'help' ? (st.card ? 'card' : 'none') : this.helpReturn;
    this.lastCard = -1;
    st.touch();
  }

  /** Feuille ouverte avant l'aide (l'aide refermée y revient). */
  private helpReturn: Sheet = 'none';

  // ───────────────────────────── rechercher un lieu ─────────────────────────────

  private openSearch(): void {
    this.searchBox.classList.add('is-open');
    this.searchInput.value = '';
    this.searchResults.textContent = '';
    this.searchInput.focus({ preventScroll: true });
  }

  private closeSearch(): void {
    this.searchBox.classList.remove('is-open');
    this.searchInput.value = '';
    this.searchResults.textContent = '';
    this.map.canvas.focus({ preventScroll: true });
  }

  private searchRefresh(): void {
    const q = this.searchInput.value;
    const world = this.core.ctx.world;
    const hits = searchPlaces(world.places, q, 6, { x: this.map.view.cx, z: this.map.view.cz });
    this.searchResults.textContent = '';
    for (let i = 0; i < hits.length; i++) {
      const p = hits[i]!.place;
      const b = button(p.name, () => {
        const env = this.refreshEnv(true);
        this.closeSearch();
        const mpp = Math.min(2.4, Math.max(0.6, (p.radius * 2.6) / Math.max(200, Math.min(this.map.view.width, this.map.view.height))));
        this.map.flyTo(p.x, p.z, mpp, 0.45);
        const r = placeRepere(p.x, p.z, env);
        const named = r.kind === 'point' ? { ...r, name: p.name } : r;
        const st = this.state;
        st.lastInput = 'keys';
        if (st.card && st.intent) {
          this.openRepere(named, [named], st.card.verb);
        } else {
          st.sheet = 'card';
          this.openRepere(named);
        }
      }, { className: 'is-small ct-search-hit', id: 'tac-search-' + i });
      b.tabIndex = -1;
      this.searchResults.appendChild(b);
    }
    if (hits.length === 0 && q.trim().length >= 2) this.searchResults.appendChild(el('div', 'ct-empty', 'Aucun lieu trouvé'));
  }

  // ───────────────────────────── envoi ─────────────────────────────

  /** Entrée (ou « Donner l'ordre ») : selon l'état, ouvre la fiche, envoie, valide la liste ou la confirmation. */
  private accept(pointer: boolean): void {
    const st = this.state;
    if (this.core.scope().level === 'lecture') return;
    if (!pointer && !enterAllowed(this.time, st.sentAt)) return;
    if (st.sheet === 'help') {
      this.toggleHelp(false);
      return;
    }
    const hooks = this.tmap as TacticalMap & TacticalMapHooks;
    if (hooks.tracing && hooks.traceAtScreen) {
      // tracé de ligne : Entrée pose un bout au curseur (sinon à la visée)
      const p = this.map.cursorOn ? { sx: this.map.cursorX, sy: this.map.cursorY } : this.viseeScreen();
      hooks.traceAtScreen(p.sx, p.sy);
      return;
    }
    if (st.sheet === 'qui') {
      const ticks = Array.from(st.whoTicks);
      this.pickWho(ticks.length > 0 ? ticks : [Math.max(0, st.whoListIndex)]);
      return;
    }
    if (st.sheet === 'confirm') {
      this.confirm(this.confirmDefault());
      return;
    }
    if (st.sheet === 'more' || st.sheet === 'legal' || st.sheet === 'suivi') {
      if (st.listIndex >= 0) {
        const b = this.sheetRows()[st.listIndex];
        if (b) b.click();
      }
      return;
    }
    if (!st.card) {
      // S0 : la fiche de la visée (sans visée : le point au centre de la vue)
      const env = this.refreshEnv(true);
      let r = st.visee ? this.fresh(st.visee) : null;
      if (!r) {
        const v = this.map.view;
        const x = this.map.cursorOn ? this.map.cursorX : v.width * 0.5;
        const y = this.map.cursorOn ? this.map.cursorY : v.height * 0.5;
        this.map.worldAt(x, y, this.w);
        r = placeRepere(this.w.x, this.w.z, env);
      }
      st.sheet = 'card';
      this.openRepere(r);
      return;
    }
    // « ✓ ORDRE DONNÉ » d'une intention non collante : la fiche va se refermer, Entrée n'envoie pas une seconde fois
    if (this.restAt >= 0) return;
    if (this.lastCard < 0 || !this.card) this.refreshCard();
    const line = this.currentLine();
    if (!line) return;
    this.sendLine(line);
  }

  /** Une ligne de la fiche : actions de l'écran, confirmation légale, ou envoi (sendLine.ts). */
  private sendLine(line: CardLine): void {
    const st = this.state;
    const card = this.card!;
    const a = line.action;
    const where = st.card!.repere;
    switch (a.kind) {
      case 'others':
        this.toggleOthers();
        return;
      case 'centre':
        this.map.flyTo(where.x, where.z);
        return;
      case 'stationList':
        this.openMore('commissariats:' + a.stationId);
        return;
      case 'sendElsewhere': {
        const ids = card.whoFixed ?? (where.squadId ? [where.squadId] : []);
        if (ids.length === 0) return;
        const env = this.refreshEnv(true);
        const who = fixedCandidate(env, ids, where);
        this.startWhere(who, a.type ?? null, false, 'OÙ L’ENVOYER ?');
        return;
      }
      case 'pickTarget': {
        const ids = card.whoFixed ?? (where.squadId ? [where.squadId] : []);
        if (ids.length === 0) return;
        const env = this.refreshEnv(true);
        this.startWhere(fixedCandidate(env, ids, where), a.type, true, TARGET_TITLES[a.type] ?? 'QUI ?');
        return;
      }
      case 'engage': {
        const env = this.refreshEnv(true);
        let name = 'Renfort';
        for (const s of env.stations) for (const e of s.entries) if (e.entryId === a.entryId) name = e.name;
        const who: WhoCandidate = { squadIds: [], label: name, mode: 'vehicules', eta: 0, distance: 0, busy: 'au commissariat', fromStation: a.entryId };
        this.startWhere(who, a.defaultVerb, false, 'OÙ L’ENVOYER ?');
        return;
      }
      case 'assignOther':
        st.sheet = 'qui';
        st.whoListIndex = 0;
        st.whoTicks.clear();
        this.lastCard = -1;
        return;
      default:
        break;
    }
    if (line.lock || line.coercive) {
      this.openConfirm(line);
      return;
    }
    const who = st.who ?? this.resolveWho(card, line, where, this.refreshEnv(false));
    if (a.kind === 'verb' && a.geom === 'trace') {
      this.startTrace(line, who, where);
      return;
    }
    this.dispatch(line, who, where);
  }

  /**
   * « Tracer la ligne moi-même » : la carte attend les deux bouts (deux clics, ou Entrée au curseur : flèches ou
   * Maj + flèches pour le déplacer) ; la ligne part au second bout. Échap ou clic droit : abandon.
   */
  private startTrace(line: CardLine, who: WhoCandidate | null, where: Repere): void {
    const hooks = this.tmap as TacticalMap & TacticalMapHooks;
    if (!hooks.beginTrace) {
      this.say('Le tracé à la main n’est pas disponible : choisissez « Tenir une ligne ici ».', 'warn', 4);
      return;
    }
    if (line.needsWho && !who) {
      this.say('Aucune unité libre pour cet ordre : choisissez-en une (U, ou la liste Qui avec Maj + Entrée).', 'warn', 5);
      return;
    }
    hooks.beginTrace((ax, az, bx, bz) => this.dispatch(line, who, where, { ax, az, bx, bz }));
    this.say(this.compact || this.state.lastInput !== 'keys'
      ? 'Touchez le flanc gauche de la ligne, puis le flanc droit.'
      : 'Flanc gauche puis flanc droit : Entrée au curseur (flèches, ou Maj + flèches), ou deux clics. Échap : abandon.', 'info', 6);
  }

  /** « OÙ L'ENVOYER ? » : Qui fixé, la visée va au premier lieu proposé (← / → les parcourent). */
  private startWhere(who: WhoCandidate, verb: OrderType | null, target: boolean, title: string): void {
    const st = this.state;
    const env = this.refreshEnv(true);
    const from = st.card?.repere ?? st.visee ?? { x: this.map.view.cx, z: this.map.view.cz };
    let cands: Repere[];
    if (target) {
      // une autre unité : les miennes et celles des autres, la plus proche d'abord
      cands = this.reperes.filter((r) => (r.kind === 'unite' || r.kind === 'cible') && !(r.squadId && who.squadIds.includes(r.squadId)))
        .sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
    } else {
      cands = intentCandidates('envoyer', env, { x: from.x, z: from.z }).filter((r) => !(r.squadId && who.squadIds.includes(r.squadId)));
    }
    st.intent = null;
    st.where = { who, verb, target, title };
    st.candidates = cands;
    st.candIndex = 0;
    st.sheet = 'card';
    const r = cands[0];
    if (!r) {
      st.card = null;
      this.say(target ? 'Aucune autre unité à désigner.' : 'Désignez le lieu sur la carte.', 'info', 3);
      st.touch();
      return;
    }
    this.openRepere(r, [r], verb);
  }

  /** Envoi d'une ligne permise (sendLine.ts) ; S4 et l'intention collante. */
  private dispatch(line: CardLine, who: WhoCandidate | null, where: Repere, trace: SendEnv['trace'] = null): void {
    const st = this.state;
    if (!PARTS.sendCardLine) {
      this.say('Envoi des ordres indisponible : la fiche n’est pas branchée.', 'warn', 4);
      return;
    }
    if (line.needsWho && !who && line.action.kind !== 'closeRoad') {
      const reinforce = noUnitText(this.whoList);
      this.say(reinforce.includes('renfort')
        ? `${reinforce.replace(/ : U$/, '')} : appuyez sur U pour le choisir.`
        : 'Aucune unité libre pour cet ordre : choisissez-en une (U, ou la liste Qui avec Maj + Entrée).', 'warn', 5);
      return;
    }
    const env = this.refreshEnv(false);
    const sendEnv: SendEnv = {
      core: this.core, map: this.tmap, card: env, trace,
      setSelection: (ids) => st.setSelection(ids),
      centre: (x, z) => this.map.flyTo(x, z),
    };
    let res: { ok: boolean; text: string; squads: number[] };
    // Les gestes de la carte (TacticalMap, FieldActions) annoncent eux-mêmes leur résultat par un message. Depuis la
    // fiche, « ✓ ORDRE DONNÉ » les remplace (§2.6 : pas de message de réussite) et un refus n'est dit qu'une fois :
    // pendant l'envoi (synchrone), les messages de réussite sont retenus et le dernier refus devient le motif.
    const ui = this.core.ctx.ui;
    const own = Object.prototype.hasOwnProperty.call(ui, 'notify');
    const notify = ui.notify;
    let refusal = '';
    ui.notify = (text, kind, seconds) => {
      if (kind === 'ok') return;
      if (kind === 'warn') {
        refusal = text;
        return;
      }
      notify.call(ui, text, kind, seconds);
    };
    try {
      res = PARTS.sendCardLine(sendEnv, line, who, where);
    } catch (err) {
      console.error('[carte de commandement] envoi d’une ligne', err);
      res = { ok: false, text: 'L’ordre n’a pas pu partir.', squads: [] };
    } finally {
      if (own) ui.notify = notify;
      else delete (ui as { notify?: unknown }).notify;
    }
    // la sélection posée pour l'envoi ne reste pas comme Qui de la fiche suivante
    st.selection.clear();
    if (!res.ok) {
      const generic = res.text === '' || res.text === 'L’ordre n’a pas pu partir.';
      this.say(generic && refusal !== '' ? refusal : res.text || refusal || 'L’ordre n’a pas pu partir.', 'warn', 5);
      return;
    }
    if (res.text === '') {
      // action sans ordre (« Centrer la carte ») : ni « ✓ ORDRE DONNÉ » ni garde d'Entrée
      this.lastCard = -1;
      return;
    }
    const detail = res.squads.length > 0 ? sentDetail(who) : '';
    this.sent(detail !== '' ? `${res.text}\n${detail} · suivez-la dans « Mes unités »` : res.text, res.squads);
  }

  /** S4 : « ✓ ORDRE DONNÉ » ; intention collante → lieu suivant ; sinon la fiche se referme après 2 s. */
  private sent(text: string, squads: number[]): void {
    const st = this.state;
    st.sentAt = this.time;
    st.lastSent = { squads: squads.slice(), text, at: this.time, undo: squads.length > 0 };
    this.core.ctx.audio.play('ui_valide');
    // proposition acceptée, nasse validée : la liste « À traiter » change
    this.todoIndex = -1;
    const next = st.where ? -1 : stickyNext(st.intent, st.candIndex, st.candidates.length);
    if (next >= 0) {
      st.candIndex = next;
      const r = st.candidates[next]!;
      this.openRepere(r, [r]);
      return;
    }
    this.restAt = this.time + SENT_SECONDS;
    this.lastCard = -1;
  }

  /** X : « Annuler l'ordre » (5 s) — l'ordre « cesser » aux mêmes unités (rien n'est défait dans la simulation). */
  private undo(): void {
    const st = this.state;
    const s = st.lastSent;
    if (!s || !s.undo || this.time - s.at > UNDO_SECONDS) return;
    const squads = s.squads.map((id) => this.core.ctx.squads.get(id)).filter((q): q is NonNullable<typeof q> => q !== undefined);
    st.lastSent = null;
    if (squads.length === 0) return;
    const r = this.core.issue('cesser' as OrderType, squads, null);
    this.say(r.ok ? `Ordre annulé : ${squads.map((q) => q.name).join(', ')} s’arrête${squads.length > 1 ? 'nt' : ''}.` : r.reason, r.ok ? 'info' : 'warn', 4);
    this.lastCard = -1;
  }

  // ───────────────────────────── Qui ─────────────────────────────

  /** Liste Qui validée (indices des rangées) : une rangée = ce candidat ; plusieurs = leurs unités ensemble. */
  private pickWho(indices: number[]): void {
    const st = this.state;
    const env = this.refreshEnv(false);
    const picked = indices.map((i) => this.whoList[i]).filter((c): c is WhoCandidate => c !== undefined);
    if (picked.length === 0) return;
    const where = st.card?.repere ?? st.visee;
    let who: WhoCandidate;
    if (picked.length === 1) who = picked[0]!;
    else {
      const ids = Array.from(new Set(picked.flatMap((c) => c.squadIds)));
      who = fixedCandidate(env, ids, where ?? { x: 0, z: 0 }, picked.map((c) => c.label).join(', '));
    }
    st.selection.clear();
    st.who = who;
    st.whoAuto = false;
    st.whole = false;
    st.whoTicks.clear();
    st.sheet = st.card ? 'card' : 'none';
    this.lastCard = -1;
    // « Confier à une autre unité… » : l'incident part à l'unité choisie
    const line = this.currentLine();
    if (line && line.action.kind === 'assignOther' && where) this.dispatch(line, who, where);
  }

  /** Espace dans la liste Qui : coche / décoche la rangée surlignée. */
  private tickWho(): void {
    const st = this.state;
    const i = st.whoListIndex;
    if (st.whoTicks.has(i)) st.whoTicks.delete(i);
    else st.whoTicks.add(i);
    this.lastCard = -1;
  }

  // ───────────────────────────── confirmation légale (S3) ─────────────────────────────

  private openConfirm(line: CardLine): void {
    const st = this.state;
    const where = st.card!.repere;
    const env = this.refreshEnv(false);
    const who = st.who;
    let plan: LegalPlan | null = null;
    let reason = '';
    let steps: LegalStep[] = [];
    if (PARTS.legalPlan) {
      try {
        const r = PARTS.legalPlan(line, who, where, env, this.core);
        plan = r.plan;
        reason = r.reason;
        steps = r.steps ?? [];
      } catch (err) {
        console.error('[carte de commandement] étapes légales', err);
        reason = 'Les étapes légales ne peuvent pas être préparées.';
      }
    } else if (line.lock) reason = 'Les étapes légales ne sont pas disponibles : faites-les vous-même (L).';
    this.confirmLine = line;
    this.confirmPlan = plan;
    const coercive = line.lock === null && line.coercive;
    // titre court du plan (« Dispersion au gaz — Tête de cortège »), sinon la ligne et le lieu
    const title = plan?.title || `${line.label} — ${where.name.split(' — ')[0]}`;
    const sc = this.core.scope();
    // chef de groupe (ni autorité ni droit d'autoriser) devant une ligne 🔒 : il peut demander plus de force par radio
    const request = plan === null && line.lock !== null && sc.level === 'unite' && !sc.canAuthorize && reason !== '';
    const model: ConfirmModel = { title, steps: plan?.steps ?? steps, coercive, reason, canChain: plan !== null && !!this.chain(), request };
    st.sheet = 'confirm';
    this.cardPanel?.showConfirm(model);
    this.lastCard = -1;
  }

  /** Entrée en S3 : « Donner l'ordre quand même » (⚖), « Demander plus de force », sinon « Faire les étapes ». */
  private confirmDefault(): ConfirmChoice {
    const l = this.confirmLine;
    if (l && l.lock === null && l.coercive) return 'anyway';
    if (l && l.lock && !this.confirmPlan && this.core.scope().level === 'unite' && !this.core.scope().canAuthorize) return 'request';
    return 'chain';
  }

  private confirm(choice: ConfirmChoice): void {
    const st = this.state;
    const line = this.confirmLine;
    const where = st.card?.repere;
    if (!line || !where) return;
    if (!enterAllowed(this.time, st.sentAt)) return;
    if (choice === 'anyway') {
      if (line.lock) return;
      st.sheet = 'card';
      this.confirmLine = null;
      this.dispatch(line, st.who, where);
      return;
    }
    if (choice === 'request') {
      // la demande part par radio au commandant ; l'ordre attend son autorisation
      const level = line.lock?.force ?? 0;
      if (level <= 0) return;
      coreLegalDeps(this.core, () => this.refreshEnv(false)).requestForce(level);
      this.confirmLine = null;
      st.sheet = 'card';
      this.lastCard = -1;
      this.say(`Demande transmise par radio au commandant : ${forceWord(level)}.`, 'info', 4);
      return;
    }
    if (choice === 'sommations') {
      st.sheet = 'card';
      this.confirmLine = null;
      this.dispatch(plainLine('Faire les sommations', 'Les 3 avertissements au mégaphone, l’un après l’autre.', 'megaphone', { kind: 'sommation', all: true }), null, where);
      return;
    }
    const chain = this.chain();
    const plan = this.confirmPlan;
    if (!chain || !plan) return;
    chain.start(plan);
    this.confirmLine = null;
    this.confirmPlan = null;
    st.sheet = 'card';
    // l'ordre lui-même ne part qu'à la fin de la chaîne : l'en-tête ne dit pas « ORDRE DONNÉ »
    this.sent(`✓ ÉTAPES LANCÉES — ${plan.title}\nl’ordre partira après la dernière étape · suivez-les dans « Mes unités »`, []);
  }

  // ───────────────────────────── rafraîchissement ─────────────────────────────

  private refreshStatus(): void {
    const ctx = this.core.ctx;
    const dir = ctx.director;
    const sc = this.core.scope();
    const scene = this.core.maps.scene;
    const partial = sc.level !== 'lecture' && (!scene.vis.police || scene.vis.crowd !== 'full');
    setText(this.scopeEl, sc.level === 'lecture' ? '' : partial ? 'vue partielle : vous êtes à pied' : '');
    const phase = PHASE_LABELS[dir.phase] ?? '';
    const t = Math.max(0, Math.min(1, dir.tension));
    const v = (Math.round(t * 40) / 40).toString();
    if (this.gaugeEl.style.getPropertyValue('--v') !== v) this.gaugeEl.style.setProperty('--v', v);
    this.tensionEl.title = `Tension ${Math.round(t * 100)} %`;
    setText(this.phaseEl, this.compact ? PHASE_SHORT[dir.phase] ?? phase : phase);
    setText(this.crowdEl, scene.crowdCount > 0 ? `Foule ${scene.crowdCount >= 100 ? '~' + Math.round(scene.crowdCount / 10) * 10 : scene.crowdCount}` : '');
    const tod = ctx.env.state.timeOfDay;
    const h = Math.floor(tod);
    const m = Math.floor((tod - h) * 60);
    setText(this.clockEl, `${h} h ${m < 10 ? '0' : ''}${m}`);
    // pastille légale
    const roe = ctx.law.roe;
    const env = this.env;
    const chip = legalChip({
      sommations: roe.sommation, lawful: (env?.lawful ?? roe.authorizedForce) as ForceLevel, authorised: roe.authorizedForce as ForceLevel,
      canAuthorize: sc.canAuthorize, level: sc.level, compact: this.compact, chain: this.chain()?.status() ?? null,
    });
    setText(this.legalText, chip.text);
    this.legalBtn.dataset.tone = chip.tone;
    this.rose.update(ctx);
    // lecture seule : l'ordre reçu
    if (sc.level === 'lecture') {
      const b = this.brief();
      const c = b?.command ?? null;
      const call = c ? null : this.patrolCall();
      const target = c ?? call;
      let arrow = '';
      if (target && scene.hasPlayer) {
        const v = this.map.view;
        const a = v.worldToScreen(scene.px, scene.pz, { x: 0, y: 0 });
        const d = v.worldToScreen(target.x, target.z, { x: 0, y: 0 });
        arrow = arrowChar(d.x - a.x, d.y - a.y);
      }
      if (call && scene.hasPlayer) call.distance = Math.hypot(call.x - scene.px, call.z - scene.pz);
      const lines = readOnlyBanner(b, ctx.clock.now, this.compact, arrow, call);
      setText(this.orderLine1, lines.line1);
      setText(this.orderLine2, lines.line2);
    }
  }

  private refreshSides(): void {
    const st = this.state;
    const readOnly = this.core.scope().level === 'lecture';
    const sheet = st.sheet;
    const cardOn = st.card !== null && (sheet === 'card' || sheet === 'qui' || sheet === 'confirm');
    const sideSheet = sheet === 'more' || sheet === 'legal';
    // bureau : la colonne montre la fiche, sinon « Plus… » / « Cadre légal », sinon « À traiter » + « Mes unités »
    // téléphone : une feuille à la fois (Suivi, fiche, Plus…, Cadre légal), aucune au repos
    const followOn = this.compact ? sheet === 'suivi' : !cardOn && !sideSheet && !readOnly;
    setClass(this.mounts.card, 'is-on', cardOn);
    setClass(this.mounts.sheet, 'is-on', sideSheet);
    setClass(this.mounts.follow, 'is-on', followOn);
    if (this.morePanel) setClass(this.morePanel.root, 'is-on', sheet === 'more');
    if (this.legalPanel) setClass(this.legalPanel.root, 'is-on', sheet === 'legal');
    const sheetOpen = cardOn || sideSheet || (this.compact && sheet === 'suivi');
    if (sheetOpen !== this.sheetOpen) {
      this.sheetOpen = sheetOpen;
      // la carte change de largeur à l'image suivante : la visée est remontrée ensuite
      if (this.compact) this.recenter = this.time + 0.05;
    }
    setClass(this.root, 'has-sheet', sheetOpen);
    setClass(this.root, 'has-card', cardOn);
    setClass(this.root, 'has-help', sheet === 'help');
    setClass(this.helpBox, 'is-on', sheet === 'help');
    // barre des intentions : cachée pendant une fiche (le titre de la fiche dit l'intention) et sous une feuille au téléphone
    for (const [id, b] of this.intentBtns) setClass(b, 'is-on', st.intent === id);
    setClass(this.moreBtn, 'is-on', sheet === 'more');
    setClass(this.legalBtn, 'is-on', sheet === 'legal');
    setClass(this.suiviBtn, 'is-on', sheet === 'suivi');
    const todo = this.followPanel?.todoCount ?? (this.env ? this.todoList().length : 0);
    setText(this.suiviBadge, todo > 0 ? String(todo) : '');
    if (followOn) this.followPanel?.refresh(false);
    if (sheet === 'more') this.morePanel?.refresh(false);
    if (sheet === 'legal') this.legalPanel?.refresh(false);
  }

  private refresh(force: boolean): void {
    const st = this.state;
    // (une sommation faite, une force autorisée — depuis « Cadre légal » ou la chaîne légale — met la pastille légale à
    // jour à l'image suivante, sans attendre la demi-seconde du bandeau)
    const roe = this.core.ctx.law.roe;
    const legalKey = `${roe.sommation}|${roe.authorizedForce}|${roe.lawfulForce}`;
    const dirty = legalKey !== this.legalKey;
    this.legalKey = legalKey;
    if (force || st.dirty || this.time - this.lastSide > 0.25) {
      this.lastSide = this.time;
      st.dirty = false;
      this.refreshSides();
      this.refreshDrone();
      this.placeNotices();
      const o = this.map.overlay;
      o.hoverKey = st.dropKey !== 0 ? st.dropKey : st.hoverKey;
      o.focusIncident = st.card?.repere.kind === 'incident' ? st.card.repere.incidentId ?? 0 : 0;
      // fiche d'un commissariat : son nom et la rue de ses places sont écrits sur la carte
      o.focusCommissariat = st.card?.repere.kind === 'commissariat' ? st.card.repere.stationId ?? '' : '';
      this.map.invalidate();
    }
    if (force || this.lastCard < 0 || this.time - this.lastCard > 0.1) {
      this.lastCard = this.time;
      this.refreshCard();
    }
    if (force || dirty || this.time - this.lastStatus > 0.5) {
      this.lastStatus = this.time;
      this.refreshStatus();
    }
  }

  // ───────────────────────────── cycle de vie ─────────────────────────────

  update(dt: number, input: InputState): void {
    this.time += dt;
    const st = this.state;
    const active = document.activeElement;
    // un champ de texte (« Rechercher un lieu », « Chercher un ordre » de « Plus… ») garde le focus tant qu'on y tape
    const typing = active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    const onMap = active === this.map.canvas || active === document.body || active === null;
    // clavier seul : la carte garde le focus (élément retiré, ouverture avant que la carte soit prête)
    if (!typing && !this.root.closest('[inert]') && active !== this.map.canvas && (onMap || (active instanceof HTMLElement && this.root.contains(active)))) {
      this.map.canvas.focus({ preventScroll: true });
    }
    if (!typing) {
      this.map.updatePad(dt, input);
      if (input.device === 'gamepad') {
        // manette : A = Entrée, X = U, Y = « Plus… » (B = retour, LB / RB = « À traiter », croix = flèches)
        if (input.pressed('ui_accept')) this.run({ kind: 'accept' });
        if (input.pressed('interact')) this.run({ kind: 'unit', step: 1 });
        if (input.pressed('reload')) this.run({ kind: 'more' });
        if (input.moveX !== 0 || input.moveY !== 0) this.freeAim = true;
      }
    }
    this.followCursor();
    // « ✓ ORDRE DONNÉ » d'une intention non collante : retour au repos après 2 s
    if (this.restAt >= 0 && this.time >= this.restAt) {
      this.restAt = -1;
      st.rest();
      this.lastCard = -1;
    }
    // un incident résolu, une unité dissoute : la fiche de ce repère se referme
    if (st.card && this.env && !this.reperes.some((r) => r.key === st.card!.repere.key) && (st.card.repere.kind === 'incident' || st.card.repere.kind === 'proposition')) {
      st.closeCard();
      this.lastCard = -1;
    }
    this.map.frame(dt);
    if (this.recenter >= 0 && this.time >= this.recenter) {
      this.recenter = -1;
      if (st.visee) this.ensureVisible(st.visee);
      this.placeCursor();
    }
    this.scale.update(this.map.view.mpp);
    // fiche rendue avant que sa feuille soit visible : on mesure ici le débordement, une fois qu'elle l'est
    if (st.card && st.sheet === 'card' && this.cardPanel && this.tightCard !== this.cardIdent && overflows(this.cardPanel.root)) {
      this.tightCard = this.cardIdent;
      this.lastCard = -1;
    }
    this.refresh(false);
  }

  back(): boolean {
    const st = this.state;
    if (this.searchBox.classList.contains('is-open')) {
      this.closeSearch();
      return true;
    }
    if (this.modelBox.classList.contains('is-on')) {
      this.modelBox.classList.remove('is-on');
      return true;
    }
    if (this.tmap.drag) {
      this.map.gestures.cancelAll();
      return true;
    }
    const hooks = this.tmap as TacticalMap & TacticalMapHooks;
    if (hooks.tracing) {
      hooks.cancelTrace?.();
      this.say('Tracé abandonné.', 'info', 2);
      return true;
    }
    // « Plus… » ouvert sur une section : Échap revient d'abord au menu
    if (st.sheet === 'more' && this.morePanel?.back?.()) {
      st.listIndex = -1;
      return true;
    }
    if (st.mode.kind !== 'idle' || st.tool === 'box') {
      st.tool = 'main';
      st.setMode({ kind: 'idle' });
      return true;
    }
    if (st.sheet === 'help') {
      this.toggleHelp(false);
      return true;
    }
    const next = backStep({ sheet: st.sheet, card: st.card !== null, othersOpen: st.card?.othersOpen ?? false, intent: st.intent, where: st.where !== null });
    if (!next) return false;
    if (st.sheet === 'confirm' && next.sheet !== 'confirm') {
      this.confirmLine = null;
      this.confirmPlan = null;
    }
    if (st.card && !next.card) {
      // fiche refermée : l'intention et le choix d'un lieu (rien n'est engagé) avec elle
      this.restAt = -1;
      st.rest();
    } else {
      if (st.card) st.card.othersOpen = next.othersOpen;
      st.sheet = next.sheet;
      if (!next.where) st.where = null;
      if (!next.intent) {
        st.intent = null;
        st.candidates = [];
      }
    }
    this.lastCard = -1;
    st.touch();
    return true;
  }

  dispose(): void {
    const v = this.map.view;
    MEMORY.set(this.core, {
      cx: v.cx, cz: v.cz, mpp: v.mpp, tab: this.state.tab, selection: [], session: this.core.ctx.session.config, passersby: false,
    });
    if (this.slow) this.core.ctx.clock.timeScale = this.savedScale;
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.root.removeEventListener('ui:nav', this.onNav);
    this.root.parentElement?.removeEventListener('ui:tab', this.onTab);
    const docEl = document.documentElement;
    docEl.classList.remove('ct-open');
    for (const name of ['--ct-sub-left', '--ct-sub-top', '--ct-sub-max', '--ct-toast-left', '--ct-toast-bottom', '--ct-toast-max']) docEl.style.removeProperty(name);
    const hooks = this.tmap as TacticalMap & TacticalMapHooks;
    hooks.onRepereTap = null;
    hooks.onRepereHover = null;
    hooks.repereSource = null;
    hooks.cancelTrace?.();
    for (const p of [this.cardPanel, this.followPanel, this.morePanel, this.legalPanel]) {
      try { p?.dispose?.(); } catch (err) { console.error('[carte de commandement] panneau : fermeture', err); }
    }
    this.focus.dispose();
    this.map.dispose();
    this.root.remove();
  }
}

/** La fiche (ou une de ses listes) défile-t-elle ? Mesure après rendu ; faux tant qu'elle n'est pas affichée. */
function overflows(root: HTMLElement): boolean {
  if (root.clientHeight <= 0) return false;
  for (const e of [root, ...Array.from(root.querySelectorAll<HTMLElement>('.cc-list, .cc-box'))]) {
    if (e.clientHeight > 0 && e.scrollHeight - e.clientHeight > 1) return true;
  }
  return false;
}
