/* =====================================================================================
 * MISE EN PLACE — FOURGONS CELLULAIRES ET POINT DE REMISE DES INTERPELLÉS (service 'session.remise').
 *
 * Une compagnie engagée sur une manifestation a deux à quatre fourgons cellulaires, chacun avec son équipage (un chef
 * de bord, un conducteur ; huit places pour les interpellés) : 2 jusqu'à 800 manifestants annoncés, puis un pour 400,
 * quatre au plus — avec un seul, « toujours un fourgon sur place » ne tiendrait pas pendant qu'il roule vers le
 * commissariat. Sans compagnie (BRAV-M seule, engin, équipe drone), un fourgon dès que des forces de l'ordre sont là.
 *
 * Point de remise : 60 à 100 m DERRIÈRE la ligne de la compagnie, du côté opposé à la foule, le long du trottoir d'une
 * chaussée qui reste passante, hors du bloc des véhicules garés des unités (qui en sortiraient par là) ; les fourgons s'y
 * garent l'un derrière l'autre. Faute de place (rues étroites, place piétonne) : 40 à 140 m, puis la chaussée libre la
 * plus proche. Posé à la mise en place quand les forces sont déjà sur place ; en journée de
 * service, une fois la colonne arrivée et débarquée. Quand la ligne s'est déplacée de plus de 80 m et s'est arrêtée,
 * le point est recalculé et les fourgons disponibles s'y rendent au pilote automatique, sans sirène (un fourgon qui
 * a reçu un ordre du joueur, qui roule en colonne ou vers un commissariat, ou qu'une interpellation attend, n'est pas
 * déplacé).
 *
 * Service publié : ctx.service<RemiseApi>('session.remise') — point() (lu par les interpellations des unités et le
 * transfert au commissariat), vans() (équipages des fourgons cellulaires engagés).
 * Simulation pure (aucun DOM), déterministe (aucun tirage).
 * ===================================================================================== */

import type { GameContext, RoadSample, Squad, Vehicle } from '@/core/contracts';
import { hasWayOut } from './placement';

export const REMISE_SERVICE = 'session.remise';

/** Point de remise des interpellés et fourgons cellulaires engagés. */
export interface RemiseApi {
  /** Point de remise de la compagnie du joueur (place du premier fourgon, cap de stationnement) ; null tant qu'il n'est pas fixé. */
  point(): { x: number; z: number; heading: number } | null;
  /** Unités (équipages) des fourgons cellulaires engagés, toutes compagnies comprises, dans l'ordre de leur engagement. */
  vans(): readonly number[];
  /**
   * Enregistre les fourgons cellulaires d'une compagnie engagée hors de la mise en place (manifestation supplémentaire) :
   * `awayHeading` cap « dos à la foule » par défaut, `line` et `spots` ligne et places déjà prises (null / [] : à fixer
   * à son arrivée).
   */
  track(companyId: number, vans: readonly number[], awayHeading: number, line: { x: number; z: number } | null, spots: readonly { x: number; z: number; heading: number }[]): void;
}

/** Distance du point de remise à la ligne (m). */
export const REMISE_MIN = 60;
export const REMISE_MAX = 100;
/** Déplacement de la ligne au-delà duquel le point de remise est recalculé (m). */
export const REMISE_MOVE = 80;
/** Fourgons cellulaires d'une compagnie : au moins, au plus, manifestants annoncés par fourgon. */
export const CELLULAR_MIN = 2;
export const CELLULAR_MAX = 4;
export const CELLULAR_PER = 400;

/**
 * Fourgons cellulaires à engager : avec une compagnie, max(2, ⌈foule annoncée / 400⌉) plafonné à 4 (`asked` > 0 : le
 * nombre demandé sur la page d'accueil, borné de même) ; sans compagnie, un seul.
 */
export function cellularCount(declaredCrowd: number, withCompany: boolean, asked = 0): number {
  if (!withCompany) return 1;
  const want = asked > 0 ? Math.round(asked) : Math.ceil(Math.max(0, declaredCrowd) / CELLULAR_PER);
  return Math.max(CELLULAR_MIN, Math.min(CELLULAR_MAX, want));
}

