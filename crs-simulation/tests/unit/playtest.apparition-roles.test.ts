// Point de départ de chaque rôle : jamais enfermé (cour d'immeuble), jamais dans un mur, toujours une sortie à pied et
// en véhicule. Le joueur se plaignait de commencer, à la BRAV-M, dans une cour d'immeuble d'où il ne pouvait pas sortir.
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
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
import { createSystems as session } from '@/gameplay/session';
import { buildSessionConfig, defaultDraft } from '@/ui/screens/scenario';
import type { ScenarioDraft } from '@/ui/screens/scenario';
import { DEFAULT_PLACES } from '@/ui/screens/catalog';
import type { GameContext, Vehicle } from '@/core/contracts';
import { BRAVM_BASES, SERVICE_BASES, bravmBaseOf } from '@/gameplay/session/journee-data';
import { roadSpot } from '@/gameplay/session/placement';
import { SESSION_SETUP_SERVICE } from '@/gameplay/session';
import { ScriptedInput, createScriptedInputSystem } from '@/sim/people/testkit';
import { AUTOPILOT_SERVICE } from '@/sim/vehicles/api';
import type { AutopilotApi } from '@/sim/vehicles/api';
import type { SessionSetupApi } from '@/gameplay/session';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];

/** Rôles, postes et variantes jouables (page d'accueil, catalog.ts). */
const ROLES: readonly { role: string; poste?: string; variante?: string }[] = [
  ...['bouclier', 'lanceur', 'lbd', 'extincteur', 'interpellation', 'conducteur'].map((poste) => ({ role: 'crs', poste })),
  { role: 'chef_groupe', poste: 'chef_groupe' }, { role: 'chef_groupe', poste: 'chef_section' },
  { role: 'commandant', variante: 'terrain' }, { role: 'commandant', variante: 'salle' },
  { role: 'commissaire' },
  { role: 'bravm', poste: 'passager_moto' }, { role: 'bravm', poste: 'pilote_moto' },
  { role: 'gendarme_centaure' }, { role: 'operateur_canon_eau' }, { role: 'telepilote' },
  { role: 'street_medic' }, { role: 'secouriste', variante: 'pompier' }, { role: 'secouriste', variante: 'samu' },
  { role: 'journaliste' },
  { role: 'manifestant', variante: 'pacifique' }, { role: 'manifestant', variante: 'service_ordre' }, { role: 'manifestant', variante: 'radical' },
];
const POLICE = new Set(['crs', 'chef_groupe', 'commandant', 'commissaire', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote']);
/** Véhicule propre du rôle : à portée du joueur au départ (40 m) ou le joueur à bord. */
const OWN_KIND: Readonly<Record<string, string>> = {
  bravm: 'moto_bravm', gendarme_centaure: 'centaure', operateur_canon_eau: 'canon_eau', telepilote: 'voiture_police',
};
/** Distance à parcourir sans traverser le décor pour être « dehors » (m) : une cour d'immeuble en est loin. */
const OUT = 60;

/**
 * Remplissage sur une grille de 1 m depuis (x, z) avec un disque de rayon r, sans traverser le décor ni l'eau.
 * Retourne la grille des cases atteintes (centre = (x, z)) et la plus grande distance atteinte.
 */
function flood(ctx: GameContext, x: number, z: number, r: number, limit: number): { seen: Uint8Array; steps: Int32Array; n: number; reach: number } {
  const N = limit * 2 + 1;
  const seen = new Uint8Array(N * N);
  const steps = new Int32Array(N * N);
  const qx: number[] = [limit];
  const qz: number[] = [limit];
  seen[limit * N + limit] = 1;
  let reach = 0;
  for (let h = 0; h < qx.length; h++) {
    const i = qx[h]!, k = qz[h]!;
    const d = Math.hypot(i - limit, k - limit);
    if (d > reach) reach = d;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di, nk = k + dk;
      if (ni < 0 || nk < 0 || ni >= N || nk >= N || seen[nk * N + ni]) continue;
      if (Math.hypot(ni - limit, nk - limit) > limit) continue;
      const px = x + ni - limit, pz = z + nk - limit;
      const s = ctx.world.surfaceAt(px, pz);
      if (s === 'water' || s === 'building' || !ctx.world.isFree(px, pz, r)) continue;
      seen[nk * N + ni] = 1;
      steps[nk * N + ni] = steps[k * N + i]! + 1;
      qx.push(ni); qz.push(nk);
    }
  }
  return { seen, steps, n: N, reach };
}

function reached(f: { seen: Uint8Array; n: number }, ox: number, oz: number, x: number, z: number): boolean {
  const lim = (f.n - 1) / 2;
  const ci = Math.round(x - ox) + lim, ck = Math.round(z - oz) + lim;
  for (let di = -1; di <= 1; di++) {
    for (let dk = -1; dk <= 1; dk++) {
      const i = ci + di, k = ck + dk;
      if (i >= 0 && k >= 0 && i < f.n && k < f.n && f.seen[k * f.n + i]) return true;
    }
  }
  return false;
}

function polyLength(p: readonly number[]): number {
  let l = 0;
  for (let i = 0; i + 3 < p.length; i += 2) l += Math.hypot(p[i + 2]! - p[i]!, p[i + 3]! - p[i + 1]!);
  return l;
}

/** Le point est-il dans l'emprise d'un véhicule (autre que `except`) ? */
function underVehicle(ctx: GameContext, x: number, z: number, except: number): Vehicle | null {
  for (const v of ctx.vehicles.list) {
    if (v.id === except) continue;
    const dx = x - v.x, dz = z - v.z;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const lon = dx * fx + dz * fz, lat = dx * -fz + dz * fx;
    if (Math.abs(lon) < v.def.length * 0.5 && Math.abs(lat) < v.def.width * 0.5) return v;
  }
  return null;
}

/** Défauts relevés hors de la mise en place (module de police) : affichés, sans faire échouer la matrice. */
const softs: string[] = [];
const DRIVABLE = new Set(['road', 'plaza', 'sett', 'sidewalk', 'gravel', 'quay', 'bridge', 'void']);

/** Véhicules propres au joueur : ceux de son unité racine et de toutes ses sous-unités, celui où il est assis. */
function ownVehicles(ctx: GameContext): Vehicle[] {
  const me = ctx.player.person()!;
  const out = new Set<number>();
  if (me.vehicleId !== 0) out.add(me.vehicleId);
  let root = me.squadId ? ctx.squads.get(me.squadId) : undefined;
  for (let g = 0; root && root.parentId !== 0 && g < 8; g++) root = ctx.squads.get(root.parentId) ?? root;
  const todo = root ? [root] : [];
  for (let h = 0; h < todo.length; h++) {
    const sq = todo[h]!;
    if (sq.vehicleId) out.add(sq.vehicleId);
    for (const c of ctx.squads.childrenOf(sq.id)) todo.push(c);
  }
  // véhicules de l'équipe propre du joueur qui ne sont rattachés à aucune unité (deuxième et troisième motos d'une BRAV-M)
  const summary = ctx.service<SessionSetupApi>(SESSION_SETUP_SERVICE)?.summary;
  const assigned = new Set<number>();
  for (const sq of ctx.squads.list) if (sq.vehicleId) assigned.add(sq.vehicleId);
  for (const id of summary ? summary.vehicleIds : []) {
    if (assigned.has(id)) continue;
    const v = ctx.vehicles.get(id);
    if (v && OWN_KIND[ctx.session.config!.role] === v.kind && Math.hypot(v.x - me.x, v.z - me.z) < 120) out.add(id);
  }
  return [...out].map((id) => ctx.vehicles.get(id)).filter((v): v is Vehicle => !!v);
}

/** Toutes les vérifications du point de départ ; retourne la liste des défauts (vide : tout va bien). */
function inspect(ctx: GameContext): string[] {
  const bad: string[] = [];
  const me = ctx.player.person();
  if (!me) return ['pas de joueur'];
  const b = ctx.world.bounds;
  const inside = (x: number, z: number): boolean => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  if (!inside(me.x, me.z)) bad.push('joueur hors carte');
  if (me.vehicleId === 0) {
    const s = ctx.world.surfaceAt(me.x, me.z);
    if (s === 'building' || s === 'interior' || s === 'water') bad.push(`joueur sur « ${s} »`);
    if (!ctx.world.isFree(me.x, me.z, 0.3)) bad.push('joueur dans le décor');
    // (une voiture garée par la circulation APRÈS la mise en place est un défaut du module de circulation, suivi à part :
    // seuls les véhicules des forces et des secours, posés par la mise en place, comptent ici)
    const v = underVehicle(ctx, me.x, me.z, 0);
    if (v && v.faction !== 'civil') bad.push(`joueur sous ${v.kind}`);
  }
  const f = flood(ctx, me.x, me.z, 0.35, 200);
  if (f.reach < OUT) bad.push(`joueur enfermé (sortie ${f.reach.toFixed(0)} m)`);
  // un itinéraire à pied vers le lieu de la session, sans détour absurde
  const cfg = ctx.session.config!;
  const tx = cfg.x ?? me.x, tz = cfg.z ?? me.z;
  const straight = Math.hypot(tx - me.x, tz - me.z);
  if (straight > 30 && straight < 175) {
    // marche réelle sur la grille ; le lieu lui-même est souvent un monument (la Madeleine) : on vise le sol libre le
    // plus proche de son centre, à 12 m près
    let ground = 0;
    for (let rr = 0; rr <= 90 && ground === 0; rr += 2) {
      for (let a = 0; a < 32; a++) {
        const gx = tx + Math.cos((a / 32) * Math.PI * 2) * rr, gz = tz + Math.sin((a / 32) * Math.PI * 2) * rr;
        const sg = ctx.world.surfaceAt(gx, gz);
        if (sg !== 'building' && sg !== 'water' && ctx.world.isFree(gx, gz, 0.35)) { ground = Math.max(1, rr); break; }
      }
    }
    const R = Math.round(ground + 12);
    let walk = Infinity;
    const lim = (f.n - 1) / 2;
    for (let dk = -R; dk <= R; dk++) {
      for (let di = -R; di <= R; di++) {
        if (di * di + dk * dk > R * R) continue;
        const i = Math.round(tx - me.x) + lim + di, k = Math.round(tz - me.z) + lim + dk;
        if (i < 0 || k < 0 || i >= f.n || k >= f.n || !f.seen[k * f.n + i]) continue;
        walk = Math.min(walk, f.steps[k * f.n + i]!);
      }
    }
    // (pas de 1 m en quatre directions : jusqu'à √2 de plus que la marche réelle)
    if (walk === Infinity) bad.push(`lieu inaccessible à pied (${straight.toFixed(0)} m)`);
    else if (walk > 2.5 * 1.42 * straight + 20) bad.push(`marche de ${walk} m pour ${straight.toFixed(0)} m`);
  } else if (straight >= 175) {
    const path: number[] = [];
    if (!ctx.world.findPath(me.x, me.z, tx, tz, 'foot', path)) bad.push('aucun itinéraire à pied vers le lieu');
  }
  for (const v of ownVehicles(ctx)) {
    if (!inside(v.x, v.z)) bad.push(`${v.kind} hors carte`);
    const d = Math.hypot(v.x - me.x, v.z - me.z);
    if (me.vehicleId !== v.id && d > 40 && OWN_KIND[ctx.session.config!.role] === v.kind) bad.push(`${v.kind} à ${d.toFixed(0)} m`);
    const s = ctx.world.surfaceAt(v.x, v.z);
    // (les fourgons de la compagnie sont garés par le module de police, qui ne regarde pas encore le sol : une pelouse y
    // est signalée à part, seul le bâti et l'eau comptent ici)
    if (!DRIVABLE.has(s) && !(v.kind === 'fourgon_crs' && s === 'park')) bad.push(`${v.kind} sur « ${s} »`);
    else if (!DRIVABLE.has(s)) softs.push(`${v.kind} sur « ${s} »`);
    const r = Math.min(1.2, v.def.width * 0.5);
    if (!ctx.world.isFree(v.x, v.z, r)) bad.push(`${v.kind} dans le décor`);
    const fv = flood(ctx, v.x, v.z, r, OUT + 2);
    if (fv.reach < OUT) bad.push(`${v.kind} enfermé (sortie ${fv.reach.toFixed(0)} m)`);
    if (!v.def.flying && Math.hypot(tx - v.x, tz - v.z) > 50) {
      const route: number[] = [];
      if (!ctx.world.findPath(v.x, v.z, tx, tz, 'vehicle', route, { heading: v.heading, uturn: 20 })) bad.push(`${v.kind} sans itinéraire routier vers le lieu`);
    }
  }
  // l'unité du joueur : sur un sol libre, capable de le rejoindre à pied
  const root = me.squadId ? ctx.squads.get(me.squadId) : undefined;
  if (root) {
    for (const id of root.members) {
      const p = ctx.people.get(id);
      if (!p || p === me || p.vehicleId !== 0) continue;
      if (!inside(p.x, p.z)) bad.push(`équipier ${p.poste} hors carte`);
      else if (!ctx.world.isFree(p.x, p.z, 0.25)) bad.push(`équipier ${p.poste} dans le décor`);
      else if (['building', 'interior', 'water'].indexOf(ctx.world.surfaceAt(p.x, p.z)) >= 0) bad.push(`équipier ${p.poste} sur « ${ctx.world.surfaceAt(p.x, p.z)} »`);
      else if (Math.hypot(p.x - me.x, p.z - me.z) < 140 && !reached(f, me.x, me.z, p.x, p.z)) bad.push(`équipier ${p.poste} coupé du joueur`);
    }
  }
  return bad;
}

const wrapA = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Une destination à pied ou en véhicule à au moins `min` m : le lieu de la session s'il est assez loin, sinon un point
 * du réseau de rues dans l'une de douze directions. Retourne l'itinéraire (polyligne) ou un défaut.
 */
function routeOut(ctx: GameContext, x: number, z: number, mode: 'foot' | 'vehicle', min: number, heading = 0): { path: number[]; straight: number } | string {
  const cfg = ctx.session.config!;
  const targets: [number, number][] = [];
  if (typeof cfg.x === 'number' && typeof cfg.z === 'number' && Math.hypot(cfg.x - x, cfg.z - z) >= min) targets.push([cfg.x, cfg.z]);
  const rs = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as never, oneway: false };
  for (let a = 0; a < 12; a++) {
    const tx = x + Math.sin((a / 12) * Math.PI * 2) * (min + 60), tz = z + Math.cos((a / 12) * Math.PI * 2) * (min + 60);
    if (ctx.world.nearestRoad(tx, tz, rs, 120) && Math.hypot(rs.x - x, rs.z - z) >= min) targets.push([rs.x, rs.z]);
  }
  let last = 'aucune destination';
  for (const [tx, tz] of targets) {
    const path: number[] = [];
    const ok = mode === 'foot' ? ctx.world.findPath(x, z, tx, tz, 'foot', path) : ctx.world.findPath(x, z, tx, tz, 'vehicle', path, { heading, uturn: 20 });
    if (!ok || path.length < 4) { last = `aucun itinéraire ${mode === 'foot' ? 'à pied' : 'routier'}`; continue; }
    const straight = Math.hypot(tx - x, tz - z);
    const len = polyLength(path);
    if (len > 2.5 * straight + 30) { last = `itinéraire ${mode === 'foot' ? 'à pied' : 'routier'} de ${len.toFixed(0)} m pour ${straight.toFixed(0)} m`; continue; }
    return { path, straight };
  }
  return last;
}

