/* =====================================================================================
 * HUD — carte « Ma mission » (service 'session.mission') : pour le joueur qui reçoit les ordres ou une tâche.
 * L'ordre d'abord (§6.5 de la refonte du commandement) :
 *
 *   ORDRE DU COMMANDANT                                         [NOUVEL ORDRE]
 *   Tenir la ligne                                                (16 px, gras)
 *   Avenue de la République · 235 m ↗                     (lieu, distance, flèche)
 *   Vous : restez à votre place dans la ligne, bouclier levé.
 *   ⏱ Départ : 5 / 7 à bord — on part dès que tout le monde est monté
 *   ↗ Suivez votre chef de groupe : Brigadier-chef Camara · 5 m
 *   ▸ Détails (chaîne de commandement, radio)              (replié ; un clic le déplie)
 *
 * Le titre nomme celui qui a donné l'ordre par son grade (MissionCommand.by : « Commandant Carlier » → « ORDRE DU
 * COMMANDANT ») ; sans grade connu, son indicatif (« ORDRE DE MISTRAL »). Sans ordre d'en haut, la consigne du joueur
 * prend la place de l'ordre (« MA MISSION », ou « ORDRE DU CHEF DE GROUPE » pour l'ordre de son groupe).
 * Zone : haut droite, sous les objectifs ; sur écran bas (téléphone), en haut au centre, en DEUX lignes exactement :
 * « Tenir la ligne · Av. de la République · 235 m ↗ » / « Suivez Camara · 5 m » — l'ordre n'est jamais coupé, la rue
 * se raccourcit d'abord (orderHeadline).
 * À la première session d'un CRS, une astuce explique la carte (fermée d'un geste ou au bout de 30 s, mémorisée
 * dans la sauvegarde, section « hud.tips »).
 * ===================================================================================== */

import type { HudSlot } from '@/core/extensions';
import type { MissionBrief, MissionCommand } from '@/gameplay/session/mission-api';
import { Flag, Shown, Transform, Txt, h } from '../core/dom';
import { distanceLabel } from '../core/format';
import type { HudEnv, HudPart, HudState } from './types';

export const MISSION_CARD_ID = 'mission';
/** Durée du surlignage « Nouvel ordre » (s de jeu). */
export const NEW_ORDER_SECONDS = 7;
/** Section de la sauvegarde où l'astuce est mémorisée. */
export const TIPS_SECTION = 'hud.tips';
/** Durée d'affichage de l'astuce avant qu'elle se range d'elle-même (s réelles). */
const TIP_SECONDS = 30;

