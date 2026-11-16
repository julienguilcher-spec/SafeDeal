// Test d'intégration headless : la mise en place de session (src/gameplay/session) avec les vrais modules de
// simulation — monde, archétypes, personnes, véhicules, matériel, décor, dangers, droit, radio.
import { describe, expect, it } from 'vitest';
import type { GameContext, GameSystem, PlayableRole, SessionConfig } from '@/core/contracts';
import { SystemOrder } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as roles } from '@/sim/roles';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as items } from '@/sim/items';
import { createSystems as props } from '@/sim/props';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as radio } from '@/gameplay/radio';
import { createSystems as session } from '@/gameplay/session';
import type { SessionSetupApi } from '@/gameplay/session';
import { createSystems as input } from '@/input';
import type { InputScriptApi } from '@/input';
import type { InteractionOption } from '@/core/contracts';

const SIM = [world, roles, people, vehicles, items, props, hazards, law, radio, session];

function setupOf(ctx: GameContext): SessionSetupApi {
  return ctx.require<SessionSetupApi>('session.setup');
}

/** Personne dans un obstacle du monde (bâti, eau, grille) ? */
function stuck(ctx: GameContext): number {
  let n = 0;
  for (const p of ctx.people.list) if (!ctx.world.isFree(p.x, p.z, 0.05)) n++;
  return n;
}

