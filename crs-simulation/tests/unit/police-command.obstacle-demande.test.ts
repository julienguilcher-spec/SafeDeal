// Commandement — véhicule qui barre la voie du joueur : indication à l'écran, proposition de l'adjoint « Faire venir
// le Centaure » acceptée avec P (accept), demande radio d'un exécutant accordée par le commandant IA, refusée sans
// Centaure (quartier d'essai, modules réels, circulation sans vie civile).
import { describe, expect, it } from 'vitest';
import type { RoadSample, Vehicle } from '@/core/contracts';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as items } from '@/sim/items';
import { createSystems as hazards } from '@/sim/hazards';
import { createSystems as law } from '@/gameplay/law';
import { createSystems as props } from '@/sim/props';
import { createSystems as vehicles } from '@/sim/vehicles';
import { createSystems as traffic } from '@/sim/traffic';
import type { PoliceOrderDone } from '@/sim/police/api';
import type { Proposal } from '@/sim/police/command/api';
import type { ObstacleApi } from '@/sim/police/command/obstacle';
import { OBSTACLE_SERVICE } from '@/sim/police/command/obstacle';
import { startCommand } from '@/sim/police/command/testkit';
import { issueObstacle } from '@/ui/command/obstacleOrder';
import type { CommandCore } from '@/ui/command/core';

const MODULES = [world, people, items, hazards, law, props, vehicles, traffic];
const NORTH = Math.PI;

async function setup(withCentaure: boolean, seed = 21) {
  const t = await startCommand(MODULES, { mode: 'test', x: 0, z: 200, extra: { 'commandement.adjoint': 4, traffic: { none: true } } }, { seed, dt: 1 / 30 });
  const { ctx } = t;
  const road: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  expect(ctx.world.nearestRoad(0, 210, road, 20)).toBe(true);
  const cie = t.units.createCompany({ x: road.x + 30, z: 300, heading: NORTH, vehicles: false });
  // le Centaure arrive de l'autre bout de la rue (derrière le joueur, la place est prise par son fourgon)
  const centaure = withCentaure ? t.units.createEquipage('centaure', { x: road.x, z: 160, heading: 0 }) : null;
  // le fourgon du joueur, arrêté derrière un autobus abandonné en biais au milieu de la chaussée
  const van = ctx.vehicles.spawn('fourgon_crs', road.x + 0.5, 232, NORTH);
  const bus = ctx.vehicles.spawn('bus', road.x, 214, NORTH + 0.2);
  return { t, ctx, road, cie, centaure, van, bus };
}

