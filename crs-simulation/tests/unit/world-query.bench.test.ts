// Micro-mesures : 100 000 resolveCircle, 1 000 lancers de rayon, 200 itinéraires (quartier d'essai).
// Les temps sont affichés (npx vitest run tests/unit/world-query.bench --silent=false) et bornés très largement.
import { beforeAll, describe, expect, it } from 'vitest';
import type { RayHit, Vec2 } from '@/core/contracts';
import { createWorldQuery } from '@/world/query';
import type { WorldQueryImpl } from '@/world/query';
import { seededRandom } from '@/world/query/testkit';

let w: WorldQueryImpl;

beforeAll(async () => {
  w = createWorldQuery({ source: 'test' });
  await w.boot();
  w.setFocus(0, 0);
  await w.whenLoaded(0, 0, 800);
});

describe('monde : micro-mesures', () => {
  it('100 000 resolveCircle', () => {
    // 500 marcheurs lâchés sur les trottoirs, 200 pas chacun, cap légèrement variable : situation de foule.
    const rand = seededRandom(1);
    const walkers: { pos: Vec2; heading: number }[] = [];
    const p: Vec2 = { x: 0, z: 0 };
    while (walkers.length < 500) {
      if (w.randomFreePoint(0, 0, 480, 'sidewalk', rand, p)) walkers.push({ pos: { x: p.x, z: p.z }, heading: rand() * Math.PI * 2 });
    }
    // Échauffement (compilation à la volée), non mesuré.
    for (let i = 0; i < 20000; i++) w.resolveCircle(walkers[i % 500].pos, 0.3);
    let contacts = 0, inSolid = 0;
    const t0 = performance.now();
    for (let step = 0; step < 200; step++) {
      for (let k = 0; k < 500; k++) {
        const wk = walkers[k];
        wk.pos.x += Math.sin(wk.heading) * 0.07;
        wk.pos.z += Math.cos(wk.heading) * 0.07;
        if (w.resolveCircle(wk.pos, 0.3)) {
          contacts++;
          wk.heading += 0.35; // on tourne au contact
        }
      }
    }
    const ms = performance.now() - t0;
    for (const wk of walkers) if (w.isSolidAt(wk.pos.x, wk.pos.z)) inSolid++;
    console.log(`[mesure] 100 000 resolveCircle : ${ms.toFixed(1)} ms (${((ms * 1000) / 100000).toFixed(3)} µs l'unité), ${contacts} contacts`);
    expect(inSolid).toBe(0);
    expect(contacts).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(2000);
  });

  it('1 000 lancers de rayon et 1 000 lignes de vue', () => {
    const rand = seededRandom(2);
    const hit: RayHit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
    const rays = new Float64Array(4000);
    for (let i = 0; i < 1000; i++) {
      const x = (rand() - 0.5) * 1000, z = (rand() - 0.5) * 1000;
      const a = rand() * Math.PI * 2, len = 20 + rand() * 180;
      rays.set([x, z, x + Math.cos(a) * len, z + Math.sin(a) * len], i * 4);
    }
    for (let i = 0; i < 1000; i++) w.raycast(rays[4 * i], rays[4 * i + 1], rays[4 * i + 2], rays[4 * i + 3], hit); // échauffement
    let hits = 0;
    let t0 = performance.now();
    for (let i = 0; i < 1000; i++) if (w.raycast(rays[4 * i], rays[4 * i + 1], rays[4 * i + 2], rays[4 * i + 3], hit)) hits++;
    const rayMs = performance.now() - t0;
    let clear = 0;
    t0 = performance.now();
    for (let i = 0; i < 1000; i++) if (w.lineOfSight(rays[4 * i], rays[4 * i + 1], rays[4 * i + 2], rays[4 * i + 3])) clear++;
    const losMs = performance.now() - t0;
    console.log(`[mesure] 1 000 raycast (20 à 200 m) : ${rayMs.toFixed(2)} ms, ${hits} arrêtés ; 1 000 lineOfSight : ${losMs.toFixed(2)} ms, ${clear} dégagées`);
    expect(hits).toBeGreaterThan(700);
    expect(rayMs).toBeLessThan(500);
    expect(losMs).toBeLessThan(500);
    // Contrôle croisé : un rayon arrêté par un obstacle opaque interdit la ligne de vue, et réciproquement une
    // ligne de vue dégagée n'a rencontré, au pire, que des obstacles bas ou ajourés.
    for (let i = 0; i < 1000; i++) {
      const blocked = w.raycast(rays[4 * i], rays[4 * i + 1], rays[4 * i + 2], rays[4 * i + 3], hit);
      const sight = w.lineOfSight(rays[4 * i], rays[4 * i + 1], rays[4 * i + 2], rays[4 * i + 3]);
      if (!blocked) expect(sight).toBe(true);
      if (blocked && hit.kind === 'building') expect(sight).toBe(false);
    }
  });

  it('200 itinéraires', () => {
    const rand = seededRandom(3);
    const ends = new Float64Array(800);
    for (let i = 0; i < 800; i++) ends[i] = (rand() - 0.5) * 1000;
    const path: number[] = [];
    // Première série, à froid (compilation à la volée comprise), dans les deux modes.
    const cold0 = performance.now();
    for (let i = 0; i < 200; i++) w.findPath(ends[4 * i], ends[4 * i + 1], ends[4 * i + 2], ends[4 * i + 3], i % 2 === 0 ? 'vehicle' : 'foot', path);
    const coldMs = performance.now() - cold0;
    for (let rep = 0; rep < 5; rep++) {
      for (let i = 0; i < 200; i++) w.findPath(ends[4 * i], ends[4 * i + 1], ends[4 * i + 2], ends[4 * i + 3], i % 2 === 0 ? 'vehicle' : 'foot', path);
    }
    let found = 0, points = 0;
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) {
      if (w.findPath(ends[4 * i], ends[4 * i + 1], ends[4 * i + 2], ends[4 * i + 3], i % 2 === 0 ? 'vehicle' : 'foot', path)) {
        found++;
        points += path.length >> 1;
      }
    }
    const ms = performance.now() - t0;
    console.log(`[mesure] 200 findPath : ${ms.toFixed(2)} ms (${((ms * 1000) / 200).toFixed(1)} µs l'unité) à chaud, ${coldMs.toFixed(1)} ms à froid ; ${found} trouvés, ${(points / Math.max(1, found)).toFixed(1)} points en moyenne`);
    expect(found).toBe(200); // une extrémité hors du réseau principal y est raccrochée
    expect(ms).toBeLessThan(1000);
  });

  it('requêtes ponctuelles : heightAt, surfaceAt, nearestRoad, isFree', () => {
    const rand = seededRandom(4);
    const pts = new Float64Array(20000);
    for (let i = 0; i < 20000; i++) pts[i] = (rand() - 0.5) * 1000;
    const sample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential' as const, oneway: false };
    let acc = 0;
    for (let i = 0; i < 10000; i++) acc += w.heightAt(pts[2 * i], pts[2 * i + 1]) + w.surfaceCodeAt(pts[2 * i], pts[2 * i + 1]); // échauffement
    let t0 = performance.now();
    for (let rep = 0; rep < 10; rep++) for (let i = 0; i < 10000; i++) acc += w.heightAt(pts[2 * i], pts[2 * i + 1]);
    const heightMs = performance.now() - t0;
    t0 = performance.now();
    for (let rep = 0; rep < 10; rep++) for (let i = 0; i < 10000; i++) acc += w.surfaceCodeAt(pts[2 * i], pts[2 * i + 1]);
    const surfaceMs = performance.now() - t0;
    t0 = performance.now();
    for (let i = 0; i < 10000; i++) if (w.nearestRoad(pts[2 * i], pts[2 * i + 1], sample)) acc += sample.dist;
    const roadMs = performance.now() - t0;
    t0 = performance.now();
    let free = 0;
    for (let i = 0; i < 10000; i++) if (w.isFree(pts[2 * i], pts[2 * i + 1], 0.4)) free++;
    const freeMs = performance.now() - t0;
    console.log(`[mesure] 100 000 heightAt : ${heightMs.toFixed(1)} ms ; 100 000 surfaceAt : ${surfaceMs.toFixed(1)} ms ; 10 000 nearestRoad : ${roadMs.toFixed(1)} ms ; 10 000 isFree : ${freeMs.toFixed(1)} ms (${free} libres)`);
    expect(Number.isFinite(acc)).toBe(true);
    expect(heightMs + surfaceMs + roadMs + freeMs).toBeLessThan(2000);
  });
});