/** Sols où l'on gare un fourgon : chaussée et esplanades (jamais un trottoir, une pelouse ni un quai étroit). */
const PARK_SURFACES: ReadonlySet<string> = new Set(['road', 'plaza', 'sett']);
const ROAD: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
const ROAD_FIT: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
const propsOut: unknown[] = [];
/** Distances essayées derrière la ligne (m) et écarts latéraux (m), du plus naturel au plus lointain. */
const BACKS: readonly number[] = [75, 65, 85, 95, 60, 100];
/** Distances de dernier recours (bande élargie, voir RemiseSpotOptions.band). */
const WIDE_BACKS: readonly number[] = [50, 110, 40, 120, 130, 140];
/** Bande élargie : derrière la ligne, à 40–140 m, quand rien n'est libre à 60–100 m (rues étroites, place piétonne). */
export const REMISE_WIDE: readonly [number, number] = [40, 140];
/** Dernier recours (remiseNearest) : recul minimal derrière la ligne, dans le sens « dos à la foule » (m). */
const NEAREST_BEHIND = 20;
const SIDES: readonly number[] = [0, 10, -10, 20, -20, 30, -30, 40, -40];
/** Écart entre deux fourgons garés l'un derrière l'autre (m, d'axe à axe). */
const FILE_GAP = 8.5;
/** Largeur de chaussée minimale où garer un fourgon le long du trottoir sans barrer la rue (m). */
const MIN_ROAD = 7.5;
/** Chaussée où la voie de droite passe à côté d'un fourgon garé le long du trottoir : préférée (m). */
const WIDE_ROAD = 13;
/**
 * Distance minimale aux véhicules garés des unités (fourgons, VL, engins) : le fourgon cellulaire ne se gare pas dans la
 * sortie de leur bloc, que la colonne prendrait (m).
 */
const BLOCK_CLEAR = 30;
/** La même, pour les places de remise fixées une fois sur place (voir RemiseSpotOptions.blockClear) (m). */
const BLOCK_CLEAR_ON_SITE = 15;

/** Un véhicule de police arrêté (fourgon, VL, engin, moto), autre qu'un fourgon cellulaire, est-il à moins de BLOCK_CLEAR m de (x, z) ? */
function nearBlock(ctx: GameContext, x: number, z: number, ignore: Vehicle | null, clear = BLOCK_CLEAR): boolean {
  for (const o of ctx.vehicles.list) {
    if (o === ignore || o.faction !== 'police' || o.def.flying || o.kind === 'fourgon_cellulaire' || Math.abs(o.speed) > 0.5) continue;
    if (Math.hypot(o.x - x, o.z - z) < clear) return true;
  }
  return false;
}

/** Un fourgon de `len` × `wid` tient-il garé en (x, z), au cap `h` : décor, sol, mobilier, autres véhicules, sortie ? */
export function vanFits(ctx: GameContext, x: number, z: number, h: number, len: number, wid: number, ignore: Vehicle | null, people: boolean): boolean {
  const world = ctx.world;
  const surface = world.surfaceAt(x, z);
  // (sol inconnu — tuile non chargée — : admis seulement sur l'emprise d'une chaussée connue du réseau)
  if (surface === 'void') {
    if (!world.nearestRoad(x, z, ROAD_FIT, 10) || ROAD_FIT.dist > ROAD_FIT.width * 0.5 + 0.5) return false;
  } else if (!PARK_SURFACES.has(surface)) {
    return false;
  }
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const half = len * 0.5;
  const r = wid * 0.5 + 0.2;
  for (let d = -half; d <= half + 0.01; d += 1) if (!world.isFree(x + fx * d, z + fz * d, r)) return false;
  for (const o of ctx.vehicles.list) {
    if (o === ignore || o.def.flying) continue;
    const dx = o.x - x, dz = o.z - z;
    const reach = half + Math.max(o.def.length, o.def.width) * 0.5 + 1;
    if (dx * dx + dz * dz > reach * reach) continue;
    if (Math.abs(Math.sin(o.heading - h)) > 0.35) return false;
    const along = Math.abs(dx * fx + dz * fz);
    const lat = Math.abs(dx * fz - dz * fx);
    if (along < half + o.def.length * 0.5 + 0.8 && lat < wid * 0.5 + o.def.width * 0.5 + 0.8) return false;
  }
  if (ctx.props.queryRadius(x, z, half, propsOut as never[], (q) => q.blocksMove) > 0) return false;
  if (people && ctx.people.countIn(x, z, half + 0.5, (p) => p.vehicleId === 0) > 0) return false;
  return hasWayOut(ctx, x, z, Math.min(1.2, wid * 0.5));
}

