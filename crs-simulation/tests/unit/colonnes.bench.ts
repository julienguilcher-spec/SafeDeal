// Banc d'essai des colonnes motorisées : une compagnie part d'une base (caserne, commissariat) et rejoint en colonne un
// lieu de rassemblement réel (foule présente). Mesures : temps d'arrivée, véhicules arrivés, interventions du filet de
// sécurité (véhicule replacé hors de la vue du joueur), heurts de piétons. Utilisé par integration.colonnes*.test.ts.
import { createTestContext } from '@/core/testing';
import type { Vehicle } from '@/core/contracts';
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
import { ENGINS_SERVICE, JOURNEE_SERVICE } from '@/gameplay/session';
import type { EnginsApi, JourneeApi, ServiceBase } from '@/gameplay/session';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];

export const DESTS: readonly { name: string; x: number; z: number }[] = [
  { name: 'République', x: 3123, z: -208 },
  { name: 'Bastille', x: 3542, z: 1395 },
  { name: 'Concorde', x: -10, z: 15 },
  { name: 'Étoile', x: -1920, z: -906 },
  { name: 'Opéra', x: 811, z: -564 },
  { name: 'Trocadéro', x: -2411, z: 387 },
  { name: 'Invalides', x: -596, z: 626 },
  { name: 'Hôtel de Ville', x: 2211, z: 993 },
  { name: 'Châtelet', x: 1903, z: 916 },
  { name: 'Madeleine', x: 239, z: -497 },
];

export interface ColumnMeans { sections: number; fourgons: number; centaure: number; canon_eau: number }

export interface BenchResult {
  base: string;
  dest: string;
  /** Longueur de l'itinéraire base → zone de stationnement (m). */
  route: number;
  /** Délai accordé depuis le départ de la colonne (s). */
  limit: number;
  /** Instant d'arrivée du dernier véhicule depuis le départ (s ; -1 si pas tous arrivés). */
  arrival: number;
  /** Attente au départ (embarquement) (s). */
  boarding: number;
  arrived: number;
  vehicles: number;
  interventions: number;
  hits: number;
  detail: string;
}

const CONVOY_KINDS: ReadonlySet<string> = new Set(['fourgon_crs', 'car_crs', 'vl_commandement', 'fourgon_cellulaire', 'canon_eau', 'centaure']);

function pathLength(p: readonly number[]): number {
  let l = 0;
  for (let i = 2; i + 1 < p.length; i += 2) l += Math.hypot(p[i]! - p[i - 2]!, p[i + 1]! - p[i - 1]!);
  return l;
}

/** Une colonne de compagnie de `base` vers `dest`. */
/**
 * `player` : 'loin' — le joueur, passager d'une voiture garée à l'autre bout de Paris (le filet de sécurité peut agir
 * partout, la circulation civile vit loin de la colonne) ; 'passager' — le joueur est passager d'un fourgon de la
 * colonne (circulation, piétons et voitures garées autour d'elle, comme en jeu).
 */
