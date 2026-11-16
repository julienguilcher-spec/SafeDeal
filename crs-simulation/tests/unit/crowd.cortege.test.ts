// Foule — le cortège organisé : structure (cortège de tête, carré de tête, banderole, service d'ordre, blocs,
// camion sono, queue), emplacements dans la largeur réelle des rues, effet d'accordéon, arrêt devant un barrage,
// choix du parcours (table des parcours réels à Paris, itinéraire libre ailleurs, parcours imposé).
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { CROWD_CORE, ROUTES } from '@/sim/crowd';
import type { CrowdCoreApi } from '@/sim/crowd';
import { brainOf } from '@/sim/crowd/brain';
import { createCrowdTest, demoConfig } from '@/sim/crowd/testkit';

const MODULES = [world, people, items, hazards, law];
const QUIET = { 'crowd.noAleas': true, 'crowd.bystanders': 0, 'crowd.present': 1 };

describe('foule — cortège', () => {
  it('se forme dans l\'ordre : cortège de tête, carré avec banderole, blocs, service d\'ordre aux flancs, camion sono, queue', async () => {
    const t = createCrowdTest({ seed: 2, modules: MODULES });
    const { ctx, core } = t;
    await t.start(demoConfig({ crowdSize: 400, extra: { ...QUIET, cause: 'retraites', 'crowd.scenario': 'journee_tendue' } }));
    const api = ctx.require<CrowdCoreApi>(CROWD_CORE);
    const f = api.formation;
    const kinds = f.sections.map((s) => s.kind);
    expect(kinds[0]).toBe('precortege');
    expect(kinds[1]).toBe('carre');
    expect(kinds).toContain('bloc');
    expect(kinds[kinds.length - 1]).toBe('queue');
    expect(f.sections.find((s) => s.kind === 'carre')!.label).toBe('Carré de tête');
    expect(f.sections.some((s) => s.label.startsWith('Cortège syndical'))).toBe(true);
    // les tronçons se suivent de l'avant vers l'arrière
    for (let i = 1; i < f.sections.length; i++) expect(f.sections[i]!.firstBlock).toBeGreaterThanOrEqual(f.sections[i - 1]!.firstBlock);
    expect(api.cause.id).toBe('retraites');
    expect(api.cause.chants.length).toBeGreaterThan(3);
    t.run(6);
    const crowd = t.protesters();
    expect(crowd.length).toBe(400);
    const pos = (p: Person): { s: number; lat: number } => {
      const s = core.corridor.project(p.x, p.z, f.headS - 40, 400);
      core.corridor.at(s, core.rp);
      return { s, lat: (p.x - core.rp.x) * -core.rp.tz + (p.z - core.rp.z) * core.rp.tx - core.rp.center };
    };
    // porteurs de la banderole de tête : côte à côte (même rang), espacés d'environ 0,9 m, devant les blocs
    const carriers = crowd.filter((p) => (brainOf(p)!.flags & 4) !== 0);
    expect(carriers.length).toBeGreaterThanOrEqual(3);
    const cp = carriers.map(pos).sort((a, b) => a.lat - b.lat);
    const spread = Math.max(...cp.map((c) => c.s)) - Math.min(...cp.map((c) => c.s));
    expect(spread).toBeLessThan(2.2);
    for (let i = 1; i < cp.length; i++) {
      expect(cp[i]!.lat - cp[i - 1]!.lat).toBeGreaterThan(0.55);
      expect(cp[i]!.lat - cp[i - 1]!.lat).toBeLessThan(1.5);
    }
    if (ctx.actions.def('banderole')) for (const c of carriers) expect(ctx.actions.has(c, 'banderole')).toBeGreaterThan(0);
    const bannerS = cp.reduce((a, c) => a + c.s, 0) / cp.length;
    // service d'ordre : une partie devant la banderole, le reste sur les flancs des blocs
    const so = crowd.filter((p) => p.profile === 'service_ordre').map(pos);
    expect(so.length).toBeGreaterThanOrEqual(8);
    const front = so.filter((q) => q.s > bannerS + 0.3 && q.s < bannerS + 6);
    expect(front.length).toBeGreaterThanOrEqual(3);
    const behind = so.filter((q) => q.s < bannerS - 3);
    core.corridor.at(bannerS - 30, core.rp);
    const flank = behind.filter((q) => Math.abs(q.lat) > core.rp.half * 0.7);
    expect(flank.length).toBeGreaterThanOrEqual(behind.length * 0.6);
    // radicaux et suiveurs marchent devant le carré ; les familles ferment la marche
    const mean = (list: Person[]): number => list.map(pos).reduce((a, q) => a + q.s, 0) / Math.max(1, list.length);
    const agitated = crowd.filter((p) => p.profile === 'radical' || p.profile === 'opportuniste');
    const families = crowd.filter((p) => p.profile === 'famille');
    const militants = crowd.filter((p) => p.profile === 'militant');
    expect(agitated.length).toBeGreaterThan(10);
    expect(mean(agitated)).toBeGreaterThan(bannerS + 8);
    expect(mean(militants)).toBeLessThan(bannerS);
    expect(mean(families)).toBeLessThan(mean(militants));
    // camion sono : derrière le carré, en tête du plus gros bloc
    const truck = ctx.vehicles.get(f.sonoVehicleId);
    expect(truck).toBeDefined();
    expect(truck!.kind).toBe('camion_sono');
    const ts = core.corridor.project(truck!.x, truck!.z, f.headS - 40, 400);
    expect(ts).toBeLessThan(bannerS - 3);
    expect(ts).toBeGreaterThan(f.tailS);
    // personne ne se tient devant son pare-chocs
    expect(crowd.filter((p) => p.vehicleId === 0 && Math.hypot(p.x - truck!.x, p.z - truck!.z) < 1.6).length).toBe(0);
    // unités : un cortège par tronçon, des groupes d'affinité rattachés, qui restent ensemble
    const squads = ctx.squads.list.filter((s) => s.faction === 'protest');
    expect(squads.filter((s) => s.kind === 'cortege').length).toBe(f.sections.length);
    const affinity = squads.filter((s) => s.kind === 'affinite' && s.members.length >= 2);
    expect(affinity.length).toBeGreaterThan(40);
    let apart = 0;
    for (const s of affinity) {
      const ms = s.members.map((id) => ctx.people.get(id)!).filter(Boolean);
      const cx = ms.reduce((a, p) => a + p.x, 0) / ms.length;
      const cz = ms.reduce((a, p) => a + p.z, 0) / ms.length;
      if (ms.some((p) => Math.hypot(p.x - cx, p.z - cz) > 9)) apart++;
    }
    expect(apart).toBeLessThan(affinity.length * 0.1);
    // chacun a une raison d'être là : cause et famille visuelle lisibles (look.extras), pancartes ou drapeaux
    expect(crowd.every((p) => p.look.extras !== undefined && p.look.extras['family'] !== undefined)).toBe(true);
    if (ctx.actions.def('pancarte')) {
      const signs = crowd.filter((p) => ctx.actions.has(p, 'pancarte') > 0 || ctx.actions.has(p, 'drapeau') > 0).length;
      expect(signs).toBeGreaterThan(crowd.length * 0.15);
    }
  }, 300_000);

  it('marche par emplacements dans la largeur réelle des rues, avec effet d\'accordéon', async () => {
    const t = createCrowdTest({ seed: 6, modules: MODULES });
    const { ctx, core } = t;
    await t.start(demoConfig({ crowdSize: 300, duration: 'standard', extra: QUIET }));
    const f = core.formation;
    // largeur du couloir : d'après la rue et ses murs — plus étroit rue du Pont (14 m) que sur la place
    core.corridor.at(40, core.rp);
    const onPlaza = core.rp.half;
    core.corridor.at(200, core.rp);
    const inStreet = core.rp.half;
    expect(onPlaza).toBeGreaterThan(8);
    expect(inStreet).toBeLessThan(6.5);
    expect(inStreet).toBeGreaterThan(4.5);
    expect(core.rp.stretch).toBeGreaterThan(1.3);
    t.run(185); // fin du rassemblement
    t.run(70);
    expect(ctx.director.phase).toBe('cortege');
    expect(f.headSpeed).toBeGreaterThan(0.8);
    // chaque emplacement occupé est sur la chaussée ou le trottoir, jamais dans un immeuble
    const check = (): void => {
      for (const p of t.protesters()) {
        const b = brainOf(p)!;
        if (b.slot < 0) continue;
        f.sample(b.slot, core.slot);
        expect(ctx.world.isFree(core.slot.x, core.slot.z, 0.25), `emplacement ${b.slot} en ${core.slot.x.toFixed(1)}, ${core.slot.z.toFixed(1)}`).toBe(true);
      }
    };
    check();
    // les marcheurs tiennent leur place : écart moyen faible
    const gap = (): number => {
      let sum = 0;
      let n = 0;
      for (const p of t.protesters()) {
        const b = brainOf(p)!;
        if (b.state !== 2) continue;
        f.sample(b.slot, core.slot);
        sum += Math.hypot(core.slot.x - p.x, core.slot.z - p.z);
        n++;
      }
      expect(n).toBeGreaterThan(250);
      return sum / n;
    };
    expect(gap()).toBeLessThan(1.5);
    // ── accordéon : la tête s'arrête, l'arrêt remonte le cortège bloc après bloc ──
    const last = f.blockCount - 1;
    const mid = last >> 1;
    const lengthBefore = f.headS - f.blockS(last);
    f.halt(40, 'essai');
    let stopHead = -1;
    let stopMid = -1;
    let stopLast = -1;
    for (let k = 0; k < 300; k++) {
      t.run(0.1);
      const now = ctx.clock.now;
      if (stopHead < 0 && f.headSpeed < 0.05) stopHead = now;
      if (stopMid < 0 && f.blockSpeed(mid) < 0.05) stopMid = now;
      if (stopLast < 0 && f.blockSpeed(last) < 0.05) stopLast = now;
    }
    expect(f.halted).toBe(true);
    expect(f.haltReason).toBe('essai');
    expect(stopHead).toBeGreaterThan(0);
    expect(stopMid).toBeGreaterThan(stopHead + 0.8);
    expect(stopLast).toBeGreaterThan(stopMid + 0.8);
    // le cortège s'est tassé, sans s'écraser
    const lengthStopped = f.headS - f.blockS(last);
    expect(lengthStopped).toBeLessThan(lengthBefore * 0.92);
    expect(lengthStopped).toBeGreaterThan(lengthBefore * 0.6);
    expect(core.density.max).toBeLessThan(4);
    t.run(14);
    // ── la tête repart, la queue attend son tour ──
    expect(f.halted).toBe(false);
    let goHead = -1;
    let goLast = -1;
    for (let k = 0; k < 400 && goLast < 0; k++) {
      t.run(0.1);
      if (goHead < 0 && f.headSpeed > 0.5) goHead = ctx.clock.now;
      if (goLast < 0 && f.blockSpeed(last) > 0.5) goLast = ctx.clock.now;
    }
    expect(goHead).toBeGreaterThan(0);
    expect(goLast).toBeGreaterThan(goHead + 2);
    t.run(40);
    check();
    expect(gap()).toBeLessThan(1.8);
    // dans la rue étroite le cortège s'est allongé plutôt que de se serrer
    expect(f.headS - f.blockS(last)).toBeGreaterThan(lengthBefore);
  }, 300_000);

  it('s\'arrête devant un barrage et tient ses distances', async () => {
    const t = createCrowdTest({ seed: 6, modules: MODULES });
    const { ctx, core } = t;
    await t.start(demoConfig({ crowdSize: 200, duration: 'courte', extra: QUIET }));
    const f = core.formation;
    t.run(100);
    expect(f.headSpeed).toBeGreaterThan(0.5);
    // une ligne de dix agents en travers du parcours, 45 m devant la tête
    const lineS = f.headS + 45;
    core.corridor.at(lineS, core.rp);
    const cops: Person[] = [];
    for (let i = 0; i < 10; i++) {
      const lateral = core.rp.center + (i - 4.5) * 0.9;
      cops.push(ctx.people.spawn({ kind: 'crs', faction: 'police', rank: 'gardien', poste: 'bouclier', x: core.rp.x - core.rp.tz * lateral, z: core.rp.z + core.rp.tx * lateral, heading: Math.atan2(-core.rp.tx, -core.rp.tz) }));
    }
    t.run(60);
    expect(f.headSpeed).toBeLessThan(0.05);
    expect(f.haltReason).toBe('barrage');
    expect(lineS - f.headS).toBeGreaterThan(9);
    expect(lineS - f.headS).toBeLessThan(17);
    // personne au contact de la ligne : la foule calme se tient à une dizaine de mètres
    let nearest = Infinity;
    for (const p of t.protesters()) for (const c of cops) nearest = Math.min(nearest, Math.hypot(p.x - c.x, p.z - c.z));
    expect(nearest).toBeGreaterThan(5);
    const stopped = f.headS;
    // le barrage est levé : le cortège repart
    for (const c of cops) ctx.people.remove(c.id);
    t.run(25);
    expect(f.headS).toBeGreaterThan(stopped + 8);
  }, 300_000);

  it('choisit le parcours : imposé, libre dans le quartier d\'essai, réel à Paris quand le lieu correspond', async () => {
    // quartier d'essai : aucun parcours de la table ne correspond → itinéraire par les rues
    const a = createCrowdTest({ seed: 1, modules: MODULES });
    await a.start(demoConfig({ crowdSize: 60, extra: QUIET }));
    expect(a.core.route.id).toBe('libre');
    expect(a.core.route.length).toBeGreaterThan(400);
    expect(a.ctx.director.route.length).toBeGreaterThanOrEqual(4);
    expect(a.ctx.director.headProgress).toBeGreaterThan(5);
    // parcours imposé par la mission
    const b = createCrowdTest({ seed: 1, modules: MODULES });
    await b.start(demoConfig({ crowdSize: 60, extra: { ...QUIET, 'crowd.route': [0, 40, 0, 150, 0, 280] } }));
    expect(b.core.route.id).toBe('impose');
    expect(Array.from(b.ctx.director.route)).toEqual([0, 40, 0, 150, 0, 280]);
    expect(b.core.route.length).toBeCloseTo(240, 0);
    // destination imposée : le trajet est calculé par les rues
    const c = createCrowdTest({ seed: 1, modules: MODULES });
    await c.start(demoConfig({ crowdSize: 60, extra: { ...QUIET, 'crowd.destination': "Pont de l'Essai" } }));
    expect(c.core.route.id).toBe('impose');
    const pts = c.ctx.director.route;
    expect(Math.hypot(pts[pts.length - 2]! - 0, pts[pts.length - 1]! - 360)).toBeLessThan(80);
    // table des parcours réels
    expect(ROUTES.length).toBeGreaterThanOrEqual(6);
    expect(ROUTES.map((r) => r.id)).toContain('republique_bastille');
    expect(ROUTES.map((r) => r.id)).toContain('opera_republique');
  }, 300_000);

  it('à Paris, place de la République : parcours réel de la table et stations de métro du secteur', async () => {
    const t = createCrowdTest({ seed: 3, modules: MODULES });
    await t.start({ mode: 'libre', place: 'Place de la République', crowdSize: 120, tension: 0.1, volatility: 0.2, duration: 'standard', extra: { ...QUIET, 'crowd.present': 0.5 } });
    const { ctx, core } = t;
    if (ctx.world.placeByName('Place de la République') === null) {
      console.warn('[foule] données de Paris absentes : essai du parcours réel ignoré');
      return;
    }
    expect(['republique_bastille', 'republique_opera']).toContain(core.route.id);
    const pts = ctx.director.route;
    const end = { x: pts[pts.length - 2]!, z: pts[pts.length - 1]! };
    if (core.route.id === 'republique_bastille') {
      // ≈ 1,5 km par les boulevards du Temple et Beaumarchais, arrivée place de la Bastille
      expect(core.route.length).toBeGreaterThan(1300);
      expect(core.route.length).toBeLessThan(2100);
      expect(Math.hypot(end.x - 3493, end.z - 1442)).toBeLessThan(160);
    } else {
      expect(core.route.length).toBeGreaterThan(2000);
      expect(core.route.length).toBeLessThan(3100);
      expect(Math.hypot(end.x - 803, end.z - (-586))).toBeLessThan(160);
    }
    // boulevard large : le cortège dispose d'un couloir d'au moins 14 m
    expect(core.corridor.refWidth).toBeGreaterThanOrEqual(14);
    const near = core.metro.stations.filter((s) => s.serving);
    expect(core.metro.stations.length).toBeGreaterThan(50);
    expect(near.length).toBeGreaterThanOrEqual(1);
    for (const s of near) expect(Math.hypot(s.x - core.rallyX, s.z - core.rallyZ)).toBeLessThan(450);
    t.run(20);
    for (const p of t.protesters()) expect(ctx.world.isFree(p.x, p.z, 0.05)).toBe(true);
    console.log('[foule] Paris :', core.route.label, Math.round(core.route.length), 'm ; couloir de référence', core.corridor.refWidth.toFixed(1), 'm ; stations du rassemblement :', near.map((s) => s.name + ' (' + s.entrances.length / 2 + ' bouches)').join(', '));
  }, 300_000);
});