export interface RemiseSpotOptions {
  /** Places déjà prises par d'autres fourgons ([x0, z0, x1, z1…]) : 8 m au moins entre deux. */
  taken: readonly number[];
  /** Fourgon à garer (ignoré dans le contrôle des véhicules) et dont l'itinéraire doit exister ; null : création. */
  van: Vehicle | null;
  len: number;
  wid: number;
  /** Personnes à pied exclues de la place (création : on ne pose pas un fourgon sur quelqu'un). */
  people: boolean;
  /** Bande de distance à la ligne admise (m) ; défaut [REMISE_MIN, REMISE_MAX]. Plus large en dernier recours. */
  band?: readonly [number, number];
  /**
   * Distance minimale aux véhicules garés des unités (m ; défaut BLOCK_CLEAR) : moindre une fois sur place, quand la
   * colonne s'est garée en file le long de la voie (elle en sort droit devant).
   */
  blockClear?: number;
}

/** Place de remise n° `taken.length / 2` : à 60–100 m de la ligne (lx, lz), du côté (ax, az) (vecteur unitaire, « dos à la foule »). */
export function remiseSpot(
  ctx: GameContext, lx: number, lz: number, ax: number, az: number, opts: RemiseSpotOptions, out: { x: number; z: number; heading: number },
): boolean {
  const world = ctx.world;
  const taken = opts.taken;
  const lo = opts.band ? opts.band[0] : REMISE_MIN;
  const hi = opts.band ? opts.band[1] : REMISE_MAX;
  const ok = (x: number, z: number, h: number, lo: number, hi: number): boolean => {
    const d = Math.hypot(x - lx, z - lz);
    if (d < lo || d > hi || (x - lx) * ax + (z - lz) * az < lo * 0.6) return false;
    for (let i = 0; i + 1 < taken.length; i += 2) if (Math.hypot(taken[i]! - x, taken[i + 1]! - z) < FILE_GAP - 0.5) return false;
    if (!vanFits(ctx, x, z, h, opts.len, opts.wid, opts.van, opts.people)) return false;
    if (opts.van) {
      const path: number[] = [];
      if (!world.findPath(opts.van.x, opts.van.z, x, z, 'vehicle', path, { heading: opts.van.heading, uturn: 60 })) return false;
    }
    out.x = x;
    out.z = z;
    out.heading = h;
    return true;
  };
  // fourgon suivant : en file derrière (ou devant) le premier, le long de la même voie
  if (taken.length >= 2) {
    const fx = taken[0]!, fz = taken[1]!;
    if (world.nearestRoad(fx, fz, ROAD, 12)) {
      const h = facing(ROAD.heading, ax, az);
      for (const k of [-1, 1, -2, 2, -3, 3, -4, 4]) {
        const x = fx + Math.sin(h) * FILE_GAP * k;
        const z = fz + Math.cos(h) * FILE_GAP * k;
        if (!nearBlock(ctx, x, z, opts.van, opts.blockClear) && ok(x, z, h, lo - 15, hi + 25)) return true;
      }
    }
  }
  const px = -az, pz = ax;
  const backs = opts.band ? [...BACKS, ...WIDE_BACKS].filter((b) => b >= lo && b <= hi) : BACKS;
  // le long d'un trottoir, sur une chaussée qui reste passante : d'abord assez large pour que la voie de droite passe à
  // côté du fourgon garé, sinon une voie libre au moins
  for (const minWidth of [WIDE_ROAD, MIN_ROAD]) for (const back of backs) {
    for (const side of SIDES) {
      const cx = lx + ax * back + px * side;
      const cz = lz + az * back + pz * side;
      if (!world.nearestRoad(cx, cz, ROAD, 15) || ROAD.width < minWidth) continue;
      const rh = ROAD.heading;
      const edge = Math.max(0, ROAD.width * 0.5 - 1.7);
      for (const f of [1, -1]) {
        const x = ROAD.x + Math.cos(rh) * edge * f;
        const z = ROAD.z - Math.sin(rh) * edge * f;
        if (nearBlock(ctx, x, z, opts.van, opts.blockClear)) continue;
        if (ok(x, z, facing(rh, ax, az), lo, hi)) return true;
      }
    }
  }
  return false;
}

