/* =====================================================================================
 * Écran « roue_ordres » : roue d'ordres rapide en vue de jeu (F). Les ordres visent ce que le joueur désigne (le même
 * point, la même personne que l'ordre prêt : direct/designate.ts, relevés à l'ouverture) et vont à la MÊME unité que
 * l'ordre prêt (« À qui » : U change d'unité, roue ouverte comprise) — jamais d'office à toute la compagnie.
 *
 * Sept secteurs, mêmes mots que la carte, et chaque ancien numéro garde son sens (un vieux réflexe « F puis N » ne tombe
 * jamais sur un ordre de force qu'il ne donnait pas, direct/words.ts) : 1 Avec moi (2 en est un alias, non dessiné :
 * l'ancien « Suivez-moi en véhicules »), 3 Envoyer, 4 Bloquer une rue, 5 Interpeller, 6 Disperser, 7 Secours ici,
 * 8 Plus… ; « Plus… » : 1 à 8 d'avant (repli, bond, charge, gaz, tenir, arrêter, laisser agir, tortue) et 9 « Pousser
 * un véhicule » (le Centaure). Le policier sans autorité de commandement n'a que 1 (2) et 7.
 *
 * Un secteur que la loi verrouille est grisé avec sa raison en quelques mots ; le choisir dit la raison en une phrase
 * (§4.3). Disperser avant les sommations, Charger / Gaz / Bond sans l'accord : le second appui dans les 3 s fait faire
 * les sommations (et donne l'accord du commandant) — la chaîne légale, comme sur la carte. Un ordre parti : la roue se
 * referme, sans message (le ticket de l'ordre, la radio et la ligne d'état le disent) ; ⌫ l'annule pendant 5 s.
 *
 * Touche « Ordres » maintenue : la roue reste ouverte, on choisit une direction (souris, stick), on relâche pour
 * valider. Appui bref ou doigt : la roue reste affichée, on touche un secteur. Au clavier seul (Mac portable sans
 * souris) : le chiffre imprimé sur un secteur le choisit, les flèches déplacent le surlignage et Entrée valide ; Échap
 * ou ⌫ ramènent de la couronne intérieure à la roue, puis referment la roue (wheelKeys.ts). Le menu radial lui-même est
 * celui de wheel.ts (inchangé). Téléphone : l'appui long sur la pastille « Ordre prêt » ouvre la roue avec le secteur
 * de la ligne « autre » (Disperser la foule, Envoyer sans barrer) surligné ; le doigt resté posé choisit en glissant,
 * le relâcher donne le secteur surligné (un seul geste) ; relâché sans secteur, la roue reste pour un toucher.
 * ===================================================================================== */

import type { InputState } from '@/core/contracts';
import type { RescueKind, ScreenInstance } from '@/core/extensions';
import { el } from '../maps/icons';
import { coarsePointer } from '../maps/style';
import type { CommandCore } from './core';
import { designationAt } from './direct/env';
import type { NaturalOrder } from './direct/natural';
import { DIRECT_SERVICE } from './direct/runtime';
import type { DirectRuntime, GiveResult } from './direct/runtime';
import { sectorItemText, sectorLocked, sectorOrder } from './direct/sector';
import type { SectorSituation } from './direct/sector';
import type { Designation } from './direct/types';
import { unitOfKey, whoCycle, whoLabel } from './direct/who';
import { DIGIT_ALIASES, DIRECT_FOLLOW_WHEEL, DIRECT_MORE_RING, DIRECT_RESCUE_RING, DIRECT_WHEEL, distText } from './direct/words';
import type { DirectSector, DirectSectorAction } from './direct/words';
import { requestRescueAtPlayer } from './quickActions';
import { ensureCommandStyle } from './style';
import { RadialMenu } from './wheel';
import type { WheelItem } from './wheel';
import { WHEEL_KEYS_LEGEND, isWheelKeyCode, wheelSectorIndex } from './wheelKeys';

export const WHEEL_SCREEN = 'roue_ordres';

/** Action d'un secteur : un verbe des ordres directs, une couronne (« plus », « secours »), un appel (pompiers, SAMU). */
export type WheelAction = DirectSectorAction;
export type WheelSector = DirectSector;

