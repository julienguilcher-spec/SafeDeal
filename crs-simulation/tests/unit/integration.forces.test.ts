// Test d'intégration headless (assemblage 2) : la mise en place de session avec l'IA DE POLICE réelle, la foule,
// la circulation, les incidents et les secours, sur la vraie carte. Vérifie les défauts relevés par la recette du
// premier jeu assemblé : « Moyens engagés » sans effet, dispositif posé au milieu du rassemblement, fourgon garé
// nez vers le groupe, collègues qui n'exécutent pas les ordres.
import { describe, expect, it } from 'vitest';
import type { GameContext, PlayableRole, SessionConfig } from '@/core/contracts';
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
import { createSystems as incidents } from '@/gameplay/incidents';
import { createSystems as rescue } from '@/sim/roles/rescue';
import { createSystems as medics } from '@/sim/roles/medics';
import { createSystems as session } from '@/gameplay/session';
import { createSystems as input } from '@/input';
import type { InputScriptApi } from '@/input';
import type { SessionSetupApi } from '@/gameplay/session';

// même liste et même ordre que la partie « simulation » de src/main.ts (sans les entrées)
const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, incidents, rescue, medics, session];
import { DEFAULT_PLACES } from '@/ui/screens/catalog';

const CONCORDE = { x: -10, z: 15 };
const DEFAULT_MEANS = { sections: 4, fourgons: 12, centaure: 0, canon_eau: 1, bravm: 1, drone: 1, pompiers: 1, samu: 1, secours_sur_appel: true };

function setupOf(ctx: GameContext): SessionSetupApi {
  return ctx.require<SessionSetupApi>('session.setup');
}

function config(role: PlayableRole, place: { x: number; z: number }, extra: Record<string, unknown>, more: Partial<SessionConfig> = {}): Partial<SessionConfig> {
  return { mode: 'libre', role, rank: null, place: 'essai', x: place.x, z: place.z, crowdSize: 300, tension: 0.3, volatility: 0.4, duration: 'standard', extra, ...more };
}

interface Scene {
  police: number; protesters: number; nearest: number; stuck: number; far: number; kinds: Record<string, number>;
}

function scene(ctx: GameContext): Scene {
  const s = setupOf(ctx).summary!;
  const cfg = ctx.session.config!;
  const pol = ctx.people.list.filter((p) => p.faction === 'police');
  const man = ctx.people.list.filter((p) => p.faction === 'protest');
  let nearest = Infinity;
  for (const m of man) for (const p of pol) nearest = Math.min(nearest, Math.hypot(m.x - p.x, m.z - p.z));
  const kinds: Record<string, number> = {};
  for (const v of ctx.vehicles.list) if (v.faction === 'police') kinds[v.kind] = (kinds[v.kind] ?? 0) + 1;
  return {
    police: pol.length, protesters: man.length, nearest,
    stuck: pol.filter((p) => p.vehicleId === 0 && !ctx.world.isFree(p.x, p.z, 0.05)).length,
    far: Math.hypot(s.x - cfg.x!, s.z - cfg.z!), kinds,
  };
}

function watch(ctx: GameContext): string[] {
  const errors: string[] = [];
  ctx.events.onAny('core:system_disabled', (p) => errors.push('système désactivé : ' + JSON.stringify(p)));
  return errors;
}

/** Distance d'un point à la polyligne du parcours. */
function toRoute(route: readonly number[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 3 < route.length; i += 2) {
    const ax = route[i]!, az = route[i + 1]!, dx = route[i + 2]! - ax, dz = route[i + 3]! - az;
    const l2 = dx * dx + dz * dz;
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * u, z - az - dz * u));
  }
  return best;
}