/**
 * Dernier recours de remiseSpot (rues étroites, place piétonne, bloc de la compagnie partout) : la chaussée la plus
 * proche du point idéal (80 m derrière la ligne), en couronnes jusqu'à 120 m autour, du côté opposé à la foule ou sur le
 * côté (20 m derrière la ligne au moins), à 40–180 m d'elle, jamais dans le bloc des unités. false si aucune.
 */
export function remiseNearest(
  ctx: GameContext, lx: number, lz: number, ax: number, az: number, opts: RemiseSpotOptions, out: { x: number; z: number; heading: number },
): boolean {
  const world = ctx.world;
  const cx = lx + ax * 80, cz = lz + az * 80;
  for (let r = 0; r <= 120; r += 10) {
    const count = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 14));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      if (!world.nearestRoad(cx + Math.cos(a) * r, cz + Math.sin(a) * r, ROAD, 12) || ROAD.width < 5) continue;
      const rh = ROAD.heading;
      const edge = Math.max(0, ROAD.width * 0.5 - 1.7);
      for (const f of [1, -1]) {
        const x = ROAD.x + Math.cos(rh) * edge * f;
        const z = ROAD.z - Math.sin(rh) * edge * f;
        const d = Math.hypot(x - lx, z - lz);
        if ((x - lx) * ax + (z - lz) * az < NEAREST_BEHIND || d < REMISE_WIDE[0] || d > 180) continue;
        let free = true;
        for (let k = 0; k + 1 < opts.taken.length && free; k += 2) free = Math.hypot(opts.taken[k]! - x, opts.taken[k + 1]! - z) >= FILE_GAP - 0.5;
        const h = facing(rh, ax, az);
        if (!free || nearBlock(ctx, x, z, opts.van, opts.blockClear) || !vanFits(ctx, x, z, h, opts.len, opts.wid, opts.van, opts.people)) continue;
        if (opts.van) {
          const path: number[] = [];
          if (!world.findPath(opts.van.x, opts.van.z, x, z, 'vehicle', path, { heading: opts.van.heading, uturn: 60 })) continue;
        }
        out.x = x;
        out.z = z;
        out.heading = h;
        return true;
      }
    }
  }
  return false;
}

/**
 * Place pour un fourgon garé derrière le point (x, z) de cap `heading` (file de véhicules d'une compagnie créée à bord
 * sur la chaussée) : dans l'axe puis sur les files voisines, de 8 à 120 m en arrière. false si aucune.
 */
export function parkBehind(ctx: GameContext, x: number, z: number, heading: number, len: number, wid: number, out: { x: number; z: number; heading: number }): boolean {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  for (let back = 8; back <= 120; back += FILE_GAP) {
    for (const lat of [0, 3.6, -3.6]) {
      const px = x - fx * back - fz * lat;
      const pz = z - fz * back + fx * lat;
      if (!vanFits(ctx, px, pz, heading, len, wid, null, true)) continue;
      out.x = px;
      out.z = pz;
      out.heading = heading;
      return true;
    }
  }
  return false;
}

/** Cap de la voie `h` ou son opposé : celui qui tourne le dos à la foule (direction (ax, az)). */
function facing(h: number, ax: number, az: number): number {
  if (Math.sin(h) * ax + Math.cos(h) * az >= 0) return h;
  const o = h + Math.PI;
  return o > Math.PI ? o - Math.PI * 2 : o;
}

interface CommandLike {
  convoyOf?(squadId: number): { stage: string } | null;
}
interface FollowLike {
  inColumn(squadId: number): boolean;
}
interface ArrestsLike {
  busy?(vehicleId: number): boolean;
}
interface AutopilotLike {
  park(v: Vehicle, x: number, z: number, heading: number): boolean;
  driveTo(v: Vehicle, x: number, z: number, options?: { urgence?: boolean }): boolean;
  isActive(v: Vehicle): boolean;
  stop(v: Vehicle): void;
}

/** Étapes d'une colonne en cours : la compagnie n'a pas encore de ligne, le fourgon n'est pas libre. */
const CONVOY_BUSY: ReadonlySet<string> = new Set(['route', 'stationnement', 'debarquement', 'rembarquement', 'depart']);
/**
 * Étapes de la colonne de la compagnie où sa ligne n'existe pas encore : en route, en stationnement, au départ. (Pendant
 * le débarquement, dès que la plupart sont à pied — lineOf —, la ligne se forme : le point de remise peut être fixé.)
 */
