// Campagne de test « missions des engins » : les 36 missions BRAV-M, Centaure, canon à eau et télépilote, relues
// comme le moteur de mission les mesure (src/gameplay/missions/objectives.ts), puis un robot joue les quatre ateliers
// (une mission par rôle) jusqu'au compte rendu.
//
// Constat de départ (passage passif des 36 missions, 17 novembre 2026) : drone-01 et centaure-01 échouaient au bout
// de trois minutes quoi que fasse le joueur (balises « repérées » sans foule, barricade absente) ; douze phases
// attendaient un objectif « jugé à la fin » et restaient cinq minutes sans rien à faire ; quatre missions de la BRAV-M
// demandaient à un gardien à moto de « guider » des unités qu'il ne commande pas (objectif impossible).
import { describe, expect, it } from 'vitest';

import type { PlayableRole } from '@/core/contracts';
import type { MissionDef, MissionObjective, ObjectiveKind } from '@/core/missions-schema';
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
import type { VehiclesExtApi } from '@/sim/vehicles/api';
import { buildSessionConfig, defaultDraft, draftFromConfig } from '@/ui/screens/scenario';

const ROLES: readonly PlayableRole[] = ['bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote'];
const ENGINS = MISSIONS.filter((m) => ROLES.indexOf(m.role) >= 0);

// ───────────────────────────── ce que le moteur sait mesurer ─────────────────────────────

/** Objectifs « à préserver » : jugés à la fin seulement (objectives.ts, PRESERVE) — une phase ne peut pas les attendre. */
const JUGES_A_LA_FIN = new Set<ObjectiveKind>([
  'proteger_site', 'zero_bavure', 'sommations_regulieres', 'limiter_blesses', 'limiter_degats', 'prevention',
  'rester_dans_cortege', 'ne_pas_etre_interpelle', 'survivre', 'personnalise',
]);
/** Objectifs qui comptent un événement de la foule : sans foule, rien n'arrive. */
const SUR_LA_FOULE = new Set<ObjectiveKind>([
  'reperer_signaux', 'disperser', 'interpeller', 'degager_barricade', 'eteindre', 'secourir', 'soigner', 'traiter_incidents',
]);
/** Grades qui commandent au moins leur unité (ui/command/scope.ts) ; en dessous, lecture seule : aucun ordre. */
const COMMANDE = new Set(['brigadier_chef', 'major', 'lieutenant', 'capitaine', 'commandant', 'commissaire']);

/** Pourquoi un objectif principal ne peut pas être atteint pendant la mission ('' s'il le peut). */
function bloque(m: MissionDef, o: MissionObjective): string {
  if (o.kind === 'proteger_les_siens' ? o.seconds === undefined : JUGES_A_LA_FIN.has(o.kind)) return `« ${o.kind} » n'est jugé qu'à la fin`;
  if (o.kind === 'guider_unite' && !COMMANDE.has(m.rank ?? '')) return `« guider_unite » compte les ordres du joueur, qui n'en donne pas (${m.role}, ${m.rank ?? 'sans grade'})`;
  if (m.crowd.size <= 0 && SUR_LA_FOULE.has(o.kind)) return `« ${o.kind} » sans foule : rien à compter`;
  return '';
}