describe('intégration : forces de l’ordre réelles (assemblage 2)', () => {
  it('« Moyens engagés » par défaut, CRS place de la Concorde : compagnie de 4 sections, 12 fourgons, canon à eau, BRAV-M, drone — à l’écart du rassemblement', async () => {
    const t = createTestContext({ seed: 17, modules: SIM });
    const errors = watch(t.ctx);
    await t.start(config('crs', CONCORDE, { poste: 'lanceur', moyens: DEFAULT_MEANS }));
    const { ctx } = t;
    const s = setupOf(ctx).summary!;
    const sc = scene(ctx);
    console.log(`moyens par défaut : emplacement à ${sc.far.toFixed(0)} m du lieu, ${sc.police} policiers, ${sc.protesters} manifestants sur place, le plus proche à ${sc.nearest.toFixed(0)} m, véhicules ${JSON.stringify(sc.kinds)}, moyens ${JSON.stringify(s.means)}`);
    expect(s.usedPoliceUnits).toBe(true);
    expect(s.offCrowd).toBe(true);
    // les moyens demandés sont là
    expect(s.means.sections).toBe(4);
    expect(sc.kinds['fourgon_crs']).toBe(12);
    expect(sc.kinds['canon_eau']).toBe(1);
    expect(sc.kinds['moto_bravm']).toBe(6);
    expect(sc.kinds['vl_commandement']).toBe(1);
    expect(s.means.drone).toBe(1);
    expect(s.means.agents).toBeGreaterThanOrEqual(4 * 16 + 12);
    // le joueur tient son poste dans le premier groupe de la première section
    const me = ctx.player.person()!;
    expect(me.isPlayer).toBe(true);
    expect(me.poste).toBe('lanceur');
    const squad = ctx.squads.get(me.squadId)!;
    expect(squad.kind).toBe('groupe');
    expect(ctx.squads.get(squad.parentId)!.kind).toBe('section');
    // dispositif HORS du rassemblement et du couloir du parcours, à 80–130 m, face au lieu
    expect(sc.far).toBeGreaterThanOrEqual(80);
    expect(sc.far).toBeLessThanOrEqual(130);
    expect(sc.protesters).toBeGreaterThan(20);
    expect(sc.nearest).toBeGreaterThan(25);
    expect(toRoute(ctx.director.route, s.x, s.z)).toBeGreaterThanOrEqual(39);
    const toward = Math.atan2(CONCORDE.x - s.x, CONCORDE.z - s.z);
    expect(Math.abs(Math.atan2(Math.sin(toward - s.heading), Math.cos(toward - s.heading)))).toBeLessThan(0.05);
    expect(sc.stuck).toBe(0);
    // véhicules garés DERRIÈRE l'unité, dans l'axe du dispositif, NEZ VERS LA SORTIE RÉELLE de leur bloc
    // (session/setup.ts, faceExit) : dos à l'unité si c'est de ce côté que le bloc sort le mieux, sinon (et à égalité)
    // face à elle — le premier rang, celui du VL, mène alors la sortie
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    for (const v of ctx.vehicles.list) {
      // fourgons cellulaires avec leur équipage : au point de remise des interpellés, derrière l'unité, garés le long du
      // trottoir de leur rue (pas dans l'axe du bloc ; voir session.cellulaires)
      if (v.kind === 'fourgon_cellulaire') {
        expect((v.x - s.x) * fx + (v.z - s.z) * fz, 'fourgon cellulaire derrière l’unité').toBeLessThan(-10);
        continue;
      }
      if (v.kind !== 'fourgon_crs' && v.kind !== 'vl_commandement') continue;
      expect((v.x - s.x) * fx + (v.z - s.z) * fz).toBeLessThan(-10);
      const axis = Math.sin(v.heading) * fx + Math.cos(v.heading) * fz;
      expect(Math.abs(axis)).toBeGreaterThan(0.95);
      // dos à l'unité : 60 m droit devant le capot, aucun collègue à pied dans le couloir du véhicule (face à l'unité,
      // les équipages en rang devant le bloc embarquent avant le départ)
      if (axis > 0) continue;
      for (const p of ctx.people.list) {
        if (p.faction !== 'police' || p.vehicleId !== 0) continue;
        const along = (p.x - v.x) * Math.sin(v.heading) + (p.z - v.z) * Math.cos(v.heading);
        const side = Math.abs(-(p.x - v.x) * Math.cos(v.heading) + (p.z - v.z) * Math.sin(v.heading));
        expect(along > 2 && along < 60 && side < 1.6, `agent dans l'axe du ${v.kind}`).toBe(false);
      }
    }
    // deux minutes : le commandant IA déploie, les unités bougent, rien ne casse
    const before = new Map<number, { x: number; z: number }>();
    for (const p of ctx.people.list) if (p.faction === 'police' && !p.isPlayer) before.set(p.id, { x: p.x, z: p.z });
    const cpu0 = process.cpuUsage();
    const tick0 = ctx.clock.tick;
    t.step(120);
    const cpu = process.cpuUsage(cpu0);
    let moved = 0;
    for (const [id, at] of before) {
      const p = ctx.people.get(id);
      if (p && Math.hypot(p.x - at.x, p.z - at.z) > 5) moved++;
    }
    const radio = ctx.radio.log.slice(0, 6).map((m) => `${m.from} : ${m.text.slice(0, 70)}`);
    console.log(`après 2 min : ${moved} agents sur ${before.size} ont manœuvré ; ${ctx.radio.log.length} messages radio ; coût ${((cpu.user + cpu.system) / 1000 / (ctx.clock.tick - tick0)).toFixed(2)} ms de processeur par pas ; ${ctx.people.list.length} personnes, ${ctx.vehicles.list.length} véhicules`);
    console.log(radio.join('\n'));
    expect(moved).toBeGreaterThan(10);
    expect(scene(ctx).stuck).toBe(0);
    for (const p of ctx.people.list) expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    expect(errors).toEqual([]);
  }, 300000);

  it('le réglage change réellement ce qui est engagé : 2 sections · 6 fourgons · drone, puis 4 sections · 6 fourgons, puis 6 sections', async () => {
    const t = createTestContext({ seed: 5, modules: SIM });
    const errors = watch(t.ctx);
    const run = async (role: PlayableRole, moyens: Record<string, unknown>, poste?: string): Promise<{ s: ReturnType<typeof setupOf>['summary']; sc: Scene }> => {
      await t.start(config(role, CONCORDE, poste ? { poste, moyens } : { moyens }));
      const out = { s: setupOf(t.ctx).summary, sc: scene(t.ctx) };
      t.step(10);
      return out;
    };
    // commandant : 2 sections, 6 fourgons, un drone, rien d'autre
    let r = await run('commandant', { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 1 });
    console.log(`commandant, 2 sections : ${JSON.stringify(r.s!.means)} ${JSON.stringify(r.sc.kinds)}`);
    expect(r.s!.means.sections).toBe(2);
    expect(r.sc.kinds['fourgon_crs']).toBe(6);
    expect(r.sc.kinds['canon_eau']).toBeUndefined();
    expect(r.sc.kinds['moto_bravm']).toBeUndefined();
    expect(r.s!.means.drone).toBe(1);
    const cdt = t.ctx.player.person()!;
    expect(cdt.poste).toBe('commandant_unite');
    expect(cdt.look.sash).toBe(true);
    expect(t.ctx.squads.get(cdt.squadId)!.kind).toBe('compagnie');
    const agents2 = r.s!.means.agents;

    // 4 sections mais 6 fourgons seulement : six groupes sans fourgon, pas de conducteur en trop
    r = await run('crs', { sections: 4, fourgons: 6, centaure: 1, canon_eau: 2, bravm: 2, drone: 0 }, 'bouclier');
    console.log(`4 sections, 6 fourgons, Centaure, 2 canons, 2 BRAV-M : ${JSON.stringify(r.s!.means)} ${JSON.stringify(r.sc.kinds)}`);
    expect(r.s!.means.sections).toBe(4);
    expect(r.sc.kinds['fourgon_crs']).toBe(6);
    expect(r.sc.kinds['centaure']).toBe(1);
    expect(r.sc.kinds['canon_eau']).toBe(2);
    expect(r.sc.kinds['moto_bravm']).toBe(12);
    expect(r.s!.means.bravm).toBe(2);
    expect(r.s!.means.drone).toBe(0);
    expect(r.s!.means.agents).toBeGreaterThan(agents2 + 30);
    expect(t.ctx.player.person()!.poste).toBe('bouclier');

    // 6 sections : les deux sections de renfort sont rattachées à la même compagnie
    r = await run('chef_groupe', { sections: 6, fourgons: 18, centaure: 0, canon_eau: 0, bravm: 0, drone: 0 }, 'chef_section');
    console.log(`6 sections : ${JSON.stringify(r.s!.means)} ${JSON.stringify(r.sc.kinds)}`);
    expect(r.s!.means.sections).toBe(6);
    expect(r.sc.kinds['fourgon_crs']).toBeGreaterThanOrEqual(12);
    const chef = t.ctx.player.person()!;
    expect(chef.poste).toBe('chef_section');
    for (const sq of t.ctx.squads.list) if (sq.kind === 'section' && sq.faction === 'police') expect(sq.parentId).toBe(r.s!.rootSquadId);
    expect(r.sc.stuck).toBe(0);
    expect(errors).toEqual([]);
  }, 300000);

  it('un ordre du chef de groupe est exécuté : « avancer » fait réellement avancer les collègues', async () => {
    const t = createTestContext({ seed: 23, modules: SIM });
    const errors = watch(t.ctx);
    // patrouille libre, sans manifestation : le seul groupe du joueur, personne d'autre ne lui donne d'ordre
    await t.start(config('chef_groupe', CONCORDE, { 'crowd.none': true }, { mode: 'monde_ouvert', crowdSize: 0 }));
    const { ctx } = t;
    const s = setupOf(ctx).summary!;
    const me = ctx.player.person()!;
    expect(me.poste).toBe('chef_groupe');
    const squad = ctx.squads.get(me.squadId)!;
    expect(squad.leaderId).toBe(me.id);
    const mates = squad.members.map((id) => ctx.people.get(id)!).filter((p) => !p.isPlayer && p.vehicleId === 0);
    expect(mates.length).toBeGreaterThanOrEqual(5);
    t.step(3);
    const from = mates.map((p) => ({ x: p.x, z: p.z }));
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    ctx.squads.issue(squad.id, { type: 'avancer', x: me.x + fx * 20, z: me.z + fz * 20, heading: s.heading, issuedBy: me.id });
    t.step(25);
    const gains = mates.map((p, i) => (p.x - from[i]!.x) * fx + (p.z - from[i]!.z) * fz);
    console.log(`ordre « avancer » de 20 m : avance des collègues ${gains.map((g) => g.toFixed(1)).join(', ')} m ; radio : ${ctx.radio.log.slice(-2).map((m) => m.text.slice(0, 60)).join(' | ')}`);
    for (const g of gains) expect(g).toBeGreaterThan(8);
    // le joueur, lui, n'est jamais déplacé par l'IA
    expect(Math.hypot(me.x - s.x, me.z - s.z)).toBeLessThan(6);
    expect(errors).toEqual([]);
  }, 120000);

  it('chef de groupe DANS une compagnie tenue par l’IA : le groupe reste avec le joueur, puis exécute son ordre sans traîner', async () => {
    const t = createTestContext({ seed: 7, modules: SIM });
    const errors = watch(t.ctx);
    await t.start(config('chef_groupe', CONCORDE, {}, { crowdSize: 120 }));
    const { ctx } = t;
    const s = setupOf(ctx).summary!;
    const me = ctx.player.person()!;
    const squad = ctx.squads.get(me.squadId)!;
    expect(squad.leaderId).toBe(me.id);
    expect(ctx.squads.list.some((q) => q.kind === 'compagnie' && q.faction === 'police')).toBe(true);
    const mates = squad.members.map((id) => ctx.people.get(id)!).filter((p) => !p.isPlayer && p.vehicleId === 0);
    expect(mates.length).toBeGreaterThanOrEqual(5);
    // 1. la compagnie se déploie (l'IA donne ses ordres aux sections) : le groupe du joueur ne part pas sans lui
    t.step(60);
    const near = mates.map((p) => Math.hypot(p.x - me.x, p.z - me.z));
    console.log(`chef de groupe : après 60 s de déploiement, équipiers à ${near.map((d) => d.toFixed(0)).join(', ')} m du joueur ; ordre « ${squad.order.type} »`);
    expect(squad.order.type).toBe('suivre');
    for (const d of near) expect(d).toBeLessThan(15);
    // 2. le joueur ordonne d'avancer de 25 m et y marche : le groupe y est en moins de 30 s
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const tx = me.x + fx * 25, tz = me.z + fz * 25;
    ctx.squads.issue(squad.id, { type: 'avancer', x: tx, z: tz, heading: s.heading, issuedBy: me.id });
    for (let i = 0; i < 300; i++) {
      const d = Math.hypot(tx - me.x, tz - me.z);
      if (d > 0.3) { me.x += ((tx - me.x) / d) * 0.14; me.z += ((tz - me.z) / d) * 0.14; }
      t.step(0.1);
    }
    const left = mates.map((p) => Math.hypot(p.x - tx, p.z - tz));
    console.log(`chef de groupe : distance des équipiers au point ordonné après 30 s : ${left.map((d) => d.toFixed(1)).join(', ')} m ; ordre « ${squad.order.type} »`);
    expect(squad.order.type).toBe('avancer');
    expect(squad.order.issuedBy).toBe(me.id);
    for (const d of left) expect(d).toBeLessThan(6);
    expect(errors).toEqual([]);
  }, 120000);

  it('poste du second rang dans une compagnie de l’IA : le joueur ne commence pas enfermé derrière les boucliers, il peut avancer tout de suite', async () => {
    for (const [seed, poste] of [[7, 'lanceur'], [12, 'grenadier'], [19, 'lanceur']] as const) {
      const t = createTestContext({ seed, modules: [input, ...SIM] });
      const errors = watch(t.ctx);
      await t.start(config('crs', CONCORDE, { poste, moyens: DEFAULT_MEANS }, { crowdSize: 200 }));
      const { ctx } = t;
      const s = setupOf(ctx).summary!;
      const me = ctx.player.person()!;
      expect(s.usedPoliceUnits).toBe(true);
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      // personne dans l'axe du regard à moins de 3,2 m ; l'unité est à côté ; pas dans un mur
      let ahead = 0;
      let nearest = Infinity;
      for (const p of ctx.people.list) {
        if (p === me || p.vehicleId !== 0) continue;
        const dx = p.x - me.x, dz = p.z - me.z;
        const a = dx * fx + dz * fz;
        if (a > 0.4 && a < 3.2 && Math.abs(dx * -fz + dz * fx) < a * 0.7 + 0.3) ahead++;
        if (p.faction === 'police') nearest = Math.min(nearest, Math.hypot(dx, dz));
      }
      expect(ahead).toBe(0);
      expect(nearest).toBeLessThan(4);
      expect(nearest).toBeGreaterThan(0.5);
      expect(ctx.world.isFree(me.x, me.z, 0.3)).toBe(true);
      // il avance dès la première seconde (au premier assemblage : 1,4 m en 8 s, bloqué par le rang de boucliers)
      const script = ctx.require<InputScriptApi>('input.script');
      const x0 = me.x, z0 = me.z;
      script.setMove(0, 1);
      const trace: string[] = [];
      for (let i = 0; i < 8; i++) {
        t.step(1);
        let near = Infinity;
        for (const p of ctx.people.list) if (p !== me && p.vehicleId === 0) near = Math.min(near, Math.hypot(p.x - me.x, p.z - me.z));
        trace.push(`${((me.x - x0) * fx + (me.z - z0) * fz).toFixed(1)}/${((me.x - x0) * -fz + (me.z - z0) * fx).toFixed(1)}(${near.toFixed(1)}${ctx.world.isFree(me.x + fx * 0.6, me.z + fz * 0.6, 0.3) ? '' : ' mur'})`);
      }
      console.log('trace', trace.join(' '), 'device', ctx.input.device);
      script.setMove(0, 0);
      const walked = (me.x - x0) * fx + (me.z - z0) * fz;
      console.log(`${poste} (graine ${seed}) : collègue le plus proche à ${nearest.toFixed(1)} m, ${walked.toFixed(1)} m parcourus vers l'avant en 8 s, vue « ${ctx.player.state.cameraMode} »`);
      expect(walked).toBeGreaterThan(7);
      expect(errors).toEqual([]);
    }
  }, 300000);

  it('rôles hors compagnie : la compagnie commandée par l’IA est là, l’équipe du joueur à côté ; le manifestant est sur le lieu', async () => {
    const t = createTestContext({ seed: 31, modules: SIM });
    const errors = watch(t.ctx);
    const moyens = { sections: 2, fourgons: 6, centaure: 0, canon_eau: 0, bravm: 0, drone: 0 };
    // BRAV-M : son groupe est créé directement, sur le flanc de la compagnie
    await t.start(config('bravm', CONCORDE, { moyens }));
    let ctx = t.ctx;
    let s = setupOf(ctx).summary!;
    let me = ctx.player.person()!;
    expect(me.kind).toBe('bravm');
    expect(s.usedPoliceUnits).toBe(true);
    expect(s.means.sections).toBe(2);
    const company = ctx.squads.list.find((q) => q.kind === 'compagnie')!;
    expect(company).toBeDefined();
    expect(ctx.people.get(company.leaderId)!.isPlayer).toBe(false);
    // (poste par défaut : opérateur passager — trois binômes, une moto chacun, sous le groupe « BRAV-M 1 »)
    let top = ctx.squads.get(me.squadId)!;
    while (top.parentId !== 0) top = ctx.squads.get(top.parentId)!;
    const team = ctx.squads.list.filter((q) => q.id === top.id || q.parentId === top.id).flatMap((q) => q.members);
    expect(team.length).toBe(6);
    // personne de l'équipe du joueur n'est posé dans les rangs de la compagnie
    const others = ctx.people.list.filter((p) => p.faction === 'police' && team.indexOf(p.id) < 0 && p.vehicleId === 0);
    let closest = Infinity;
    for (const id of team) {
      const p = ctx.people.get(id)!;
      for (const o of others) closest = Math.min(closest, Math.hypot(p.x - o.x, p.z - o.z));
    }
    console.log(`BRAV-M : équipe du joueur à ${Math.hypot(me.x - s.x, me.z - s.z).toFixed(1)} m de son emplacement, agent de la compagnie le plus proche à ${closest.toFixed(1)} m ; motos ${ctx.vehicles.list.filter((v) => v.kind === 'moto_bravm').length}`);
    expect(closest).toBeGreaterThan(1.5);
    expect(scene(ctx).stuck).toBe(0);
    t.step(20);
    expect(scene(ctx).stuck).toBe(0);

    // manifestant : lui est sur le lieu du rassemblement, les forces de l'ordre à l'écart
    await t.start(config('manifestant', CONCORDE, { moyens }));
    ctx = t.ctx;
    s = setupOf(ctx).summary!;
    me = ctx.player.person()!;
    expect(me.faction).toBe('protest');
    expect(Math.hypot(me.x - CONCORDE.x, me.z - CONCORDE.z)).toBeLessThan(80);
    const police = ctx.people.list.filter((p) => p.faction === 'police');
    expect(police.length).toBeGreaterThan(30);
    let nearestCop = Infinity;
    for (const p of police) nearestCop = Math.min(nearestCop, Math.hypot(p.x - me.x, p.z - me.z));
    console.log(`manifestant : à ${Math.hypot(me.x - CONCORDE.x, me.z - CONCORDE.z).toFixed(0)} m du lieu, policier le plus proche à ${nearestCop.toFixed(0)} m, ${police.length} policiers`);
    expect(nearestCop).toBeGreaterThan(40);
    t.step(20);
    expect(errors).toEqual([]);
  }, 300000);

  it('les dix lieux de la page d’accueil : compagnie placée à l’écart de la manifestation, personne dans un mur', async () => {
    const t = createTestContext({ seed: 13, modules: SIM });
    const errors = watch(t.ctx);
    for (const place of DEFAULT_PLACES) {
      await t.start(config('commandant', place, { moyens: { sections: 2, fourgons: 6, centaure: 0, canon_eau: 1, bravm: 0, drone: 0 } }, { crowdSize: 400, place: place.name }));
      const { ctx } = t;
      const s = setupOf(ctx).summary!;
      const sc = scene(ctx);
      const dRoute = toRoute(ctx.director.route, s.x, s.z);
      console.log(`${place.name.padEnd(26)} à ${sc.far.toFixed(0).padStart(3)} m du lieu, à l'écart ${s.offCrowd ? 'oui' : 'NON'}, manifestant le plus proche ${sc.nearest.toFixed(0).padStart(3)} m, parcours à ${dRoute.toFixed(0).padStart(3)} m, ${sc.police} policiers, dans un obstacle ${sc.stuck}, ${JSON.stringify(sc.kinds)}`);
      expect(ctx.player.person(), place.name).not.toBeNull();
      expect(s.offCrowd, place.name).toBe(true);
      expect(sc.far, place.name).toBeGreaterThan(55);
      expect(sc.nearest, place.name).toBeGreaterThan(15);
      expect(dRoute, place.name).toBeGreaterThan(20);
      expect(s.means.sections, place.name).toBe(2);
      expect(sc.kinds['fourgon_crs'] ?? 0, place.name).toBeGreaterThanOrEqual(4);
      t.step(5);
      expect(scene(ctx).stuck, place.name).toBe(0);
    }
    expect(errors).toEqual([]);
  }, 300000);
});
