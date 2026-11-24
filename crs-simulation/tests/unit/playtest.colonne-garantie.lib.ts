// Robot de la colonne garantie (plan « ordres directs », P17) : le commandant en « Missions spéciales », lancé depuis la
// fiche de l'accueil, fait le trajet de la caserne au lieu de l'une des trois façons du joueur (passager, au volant, seul
// devant : voir playtest.commandant-mission.lib.ts), puis s'arrête au lieu. On relève alors, seconde par seconde, où sont
// ses groupes (à pied ou dans leur fourgon). Garantie : « tout le monde doit me suivre, c'est obligatoire » — tous ses
// groupes à moins de 300 m du lieu (ou de lui) 180 s après son arrivée ; le relevé à 300 s est donné pour mémoire.
// Au volant, le commandant conduit comme un joueur au clavier (StreetDriver : itinéraire du GPS, 50 km/h au plus).
import type { GameContext, Person, Squad, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { ObjectivesApi } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { JOURNEE_SERVICE } from '@/gameplay/session';
import type { JourneeApi } from '@/gameplay/session';
import type { MissionsApi } from '@/gameplay/missions';
import type { CommandCore } from '@/ui/command';
import { CRUISE_ALONE, CRUISE_LEAD, SIM, StreetDriver, launchFromSheet, walk } from './playtest.commandant-mission.lib';
import type { Arrival } from './playtest.commandant-mission.lib';

/** Foule allégée (personnes). */
const LIGHT_CROWD = 300;
/** Attente maximale de l'arrivée (s de jeu). */
const TRAVEL_LIMIT = 1500;
/** En deçà, le joueur qui part devant y va à pied (m). */
const WALK_AHEAD = 1500;
/** Arrivé : à moins de tant de mètres du lieu (m). */
const AT_PLACE = 150;
/** Délais de la garantie après l'arrivée (s) et distance (m). */
export const MOST_AFTER = 180;
export const ALL_AFTER = 300;
export const NEAR = 300;

export interface ColumnRun {
  id: string;
  arrival: Arrival;
  /** Secondes de jeu avant l'arrivée du commandant (−1 : jamais). */
  arrivedAfter: number;
  groups: number;
  /** Groupes à moins de NEAR m du commandant MOST_AFTER puis ALL_AFTER s après son arrivée. */
  nearMost: number;
  nearAll: number;
  /** Groupes encore loin à ALL_AFTER s : nom, distance, ordre, état de leur véhicule. */
  far: string[];
  /** Distance du commandant au lieu à son arrivée (m) : la colonne qui l'emporte s'arrête-t-elle au lieu ? */
  placeGap: number;
  /** Groupes à moins de NEAR m toutes les 30 s après l'arrivée. */
  timeline: string[];
  notes: string[];
}

export async function playColumn(id: string, arrival: Arrival): Promise<ColumnRun> {
  const t = createTestContext({ seed: 7, strict: false, modules: SIM });
  await t.ready;
  const { ctx } = t;
  const cfg = launchFromSheet(ctx, id);
  cfg.crowdSize = Math.min(cfg.crowdSize ?? LIGHT_CROWD, LIGHT_CROWD);
  await t.start(cfg);
  const m = ctx.service<MissionsApi>('missions')!;
  const obj = ctx.service<ObjectivesApi>(EXT.objectives)!;
  const j = ctx.service<JourneeApi>(JOURNEE_SERVICE)!;
  const core = ctx.service<CommandCore>('ui.command')!;
  const ap = ctx.service<{ status(v: Vehicle): { mode: string; state: string; reason: string; blockedFor: number } }>('vehicles.autopilot')!;
  const cmd = ctx.service<{ convoyOf(id: number): { stage: string } | null }>('police.command')!;
  const run: ColumnRun = { id, arrival, arrivedAfter: -1, placeGap: -1, groups: 0, nearMost: 0, nearAll: 0, far: [], timeline: [], notes: [] };
  const path: number[] = [];
  let alone = false;
  let s = 0;
  // ── trajet, jusqu'à l'arrivée du commandant au lieu ──
  let stage = '';
  const wheel = new StreetDriver();
  for (; s < TRAVEL_LIMIT && !m.result; s++) {
    wheel.step(t);
    const me = ctx.player.person()!;
    const d = j.destination;
    if (j.stage !== stage) {
      stage = j.stage;
      run.notes.push(`${s} s : journée ${stage}${d ? ` (lieu à ${Math.hypot(d.x - me.x, d.z - me.z).toFixed(0)} m)` : ''}`);
    }
    if (d && s >= 3 && Math.hypot(d.x - me.x, d.z - me.z) < AT_PLACE && (me.vehicleId === 0 || Math.abs(ctx.vehicles.get(me.vehicleId)!.speed) < 0.5)) break;
    if (m.phaseIndex >= 0 && d && Math.hypot(d.x - me.x, d.z - me.z) < AT_PLACE * 2) break;
    // (passager : la colonne est « sur place » là où elle s'est arrêtée — il est arrivé, à la distance relevée ci-dessous)
    if (j.stage === 'sur_place' && s >= 3 && arrival === 'passager') break;
    if (arrival === 'devant' && d && s >= 3) {
      if (!alone) {
        alone = true;
        if (Math.hypot(d.x - me.x, d.z - me.z) > WALK_AHEAD) {
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
  if (wheel.driven > 0) run.notes.push(`au volant : ${wheel.driven.toFixed(0)} m parcourus, ${(wheel.topSpeed * 3.6).toFixed(0)} km/h au plus`);
  const me = ctx.player.person()!;
  const d = j.destination;
  const gap = d ? Math.hypot(d.x - me.x, d.z - me.z) : Infinity;
  if (!d || (gap > AT_PLACE * 2 && !(arrival === 'passager' && j.stage === 'sur_place'))) {
    run.notes.push(`commandant jamais arrivé après ${s} s (journée ${j.stage}${d ? `, à ${gap.toFixed(0)} m du lieu` : ''})`);
    return run;
  }
  run.arrivedAfter = s;
  run.placeGap = gap;
  // ── au lieu : il descend et attend sa compagnie ──
  const ownId = core.scope().ownSquadId;
  const subtree = (rootId: number): Set<number> => {
    const out = new Set<number>();
    const add = (sid: number): void => { if (out.has(sid)) return; out.add(sid); for (const q of ctx.squads.list) if (q.parentId === sid) add(q.id); };
    add(rootId);
    return out;
  };
  const posOf = (p: Person): { x: number; z: number } => {
    const v = p.vehicleId ? ctx.vehicles.get(p.vehicleId) : undefined;
    return v ? { x: v.x, z: v.z } : { x: p.x, z: p.z };
  };
  const groups = (): Squad[] => { const tree = subtree(ownId); return ctx.squads.list.filter((q) => q.faction === 'police' && q.kind === 'groupe' && q.members.length > 0 && tree.has(q.id)); };
  // (distance du groupe au commandant, ou au lieu — la zone de stationnement de la colonne — s'il en est plus près : le
  // commandant arrêté devant un rassemblement n'est pas toujours sur le rang des fourgons)
  const distOf = (q: Squad): number => {
    let x = 0, z = 0, n = 0;
    for (const pid of q.members) { const p = ctx.people.get(pid); if (!p || p.isPlayer) continue; const ps = posOf(p); x += ps.x; z += ps.z; n++; }
    return n > 0 ? Math.min(Math.hypot(x / n - me.x, z / n - me.z), Math.hypot(x / n - d.x, z / n - d.z)) : 0;
  };
  const near = (): number => groups().filter((q) => distOf(q) < NEAR).length;
  if (me.vehicleId !== 0) {
    const v = ctx.vehicles.get(me.vehicleId)!;
    v.speed = 0; v.vx = 0; v.vz = 0;
    ctx.vehicles.exit(me);
  }
  const hx = me.x, hz = me.z;
  for (let k = 1; k <= ALL_AFTER; k++) {
    t.step(1);
    me.x = hx;
    me.z = hz;
    if (k === MOST_AFTER) run.nearMost = near();
    if (k % 30 === 0) run.timeline.push(`+${k} s ${near()}`);
  }
  const gs = groups();
  run.groups = gs.length;
  run.nearAll = near();
  for (const q of gs) {
    const dist = distOf(q);
    if (dist < NEAR) continue;
    const v = q.vehicleId ? ctx.vehicles.get(q.vehicleId) : undefined;
    const st = v ? ap.status(v) : null;
    const cv = cmd.convoyOf(q.id);
    run.far.push(`${q.name} à ${dist.toFixed(0)} m [${q.order.type}${cv ? `, colonne ${cv.stage}` : ''}${v && st ? `, ${v.kind} ${st.mode}/${st.state}/${st.reason} ${st.blockedFor.toFixed(0)} s` : ''}]`);
  }
  return run;
}

/** Défauts de la garantie (vide quand elle tient). */
export function columnDefects(r: ColumnRun): string[] {
  const out: string[] = [];
  if (r.arrivedAfter < 0) return [r.notes.join(' ; ') || 'commandant jamais arrivé'];
  if (r.placeGap > AT_PLACE * 2) out.push(`colonne arrêtée à ${r.placeGap.toFixed(0)} m du lieu, le commandant à bord`);
  // (critère de l'étape 3 du plan : TOUS ses groupes à moins de NEAR m du lieu — ou de lui — MOST_AFTER s après son arrivée)
  if (r.nearMost < r.groups) out.push(`${r.nearMost}/${r.groups} groupes à moins de ${NEAR} m ${MOST_AFTER} s après l'arrivée`);
  if (r.nearAll < r.groups) out.push(`${r.nearAll}/${r.groups} groupes à moins de ${NEAR} m ${ALL_AFTER} s après l'arrivée : ${r.far.join(' ; ')}`);
  return out;
}

export function columnReport(r: ColumnRun): string {
  return `${r.id} — ${r.arrival} : arrivé après ${r.arrivedAfter} s à ${r.placeGap.toFixed(0)} m du lieu ; ${r.nearMost}/${r.groups} groupes à moins de ${NEAR} m à +${MOST_AFTER} s, ${r.nearAll}/${r.groups} à +${ALL_AFTER} s (${r.timeline.join(', ')})${r.far.length ? ` ; loin : ${r.far.join(' ; ')}` : ''}${r.notes.length ? ` ; ${r.notes.join(' ; ')}` : ''}`;
}
