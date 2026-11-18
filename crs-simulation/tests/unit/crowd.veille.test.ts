// Mode veille du cœur de foule (extra['crowd.veille'] = true, base du mode Patrouille) : aucune manifestation
// principale, mais un cœur actif, prêt pour les foyers et les manifestations qui se déclareront en cours de partie.
// Rien ne doit viser le point de la session (pas de cortège, pas de parcours, pas d'aléa du cortège), le directeur
// reste en phase 'aucune', le commandement de police ne monte aucun dispositif, et une personne confiée au cœur
// reste là où elle est — pas de marche vers un rassemblement qui n'existe pas.
import { describe, expect, it } from 'vitest';

import type { CrowdPhase, Person, SessionConfig } from '@/core/contracts';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { CROWD_CORE, CROWD_STATE, CROWD_VEILLE_KEY, CrowdCore, brainOf, createCrowdSystems } from '@/sim/crowd';
import type { CrowdCoreApi } from '@/sim/crowd';
import { createSystems as police } from '@/sim/police';
import { POLICE_COMMAND_SERVICE } from '@/sim/police/command/api';
import type { CommandApi } from '@/sim/police/command/api';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';

// place de la Concorde (comme les autres essais de foule)
const SITE = { x: -10, z: 15 };

function veilleConfig(extra: Record<string, unknown> = {}, crowdSize = 0): Partial<SessionConfig> {
  return {
    mode: 'monde_ouvert', missionId: '', place: 'Place de la Concorde', x: SITE.x, z: SITE.z, crowdSize,
    tension: 0.45, volatility: 0.75, duration: 'standard', extra: { [CROWD_VEILLE_KEY]: true, ...extra },
  } as Partial<SessionConfig>;
}

/** Contexte complet du paquet (le cœur est récupéré pour appeler spawnForeign comme manifs.ts). */
async function startVeille(seed: number, config: Partial<SessionConfig>) {
  const crowd = createCrowdSystems();
  const t = createTestContext({ seed, modules: [world, roles, people, vehicles, police, law, radio], systems: crowd.systems });
  const phases: CrowdPhase[] = [];
  t.ctx.events.on('crowd:phase', (e) => phases.push(e.phase));
  await t.start(config);
  return { t, ctx: t.ctx, core: crowd.core, phases };
}

/** Un point de trottoir libre à une distance donnée du site, pour y placer des personnes hors de tout rassemblement. */
function freePointAway(core: CrowdCore, dist: number): { x: number; z: number } {
  const w = core.ctx.world;
  const out = { x: 0, z: 0 };
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const x = SITE.x + Math.sin(a) * dist;
    const z = SITE.z + Math.cos(a) * dist;
    let i = 0;
    if (w.randomFreePoint(x, z, 25, 'sidewalk', () => ((i = (i * 9301 + 49297) % 233280) / 233280), out)) return { x: out.x, z: out.z };
  }
  throw new Error('aucun point de trottoir libre trouvé');
}

