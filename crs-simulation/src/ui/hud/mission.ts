/* =====================================================================================
 * HUD — carte « Ma mission » (service 'session.mission') : pour le joueur qui reçoit les ordres ou une tâche.
 *
 *   MA MISSION                                                  [NOUVEL ORDRE]
 *   CRS — Gardien stagiaire
 *   Groupe MISTRAL 1 ALFA — Section MISTRAL 1 — Cie MISTRAL
 *   Ordre de MISTRAL : Barrer la rue — rue de Turbigo                 1,2 km
 *   Tenir la ligne, rue de Turbigo                                      12 m
 *   Restez à votre place dans la ligne, bouclier levé.
 *   ⏱ Embarquement : 5 / 7 à bord — départ dès que tout le monde est à bord
 *   ↗ Suivez votre chef de groupe : Brigadier-chef Martin · 8 m
 *   Radio : votre groupe, votre section… · trafic masqué (5)
 *
 * Zone : haut droite, sous les objectifs ; sur écran bas, en haut au centre en version réduite : au plus trois lignes
 * (l'ordre d'en haut, la consigne, l'état du départ ; le chef quand il n'y a ni ordre d'en haut ni départ).
 * À la première session d'un CRS, une astuce explique la carte (fermée d'un geste ou au bout de 30 s, mémorisée
 * dans la sauvegarde, section « hud.tips »).
 * ===================================================================================== */