const COMPANY_MOVING: ReadonlySet<string> = new Set(['route', 'stationnement', 'rembarquement', 'depart']);
/** Revue du point de remise (s), stabilité de la ligne exigée avant de déplacer les fourgons (s, m). */
const REVIEW = 2;
const STABLE_TIME = 10;
const STABLE_MOVE = 10;
/** Foule prise en compte autour de la ligne (m) et effectif minimal. */
const CROWD_REACH = 300;
const CROWD_MIN = 8;
/** Fourgon à moins de tant de mètres de sa place : il y est (m). */
const AT_SPOT = 15;
/** Fourgon parti rejoindre sa place depuis plus longtemps (manœuvre sans fin) : il s'arrête où il est (s). */
const DRIVE_MAX = 120;
/** Véhicules de la compagnie qui manœuvrent à moins de tant de mètres de sa ligne : on attend avant de déplacer les fourgons (m). */
const ROLL_NEAR = 150;

interface Entry {
  companyId: number;
  vans: number[];
  /** Ligne pour laquelle le point a été fixé, et sens « dos à la foule » par défaut (cap de la mise en place + π). */
  lineX: number;
  lineZ: number;
  has: boolean;
  awayX: number;
  awayZ: number;
  /** Places de chaque fourgon (même ordre que `vans`). */
  spots: { x: number; z: number; heading: number }[];
  sampleX: number;
  sampleZ: number;
  sampleT: number;
}

/**
 * Suivi des points de remise : une entrée par compagnie qui a des fourgons cellulaires (la première est celle du joueur).
 * Revue toutes les deux secondes (update) ; tout ce qui manque (compagnie dissoute, fourgon détruit) est ignoré.
 */
export class RemiseTracker implements RemiseApi {
  private ctx: GameContext | null = null;
  private readonly entries: Entry[] = [];
  private readonly allVans: number[] = [];
  private reviewAt = 0;
  /** Fourgons envoyés à leur place par ce suivi : véhicule → équipage et instant du départ (voir DRIVE_MAX). */
  private readonly sent = new Map<number, { squadId: number; at: number }>();
  /** Journée de service : pas de point de remise à la caserne (aucune foule autour de la ligne). */
  private journee = false;

  bind(ctx: GameContext): void {
    this.ctx = ctx;
  }

  clear(journee: boolean): void {
    this.entries.length = 0;
    this.allVans.length = 0;
    this.reviewAt = 0;
    this.sent.clear();
    this.journee = journee;
  }

  /**
   * Enregistre les fourgons d'une compagnie (`companyId` 0 : forces sans compagnie, la ligne est alors celle des
   * fourgons eux-mêmes). `away` : sens « dos à la foule » par défaut ; `spots` : places déjà prises à la création.
   */
  track(companyId: number, vans: readonly number[], awayHeading: number, line: { x: number; z: number } | null, spots: readonly { x: number; z: number; heading: number }[]): void {
    const e: Entry = {
      companyId, vans: [...vans], lineX: line ? line.x : 0, lineZ: line ? line.z : 0, has: line !== null && spots.length > 0,
      awayX: Math.sin(awayHeading), awayZ: Math.cos(awayHeading), spots: spots.map((s) => ({ ...s })), sampleX: 0, sampleZ: 0, sampleT: -1,
    };
    this.entries.push(e);
    for (const id of vans) if (this.allVans.indexOf(id) < 0) this.allVans.push(id);
  }

  point(): { x: number; z: number; heading: number } | null {
    const e = this.entries[0];
    if (!e || !e.has || e.spots.length === 0) return null;
    // la place du premier fourgon encore là ; à défaut la première place
    const s = e.spots[0]!;
    return { x: s.x, z: s.z, heading: s.heading };
  }

  vans(): readonly number[] {
    return this.allVans;
  }

  update(now: number): void {
    const ctx = this.ctx;
    if (!ctx || this.entries.length === 0 || now < this.reviewAt) return;
    this.reviewAt = now + REVIEW;
    this.unstick(ctx, now);
    for (const e of this.entries) {
      if (e.companyId !== 0) this.review(ctx, e, now);
    }
  }

