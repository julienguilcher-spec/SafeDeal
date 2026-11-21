/* =====================================================================================
 * Écran « roue_ordres » : roue d'ordres rapide en vue de jeu, pour l'unité du joueur. Les ordres
 * visent le point regardé (PlayerState.aimX / aimZ) ou la personne visée, relevés à l'ouverture.
 *
 * Huit secteurs, les ordres « Suivez-moi » d'abord, numérotés 1 à 8 dans le sens horaire à partir du haut ; le numéro
 * d'un secteur est le même pour tous les rôles : le CRS, sans autorité de commandement, n'a que les secteurs 1, 2 et 7
 * (« F puis 1 », « F puis 2 », « F puis 7 » veulent dire la même chose pour tout le monde). « Secours ici » (7) et
 * « Plus… » (8) ouvrent une couronne intérieure (Pompiers / SAMU ; repli, bond, charge, gaz, tenir, arrêter, laisser
 * agir, tortue), numérotée 1 à n.
 *
 * Touche « Ordres » maintenue : la roue reste ouverte, on choisit une direction (souris, stick),
 * on relâche pour valider. Appui bref ou doigt : la roue reste affichée, on touche un secteur.
 * Au clavier seul (Mac portable sans souris) : le chiffre imprimé sur un secteur le choisit, les flèches
 * déplacent le surlignage et Entrée valide ; Échap ou ⌫ ramènent de la couronne intérieure à la roue, puis
 * referment la roue (wheelKeys.ts). Le menu radial lui-même est celui de wheel.ts (inchangé).
 * ===================================================================================== */

import type { InputState, OrderType, RoeState, Squad } from '@/core/contracts';
import type { RescueKind, ScreenInstance } from '@/core/extensions';
import { el } from '../maps/icons';
import { coarsePointer } from '../maps/style';
import { formatDistance } from '../maps/transform';
import type { CommandCore } from './core';
import { verbOf } from './orders';
import type { OrderGeom, OrderVerb } from './orders';
import { requestRescueAtPlayer } from './quickActions';
import { ensureCommandStyle } from './style';
import { RadialMenu } from './wheel';
import type { WheelItem } from './wheel';
import { WHEEL_KEYS_LEGEND, isWheelKeyCode, wheelSectorIndex } from './wheelKeys';

export const WHEEL_SCREEN = 'roue_ordres';

/** Action d'un secteur : un ordre (OrderType), ou l'ouverture d'une couronne, ou un appel de secours. */
export type WheelAction = OrderType | 'secours' | 'plus' | 'pompiers' | 'samu';

export interface WheelSector {
  /** Ordre donné (type de SquadOrder), ou 'secours' / 'plus' (couronne intérieure), 'pompiers' / 'samu' (appel). */
  type: WheelAction;
  label: string;
  /** Deuxième ligne, plus petite. */
  sub?: string;
  /** Numéro imprimé sur le secteur, et touche qui le choisit (1…9). */
  key: number;
  /** Couronne intérieure ouverte par ce secteur. */
  ring?: readonly WheelSector[];
}

/** Couronne « Secours ici » : la même demande que le bouton du HUD, au point où se trouve le joueur. */
export const RESCUE_RING: readonly WheelSector[] = [
  { type: 'pompiers', label: 'Pompiers ici', sub: 'à votre position', key: 1 },
  { type: 'samu', label: 'SAMU ici', sub: 'à votre position', key: 2 },
];