/** Couronne « Secours ici » : la même demande que le bouton du HUD, au point où se trouve le joueur. */
export const RESCUE_RING: readonly WheelSector[] = DIRECT_RESCUE_RING;
/** Couronne « Plus… » : 1 à 8 d'avant, 9 « Pousser un véhicule ». */
export const MORE_RING: readonly WheelSector[] = DIRECT_MORE_RING;
/** Roue de ceux qui commandent (sens horaire à partir du haut) : 1, 3 à 8 (2 : alias de 1). */
export const WHEEL: readonly WheelSector[] = DIRECT_WHEEL;
/** Roue d'un policier sans autorité de commandement : « Avec moi » (1, et 2) et « Secours ici » (7). */
export const FOLLOW_WHEEL: readonly WheelSector[] = DIRECT_FOLLOW_WHEEL;

/** Secteurs de la roue selon le niveau de commandement du joueur. */
export function wheelOrders(level: string): readonly WheelSector[] {
  return level === 'lecture' ? FOLLOW_WHEEL : WHEEL;
}

/** Élément du menu radial d'un secteur, et s'il est verrouillé (grisé, mais il se choisit : il dit pourquoi). */
export interface WheelEntry extends WheelItem {
  locked: boolean;
}

/**
 * Secteurs → éléments du menu radial : numéro imprimé, deuxième ligne = l'unité qui obéira (« MISTRAL 1 · 90 m ») ou la
 * raison du verrou ; `orders[i]` : l'ordre du secteur i (null : couronne, appel, « Avec moi »). Fonction pure.
 */
export function wheelItems(sectors: readonly WheelSector[], orders: readonly (NaturalOrder | null)[]): WheelEntry[] {
  const out: WheelEntry[] = [];
  for (let i = 0; i < sectors.length; i++) {
    const w = sectors[i]!;
    const o = orders[i] ?? null;
    // jamais `disabled` pour le menu radial : un secteur verrouillé se choisit, pour dire sa raison (ou faire les
    // sommations au second appui)
    out.push({ id: w.action, label: w.label, sub: sectorItemText(o, w.sub), disabled: false, force: w.coercive, key: String(w.key), locked: sectorLocked(o) });
  }
  return out;
}

/** « toute la compagnie », « toute la section », « votre groupe »… : à qui vont les ordres de la roue en lecture seule. */
export function wheelAudience(kind: string, level: string): string {
  if (level === 'lecture') return kind === 'equipage' ? 'votre équipage' : kind === 'binome' ? 'votre binôme' : 'votre groupe';
  if (kind === 'compagnie') return 'toute la compagnie';
  if (kind === 'section' || kind === 'peloton') return 'toute la section';
  if (kind === 'equipage') return 'votre équipage';
  return 'tout le groupe';
}

/** Durée en deçà de laquelle un appui est « bref » : la roue reste alors affichée (s). */
const TAP_SECONDS = 0.24;
/** Largeur utile d'un libellé de secteur, et du centre, en unités de la roue (viewBox de 320). */
const LABEL_SPLIT = 12;
const SUB_SPLIT = 19;
const HUB_WIDTH = 98;
const NS = 'http://www.w3.org/2000/svg';
/** Sans désignation exploitable, le point 20 m devant le regard (m). */
const AHEAD = 20;

/** Surcouche tactile (service 'input.touch') : le doigt de l'appui long qui a ouvert la roue. */
interface TouchHoldLike { wheelFinger?(): { x: number; y: number; down: boolean } | null }

/** Coupe un libellé en deux lignes à l'espace la plus proche du milieu (un seul mot : inchangé). */
export function splitLabel(text: string): [string, string] | null {
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ' ') continue;
    if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
  }
  return best > 0 ? [text.slice(0, best), text.slice(best + 1)] : null;
}

/** Coupe un texte en lignes d'au plus `max` caractères, aux espaces (au plus `lines` lignes, la dernière garde le reste). */
export function wrapWords(text: string, max: number, lines: number): string[] {
  const words = text.split(' ').filter((w) => w !== '');
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (cur === '') cur = w;
    else if (cur.length + 1 + w.length <= max || out.length === lines - 1) cur += ' ' + w;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur !== '') out.push(cur);
  return out;
}

/** Écrit un texte SVG sur plusieurs lignes (tspan), la première à `y0`, les suivantes `gap` plus bas. */
function multiLine(t: SVGTextElement, lines: readonly string[], y0: number, gap: number): void {
  const x = t.getAttribute('x') ?? '0';
  t.textContent = '';
  for (let k = 0; k < lines.length; k++) {
    const span = document.createElementNS(NS, 'tspan');
    span.setAttribute('x', x);
    span.setAttribute('y', (y0 + k * gap).toFixed(1));
    span.textContent = lines[k]!;
    t.appendChild(span);
  }
}