describe('missions des engins : chaque objectif attendu peut être atteint', () => {
  it('36 missions dans la tranche (9 par rôle)', () => {
    expect(ENGINS.length).toBe(36);
    for (const r of ROLES) expect(ENGINS.filter((m) => m.role === r).length, r).toBe(9);
  });

  it('une phase qui attend un objectif attend un objectif que le rôle peut remplir (sinon cinq minutes à vide)', () => {
    const defauts: string[] = [];
    for (const m of ENGINS) {
      for (const p of m.phases) {
        if (p.until.kind !== 'objectif') continue;
        const id = p.until.id;
        const o = m.objectives.find((x) => x.id === id);
        if (!o) { defauts.push(`${m.id} · ${p.id} : objectif « ${id} » inconnu`); continue; }
        const why = o.secondary ? 'objectif secondaire' : bloque(m, o);
        if (why) defauts.push(`${m.id} · ${p.id} attend ${o.id} : ${why}`);
      }
    }
    expect(defauts).toEqual([]);
  });

  it('une limite de temps ne condamne pas la mission d’avance : ses objectifs principaux sont atteignables', () => {
    const defauts: string[] = [];
    for (const m of ENGINS) {
      if (!m.failures.some((f) => f.kind === 'temps' && f.value !== undefined)) continue;
      for (const o of m.objectives) {
        if (o.secondary || JUGES_A_LA_FIN.has(o.kind)) continue;
        const why = bloque(m, o);
        if (why) defauts.push(`${m.id} · ${o.id} : ${why}`);
      }
    }
    expect(defauts).toEqual([]);
  });

  it('jamais d’ordre à donner pour un rôle qui n’en donne pas', () => {
    const defauts: string[] = [];
    for (const m of ENGINS) {
      for (const o of m.objectives) {
        if (o.kind === 'guider_unite' && !COMMANDE.has(m.rank ?? '') && !o.secondary) defauts.push(`${m.id} · ${o.id} « ${o.text} »`);
      }
    }
    expect(defauts).toEqual([]);
  });

  it('un objectif « aller, guider jusqu’à » n’est pas déjà atteint au départ (lieu distinct de celui de la mission)', () => {
    // (« Arriver sur place » est atteint à l'arrivée de la colonne : c'est le trajet depuis la base qui le remplit)
    const defauts: string[] = [];
    for (const m of ENGINS) {
      for (const o of m.objectives) {
        if (o.secondary || (o.kind !== 'atteindre' && o.kind !== 'escorter' && o.kind !== 'evacuer')) continue;
        if (/^Arriver sur place/.test(o.text)) continue;
        if (!o.place || o.place === m.place) defauts.push(`${m.id} · ${o.id} « ${o.text} » : lieu ${o.place ?? 'absent'} = départ`);
      }
    }
    expect(defauts).toEqual([]);
  });

  it('lieux sur la carte, et l’engin y va par la route depuis le lieu de la mission', async () => {
    const t = createTestContext({ seed: 3, strict: true, modules: [world] });
    await t.start({ mode: 'libre', missionId: '', role: 'crs', rank: null, place: '', x: 0, z: 0, crowdSize: 0, tension: 0, volatility: 0, duration: 'courte' } as never);
    const w = t.ctx.world;
    const b = w.bounds;
    const path: number[] = [];
    const defauts: string[] = [];
    for (const m of ENGINS) {
      const home = w.placeByName(m.place);
      if (!home) { defauts.push(`${m.id} : lieu « ${m.place} » inconnu`); continue; }
      for (const o of m.objectives) {
        if (!o.place) continue;
        const p = w.placeByName(o.place);
        if (!p) { defauts.push(`${m.id} · ${o.id} : lieu « ${o.place} » inconnu`); continue; }
        if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) defauts.push(`${m.id} · ${o.id} : « ${o.place} » hors de la carte`);
        // le télépilote reste au sol : son lieu se rejoint à pied ; les autres y vont avec leur engin
        const mode = m.role === 'telepilote' ? 'foot' : 'vehicle';
        path.length = 0;
        if (!w.findPath(home.x, home.z, p.x, p.z, mode, path)) defauts.push(`${m.id} · ${o.id} : aucun itinéraire (${mode}) de « ${m.place} » à « ${o.place} »`);
      }
    }
    expect(defauts).toEqual([]);
  }, 120000);
});

// ───────────────────────────── le robot joue les ateliers ─────────────────────────────

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, session, missions];

interface MissionsView {
  phaseIndex: number;
  objectives: readonly ObjectiveRun[];
  result: { success: boolean; summary: string } | null;
}