/**
 * Premier tronçon d'un itinéraire à pied qui traverse un mur (les bouts de l'itinéraire sont des lignes droites) :
 * distance du départ (m) et description ; null si aucun.
 */
function legThroughWall(ctx: GameContext, path: readonly number[]): { at: number; msg: string } | null {
  const hit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
  let at = 0;
  for (let i = 0; i + 3 < path.length; i += 2) {
    const len = Math.hypot(path[i + 2]! - path[i]!, path[i + 3]! - path[i + 1]!);
    if (ctx.world.raycast(path[i]!, path[i + 1]!, path[i + 2]!, path[i + 3]!, hit as never)) {
      return { at: at + hit.t * len, msg: `itinéraire à pied à travers un mur (${hit.kind}) à ${(at + hit.t * len).toFixed(0)} m, en (${hit.x.toFixed(0)}, ${hit.z.toFixed(0)})` };
    }
    at += len;
  }
  return null;
}

/** Direction de marche dégagée (décor, véhicules, personnes sur 3 m) la plus proche de `yaw`. */
function detour(ctx: GameContext, x: number, z: number, yaw: number): number {
  const me = ctx.player.person()!;
  const hit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
  let best = yaw;
  let bestScore = -Infinity;
  for (let a = 0; a < 24; a++) {
    const h = yaw + ((a % 2 ? 1 : -1) * Math.ceil(a / 2) * Math.PI * 2) / 24;
    const fx = Math.sin(h), fz = Math.cos(h);
    if (ctx.world.raycast(x, z, x + fx * 3, z + fz * 3, hit as never)) continue;
    if (ctx.vehicles.raycast(x, z, x + fx * 3, z + fz * 3, hit as never, 'move')) continue;
    let crowd = 0;
    for (const d of [1, 2, 3]) crowd += ctx.people.countIn(x + fx * d, z + fz * d, 0.6, (q) => q !== me && q.vehicleId === 0);
    const score = Math.cos(h - yaw) - crowd * 0.8;
    if (score > bestScore) { bestScore = score; best = h; }
  }
  return best;
}