describe('foule : mode veille du cœur', () => {
  it('600 s sans manifestation : phase « aucune », personne de la foule, session en cours, aucune compagnie', async () => {
    const { t, ctx, core, phases } = await startVeille(11, veilleConfig({}, 600));
    const api = ctx.require<CrowdCoreApi>(CROWD_CORE);
    // la taille demandée est ignorée en veille : aucun plan, aucun cortège, aucun badaud
    expect(api.active).toBe(true);
    expect(api.veille).toBe(true);
    expect(core.size).toBe(0);
    expect(core.plan?.entries.length).toBe(0);
    expect(core.formation.sections.length).toBe(0);
    expect(core.members.length).toBe(0);
    expect(core.aleas.infos.filter((i) => i.status !== '').length).toBe(0);
    expect(ctx.director.route.length).toBe(0);
    expect(ctx.director.headProgress).toBe(0);
    const command = ctx.require<CommandApi>(POLICE_COMMAND_SERVICE);
    for (let s = 0; s < 60; s++) {
      t.step(10, 1 / 15);
      expect(ctx.director.phase).toBe('aucune');
      expect(api.basePhase).toBe('aucune');
      expect(ctx.session.phase).toBe('playing');
      expect(ctx.people.list.some((p) => p.faction === 'protest')).toBe(false);
      expect(command.commands.length).toBe(0);
    }
    expect(ctx.clock.now).toBeGreaterThanOrEqual(599);
    expect(phases).toEqual([]);
    // ni camion sono, ni statistiques, ni tension inventée
    expect(ctx.vehicles.list.some((v) => v.kind === 'camion_sono')).toBe(false);
    const st = ctx.director.stats;
    expect([st.total, st.present, st.dispersed, st.radicals, st.injured, st.arrested]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(ctx.director.tension).toBe(0);
    expect(core.aleas.trigger('averse')).toBe(false);
    expect(core.aleas.started).toBe(0);
    // la tension locale existe (foyers à venir), la tension globale la suit sans état superposé
    ctx.director.addTension(0.6, SITE.x + 300, SITE.z, 'essai');
    expect(ctx.director.tensionAt(SITE.x + 300, SITE.z)).toBeGreaterThan(0.3);
    expect(ctx.director.tensionAt(SITE.x, SITE.z)).toBe(0);
    t.step(20, 1 / 15);
    expect(ctx.director.tension).toBeGreaterThan(0.2);
    expect(ctx.director.phase).toBe('aucune');
    expect(phases).toEqual([]);
  }, 240_000);

  it('spawnForeign, spawnExtra et adoption fonctionnent en veille ; chacun reste là où il est', async () => {
    const { t, ctx, core } = await startVeille(12, veilleConfig());
    const a = freePointAway(core, 450);
    const b = freePointAway(core, 700);
    const c = freePointAway(core, 900);
    const foreign = core.spawnForeign({ profile: 'militant', family: 'divers', banner: false, child: false, ref: null, group: -1 }, core.cause, a.x, a.z, 0);
    expect(foreign).not.toBeNull();
    const extra = core.spawnExtra('pacifique', b.x, b.z);
    expect(extra).not.toBeNull();
    // un manifestant créé par un autre module est adopté par le cœur
    const adopted = ctx.archetypes.spawn('manifestant', c.x, c.z, { faction: 'protest' } as never);
    t.step(1, 1 / 15);
    expect(core.members).toContain(foreign);
    expect(core.members).toContain(extra);
    expect(core.members).toContain(adopted);
    // aucun n'est compté dans une manifestation principale qui n'existe pas
    expect(ctx.director.stats.total).toBe(0);
    expect(ctx.director.stats.present).toBe(0);
    // sortis de leur état (comme après une fuite), ils reprennent leur flânerie près d'où ils étaient, et non au point
    // de la session : il n'y a pas de cortège à rejoindre
    for (const p of [foreign!, extra!, adopted]) brainOf(p)!.state = CROWD_STATE.REGROUP;
    t.step(180, 1 / 15);
    const spots: [Person, { x: number; z: number }][] = [[foreign!, a], [extra!, b], [adopted, c]];
    for (const [p, at] of spots) {
      expect(ctx.people.get(p.id)).toBeDefined();
      expect(Math.hypot(p.x - at.x, p.z - at.z)).toBeLessThan(60);
      expect(Math.hypot(p.x - SITE.x, p.z - SITE.z)).toBeGreaterThan(300);
    }
    expect(ctx.director.phase).toBe('aucune');
  }, 240_000);

  it('sans la clé veille, une session sans manifestants reste inactive ; crowd.none l’emporte sur la veille', async () => {
    const plain = await startVeille(13, { ...veilleConfig(), extra: {} });
    const api = plain.ctx.require<CrowdCoreApi>(CROWD_CORE);
    expect(api.active).toBe(false);
    expect(api.veille).toBe(false);
    expect(plain.core.spawnForeign({ profile: 'pacifique', family: 'divers', banner: false, child: false, ref: null, group: -1 }, plain.core.cause, SITE.x, SITE.z, 0)).toBeNull();
    plain.t.step(5, 1 / 15);
    expect(plain.ctx.director.phase).toBe('aucune');

    const none = await startVeille(13, veilleConfig({ 'crowd.none': true }));
    expect(none.ctx.require<CrowdCoreApi>(CROWD_CORE).active).toBe(false);
    expect(none.core.veille).toBe(false);

    // une nouvelle session sans la clé, sur le même contexte, sort de la veille
    const again = await startVeille(14, veilleConfig());
    expect(again.core.veille).toBe(true);
    await again.t.start({ ...veilleConfig({}, 200), extra: {} });
    expect(again.core.veille).toBe(false);
    expect(again.core.active).toBe(true);
    expect(again.core.size).toBeGreaterThan(0);
    again.t.step(2, 1 / 15);
    expect(again.ctx.director.phase).toBe('rassemblement');
  }, 240_000);
});