  /**
   * Ligne de la compagnie (barycentre de ses agents à pied, hors équipages et motards) ; false si moins de quatre à pied
   * ou si la plupart sont à bord (elle embarque ou roule : pas de ligne).
   */
  private lineOf(ctx: GameContext, companyId: number, out: { x: number; z: number }): boolean {
    let n = 0, all = 0, sx = 0, sz = 0;
    const visit = (s: Squad | undefined, depth: number): void => {
      if (!s || depth > 8 || s.kind === 'equipage' || s.kind === 'binome') return;
      for (const id of s.members) {
        const p = ctx.people.get(id);
        if (!p || p.posture === 'down' || p.custody !== 'free' || p.poste === 'conducteur') continue;
        all++;
        if (p.vehicleId !== 0) continue;
        sx += p.x;
        sz += p.z;
        n++;
      }
      for (const k of ctx.squads.childrenOf(s.id)) visit(k, depth + 1);
    };
    visit(ctx.squads.get(companyId), 0);
    if (n < 4 || n < all * 0.5) return false;
    out.x = sx / n;
    out.z = sz / n;
    return true;
  }

  private review(ctx: GameContext, e: Entry, now: number): void {
    const company = ctx.squads.get(e.companyId);
    if (!company) return;
    const command = ctx.service<CommandLike>('police.command');
    const convoy = command && command.convoyOf ? command.convoyOf(e.companyId) : null;
    if (convoy && COMPANY_MOVING.has(convoy.stage)) {
      e.sampleT = -1;
      return;
    }
    // (la compagnie en colonne derrière le joueur, ou ses véhicules qui manœuvrent près d'elle : pas de ligne)
    const follow = ctx.service<FollowLike>('session.follow');
    const line = { x: 0, z: 0 };
    if ((follow && follow.inColumn(e.companyId)) || !this.lineOf(ctx, e.companyId, line) || this.rolling(ctx, e, line)) {
      e.sampleT = -1;
      return;
    }
    // la ligne doit être arrêtée : on ne court pas après une compagnie qui marche
    if (e.sampleT < 0 || Math.hypot(line.x - e.sampleX, line.z - e.sampleZ) > STABLE_MOVE) {
      e.sampleX = line.x;
      e.sampleZ = line.z;
      e.sampleT = now;
      if (e.has) return;
    }
    const stable = now - e.sampleT >= STABLE_TIME;
    if (e.has && (!stable || Math.hypot(line.x - e.lineX, line.z - e.lineZ) <= REMISE_MOVE)) return;
    // dos à la foule : la foule autour de la ligne ; sans foule, en journée de service (caserne), rien à fixer
    let cx = 0, cz = 0, cn = 0;
    for (const p of ctx.people.list) {
      if (p.faction !== 'protest' || p.dormant || p.custody !== 'free') continue;
      const dx = p.x - line.x, dz = p.z - line.z;
      if (dx * dx + dz * dz > CROWD_REACH * CROWD_REACH) continue;
      cx += p.x;
      cz += p.z;
      cn++;
    }
    let ax = e.awayX, az = e.awayZ;
    if (cn >= CROWD_MIN) {
      const dx = line.x - cx / cn, dz = line.z - cz / cn;
      const l = Math.hypot(dx, dz);
      if (l > 1) {
        ax = dx / l;
        az = dz / l;
      }
    } else if (this.journee) {
      return;
    }
    if (!e.has && !stable) return;
    const spots: { x: number; z: number; heading: number }[] = [];
    const taken: number[] = [];
    const spot = { x: 0, z: 0, heading: 0 };
    for (const id of e.vans) {
      const v = this.vanOf(ctx, id);
      if (!v) continue;
      const opts = { taken, van: v, len: v.def.length, wid: v.def.width, people: false, blockClear: BLOCK_CLEAR_ON_SITE };
      if (!remiseSpot(ctx, line.x, line.z, ax, az, opts, spot) && !remiseSpot(ctx, line.x, line.z, ax, az, { ...opts, band: REMISE_WIDE }, spot)
        && !remiseNearest(ctx, line.x, line.z, ax, az, opts, spot)) continue;
      spots.push({ ...spot });
      taken.push(spot.x, spot.z);
    }
    if (spots.length === 0) return;
    e.lineX = line.x;
    e.lineZ = line.z;
    e.awayX = ax;
    e.awayZ = az;
    e.has = true;
    e.spots = spots;
    // les fourgons disponibles rejoignent leur place, sans sirène
    const ap = ctx.service<AutopilotLike>('vehicles.autopilot');
    if (!ap) return;
    let k = 0;
    for (const id of e.vans) {
      const v = this.vanOf(ctx, id);
      if (!v || k >= spots.length) continue;
      const s = spots[k++]!;
      if (!this.available(ctx, id, v) || Math.hypot(v.x - s.x, v.z - s.z) < AT_SPOT) continue;
      if (ap.park(v, s.x, s.z, s.heading) || ap.driveTo(v, s.x, s.z, { urgence: false })) this.sent.set(v.id, { squadId: id, at: now });
    }
  }