/** Ce qui arrête le bot (pour le diagnostic) : décor sur 3 m vers le point visé, véhicules et personnes au contact. */
function blocker(ctx: GameContext, x: number, z: number, tx: number, tz: number): string {
  const me = ctx.player.person()!;
  const d = Math.hypot(tx - x, tz - z) || 1;
  const hit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
  const out: string[] = [];
  if (ctx.world.raycast(x, z, x + ((tx - x) / d) * 3, z + ((tz - z) / d) * 3, hit as never)) out.push(`décor ${hit.kind} à ${(hit.t * 3).toFixed(1)} m (${ctx.world.surfaceAt(hit.x, hit.z)})`);
  for (const v of ctx.vehicles.list) {
    if (v.id !== me.vehicleId && Math.hypot(v.x - x, v.z - z) < v.def.length * 0.5 + 3) out.push(`${v.kind}#${v.id} (${v.faction}) à ${Math.hypot(v.x - x, v.z - z).toFixed(1)} m`);
  }
  if (me.vehicleId) {
    const v = ctx.vehicles.get(me.vehicleId)!;
    const around: string[] = [];
    for (let a = 0; a < 16; a++) {
      const h = v.heading + (a / 16) * Math.PI * 2;
      const L = Math.abs(Math.cos(a / 16 * Math.PI * 2)) * v.def.length * 0.5 + Math.abs(Math.sin(a / 16 * Math.PI * 2)) * v.def.width * 0.5 + 1.2;
      if (ctx.world.raycast(x, z, x + Math.sin(h) * L, z + Math.cos(h) * L, hit as never)) around.push(`${a}:${hit.kind}@${(hit.t * L).toFixed(1)}`);
    }
    if (around.length) out.push(`autour (cap ${v.heading.toFixed(2)}, 0 = avant) ${around.join(' ')}`);
  }
  const props: { kind: string; x: number; z: number; blocksMove: boolean }[] = [];
  const np = ctx.props.queryRadius(x, z, me.vehicleId ? 5 : 2.5, props as never[]);
  for (let i = 0; i < np; i++) if (props[i]!.blocksMove) out.push(`${props[i]!.kind} à ${Math.hypot(props[i]!.x - x, props[i]!.z - z).toFixed(1)} m`);
  const n = ctx.people.countIn(x, z, 2.5, (q) => q !== me && q.vehicleId === 0);
  if (n) out.push(`${n} personnes`);
  return out.length ? ` [${out.join(', ')}]` : ' [rien]';
}