const STYLE_ID = 'crs-hud-mission-style';
const CSS = `
.hud-mis { width: 300px; padding: 8px 10px 9px; display: grid; gap: 4px; border-left: 3px solid var(--ui-yellow, #ffd60a); }
.hud-mis__head { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; min-height: 16px; }
.hud-mis__head .hud-cap { color: var(--ui-yellow, #ffd60a); letter-spacing: .08em; }
.hud-mis__new { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #10141c;
  background: var(--ui-yellow, #ffd60a); border-radius: 4px; padding: 1px 5px; text-shadow: none; white-space: nowrap; }
.hud-mis__order { font-size: 16px; font-weight: 750; line-height: 1.25; color: #fff; }
.hud-mis__where { display: flex; align-items: baseline; gap: 6px; font-size: 12.5px; color: #e3e9f3; min-width: 0; }
.hud-mis__place { min-width: 0; }
.hud-mis__dist { font-size: 12px; font-weight: 700; color: var(--ui-yellow, #ffd60a); white-space: nowrap; }
.hud-mis__arrow { display: inline-block; width: 14px; text-align: center; font-weight: 800; color: var(--ui-yellow, #ffd60a); flex: none; }
.hud-mis__you { font-size: 12.5px; color: #f3f6fb; line-height: 1.3; }
.hud-mis__you b { color: var(--ui-yellow, #ffd60a); font-weight: 750; }
.hud-mis__detail { font-size: 12px; color: #c9d3e3; line-height: 1.3; }
.hud-mis__status { font-size: 12.5px; font-weight: 650; color: #9fe3ff; line-height: 1.3; }
.hud-mis__status::before { content: '⏱ '; }
.hud-mis__chief { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #dfe6f1; }
.hud-mis__more { justify-self: start; pointer-events: auto; cursor: pointer; font: inherit; font-size: 11.5px; color: #b9c5d9; background: none; border: 0;
  padding: 2px 0; text-align: left; }
.hud-mis__more:hover { color: #fff; }
.hud-mis__extra { display: grid; gap: 3px; padding-left: 8px; border-left: 1px solid rgba(255, 255, 255, .18); }
.hud-mis__who { font-size: 12px; font-weight: 650; color: #dfe6f1; }
.hud-mis__chain { font-size: 11.5px; color: #b9c5d9; line-height: 1.3; }
.hud-mis__radio { font-size: 11px; color: #93a1b8; }
.hud-mis__l1, .hud-mis__l2 { display: none; }
.hud-mis__tip { margin-top: 3px; padding: 6px 8px; border-radius: 6px; background: rgba(255, 214, 10, .14); border: 1px solid rgba(255, 214, 10, .4);
  font-size: 12px; line-height: 1.35; display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: start; }
.hud-mis__tipx { pointer-events: auto; cursor: pointer; font: inherit; font-weight: 700; color: #10141c; background: var(--ui-yellow, #ffd60a);
  border: 0; border-radius: 4px; padding: 1px 7px; text-shadow: none; }
.hud-mis.is-new { animation: hud-mis-flash 1.4s ease-out 2; }
.hud-mis.is-regroup { border-left-color: #ff9f0a; }
.hud-mis.is-regroup .hud-mis__order { color: #ffc46b; }
@keyframes hud-mis-flash { 0% { box-shadow: 0 0 0 0 rgba(255, 214, 10, .85); } 100% { box-shadow: 0 0 0 10px rgba(255, 214, 10, 0); } }
/* écran bas (téléphone) : deux lignes exactement ; l'ordre n'est jamais coupé, le lieu se réduit (points de suspension) */
.ui-hud[data-compact="1"] .hud-mis { width: min(380px, 100%); padding: 4px 8px 5px; gap: 1px; }
.ui-hud[data-compact="1"] .hud-mis > :not(.hud-mis__l1):not(.hud-mis__l2) { display: none; }
.ui-hud[data-compact="1"] .hud-mis__l1, .ui-hud[data-compact="1"] .hud-mis__l2 { display: flex; align-items: baseline; gap: 5px; min-width: 0; white-space: nowrap; }
.hud-mis__l1 { font-size: 12.5px; }
.hud-mis__l1 b { flex: none; color: #fff; font-weight: 750; }
.hud-mis__l1 .hud-mis__lp { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: #e3e9f3; }
.hud-mis__l1 .hud-mis__dist, .hud-mis__l1 .hud-mis__arrow { flex: none; }
.hud-mis__l2 { font-size: 11.5px; color: #dfe6f1; }
.hud-mis__l2 span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.hud-mis__l2.is-status span { color: #9fe3ff; font-weight: 650; }
.hud-mis__l2.is-status span::before { content: '⏱ '; }
`;

function injectStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Libellé du chef : « Suivez votre chef de groupe : Brigadier-chef Martin ». */
export function chiefText(b: Pick<MissionBrief, 'chief' | 'regroup'>): string {
  const c = b.chief;
  if (!c) return '';
  return `${b.regroup ? 'Rejoignez' : 'Suivez'} votre ${c.role} : ${c.label}`;
}

/** Ligne de l'ordre d'en haut : « Ordre de MISTRAL : Barrer la rue — rue de Turbigo » ('' sans ordre). */
export function commandLine(b: Pick<MissionBrief, 'command'>): string {
  const c = b.command;
  if (!c) return '';
  return `Ordre de ${c.from} : ${c.text}${c.place ? ` — ${c.place}` : ''}`;
}

/** Angle (degrés, sens horaire à l'écran) de la flèche vers un point, selon le cap du regard. */
export function arrowAngle(yaw: number, fromX: number, fromZ: number, toX: number, toZ: number): number {
  const target = Math.atan2(toX - fromX, toZ - fromZ);
  let d = ((yaw - target) * 180) / Math.PI;
  d = ((d % 360) + 540) % 360 - 180;
  return d;
}

/** Grades reconnus en tête de MissionCommand.by et des libellés de chef (le plus long d'abord). */
const RANKS: readonly string[] = [
  'Gardien stagiaire', 'Brigadier-chef', 'Commissaire', 'Commandant', 'Capitaine', 'Brigadier', 'Major', 'Gardien',
];