describe('intégration : mise en place de session', () => {
  it('CRS place de la Concorde (vraie carte) : joueur incarné face à l’obélisque, groupe en ligne, fourgon, passants', async () => {
    const t = createTestContext({ seed: 11, modules: SIM });
    const progress: number[] = [];
    t.ctx.events.onAny('ui:loading', (p) => progress.push((p as { progress: number }).progress));
    // x/z fournis : hors navigateur, la carte de Paris n'est lue qu'au premier démarrage (placeByName n'est pas encore prêt)
    await t.start({ mode: 'libre', role: 'crs', rank: 'gardien', place: 'Place de la Concorde', x: -3.3, z: 11.8, extra: { poste: 'lanceur' } });
    const { ctx } = t;
    const s = setupOf(ctx).summary!;
    expect(s).not.toBeNull();
    const me = ctx.player.person()!;
    expect(me).not.toBeNull();
    expect(me.id).toBe(s.playerId);
    expect(me.isPlayer).toBe(true);
    expect(ctx.player.state.role).toBe('crs');
    expect(ctx.player.state.cameraMode).toBe('fps');
    expect(me.kind).toBe('crs');
    expect(me.poste).toBe('lanceur');
    expect(me.rank).toBe('gardien');
    expect(ctx.actions.has(me, 'grenade_lacrymo')).toBeGreaterThan(0);

    // face à l'obélisque, à quelques dizaines de mètres, sur un sol libre
    const ob = ctx.world.landmarks.find((l) => l.key === 'obelisque_concorde')!;
    const d = Math.hypot(ob.x - me.x, ob.z - me.z);
    const toward = Math.atan2(ob.x - me.x, ob.z - me.z);
    const off = Math.abs(Math.atan2(Math.sin(toward - s.heading), Math.cos(toward - s.heading)));
    console.log(`joueur en (${me.x.toFixed(1)}, ${me.z.toFixed(1)}), obélisque à ${d.toFixed(0)} m, écart de cap ${(off * 57.3).toFixed(1)}°, secteur « ${ctx.world.sectorName(me.x, me.z)} »`);
    expect(d).toBeGreaterThan(25);
    expect(d).toBeLessThan(80);
    expect(off).toBeLessThan(0.2);
    expect(ctx.player.state.camYaw).toBeCloseTo(s.heading, 5);
    expect(ctx.world.sectorName(me.x, me.z).toLowerCase()).toContain('concorde');

    // groupe de six en ligne, immobile ; un chef ; un fourgon derrière
    const squad = ctx.squads.get(me.squadId)!;
    expect(squad.members.length).toBe(6);
    expect(squad.faction).toBe('police');
    const leader = ctx.people.get(squad.leaderId)!;
    expect(leader.poste).toBe('chef_groupe');
    expect(s.teammates).toBe(5);
    const mates = squad.members.map((id) => ctx.people.get(id)!);
    const shields = mates.filter((p) => p.poste === 'bouclier');
    expect(shields.length).toBe(3);
    // les boucliers sont au premier rang : plus près de l'obélisque que les autres, et jointifs
    const ahead = (p: { x: number; z: number }): number => (p.x - s.x) * Math.sin(s.heading) + (p.z - s.z) * Math.cos(s.heading);
    const lateral = (p: { x: number; z: number }): number => -(p.x - s.x) * Math.cos(s.heading) + (p.z - s.z) * Math.sin(s.heading);
    for (const sh of shields) for (const o of mates) if (o.poste !== 'bouclier') expect(ahead(sh)).toBeGreaterThan(ahead(o) + 1);
    const lat = shields.map(lateral).sort((a, b) => a - b);
    expect(lat[1]! - lat[0]!).toBeGreaterThan(0.7);
    expect(lat[2]! - lat[1]!).toBeLessThan(1.3);
    expect(ctx.vehicles.list.length).toBe(1);
    const van = ctx.vehicles.list[0]!;
    expect(van.kind).toBe('fourgon_crs');
    expect(s.vehicleIds).toEqual([van.id]);
    expect(squad.vehicleId).toBe(van.id);
    expect(ahead(van)).toBeLessThan(-8);
    expect(ctx.world.isFree(van.x, van.z, 1)).toBe(true);

    // quelques passants, aucune fausse foule
    expect(s.bystanders).toBeGreaterThanOrEqual(6);
    expect(ctx.people.list.filter((p) => p.kind === 'manifestant').length).toBe(0);
    expect(ctx.people.list.length).toBe(6 + s.bystanders);
    expect(setupOf(ctx).people.length).toBe(ctx.people.list.length);
    expect(stuck(ctx)).toBe(0);

    // avancement annoncé, croissant
    expect(progress.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < progress.length; i++) expect(progress[i]!).toBeGreaterThanOrEqual(progress[i - 1]!);

    // 10 s de simulation : les collègues tiennent leur place (aucune IA ne les pilote), personne dans un mur
    const before = mates.filter((p) => !p.isPlayer).map((p) => ({ x: p.x, z: p.z }));
    t.step(10);
    mates.filter((p) => !p.isPlayer).forEach((p, i) => expect(Math.hypot(p.x - before[i]!.x, p.z - before[i]!.z)).toBeLessThan(0.6));
    expect(stuck(ctx)).toBe(0);

    // le joueur lance une grenade lacrymogène : projectile, puis gaz au point de chute, emploi de la force consigné
    expect(ctx.actions.selectById(me, 'grenade_lacrymo')).toBe(true);
    t.step(2);
    const r = ctx.actions.use(me, { power: 0.8 });
    expect(r.ok).toBe(true);
    expect(r.projectileId).toBeGreaterThan(0);
    let gas = 0;
    for (let i = 0; i < 15 && gas <= 0.02; i++) {
      t.step(1);
      for (const q of ctx.projectiles.list) if (q.ownerId === me.id) gas = Math.max(gas, ctx.hazards.gasAt(q.x, q.z));
    }
    console.log(`gaz au point de chute : ${gas.toFixed(2)} ; journal de la force : ${ctx.law.forceLog.length} entrée(s)`);
    expect(gas).toBeGreaterThan(0.02);
    expect(ctx.law.forceLog.length).toBeGreaterThanOrEqual(1);
  });

  it('chaque rôle jouable obtient un personnage cohérent, sans erreur ni personne dans un mur', async () => {
    const t = createTestContext({ seed: 5, modules: SIM });
    const cases: { role: PlayableRole; extra?: Record<string, unknown>; kind: string; poste: string | null; faction: string; vehicles: number; squad: number }[] = [
      { role: 'crs', kind: 'crs', poste: 'bouclier', faction: 'police', vehicles: 1, squad: 6 },
      { role: 'crs', extra: { poste: 'interpellation' }, kind: 'crs', poste: 'interpellation', faction: 'police', vehicles: 1, squad: 6 },
      { role: 'crs', extra: { poste: 'conducteur' }, kind: 'crs', poste: 'conducteur', faction: 'police', vehicles: 1, squad: 7 },
      { role: 'chef_groupe', kind: 'crs', poste: 'chef_groupe', faction: 'police', vehicles: 1, squad: 6 },
      { role: 'chef_groupe', extra: { poste: 'chef_section' }, kind: 'crs', poste: 'chef_section', faction: 'police', vehicles: 3, squad: 4 },
      { role: 'commandant', kind: 'crs', poste: 'commandant_unite', faction: 'police', vehicles: 4, squad: 2 },
      { role: 'commissaire', kind: 'crs', poste: 'commandant_unite', faction: 'police', vehicles: 4, squad: 2 },
      { role: 'bravm', kind: 'bravm', poste: 'passager_moto', faction: 'police', vehicles: 3, squad: 6 },
      { role: 'gendarme_centaure', kind: 'gendarme', poste: 'conducteur', faction: 'police', vehicles: 1, squad: 3 },
      { role: 'operateur_canon_eau', kind: 'crs', poste: 'operateur', faction: 'police', vehicles: 1, squad: 3 },
      { role: 'telepilote', kind: 'telepilote', poste: 'telepilote', faction: 'police', vehicles: 1, squad: 2 },
      { role: 'street_medic', kind: 'street_medic', poste: null, faction: 'medic', vehicles: 0, squad: 3 },
      { role: 'secouriste', extra: { variante: 'pompier' }, kind: 'pompier', poste: null, faction: 'rescue', vehicles: 1, squad: 6 },
      { role: 'secouriste', extra: { variante: 'samu' }, kind: 'samu', poste: null, faction: 'rescue', vehicles: 1, squad: 3 },
      { role: 'journaliste', kind: 'journaliste', poste: null, faction: 'press', vehicles: 0, squad: 0 },
      { role: 'manifestant', extra: { variante: 'radical' }, kind: 'manifestant', poste: null, faction: 'protest', vehicles: 0, squad: 0 },
    ];
    for (const c of cases) {
      await t.start({ mode: 'test', role: c.role, x: 0, z: 0, extra: c.extra });
      const { ctx } = t;
      const me = ctx.player.person();
      const label = `${c.role}${c.extra ? ' ' + JSON.stringify(c.extra) : ''}`;
      expect(me, label).not.toBeNull();
      expect(me!.kind, label).toBe(c.kind);
      expect(me!.poste, label).toBe(c.poste);
      expect(me!.faction, label).toBe(c.faction);
      expect(me!.isPlayer, label).toBe(true);
      expect(ctx.vehicles.list.length, label).toBe(c.vehicles);
      const squad = me!.squadId !== 0 ? ctx.squads.get(me!.squadId) : undefined;
      expect(squad ? squad.members.length : 0, label).toBe(c.squad);
      if (squad) expect(ctx.people.get(squad.leaderId), label).toBeDefined();
      expect(stuck(ctx), label).toBe(0);
      // pas de fausse foule : aucun manifestant, sauf le joueur quand c'est son rôle
      expect(ctx.people.list.filter((p) => p.kind === 'manifestant' && !p.isPlayer).length, label).toBe(0);
      if (c.role === 'manifestant') expect(me!.profile).toBe('radical');
      if (c.role === 'commandant' || c.role === 'commissaire') {
        // commandant unique : chef de la compagnie, écharpe, mégaphone ; il prononce lui-même les sommations
        expect(me!.look.sash, label).toBe(true);
        expect(ctx.actions.has(me!, 'megaphone'), label).toBeGreaterThan(0);
        expect(squad!.kind, label).toBe('compagnie');
        expect(squad!.leaderId, label).toBe(me!.id);
        const section = ctx.squads.childrenOf(squad!.id);
        expect(section.length, label).toBe(1);
        let agents = section[0]!.members.length;
        for (const g of ctx.squads.childrenOf(section[0]!.id)) agents += g.members.length;
        expect(agents, label).toBe(16);
        expect(ctx.law.sommation(me!), label).toBe(1);
        expect(ctx.vehicles.list.some((v) => v.kind === 'vl_commandement'), label).toBe(true);
      }
      t.step(3);
      expect(stuck(ctx), label).toBe(0);
      for (const p of ctx.people.list) expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.y), label).toBe(true);
    }
  });

  it('applique vent, circulation coupée et métro fermé du scénario, une seule fois, par les services', async () => {
    const calls: string[] = [];
    const stations = [
      { id: 1, name: 'Concorde', x: 20, z: 10, entrances: [], open: true, filtered: false, inflow: 0, arrived: 0 },
      { id: 2, name: 'Bastille', x: 3500, z: 1400, entrances: [], open: true, filtered: false, inflow: 0, arrived: 0 },
    ];
    const fakes: GameSystem = {
      id: 'test.fakes',
      order: SystemOrder.CONTROL,
      provide(ctx: GameContext): void {
        ctx.provide(EXT.traffic, {
          closures: [], isClosed: () => false, closeRoad: () => null,
          closeArea: (x: number, z: number, radius: number) => { calls.push(`closeArea ${x} ${z} ${radius}`); return []; },
          open: () => {}, openAll: () => {}, countNear: () => ({ moving: 0, stopped: 0 }),
        });
        ctx.provide(EXT.metro, {
          stations, get: () => undefined, nearest: () => null,
          setOpen: (id: number, open: boolean) => { calls.push(`setOpen ${id} ${open}`); stations.find((s) => s.id === id)!.open = open; },
          setFiltered: () => {},
        });
      },
    };
    const t = createTestContext({ seed: 2, modules: [...SIM, () => [fakes]] });
    const extra = { scenario: 1, poste: 'bouclier', vent: { direction: 270, vitesse: 36 }, options: { circulation: 'coupee', metro: 'ferme' } };
    await t.start({ mode: 'test', role: 'crs', x: 0, z: 0, extra });
    const env = t.ctx.env.state;
    // vent d'ouest à 36 km/h : il souffle vers l'est (+x) à 10 m/s
    expect(env.windX).toBeCloseTo(10, 3);
    expect(Math.abs(env.windZ)).toBeLessThan(1e-6);
    expect(calls).toEqual(['closeArea 0 0 350', 'setOpen 1 false']);
    t.step(2);
    expect(calls.length).toBe(2);
  });

  it('confie la construction du groupe au service « police.units » quand il est branché', async () => {
    let asked: Record<string, unknown> | null = null;
    const fake: GameSystem = {
      id: 'test.police',
      order: SystemOrder.CONTROL,
      provide(ctx: GameContext): void {
        ctx.provide('police.units', {
          createGroup(options: { x: number; z: number; heading: number; type?: string }) {
            asked = options;
            const squad = ctx.squads.create('groupe', 'police', 'Alpha 1');
            const postes = ['chef_groupe', 'bouclier', 'bouclier', 'bouclier', 'lanceur', 'extincteur'] as const;
            const members = postes.map((poste, i) => ctx.archetypes.spawn('crs', options.x + i, options.z, { poste, heading: options.heading }));
            for (const p of members) ctx.squads.addMember(squad.id, p.id);
            ctx.squads.setLeader(squad.id, members[0]!.id);
            const van = ctx.vehicles.spawn('fourgon_crs', options.x, options.z - 15, options.heading);
            return { squad, sections: [], groups: [squad], people: members, vehicles: [van], leader: members[0]! };
          },
          createSection() {
            throw new Error('non attendu');
          },
        });
      },
    };
    const t = createTestContext({ seed: 4, modules: [...SIM, () => [fake]] });
    await t.start({ mode: 'test', role: 'crs', x: 0, z: 0, extra: { poste: 'lanceur' } });
    const s = setupOf(t.ctx).summary!;
    expect(asked).not.toBeNull();
    expect(asked!['type']).toBe('appui');
    expect(asked!['layout']).toBe('ligne');
    expect(s.usedPoliceUnits).toBe(true);
    const me = t.ctx.player.person()!;
    expect(me.poste).toBe('lanceur');
    expect(s.teammates).toBe(5);
    expect(s.vehicleIds.length).toBe(1);
    // rien n'a été créé en double par la création directe
    expect(t.ctx.people.list.filter((p) => p.faction === 'police').length).toBe(6);
    expect(t.ctx.vehicles.list.length).toBe(1);
  });

  it('le joueur commande son personnage par les entrées : marche, monte dans le fourgon, conduit ; le gaz le fait tousser', async () => {
    const t = createTestContext({ seed: 21, modules: [input, ...SIM] });
    await t.start({ mode: 'libre', role: 'crs', x: -3.3, z: 11.8, extra: { poste: 'lanceur', passants: 0 } });
    const { ctx } = t;
    const script = ctx.require<InputScriptApi>('input.script');
    const me = ctx.player.person()!;
    const s = setupOf(ctx).summary!;

    // marche vers l'avant (repère de la caméra) : le personnage avance dans la direction du regard
    const x0 = me.x;
    const z0 = me.z;
    script.setMove(0, 1);
    t.step(4);
    script.setMove(0, 0);
    t.step(0.5);
    const walked = Math.hypot(me.x - x0, me.z - z0);
    const along = (me.x - x0) * Math.sin(s.heading) + (me.z - z0) * Math.cos(s.heading);
    console.log(`marche : ${walked.toFixed(1)} m en 4 s, dont ${along.toFixed(1)} m dans l'axe du regard`);
    expect(walked).toBeGreaterThan(3.5);
    expect(walked).toBeLessThan(14);
    expect(along).toBeGreaterThan(walked * 0.9);

    // gaz : une nappe au-dessus du joueur → exposition, sans masque
    for (let i = 0; i < 20; i++) {
      ctx.hazards.emitGas(me.x, me.z, 0.5, 6);
      t.step(0.5);
    }
    console.log(`gaz : concentration ${ctx.hazards.gasAt(me.x, me.z).toFixed(2)}, exposition du joueur ${me.gas.toFixed(2)}`);
    expect(ctx.hazards.gasAt(me.x, me.z)).toBeGreaterThan(0.2);
    expect(me.gas).toBeGreaterThan(0.2);
    ctx.hazards.clear();

    // au fourgon : l'invite « conduire » apparaît à la portière du conducteur ; on monte, puis on roule
    const van = ctx.vehicles.list[0]!;
    const vfx = Math.sin(van.heading);
    const vfz = Math.cos(van.heading);
    const side = van.def.width * 0.5 + 0.7;
    me.x = van.x + vfz * side + vfx * van.def.length * 0.22;
    me.z = van.z - vfx * side + vfz * van.def.length * 0.22;
    ctx.people.rebuildIndex();
    t.step(0.6);
    const options: InteractionOption[] = [];
    const n = ctx.interactions.options(me, options);
    const verbs = options.slice(0, n).map((o) => o.verb);
    console.log(`à la portière du fourgon : ${verbs.join(', ')} ; invite du joueur : « ${ctx.player.state.prompt?.label ?? ''} »`);
    const drive = options.slice(0, n).find((o) => o.verb === 'conduire' || o.verb === 'monter');
    expect(drive).toBeDefined();
    expect(ctx.player.state.prompt).not.toBeNull();
    script.tap('interact');
    t.step(3);
    expect(me.vehicleId).toBe(van.id);
    expect(van.def.seats[me.seat]!.role).toBe('driver');
    expect(ctx.player.vehicle()).toBe(van);
    expect(['vehicle_ext', 'vehicle_int']).toContain(ctx.player.state.cameraMode);
    const vx0 = van.x;
    const vz0 = van.z;
    script.setMove(0, 1);
    t.step(6);
    script.setMove(0, 0);
    const driven = Math.hypot(van.x - vx0, van.z - vz0);
    console.log(`conduite : ${driven.toFixed(1)} m en 6 s, vitesse ${van.speed.toFixed(1)} m/s`);
    expect(driven).toBeGreaterThan(8);
    expect(ctx.world.isFree(van.x, van.z, 0.5)).toBe(true);
  });

  it('relancer une session repart de zéro : mêmes effectifs, même mise en place pour la même graine', async () => {
    const t = createTestContext({ seed: 9, modules: SIM });
    const cfg: Partial<SessionConfig> = { mode: 'test', role: 'chef_groupe', x: 0, z: 0, seed: 77 };
    await t.start(cfg);
    const a = { n: t.ctx.people.list.length, v: t.ctx.vehicles.list.length, q: t.ctx.squads.list.length, s: { ...setupOf(t.ctx).summary! } };
    t.step(5);
    await t.start(cfg);
    const b = { n: t.ctx.people.list.length, v: t.ctx.vehicles.list.length, q: t.ctx.squads.list.length, s: { ...setupOf(t.ctx).summary! } };
    expect(b.n).toBe(a.n);
    expect(b.v).toBe(a.v);
    expect(b.q).toBe(a.q);
    expect(b.s.x).toBeCloseTo(a.s.x, 6);
    expect(b.s.z).toBeCloseTo(a.s.z, 6);
    expect(b.s.heading).toBeCloseTo(a.s.heading, 6);
    expect(b.s.playerId).toBe(a.s.playerId);
    // fin de session : le service ne garde pas de résumé périmé au redémarrage suivant
    expect(setupOf(t.ctx).people.length).toBe(b.n);
  });
});
