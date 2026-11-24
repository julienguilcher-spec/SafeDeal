/* =====================================================================================
 * HUD — marqueurs 3D projetés à l'écran (seulement si ctx.view existe et si Settings.hudMarkers) :
 *   objectifs localisés, incident confié au joueur, suspect désigné (incident de type « suspect ») — 6 au plus ;
 *   « désignation » (ordres directs, 1) : là où Entrée enverra l'ordre prêt, nommé par son verbe (« Bloquer »), ou un
 *     chevron au-dessus de la personne désignée (« Interpeller ») ;
 *   « ordres » (3 au plus, le plus ancien estompé) : « MISTRAL 1 — Bloquer » au point de chaque ordre du joueur en
 *     cours, qui suit la personne d'une interpellation ; « MISTRAL 1 ✓ » 3 s quand c'est fait, puis plus rien ;
 *   repères posés par d'autres modules par le service 'hud.marks' (fourgons cellulaires « CELLULAIRE 1 · 3/8 »…), les
 *     4 plus proches.
 * La liste des cibles est relue à 8 Hz ; la projection, par transformation, suit l'image.
 * Hors champ, le marqueur est ramené sur le bord de l'écran (flèche de bord).
 * ===================================================================================== */

import type { GameContext } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { HudSlot, IncidentsApi } from '@/core/extensions';
import { Attr, Flag, Shown, Transform, Txt, h } from '../core/dom';
import { distanceLabel } from '../core/format';
import type { NaturalOrder } from '../command/direct/natural';
import { REFUS } from '../command/direct/caps';
import type { Ticket } from '../command/direct/tickets';
import { VERB_WORDS } from '../command/direct/words';
import { touchScale } from './layout';
import type { HudEnv, HudPart, HudState } from './types';

/** Objectifs, incident confié et suspects : 6 au plus (les objectifs en prennent 4 au plus). */
export const MAX_MARKERS = 6;

export interface Projected {
  x: number;
  y: number;
  /** Devant la caméra. */
  front: boolean;
}

/**
 * Projette un point du monde à l'écran avec les matrices d'une caméra en perspective (tableaux
 * de 16 nombres, colonnes d'abord, comme THREE.Matrix4.elements) : `view` = matrixWorldInverse,
 * `proj` = projectionMatrix. Fonction pure.
 */
export function projectPoint(
  view: ArrayLike<number>, proj: ArrayLike<number>, x: number, y: number, z: number, width: number, height: number, out: Projected,
): Projected {
  const vx = view[0]! * x + view[4]! * y + view[8]! * z + view[12]!;
  const vy = view[1]! * x + view[5]! * y + view[9]! * z + view[13]!;
  const vz = view[2]! * x + view[6]! * y + view[10]! * z + view[14]!;
  const vw = view[3]! * x + view[7]! * y + view[11]! * z + view[15]!;
  const cx = proj[0]! * vx + proj[4]! * vy + proj[8]! * vz + proj[12]! * vw;
  const cy = proj[1]! * vx + proj[5]! * vy + proj[9]! * vz + proj[13]! * vw;
  const cw = proj[3]! * vx + proj[7]! * vy + proj[11]! * vz + proj[15]! * vw;
  const front = cw > 1e-4;
  // derrière la caméra, diviser par |w| garde le bon côté : une cible derrière à droite reste à droite
  const w = front ? cw : Math.max(1e-4, -cw);
  const nx = cx / w;
  const ny = cy / w;
  out.x = (nx * 0.5 + 0.5) * width;
  out.y = (-ny * 0.5 + 0.5) * height;
  out.front = front;
  return out;
}

