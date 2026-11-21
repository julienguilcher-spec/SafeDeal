// Campagne de test « missions des engins », passe 2 : les 36 missions BRAV-M, Centaure, canon à eau et télépilote
// lancées une à une comme le fait l'accueil, dans le monde réel (tuiles chargées, bâtiments en place), et jouées par un
// robot simple : il prend sa place dans son engin, roule par la route vers chaque lieu d'objectif attendu par la phase
// en cours (à pied pour le télépilote), puis laisse courir la mission. Relevé par mission : départ (engin à portée,
// sortie par la route), phase atteinte, état des objectifs, issue ou exception.
import { describe, expect, it } from 'vitest';

import type { PlayableRole, Vehicle } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { MISSIONS } from '@/gameplay/missions/catalog';
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
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as missions, missionById, missionConfig } from '@/gameplay/missions';
import type { ObjectiveRun } from '@/gameplay/missions/objectives';
import { buildSessionConfig, defaultDraft, draftFromConfig } from '@/ui/screens/scenario';

const ROLES: readonly PlayableRole[] = ['bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote'];
const ENGINS = MISSIONS.filter((m) => ROLES.indexOf(m.role) >= 0);
const KIND: Record<string, string> = { bravm: 'moto_bravm', gendarme_centaure: 'centaure', operateur_canon_eau: 'canon_eau' };
const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, missions];
/** Temps de jeu laissé à chaque mission (s) ; MATRICE_DUREE pour allonger. */
const DUREE = Number(process.env.MATRICE_DUREE ?? 180);
const SEULE = process.env.MATRICE_ID ?? '';

interface MissionsView {
  phaseIndex: number;
  objectives: readonly ObjectiveRun[];
  result: { success: boolean; summary: string } | null;
}

async function lancer(id: string) {
  const def = missionById(id)!;
  const t = createTestContext({ seed: 21, strict: true, modules: SIM });
  const probe = createTestContext({ seed: 1, strict: true, modules: [world] });
  await probe.start({ mode: 'libre', missionId: '', role: 'crs', rank: null, place: '', x: 0, z: 0, crowdSize: 0, tension: 0, volatility: 0, duration: 'courte' } as never);
  const mc = missionConfig(def, probe.ctx.world);
  const base = buildSessionConfig(defaultDraft());
  const merged = { ...base, ...mc, missionId: def.id, extra: { ...(base.extra ?? {}), ...(mc.extra ?? {}) } };
  const cfg = buildSessionConfig(draftFromConfig(merged, defaultDraft()));
  cfg.extra = { ...(cfg.extra ?? {}), journee: false };
  delete (cfg.extra as Record<string, unknown>)['preload'];
  await t.start(cfg);
  return { t, ctx: t.ctx, def, m: t.ctx.service<MissionsView>('missions')! };
}

type Ctx = ReturnType<typeof createTestContext>['ctx'];