  /**
   * Un véhicule de la compagnie (hors fourgons cellulaires) roule ou manœuvre au pilote automatique à moins de ROLL_NEAR m
   * de la ligne : colonne derrière le joueur, mouvement motorisé, sortie du stationnement. Un fourgon qui irait se garer
   * maintenant couperait la route de la colonne qui se forme. (Un véhicule parti loin, seul, ne retient pas la remise.)
   */
  private rolling(ctx: GameContext, e: Entry, line: { x: number; z: number }): boolean {
    const ap = ctx.service<AutopilotLike>('vehicles.autopilot');
    if (!ap) return false;
    let moving = false;
    const visit = (s: Squad | undefined, depth: number): void => {
      if (!s || depth > 8 || moving) return;
      const v = s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
      // (les motos de la BRAV-M, qui suit le joueur en selle à sa place, ne retiennent pas la remise)
      if (v && v.kind !== 'fourgon_cellulaire' && v.kind !== 'moto_bravm' && !v.def.flying && ap.isActive(v) && Math.hypot(v.x - line.x, v.z - line.z) < ROLL_NEAR) moving = true;
      for (const k of ctx.squads.childrenOf(s.id)) visit(k, depth + 1);
    };
    visit(ctx.squads.get(e.companyId), 0);
    return moving;
  }

  /**
   * Fourgon parti rejoindre sa place depuis plus de DRIVE_MAX s (manœuvre sans fin) : il s'arrête où il est. Un fourgon
   * repris depuis par un ordre du joueur ou une colonne n'est plus à ce suivi.
   */
  private unstick(ctx: GameContext, now: number): void {
    const ap = ctx.service<AutopilotLike>('vehicles.autopilot');
    const command = ctx.service<CommandLike>('police.command');
    for (const [id, run] of this.sent) {
      const v = ctx.vehicles.get(id);
      const s = ctx.squads.get(run.squadId);
      const convoy = command && command.convoyOf ? command.convoyOf(run.squadId) : null;
      if (!v || !ap || !ap.isActive(v) || !s || s.order.byPlayer === true || (convoy && CONVOY_BUSY.has(convoy.stage))) {
        this.sent.delete(id);
        continue;
      }
      if (now - run.at < DRIVE_MAX) continue;
      ap.stop(v);
      this.sent.delete(id);
    }
  }

  /** Véhicule du fourgon cellulaire de l'équipage `squadId` (null s'il n'existe plus ou est hors d'usage). */
  private vanOf(ctx: GameContext, squadId: number): Vehicle | null {
    const s = ctx.squads.get(squadId);
    const v = s && s.vehicleId !== 0 ? ctx.vehicles.get(s.vehicleId) : undefined;
    if (!v || v.kind !== 'fourgon_cellulaire' || v.state === 'wrecked' || v.state === 'burnt') return null;
    return v;
  }

  /**
   * Fourgon qu'on peut déplacer : conducteur à bord, aucun ordre du joueur, ni colonne en cours (transfert au
   * commissariat, mouvement motorisé), ni colonne derrière le joueur, ni le joueur à bord, ni pilote automatique occupé.
   */
  private available(ctx: GameContext, squadId: number, v: Vehicle): boolean {
    const s = ctx.squads.get(squadId);
    if (!s || s.order.byPlayer === true) return false;
    if (v.seats[0] === 0) return false;
    const me = ctx.player.person();
    if (me && me.vehicleId === v.id) return false;
    const command = ctx.service<CommandLike>('police.command');
    const convoy = command && command.convoyOf ? command.convoyOf(squadId) : null;
    if (convoy && CONVOY_BUSY.has(convoy.stage)) return false;
    const follow = ctx.service<FollowLike>('session.follow');
    if (follow && follow.inColumn(squadId)) return false;
    // (fourgon appelé pour une interpellation, ou attendu par un binôme qui y conduit un interpellé : police.arrests)
    const arrests = ctx.service<ArrestsLike>('police.arrests');
    if (arrests && typeof arrests.busy === 'function' && arrests.busy(v.id)) return false;
    const ap = ctx.service<AutopilotLike>('vehicles.autopilot');
    return !(ap && ap.isActive(v));
  }
}