/**
 * Le bot suit l'itinéraire au clavier (avant maintenu, caméra tournée vers le point suivant) — à pied, ou au volant
 * s'il est conducteur — sur `dist` m d'itinéraire. Retourne '' ou le défaut (bloqué, trop lent).
 */
function follow(t: ReturnType<typeof createTestContext>, input: ScriptedInput, path: readonly number[], dist: number, seconds: number): { msg: string; done: number } {
  const ctx = t.ctx;
  const me = ctx.player.person()!;
  const pos = (): { x: number; z: number } => {
    const v = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
    return v ? { x: v.x, z: v.z } : { x: me.x, z: me.z };
  };
  // abscisse curviligne de chaque point
  const s: number[] = [0];
  for (let i = 2; i + 1 < path.length; i += 2) s.push(s[s.length - 1]! + Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!));
  let k = 1;
  let kt = 0;
  let ax = pos().x, az = pos().z;
  let since = 0;
  for (let time = 0; time < seconds; time += 0.1) {
    const p = pos();
    // point atteint — ou presque, quand un véhicule garé l'occupe (on tourne autour depuis 8 s)
    const near = (): number => (me.vehicleId ? 6 : since > 3 ? 4 : time - kt > 8 ? 8 : 2);
    while (k < s.length - 1 && Math.hypot(path[k * 2]! - p.x, path[k * 2 + 1]! - p.z) < near()) { k++; kt = time; }
    if (s[k - 1]! >= dist || (k >= s.length - 1 && Math.hypot(path[k * 2]! - p.x, path[k * 2 + 1]! - p.z) < 3)) { input.setMove(0, 0); return { msg: '', done: s[k - 1]! }; }
    const tx = path[k * 2]!, tz = path[k * 2 + 1]!;
    // bloqué : moins de 1,5 m parcouru en 12 s, manœuvres comprises
    if (Math.hypot(p.x - ax, p.z - az) > 1.5) { ax = p.x; az = p.z; since = 0; } else if ((since += 0.1) > 12) {
      input.setMove(0, 0);
      return { msg: `bloqué après ${s[k - 1]!.toFixed(0)} m en (${p.x.toFixed(0)}, ${p.z.toFixed(0)})${blocker(ctx, p.x, p.z, path[k * 2]!, path[k * 2 + 1]!)}`, done: s[k - 1]! };
    }
    const yaw = Math.atan2(tx - p.x, tz - p.z);
    if (process.env['APPARITION_DEBUG'] && Math.round(time * 10) % 10 === 0) {
      const vv = me.vehicleId ? ctx.vehicles.get(me.vehicleId)! : undefined;
      console.log(`t=${time.toFixed(1)} k=${k} p=${p.x.toFixed(1)},${p.z.toFixed(1)} tgt=${tx.toFixed(0)},${tz.toFixed(0)} yaw=${yaw.toFixed(2)} ` + (vv ? `h=${vv.heading.toFixed(2)} v=${vv.speed.toFixed(1)} thr=${vv.cmd.throttle} st=${vv.cmd.steer.toFixed(2)} hb=${vv.cmd.handbrake} eng=${vv.engineOn} ctl=${ctx.player.state.controlEnabled} modal=${ctx.ui.modal}` : `gait=${me.cmd.gait} spd=${Math.hypot(me.vx, me.vz).toFixed(1)}`));
    }
    const v = me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
    // comme un joueur : coincé depuis 2 s, on manœuvre (marche arrière braquée en véhicule, pas de côté à pied) par
    // phases de 2 s, côté alterné
    const jam = since > 2 ? Math.floor((since - 2) / 2) : -1;
    const side = jam >= 0 && jam % 2 === 0 ? 1 : -1;
    if (v) {
      // au volant : le volant (moveX, +1 = à droite ; un cap qui croît tourne à gauche), l'accélérateur (moveY)
      const off = wrapA(yaw - v.heading);
      const steer = Math.max(-1, Math.min(1, -off * 2.5));
      if (jam >= 0 && jam % 2 === 0) input.setMove(-steer || side, -1);
      else {
        // allure prudente : 7 m/s en ligne droite, 4 m/s dans les virages
        const want = Math.abs(off) > 0.4 ? 4 : 7;
        input.setMove(steer, v.speed > want + 1.5 ? -0.6 : v.speed > want ? 0 : Math.abs(off) > 1.2 ? 0.7 : 1);
      }
    } else {
      // à pied, coincé depuis 1 s (rangs de la compagnie, véhicule garé sur le point visé) : on contourne par la
      // direction dégagée la plus proche du but, comme le ferait le joueur
      const dir = since > 1 ? detour(ctx, me.x, me.z, yaw) : yaw;
      input.look(wrapA(ctx.player.state.camYaw - dir), 0);
      input.setMove(0, 1);
    }
    t.step(0.1);
  }
  input.setMove(0, 0);
  return { msg: `trop lent (${seconds} s)`, done: s[k - 1]! };
}