/** Grade en tête d'un libellé (« Commandant Carlier » → « Commandant ») ; '' s'il n'y en a pas. */
function rankOf(label: string): string {
  const t = label.trim();
  for (let i = 0; i < RANKS.length; i++) {
    const r = RANKS[i]!;
    if (t.length >= r.length && t.slice(0, r.length).toLocaleLowerCase('fr-FR') === r.toLocaleLowerCase('fr-FR')
      && (t.length === r.length || t[r.length] === ' ')) return r;
  }
  return '';
}

/**
 * Titre de la carte d'après celui qui a donné l'ordre : « ORDRE DU COMMANDANT » (by = « Commandant Carlier »),
 * « ORDRE DU CAPITAINE » ; sans grade connu, son indicatif : « ORDRE DE MISTRAL ».
 */
export function issuerTitle(c: Pick<MissionCommand, 'by' | 'from'>): string {
  const rank = rankOf(c.by ?? '');
  if (rank !== '') return `ORDRE DU ${rank.toLocaleUpperCase('fr-FR')}`;
  const from = (c.from ?? '').trim();
  return from !== '' ? `ORDRE DE ${from.toLocaleUpperCase('fr-FR')}` : 'ORDRE REÇU';
}

/** Nom d'un chef sans son grade (« Brigadier-chef Camara » → « Camara »). */
export function chiefName(label: string): string {
  const rank = rankOf(label);
  const rest = rank !== '' ? label.trim().slice(rank.length).trim() : label.trim();
  return rest !== '' ? rest : label.trim();
}

/** Abréviations des voies, pour la ligne du téléphone (la rue se raccourcit avant tout le reste). */
const STREET_ABBR: readonly [RegExp, string][] = [
  [/\bAvenue\b/, 'Av.'], [/\bavenue\b/, 'av.'], [/\bBoulevard\b/, 'Bd'], [/\bboulevard\b/, 'bd'],
  [/\bFaubourg\b/, 'Fg'], [/\bfaubourg\b/, 'fg'], [/\bPlace\b/, 'Pl.'], [/\bplace\b/, 'pl.'],
];

/** « Avenue de la République » → « Av. de la République » ; « Boulevard Voltaire » → « Bd Voltaire ». */
export function shortStreet(place: string): string {
  let out = place;
  for (let i = 0; i < STREET_ABBR.length; i++) out = out.replace(STREET_ABBR[i]![0], STREET_ABBR[i]![1]);
  return out;
}

/** Première lettre en minuscule, sauf sigle ou nom propre en capitales (« Restez… » → « restez… », « MISTRAL » inchangé). */
function lowerFirst(s: string): string {
  if (s.length < 2) return s.toLocaleLowerCase('fr-FR');
  const second = s[1]!;
  return second === second.toLocaleUpperCase('fr-FR') && second !== second.toLocaleLowerCase('fr-FR') ? s : s[0]!.toLocaleLowerCase('fr-FR') + s.slice(1);
}

/** Caractères au-delà desquels la rue s'abrège sur la première ligne du téléphone (bande du haut, ≈ 258 px à 12,5 px). */
export const COMPACT_LINE_CHARS = 40;

/** Les premières lignes de la carte « ordre d'abord », en texte (orderHeadline). */
export interface OrderHeadline {
  /** « ORDRE DU COMMANDANT », « ORDRE DU CHEF DE GROUPE », « MA MISSION ». */
  head: string;
  /** L'ordre (« Tenir la ligne »), jamais coupé. */
  order: string;
  /** Le lieu (« Avenue de la République » ; sur le téléphone, abrégé si besoin : « Av. de la République »). */
  place: string;
  /** Distance au point (« 235 m ») ; '' sans point. */
  distance: string;
  /** Ce que fait le joueur (« Vous : restez à votre place dans la ligne, bouclier levé. ») ; '' si l'ordre suffit. */
  you: string;
  /** Téléphone, première ligne : « Tenir la ligne · Av. de la République · 235 m » (à l'écran, seule la rue peut être coupée). */
  line1: string;
  /** Téléphone, deuxième ligne : l'état du départ, sinon « Suivez Camara · 5 m », sinon ce que fait le joueur. */
  line2: string;
  /** La deuxième ligne est l'état du départ de la colonne. */
  line2Status: boolean;
}

