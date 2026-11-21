// Groupes radicaux — journée chaude sur l'avenue du quartier d'essai, une ligne d'agents en travers du parcours.
// Chaîne complète : signes avant-coureurs AVANT la première violence (délai mesuré), bloc formé en tête et en
// noir, salves lancées sur la ligne avec des projectiles pris dans la rue (stock vérifié), repli quand le
// rapport de force s'inverse (gaz et bond offensif), puis fusion dans la foule (les infractions restent).
import { describe, expect, it } from 'vitest';
import type { Person } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { BLOC_EVENT, CROWD_RADICAL, CROWD_SIGNALS } from '@/sim/crowd';
import type { BlocEvent, RadicalApi, SignalsApi } from '@/sim/crowd';
import { ammoOf, avenueConfig, chantier, createRadicalTest, policeLine, raiseShields } from '@/sim/crowd/radical/testkit';

const MODULES = [world, roles, people, items, hazards, law, props, vehicles];

describe('groupes radicaux — bloc, salves, repli, fusion', () => {
  it('annonce le passage à l\'acte par des signes, lance des salves avec des projectiles pris dans la rue, se replie et se fond dans la foule', async () => {
    const t = createRadicalTest({ seed: 5, modules: MODULES });
    const { ctx, core, watch } = t;
    const phases: { t: number; phase: string }[] = [];
    ctx.events.onAny(BLOC_EVENT, (payload) => {
      const e = payload as BlocEvent;
      phases.push({ t: ctx.clock.now, phase: e.phase });
    });
    await t.start(avenueConfig());
    t.run(1);
    chantier(ctx, 186, 15);
    chantier(ctx, 192, -15);
    const line = policeLine(ctx, 250, 0, -Math.PI / 2, 16, 1.1);
    t.run(1);
    raiseShields(ctx, line);
    const api = ctx.require<RadicalApi>(CROWD_RADICAL);
    const signals = ctx.require<SignalsApi>(CROWD_SIGNALS);
    const radicals = t.radicals();
    expect(radicals.length).toBeGreaterThanOrEqual(15);
    // au départ : des manifestants comme les autres, les mains vides
    expect(radicals.filter((p) => p.look.outfit === 'black_bloc' || p.look.faceCover).length).toBe(0);
    for (const p of t.protesters()) expect(ammoOf(p)).toBe(0);

    // ── suivi du stock : tout projectile lancé a d'abord été pris quelque part ──
    const held = new Map<number, number>();
    const gained = new Map<number, number>();
    let pickups = 0;
    ctx.events.onAny('interaction:completed', (payload) => {
      const e = payload as { verb: string };
      if (e.verb === 'depaver' || e.verb === 'ramasser') pickups++;
    });
    const sample = (): void => {
      for (const p of t.protesters()) {
        const now = ammoOf(p);
        const before = held.get(p.id) ?? 0;
        // un lancer retire une unité ; une prise en ajoute une ou deux
        if (now > before) gained.set(p.id, (gained.get(p.id) ?? 0) + now - before);
        held.set(p.id, now);
      }
    };

    // ── points de chute des projectiles lancés par des manifestants ──
    const kinds: Record<string, number> = {};
    let impacts = 0;
    let onLine = 0;
    let onPolice = 0;
    ctx.events.on('projectile:impact', (e) => {
      const owner = ctx.people.get(e.ownerId);
      if (owner && owner.faction === 'protest') kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
      if (!owner || owner.faction !== 'protest' || (e.kind !== 'pave' && e.kind !== 'bouteille')) return;
      impacts++;
      if (Math.abs(e.x - 250) < 12 && Math.abs(e.z) < 14) onLine++;
      const hit = e.hitKind === 'person' ? ctx.people.get(e.hitId) : undefined;
      if (hit && hit.faction === 'police') onPolice++;
    });

    // ── jusqu'à la première violence ──
    let blackAtAction = 0;
    let headS = 0;
    let blocS = 0;
    let spread = 0;
    let seenAction = false;
    for (let s = 0; s < 260 && watch.thrown < 12; s += 0.5) {
      t.run(0.5);
      sample();
      if (!seenAction && api.phase === 'action') {
        seenAction = true;
        // le bloc à l'instant du passage à l'acte : en tête, groupé, en noir
        const alive = t.radicals();
        let sx = 0;
        let sz = 0;
        for (const p of alive) {
          sx += p.x;
          sz += p.z;
        }
        sx /= alive.length;
        sz /= alive.length;
        blocS = core.corridor.project(sx, sz, core.formation.headS, 200);
        headS = core.formation.headS;
        spread = alive.reduce((a, p) => a + Math.hypot(p.x - sx, p.z - sz), 0) / alive.length;
        blackAtAction = alive.filter((p) => p.look.outfit === 'black_bloc' || (p.look.extras?.bloc ?? 0) === 1 || p.look.faceCover).length / alive.length;
      }
    }
    const firstSign = api.stats.firstSignAt;
    const firstViolence = api.stats.firstViolenceAt;
    console.log('[radicaux] phases du bloc', phases.map((p) => p.phase + '@' + p.t.toFixed(0)).join(' → '));
    console.log('[radicaux] signes', JSON.stringify(Object.fromEntries(Object.entries(watch.signs).map(([k, v]) => [k, Math.round(v)]))),
      '| premier signe', firstSign.toFixed(0), 's | première violence', firstViolence.toFixed(0), 's | avance', (firstViolence - firstSign).toFixed(0), 's');
    console.log('[radicaux] bloc au passage à l\'acte : abscisse', blocS.toFixed(0), 'm, tête du cortège', headS.toFixed(0), 'm, dispersion', spread.toFixed(1), 'm, part masquée ou en noir', blackAtAction.toFixed(2));
    // les signes précèdent la première violence d'au moins trois quarts de minute (mission courte), dans l'ordre
    expect(firstSign).toBeGreaterThan(0);
    expect(firstViolence).toBeGreaterThan(firstSign);
    expect(firstViolence - firstSign).toBeGreaterThanOrEqual(45);
    for (const type of ['regroupement', 'visages_couverts', 'signal_ralliement', 'changement_tenue']) {
      expect(watch.signs[type], type).toBeDefined();
      expect(watch.signs[type]!, type).toBeLessThan(firstViolence);
    }
    expect(watch.signs['regroupement']!).toBeLessThanOrEqual(watch.signs['visages_couverts']!);
    expect(watch.signs['visages_couverts']!).toBeLessThanOrEqual(watch.signs['changement_tenue']!);
    expect(watch.signs['depavage'] ?? watch.signs['collecte'], 'collecte de projectiles').toBeDefined();
    expect(Math.min(watch.signs['depavage'] ?? Infinity, watch.signs['collecte'] ?? Infinity)).toBeLessThan(firstViolence);
    expect(signals.list.every((sg) => sg.groupId > 0 && sg.squadId > 0 && Number.isFinite(sg.x) && Number.isFinite(sg.z))).toBe(true);
    expect(phases.map((p) => p.phase).slice(0, 3)).toEqual(['signes', 'formation', 'action']);
    // le bloc s'est formé en tête, groupé, en noir
    expect(seenAction).toBe(true);
    expect(blocS).toBeGreaterThan(headS - 6);
    expect(spread).toBeLessThan(16);
    expect(blackAtAction).toBeGreaterThan(0.8);
    // groupes d'affinité de 5 à 15, avec un meneur, déclarés dans ctx.squads
    for (const g of api.groups) {
      expect(g.strength).toBeGreaterThanOrEqual(5);
      expect(g.strength).toBeLessThanOrEqual(15);
      expect(g.leaderId).toBeGreaterThan(0);
      const squad = ctx.squads.get(g.squadId);
      expect(squad?.kind).toBe('affinite');
      expect(squad?.leaderId).toBe(g.leaderId);
    }

    // ── salves ──
    for (let s = 0; s < 60 && api.stats.volleys < 4; s += 0.5) {
      t.run(0.5);
      sample();
    }
    const thrownStones = watch.thrown;
    console.log('[radicaux] salves', api.stats.volleys, '| projectiles lancés', thrownStones, '| pris dans la rue', [...gained.values()].reduce((a, b) => a + b, 0),
      '| gestes de prise', pickups, '| agents touchés', watch.policeHurt, '| infractions', JSON.stringify(watch.offenses));
    expect(api.stats.volleys).toBeGreaterThanOrEqual(2);
    expect(thrownStones).toBeGreaterThanOrEqual(10);
    expect(watch.offenses['jet_projectile'] ?? 0).toBeGreaterThan(0);
    // stock : personne n'a lancé plus qu'il n'a ramassé, et il y a eu des gestes de prise
    expect(pickups).toBeGreaterThan(0);
    for (const [id, n] of watch.thrownBy) {
      const p = ctx.people.get(id);
      const special = p ? p.inventory.filter((st) => st.id === 'mortier' || st.id === 'molotov').length : 0;
      if (special === 0) expect(n, 'lanceur ' + id).toBeLessThanOrEqual(gained.get(id) ?? 0);
    }
    // les projectiles ont visé la ligne : la plupart tombent sur elle ou à ses pieds, certains touchent un agent ou son bouclier
    console.log('[radicaux] types', JSON.stringify(kinds));
    console.log('[radicaux] points de chute :', impacts, 'dont', onLine, 'sur la ligne ou à ses pieds et', onPolice, 'sur un agent ou son bouclier');
    expect(impacts).toBeGreaterThanOrEqual(8);
    expect(onLine).toBeGreaterThanOrEqual(Math.ceil(impacts * 0.5));
    expect(onPolice).toBeGreaterThan(0);

    // ── le rapport de force s'inverse : gaz sur le bloc, renforts, bond offensif ──
    const before = api.stats.retreats + api.stats.scatters + api.stats.melts;
    const offenders = t.radicals().filter((p) => p.offenses.length > 0).map((p) => p.id);
    expect(offenders.length).toBeGreaterThan(0);
    const g0 = api.groups[0]!;
    for (let i = 0; i < 5; i++) ctx.projectiles.spawn('grenade_lacrymo_main', line[0]!.id, g0.x - 4 + i * 3, 0.3, g0.z + (i % 2) * 3 - 1, 0, 0, 0);
    const more: Person[] = policeLine(ctx, 262, 0, -Math.PI / 2, 24, 0.8);
    for (let s = 0; s < 14; s += 0.5) {
      // bond offensif : toute la ligne avance au trot
      for (const p of [...line, ...more]) {
        if (p.posture === 'down') continue;
        p.cmd.moveX = -1;
        p.cmd.moveZ = 0;
        p.cmd.gait = 1;
        p.cmd.faceMove = true;
      }
      t.run(0.5);
    }
    for (const p of [...line, ...more]) p.cmd.moveX = 0;
    const repli = api.stats.retreats + api.stats.scatters + api.stats.melts - before;
    console.log('[radicaux] après gaz et bond offensif : replis', api.stats.retreats, '| dispersions', api.stats.scatters, '| phase du bloc', api.phase,
      '| plans', api.groups.map((g) => g.plan + ' m' + g.morale.toFixed(2)).join(', '));
    expect(repli).toBeGreaterThan(0);
    expect(watch.count['repli'] ?? 0).toBeGreaterThan(0);
    // plus personne ne lance pendant que la ligne avance sur eux
    const thrownDuring = watch.thrown;
    t.run(6);
    expect(watch.thrown - thrownDuring).toBeLessThanOrEqual(2);

    // ── fusion : ordre de repli général, on se change de nouveau, les infractions restent ──
    api.orderRetreat();
    let melted = false;
    for (let s = 0; s < 240 && !melted; s += 2) {
      t.run(2);
      melted = api.phase === 'fondu';
    }
    const after = t.radicals();
    const stillBlack = after.filter((p) => p.look.outfit === 'black_bloc' || (p.look.extras?.bloc ?? 0) === 1 || p.look.faceCover).length;
    const kept = offenders.filter((id) => (ctx.people.get(id)?.offenses.length ?? 1) > 0).length;
    console.log('[radicaux] fusion : phase', api.phase, '| encore en noir ou masqués', stillBlack, '/', after.length, '| auteurs dont les infractions restent', kept, '/', offenders.length,
      '| faits', JSON.stringify(watch.count));
    expect(melted).toBe(true);
    expect(stillBlack).toBeLessThanOrEqual(Math.ceil(after.length * 0.1));
    expect(kept).toBe(offenders.length);
    expect(watch.count['fusion'] ?? 0).toBeGreaterThan(0);
    // personne dans un mur
    for (const p of after) expect(ctx.world.isFree(p.x, p.z, 0.05)).toBe(true);
  }, 600_000);
});