/**
 * La foule et la circulation civile sont retirées avant la marche et la conduite : on éprouve le point de départ (murs,
 * cours, véhicules garés des forces), pas la traversée d'un rassemblement de 150 personnes.
 */
function clearCivilians(ctx: GameContext): void {
  const me = ctx.player.person()!;
  for (const v of [...ctx.vehicles.list]) if (v.faction === 'civil' && v.id !== me.vehicleId) ctx.vehicles.remove(v.id);
  for (const p of [...ctx.people.list]) if (p !== me && p.faction !== 'police' && p.vehicleId === 0 && p.squadId !== me.squadId) ctx.people.remove(p.id);
  ctx.people.rebuildIndex();
}

/** Sortie à pied : itinéraire vers une rue à 250 m, tronçons hors des murs, puis le bot en marche 150 m. */
function walkOut(t: ReturnType<typeof createTestContext>, input: ScriptedInput): string[] {
  const ctx = t.ctx;
  const me = ctx.player.person()!;
  if (me.vehicleId !== 0) return [];
  clearCivilians(ctx);
  const r = routeOut(ctx, me.x, me.z, 'foot', 250);
  if (typeof r === 'string') return [r];
  const wall = legThroughWall(ctx, r.path);
  // (un mur coupé loin du départ est un défaut du calcul d'itinéraire, pas de la mise en place)
  if (wall && wall.at < 60) return [wall.msg];
  if (wall) softs.push(wall.msg);
  const res = follow(t, input, r.path, 150, 150);
  if (!res.msg) return [];
  // sorti de son point de départ (60 m), le joueur bute plus loin (barrières Vauban du dispositif, mur coupé par
  // l'itinéraire) : signalé à part, ce n'est plus la mise en place
  // (de même, une rue barrée par la circulation — barrières Vauban — n'est pas la mise en place)
  if (res.done >= 60 || res.msg.indexOf('barriere_vauban') >= 0) { softs.push(`marche : ${res.msg}`); return []; }
  return [`marche : ${res.msg}`];
}