export async function runColumn(base: ServiceBase, dest: { name: string; x: number; z: number }, means: ColumnMeans, seed = 7, player: 'loin' | 'passager' = 'passager',
  bravmBase?: ServiceBase): Promise<BenchResult> {
  const t = createTestContext({ seed, strict: false, modules: SIM });
  const extra: Record<string, unknown> = {
    moyens: { ...means, bravm: bravmBase ? 1 : 0, drone: 0, pompiers: 0, samu: 0, secours_sur_appel: false }, journee: true, base: { x: base.x, z: base.z, name: base.name },
  };
  // BRAV-M : elle part de son propre commissariat (on se rejoint sur place)
  if (bravmBase) extra['baseBravm'] = { x: bravmBase.x, z: bravmBase.z, name: bravmBase.name };
  await t.start({
    mode: 'libre', role: 'crs', place: dest.name, x: dest.x, z: dest.z, crowdSize: 120, tension: 0.15, volatility: 0.15, duration: 'courte', extra,
  });
  const { ctx } = t;
  const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
  const engins = ctx.service<EnginsApi>(ENGINS_SERVICE)!;
  const me = ctx.player.person()!;
  const company = ctx.squads.list.find((s) => s.kind === 'compagnie' && s.faction === 'police')!;
  const b = ctx.world.bounds;
  const far = [[b.minX + 150, b.maxZ - 150], [b.maxX - 150, b.maxZ - 150], [b.minX + 150, b.minZ + 150], [b.maxX - 150, b.minZ + 150]];
  let parked = false;
  if (player === 'passager') {
    // à bord du fourgon de son groupe (ou d'un autre véhicule de la compagnie), au milieu de la colonne
    const own = me.squadId !== 0 ? ctx.squads.get(me.squadId) : undefined;
    const vans = ctx.vehicles.list.filter((v) => v.kind === 'fourgon_crs' && v.seats[0] !== 0 && v.seats.some((id, i) => i > 0 && id === 0));
    const van = (own && vans.find((v) => v.id === own.vehicleId)) ?? vans[Math.floor(vans.length / 2)];
    if (van) {
      me.x = van.x + 3;
      me.z = van.z;
      parked = ctx.vehicles.enter(me, van, 'passenger');
    }
  }
  for (const [fx, fz] of player === 'loin' ? far : []) {
    const road = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '' } as Parameters<typeof ctx.world.nearestRoad>[2];
    if (!ctx.world.nearestRoad(fx!, fz!, road, 400)) continue;
    if (Math.hypot(road.x - base.x, road.z - base.z) < 1500 || Math.hypot(road.x - dest.x, road.z - dest.z) < 1500) continue;
    const car = ctx.vehicles.spawn('voiture', road.x, road.z, road.heading);
    me.x = road.x + 2;
    me.z = road.z;
    if (ctx.vehicles.enter(me, car, 'passenger')) { parked = true; break; }
  }
  if (!parked) throw new Error('joueur : pas de voiture à l’écart');

  const column = (): Vehicle[] => {
    const out: Vehicle[] = [];
    for (const s of ctx.squads.list) {
      if (s.vehicleId === 0) continue;
      let r = s;
      for (let g = 0; r.parentId !== 0 && g < 8; g++) r = ctx.squads.get(r.parentId) ?? r;
      if (r.id !== company.id) continue;
      const v = ctx.vehicles.get(s.vehicleId);
      if (v && CONVOY_KINDS.has(v.kind) && v.seats[0] !== 0 && out.indexOf(v) < 0) out.push(v);
    }
    return out;
  };
  let hits = 0;
  const hitLog: string[] = [];
  ctx.events.on('vehicle:collision', (e: { vehicleId: number; otherKind: string; speed: number; x: number; z: number }) => {
    if (e.otherKind !== 'person' || e.speed < 0.8) return;
    const v = ctx.vehicles.get(e.vehicleId);
    if (!v || v.faction !== 'police') return;
    hits++;
    const p = ctx.people.get((e as unknown as { otherId: number }).otherId);
    const st = ctx.service<{ status(v: Vehicle): { mode: string; state: string; reason: string } }>('vehicles.autopilot')!.status(v);
    if (hitLog.length < 6) hitLog.push(`${v.kind}#${v.id}@${Math.round(e.x)},${Math.round(e.z)} ${e.speed.toFixed(1)}m/s v=${v.speed.toFixed(1)} ${st.mode}/${st.state}/${st.reason} piéton ${p ? `${p.faction} v=${Math.hypot(p.vx, p.vz).toFixed(1)} ${p.posture}` : '?'}`);
  });

  t.step(2);
  const d = j.destination!;
  const path: number[] = [];
  ctx.world.findPath(base.x, base.z, d.x, d.z, 'vehicle', path);
  let route = pathLength(path);
  if (bravmBase) {
    ctx.world.findPath(bravmBase.x, bravmBase.z, d.x, d.z, 'vehicle', path);
    route = Math.max(route, pathLength(path));
  }
  const limit = route / 6 + 180;
  const startAt = ctx.clock.now;
  // départ : la colonne roule
  for (let i = 0; i < 200 && j.stage === 'embarquement'; i++) t.step(1);
  const goAt = ctx.clock.now;
  // (véhicules partis avec la colonne : ceux dont le pilote automatique roule quelques secondes après le départ)
  t.step(4);
  const apx = ctx.service<{ status(v: Vehicle): { mode: string } }>('vehicles.autopilot')!;
  const list = column().filter((v) => apx.status(v).mode !== 'idle' || Math.abs(v.speed) > 0.3);
  // (motos de la BRAV-M : elles s'arrêtent 40 à 80 m avant le point, plus loin si la foule déborde)
  const motos = ctx.vehicles.list.filter((v) => v.kind === 'moto_bravm' && v.seats[0] !== 0);
  const n = list.length;
  for (const m of motos) list.push(m);
  const near = (v: Vehicle): boolean => Math.hypot(v.x - d.x, v.z - d.z) < (v.kind === 'moto_bravm' ? 170 : 60 + 12 * n);
  let arrival = -1;
  const hardEnd = goAt + limit + 120;
  const ap = ctx.service<{ status(v: Vehicle): { mode: string; state: string; reason: string; blockedFor: number; remaining: number } }>('vehicles.autopilot')!;
  const trace = process.env['COLONNES_TRACE'];
  const k = (ap as unknown as { k: { rt(v: Vehicle): { ap: Record<string, number | string> | null } } }).k;
  let nextTrace = 0;
  while (ctx.clock.now < hardEnd) {
    t.step(trace ? 1 : 2);
    if (trace && ctx.clock.now >= nextTrace) {
      nextTrace = ctx.clock.now + Number(process.env['COLONNES_TRACE_DT'] ?? 5);
      const cmd = ctx.service<{ convoyOf(id: number): { stage: string } | null }>('police.command')!;
      console.log(`t=${(ctx.clock.now - goAt).toFixed(0)} convoi ${cmd.convoyOf(company.id)?.stage} journée ${j.stage}`);
      const extra = ctx.vehicles.list.filter((o) => o.faction === 'police' && list.indexOf(o) < 0 && ap.status(o).mode !== 'idle');
      for (const v of [...list, ...extra]) {
        if (trace !== 'all' && !trace.split(',').includes(String(v.id)) && !trace.split(',').includes(v.kind)) continue;
        const st = ap.status(v);
        const a = k.rt(v).ap;
        const obs = a && a['obsId'] ? ctx.vehicles.get(Number(a['obsId'])) : undefined;
        console.log(`  ${v.kind}#${v.id} (${v.x.toFixed(1)},${v.z.toFixed(1)}) h=${v.heading.toFixed(2)} u=${v.speed.toFixed(1)} ${st.mode}/${st.state}/${st.reason} bl=${st.blockedFor.toFixed(0)} rem=${st.remaining.toFixed(0)}`
          + (st.reason === 'personne' ? ' ' + ctx.people.list.filter((p) => !p.dormant && p.vehicleId === 0 && Math.hypot(p.x - v.x - Math.sin(v.heading) * 5, p.z - v.z - Math.cos(v.heading) * 5) < 6).slice(0, 4)
            .map((p) => `[${p.faction}/${p.isPlayer ? "J" : ""} #${p.id} (${p.x.toFixed(1)},${p.z.toFixed(1)}) v=${Math.hypot(p.vx, p.vz).toFixed(1)} post=${p.posture} sq=${p.squadId}]`).join('') : '')
          + (a ? ` uturn=${a['uturn']}/${a['uturnMoves']} obs=${a['obsReason']}@${Number(a['obsDist']).toFixed(1)}${obs ? ` ${obs.kind}#${obs.id}(${obs.x.toFixed(0)},${obs.z.toFixed(0)})` : ''} lead=${a['leaderId']} s=${Number(a['s']).toFixed(0)}/${Number(a['total']).toFixed(0)} lane=${Number(a['laneOffset']).toFixed(1)} vt=${Number((a['status'] as unknown as { targetSpeed: number }).targetSpeed).toFixed(1)} av=${Number(a['avoidShift']).toFixed(1)}/${Number(a['avoidWant']).toFixed(1)} v${a['avoidVeh']}p${a['avoidProp']} back=${Number(a['avoidBack']).toFixed(1)} unst=${Number(a['unstickT']).toFixed(1)}/${a['unstickTries']} behind=${a['behindId']} ped=${Number(a['pedNear']).toFixed(0)} cmd=${v.cmd.throttle.toFixed(2)}/${v.cmd.brake.toFixed(2)}/${v.cmd.handbrake}` : ''));
      }
    }
    if (list.every((v) => near(v) && Math.abs(v.speed) < 0.5)) { arrival = ctx.clock.now - goAt; break; }
  }
  const late = list.filter((v) => !near(v)).map((v) => {
    const st = ap.status(v);
    return `${v.kind}#${v.id} à ${Math.hypot(v.x - d.x, v.z - d.z).toFixed(0)} m (${Math.round(v.x)},${Math.round(v.z)}) ${st.mode}/${st.state}/${st.reason}`;
  });
  const s = engins.stats;
  const interventions = s.skipAhead + s.unstickFollow + s.wallNudge + s.civilRemoved;
  const detail = [
    late.length ? `retard: ${late.join(' ; ')}` : '',
    s.log.length ? `filet: ${s.log.slice(0, 8).map((e) => `${e.kind}#${e.id} ${e.why} (${e.x},${e.z}) t=${e.t}`).join(' ; ')}` : '',
    hitLog.length ? `heurts: ${hitLog.join(' ; ')}` : '',
  ].filter(Boolean).join(' | ');
  return {
    base: bravmBase ? `${base.name.replace(/ \(.*\)/, '')} + BRAV-M ${bravmBase.name.replace(/^commissariat du /, '').replace(/ \(.*\)/, '')}` : base.name, dest: dest.name, route: Math.round(route), limit: Math.round(limit), arrival: arrival < 0 ? -1 : Math.round(arrival),
    boarding: Math.round(goAt - startAt), arrived: list.filter(near).length, vehicles: list.length, interventions, hits, detail,
  };
}

export function line(r: BenchResult): string {
  const ok = r.arrival >= 0 && r.arrival <= r.limit && r.interventions === 0 && r.hits === 0;
  return `${ok ? 'OK ' : 'KO '} ${r.base.slice(0, 34).padEnd(34)} → ${r.dest.padEnd(15)} ${String(r.route).padStart(5)} m  départ ${String(r.boarding).padStart(3)} s  arrivée ${r.arrival < 0 ? '  — ' : String(r.arrival).padStart(4)} s / ${String(r.limit).padStart(4)} s  ${r.arrived}/${r.vehicles} véh.  filet ${r.interventions}  heurts ${r.hits}${r.detail ? '\n      ' + r.detail : ''}`;
}

export function passed(r: BenchResult): boolean {
  return r.arrival >= 0 && r.arrival <= r.limit && r.interventions === 0 && r.hits === 0;
}
