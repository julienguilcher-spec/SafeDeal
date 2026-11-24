// Colonne de l'IA (Cité → République, boulevard de Sébastopol) : la tête arrêtée par des voitures garées en travers de la
// chaussée, sa colonne serrée derrière elle. Elle prenait d'elle-même, au bout de 6 s, un autre itinéraire qui commençait
// par un demi-tour : elle manœuvrait jusqu'à se retrouver nez à nez avec son propre suivant, et la colonne s'enfermait
// elle-même (partie jouée, graine 5 : joueur à 1,4 km du point au bout de dix minutes). Elle reste « bloquée » derrière
// les voitures, et son temps d'arrêt continue de courir (il était remis à zéro à chaque essai d'itinéraire) : c'est lui
// qui déclenche leur retrait par la conduite de la colonne (police/command/convoy.ts, clearCivilian, 20 s) ou, au-delà
// de 40 s, la fin du trajet chacun pour soi.
import { describe, expect, it } from 'vitest';
import type { RoadSample, Vehicle } from '@/core/contracts';
import { angleDiff } from '@/core/math';
import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';
import { createSystems as people } from '@/sim/people';
import { createSystems as vehicles } from '@/sim/vehicles';
import type { AutopilotApi } from '@/sim/vehicles';

describe('colonne de l’IA : tête arrêtée par des voitures garées en travers', () => {
  it('la tête ne fait pas demi-tour contre son suivant ; son temps d’arrêt court au-delà de 20 s', async () => {
    const t = createTestContext({ seed: 1, strict: false, modules: [world, people, vehicles] });
    await t.start({ mode: 'libre', role: 'crs', place: 'Place de la République', x: 3123, z: -208, crowdSize: 0, tension: 0, volatility: 0, duration: 'standard' } as never);
    const ctx = t.ctx;
    const ap = ctx.require<AutopilotApi>('vehicles.autopilot');
    const rs: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
    expect(ctx.world.nearestRoad(2049, 599, rs, 30)).toBe(true);
    // cap de l'itinéraire vers République, depuis ce point
    const path: number[] = [];
    expect(ctx.world.findPath(rs.x, rs.z, 3123, -208, 'vehicle', path)).toBe(true);
    let h = 0;
    for (let i = 2; i < path.length; i += 2) if (Math.hypot(path[i]! - path[0]!, path[i + 1]! - path[1]!) > 5) { h = Math.atan2(path[i]! - path[0]!, path[i + 1]! - path[1]!); break; }
    const fx = Math.sin(h), fz = Math.cos(h);
    const crewed = (kind: string, back: number): Vehicle => {
      const v = ctx.vehicles.spawn(kind, rs.x - fx * back, rs.z - fz * back, h);
      expect(ctx.vehicles.enter(ctx.people.spawn({ kind: 'crs', x: v.x, z: v.z }), v, 'driver')).toBe(true);
      return v;
    };
    const head = crewed('vl_commandement', 30), v2 = crewed('fourgon_crs', 42), v3 = crewed('fourgon_crs', 54);
    expect(ap.convoy([head, v2, v3], 3123, -208, { urgence: true })).toBe(true);
    for (let i = 0; i < 120; i++) t.step(1 / 30);
    // voitures garées (sans conducteur) en travers de toute la chaussée, 18 m devant la tête
    const bx = head.x + fx * 18, bz = head.z + fz * 18;
    for (const k of [-7, -5, -3, -1, 1, 3, 5, 7]) ctx.vehicles.spawn('citadine', bx - fz * k * 2.4, bz + fx * k * 2.4, h + Math.PI / 2);
    let faced = '';
    let maxBlocked = 0;
    for (let i = 0; i < 30 * 60; i++) {
      t.step(1 / 30);
      const st = ap.status(head);
      if ((st.state === 'bloque' || st.state === 'attente') && st.blockedFor > maxBlocked) maxBlocked = st.blockedFor;
      const d = Math.hypot(v2.x - head.x, v2.z - head.z);
      if (!faced && Math.abs(angleDiff(head.heading, h)) > 1.6 && d < 15) faced = `t=${ctx.clock.now.toFixed(1)} : tête retournée à ${d.toFixed(1)} m de son suivant (${st.state})`;
    }
    expect(faced).toBe('');
    expect(maxBlocked).toBeGreaterThan(20);
  }, 300000);
});