/**
 * Sortie en véhicule : le pilote automatique (celui des colonnes, qui conduit quand le joueur est passager) emmène le
 * véhicule du joueur à 300 m par les rues ; le joueur pilote descend et laisse le volant à un équipier.
 */
function driveOut(t: ReturnType<typeof createTestContext>, v: Vehicle): string[] {
  const ctx = t.ctx;
  const me = ctx.player.person()!;
  const ap = ctx.service<AutopilotApi>(AUTOPILOT_SERVICE);
  if (!ap) return ['pas de pilote automatique'];
  clearCivilians(ctx);
  if (v.seats[0] === me.id) ctx.vehicles.exit(me);
  if (!v.seats[0]) {
    const mate = ctx.people.list.find((q) => q !== me && q.faction === 'police' && q.vehicleId === 0 && Math.hypot(q.x - v.x, q.z - v.z) < 30);
    if (mate) ctx.vehicles.enter(mate, v, 0);
  }
  v.cmd.handbrake = false;
  const r = routeOut(ctx, v.x, v.z, 'vehicle', 300, v.heading);
  if (typeof r === 'string') return [`${v.kind} : ${r}`];
  const tx = r.path[r.path.length - 2]!, tz = r.path[r.path.length - 1]!;
  if (!ap.driveTo(v, tx, tz)) return [`${v.kind} : le pilote automatique refuse l'itinéraire`];
  let odo = 0;
  let px = v.x, pz = v.z;
  let still = 0;
  for (let time = 0; time < 150; time += 0.5) {
    t.step(0.5);
    const d = Math.hypot(v.x - px, v.z - pz);
    odo += d;
    px = v.x; pz = v.z;
    still = d < 0.3 ? still + 0.5 : 0;
    const st = ap.status(v);
    if (odo >= 300 || st.state === 'arrive') return [];
    if (still > 20 || st.state === 'echec') {
      const msg = `${v.kind} (pilote automatique) : ${st.state} ${st.reason} après ${odo.toFixed(0)} m en (${v.x.toFixed(0)}, ${v.z.toFixed(0)})`;
      // sorti de son point de départ (60 m), le véhicule bute plus loin sur le parcours : ce n'est plus la mise en place
      if (odo >= 60 || !STRICT_DRIVE) { softs.push(msg); return []; }
      return [msg];
    }
  }
  const msg = `${v.kind} (pilote automatique) : ${odo.toFixed(0)} m en 150 s`;
  if (odo >= 60 || !STRICT_DRIVE) { softs.push(msg); return []; }
  return [msg];
}

