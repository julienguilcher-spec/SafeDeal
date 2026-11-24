// Robot du commandant en « Missions spéciales » (retour du joueur : « je jouais commandant, en mode mission… je pouvais
// donner zéro ordre, ils ne suivaient pas, la BRAV-M ne bougeait pas »). Il rejoue exactement cela :
//   1. lancement depuis la fiche de la mission sur la page d'accueil (pickMission puis buildSessionConfig) ;
//   2. trajet depuis la caserne, de l'une des trois façons du joueur :
//        'passager'  il monte à la place passager de son véhicule de commandement, l'IA conduit ;
//        'volant'    il prend le volant de ce véhicule et conduit lui-même le long des rues jusqu'au point ;
//        'devant'    il descend et part seul devant la colonne : à pied si le lieu est proche, sinon au volant ;
//   3. dès l'arrivée (début de la mission) et pendant trois minutes, toutes les dix secondes, il commande comme un
//      joueur : bloc « ORDRES » (« Suivez-moi à pied », « Suivez-moi en véhicules », « Secours ici »), roue d'ordres
//      (F), proposition de l'adjoint (P), carte de commandement (Tab) : chacune des six intentions avec la proposition
//      de la fiche et « Donner l'ordre », la BRAV-M (« Envoyer », « vers moi ») et « Toute la compagnie » (T).
// Pour chaque tentative : acceptée ou refusée (texte), délai jusqu'au premier mouvement d'un agent de l'unité, ce que
// fait chaque unité 5 s, 20 s et 60 s plus tard, où elle est, et l'étape de la journée, de la colonne et de la mission.
// Foule allégée (300 personnes au plus) pour que chaque mission tienne en quelques minutes.
import type { GameContext, GameSystem, ModuleFactory, OrderType, Person, SessionConfig, Squad, SquadOrder, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createSystems as env } from '@/env';
import { createWorldQuerySystems } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import { createSystems as crowd } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as medics } from '@/sim/roles/medics';
import { createSystems as session, JOURNEE_SERVICE } from '@/gameplay/session';
import type { JourneeApi } from '@/gameplay/session';
import { createSystems as patrols } from '@/gameplay/patrols';
import { createSystems as commissariats } from '@/gameplay/commissariats';
import { createSystems as missions, missionConfig } from '@/gameplay/missions';
import type { MissionsApi } from '@/gameplay/missions';
import { MISSIONS } from '@/gameplay/missions/catalog';
import { createObjectives } from '@/ui/core/objectives';
import { pickMission } from '@/ui/screens/home-panes-a';
import type { HomeModel } from '@/ui/screens/home';
import { buildSessionConfig, defaultDraft, sanitizeDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { readMissions } from '@/ui/screens/services';
import { createSystems as maps } from '@/ui/maps';
import { createSystems as command } from '@/ui/command';
import type { CommandCore } from '@/ui/command';
import type { MapCanvas } from '@/ui/maps/mapCanvas';
import { defaultWho, proposeWho, whoEnvFromCore, wholeCandidate } from '@/ui/command/bestUnit';
import type { CardEnv, CardLine, SendEnv, WhoCandidate } from '@/ui/command/cardTypes';
import { buildCard, intentCandidates } from '@/ui/command/intents';
import { cardEnvFromCore, pointRepere } from '@/ui/command/reperes';
import { sendCardLine } from '@/ui/command/sendLine';
import { requestRescueAtPlayer } from '@/ui/command/quickActions';
import { TacticalMap } from '@/ui/command/tacticalMap';
import { TacticalState } from '@/ui/command/tacticalState';

const objectives: ModuleFactory = () => [{ id: 'test.objectives', order: 0, provide(ctx: GameContext) { ctx.provide(EXT.objectives, createObjectives()); } } as GameSystem];
const world: ModuleFactory = () => createWorldQuerySystems({ source: 'paris' });
// PLAYTEST_STATIONS=1 : partie complète comme dans main.ts — patrouilles et commissariats (véhicules garés en réserve,
// places réservées) entre la session et les missions
const STATIONS = process.env.PLAYTEST_STATIONS === '1' ? [patrols, commissariats] : [];
export const SIM = [env, world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, medics, session, ...STATIONS, missions, objectives, maps, command];

export type Arrival = 'passager' | 'volant' | 'devant';
export const ARRIVALS: readonly Arrival[] = ['passager', 'volant', 'devant'];
/** Foule allégée (personnes). */
const LIGHT_CROWD = 300;
/** Attente maximale du début de la mission (s de jeu). */
const TRAVEL_LIMIT = 1300;
/** Durée jouée après l'arrivée (s). */
const PLAY = 192;
/**
 * Essais retirés du plan (PLAYTEST_SANS=42,62 : secondes du plan) — pour mesurer la suite quand un ordre du robot met
 * lui-même fin à la partie (« Repousser la foule » sur une veillée pacifique : mission échouée, à juste titre).
 */
const SKIP: ReadonlySet<number> = new Set((process.env['PLAYTEST_SANS'] ?? '').split(',').filter((x) => x !== '').map(Number));
/** En deçà, le joueur qui part devant y va à pied (m). */
const WALK_AHEAD = 1500;

interface PoliceCommandLike {
  convoyOf(id: number): { stage: string; awaitingPlayer?: boolean } | null;
  proposals: readonly { id: number; text: string; executable: boolean; saidAt: number }[];
  accept(id: number): boolean;
  special(id: number): { stage: string; order: string } | null;
}

/** Ce que fait la fiche « Lancer la mission » de l'accueil (Missions spéciales). */
export function launchFromSheet(ctx: GameContext, id: string): SessionConfig {
  const draft: ScenarioDraft = defaultDraft();
  const model = {
    draft,
    update(patch: Partial<ScenarioDraft>) { Object.assign(draft, sanitizeDraft({ ...draft, ...patch }, draft)); },
    replace(next: ScenarioDraft) { Object.assign(draft, sanitizeDraft(next, draft)); },
  } as unknown as HomeModel;
  const catalog = readMissions({ catalog: MISSIONS.map((m) => ({ id: m.id, title: m.title, roles: [m.role, ...m.altRoles], type: m.type, difficulty: m.difficulty, summary: m.pitch, place: m.place, config: missionConfig(m, ctx.world) })) });
  pickMission(model, catalog.find((m) => m.id === id)!);
  return buildSessionConfig(draft);
}

export function walk(ctx: GameContext, me: Person, x: number, z: number, dist: number, path: number[]): void {
  if (me.vehicleId !== 0 || Math.hypot(x - me.x, z - me.z) < 1) return;
  path.length = 0;
  if (!ctx.world.findPath(me.x, me.z, x, z, 'foot', path) || path.length < 4) return;
  let left = dist;
  for (let i = 2; i < path.length && left > 0; i += 2) {
    const dx = path[i]! - me.x, dz = path[i + 1]! - me.z;
    const l = Math.hypot(dx, dz);
    if (l <= left) { me.x = path[i]!; me.z = path[i + 1]!; left -= l; } else { me.x += (dx / l) * left; me.z += (dz / l) * left; left = 0; }
  }
}

/** Allure du joueur au volant (m/s) : en tête de sa colonne, et seul devant — jamais plus de 50 km/h en ville. */
export const CRUISE_LEAD = 10;
export const CRUISE_ALONE = 12.5;
const TOWN_MAX = 13.8;
/** Il s'arrête à tant de mètres du point (m). */
const STOP_AT = 40;
/** Pas de la simulation tant qu'il conduit (s) : celui d'un joueur au clavier. */
const DRIVE_DT = 0.1;

interface Hit { hit: boolean; t: number; x: number; z: number; nx: number; nz: number; kind: string; id: number; height: number }
interface Stepper { ctx: GameContext; step(seconds: number): void }

/**
 * Le joueur au volant, comme au clavier : il suit par les rues l'itinéraire que montre son GPS (ctx.world.findPath,
 * calculé une fois, recalculé seulement s'il s'en est écarté ou reste coincé), accélère, freine et braque avec les
 * commandes du jeu (ctx.input) — au plus 50 km/h, au pas dans les virages serrés, derrière le véhicule qui le précède ;
 * il contourne un véhicule arrêté et recule quand il est coincé. Rien n'est déplacé à la main : c'est la simulation des
 * véhicules qui le fait rouler (collisions, traces relevées par session/follow.ts comme pour un joueur).
 *
 * Usage : `aim()` désigne le véhicule et le point pour la seconde qui vient ; `step()` remplace `t.step(1)`.
 */
export class StreetDriver {
  /** Distance parcourue au volant (m) et vitesse maximale atteinte (m/s). */
  driven = 0;
  topSpeed = 0;
  private v: Vehicle | null = null;
  private tx = 0;
  private tz = 0;
  private cruise = CRUISE_LEAD;
  private readonly route: number[] = [];
  private idx = 2;
  private planned = false;
  private plannedAt = -1e9;
  private stuck = 0;
  private back = 0;
  private backTurn = 0;
  private jams = 0;
  private held = false;
  /** Ce qui le retient en ce moment (journal PLAYTEST_DEBUG). */
  private note = '';
  private readonly hit: Hit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };

  /** Pour la seconde qui vient : conduire `v` vers (x, z) à l'allure `cruise` (m/s). */
  aim(v: Vehicle, x: number, z: number, cruise: number): void {
    if (this.v !== v && !this.held) this.planned = false;
    if (Math.hypot(x - this.tx, z - this.tz) > 15) this.planned = false;
    this.v = v;
    this.tx = x;
    this.tz = z;
    this.cruise = Math.min(cruise, TOWN_MAX);
  }

  /** Une seconde de jeu : au volant si `aim()` vient de le demander et que le joueur y est, sinon `t.step(1)`. */
  step(t: Stepper): void {
    const v = this.v;
    this.v = null;
    const input = t.ctx.input as unknown as { moveX: number; moveY: number };
    const me = t.ctx.player.person();
    if (!v || !me || v.seats[0] !== me.id) {
      if (this.held) { input.moveX = 0; input.moveY = 0; this.held = false; this.planned = false; }
      t.step(1);
      return;
    }
    this.held = true;
    for (let k = 0; k < Math.round(1 / DRIVE_DT); k++) {
      this.control(t.ctx, v, input);
      const x0 = v.x, z0 = v.z;
      t.step(DRIVE_DT);
      this.driven += Math.hypot(v.x - x0, v.z - z0);
      if (Math.abs(v.speed) > this.topSpeed) this.topSpeed = Math.abs(v.speed);
    }
    if (process.env['PLAYTEST_DEBUG'] && Math.floor(t.ctx.clock.now) % 15 === 0) {
      console.log(`  volant t=${t.ctx.clock.now.toFixed(0)} (${v.x.toFixed(0)}, ${v.z.toFixed(0)}) cap ${v.heading.toFixed(2)} ${(v.speed * 3.6).toFixed(0)} km/h, but à ${Math.hypot(this.tx - v.x, this.tz - v.z).toFixed(0)} m, point ${this.idx / 2}/${this.route.length / 2}, parcouru ${this.driven.toFixed(0)} m, coincé ${this.jams} fois${this.note ? ' ; ' + this.note : ''}`);
    }
  }

  /** Il lâche les commandes (arrivée, descente). */
  release(ctx: GameContext): void {
    const input = ctx.input as unknown as { moveX: number; moveY: number };
    input.moveX = 0;
    input.moveY = 0;
    this.held = false;
    this.v = null;
    this.planned = false;
  }

  private plan(ctx: GameContext, v: Vehicle): void {
    this.route.length = 0;
    let ok = false;
    try { ok = ctx.world.findPath(v.x, v.z, this.tx, this.tz, 'vehicle', this.route); } catch { ok = false; }
    if (!ok || this.route.length < 4) { this.route.length = 0; this.route.push(v.x, v.z, this.tx, this.tz); }
    this.idx = 2;
    this.planned = true;
    this.plannedAt = ctx.clock.now;
  }

  private control(ctx: GameContext, v: Vehicle, input: { moveX: number; moveY: number }): void {
    const toGoal = Math.hypot(this.tx - v.x, this.tz - v.z);
    // arrivé (le lieu est devant lui, à quelques dizaines de mètres : il ne roule pas jusque dans le rassemblement) : il
    // freine jusqu'à l'arrêt
    if (toGoal < STOP_AT) {
      input.moveX = 0;
      input.moveY = Math.abs(v.speed) > 0.3 ? (v.speed > 0 ? -1 : 1) : 0;
      return;
    }
    if (!this.planned) this.plan(ctx, v);
    const path = this.route;
    // point visé : d'autant plus loin qu'il roule vite
    const look = 9 + Math.abs(v.speed) * 0.9;
    while (this.idx < path.length - 2 && Math.hypot(path[this.idx]! - v.x, path[this.idx + 1]! - v.z) < look) this.idx += 2;
    // écarté de son itinéraire de plus de 30 m (contournement, recul) : il regarde de nouveau son GPS
    {
      const ax = path[this.idx - 2]!, az = path[this.idx - 1]!;
      const sx = path[this.idx]! - ax, sz = path[this.idx + 1]! - az;
      const l2 = sx * sx + sz * sz;
      const u = l2 > 0.01 ? Math.max(0, Math.min(1, ((v.x - ax) * sx + (v.z - az) * sz) / l2)) : 0;
      if (Math.hypot(v.x - (ax + sx * u), v.z - (az + sz * u)) > 30 && ctx.clock.now - this.plannedAt > 5) {
        this.plan(ctx, v);
        return;
      }
    }
    let dx = path[this.idx]! - v.x, dz = path[this.idx + 1]! - v.z;
    const hit = this.hit;
    // mur sur la ligne droite jusqu'au point visé : il le longe du côté du point
    if (ctx.world.raycast(v.x, v.z, path[this.idx]!, path[this.idx + 1]!, hit as never) && hit.t * Math.hypot(dx, dz) < 25) {
      let wx = -hit.nz, wz = hit.nx;
      if (wx * (path[this.idx]! - hit.x) + wz * (path[this.idx + 1]! - hit.z) < 0) { wx = -wx; wz = -wz; }
      dx = hit.x + hit.nx * 7 + wx * 8 - v.x;
      dz = hit.z + hit.nz * 7 + wz * 8 - v.z;
    }
    // mobilier fixe devant lui (candélabre, borne, poubelle), dans l'axe ou devant un flanc : il passe à côté
    {
      const l = Math.hypot(dx, dz) || 1;
      const ux = dx / l, uz = dz / l;
      const half = v.def.width * 0.5;
      const reach = v.def.length * 0.5 + 7;
      for (const side of [0, 1, -1]) {
        const ox = uz * side * half, oz = -ux * side * half;
        if (!ctx.props.raycast(v.x + ox, v.z + oz, v.x + ox + ux * reach, v.z + oz + uz * reach, hit as never, 'move') || !hit.hit) continue;
        // (écart de l'objet à droite de l'axe visé : à droite, il passe à gauche, et inversement)
        const lat = (hit.x - v.x) * uz - (hit.z - v.z) * ux;
        const pass = lat >= 0 ? -1 : 1;
        this.note = 'contourne un objet';
        dx = hit.x + uz * pass * (half + 1.5) + ux * 3 - v.x;
        dz = hit.z - ux * pass * (half + 1.5) + uz * 3 - v.z;
        break;
      }
    }
    // véhicule devant lui : arrêté, il passe à côté ; lent, il règle son allure sur la sienne
    let ahead = Infinity;
    let aheadSpeed = 0;
    this.note = '';
    {
      const l = Math.hypot(dx, dz) || 1;
      const ux = dx / l, uz = dz / l;
      const nose = v.def.length * 0.5 + 0.3;
      let shift = 0;
      for (let k = 0; k < 4; k++) {
        const ax = v.x + ux * nose, az = v.z + uz * nose;
        const reach = Math.max(18, Math.abs(v.speed) * 2.5 + 8);
        const bx = ax + ux * reach, bz = az + uz * reach;
        if (!ctx.vehicles.raycast(ax, az, bx, bz, hit as never, 'move') || !hit.hit || hit.kind !== 'vehicle' || hit.id === v.id) break;
        const o = ctx.vehicles.get(hit.id);
        if (!o) break;
        const d = hit.t * reach;
        const os = o.speed * (Math.sin(o.heading) * ux + Math.cos(o.heading) * uz);
        if (Math.abs(o.speed) > 0.5 || d > 15) {
          ahead = d;
          aheadSpeed = Math.max(0, os);
          this.note = `derrière ${o.kind}#${o.id} à ${d.toFixed(0)} m (${o.speed.toFixed(1)} m/s)`;
          break;
        }
        this.note = `contourne ${o.kind}#${o.id}`;
        if (shift === 0) shift = (o.x - v.x) * -uz + (o.z - v.z) * ux > 0 ? -1 : 1;
        const side = (o.def.width + v.def.width) * 0.5 + 1.5 + k * 3;
        dx = o.x + -uz * shift * side + ux * (o.def.length * 0.5 + 3) - v.x;
        dz = o.z + ux * shift * side + uz * (o.def.length * 0.5 + 3) - v.z;
      }
    }
    const fwd = dx * Math.sin(v.heading) + dz * Math.cos(v.heading);
    const right = -dx * Math.cos(v.heading) + dz * Math.sin(v.heading);
    const ang = Math.atan2(right, fwd);
    if (this.back > 0) {
      // (d'abord droit, pour se dégager de ce qui l'arrête, puis en contre-braquant ; demi-tour en plusieurs temps quand
      // le point visé est derrière lui)
      this.back--;
      input.moveX = this.back > this.backTurn ? 0 : ang > 0 ? -1 : 1;
      input.moveY = -0.7;
      return;
    }
    input.moveX = Math.max(-1, Math.min(1, ang * 2.2));
    // allure : croisière en ligne droite, au pas dans les virages serrés, ralenti avant le virage suivant et à l'arrivée
    let want = Math.abs(ang) > 0.5 ? 4 : Math.abs(ang) > 0.22 ? 7 : this.cruise;
    const turn = this.turnAhead(v);
    if (turn.dist < 12 + v.speed * v.speed / 5) want = Math.min(want, turn.angle > 0.9 ? 4.5 : turn.angle > 0.4 ? 7 : want);
    want = Math.min(want, Math.max(3, Math.sqrt(Math.max(0, toGoal - STOP_AT) * 5)));
    if (ahead < Infinity) want = Math.min(want, ahead < 6 ? 0 : aheadSpeed + (ahead - 6) * 0.5);
    input.moveY = v.speed < want - 0.5 ? (want - v.speed > 3 ? 1 : 0.6) : v.speed > want + 2.5 ? -1 : v.speed > want + 0.4 ? -0.4 : 0;
    // coincé (il accélère sans avancer) : marche arrière en contre-braquant ; coincé plusieurs fois : il reprend son GPS
    this.stuck = input.moveY > 0 && Math.abs(v.speed) < 0.3 ? this.stuck + 1 : 0;
    if (this.stuck > 15) {
      if (process.env['PLAYTEST_DEBUG'] && this.jams < 6) {
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        const rel = (x: number, z: number): string => `av=${((x - v.x) * fx + (z - v.z) * fz).toFixed(1)} lat=${((x - v.x) * fz - (z - v.z) * fx).toFixed(1)}`;
        const wall = ctx.world.raycast(v.x, v.z, v.x + fx * 8, v.z + fz * 8, hit as never) ? `mur à ${(hit.t * 8).toFixed(1)} m` : 'pas de mur';
        console.log(`  COINCÉ t=${ctx.clock.now.toFixed(0)} (${v.x.toFixed(1)}, ${v.z.toFixed(1)}) cap ${v.heading.toFixed(2)} vise ${rel(v.x + dx, v.z + dz)} ; ${wall} ; véhicules : ${ctx.vehicles.list.filter((o) => o !== v && Math.hypot(o.x - v.x, o.z - v.z) < 12).map((o) => `${o.kind}#${o.id} ${rel(o.x, o.z)} cap ${o.heading.toFixed(2)} v=${o.speed.toFixed(1)}`).join(' | ')} ; personnes : ${ctx.people.list.filter((q) => q.vehicleId === 0 && Math.hypot(q.x - v.x, q.z - v.z) < 5).map((q) => `${q.faction}#${q.id} ${rel(q.x, q.z)}`).join(' | ')} ; objets : ${ctx.props.list.filter((q) => Math.hypot(q.x - v.x, q.z - v.z) < 6).map((q) => `${q.kind} ${rel(q.x, q.z)}`).join(' | ')}`);
      }
      this.stuck = 0;
      this.back = Math.abs(ang) > 1.5 ? 40 : 25;
      this.backTurn = this.back - 10;
      if (++this.jams % 3 === 0) this.planned = false;
    }
  }

  /** Prochain changement de direction de l'itinéraire devant le véhicule : distance (m) et angle (rad). */
  private turnAhead(v: Vehicle): { dist: number; angle: number } {
    const path = this.route;
    let px = v.x, pz = v.z;
    let run = 0;
    for (let i = this.idx; i < path.length - 2 && run < 80; i += 2) {
      const ax = path[i]! - px, az = path[i + 1]! - pz;
      const bx = path[i + 2]! - path[i]!, bz = path[i + 3]! - path[i + 1]!;
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      run += la;
      if (la > 0.5 && lb > 0.5) {
        const a = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
        if (a > 0.4) return { dist: run, angle: a };
      }
      px = path[i]!;
      pz = path[i + 1]!;
    }
    return { dist: Infinity, angle: 0 };
  }
}

/** Une tentative de commandement et ce qui s'ensuit. */
export interface Attempt {
  label: string;
  /** Ordre adressé à des unités (sinon : secours, proposition…). */
  units: boolean;
  ok: boolean;
  text: string;
  squads: number[];
  at: number;
  /** Délai jusqu'au premier mouvement d'un agent (s ; −1 : aucun). */
  moved: number;
  /** La partie a pris fin moins de sept secondes après l'ordre : il n'a pas pu être observé. */
  cut?: boolean;
  target?: { x: number; z: number };
  /** Ordre donné (type), et type relevé 9 s plus tard sur la première unité. */
  type: string;
  typeAfter: string;
  /** Distance moyenne des agents au but (ou au joueur) au départ et 60 s plus tard (m). */
  d0: number;
  d60: number;
  /** Une phrase dite (radio, notification) dans les 5 s pour ces unités. */
  said: boolean;
  states: string[];
}

export interface MissionRun {
  id: string;
  arrival: Arrival;
  /** Secondes de jeu avant le début de la mission (−1 : jamais). */
  startAfter: number;
  failedEarly: string;
  arrivalState: string;
  /** Groupes à pied ou en fourgon à plus de 300 m du joueur à l'arrivée / sur l'ensemble. */
  farGroups: number;
  groups: number;
  scope: string;
  firstOrderAt: number;
  attempts: Attempt[];
  /** « Suivez-moi à pied » final : groupes à moins de 50 m du joueur 60 s après / groupes à pied. */
  around: number;
  aroundOf: number;
  /** Unités du dispositif dont l'état lisible est vide à la fin. */
  unreadable: string[];
  notes: string[];
}

/**
 * Journal des ordres (PLAYTEST_TRACE=<expression régulière sur le nom des unités>) : chaque ordre donné à une unité qui
 * correspond, avec son auteur (issuedBy, byPlayer) et d'où il vient dans le code — pour savoir qui remplace un ordre du
 * joueur. Sans la variable : rien.
 */
function traceOrders(ctx: GameContext): void {
  const pat = process.env['PLAYTEST_TRACE'];
  if (!pat) return;
  const re = new RegExp(pat);
  const squads = ctx.squads as unknown as { issue(id: number, o: Partial<SquadOrder>): unknown };
  const issue = squads.issue.bind(ctx.squads);
  squads.issue = (id: number, o: Partial<SquadOrder>): unknown => {
    const q = ctx.squads.get(id);
    if (q && re.test(q.name)) {
      const from = (new Error().stack ?? '').split('\n').slice(2, 7).map((l) => l.trim().replace(/^at /, '').replace(/\(?.*\/crs-simulation\//, '(')).join(' < ');
      console.log(`  ordre t=${ctx.clock.now.toFixed(1)} ${q.name} : ${o.type}${o.byPlayer ? ' (joueur)' : ''} issuedBy=${o.issuedBy ?? '-'} ← ${from}`);
    }
    return issue(id, o);
  };
}

export async function playCommandant(id: string, arrival: Arrival): Promise<MissionRun> {
  const t = createTestContext({ seed: 7, strict: false, modules: SIM });
  await t.ready;
  const { ctx } = t;
  const cfg = launchFromSheet(ctx, id);
  cfg.crowdSize = Math.min(cfg.crowdSize ?? LIGHT_CROWD, LIGHT_CROWD);
  await t.start(cfg);
  traceOrders(ctx);
  const m = ctx.service<MissionsApi>('missions')!;
  const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
  const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
  const core = ctx.service<CommandCore>('ui.command')!;
  const cmd = ctx.service<PoliceCommandLike>('police.command')!;
  const run: MissionRun = {
    id, arrival, startAfter: -1, failedEarly: '', arrivalState: '', farGroups: 0, groups: 0, scope: '', firstOrderAt: -1,
    attempts: [], around: 0, aroundOf: 0, unreadable: [], notes: [],
  };
  // ── trajet ──
  const path: number[] = [];
  const wheel = new StreetDriver();
  let s = 0;
  let alone = false;
  for (; s < TRAVEL_LIMIT && m.phaseIndex < 0 && !m.result; s++) {
    wheel.step(t);
    const me = ctx.player.person()!;
    const d = j.destination;
    if (arrival === 'devant' && d && s >= 3) {
      if (!alone) {
        alone = true;
        if (Math.hypot(d.x - me.x, d.z - me.z) > WALK_AHEAD) {
          // trop loin à pied : il prend le volant de son véhicule et part seul devant
          const v = ctx.vehicles.list.filter((x) => x.kind === 'vl_commandement' && x.faction === 'police').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
          if (v) {
            if (me.vehicleId !== 0 && me.vehicleId !== v.id) ctx.vehicles.exit(me);
            if (v.seats[0] !== 0 && v.seats[0] !== me.id) { const drv = ctx.people.get(v.seats[0]!); if (drv) ctx.vehicles.exit(drv); }
            me.x = v.x; me.z = v.z;
            if (me.vehicleId === 0) ctx.vehicles.enter(me, v);
          }
        } else if (me.vehicleId !== 0) ctx.vehicles.exit(me);
      }
      const v = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
      if (v && v.seats[0] === me.id) wheel.aim(v, d.x, d.z, CRUISE_ALONE);
      else { if (me.vehicleId !== 0) ctx.vehicles.exit(me); walk(ctx, me, d.x, d.z, 4, path); }
      continue;
    }
    if (me.vehicleId === 0) {
      const e = obj.list.find((o) => o.state === 'actif' && /^Embarquez/.test(o.text) && o.x !== undefined);
      if (!e) continue;
      walk(ctx, me, e.x!, e.z!, 4, path);
      const v = ctx.vehicles.list.find((x) => Math.hypot(x.x - e.x!, x.z - e.z!) < 6 && Math.hypot(x.x - me.x, x.z - me.z) < 6);
      if (!v) continue;
      if (arrival === 'volant') {
        if (v.seats[0] !== 0 && v.seats[0] !== me.id) { const drv = ctx.people.get(v.seats[0]!); if (drv) ctx.vehicles.exit(drv); }
        ctx.vehicles.enter(me, v);
      } else ctx.vehicles.enter(me, v, 'passenger');
      continue;
    }
    const v = ctx.vehicles.get(me.vehicleId)!;
    if (arrival === 'volant' && v.seats[0] === me.id && d) wheel.aim(v, d.x, d.z, CRUISE_LEAD);
  }
  wheel.release(ctx);
  const me = ctx.player.person()!;
  if (m.phaseIndex < 0) {
    run.notes.push(`mission jamais commencée après ${s} s (journée ${j.stage})`);
    return run;
  }
  run.startAfter = s;
  const tArr = ctx.clock.now;
  const ownId = core.scope().ownSquadId;
  const subtree = (ids: readonly number[]): number[] => {
    const out = new Set<number>();
    const add = (sid: number): void => { if (out.has(sid)) return; out.add(sid); for (const q of ctx.squads.list) if (q.parentId === sid) add(q.id); };
    ids.forEach(add);
    return [...out];
  };
  const posOf = (pid: number): { x: number; z: number } => {
    const p = ctx.people.get(pid)!;
    const v = p.vehicleId ? ctx.vehicles.get(p.vehicleId) : undefined;
    return v ? { x: v.x, z: v.z } : { x: p.x, z: p.z };
  };
  /** Agents (hors conducteurs restés à leur volant et hors joueur) des unités. */
  const agents = (ids: readonly number[]): Person[] => {
    const out: Person[] = [];
    for (const sid of subtree(ids)) for (const pid of ctx.squads.get(sid)?.members ?? []) {
      const p = ctx.people.get(pid);
      if (p && !p.isPlayer && p.custody === 'free' && p.posture !== 'down' && p.poste !== 'conducteur' && p.poste !== 'pilote_moto') out.push(p);
    }
    return out;
  };
  const meanDist = (ids: readonly number[], x: number, z: number): number => {
    const a = agents(ids);
    if (a.length === 0) return -1;
    let sum = 0;
    for (const p of a) { const q = posOf(p.id); sum += Math.hypot(q.x - x, q.z - z); }
    return sum / a.length;
  };
  const groupsOf = (): Squad[] => ctx.squads.list.filter((q) => q.faction === 'police' && q.members.length > 0 && q.kind === 'groupe' && subtree([ownId]).includes(q.id));
  const describe = (ids: readonly number[], target?: { x: number; z: number }): string => subtree(ids).filter((sid) => (ctx.squads.get(sid)?.members.length ?? 0) > 0).map((sid) => {
    const q = ctx.squads.get(sid)!;
    let ab = 0, x = 0, z = 0;
    for (const pid of q.members) { const p = ctx.people.get(pid)!; if (p.vehicleId) ab++; const ps = posOf(pid); x += ps.x; z += ps.z; }
    x /= q.members.length; z /= q.members.length;
    const cv = cmd.convoyOf(sid);
    return `${q.name}[${q.order.type}${ab ? ` à bord ${ab}/${q.members.length}` : ''} à ${Math.hypot(x - me.x, z - me.z).toFixed(0)} m${target ? `, but ${Math.hypot(x - target.x, z - target.z).toFixed(0)} m` : ''}${cv ? ' colonne ' + cv.stage : ''}]`;
  }).join(' ');
  // état à l'arrivée : où est la compagnie
  {
    const gs = groupsOf();
    run.groups = gs.length;
    run.farGroups = gs.filter((q) => meanDist([q.id], me.x, me.z) > 300).length;
    const cv = cmd.convoyOf(ownId);
    run.arrivalState = `journée ${j.stage}, colonne ${cv ? cv.stage : '-'}, mission phase ${m.phaseIndex + 1} ; ${run.farGroups}/${run.groups} groupes à plus de 300 m ; ${describe([ownId])}`;
    const sc = core.scope();
    run.scope = `${sc.level} ; « Qui » : ${ctx.squads.get(sc.ownSquadId)?.name ?? '-'} ; bloc ORDRES : ${core.followUnit() ? 'oui' : 'VIDE'}`;
  }
  // ── tentatives ──
  const state = new TacticalState();
  const tmap = new TacticalMap(core, { handlers: null } as unknown as MapCanvas, state);
  const sendEnv = (card: CardEnv): SendEnv => ({ core, map: tmap, setSelection: (ids) => state.setSelection(ids), card, trace: null });
  const said: { t: number; text: string }[] = [];
  const offN = ctx.events.onAny('ui:notify', (e: unknown) => said.push({ t: ctx.clock.now, text: String((e as { text?: string }).text ?? '') }));
  void offN;
  const start = new Map<Attempt, Map<number, { x: number; z: number }>>();
  const track = (label: string, units: boolean, ok: boolean, text: string, squads: number[], type: string, target?: { x: number; z: number }): void => {
    const a: Attempt = { label, units, ok, text, squads, at: ctx.clock.now, moved: -1, target, type, typeAfter: '', d0: -1, d60: -1, said: false, states: [] };
    const pos = new Map<number, { x: number; z: number }>();
    for (const p of agents(squads)) pos.set(p.id, posOf(p.id));
    // conducteurs compris : un fourgon qui démarre bouge aussi
    for (const sid of subtree(squads)) for (const pid of ctx.squads.get(sid)?.members ?? []) if (!pos.has(pid) && !ctx.people.get(pid)?.isPlayer) pos.set(pid, posOf(pid));
    start.set(a, pos);
    const g = target ?? { x: me.x, z: me.z };
    a.d0 = meanDist(squads, g.x, g.z);
    if (ok && run.firstOrderAt < 0 && units) run.firstOrderAt = ctx.clock.now - tArr;
    run.attempts.push(a);
  };
  const names = (ids: readonly number[]): string[] => ids.map((sid) => ctx.squads.get(sid)?.name ?? '').filter((n) => n !== '');
  const tick = (): void => {
    t.step(1);
    for (const a of run.attempts) {
      const el = Math.round(ctx.clock.now - a.at);
      const pos = start.get(a)!;
      if (a.moved < 0) for (const [pid, p0] of pos) { const p = posOf(pid); if (Math.hypot(p.x - p0.x, p.z - p0.z) > 1.5) { a.moved = el; break; } }
      if (el === 5 && !a.said) {
        const ns = names(a.squads).map((n) => n.toUpperCase());
        a.said = ctx.radio.log.some((l) => l.t >= a.at - 0.5 && ns.some((n) => l.from.toUpperCase() === n || l.text.toUpperCase().includes(n))) || said.some((x) => x.t >= a.at - 0.5);
      }
      if (el === 9 && a.squads.length > 0) a.typeAfter = String(ctx.squads.get(a.squads[0]!)?.order.type ?? '');
      if (el === 5 || el === 20 || el === 60) a.states.push(`+${el} s : ${describe(a.squads, a.target)}`);
      if (el === 60) { const g = a.target ?? { x: me.x, z: me.z }; a.d60 = meanDist(a.squads, g.x, g.z); }
    }
  };
  if (me.vehicleId !== 0) ctx.vehicles.exit(me);
  const own = (): Squad | undefined => ctx.squads.get(core.scope().ownSquadId);
  const bravm = (): number[] => ctx.squads.list.filter((q) => q.faction === 'police' && q.kind === 'groupe' && cmd.special(q.id)?.stage !== undefined && /FAUCON/.test(q.name)).map((q) => q.id);
  const mapIntent = (intent: string, label = `carte : ${intent}`, sel?: number[]): void => {
    const e = cardEnvFromCore(core);
    const r = intentCandidates(intent as never, e, e.player!)[0];
    if (!r) { track(label, true, false, 'aucun lieu proposé par la carte', [], intent); return; }
    const card = buildCard(r, e, intent as never);
    const line = card.lines[card.defaultLine];
    if (!line) { track(label, true, false, 'fiche sans ligne', [], intent); return; }
    const who = defaultWho(proposeWho(line, r, whoEnvFromCore(core, e, sel ?? [])));
    const res = sendCardLine(sendEnv(e), line, who, r);
    const type = line.action.kind === 'verb' ? String(line.action.type) : line.action.kind;
    track(`${label} « ${line.label} » (${r.name}) → ${who ? who.label : 'personne'}`, line.action.kind === 'verb' || line.action.kind === 'nasse', res.ok, res.text, res.squads, type, { x: r.x, z: r.z });
  };
  const at = (pt: { x: number; z: number }, label: string, sel: number[], type?: OrderType): void => {
    const e = cardEnvFromCore(core);
    const r = pointRepere(pt.x, pt.z, e);
    const card = buildCard(r, e, 'envoyer');
    const line: CardLine | undefined = card.lines.concat(card.others).find((l) => (type ? l.action.kind === 'verb' && l.action.type === type : l.label === 'Y aller')) ?? card.lines[card.defaultLine];
    if (!line) { track(label, true, false, 'fiche sans ligne', sel, ''); return; }
    const we = whoEnvFromCore(core, e, sel);
    const who: WhoCandidate | null = sel.length > 0 ? proposeWho(line, r, we)[0] ?? null : wholeCandidate(r, we);
    const res = sendCardLine(sendEnv(e), line, who, r);
    track(`${label} « ${line.label} » → ${who ? who.label : 'personne'}`, true, res.ok, res.text, res.squads, line.action.kind === 'verb' ? String(line.action.type) : line.action.kind, pt);
  };
  const farPoint = (from: { x: number; z: number }, dist: number): { x: number; z: number } => {
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    for (let a = 0; a < 16; a++) {
      const tx = from.x + Math.sin(a * Math.PI / 8) * dist, tz = from.z + Math.cos(a * Math.PI / 8) * dist;
      if (ctx.world.nearestRoad(tx, tz, road as never, 30) && !['pedestrian', 'footway', 'service'].includes(road.roadClass) && ctx.world.findPath(from.x, from.z, road.x, road.z, 'vehicle', [])) return { x: road.x, z: road.z };
    }
    return { x: from.x + dist, z: from.z };
  };
  const follow = (column: boolean, label: string): void => {
    const u = core.followUnit();
    const r = core.callFollow(column);
    track(label, true, r.ok, r.ok ? `Ordre donné : ${u?.name}` : r.reason, r.ok && u ? [u.id] : [], column ? 'avec_moi' : 'suivre_pied');
  };
  const plan: [number, () => void][] = [
    [2, () => follow(false, 'ORDRES « Suivez-moi à pied » (F puis 1)')],
    [12, () => {
      const o = own();
      const g = { x: me.x + Math.sin(me.heading) * 20, z: me.z + Math.cos(me.heading) * 20, heading: me.heading, width: 0 };
      const r = o ? core.issue('ligne', [o], [g]) : { ok: false, reason: 'aucune unité', count: 0 };
      track('roue (F puis 4) « Tenir une ligne ici »', true, r.ok, r.ok ? 'Ordre donné' : r.reason, r.ok && o ? [o.id] : [], 'ligne', g);
    }],
    [22, () => mapIntent('envoyer')],
    [32, () => mapIntent('bloquer')],
    [42, () => mapIntent('disperser')],
    [52, () => mapIntent('interpeller')],
    [62, () => mapIntent('encercler')],
    [72, () => mapIntent('secours')],
    [82, () => {
      const b = bravm();
      if (b.length === 0) { follow(true, 'ORDRES « Suivez-moi en véhicules » (F puis 2)'); return; }
      const lead = agents([b[0]!])[0];
      at(farPoint(lead ? posOf(lead.id) : me, 400), 'BRAV-M : « Envoyer » à 400 m', [b[0]!]);
    }],
    [92, () => {
      const b = bravm();
      if (b.length === 0) { at(farPoint(me, 120), '« Toute la compagnie » (T) à 120 m', []); return; }
      at({ x: me.x, z: me.z }, 'BRAV-M : vers moi', [b[0]!]);
    }],
    [102, () => {
      const p = cmd.proposals.find((x) => x.executable && x.saidAt >= 0);
      if (!p) { track('adjoint (P)', false, false, `aucune proposition affichée (${cmd.proposals.length} en attente)`, [], ''); return; }
      const ok = cmd.accept(p.id);
      track(`adjoint (P) « ${p.text.slice(0, 70)} »`, false, ok, ok ? 'Proposition acceptée : l’adjoint fait exécuter.' : 'Cette proposition n’est plus d’actualité.', [], '');
    }],
    [112, () => { const ok = requestRescueAtPlayer(core, 'samu'); track('ORDRES « Secours ici » → SAMU ici', false, ok, ok ? 'SAMU demandé' : 'refusé', [], ''); }],
    [120, () => follow(false, 'ORDRES « Suivez-moi à pied » (2)')],
    [130, () => {
      // la BRAV-M choisie sur la carte, puis la fiche « VOUS » : « Suivez-moi à pied »
      const b = bravm();
      if (b.length === 0) return;
      const e = cardEnvFromCore(core, [b[0]!]);
      const r = pointRepere(me.x, me.z, e);
      const card = buildCard({ ...r, kind: 'vous', key: 'vous', name: 'Vous' } as never, e, null);
      const line = card.lines.find((l) => l.label === 'Suivez-moi à pied');
      if (!line) { track('BRAV-M : « Suivez-moi à pied » (carte, fiche VOUS)', true, false, 'pas de ligne « Suivez-moi à pied » sur la fiche VOUS', [b[0]!], 'suivre_pied'); return; }
      const res = sendCardLine(sendEnv(e), line, null, r);
      track('BRAV-M : « Suivez-moi à pied » (carte, fiche VOUS) vers moi', true, res.ok, res.text, res.ok ? [b[0]!] : [], 'suivre_pied');
    }],
  ];
  let endedAt = -1;
  for (let k = 0; k <= PLAY; k++) {
    if (m.result && !run.failedEarly && ctx.clock.now - tArr < 30) run.failedEarly = m.result.summary;
    // (partie finie avant la fin des essais : dit, avec le compte rendu de la mission — les essais suivants ne sont pas joués)
    if (endedAt < 0 && ctx.session.phase !== 'playing') {
      endedAt = k;
      // (un ordre donné dans les six secondes d'avant n'a pas pu être observé : il n'est pas jugé)
      for (const a of run.attempts) if (ctx.clock.now - a.at < 7 && a.moved < 0) a.cut = true;
      run.notes.push(`partie finie ${k} s après l’arrivée (${ctx.session.phase})${m.result ? ` : ${m.result.success ? 'mission réussie' : 'mission échouée'} — ${m.result.summary}` : ''}`);
      // (emplois de la force fautifs depuis l'arrivée : qui, avec quoi, quel ordre tenait son unité)
      for (const f of ctx.law.forceLog) {
        if (f.t < tArr || f.verdict.severity < 3) continue;
        const by = ctx.people.get(f.byId);
        const q = by ? ctx.squads.get(by.squadId) : undefined;
        const fv = by && by.vehicleId ? ctx.vehicles.get(by.vehicleId) : undefined;
        const fa = fv ? ctx.service<{ status(v: Vehicle): { mode: string; state: string; reason: string; urgence: boolean } }>('vehicles.autopilot')?.status(fv) : undefined;
        const tg = ctx.people.get(f.targetId);
        run.notes.push(`force fautive +${(f.t - tArr).toFixed(0)} s : ${q?.name ?? '?'} (${by?.poste ?? '?'}${fv ? `, à bord de ${fv.kind} #${fv.id} en (${fv.x.toFixed(0)}, ${fv.z.toFixed(0)}), ${fv.speed.toFixed(1)} m/s, pilote ${fa ? `${fa.mode}/${fa.state}/${fa.reason}${fa.urgence ? ' urgence' : ''}` : '-'}` : ''}, ordre ${q?.order.type ?? '-'}) — ${f.means}, ${f.verdict.kind}, gravité ${f.verdict.severity}, à ${Math.hypot(f.x - me.x, f.z - me.z).toFixed(0)} m du commandant ; touché : ${tg ? `${tg.faction}, ${tg.posture}, sol « ${ctx.world.surfaceAt(tg.x, tg.z)} »` : '?'}`);
      }
    }
    for (const [when, f] of plan) if (when === k && ctx.session.phase === 'playing' && !SKIP.has(when)) f();
    tick();
  }
  // ── « Suivez-moi à pied » final : les groupes autour du joueur, avec un état lisible ──
  const last = run.attempts.find((a) => a.label.startsWith('ORDRES « Suivez-moi à pied » (2)'));
  if (last && last.ok) {
    const gs = groupsOf().filter((q) => agents([q.id]).length > 0);
    run.aroundOf = gs.length;
    run.around = gs.filter((q) => { const d = meanDist([q.id], me.x, me.z); return d >= 0 && d < 50; }).length;
    // (ceux qui manquent : distance moyenne de leurs agents au joueur, du plus proche au plus loin, et leur ordre)
    const away = gs.filter((q) => meanDist([q.id], me.x, me.z) >= 50).map((q) => {
      const ds = agents([q.id]).map((p) => { const ps = posOf(p.id); return Math.hypot(ps.x - me.x, ps.z - me.z); });
      const seated = agents([q.id]).filter((p) => p.vehicleId !== 0).length;
      return `${q.name} ${meanDist([q.id], me.x, me.z).toFixed(0)} m (${Math.min(...ds).toFixed(0)}–${Math.max(...ds).toFixed(0)} m, ${q.order.type}${seated ? `, ${seated} à bord` : ''})`;
    });
    if (away.length > 0) run.notes.push(`pas autour du commandant 60 s après « Suivez-moi à pied » : ${away.join(' ; ')}`);
    if (process.env['PLAYTEST_DEBUG']) for (const q of gs) {
      if (meanDist([q.id], me.x, me.z) < 50) continue;
      for (const p of agents([q.id])) {
        const a = p.brain as unknown as { tag?: string; hasSlot?: boolean; sx?: number; sz?: number; boardId?: number; op?: unknown; act?: number; stuckT?: number; able?: boolean; pathN?: number } | null;
        const ps = posOf(p.id);
        console.log(`    ${q.name} ${p.poste} à ${Math.hypot(ps.x - me.x, ps.z - me.z).toFixed(0)} m (${ps.x.toFixed(0)},${ps.z.toFixed(0)}) v=${Math.hypot(p.vx, p.vz).toFixed(1)} ${p.vehicleId ? 'à bord #' + p.vehicleId : 'à pied'} ${p.posture} place ${a && a.hasSlot ? `à ${Math.hypot((a.sx ?? 0) - me.x, (a.sz ?? 0) - me.z).toFixed(0)} m du joueur` : 'aucune'} boardId=${a?.boardId} op=${a?.op ? 'oui' : 'non'} act=${a?.act} apte=${a?.able} coincé=${(a?.stuckT ?? 0).toFixed(1)} chemin=${a?.pathN}`);
      }
    }
  }
  const e = cardEnvFromCore(core);
  for (const u of e.units) {
    if (!u.mine || !subtree([ownId]).includes(u.squadId) || u.symbol === 'compagnie') continue;
    if (u.status === '' && !u.order) run.unreadable.push(u.name);
  }
  return run;
}

/** Compte rendu lisible d'une partie (tableau du coordinateur). */
export function report(r: MissionRun): string {
  const lines = [
    `${r.id} — ${r.arrival} : mission ${r.startAfter >= 0 ? `commencée après ${r.startAfter} s` : 'JAMAIS commencée'}${r.failedEarly ? ` — ÉCHEC IMMÉDIAT : ${r.failedEarly}` : ''}`,
    `  à l'arrivée : ${r.arrivalState}`,
    `  commandement : ${r.scope} ; premier ordre accepté à +${r.firstOrderAt.toFixed(0)} s`,
  ];
  for (const a of r.attempts) {
    lines.push(`  ${a.ok ? 'ACCEPTÉ' : 'REFUSÉ '} +${Math.round(a.at - (r.attempts[0]?.at ?? a.at) + 2)} s ${a.label} : « ${a.text} » ; premier mouvement ${a.moved < 0 ? 'AUCUN' : `${a.moved} s`} ; ordre à +9 s : ${a.typeAfter || '-'} ; distance ${a.d0.toFixed(0)} → ${a.d60.toFixed(0)} m${a.said ? '' : ' ; RIEN DIT'}`);
    for (const st of a.states) lines.push(`      ${st}`);
  }
  lines.push(`  « Suivez-moi à pied » : ${r.around}/${r.aroundOf} groupes à moins de 50 m au bout de 60 s ; état illisible : ${r.unreadable.join(', ') || 'aucun'}`);
  for (const n of r.notes) lines.push(`  ! ${n}`);
  return lines.join('\n');
}

/**
 * Défauts relevés (ce que le joueur ne doit jamais voir) : vide quand tout tient.
 *   - mission jamais commencée, ou perdue dans les trente secondes de l'arrivée ;
 *   - mission commencée avec la plupart des groupes à plus de 300 m du commandant (encore en route) ;
 *   - aucun ordre possible dans les dix secondes (bloc « ORDRES » vide, carte en lecture seule) ;
 *   - un ordre d'unités accepté sans qu'aucun agent ne bouge dans les six secondes ;
 *   - un ordre remplacé dans les neuf secondes par un « débarquez » ou « libre » que le joueur n'a pas donné ;
 *   - BRAV-M qui ne vient pas quand on l'appelle ;
 *   - « Suivez-moi à pied » final qui ne ramène pas la moitié des groupes autour du joueur.
 */
export function defects(r: MissionRun): string[] {
  const out: string[] = [];
  if (r.startAfter < 0) out.push(r.notes.join(' ; ') || 'mission jamais commencée');
  if (r.failedEarly) out.push(`mission perdue dès l'arrivée : ${r.failedEarly}`);
  if (r.startAfter >= 0 && !/^tout/.test(r.scope)) out.push(`commandement : ${r.scope}`);
  if (r.groups > 0 && r.farGroups * 2 > r.groups) out.push(`mission commencée, compagnie ailleurs : ${r.farGroups}/${r.groups} groupes à plus de 300 m du commandant`);
  if (r.startAfter >= 0 && (r.firstOrderAt < 0 || r.firstOrderAt > 10)) out.push(`premier ordre accepté à ${r.firstOrderAt} s`);
  for (const a of r.attempts) {
    if (!a.units || !a.ok || a.squads.length === 0 || a.cut) continue;
    // (déjà sur place : rien à faire bouger)
    const there = a.d0 >= 0 && a.d0 < 6;
    if (!there && (a.moved < 0 || a.moved > 6)) out.push(`${a.label} : accepté, premier mouvement ${a.moved < 0 ? 'aucun' : `${a.moved} s`}`);
    // (« Suivez-moi à pied » : descendre d'abord fait partie de l'ordre)
    if ((a.typeAfter === 'debarquer' && a.type !== 'debarquer' && a.type !== 'suivre_pied') || (a.typeAfter === 'libre' && a.type !== 'libre')) out.push(`${a.label} : ordre remplacé par « ${a.typeAfter} » au bout de 9 s`);
    if (/vers moi/.test(a.label) && a.d60 >= 0 && a.d60 > 40 && a.d0 - a.d60 < 20) out.push(`${a.label} : la BRAV-M ne vient pas (${a.d0.toFixed(0)} → ${a.d60.toFixed(0)} m)`);
  }
  if (r.aroundOf > 0 && r.around * 2 < r.aroundOf) out.push(`« Suivez-moi à pied » : ${r.around}/${r.aroundOf} groupes autour du commandant au bout de 60 s`);
  return out;
}