/** Ramène un point dans le cadre (marge en px) ; true s'il a fallu le ramener. */
export interface FrameMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function clampToFrame(p: Projected, width: number, height: number, m: FrameMargins): boolean {
  const cx = width * 0.5;
  const cy = height * 0.5;
  let dx = p.x - cx;
  let dy = p.y - cy;
  const inside = p.front && p.x >= m.left && p.x <= width - m.right && p.y >= m.top && p.y <= height - m.bottom;
  if (inside) return false;
  if (!p.front && Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1; // exactement derrière : vers le bas
  // prolonge la direction (depuis le centre de l'écran) jusqu'au bord du cadre
  let scale = Infinity;
  if (dx < 0) scale = Math.min(scale, (cx - m.left) / -dx);
  else if (dx > 0) scale = Math.min(scale, (cx - m.right) / dx);
  if (dy < 0) scale = Math.min(scale, (cy - m.top) / -dy);
  else if (dy > 0) scale = Math.min(scale, (cy - m.bottom) / dy);
  if (!Number.isFinite(scale)) scale = 0;
  dx *= scale;
  dy *= scale;
  p.x = cx + dx;
  p.y = cy + dy;
  return true;
}

// ───────────────────────────── repères des ordres directs et des autres modules ─────────────────────────────

/** Service des repères posés par les autres modules (fourgons cellulaires : P15). */
export const HUD_MARKS_SERVICE = 'hud.marks';
/** Repères des ordres directs : désignation (1), ordres en cours (3), repères des modules (4). */
export const MAX_ORDER_MARKS = 3;
export const MAX_MODULE_MARKS = 4;
/** « ✓ » montré (s) quand l'ordre est fait, puis le repère disparaît. */
export const DONE_MARK_TIME = 3;
/** Une désignation à moins de 3 m du joueur (« Confier », « Faire venir le fourgon ici ») n'a pas de repère. */
const NEAR_SELF = 3;

/** Un repère posé par un module (« CELLULAIRE 1 · 3/8 » au-dessus d'un fourgon). */
export interface HudMark {
  x: number;
  z: number;
  /** Personne (ou conducteur) suivie : sa position est relue à chaque image ; 0 : le point. */
  personId?: number;
  label: string;
  /** Genre, pour la couleur (« cellulaire »…) ; 'marque' par défaut. */
  kind?: string;
}

/** Service 'hud.marks' : set(id, repère) pose ou met à jour, remove(id) retire. */
export interface HudMarksApi {
  set(id: string, mark: HudMark): void;
  remove(id: string): void;
  list(): readonly (HudMark & { id: string })[];
  clear(): void;
}

/** Repères posés par les modules, propres à la session (une nouvelle session les oublie). */
export class HudMarks implements HudMarksApi {
  private readonly marks = new Map<string, HudMark & { id: string }>();
  private session: unknown = null;

  constructor(private readonly ctx: GameContext) {}

  private fresh(): void {
    const s = this.ctx.session.config;
    if (s !== this.session) {
      this.session = s;
      this.marks.clear();
    }
  }

  set(id: string, mark: HudMark): void {
    this.fresh();
    if (!Number.isFinite(mark.x) || !Number.isFinite(mark.z)) return;
    this.marks.set(id, { ...mark, id });
  }

  remove(id: string): void {
    this.marks.delete(id);
  }

  list(): readonly (HudMark & { id: string })[] {
    this.fresh();
    return Array.from(this.marks.values());
  }