function configOf(r:{ role: string; poste?: string; variante?: string }, place: (typeof DEFAULT_PLACES)[number], mode: 'libre' | 'journee' | 'monde_ouvert'): ReturnType<typeof buildSessionConfig> {
  const d: ScenarioDraft = { ...defaultDraft(), role: r.role as never, poste: (r.poste ?? null) as never, variante: r.variante ?? '', place: place.name, x: place.x, z: place.z, crowdSize: 150, seed: 3 };
  d.mode = mode === 'monde_ouvert' ? 'monde_ouvert' : 'libre';
  d.options = { ...d.options, journee: mode === 'journee' };
  return buildSessionConfig(d);
}

const ONLY = process.env['APPARITION'] ?? '';
/** Marche et conduite réelles (désactivables : APPARITION_STATIQUE=1). */
const DYN = !process.env['APPARITION_STATIQUE'];
/**
 * Départ en véhicule seul au pilote automatique (long : 150 s simulées par véhicule) : APPARITION_CONDUITE=1 le lance,
 * en le signalant à part — le pilote automatique attend encore devant les équipiers et les véhicules garés de sa propre
 * unité (modules véhicules et police) ; APPARITION_CONDUITE=strict le rend bloquant.
 */
const DRIVE = !!process.env['APPARITION_CONDUITE'];
const STRICT_DRIVE = process.env['APPARITION_CONDUITE'] === 'strict';
/** Un seul cas (sous-chaîne de « mode lieu rôle/poste ») : APPARITION_CAS='libre Place de la Concorde gendarme'. */
const CASE = process.env['APPARITION_CAS'] ?? '';
const OPEN_PLACES = ['Place de la Concorde', 'Châtelet', 'Esplanade des Invalides'];