import type { HudSlot } from '@/core/extensions';
import type { MissionBrief } from '@/gameplay/session/mission-api';
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
.hud-mis__who { font-size: 12px; font-weight: 650; color: #dfe6f1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hud-mis__new { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #10141c;
  background: var(--ui-yellow, #ffd60a); border-radius: 4px; padding: 1px 5px; text-shadow: none; white-space: nowrap; }
.hud-mis__chain { font-size: 11.5px; color: #b9c5d9; line-height: 1.3; }
.hud-mis__task { display: grid; grid-template-columns: 1fr auto; column-gap: 8px; align-items: baseline; }
.hud-mis__title { font-size: 14px; font-weight: 700; line-height: 1.3; }
.hud-mis__dist { font-size: 12px; font-weight: 700; color: var(--ui-yellow, #ffd60a); white-space: nowrap; }
.hud-mis__detail { font-size: 12.5px; color: #e3e9f3; line-height: 1.3; }
.hud-mis__chief { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #dfe6f1; }
.hud-mis__arrow { display: inline-block; width: 14px; text-align: center; font-weight: 800; color: var(--ui-yellow, #ffd60a); flex: none; }
.hud-mis__radio { font-size: 11px; color: #93a1b8; }
.hud-mis__cmd { display: grid; grid-template-columns: 1fr auto; column-gap: 8px; align-items: baseline; font-size: 12.5px; line-height: 1.3;
  padding: 3px 6px; border-radius: 5px; background: rgba(255, 214, 10, .1); }
.hud-mis__cmdtxt { color: #f3f6fb; min-width: 0; }
.hud-mis__cmdtxt b { color: var(--ui-yellow, #ffd60a); font-weight: 750; }
.hud-mis__status { font-size: 12.5px; font-weight: 650; color: #9fe3ff; line-height: 1.3; }
.hud-mis__status::before { content: '⏱ '; }
.hud-mis__tip { margin-top: 3px; padding: 6px 8px; border-radius: 6px; background: rgba(255, 214, 10, .14); border: 1px solid rgba(255, 214, 10, .4);
  font-size: 12px; line-height: 1.35; display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: start; }
.hud-mis__tipx { pointer-events: auto; cursor: pointer; font: inherit; font-weight: 700; color: #10141c; background: var(--ui-yellow, #ffd60a);
  border: 0; border-radius: 4px; padding: 1px 7px; text-shadow: none; }
.hud-mis.is-new { animation: hud-mis-flash 1.4s ease-out 2; }
.hud-mis.is-regroup { border-left-color: #ff9f0a; }
.hud-mis.is-regroup .hud-mis__title { color: #ffc46b; }
@keyframes hud-mis-flash { 0% { box-shadow: 0 0 0 0 rgba(255, 214, 10, .85); } 100% { box-shadow: 0 0 0 10px rgba(255, 214, 10, 0); } }
.ui-hud[data-compact="1"] .hud-mis { width: min(380px, 100%); padding: 4px 8px 5px; gap: 1px; }
.ui-hud[data-compact="1"] .hud-mis__head, .ui-hud[data-compact="1"] .hud-mis__tip { display: none; }
.ui-hud[data-compact="1"] .hud-mis__who, .ui-hud[data-compact="1"] .hud-mis__chain, .ui-hud[data-compact="1"] .hud-mis__detail, .ui-hud[data-compact="1"] .hud-mis__radio { display: none; }
.ui-hud[data-compact="1"] .hud-mis__title { font-size: 12.5px; }
.ui-hud[data-compact="1"] .hud-mis__cmd { padding: 0 4px; font-size: 11.5px; }
.ui-hud[data-compact="1"] .hud-mis__cmdtxt, .ui-hud[data-compact="1"] .hud-mis__title, .ui-hud[data-compact="1"] .hud-mis__status,
.ui-hud[data-compact="1"] .hud-mis__chief { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.ui-hud[data-compact="1"] .hud-mis__status { font-size: 11.5px; }
.ui-hud[data-compact="1"] .hud-mis.has-more .hud-mis__chief { display: none; }
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

export function createMissionCard(env: HudEnv): HudPart {
  injectStyle();
  const ctx = env.ctx;
  const root = h('div', 'hud-box hud-mis');
  root.setAttribute('aria-live', 'polite');
  const head = h('div', 'hud-mis__head');
  const who = h('span', 'hud-mis__who');
  const badge = h('span', 'hud-mis__new', 'Nouvel ordre');
  head.append(h('span', 'hud-cap', 'Ma mission'), badge);
  const chain = h('div', 'hud-mis__chain');
  const task = h('div', 'hud-mis__task');
  const title = h('span', 'hud-mis__title');
  const dist = h('span', 'hud-mis__dist');
  task.append(title, dist);
  const detail = h('div', 'hud-mis__detail');
  const chief = h('div', 'hud-mis__chief');
  const arrow = h('span', 'hud-mis__arrow', '↑');
  const chiefTxt = h('span');
  chief.append(arrow, chiefTxt);
  const radio = h('div', 'hud-mis__radio');
  const cmd = h('div', 'hud-mis__cmd');
  const cmdFrom = h('b');
  const cmdRest = h('span');
  const cmdTxt = h('span', 'hud-mis__cmdtxt');
  cmdTxt.append(cmdFrom, cmdRest);
  const cmdDist = h('span', 'hud-mis__dist');
  cmd.append(cmdTxt, cmdDist);
  const status = h('div', 'hud-mis__status');
  const tip = h('div', 'hud-mis__tip');
  const tipClose = h('button', 'hud-mis__tipx', 'OK');
  tipClose.type = 'button';
  tip.append(h('span', undefined, 'Astuce : cette carte vous dit à qui obéir, qui suivre et quoi faire. '
    + 'Le repère jaune montre votre place ou votre chef. La radio ne garde que les messages pour votre unité.'), tipClose);
  root.append(head, who, chain, cmd, task, detail, status, chief, radio, tip);

  const whoB = new Txt(who), chainB = new Txt(chain), titleB = new Txt(title), distB = new Txt(dist), detailB = new Txt(detail);
  const chiefB = new Txt(chiefTxt), radioB = new Txt(radio), badgeB = new Txt(badge);
  const badgeShown = new Shown(badge), chainShown = new Shown(chain), detailShown = new Shown(detail), chiefShown = new Shown(chief);
  const radioShown = new Shown(radio), tipShown = new Shown(tip), distShown = new Shown(dist);
  const isNew = new Flag(root, 'is-new');
  const isRegroup = new Flag(root, 'is-regroup');
  const hasMore = new Flag(root, 'has-more');
  const cmdFromB = new Txt(cmdFrom), cmdRestB = new Txt(cmdRest), cmdDistB = new Txt(cmdDist), statusB = new Txt(status);
  const cmdShown = new Shown(cmd), statusShown = new Shown(status);
  const arrowRot = new Transform(arrow);
  let lastSeq = -1;
  let tipState: 'unknown' | 'show' | 'done' = 'unknown';
  let tipLeft = TIP_SECONDS;

  const brief = (): MissionBrief | undefined => ctx.service<MissionBrief>('session.mission');

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
      const c = b?.chief;
      if (c) arrowRot.set(`rotate(${arrowAngle(s.yaw, s.x, s.z, c.x, c.z).toFixed(0)}deg)`);
    },
    tick(s: HudState): void {
      const b = brief();
      if (!b) return;
      const ins = b.instruction;
      whoB.set(b.heading);
      chainB.set(b.chain);
      chainShown.set(b.chain !== '');
      titleB.set(ins.title);
      detailB.set(ins.detail);
      detailShown.set(ins.detail !== '');
      // pas deux fois la même distance : quand la consigne vise le point de l'ordre d'en haut, sa ligne la porte déjà
      const cmdPoint = b.command ?? null;
      const samePoint = !!cmdPoint && ins.x !== undefined && ins.z !== undefined && Math.hypot(ins.x - cmdPoint.x, ins.z - cmdPoint.z) < 30;
      if (ins.x !== undefined && ins.z !== undefined && ins.target !== 'none' && !samePoint) {
        distB.set(distanceLabel(Math.hypot(ins.x - s.x, ins.z - s.z)));
        distShown.set(true);
      } else distShown.set(false);
      if (b.chief) {
        chiefB.set(`${chiefText(b)} · ${distanceLabel(Math.hypot(b.chief.x - s.x, b.chief.z - s.z))}`);
        chiefShown.set(true);
      } else chiefShown.set(false);
      // ordre d'en haut (qui, quoi, où, distance) et état du départ de la colonne (champs lus prudemment)
      const c = b.command ?? null;
      if (c) {
        cmdFromB.set(`Ordre de ${c.from}${c.by ? ` (${c.by})` : ''} : `);
        cmdRestB.set(`${c.text}${c.place ? ` — ${c.place}` : ''}`);
        cmdDistB.set(distanceLabel(Math.hypot(c.x - s.x, c.z - s.z)));
      }
      cmdShown.set(c !== null);
      const st = typeof b.status === 'string' ? b.status : '';
      statusB.set(st);
      statusShown.set(st !== '');
      hasMore.set(c !== null || st !== '');
      const hidden = b.radioHidden > 0 ? ` · trafic radio masqué (${b.radioHidden})` : '';
      radioB.set(b.radioLabel + hidden);
      radioShown.set(b.radioLabel !== '' || hidden !== '');
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