/** Couronne « Plus… » : les autres ordres de terrain à son unité. */
export const MORE_RING: readonly WheelSector[] = [
  { type: 'repli', label: 'Se replier', sub: '30 m en arrière', key: 1 },
  { type: 'bond_offensif', label: 'Bond en avant', sub: 'au point visé', key: 2 },
  { type: 'charge', label: 'Charger', sub: 'au point visé', key: 3 },
  { type: 'disperser_gaz', label: 'Disperser au gaz', sub: 'au point visé', key: 4 },
  { type: 'tenir', label: 'Tenir sa position', sub: 'sur place', key: 5 },
  { type: 'cesser', label: 'Arrêter l’action', sub: 'on s’arrête', key: 6 },
  { type: 'libre', label: 'Laisser agir seuls', sub: 'sans ordre', key: 7 },
  { type: 'tortue', label: 'Se protéger (tortue)', sub: 'boucliers', key: 8 },
];

/** Secteurs de la roue de ceux qui commandent, dans le sens horaire à partir du haut (§6.4). */
export const WHEEL: readonly WheelSector[] = [
  { type: 'suivre_pied', label: 'Suivez-moi à pied', sub: 'toute mon unité', key: 1 },
  { type: 'avec_moi', label: 'Suivez-moi en véhicules', sub: 'toute mon unité', key: 2 },
  { type: 'avancer', label: 'Avancer jusqu’ici', sub: 'au point visé', key: 3 },
  { type: 'ligne', label: 'Tenir une ligne ici', sub: 'face à moi', key: 4 },
  { type: 'interpeller', label: 'Interpeller', sub: 'la personne visée', key: 5 },
  { type: 'degager_obstacle', label: 'Pousser un véhicule', sub: 'le blindé Centaure, au point visé', key: 6 },
  { type: 'secours', label: 'Secours ici', sub: 'pompiers, SAMU', key: 7, ring: RESCUE_RING },
  { type: 'plus', label: 'Plus…', sub: 'repli, charge, gaz…', key: 8, ring: MORE_RING },
];

/**
 * Roue réduite d'un policier sans autorité de commandement (CRS, BRAV-M, équipage d'engin, télépilote) : les deux
 * ordres « Suivez-moi » à son unité et « Secours ici », avec les MÊMES numéros que la roue complète (1, 2, 7).
 */
export const FOLLOW_WHEEL: readonly WheelSector[] = WHEEL.filter((w) => w.key === 1 || w.key === 2 || w.key === 7);

/** Secteurs de la roue selon le niveau de commandement du joueur. */
export function wheelOrders(level: string): readonly WheelSector[] {
  return level === 'lecture' ? FOLLOW_WHEEL : WHEEL;
}

/** Ce qu'il faudrait autoriser, en mots (« du gaz »), par niveau de force. */
const AUTH_NOUNS: readonly string[] = ['de la force', 'des mains nues', 'du bâton', 'du gaz', 'des grenades', 'de l’arme'];

/**
 * Pourquoi un ordre de force est verrouillé, en une ligne (« il faut les sommations et l'autorisation du gaz ») ;
 * '' s'il peut partir. Même règle que CommandCore.check : force au-delà de l'autorisation, hors riposte.
 */
export function lockedReason(verb: Pick<OrderVerb, 'force' | 'coercive'>, roe: Pick<RoeState, 'authorizedForce' | 'underAttack' | 'sommation'>): string {
  if (verb.force <= roe.authorizedForce || roe.underAttack) return '';
  const auth = `l’autorisation ${AUTH_NOUNS[Math.max(0, Math.min(AUTH_NOUNS.length - 1, verb.force))]!}`;
  return verb.coercive && roe.sommation < 3 ? `il faut les sommations et ${auth}` : `il faut ${auth}`;
}

/** Ce que la roue sait de la situation au moment de l'ouverture. */
export interface WheelSituation {
  roe: Pick<RoeState, 'authorizedForce' | 'underAttack' | 'sommation'>;
  /** Une personne (non policière) est visée. */
  hasTarget: boolean;
}