/** Démarre la mission comme la page d'accueil (fiche de mission + brouillon), au lieu de la mission (sans trajet). */
async function lancer(id: string) {
  const def = missionById(id)!;
  const t = createTestContext({ seed: 21, strict: true, modules: SIM });
  // lieu résolu par la carte, comme le getter `config` du catalogue en jeu
  const probe = createTestContext({ seed: 1, strict: true, modules: [world] });
  await probe.start({ mode: 'libre', missionId: '', role: 'crs', rank: null, place: '', x: 0, z: 0, crowdSize: 0, tension: 0, volatility: 0, duration: 'courte' } as never);
  const mc = missionConfig(def, probe.ctx.world);
  const base = buildSessionConfig(defaultDraft());
  const merged = { ...base, ...mc, missionId: def.id, extra: { ...(base.extra ?? {}), ...(mc.extra ?? {}) } };
  const cfg = buildSessionConfig(draftFromConfig(merged, defaultDraft()));
  // (le trajet depuis la caserne est éprouvé par d'autres bancs : ici, la mission elle-même)
  cfg.extra = { ...(cfg.extra ?? {}), journee: false };
  delete (cfg.extra as Record<string, unknown>)['preload'];
  await t.start(cfg);
  const m = t.ctx.service<MissionsView>('missions')!;
  return { t, ctx: t.ctx, def, m, w: probe.ctx.world };
}

/** Le joueur prend sa place dans son engin (pilote ou conducteur : place 0). */
function enSelle(ctx: ReturnType<typeof createTestContext>['ctx'], seat: number) {
  const me = ctx.player.person()!;
  const own = ctx.squads.get(me.squadId);
  let v = own && own.vehicleId ? ctx.vehicles.get(own.vehicleId) : undefined;
  if (!v) {
    let bd = Infinity;
    for (const q of ctx.vehicles.list) {
      if (q.faction !== 'police' || q.def.flying) continue;
      const d = Math.hypot(q.x - me.x, q.z - me.z);
      if (d < bd) { bd = d; v = q; }
    }
  }
  expect(v, 'engin du joueur').toBeTruthy();
  const d0 = Math.hypot(v!.x - me.x, v!.z - me.z);
  if (me.vehicleId !== v!.id) {
    if (me.vehicleId !== 0) ctx.vehicles.exit(me);
    const occ = v!.seats[seat];
    if (occ) ctx.vehicles.exit(ctx.people.get(occ)!);
    me.x = v!.x + 2.5; me.z = v!.z;
    expect(ctx.vehicles.enter(me, v!, seat)).toBe(true);
  }
  return { v: v!, d0 };
}

/** Conduite du robot : l'engin suit l'itinéraire routier au pas de 6 m/s (le joueur au volant). */
function rouler(t: ReturnType<typeof createTestContext>, v: { x: number; z: number; heading: number; speed: number; vx: number; vz: number }, x: number, z: number) {
  const path: number[] = [];
  expect(t.ctx.world.findPath(v.x, v.z, x, z, 'vehicle', path), 'itinéraire routier').toBe(true);
  let len = 0;
  for (let k = 2; k < path.length; k += 2) len += Math.hypot(path[k]! - path[k - 2]!, path[k + 1]! - path[k - 1]!);
  console.log(`rouler : de (${v.x.toFixed(0)}, ${v.z.toFixed(0)}) à (${x.toFixed(0)}, ${z.toFixed(0)}) : ${len.toFixed(0)} m de route`);
  let i = 2;
  let blocked = 0;
  for (let guard = 0; guard < 4000 && i < path.length; guard++) {
    let step = 6 * 0.1;
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
    // retenu par un massif ou une borne : le joueur contourne — le robot passe au point suivant de l'itinéraire
    if (Math.hypot(v.x - bx, v.z - bz) > 0.3 && i < path.length) { v.x = path[i]!; v.z = path[i + 1]!; i += 2; blocked++; }
  }
  if (blocked > 0) console.log(`rouler : ${blocked} contournement(s)`);
}

function etat(m: MissionsView): string {
  return m.objectives.map((r) => `${r.def.id}:${r.state}`).join(' ');
}

