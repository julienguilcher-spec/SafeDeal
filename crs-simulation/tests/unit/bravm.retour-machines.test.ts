// BRAV-M à pied (mode libre : les binômes attendent près de leurs machines) qui reçoit l'ordre « colonne » vers un point
// éloigné : les opérateurs regagnent LEURS motos (à quelques mètres), remontent en selle et partent à moto. Défaut
// d'origine : le point de regroupement « aux machines » valait (0, 0) tant que la colonne n'avait jamais roulé — les
// opérateurs partaient à pied vers l'origine de la carte (place de la Concorde), à des kilomètres.
import { describe, expect, it } from 'vitest';

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
import { createSystems as session } from '@/gameplay/session';
import type { PoliceUnitsApi } from '@/sim/police/api';

const SIM = [world, roles, people, vehicles, traffic, crowd, police, items, props, hazards, law, radio, session];

describe('BRAV-M à pied : retour aux machines', () => {
  it('l’ordre « colonne » ramène les opérateurs à leurs motos, pas à l’origine de la carte', async () => {
    const t = createTestContext({ seed: 7, strict: false, modules: SIM });
    await t.start({ mode: 'libre', role: 'manifestant', place: 'Place de la République', x: 3123, z: -208, crowdSize: 0, tension: 0, volatility: 0, duration: 'standard' });
    const { ctx } = t;
    const units = ctx.service<PoliceUnitsApi>('police.units')!;
    const road = { x: 0, z: 0, heading: 0 } as { x: number; z: number; heading: number };
    expect(ctx.world.nearestRoad(3123, -150, road as never, 200)).toBe(true);
    const h = units.createBravm(3, { x: road.x, z: road.z, heading: 0, vehicles: true, mounted: false });
    const group = h.squad;
    t.step(2);
    const motos = h.vehicles.map((r) => ctx.vehicles.get(r.id)!);
    expect(motos.length).toBe(3);
    // point à environ 700 m par les rues
    const far = { x: 0, z: 0 } as { x: number; z: number };
    expect(ctx.world.nearestRoad(road.x + 700, road.z, far as never, 200)).toBe(true);
    const nearMoto = (p: { x: number; z: number }): number => Math.min(...motos.map((v) => Math.hypot(v.x - p.x, v.z - p.z)));
    const ops0 = h.people.map((r) => ctx.people.get(r.id)!).filter((p) => p && p.poste !== 'pilote_moto');
    const before = ops0.map((p) => nearMoto(p));
    ctx.squads.issue(group.id, { type: 'colonne', x: far.x, z: far.z, issuedBy: group.leaderId });
    // regroupement aux machines : les opérateurs vont à leurs motos (à quelques mètres), jamais vers l'origine de la
    // carte ; l'ordre affiché reste celui donné (la manœuvre interne ne le remplace pas : ordres directs §4.1)
    for (let s = 0; s < 6; s++) {
      t.step(1);
      const o = ctx.squads.get(group.id)!.order;
      expect(o.type).toBe('colonne');
      expect(Math.hypot(o.x - far.x, o.z - far.z)).toBeLessThan(1);
      ops0.forEach((p, i) => {
        if (p.vehicleId === 0) expect(nearMoto(p), `opérateur #${p.id} vers ses machines`).toBeLessThan(before[i]! + 5);
      });
    }
    console.log(`  opérateurs à ${ops0.map((p) => nearMoto(p).toFixed(0)).join(' / ')} m de leurs motos (au départ ${before.map((d) => d.toFixed(0)).join(' / ')} m)`);
    // ils remontent en selle et la colonne part
    const cmd = ctx.service<{ special(id: number): { stage: string } | null }>('police.command')!;
    for (let i = 0; i < 30; i++) {
      t.step(2);
      if (process.env["BRAVM_DEBUG"]) console.log(`t=${ctx.clock.now.toFixed(0)} ${cmd.special(group.id)?.stage} ph=${(ctx.squads.get(group.id) as any).brain?.phase} root=${(ctx.squads.get(group.id) as any).brain?.isRoot} kids=${ctx.squads.childrenOf(group.id).map((q) => (q as any).brain?.phase + ":" + q.order.type).join(";")} ordre=${ctx.squads.get(group.id)!.order.type} ` + h.people.map((r) => { const p = ctx.people.get(r.id)!; return `${p.poste}${p.vehicleId ? "+" : ""}@${Math.min(...motos.map((v) => Math.hypot(v.x - p.x, v.z - p.z))).toFixed(0)}/${p.posture}/${p.dormant ? "D" : ""}${p.cmd.moveX.toFixed(1)}`; }).join(','));
    }
    if (process.env['BRAVM_DEBUG']) console.log(ctx.radio.log.map((l: { from: string; text: string }) => l.from + ': ' + l.text).join('\n'));
    const moved = motos.filter((v) => Math.hypot(v.x - road.x, v.z - road.z) > 60).length;
    const ops = h.people.map((r) => ctx.people.get(r.id)!).filter((p) => p && p.poste !== 'pilote_moto');
    console.log(`  après 60 s : ${moved}/3 motos parties ; opérateurs en selle ${ops.filter((p) => p.vehicleId !== 0).length}/${ops.length}`);
    expect(moved).toBe(3);
    // arrivée : compte rendu à l'échelon supérieur (CENTRAL), pas au premier binôme de l'unité, où se tient son chef
    for (let i = 0; i < 60 && cmd.special(group.id)?.stage !== 'repos'; i++) t.step(5);
    // (le compte rendu part sur le réseau un instant après le changement d'étape)
    t.step(3);
    // (le point, à l'est de la place, est au-delà du bord de la carte : la colonne s'arrête au plus près et le dit —
    // « Arrêtés à … mètres du point, accès bloqué » — au lieu de « En position » : voir bravm.colonne-arrivee.test.ts)
    const said = ctx.radio.log.map((l: { text: string }) => l.text).filter((x: string) => /En position|mètres du point/.test(x));
    console.log(`  compte rendu : ${said.join(' / ')}`);
    expect(said.length).toBeGreaterThan(0);
    for (const x of said) expect(x).not.toMatch(/FAUCON UN-UN ICI FAUCON UN/);
  }, 600000);
});