/** Engin du joueur : celui de son groupe, sinon l'engin du bon type le plus proche. */
function enginDu(ctx: Ctx, kind: string): Vehicle | undefined {
  const me = ctx.player.person()!;
  if (me.vehicleId !== 0) {
    const v = ctx.vehicles.get(me.vehicleId);
    if (v && v.kind === kind) return v;
  }
  const own = ctx.squads.get(me.squadId);
  const v0 = own && own.vehicleId ? ctx.vehicles.get(own.vehicleId) : undefined;
  if (v0 && v0.kind === kind) return v0;
  let best: Vehicle | undefined;
  let bd = Infinity;
  for (const q of ctx.vehicles.list) {
    if (q.kind !== kind) continue;
    const d = Math.hypot(q.x - me.x, q.z - me.z);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/** Le joueur au volant (place 0) : le robot conduit comme un joueur. */
function auVolant(ctx: Ctx, v: Vehicle): boolean {
  const me = ctx.player.person()!;
  if (me.vehicleId === v.id && me.seat === 0) return true;
  if (me.vehicleId !== 0) ctx.vehicles.exit(me);
  const occ = v.seats[0];
  if (occ) ctx.vehicles.exit(ctx.people.get(occ)!);
  me.x = v.x + 2.5; me.z = v.z;
  return ctx.vehicles.enter(me, v, 0);
}

/** Conduite du robot sur l'itinéraire routier, 6 m/s ; renvoie la longueur de route ou -1 sans itinéraire. */
function rouler(t: ReturnType<typeof createTestContext>, v: Vehicle, x: number, z: number, budget: number): number {
  const path: number[] = [];
  if (!t.ctx.world.findPath(v.x, v.z, x, z, 'vehicle', path)) return -1;
  let len = 0;
  for (let k = 2; k < path.length; k += 2) len += Math.hypot(path[k]! - path[k - 2]!, path[k + 1]! - path[k - 1]!);
  let i = 2;
  for (let guard = 0; guard < budget * 10 && i < path.length; guard++) {
    let step = 0.6;
    while (step > 0 && i < path.length) {
      const tx = path[i]!, tz = path[i + 1]!;
      const d = Math.hypot(tx - v.x, tz - v.z);
      if (d <= step) { v.x = tx; v.z = tz; step -= d; i += 2; continue; }
      v.heading = Math.atan2(tx - v.x, tz - v.z);
      v.x += ((tx - v.x) / d) * step;
      v.z += ((tz - v.z) / d) * step;
      step = 0;
    }
    v.vx = 0; v.vz = 0; v.speed = 0;
    const bx = v.x, bz = v.z;
    t.step(0.1);
    if (Math.hypot(v.x - bx, v.z - bz) > 0.3 && i < path.length) { v.x = path[i]!; v.z = path[i + 1]!; i += 2; }
  }
  return len;
}

/** Le télépilote marche (téléporté pas à pas) vers le point. */
function marcher(t: ReturnType<typeof createTestContext>, x: number, z: number): number {
  const me = t.ctx.player.person()!;
  const path: number[] = [];
  if (!t.ctx.world.findPath(me.x, me.z, x, z, 'foot', path)) return -1;
  for (let k = 2; k < path.length; k += 2) { me.x = path[k]!; me.z = path[k + 1]!; t.step(0.2); }
  return path.length / 2;
}

const etat = (m: MissionsView) => m.objectives.map((r) => `${r.def.id}${r.def.secondary ? '*' : ''}:${r.state === 'reussi' ? 'R' : r.state === 'echoue' ? 'E' : 'a'}`).join(' ');

const TABLE: string[] = [];

// (sept minutes de calcul : lancé à la demande, MATRICE=1 ; MATRICE_ID=<mission> pour une seule)
describe.skipIf(!process.env.MATRICE && !process.env.MATRICE_ID)('les 36 missions des engins, jouées une à une par un robot', () => {
  for (const def of ENGINS) {
    if (SEULE && def.id !== SEULE) continue;
    it(def.id, async () => {
      const defauts: string[] = [];
      let issue = '';
      const { t, ctx, m } = await lancer(def.id);
      try {
        t.step(1);
        const me = ctx.player.person()!;
        expect(me, 'joueur').toBeTruthy();
        // (poste de la fiche perdu à l'accueil pour « opérateur » et « chef de groupe » : relevé, porté par
        // l'écran d'accueil — ui/screens/catalog.ts — hors de cette tranche)
        const notes: string[] = [];
        if (def.poste && me.poste !== def.poste) notes.push(`poste ${me.poste} au lieu de ${def.poste}`);
        const kind = KIND[def.role];
        let v: Vehicle | undefined;
        if (kind) {
          v = enginDu(ctx, kind);
          if (!v) defauts.push(`aucun engin ${kind}`);
          else {
            const d0 = me.vehicleId === v.id ? 0 : Math.hypot(v.x - me.x, v.z - me.z);
            if (d0 > 40) defauts.push(`engin à ${d0.toFixed(0)} m du joueur`);
            const foot: number[] = [];
            if (d0 > 3 && !ctx.world.findPath(me.x, me.z, v.x, v.z, 'foot', foot)) defauts.push('engin injoignable à pied');
            // l'engin sort par la route : un itinéraire vers le lieu de la mission et vers un point à 300 m
            const home = ctx.world.placeByName(def.place);
            const p: number[] = [];
            if (home && Math.hypot(home.x - v.x, home.z - v.z) > 30 && !ctx.world.findPath(v.x, v.z, home.x, home.z, 'vehicle', p)) defauts.push(`engin sans route vers « ${def.place} »`);
            if (!auVolant(ctx, v)) defauts.push('impossible de prendre le volant');
          }
        }
        // objectifs à lieu : joignables par l'engin (ou à pied pour le télépilote)
        for (const o of def.objectives) {
          if (!o.place) continue;
          const p = ctx.world.placeByName(o.place);
          if (!p) { defauts.push(`${o.id} : lieu inconnu « ${o.place} »`); continue; }
          const b = ctx.world.bounds;
          if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) defauts.push(`${o.id} : hors carte`);
          const from = v ?? me;
          const path: number[] = [];
          if (Math.hypot(p.x - from.x, p.z - from.z) > 30 && !ctx.world.findPath(from.x, from.z, p.x, p.z, v ? 'vehicle' : 'foot', path)) defauts.push(`${o.id} : « ${o.place} » sans itinéraire`);
        }
        // le robot joue : il va où la phase l'attend, sinon il laisse courir
        const t0 = ctx.clock.now;
        const visited = new Set<string>();
        let lastPhase = -1;
        const phases: string[] = [];
        while (ctx.clock.now - t0 < DUREE && !m.result) {
          if (m.phaseIndex !== lastPhase) { lastPhase = m.phaseIndex; phases.push(`${m.phaseIndex}@${Math.round(ctx.clock.now - t0)}`); }
          const ph = def.phases[m.phaseIndex];
          const run = ph && ph.until.kind === 'objectif' ? m.objectives.find((r) => r.def.id === (ph.until as { id: string }).id) : undefined;
          if (run && run.state === 'actif' && run.at && !visited.has(run.def.id)) {
            visited.add(run.def.id);
            const len = v ? rouler(t, v, run.at.x, run.at.z, 200) : marcher(t, run.at.x, run.at.z);
            if (len < 0) defauts.push(`${run.def.id} : le robot ne trouve pas d'itinéraire`);
            continue;
          }
          t.step(1);
        }
        issue = m.result ? `${m.result.success ? 'RÉUSSIE' : 'ÉCHOUÉE'} : ${m.result.summary}` : `en cours, phase ${m.phaseIndex + 1}/${def.phases.length}`;
        TABLE.push(`${def.id.padEnd(40)} | ${issue} | phases ${phases.join(' ')} | ${etat(m)}${defauts.length ? ' | DÉFAUTS : ' + defauts.join(' ; ') : ''}${notes.length ? ' | NOTE : ' + notes.join(' ; ') : ''}`);
      } catch (e) {
        TABLE.push(`${def.id.padEnd(40)} | EXCEPTION ${(e as Error).message.slice(0, 300)}`);
        throw e;
      } finally {
        console.log(TABLE[TABLE.length - 1]);
      }
      expect(defauts).toEqual([]);
    }, 600000);
  }
});