/** Secteurs → éléments du menu radial : numéro imprimé, ordres verrouillés grisés avec leur raison. Fonction pure. */
export function wheelItems(sectors: readonly WheelSector[], s: WheelSituation): WheelItem[] {
  const out: WheelItem[] = [];
  for (let i = 0; i < sectors.length; i++) {
    const w = sectors[i]!;
    const verb = verbOf(w.type);
    let disabled = false;
    let sub = w.sub;
    if (verb) {
      const why = lockedReason(verb, s.roe);
      if (why !== '') {
        disabled = true;
        sub = why;
      } else if (w.type === 'interpeller' && !s.hasTarget) {
        disabled = true;
        sub = 'visez quelqu’un';
      }
    }
    out.push({ id: w.type, label: w.label, sub, disabled, force: verb ? verb.coercive : false, key: String(w.key) });
  }
  return out;
}

/** « toute la compagnie », « toute la section », « votre groupe »… : à qui vont les ordres de la roue. */
export function wheelAudience(kind: string, level: string): string {
  if (level === 'lecture') return kind === 'equipage' ? 'votre équipage' : kind === 'binome' ? 'votre binôme' : 'votre groupe';
  if (kind === 'compagnie') return 'toute la compagnie';
  if (kind === 'section' || kind === 'peloton') return 'toute la section';
  if (kind === 'equipage') return 'votre équipage';
  return 'tout le groupe';
}