/**
 * Les libellés longs passent sur deux lignes, la deuxième ligne (unité, raison d'un verrou) sur deux ou trois, sans
 * toucher au menu radial (wheel.ts).
 */
function fitSectorTexts(svg: SVGSVGElement): void {
  let label: SVGTextElement | null = null;
  const flush = (sub: SVGTextElement | null): void => {
    if (!label) return;
    const ly = Number(label.getAttribute('y') ?? '0');
    const lSplit = (label.textContent ?? '').length > LABEL_SPLIT ? splitLabel(label.textContent ?? '') : null;
    const subLines = sub ? wrapWords(sub.textContent ?? '', SUB_SPLIT, 3) : [];
    // bloc centré sur le milieu du secteur : il remonte de la moitié des lignes ajoutées
    const extraL = lSplit ? 13 : 0;
    const up = (extraL + Math.max(0, subLines.length - 1) * 10) / 2;
    if (lSplit) {
      multiLine(label, lSplit, ly - up, 13);
      label.style.fontSize = '11.5px';
    } else if (up > 0) label.setAttribute('y', (ly - up).toFixed(1));
    if (sub) {
      const sy = Number(sub.getAttribute('y') ?? '0') + extraL - up;
      if (subLines.length > 1) {
        multiLine(sub, subLines, sy, 10);
        if (subLines.length > 2) sub.style.fontSize = '8.5px';
      } else sub.setAttribute('y', sy.toFixed(1));
    }
    label = null;
  };
  const kids = Array.from(svg.children);
  let sub: SVGTextElement | null = null;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i]!;
    const cls = k.getAttribute('class') ?? '';
    if (k.tagName.toLowerCase() === 'path' || /\bcw-hub\b|\bcw-title\b/.test(cls)) {
      flush(sub);
      sub = null;
    } else if (/\bcw-label\b/.test(cls)) {
      flush(sub);
      sub = null;
      label = k as SVGTextElement;
    } else if (/\bcw-sublabel\b/.test(cls)) {
      sub = k as SVGTextElement;
    }
  }
  flush(sub);
}

/** Secteurs verrouillés : grisés (secteur, libellé, touche, deuxième ligne), mais toujours choisissables. */
function greyLocked(svg: SVGSVGElement, items: readonly WheelEntry[]): void {
  const groups = ['.cw-wedge', '.cw-label', '.cw-key', '.cw-sublabel'].map((sel) => Array.from(svg.querySelectorAll(sel)));
  for (let i = 0; i < items.length; i++) {
    if (!items[i]!.locked) continue;
    for (const g of groups) if (g.length === items.length) g[i]!.classList.add('is-off');
  }
}

/** Rayon des touches dans le menu radial (wheel.ts, R_KEY) : repris ici sans modifier ce fichier. */
const WHEEL_R_KEY = 138;

/**
 * Roue large (deux à quatre secteurs : celle de l'exécutant) : la touche, posée par le menu radial au milieu du bord
 * extérieur, tombait sur la deuxième ligne d'un secteur latéral. Elle glisse vers le début de son secteur, à 35°,
 * toujours dans le secteur et hors du texte. Rien ne change pour la roue de sept.
 */
function placeWideKeys(svg: SVGSVGElement, count: number): void {
  if (count > 4 || count < 2) return;
  const step = (Math.PI * 2) / count;
  const keys = Array.from(svg.querySelectorAll<SVGTextElement>('.cw-key'));
  if (keys.length !== count) return;
  for (let i = 0; i < count; i++) {
    const a = i * step - Math.PI / 2 - Math.min(step / 2 - 0.2, (35 * Math.PI) / 180);
    keys[i]!.setAttribute('x', (Math.cos(a) * WHEEL_R_KEY).toFixed(1));
    keys[i]!.setAttribute('y', (Math.sin(a) * WHEEL_R_KEY + 3.5).toFixed(1));
  }
}

/** Taille de police (px) pour qu'un texte du centre tienne dans le moyeu. */
function hubFont(text: string, base: number, perChar: number, min: number): number {
  const w = text.length * base * perChar;
  return w <= HUB_WIDTH ? base : Math.max(min, Math.floor((HUB_WIDTH / (text.length * perChar)) * 10) / 10);
}

