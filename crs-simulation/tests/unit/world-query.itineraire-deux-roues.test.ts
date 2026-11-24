// Itinéraire d'un deux-roues (PathStartOptions.tightTurns) : parti tout près d'un carrefour, le virage à ce carrefour
// est jugé sur son cap réel. Cas relevé en partie jouée (chef de la BRAV-M, République → avenue de la République,
// graine 21) : une moto arrêtée par une voiture à l'entrée du boulevard Richard-Lenoir (sens unique), à deux mètres de
// l'avenue qu'elle venait de quitter, devait rejoindre la tête de sa colonne arrêtée cent mètres plus loin sur l'avenue.
// Le surcoût du virage en épingle, compté pour un fourgon, lui faisait faire le tour du pâté de maisons (plus de 600 m).
import { describe, expect, it } from 'vitest';

import { createTestContext } from '@/core/testing';
import { createSystems as world } from '@/world/query';

function lengthOf(path: readonly number[]): number {
  let len = 0;
  for (let i = 2; i < path.length; i += 2) len += Math.hypot(path[i]! - path[i - 2]!, path[i + 1]! - path[i - 1]!);
  return len;
}

describe('itinéraire d’un deux-roues', () => {
  it('à l’entrée d’un sens unique, la moto reprend l’avenue au lieu de faire le tour du pâté de maisons', async () => {
    const t = createTestContext({ seed: 21, strict: false, modules: [world] });
    await t.start({ mode: 'libre', role: 'crs', place: 'Place de la République', x: 3123, z: -208, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard' } as never);
    const w = t.ctx.world;
    // la moto : à l'entrée du boulevard Richard-Lenoir, tournée vers lui ; la tête de sa colonne : sur l'avenue, à l'est
    const from = { x: 3492.1, z: -75.8, heading: 0.49 };
    const to = { x: 3586, z: -53 };
    const crow = Math.hypot(to.x - from.x, to.z - from.z);
    const van: number[] = [];
    const moto: number[] = [];
    // (mêmes options que le pilote automatique : départ orienté, demi-tour bon marché, intervention urgente)
    expect(w.findPath(from.x, from.z, to.x, to.z, 'vehicle', van, { heading: from.heading, uturn: 8, contraflow: 3, minWidth: 2 })).toBe(true);
    expect(w.findPath(from.x, from.z, to.x, to.z, 'vehicle', moto, { heading: from.heading, uturn: 8, contraflow: 3, minWidth: 2, tightTurns: true })).toBe(true);
    console.log(`à vol d'oiseau ${crow.toFixed(0)} m ; sans l'option ${lengthOf(van).toFixed(0)} m ; deux-roues ${lengthOf(moto).toFixed(0)} m`);
    // sans l'option (fourgon) : le détour, inchangé
    expect(lengthOf(van)).toBeGreaterThan(400);
    // deux-roues : le chemin direct
    expect(lengthOf(moto)).toBeLessThan(crow + 40);
    // l'itinéraire arrive bien au point demandé
    expect(Math.hypot(moto[moto.length - 2]! - to.x, moto[moto.length - 1]! - to.z)).toBeLessThan(15);
  }, 300000);

  it('loin d’un carrefour, l’option ne change rien', async () => {
    const t = createTestContext({ seed: 21, strict: false, modules: [world] });
    await t.start({ mode: 'libre', role: 'crs', place: 'Place de la République', x: 3123, z: -208, crowdSize: 0, tension: 0.1, volatility: 0.1, duration: 'standard' } as never);
    const w = t.ctx.world;
    // sur l'avenue, dans le sens de la marche
    const a: number[] = [];
    const b: number[] = [];
    expect(w.findPath(3380, -111, 3586, -53, 'vehicle', a, { heading: 1.3, uturn: 8, contraflow: 3, minWidth: 2 })).toBe(true);
    expect(w.findPath(3380, -111, 3586, -53, 'vehicle', b, { heading: 1.3, uturn: 8, contraflow: 3, minWidth: 2, tightTurns: true })).toBe(true);
    expect(b).toEqual(a);
  }, 300000);
});