describe('le robot joue un atelier par rôle, jusqu’au compte rendu', () => {
  it('BRAV-M « En selle » : en selle, colonne jusqu’au bout du parcours, pied à terre', async () => {
    const { t, ctx, m } = await lancer('bravm-01-en-selle');
    expect(ctx.player.person()!.poste).toBe('pilote_moto');
    const { v, d0 } = enSelle(ctx, 0);
    expect(v.kind).toBe('moto_bravm');
    expect(d0).toBeLessThan(40);
    t.step(31);
    expect(m.phaseIndex).toBe(1);
    const p = ctx.world.placeByName('Place Salvador Allende')!;
    rouler(t, v, p.x, p.z);
    t.step(2);
    console.log(`BRAV-M : ${etat(m)} ; phase ${m.phaseIndex}`);
    expect(m.objectives.find((r) => r.def.id === 'o1')!.state).toBe('reussi');
    ctx.vehicles.exit(ctx.player.person()!);
    for (let i = 0; i < 120 && !m.result; i++) t.step(1);
    console.log(`BRAV-M : ${m.result?.summary}`);
    expect(m.result?.success).toBe(true);
  }, 300000);

  it('Centaure « Quatorze tonnes et demie » : parcours de plots, barrière du pont d’Iéna, en moins de cinq minutes', async () => {
    const { t, ctx, m } = await lancer('centaure-01-quatorze-tonnes-et-demie');
    const { v } = enSelle(ctx, 0);
    expect(v.kind).toBe('centaure');
    expect(ctx.player.person()!.poste).toBe('conducteur');
    t.step(31);
    const a = ctx.world.placeByName('Esplanade Bernard Duperier')!;
    rouler(t, v, a.x, a.z);
    t.step(1);
    console.log(`Centaure : plots ${etat(m)} ; ${ctx.clock.now.toFixed(0)} s ; ${m.result?.summary ?? ''} ; à ${Math.hypot(v.x - a.x, v.z - a.z).toFixed(0)} m`);
    expect(m.objectives.find((r) => r.def.id === 'o1')!.state).toBe('reussi');
    const b = ctx.world.placeByName('Pont d\'Iéna')!;
    rouler(t, v, b.x, b.z);
    t.step(1);
    console.log(`Centaure : ${etat(m)} ; phase ${m.phaseIndex} ; ${ctx.clock.now.toFixed(0)} s`);
    expect(m.objectives.find((r) => r.def.id === 'o2')!.state).toBe('reussi');
    // tir au lance-grenades sans foule ni sommation : la tourelle sert, la mission ne compte pas de faute grave
    const ammo0 = v.turretAmmo[0] ?? 0;
    for (let i = 0; i < 120 && !m.result; i++) t.step(1);
    console.log(`Centaure : ${m.result?.summary} ; tubes ${ammo0} → ${v.turretAmmo[0]}`);
    expect(m.result?.success).toBe(true);
  }, 300000);

  it('canon à eau « Dix mille litres » : jet droit, cuve au-dessus de quatre mille litres', async () => {
    const { t, ctx, m } = await lancer('canon-01-dix-mille-litres');
    // la fiche fait jouer l'opérateur (« le conducteur reste à son poste ») : place de tireur, canon gauche
    expect(ctx.player.person()!.poste).toBe('operateur');
    const { v } = enSelle(ctx, 1);
    expect(v.kind).toBe('canon_eau');
    expect(v.def.seats[1]!.role).toBe('gunner');
    const water = () => v.def.turrets.reduce((s, d, i) => s + (d.kind === 'canon_eau' ? v.turretAmmo[i] ?? 0 : 0), 0);
    const w0 = water();
    t.step(72);
    // le robot vise une zone vide de 30 m (jamais les collègues ni l'escorte), puis tient le jet quelques secondes
    let ax = v.x, az = v.z, best = -1;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = v.x + Math.sin(a) * 30, z = v.z + Math.cos(a) * 30;
      let near = 0;
      for (const q of ctx.people.list) {
        const t1 = ((q.x - v.x) * Math.sin(a) + (q.z - v.z) * Math.cos(a));
        const lat = Math.abs((q.x - v.x) * Math.cos(a) - (q.z - v.z) * Math.sin(a));
        if (q.vehicleId === 0 && t1 > 0 && t1 < 42 && lat < 6) near++;
      }
      const score = near === 0 ? 1000 - Math.abs(k - 8) : -near;
      if (score > best) { best = score; ax = x; az = z; }
    }
    if (process.env.DEBUG_CANON) {
      console.log(`canon : visée (${(ax - v.x).toFixed(0)}, ${(az - v.z).toFixed(0)}) score ${best} ; engin cap ${v.heading.toFixed(2)}`);
      for (const q of ctx.people.list) if (Math.hypot(q.x - v.x, q.z - v.z) < 40 && q.vehicleId === 0) console.log(`  ${q.name} sq ${q.squadId} (${(q.x - v.x).toFixed(0)}, ${(q.z - v.z).toFixed(0)}) ordre ${ctx.squads.get(q.squadId)?.order.type} cible ${ctx.squads.get(q.squadId)?.order.targetId}`);
    }
    // (au regard, comme le joueur : la tourelle suit la caméra)
    const st = ctx.player.state as unknown as { camYaw: number; camPitch: number };
    st.camYaw = Math.atan2(ax - v.x, az - v.z);
    t.step(2);
    const input = ctx.input as unknown as { down(b: string): boolean };
    const down = input.down;
    for (let k = 0; k < 3; k++) {
      input.down = (b: string) => b === 'primary';
      for (let i = 0; i < 30; i++) { st.camYaw = Math.atan2(ax - v.x, az - v.z); st.camPitch = 0.05; t.step(0.1); }
      input.down = down;
      if (process.env.DEBUG_CANON) console.log(`canon : tourelle gisement ${v.turretYaw[0]!.toFixed(2)} (voulu ${(Math.atan2(ax - v.x, az - v.z) - v.heading).toFixed(2)})`);
      t.step(4);
    }
    const w1 = water();
    for (const r of ctx.law.forceLog) {
      const q = ctx.people.get(r.targetId);
      console.log(`canon : force ${r.means} sur ${q ? `${q.faction}/${q.kind} ${q.name} squad ${q.squadId} à ${Math.hypot(q.x - v.x, q.z - v.z).toFixed(1)} m` : r.targetId} : ${r.verdict.kind} (${r.verdict.severity})`);
    }
    console.log(`canon : cuve ${w0} → ${w1.toFixed(0)} l ; ${etat(m)}`);
    expect(w1).toBeLessThan(w0 - 50);
    expect(w1).toBeGreaterThan(4000);
    for (let i = 0; i < 240 && !m.result; i++) t.step(1);
    console.log(`canon : ${m.result?.summary} (${ctx.clock.now.toFixed(0)} s)`);
    expect(m.result?.success).toBe(true);
    // au compte rendu, la mission ne s'est pas traînée jusqu'au bout des dix minutes
    expect(ctx.clock.now).toBeLessThan(400);
  }, 300000);

  it('télépilote « Arrêté préfectoral » : décollage, vol sous le plafond, mission réussie', async () => {
    const { t, ctx, m } = await lancer('drone-01-arrete-prefectoral');
    const me = ctx.player.person()!;
    expect(me.poste).toBe('telepilote');
    const ext = ctx.service<VehiclesExtApi>('vehicles.ext')!;
    t.step(2);
    const d = ext.droneOf(me.id) ?? ext.deployDrone(me);
    expect(d, 'drone déployé').toBeTruthy();
    let maxH = 0;
    for (let i = 0; i < 400 && !m.result; i++) {
      t.step(1);
      maxH = Math.max(maxH, d!.y - ctx.world.heightAt(d!.x, d!.z));
    }
    console.log(`drone : ${m.result?.summary} ; hauteur max ${maxH.toFixed(0)} m ; ${etat(m)}`);
    expect(m.result?.success).toBe(true);
    expect(maxH).toBeLessThan(100);
  }, 300000);
});