export class OrderWheelScreen implements ScreenInstance {
  readonly root: HTMLDivElement;
  private wheel: RadialMenu | null = null;
  /** Secteurs affichés (roue, ou couronne intérieure), leurs ordres, et la roue d'origine. */
  private ring: readonly WheelSector[] = [];
  private orders: (NaturalOrder | null)[] = [];
  private outer: readonly WheelSector[] = [];
  private inner = false;
  private innerOf: WheelSector | null = null;
  private readonly slot: HTMLDivElement;
  private readonly direct: DirectRuntime | null;
  private held: boolean;
  private age = 0;
  private ticks = 0;
  private vx = 0;
  private vy = 0;
  private done = false;
  private readonly lecture: boolean;
  /** Désignation relevée à l'ouverture (le point visé, la personne). */
  private readonly des: Designation;
  private readonly yaw: number;
  /** Choix « À qui » des ordres affichés (U, roue ouverte : les secteurs suivent). */
  private whoShown = '';
  private centerTitle = '';
  private centerSub = '';
  private titleShown = '';
  private subShown = '';
  private originX = NaN;
  private originY = NaN;
  /** Touche de secteur tapée, servie à la prochaine image (comme le menu radial : l'appui reste au jeu cette image-ci). */
  private pendingKey = '';
  /** Roue ouverte par un appui long sur la pastille du téléphone : le doigt est suivi jusqu'au relâchement. */
  private touchHold: TouchHoldLike | null = null;
  private readonly onMove = (e: PointerEvent): void => this.relativeMove(e);
  /**
   * Chiffres : pris ici, avant le menu radial (dont l'écoute numérote ses secteurs 1, 2, 3… dans l'ordre) — le
   * numéro imprimé sur un secteur est le sien (la roue du CRS : 1, 7 ; 2 en alias de 1). Enregistré avant le premier
   * menu radial.
   */
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || !isWheelKeyCode(e.code)) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.stopImmediatePropagation();
    this.pendingKey = e.code;
  };

  constructor(private readonly core: CommandCore, host: HTMLElement) {
    ensureCommandStyle();
    const ctx = core.ctx;
    this.root = el('div', 'cm-root cw-screen' + (coarsePointer() ? ' cm-coarse' : ''));
    this.root.dataset.id = 'order-wheel';
    this.slot = el('div', 'cw-slot');
    this.root.appendChild(this.slot);
    host.appendChild(this.root);
    this.held = ctx.input.down('orders');
    // un toucher (ou un clic) hors de la roue la referme — au téléphone, c'était sinon le seul moyen avec le moyeu ;
    // pas pendant le premier dixième de seconde (le doigt qui vient d'ouvrir la roue)
    this.root.addEventListener('pointerdown', (e) => {
      const t = e.target;
      if (this.done || this.age < 0.12 || !(t instanceof Element) || t.closest('svg')) return;
      if (this.inner) this.openRing(this.outer, false);
      else this.close();
    });

    const st = ctx.player.state;
    const p = core.player();
    const sc = core.scope();
    this.lecture = sc.level === 'lecture';
    this.yaw = st.camYaw;
    this.direct = ctx.service<DirectRuntime>(DIRECT_SERVICE) ?? null;
    // ce que le joueur désigne (le même que l'ordre prêt) ; sans rien d'exploitable, 20 m devant le regard
    let des = this.direct ? this.direct.designation() : null;
    if (!des && p) des = designationAt(core, p.x + Math.sin(st.camYaw) * AHEAD, p.z + Math.cos(st.camYaw) * AHEAD);
    this.des = des ?? { kind: 'none', x: 0, z: 0, distance: 0, person: null, place: '', far: false };

    // sans autorité et sans unité à rappeler (ou sans moteur des ordres) : aucune roue à ce poste
    const follow = core.followUnit();
    if (!this.direct || !p || (this.lecture && !follow) || (!this.lecture && sc.ownSquadId === 0 && !follow)) {
      const cap = el('div', 'cw-cap');
      cap.append(el('b', undefined, 'Roue d’ordres'), document.createTextNode('Aucune unité n’est sous vos ordres : vous recevez les ordres, vous n’en donnez pas.'));
      this.root.appendChild(cap);
      // Aucune roue à ce poste : on le DIT par une notification qui reste lisible quelques secondes (le message
      // ci-dessus disparaissait au relâchement de la touche — invisible pour un appui bref ou un bouton tactile),
      // sans bloquer les commandes du joueur. L'écran se referme à la première image.
      ctx.ui.notify('Vous recevez les ordres : pas de roue d’ordres à ce poste. La carte reste consultable.', 'info', 5);
      return;
    }

    window.addEventListener('keydown', this.onKey, true);
    this.outer = wheelOrders(sc.level);
    if (this.lecture && follow) {
      this.centerTitle = `À : ${follow.name}`;
      this.centerSub = wheelAudience(follow.kind, sc.level);
    }
    this.openRing(this.outer, false);
    this.startTouchHold();

    const cap = el('div', 'cw-cap');
    const key = core.kit ? core.kit.keyLabel('orders') : '';
    if (ctx.input.device === 'touch' || coarsePointer()) cap.textContent = 'Touchez un ordre — le centre annule';
    else if (ctx.input.device === 'gamepad') cap.textContent = 'Stick : choisir · relâchez pour valider · B : annuler';
    else cap.textContent = `Souris : dirigez-la vers un ordre, relâchez ${key !== '' ? '« ' + key + ' »' : 'la touche'} pour valider`;
    this.root.appendChild(cap);
    // clavier seul : la légende des touches, sous la roue
    if (ctx.input.device === 'kbm' && !coarsePointer()) {
      const who = this.canCycle() ? ` · ${core.kit ? core.kit.keyLabel('order_who') || 'U' : 'U'} : autre unité` : '';
      this.root.appendChild(el('div', 'cw-legend', `${WHEEL_KEYS_LEGEND}${who} · Échap ou ⌫ : revenir`));
    }
    window.addEventListener('pointermove', this.onMove);
  }

  /**
   * Appui long sur la pastille « Ordre prêt » : le doigt est encore posé (ou vient d'être levé). Le secteur de la ligne
   * « autre » est surligné ; la touche « Ordres » de l'appui bref qui a ouvert la roue n'est pas un appui maintenu.
   */
  private startTouchHold(): void {
    const touch = this.core.ctx.service<TouchHoldLike>('input.touch');
    const f = touch && typeof touch.wheelFinger === 'function' ? touch.wheelFinger() : null;
    if (!f || !this.wheel || !this.direct) return;
    this.touchHold = touch!;
    this.held = false;
    const autre = this.direct.ready()?.autre ?? null;
    const i = autre ? this.ring.findIndex((w) => w.action === autre.verb) : -1;
    if (i >= 0) this.wheel.setHighlight(i);
    this.fitCenter();
  }

  /** Doigt de l'appui long : le secteur sous lui est surligné (le centre n'en surligne aucun) ; relâché, il est donné. */
  private followTouchHold(wheel: RadialMenu): boolean {
    const touch = this.touchHold;
    if (!touch) return false;
    const f = typeof touch.wheelFinger === 'function' ? touch.wheelFinger() : null;
    if (f && f.down) {
      const i = wheel.indexAtClient(f.x, f.y);
      if (i >= 0) wheel.setHighlight(i);
      else if (i === -2) wheel.setHighlight(-1);
      this.fitCenter();
      return true;
    }
    this.touchHold = null;
    if (f && wheel.highlighted >= 0) {
      wheel.choose();
      return true;
    }
    return false;
  }

  /** U change-t-il quelque chose (plusieurs unités au choix) ? */
  private canCycle(): boolean {
    return !this.lecture && !!this.direct && whoCycle(this.direct.env()).length > 1;
  }

  /** Ce que la roue sait de la situation pour calculer les ordres des secteurs. */
  private situation(): SectorSituation | null {
    const direct = this.direct;
    if (!direct) return null;
    const roe = this.core.ctx.law.roe;
    return {
      env: direct.env(), des: this.des, whoKey: direct.whoKey(), yaw: this.yaw,
      law: { authorizedForce: roe.authorizedForce, underAttack: roe.underAttack, authority: this.core.scope().canAuthorize },
    };
  }

  /** Centre de la roue au repos : à qui (choix U en cours), et le point visé. */
  private refreshCenter(s: SectorSituation | null): void {
    if (this.lecture || !s) return;
    const unit = unitOfKey(s.env, s.whoKey);
    this.centerTitle = s.whoKey === 'tous' ? 'À : tout le monde' : unit ? `À : ${whoLabel(unit)}` : 'Ordres';
    const where = this.des.kind === 'none' ? 'visez un point' : this.des.place !== '' ? this.des.place : `à ${distText(this.des.distance)}`;
    this.centerSub = this.canCycle() ? `${where} · U : autre unité` : where;
  }

  /** Affiche une roue (ou une couronne intérieure) à la place de la précédente. */
  private openRing(sectors: readonly WheelSector[], inner: boolean, of: WheelSector | null = null): void {
    const hover = this.wheel ? this.wheel.hoverEnabled : false;
    const keep = this.ring === sectors && this.wheel ? this.wheel.highlighted : -1;
    this.wheel?.dispose();
    this.ring = sectors;
    this.inner = inner;
    this.innerOf = of;
    const s = this.situation();
    this.whoShown = s ? s.whoKey : '';
    this.orders = sectors.map((w) => (s ? sectorOrder(w, s) : null));
    this.refreshCenter(s);
    const items = wheelItems(sectors, this.orders);
    const wheel = new RadialMenu(this.slot, items, {
      onChoose: (i) => this.choose(i),
      onCancel: () => (this.inner ? this.openRing(this.outer, false) : this.close()),
    });
    wheel.hoverEnabled = inner && hover;
    const title = of ? of.label : this.centerTitle;
    const sub = of ? (of.action === 'secours' ? 'à votre position' : this.centerTitle) : this.centerSub;
    wheel.setCenter(title, sub);
    const svg = wheel.root.querySelector('svg');
    if (svg) {
      fitSectorTexts(svg);
      greyLocked(svg, items);
      placeWideKeys(svg, sectors.length);
    }
    this.wheel = wheel;
    if (keep >= 0) wheel.setHighlight(keep);
    this.titleShown = '';
    this.subShown = '';
    this.originX = NaN;
    this.fitCenter();
  }

  /** Le texte du centre (unité, ou secteur surligné) tient dans le moyeu : police réduite au besoin. */
  private fitCenter(): void {
    const svg = this.wheel?.root.querySelector('svg');
    if (!svg) return;
    const t = svg.querySelector('.cw-title') as SVGTextElement | null;
    const s = svg.querySelector('.cw-sub') as SVGTextElement | null;
    const tt = t?.textContent ?? '';
    const ss = s?.textContent ?? '';
    if (t && tt !== this.titleShown) {
      this.titleShown = tt;
      t.style.fontSize = `${hubFont(tt, 12, 0.7, 7.5)}px`;
    }
    if (s && ss !== this.subShown) {
      this.subShown = ss;
      s.style.fontSize = `${hubFont(ss, 9.5, 0.56, 7)}px`;
    }
  }

  /**
   * Souris : le premier événement ne fait que noter la position (le navigateur en fabrique un quand la
   * roue apparaît sous un pointeur immobile). Ensuite, le survol direct choisit le secteur ; hors de la
   * roue, c'est la direction du déplacement depuis ce point de départ qui choisit.
   */
  private relativeMove(e: PointerEvent): void {
    const wheel = this.wheel;
    if (!wheel || e.pointerType === 'touch') return;
    // pendant le premier dixième de seconde, on ne fait que suivre la position (événements de mise en place)
    if (this.originX !== this.originX || this.age < 0.12) {
      this.originX = e.clientX;
      this.originY = e.clientY;
      return;
    }
    if (!wheel.hoverEnabled) {
      if (Math.hypot(e.clientX - this.originX, e.clientY - this.originY) < 8) return;
      wheel.hoverEnabled = true;
      wheel.pointerAt(e.clientX, e.clientY);
    }
    if (wheel.indexAtClient(e.clientX, e.clientY) !== -1) return;
    wheel.pointAt(e.clientX - this.originX, e.clientY - this.originY, 34);
  }

  private close(): void {
    if (this.done) return;
    this.done = true;
    this.core.ctx.ui.close(WHEEL_SCREEN);
  }

  /** Secteur validé (clic, toucher, chiffre, Entrée, relâchement) : couronne intérieure, appel de secours ou ordre. */
  private choose(index: number): void {
    const w = this.ring[index];
    const direct = this.direct;
    if (!w || this.done || !direct) return;
    if (w.ring) {
      this.openRing(w.ring, true, w);
      return;
    }
    const ctx = this.core.ctx;
    if (w.action === 'pompiers' || w.action === 'samu') {
      requestRescueAtPlayer(this.core, w.action as RescueKind);
      this.close();
      return;
    }
    if (w.action === 'avec_moi') {
      // comme A : tout le monde (ou l'unité choisie par U) revient avec le joueur — la roue est l'écran ouvert
      const r = direct.avecMoi({ fromScreen: true });
      this.sound(r);
      this.close();
      return;
    }
    const order = this.orders[index] ?? null;
    if (!order) return;
    const r = direct.giveSector(order);
    this.sound(r);
    // parti : la roue se referme ; refusé ou premier appui d'un ordre qui demande les sommations : elle reste (la phrase
    // est affichée), le joueur choisit autre chose ou appuie encore
    if (r.ok) this.close();
    else if (r.ignored) this.close();
  }

  private sound(r: GiveResult): void {
    if (r.ignored) return;
    this.core.ctx.audio.play(r.ok ? 'radio_bip' : 'ui_alerte');
  }

  update(dt: number, input: InputState): void {
    if (this.done) return;
    this.age += dt;
    this.ticks++;
    const wheel = this.wheel;
    if (!wheel) {
      // pas de roue à ce poste (notification déjà affichée) : rien à tenir ouvert
      this.close();
      return;
    }
    // U (roue ouverte) : les secteurs suivent la nouvelle unité
    if (this.direct && this.direct.whoKey() !== this.whoShown) {
      this.openRing(this.ring, this.inner, this.innerOf);
      return;
    }
    if (this.followTouchHold(wheel)) return;
    if (input.device === 'gamepad') {
      // stick droit : mouvement accumulé ; stick gauche : direction directe
      this.vx += input.lookX * 2.2;
      this.vy -= input.lookY * 2.2;
      const l = Math.hypot(this.vx, this.vy);
      if (l > 1) {
        this.vx /= l;
        this.vy /= l;
      }
      if (Math.hypot(input.moveX, input.moveY) > 0.5) wheel.pointAt(input.moveX, -input.moveY, 0.5);
      else wheel.pointAt(this.vx, this.vy, 0.4);
    }
    // clavier : le chiffre imprimé sur un secteur le donne directement (2 : alias de 1 dans la roue, pas dans les couronnes)
    const key = this.pendingKey;
    this.pendingKey = '';
    if (key !== '') {
      const i = wheelSectorIndex(key, this.ring.map((w) => w.key), this.inner ? {} : DIGIT_ALIASES);
      if (i >= 0) {
        wheel.setHighlight(i);
        wheel.choose();
        this.fitCenter();
        return;
      }
    }
    // flèches = surlignage (pas à la manette : la croix porte « Ordres ») ; un secteur surligné aux flèches est validé
    // par Entrée, ou au relâchement de « Ordres » comme à la souris
    wheel.applyKeys(input, input.device === 'kbm', () => this.core.ctx.audio.play('ui_alerte'));
    if (this.done || this.wheel !== wheel) return;
    this.fitCenter();
    // roue restée affichée après un appui bref : un nouvel appui sur « Ordres » la referme
    if (!this.held && this.ticks > 1 && input.pressed('orders')) {
      this.close();
      return;
    }
    if (input.pressed('ui_accept') && wheel.highlighted >= 0) {
      wheel.choose();
      return;
    }
    if (this.held && !input.down('orders')) {
      this.held = false;
      // touche relâchée : un secteur surligné est validé ; un appui bref laisse la roue affichée
      // (bref = relâché dans les toutes premières images, ou en moins d'un quart de seconde : le compte
      // d'images protège des images lentes, où un appui bref paraîtrait long)
      if (wheel.highlighted >= 0) {
        wheel.choose();
        if (!this.done && this.wheel === wheel && !this.inner) this.close();
      } else if (this.ticks > 4 && this.age > TAP_SECONDS) this.close();
    }
  }

  /** Échap / ⌫ : de la couronne intérieure on revient à la roue ; de la roue, le socle la referme. */
  back(): boolean {
    if (this.inner && !this.done) {
      this.openRing(this.outer, false);
      return true;
    }
    return false;
  }

  dispose(): void {
    this.done = true;
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('pointermove', this.onMove);
    this.wheel?.dispose();
    this.root.remove();
  }
}