/** Ce que lit orderHeadline dans la carte « Ma mission ». */
export type HeadlineBrief = Pick<MissionBrief, 'command' | 'instruction' | 'chief' | 'status' | 'regroup'>;

/**
 * Les premières lignes de la carte de l'exécutant, l'ordre d'abord. `compact` : version du téléphone (la rue
 * s'abrège, puis se coupe, pour que l'ordre et la distance tiennent sur la première ligne). `from` : position du
 * joueur (distance à la consigne quand il n'y a pas d'ordre d'en haut). Fonction pure.
 */
export function orderHeadline(b: HeadlineBrief, compact: boolean, from?: { x: number; z: number }): OrderHeadline {
  const ins = b.instruction;
  const c = b.command ?? null;
  let head: string;
  let order: string;
  let place: string;
  let distance = '';
  let you = '';
  if (c) {
    head = issuerTitle(c);
    order = c.text;
    place = c.place ?? '';
    distance = Number.isFinite(c.distance) ? distanceLabel(c.distance) : '';
    if (ins.title !== '') {
      const what = ins.source === 'ordre' || ins.source === 'attente' ? ins.detail : ins.title.replace(/^Tâche\s*:\s*/, '');
      if (what !== '') you = `Vous : ${lowerFirst(what.trim())}`;
    }
  } else {
    head = ins.source === 'ordre' && b.chief ? `ORDRE DU ${b.chief.role.toLocaleUpperCase('fr-FR')}` : 'MA MISSION';
    order = ins.title;
    place = '';
    if (from && ins.x !== undefined && ins.z !== undefined && ins.target !== 'none') distance = distanceLabel(Math.hypot(ins.x - from.x, ins.z - from.z));
  }
  // téléphone : l'ordre et la distance d'abord ; la rue s'abrège (« Av. », « Bd ») quand la ligne est trop longue — ce
  // qui dépasse encore est coupé à l'écran sur la rue seule (points de suspension), jamais sur l'ordre ni la distance
  let shown = place;
  const len = (p: string): number => order.length + (p !== '' ? p.length + 3 : 0) + (distance !== '' ? distance.length + 3 : 0);
  if (compact && shown !== '' && len(shown) > COMPACT_LINE_CHARS) shown = shortStreet(shown);
  const line1 = [order, shown, distance].filter((x) => x !== '').join(' · ');
  const st = typeof b.status === 'string' ? b.status : '';
  let line2 = '';
  let line2Status = false;
  if (st !== '') {
    line2 = st;
    line2Status = true;
  } else if (b.chief) {
    line2 = `${b.regroup ? 'Rejoignez' : 'Suivez'} ${chiefName(b.chief.label)}${Number.isFinite(b.chief.distance) ? ` · ${distanceLabel(b.chief.distance)}` : ''}`;
  } else if (you !== '') line2 = you;
  else if (!c && ins.detail !== '') line2 = ins.detail;
  return { head, order, place: compact ? shown : place, distance, you, line1, line2, line2Status };
}