/** Durée en deçà de laquelle un appui est « bref » : la roue reste alors affichée (s). */
const TAP_SECONDS = 0.24;
/** Recul d'un repli ordonné depuis la roue (m). */
const REPLI_DISTANCE = 30;
/** Largeur utile d'un libellé de secteur, et du centre, en unités de la roue (viewBox de 320). */
const LABEL_SPLIT = 12;
const SUB_SPLIT = 19;
const HUB_WIDTH = 98;
const NS = 'http://www.w3.org/2000/svg';

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
 * Les secteurs de huit sont plus larges que ceux de douze, mais « Suivez-moi en véhicules » n'y tient pas sur une
 * ligne : les libellés longs passent sur deux lignes, la deuxième ligne (raison d'un verrou comprise) sur deux ou
 * trois, sans toucher au menu radial (wheel.ts).
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

/** Rayon des touches dans le menu radial (wheel.ts, R_KEY) : repris ici sans modifier ce fichier. */
const WHEEL_R_KEY = 138;

/**
 * Roue large (trois ou quatre secteurs : celle de l'exécutant) : la touche, posée par le menu radial au milieu du bord
 * extérieur, tombait sur la deuxième ligne d'un secteur latéral (« 2 » sur « toute mon unité »). Elle glisse vers le
 * début de son secteur, à 35°, toujours dans le secteur et hors du texte. Rien ne change pour la roue de huit.
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
  /** Secteurs affichés (roue, ou couronne intérieure) et roue d'origine. */
  private ring: readonly WheelSector[] = [];
  private outer: readonly WheelSector[] = [];
  private inner = false;
  private readonly slot: HTMLDivElement;
  private readonly squad: Squad | null = null;
  private held: boolean;
  private age = 0;
  private ticks = 0;
  private vx = 0;
  private vy = 0;
  private done = false;
  // visée relevée à l'ouverture
  private readonly aimX: number;
  private readonly aimZ: number;
  private readonly yaw: number;
  private readonly targetId: number;
  private readonly unitX: number;
  private readonly unitZ: number;
  private readonly situation: WheelSituation;
  private centerTitle = '';
  private centerSub = '';
  private titleShown = '';
  private subShown = '';
  private originX = NaN;
  private originY = NaN;
  /** Touche de secteur tapée, servie à la prochaine image (comme le menu radial : l'appui reste au jeu cette image-ci). */
  private pendingKey = '';
  private readonly onMove = (e: PointerEvent): void => this.relativeMove(e);
  /**
   * Chiffres : pris ici, avant le menu radial (dont l'écoute numérote ses secteurs 1, 2, 3… dans l'ordre) — le
   * numéro imprimé sur un secteur est le sien (la roue du CRS : 1, 2, 7). Enregistré avant le premier menu radial.
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
    // sans autorité : la roue réduite (« Suivez-moi », « Secours ici »), adressée à son unité
    const squad = sc.level !== 'lecture' && sc.ownSquadId !== 0 ? ctx.squads.get(sc.ownSquadId) ?? null : core.followUnit();
    this.squad = squad;
    this.yaw = st.camYaw;
    const px = p ? p.x : 0;
    const pz = p ? p.z : 0;
    const leader = squad && squad.leaderId !== 0 ? ctx.people.get(squad.leaderId) : undefined;
    this.unitX = leader ? leader.x : px;
    this.unitZ = leader ? leader.z : pz;
    // sans point visé exploitable, on prend 20 m devant le regard
    let ax = st.aimX, az = st.aimZ;
    if (!Number.isFinite(ax) || !Number.isFinite(az) || Math.hypot(ax - px, az - pz) < 2) {
      ax = px + Math.sin(st.camYaw) * 20;
      az = pz + Math.cos(st.camYaw) * 20;
    }
    this.aimX = ax;
    this.aimZ = az;
    const target = st.aimedPersonId !== 0 ? ctx.people.get(st.aimedPersonId) : undefined;
    this.targetId = target && target.faction !== 'police' ? target.id : 0;
    this.situation = { roe: ctx.law.roe, hasTarget: this.targetId !== 0 };

    if (!squad) {
      const cap = el('div', 'cw-cap');
      cap.append(el('b', undefined, 'Roue d’ordres'), document.createTextNode('Aucune unité n’est sous vos ordres : vous recevez les ordres, vous n’en donnez pas.'));
      this.root.appendChild(cap);
      // Aucune roue à ce poste : on le DIT par une notification qui reste lisible quelques secondes (le message
      // ci-dessus disparaissait au relâchement de la touche — invisible pour un appui bref ou un bouton tactile),
      // sans bloquer les commandes du joueur. L'écran se referme à la première image.
      ctx.ui.notify('Vous recevez les ordres : pas de roue d’ordres à ce poste. La carte reste consultable.', 'info', 5);
      return;
    }

    window.addEventListener('keydown', this.onKey, true);
    this.outer = wheelOrders(sc.level);
    const dist = Math.hypot(this.aimX - px, this.aimZ - pz);
    this.centerTitle = `À : ${squad.name}`;
    this.centerSub = `${wheelAudience(squad.kind, sc.level)}${sc.level === 'lecture' ? '' : this.targetId !== 0 ? ' · cible visée' : ` · ${formatDistance(dist)}`}`;
    this.openRing(this.outer, false);

    const cap = el('div', 'cw-cap');
    const key = core.kit ? core.kit.keyLabel('orders') : '';
    if (ctx.input.device === 'touch' || coarsePointer()) cap.textContent = 'Touchez un ordre — le centre annule';
    else if (ctx.input.device === 'gamepad') cap.textContent = 'Stick : choisir · relâchez pour valider · B : annuler';
    else cap.textContent = `Souris : dirigez-la vers un ordre, relâchez ${key !== '' ? '« ' + key + ' »' : 'la touche'} pour valider`;
    this.root.appendChild(cap);
    // clavier seul : la légende des touches, sous la roue
    if (ctx.input.device === 'kbm' && !coarsePointer()) {
      this.root.appendChild(el('div', 'cw-legend', `${WHEEL_KEYS_LEGEND} · Échap ou ⌫ : revenir`));
    }
    window.addEventListener('pointermove', this.onMove);
  }

  /** Affiche une roue (ou une couronne intérieure) à la place de la précédente. */
  private openRing(sectors: readonly WheelSector[], inner: boolean, title = this.centerTitle, sub = this.centerSub): void {
    const hover = this.wheel ? this.wheel.hoverEnabled : false;
    this.wheel?.dispose();
    this.ring = sectors;
    this.inner = inner;
    const wheel = new RadialMenu(this.slot, wheelItems(sectors, this.situation), {
      onChoose: (i) => this.choose(i),
      onCancel: () => (this.inner ? this.openRing(this.outer, false) : this.close()),
    });
    wheel.hoverEnabled = inner && hover;
    wheel.setCenter(title, sub);
    const svg = wheel.root.querySelector('svg');
    if (svg) {
      fitSectorTexts(svg);
      placeWideKeys(svg, sectors.length);
    }
    this.wheel = wheel;
    this.titleShown = '';
    this.subShown = '';
    this.originX = NaN;
    this.fitCenter();
  }

  /** Le texte du centre (nom de l'unité, ou secteur surligné) tient dans le moyeu : police réduite au besoin. */
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
    if (!w || this.done) return;
    if (w.ring) {
      this.openRing(w.ring, true, w.label, w.type === 'secours' ? 'à votre position' : this.centerTitle);
      return;
    }
    if (w.type === 'pompiers' || w.type === 'samu') {
      requestRescueAtPlayer(this.core, w.type as RescueKind);
      this.close();
      return;
    }
    this.issue(w.type);
  }

  private issue(type: string): void {
    const core = this.core;
    const ctx = core.ctx;
    const squad = this.squad;
    const verb = verbOf(type);
    if (!squad || !verb || this.done) return;
    let geom: OrderGeom | null = null;
    let targetId = 0;
    let targetName = '';
    const toAim = Math.atan2(this.aimX - this.unitX, this.aimZ - this.unitZ);
    switch (type) {
      case 'avancer': case 'bond_offensif': case 'charge': case 'disperser_gaz': case 'degager_obstacle':
        geom = { x: this.aimX, z: this.aimZ, heading: toAim, width: 0 };
        break;
      case 'ligne':
        geom = { x: this.aimX, z: this.aimZ, heading: this.yaw, width: 0 };
        break;
      case 'interpeller': {
        const t = ctx.people.get(this.targetId);
        if (!t) return;
        geom = { x: t.x, z: t.z, heading: toAim, width: 0 };
        targetId = t.id;
        targetName = 'l’objectif désigné';
        break;
      }
      case 'repli':
        geom = {
          x: this.unitX - Math.sin(this.yaw) * REPLI_DISTANCE, z: this.unitZ - Math.cos(this.yaw) * REPLI_DISTANCE,
          heading: this.yaw, width: 0,
        };
        break;
      default:
        break;
    }
    const res = type === 'suivre_pied' || type === 'avec_moi'
      ? core.callFollow(type === 'avec_moi')
      : core.issue(verb.type, [squad], geom ? [geom] : null, targetId, targetName);
    if (!res.ok) {
      ctx.ui.notify(res.reason, 'warn', 5);
      ctx.audio.play('ui_alerte');
    } else ctx.ui.notify(`Ordre donné : ${squad.name} ${verb.doing}.`, 'ok', 2.5);
    this.close();
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
    // clavier : le chiffre imprimé sur un secteur le donne directement (un secteur grisé n'est que surligné)
    const key = this.pendingKey;
    this.pendingKey = '';
    if (key !== '') {
      const i = wheelSectorIndex(key, this.ring.map((w) => w.key));
      if (i >= 0) {
        wheel.setHighlight(i);
        if (!wheel.choose()) this.core.ctx.audio.play('ui_alerte');
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
      if (!wheel.choose()) this.core.ctx.audio.play('ui_alerte');
      return;
    }
    if (this.held && !input.down('orders')) {
      this.held = false;
      // touche relâchée : un secteur surligné est validé ; un appui bref laisse la roue affichée
      // (bref = relâché dans les toutes premières images, ou en moins d'un quart de seconde : le compte
      // d'images protège des images lentes, où un appui bref paraîtrait long)
      if (wheel.highlighted >= 0) {
        if (!wheel.choose()) this.close();
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