  clear(): void {
    this.marks.clear();
  }
}

/** Le service 'hud.marks' de la partie (créé et publié au premier appel). */
export function ensureHudMarks(ctx: GameContext): HudMarksApi {
  const cur = ctx.service<HudMarksApi>(HUD_MARKS_SERVICE);
  if (cur && typeof cur.set === 'function') return cur;
  const m = new HudMarks(ctx);
  ctx.provide(HUD_MARKS_SERVICE, m);
  return m;
}

/** Repère calculé (désignation, ordre, module). */
export interface WorldMark {
  kind: 'designation' | 'designation-person' | 'ordre' | 'ordre-ok' | 'marque' | string;
  label: string;
  x: number;
  z: number;
  personId: number;
  /** Le plus ancien des ordres montrés : estompé. */
  old: boolean;
}

/** Ce que les repères lisent du service 'command.direct' (ui/command/direct/runtime.ts), vu par ses méthodes. */
interface DirectLike {
  ready(): NaturalOrder | null;
  readonly tickets: readonly Ticket[];
}
/** Ce que les repères lisent du service 'ui.command' (CommandCore) : le point de l'ordre du joueur à une unité. */
interface CoreLike {
  playerOrderRecord(squadId: number): { geom: { x: number; z: number } | null; targetId: number; issuedAt: number } | null;
}

/** Verbes dont le ticket n'a pas de point à montrer (le joueur lui-même, son interpellé, un départ). */
const NO_POINT_VERBS: ReadonlySet<string> = new Set(['avec_moi', 'rien', 'confier', 'remettre', 'emmener', 'partir', 'venir', 'faire_venir', 'tenir', 'cesser', 'libre', 'tortue']);
/** Verbes qui suivent une personne (le chevron reste sur elle). */
const PERSON_VERBS: ReadonlySet<string> = new Set(['interpeller', 'constater', 'avec_moi', 'secours']);

/**
 * Repères des ordres directs à cet instant : la désignation (là où Entrée enverra l'ordre prêt), puis les ordres du
 * joueur en cours (3 au plus, les plus récents ; le plus ancien estompé). Lecture seule, sans DOM.
 */
export function directMarks(ctx: GameContext, now: number): WorldMark[] {
  const out: WorldMark[] = [];
  const direct = ctx.service<DirectLike>('command.direct');
  const core = ctx.service<CoreLike>('ui.command');
  const me = ctx.player.person();
  if (!direct || typeof direct.ready !== 'function' || !me) return out;
  const nat = direct.ready();
  // la désignation : seulement quand un appui fait quelque chose (pas le ciel, pas une ligne refusée) ; un point trop
  // loin est montré aussi (le joueur voit ce que la carte ouvrira)
  if (nat && nat.rule !== 'i' && (nat.enabled || nat.legalFirst || nat.lock === REFUS.tropLoin) && (nat.who !== null || nat.rule === 'a')) {
    const person = nat.personId !== 0 && PERSON_VERBS.has(nat.verb) ? nat.personId : 0;
    if (person !== 0 || Math.hypot(nat.x - me.x, nat.z - me.z) >= NEAR_SELF) {
      const label = nat.rule === 'a' && nat.whoShort !== '' ? nat.whoShort : VERB_WORDS[nat.verb].label;
      out.push({ kind: person !== 0 ? 'designation-person' : 'designation', label, x: nat.x, z: nat.z, personId: person, old: false });
    }
  }
  if (!core || typeof core.playerOrderRecord !== 'function') return out;
  const live: { t: Ticket; x: number; z: number; personId: number }[] = [];
  for (const t of direct.tickets) {
    if (t.state === 'remplace' || t.state === 'refuse' || NO_POINT_VERBS.has(t.verb)) continue;
    if (t.state === 'en_place' && now - t.since >= DONE_MARK_TIME) continue;
    const r = core.playerOrderRecord(t.squadId);
    if (!r || r.issuedAt + 1e-6 < t.issuedAt) continue;
    const personId = (t.verb === 'interpeller' || t.verb === 'constater') && r.targetId > 0 ? r.targetId : 0;
    if (!r.geom && personId === 0) continue;
    live.push({ t, x: r.geom ? r.geom.x : 0, z: r.geom ? r.geom.z : 0, personId });
  }
  live.sort((a, b) => b.t.issuedAt - a.t.issuedAt || a.t.squadId - b.t.squadId);
  const shown = live.slice(0, MAX_ORDER_MARKS);
  for (let i = 0; i < shown.length; i++) {
    const e = shown[i]!;
    const done = e.t.state === 'en_place';
    const label = done ? `${e.t.who} ✓` : e.t.state === 'bloque' ? `${e.t.who} — bloqué` : `${e.t.who} — ${VERB_WORDS[e.t.verb].label}`;
    out.push({ kind: done ? 'ordre-ok' : 'ordre', label, x: e.x, z: e.z, personId: e.personId, old: shown.length > 1 && i === shown.length - 1 });
  }
  return out;
}

/** Repères des modules ('hud.marks') : les 4 plus proches du joueur. */
export function moduleMarks(ctx: GameContext, x: number, z: number): WorldMark[] {
  const api = ctx.service<HudMarksApi>(HUD_MARKS_SERVICE);
  if (!api || typeof api.list !== 'function') return [];
  return api.list()
    .map((m) => ({ m, d: Math.hypot(m.x - x, m.z - z) }))
    .sort((a, b) => a.d - b.d || (a.m.id < b.m.id ? -1 : a.m.id > b.m.id ? 1 : 0))
    .slice(0, MAX_MODULE_MARKS)
    .map(({ m }) => ({ kind: m.kind ?? 'marque', label: m.label, x: m.x, z: m.z, personId: m.personId ?? 0, old: false }));
}

const STYLE_ID = 'hud-markers-direct-style';

function ensureMarkerStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.hud-marker[data-kind="designation"] .hud-marker__pin::before{inset:1px;background:transparent;border:2.5px solid #9fd0ff;border-radius:50%;transform:none;box-shadow:0 0 0 1.5px rgba(0,0,0,.55)}
.hud-marker[data-kind="designation-person"] .hud-marker__pin::before{inset:0;background:#9fd0ff;border-radius:0;transform:none;box-shadow:none;clip-path:polygon(0 0,50% 55%,100% 0,100% 40%,50% 100%,0 40%)}
.hud-marker[data-kind="designation"] .hud-marker__label,.hud-marker[data-kind="designation-person"] .hud-marker__label{color:#cfe6ff}
.hud-marker[data-kind="ordre"] .hud-marker__pin::before{background:#58a6ff}
.hud-marker[data-kind="ordre-ok"] .hud-marker__pin::before{background:#40c878}
.hud-marker[data-kind="ordre-ok"] .hud-marker__label{color:#9ff0c0}
.hud-marker[data-kind="cellulaire"] .hud-marker__pin::before{background:#c9a0ff}
.hud-marker[data-kind="marque"] .hud-marker__pin::before{background:#c9a0ff}
.hud-marker--wide{width:180px;margin-left:-90px}
.hud-marker--wide .hud-marker__label{max-width:180px}
.hud-marker.is-old{opacity:.55}
`;
  document.head.appendChild(s);
}

interface Target {
  kind: string;
  label: string;
  x: number;
  z: number;
  /** Personne suivie (suspect, interpellé) : sa position est relue à chaque image. */
  personId: number;
  old: boolean;
}

interface View {
  el: HTMLElement;
  move: Transform;
  shown: Shown;
  kind: Attr;
  edge: Flag;
  old: Flag;
  wide: Flag;
  label: Txt;
}

/** Tous les marqueurs : objectifs et incidents (6), désignation (1), ordres (3), repères des modules (4). */
const ALL_MARKERS = MAX_MARKERS + 1 + MAX_ORDER_MARKS + MAX_MODULE_MARKS;
/** Repères dont l'étiquette est longue (« MISTRAL 1 — Bloquer », « CELLULAIRE 1 · 3/8 ») : plus larges. */
const WIDE_KINDS: ReadonlySet<string> = new Set(['designation', 'designation-person', 'ordre', 'ordre-ok', 'cellulaire', 'marque']);

export function createMarkers(env: HudEnv): HudPart {
  const ctx: GameContext = env.ctx;
  ensureMarkerStyle();
  // le service des repères des modules existe dès que le HUD existe (les modules le cherchent au moment même)
  ensureHudMarks(ctx);
  const root = h('div', 'hud-markers');
  const views: View[] = [];
  for (let i = 0; i < ALL_MARKERS; i++) {
    const m = h('div', 'hud-marker');
    m.hidden = true;
    const label = h('span', 'hud-marker__label');
    m.append(h('span', 'hud-marker__pin'), label);
    root.append(m);
    views.push({
      el: m, move: new Transform(m), shown: new Shown(m), kind: new Attr(m, 'data-kind'), edge: new Flag(m, 'is-edge'), old: new Flag(m, 'is-old'),
      wide: new Flag(m, 'hud-marker--wide'), label: new Txt(label),
    });
  }
  const targets: Target[] = [];
  let count = 0;
  const projected: Projected = { x: 0, y: 0, front: true };
  const margins: FrameMargins = { left: 44, right: 44, top: 110, bottom: 130 };

  function target(i: number): Target {
    return targets[i] ?? (targets[i] = { kind: 'objectif', label: '', x: 0, z: 0, personId: 0, old: false });
  }

  function push(w: WorldMark): void {
    if (count >= ALL_MARKERS) return;
    const t = target(count++);
    t.kind = w.kind;
    t.label = w.label;
    t.x = w.x;
    t.z = w.z;
    t.personId = w.personId;
    t.old = w.old;
  }

  return {
    id: 'markers',
    el: root,
    order: 0,
    slot(): HudSlot | null {
      return null;
    },
    visible(s: HudState): boolean {
      return ctx.view !== null && ctx.settings.values.hudMarkers && s.camera !== 'tactical';
    },
    tick(s: HudState): void {
      count = 0;
      const store = env.objectives;
      for (let i = 0; i < store.list.length && count < MAX_MARKERS - 2; i++) {
        const o = store.list[i]!;
        if (o.state !== 'actif' || o.x === undefined || o.z === undefined) continue;
        const t = target(count++);
        t.kind = o.id === store.tracked ? 'objectif' : 'objectif2';
        t.x = o.x;
        t.z = o.z;
        t.personId = 0;
        t.old = false;
        t.label = distanceLabel(Math.hypot(o.x - s.x, o.z - s.z));
      }
      const incidents = ctx.service<IncidentsApi>(EXT.incidents);
      if (incidents) {
        const mine = incidents.playerIncidentId !== 0 ? incidents.get(incidents.playerIncidentId) : undefined;
        if (mine && count < MAX_MARKERS) {
          const t = target(count++);
          t.kind = mine.kind === 'suspect' ? 'suspect' : 'incident';
          t.x = mine.x;
          t.z = mine.z;
          t.personId = mine.targetKind === 'person' ? mine.targetId : 0;
          t.old = false;
          t.label = `${mine.label} · ${distanceLabel(Math.hypot(mine.x - s.x, mine.z - s.z))}`;
        }
        const list = incidents.list;
        for (let i = 0; i < list.length && count < MAX_MARKERS; i++) {
          const inc = list[i]!;
          if (inc.kind !== 'suspect' || inc === mine) continue;
          if (inc.state === 'resolu' || inc.state === 'echoue') continue;
          const t = target(count++);
          t.kind = 'suspect';
          t.x = inc.x;
          t.z = inc.z;
          t.personId = inc.targetKind === 'person' ? inc.targetId : 0;
          t.old = false;
          t.label = `Suspect · ${distanceLabel(Math.hypot(inc.x - s.x, inc.z - s.z))}`;
        }
      }
      // ordres directs (désignation, ordres en cours) puis repères des modules : jamais une erreur qui éteint le HUD
      try {
        for (const w of directMarks(ctx, ctx.clock.now)) push(w);
      } catch (err) {
        console.error('[hud] repères des ordres', err);
      }
      for (const w of moduleMarks(ctx, s.x, s.z)) push(w);
      for (let i = 0; i < ALL_MARKERS; i++) {
        const v = views[i]!;
        v.shown.set(i < count);
        if (i < count) {
          const t = targets[i]!;
          v.kind.set(t.kind);
          v.label.set(t.label);
          v.old.set(t.old);
          v.wide.set(WIDE_KINDS.has(t.kind));
        }
      }
    },
    frame(_dt: number, s: HudState): void {
      const view = ctx.view;
      if (!view || count === 0) return;
      const cam = view.camera;
      const viewM = cam.matrixWorldInverse.elements;
      const projM = cam.projectionMatrix.elements;
      // cadre utile : hors des panneaux du HUD et, en tactile, hors des commandes à l'écran
      const compact = s.compact;
      if (s.touch === 'none') {
        // le repère est dessiné 30 px au-dessus du point projeté : la marge haute en tient compte
        margins.left = margins.right = compact ? 30 : 44;
        margins.top = compact ? 124 : 150;
        margins.bottom = compact ? 96 : 130;
      } else {
        const ts = touchScale(s.width, s.height);
        margins.left = 176 * ts;
        margins.right = (s.touch === 'vehicule' ? 290 : 214) * ts;
        margins.top = 124 * ts + 30;
        margins.bottom = 80 * ts;
      }
      for (let i = 0; i < count; i++) {
        const t = targets[i]!;
        let x = t.x;
        let z = t.z;
        if (t.personId !== 0) {
          const person = ctx.people.get(t.personId);
          if (person) {
            x = person.x;
            z = person.z;
          }
        }
        const y = ctx.world.heightAt(x, z) + (t.personId !== 0 ? 2.25 : 2.6);
        projectPoint(viewM, projM, x, y, z, s.width, s.height, projected);
        const edge = clampToFrame(projected, s.width, s.height, margins);
        const v = views[i]!;
        v.edge.set(edge);
        v.move.set(`translate3d(${projected.x.toFixed(1)}px,${projected.y.toFixed(1)}px,0)`);
      }
    },
    reset(): void {
      count = 0;
      for (const v of views) v.shown.set(false);
    },
  };
}