export function createMissionCard(env: HudEnv): HudPart {
  injectStyle();
  const ctx = env.ctx;
  const root = h('div', 'hud-box hud-mis');
  root.setAttribute('aria-live', 'polite');
  const head = h('div', 'hud-mis__head');
  const cap = h('span', 'hud-cap', 'Ma mission');
  const badge = h('span', 'hud-mis__new', 'Nouvel ordre');
  head.append(cap, badge);
  // l'ordre, le lieu, la distance et la flèche vers le point
  const order = h('div', 'hud-mis__order');
  const where = h('div', 'hud-mis__where');
  const place = h('span', 'hud-mis__place');
  const dist = h('span', 'hud-mis__dist');
  const destArrow = h('span', 'hud-mis__arrow', '↑');
  where.append(place, dist, destArrow);
  const you = h('div', 'hud-mis__you');
  const detail = h('div', 'hud-mis__detail');
  const status = h('div', 'hud-mis__status');
  const chief = h('div', 'hud-mis__chief');
  const arrow = h('span', 'hud-mis__arrow', '↑');
  const chiefTxt = h('span');
  chief.append(arrow, chiefTxt);
  // détails repliés : poste, chaîne de commandement, radio
  const more = h('button', 'hud-mis__more', '▸ Détails (chaîne de commandement, radio)');
  more.type = 'button';
  more.dataset.id = 'mission-details';
  const extra = h('div', 'hud-mis__extra');
  const who = h('div', 'hud-mis__who');
  const chain = h('div', 'hud-mis__chain');
  const radio = h('div', 'hud-mis__radio');
  extra.append(who, chain, radio);
  // téléphone : deux lignes
  const l1 = h('div', 'hud-mis__l1');
  const l1Order = h('b');
  const l1Place = h('span', 'hud-mis__lp');
  const l1Dist = h('span', 'hud-mis__dist');
  const l1Arrow = h('span', 'hud-mis__arrow', '↑');
  l1.append(l1Order, l1Place, l1Dist, l1Arrow);
  const l2 = h('div', 'hud-mis__l2');
  const l2Txt = h('span');
  l2.append(l2Txt);
  const tip = h('div', 'hud-mis__tip');
  const tipClose = h('button', 'hud-mis__tipx', 'OK');
  tipClose.type = 'button';
  tip.append(h('span', undefined, 'Astuce : cette carte vous dit l’ordre reçu, où aller et qui suivre. '
    + 'Le repère jaune montre votre place ou votre chef. La radio ne garde que les messages pour votre unité.'), tipClose);
  root.append(head, order, where, you, detail, status, chief, more, extra, l1, l2, tip);

  const capB = new Txt(cap), badgeB = new Txt(badge), orderB = new Txt(order), placeB = new Txt(place), distB = new Txt(dist);
  const youB = new Txt(you), detailB = new Txt(detail), statusB = new Txt(status), chiefB = new Txt(chiefTxt);
  const whoB = new Txt(who), chainB = new Txt(chain), radioB = new Txt(radio);
  const l1OrderB = new Txt(l1Order), l1PlaceB = new Txt(l1Place), l1DistB = new Txt(l1Dist), l2B = new Txt(l2Txt);
  const badgeShown = new Shown(badge), whereShown = new Shown(where), placeShown = new Shown(place), distShown = new Shown(dist);
  const destShown = new Shown(destArrow), youShown = new Shown(you), detailShown = new Shown(detail), statusShown = new Shown(status);
  const chiefShown = new Shown(chief), extraShown = new Shown(extra), chainShown = new Shown(chain), radioShown = new Shown(radio);
  const tipShown = new Shown(tip), l1PlaceShown = new Shown(l1Place), l1DistShown = new Shown(l1Dist), l1ArrowShown = new Shown(l1Arrow);
  const l2Shown = new Shown(l2);
  const isNew = new Flag(root, 'is-new');
  const isRegroup = new Flag(root, 'is-regroup');
  const l2Status = new Flag(l2, 'is-status');
  const arrowRot = new Transform(arrow);
  const destRot = new Transform(destArrow);
  const l1Rot = new Transform(l1Arrow);
  let lastSeq = -1;
  let tipState: 'unknown' | 'show' | 'done' = 'unknown';
  let tipLeft = TIP_SECONDS;
  let open = false;
  extraShown.set(false);

  const brief = (): MissionBrief | undefined => ctx.service<MissionBrief>('session.mission');

  /** Point de l'ordre d'en haut, sinon de la consigne (null s'il n'y en a pas). */
  function destination(b: MissionBrief): { x: number; z: number } | null {
    if (b.command) return { x: b.command.x, z: b.command.z };
    const ins = b.instruction;
    return ins.x !== undefined && ins.z !== undefined && ins.target !== 'none' ? { x: ins.x, z: ins.z } : null;
  }

  more.addEventListener('click', (e) => {
    e.stopPropagation();
    open = !open;
    more.textContent = `${open ? '▾' : '▸'} Détails (chaîne de commandement, radio)`;
    extraShown.set(open);
  });

  function closeTip(): void {
    if (tipState === 'done') return;
    tipState = 'done';
    tipShown.set(false);
    try {
      const saved = ctx.save.read<Record<string, unknown>>(TIPS_SECTION, {});
      ctx.save.write(TIPS_SECTION, { ...(saved && typeof saved === 'object' ? saved : {}), missionCard: true });
    } catch {
      // sauvegarde indisponible : l'astuce reste fermée pour cette session
    }
  }
  tipClose.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTip();
  });

  function wantTip(b: MissionBrief): boolean {
    if (tipState !== 'unknown') return tipState === 'show';
    if (b.family !== 'police' || ctx.session.config?.role !== 'crs') return false;
    let seen = false;
    try {
      const saved = ctx.save.read<Record<string, unknown>>(TIPS_SECTION, {});
      seen = !!saved && typeof saved === 'object' && saved['missionCard'] === true;
    } catch {
      seen = false;
    }
    tipState = seen ? 'done' : 'show';
    return !seen;
  }

  return {
    id: MISSION_CARD_ID,
    el: root,
    order: 21,
    slot(s: HudState): HudSlot {
      return s.compact ? 'top' : 'top-right';
    },
    visible(s: HudState): boolean {
      const b = brief();
      return !!b && b.active && s.person !== null && s.profile.objectives && !s.profile.drone && s.camera !== 'tactical' && b.instruction.title !== '';
    },
    frame(dt: number, s: HudState): void {
      if (tipState === 'show') {
        tipLeft -= dt;
        if (tipLeft <= 0) closeTip();
      }
      const b = brief();
      if (!b) return;
      const c = b.chief;
      if (c) arrowRot.set(`rotate(${arrowAngle(s.yaw, s.x, s.z, c.x, c.z).toFixed(0)}deg)`);
      const d = destination(b);
      if (d) {
        const rot = `rotate(${arrowAngle(s.yaw, s.x, s.z, d.x, d.z).toFixed(0)}deg)`;
        destRot.set(rot);
        l1Rot.set(rot);
      }
    },
    tick(s: HudState): void {
      const b = brief();
      if (!b) return;
      const ins = b.instruction;
      const full = orderHeadline(b, false, s);
      const small = orderHeadline(b, true, s);
      capB.set(full.head);
      orderB.set(full.order);
      placeB.set(full.place);
      placeShown.set(full.place !== '');
      distB.set(full.distance);
      distShown.set(full.distance !== '');
      const d = destination(b);
      destShown.set(d !== null && full.distance !== '');
      whereShown.set(full.place !== '' || full.distance !== '');
      youB.set(full.you);
      youShown.set(full.you !== '');
      // détail de la consigne : sous l'ordre quand il n'est pas déjà dans « Vous : … »
      const showDetail = ins.detail !== '' && (b.command === null ? true : !(ins.source === 'ordre' || ins.source === 'attente'));
      detailB.set(ins.detail);
      detailShown.set(showDetail);
      const st = typeof b.status === 'string' ? b.status : '';
      statusB.set(st);
      statusShown.set(st !== '');
      if (b.chief) {
        chiefB.set(`${chiefText(b)} · ${distanceLabel(Math.hypot(b.chief.x - s.x, b.chief.z - s.z))}`);
        chiefShown.set(true);
      } else chiefShown.set(false);
      // détails repliés
      whoB.set(b.heading);
      chainB.set(b.chain);
      chainShown.set(b.chain !== '');
      const hidden = b.radioHidden > 0 ? ` · trafic radio masqué (${b.radioHidden})` : '';
      radioB.set(b.radioLabel + hidden);
      radioShown.set(b.radioLabel !== '' || hidden !== '');
      // téléphone : deux lignes
      l1OrderB.set(small.order);
      l1PlaceB.set(small.place !== '' ? `· ${small.place}` : '');
      l1PlaceShown.set(small.place !== '');
      l1DistB.set(small.distance !== '' ? `· ${small.distance}` : '');
      l1DistShown.set(small.distance !== '');
      l1ArrowShown.set(d !== null && small.distance !== '');
      l2B.set(small.line2);
      l2Shown.set(small.line2 !== '');
      l2Status.set(small.line2Status);
      const fresh = b.seq > 0 && ctx.clock.now - b.since < NEW_ORDER_SECONDS;
      badgeB.set(b.isOrder ? 'Nouvel ordre' : 'Nouvelle consigne');
      badgeShown.set(fresh && !b.regroup);
      if (b.seq !== lastSeq) {
        // relance l'animation de surlignage
        if (lastSeq >= 0 && fresh) {
          isNew.set(false);
          void root.offsetWidth;
          isNew.set(true);
        }
        lastSeq = b.seq;
      }
      if (!fresh) isNew.set(false);
      isRegroup.set(b.regroup);
      tipShown.set(wantTip(b));
    },
    reset(): void {
      lastSeq = -1;
      tipLeft = TIP_SECONDS;
      if (tipState === 'show') tipState = 'unknown';
    },
  };
}