describe('point de départ de chaque rôle', () => {
  it('bases de prise de service : chaque caserne ou commissariat est sur la voie, avec une sortie et de quoi garer', async () => {
    const t = createTestContext({ seed: 3, strict: false, modules: [world, people, vehicles, props] });
    await t.start({ mode: 'libre', role: 'journaliste', place: 'x', x: 1760, z: 1225, crowdSize: 0 });
    const { ctx } = t;
    const bad: string[] = [];
    for (const b of [...SERVICE_BASES, ...BRAVM_BASES]) {
      await ctx.world.whenLoaded(b.x, b.z, 250);
      const s = ctx.world.surfaceAt(b.x, b.z);
      if (s === 'building' || s === 'interior' || s === 'water' || !ctx.world.isFree(b.x, b.z, 0.6)) bad.push(`${b.name} : dans le bâti (${s})`);
      else if (flood(ctx, b.x, b.z, 0.6, OUT + 2).reach < OUT) bad.push(`${b.name} : enclos`);
      const sp = { x: 0, z: 0, heading: 0 };
      // les motos de la BRAV-M et les fourgons se garent sur la chaussée devant l'entrée
      if (!roadSpot(ctx, b.x, b.z, 12, 3, sp) || Math.hypot(sp.x - b.x, sp.z - b.z) > 30) bad.push(`${b.name} : pas de chaussée devant`);
    }
    expect(bad).toEqual([]);
  }, 300000);

  it('BRAV-M du joueur en journée de service (caserne de la Cité) : ni lui ni ses motos dans la cour du Palais', async () => {
    const t = createTestContext({ seed: 3, strict: false, modules: SIM });
    const place = DEFAULT_PLACES[0]!;
    for (const poste of ['pilote_moto', 'passager_moto']) {
      await t.start(configOf({ role: 'bravm', poste }, place, 'journee'));
      const { ctx } = t;
      const me = ctx.player.person()!;
      expect(Math.hypot(me.x - 1760, me.z - 1225)).toBeLessThan(250); // à la caserne
      expect(flood(ctx, me.x, me.z, 0.35, OUT + 2).reach).toBeGreaterThanOrEqual(OUT);
      const motos = ownVehicles(ctx).filter((v) => v.kind === 'moto_bravm');
      expect(motos.length).toBe(3);
      for (const v of motos) {
        expect(flood(ctx, v.x, v.z, 0.4, OUT + 2).reach).toBeGreaterThanOrEqual(OUT);
        expect(Math.hypot(v.x - me.x, v.z - me.z)).toBeLessThan(40);
      }
    }
  }, 300000);

  it('la BRAV-M de l’IA part de SON commissariat (rue Chauchat), pas de la caserne de la compagnie', async () => {
    const t = createTestContext({ seed: 3, strict: false, modules: SIM });
    await t.start(configOf({ role: 'crs', poste: 'bouclier' }, DEFAULT_PLACES[0]!, 'journee'));
    const { ctx } = t;
    const bb = bravmBaseOf(ctx.session.config)!;
    expect(bb).not.toBeNull();
    // (plan « ordres directs » §4.1.1 : la BRAV-M fait partie de la compagnie — à portée de « Avec moi » et des ordres du
    // commandant — tout en partant de son propre commissariat ; avant, c'était une unité sans unité mère)
    const faucon = ctx.squads.list.find((s) => s.name.indexOf('FAUCON') === 0 && s.kind === 'groupe')!;
    expect(faucon).toBeDefined();
    expect(ctx.squads.get(faucon.parentId)?.kind).toBe('compagnie');
    const motos = ctx.vehicles.list.filter((v) => v.kind === 'moto_bravm');
    expect(motos.length).toBeGreaterThanOrEqual(6);
    for (const v of motos) expect(Math.hypot(v.x - bb.x, v.z - bb.z)).toBeLessThan(150);
  }, 300000);

  it('matrice : rôles × lieux × modes — jamais enfermé, jamais dans un mur, véhicules qui peuvent sortir', async () => {
    const input = new ScriptedInput();
    const t = createTestContext({ seed: 3, strict: false, modules: SIM, systems: [createScriptedInputSystem(input)] });
    const fails: string[] = [];
    let runs = 0;
    // la marche et la conduite (réelles, au clavier) ne sont refaites que pour un point de départ nouveau (25 m près)
    const walked = new Set<string>();
    const driven = new Set<string>();
    const modes = ['journee', 'libre', 'monde_ouvert'] as const;
    for (const mode of modes) {
      if (ONLY && ONLY.indexOf(mode) < 0 && ONLY !== 'all') continue;
      for (const place of DEFAULT_PLACES) {
        // la journée part d'une base (caserne de la Cité, 1er, 8e…) choisie selon le lieu, avec la BRAV-M à un autre
        // commissariat : tous les lieux ; le monde ouvert diffère du mode libre par le seul mode : trois lieux
        if (mode === 'monde_ouvert' && OPEN_PLACES.indexOf(place.name) < 0) continue;
        for (const r of ROLES) {
          if (mode === 'journee' && !POLICE.has(r.role)) continue;
          const tag = `${mode} ${place.name} ${r.role}${r.poste ? '/' + r.poste : ''}${r.variante ? '/' + r.variante : ''}`;
          if (CASE && tag.indexOf(CASE) < 0) continue;
          const cfg = configOf(r, place, mode);
          await t.start(cfg);
          t.step(0.2);
          runs++;
          const bad = inspect(t.ctx);
          const me = t.ctx.player.person();
          const at = me ? `${me.x.toFixed(0)},${me.z.toFixed(0)}` : '?';
          if (bad.length === 0 && me && DYN) {
            const own = ownVehicles(t.ctx).filter((v) => !v.def.flying && (OWN_KIND[r.role] === v.kind || v.id === me.vehicleId));
            const key = `${mode}:${Math.round(me.x / 25)}:${Math.round(me.z / 25)}`;
            if (me.vehicleId === 0 && !walked.has(key)) {
              walked.add(key);
              const x0 = me.x, z0 = me.z;
              bad.push(...walkOut(t, input));
              // (on repart du point de départ pour la conduite : nouvelle session)
              if (DRIVE && own.length > 0 && Math.hypot(me.x - x0, me.z - z0) > 1) { await t.start(cfg); t.step(0.2); }
            }
            const v = ownVehicles(t.ctx).filter((w) => !w.def.flying && (OWN_KIND[r.role] === w.kind || w.id === t.ctx.player.person()!.vehicleId))[0];
            const vkey = v ? `${mode}:${v.kind}:${Math.round(v.x / 25)}:${Math.round(v.z / 25)}` : '';
            if (v && DRIVE && !driven.has(vkey)) {
              driven.add(vkey);
              bad.push(...driveOut(t, v));
            }
          }
          if (bad.length > 0) {
            fails.push(`${tag} @ ${at} : ${[...new Set(bad)].join(' ; ')}`);
          }
        }
      }
    }
    console.log(`${runs} départs, ${fails.length} en défaut\n${fails.join('\n')}\n(hors mise en place :\n${[...new Set(softs)].join('\n') || 'aucun'})`);
    expect(fails).toEqual([]);
  }, 3600000);
});