describe('véhicule qui barre la voie du joueur', () => {
  it('joueur commandant au volant : indication à l\'écran, puis proposition de l\'adjoint ; acceptée, le Centaure pousse l\'autobus et la voie se libère', async () => {
    const { t, ctx, cie, centaure, van, bus } = await setup(true);
    const chief = cie.leader!;
    ctx.player.possess(chief.id, 'commandant');
    expect(ctx.vehicles.enter(chief, van, 'driver')).toBe(true);
    const notes: string[] = [];
    const ui = ctx.ui as unknown as { notify(text: string): void };
    const notify = ui.notify.bind(ui);
    ui.notify = (text: string): void => { notes.push(text); notify(text); };
    const proposed: Proposal[] = [];
    ctx.events.onAny('command:proposal', (d) => proposed.push({ ...(d as Proposal) }));
    const desk = ctx.require<ObstacleApi>(OBSTACLE_SERVICE);
    t.step(6);
    expect(desk.blocked()?.blockerId).toBe(bus.id);
    const hint = notes.find((n) => n.startsWith('Véhicule'));
    console.log('indication :', hint);
    expect(hint).toBeDefined();
    // (avant la proposition de l'adjoint, P n'est pas annoncé : il accepterait autre chose)
    expect(hint).not.toContain('P pour');
    expect(hint).toContain('Dégager l’obstacle');
    t.run(40, 0.5, () => proposed.some((p) => p.key === 'obstacle_voie'));
    t.step(1.5);
    expect(notes.some((n) => n.startsWith('Véhicule') && n.includes('P pour appeler le Centaure'))).toBe(true);
    const offer = proposed.find((p) => p.key === 'obstacle_voie');
    console.log('proposition :', offer?.text);
    expect(offer).toBeDefined();
    expect(offer!.text).toContain('un véhicule bloque la voie');
    expect(offer!.text).toContain('Faire venir le Centaure pour le dégager ?');
    expect(offer!.executable).toBe(true);
    let done: PoliceOrderDone | null = null;
    ctx.events.onAny('police:order_done', (d) => {
      const e = d as PoliceOrderDone;
      if (e.squadId === centaure!.squad.id && e.type === 'degager_obstacle') done = { ...e };
    });
    expect(t.api.accept(offer!.id)).toBe(true);
    t.step(0.5);
    expect(t.api.special(centaure!.squad.id)?.order).toBe('degager_obstacle');
    t.run(150, 0.5, () => done !== null);
    console.log('Centaure :', JSON.stringify(done), '| autobus en', bus.x.toFixed(1), bus.z.toFixed(1), '| blocage :', JSON.stringify(desk.blocked()));
    expect(done).not.toBeNull();
    expect(done!.ok).toBe(true);
    t.step(2);
    expect(desk.blocked()).toBeNull();
  }, 300000);

  it('exécutant (CRS) : la demande radio « Centaure pour dégager un obstacle » est accordée par le commandant ; sans Centaure, refusée', async () => {
    for (const withCentaure of [true, false]) {
      const { t, ctx, cie, centaure, van, bus } = await setup(withCentaure, 23);
      const crs = ctx.people.list.find((p) => p.faction === 'police' && p.squadId !== 0 && p.squadId !== cie.squad.id && p.id !== cie.leader!.id && (!centaure || p.squadId !== centaure.squad.id))!;
      expect(crs).toBeDefined();
      ctx.player.possess(crs.id, 'crs');
      ctx.vehicles.exit(crs);
      expect(ctx.vehicles.enter(crs, van, 'passenger')).toBe(true);
      const radio: string[] = [];
      ctx.events.on('radio:message', (e) => radio.push(e.msg.from + ' > ' + e.msg.text));
      t.step(3);
      const desk = ctx.require<ObstacleApi>(OBSTACLE_SERVICE);
      expect(desk.blocked()?.blockerId).toBe(bus.id);
      const r = desk.radioRequest('GROUPE 1');
      t.step(1);
      console.log(withCentaure ? 'avec Centaure :' : 'sans Centaure :', JSON.stringify(r), '\n' + radio.slice(-3).join('\n'));
      expect(radio.some((m) => m.includes('Demande Centaure pour dégager un obstacle'))).toBe(true);
      if (withCentaure) {
        expect(r.ok).toBe(true);
        expect(r.squadId).toBe(centaure!.squad.id);
        expect(t.api.special(centaure!.squad.id)?.order).toBe('degager_obstacle');
        expect(radio.some((m) => m.includes('fait mouvement pour dégager l’obstacle'))).toBe(true);
      } else {
        expect(r.ok).toBe(false);
        expect(radio.some((m) => m.includes('Négatif, aucun Centaure disponible'))).toBe(true);
      }
      void (van as Vehicle);
    }
  }, 300000);

  it('ordre « Dégager l’obstacle » donné depuis la carte tactique ou la roue, sans désigner le Centaure : le plus proche y va', async () => {
    const { t, ctx, cie, centaure, bus } = await setup(true, 25);
    const chief = cie.leader!;
    ctx.player.possess(chief.id, 'commandant');
    const radio: string[] = [];
    ctx.events.on('radio:message', (e) => radio.push(e.msg.from + ' > ' + e.msg.text));
    const core = { ctx, canCommand: (): boolean => true, callsign: (): string => 'MISTRAL' } as unknown as CommandCore;
    const r = issueObstacle(core, [cie.squad], [{ x: bus.x + 2, z: bus.z + 3, heading: 0, width: 0 }]);
    expect(r.ok).toBe(true);
    t.step(0.5);
    expect(t.api.special(centaure!.squad.id)?.order).toBe('degager_obstacle');
    expect(radio.some((m) => m.includes('Dégagez l’obstacle'))).toBe(true);
    // un second ordre, le seul Centaure étant engagé : refus motivé
    const r2 = issueObstacle(core, [], [{ x: bus.x, z: bus.z, heading: 0, width: 0 }]);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain('Aucun Centaure disponible');
  }, 300000);
});
