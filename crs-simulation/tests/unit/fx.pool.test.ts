import { describe, expect, it } from 'vitest';
import {
  F_BOUNCE, F_FADE_IN, F_FLASH, F_HOLD, F_SHRINK, F_TURB, PRIO_HIGH, PRIO_LOW, PRIO_MID, ParticlePool, alphaCurve, sizeCurve,
  sortFarToNear,
} from '@/render/fx/pool';

describe('effets — réserve de particules', () => {
  it('ne dépasse jamais sa capacité et garde les vivantes compactes', () => {
    const pool = new ParticlePool(64);
    for (let i = 0; i < 200; i++) {
      const k = pool.spawn(PRIO_LOW);
      if (k >= 0) { pool.life[k] = 1 + (i % 7) * 0.3; pool.x[k] = i; }
      expect(pool.count).toBeLessThanOrEqual(64);
    }
    expect(pool.count).toBe(64);
    expect(pool.free).toBe(0);
    expect(pool.load).toBe(1);
    // refus et recyclages sont comptés
    expect(pool.dropped + pool.recycled).toBe(200 - 64);
    for (let step = 0; step < 200; step++) {
      pool.update(0.05, 0, 0);
      for (let i = 0; i < pool.count; i++) expect(pool.age[i]!).toBeLessThan(pool.life[i]!);
    }
    expect(pool.count).toBe(0);
  });

  it('spawn remet toutes les valeurs par défaut (aucune donnée de la particule précédente)', () => {
    const pool = new ParticlePool(4);
    const a = pool.spawn(PRIO_MID);
    pool.vx[a] = 9; pool.grav[a] = 1; pool.drag[a] = 3; pool.wind[a] = 2; pool.flags[a] = F_BOUNCE | F_TURB; pool.stretch[a] = 0.2;
    pool.tile[a] = 7; pool.kind[a] = 3; pool.life[a] = 0.01; pool.a[a] = 0.2; pool.s0[a] = 5; pool.s1[a] = 6;
    pool.update(0.1, 0, 0);
    expect(pool.count).toBe(0);
    const b = pool.spawn(PRIO_LOW);
    expect(b).toBe(0);
    expect(pool.vx[b]).toBe(0);
    expect(pool.grav[b]).toBe(0);
    expect(pool.drag[b]).toBe(0);
    expect(pool.wind[b]).toBe(0);
    expect(pool.flags[b]).toBe(0);
    expect(pool.stretch[b]).toBe(0);
    expect(pool.tile[b]).toBe(0);
    expect(pool.kind[b]).toBe(0);
    expect(pool.life[b]).toBe(1);
    expect(pool.a[b]).toBe(1);
    expect(pool.s0[b]).toBe(1);
    expect(pool.prio[b]).toBe(PRIO_LOW);
  });

  it('le retrait par échange conserve intégralement la particule déplacée', () => {
    const pool = new ParticlePool(8);
    for (let i = 0; i < 3; i++) {
      const k = pool.spawn(PRIO_LOW);
      pool.x[k] = 10 + i; pool.y[k] = 20 + i; pool.z[k] = 30 + i;
      pool.life[k] = i === 0 ? 0.05 : 10;
      pool.r[k] = 0.1 * (i + 1); pool.tile[k] = i + 1; pool.kind[k] = i; pool.seed[k] = i * 0.25; pool.floorY[k] = -i;
    }
    pool.update(0.1, 0, 0);
    expect(pool.count).toBe(2);
    // la dernière (i = 2) a pris la place de la première
    expect(pool.x[0]).toBe(12);
    expect(pool.y[0]).toBe(22);
    expect(pool.z[0]).toBe(32);
    expect(pool.r[0]).toBeCloseTo(0.3, 6);
    expect(pool.tile[0]).toBe(3);
    expect(pool.kind[0]).toBe(2);
    expect(pool.seed[0]).toBe(0.5);
    expect(pool.floorY[0]).toBe(-2);
    expect(pool.x[1]).toBe(11);
  });

  it('une explosion trouve de la place dans une réserve pleine de fumée, pas l\'inverse', () => {
    const pool = new ParticlePool(32);
    for (let i = 0; i < 32; i++) {
      const k = pool.spawn(PRIO_LOW);
      pool.life[k] = 10;
    }
    let got = 0;
    for (let i = 0; i < 16; i++) if (pool.spawn(PRIO_HIGH) >= 0) got++;
    expect(got).toBe(16);
    expect(pool.count).toBe(32);
    expect(pool.recycled).toBe(16);
    // réserve pleine de particules prioritaires toutes jeunes : une fumée ne passe pas
    const full = new ParticlePool(16);
    for (let i = 0; i < 16; i++) full.life[full.spawn(PRIO_HIGH)] = 10;
    for (let i = 0; i < 20; i++) expect(full.spawn(PRIO_LOW)).toBe(-1);
    expect(full.dropped).toBe(20);
    expect(full.count).toBe(16);
  });

  it('intègre pesanteur, frottement, vent et rebond', () => {
    const pool = new ParticlePool(8);
    // chute libre : y = y0 − ½ g t²
    const a = pool.spawn();
    pool.y[a] = 100; pool.grav[a] = 1; pool.life[a] = 10;
    for (let i = 0; i < 100; i++) pool.update(0.01, 0, 0);
    expect(pool.y[a]).toBeCloseTo(100 - 0.5 * 9.81, 0);
    // air chaud : monte ; vent : la vitesse horizontale rejoint celle de l'air
    const b = pool.spawn();
    pool.y[b] = 0; pool.grav[b] = -0.1; pool.wind[b] = 2; pool.life[b] = 10;
    for (let i = 0; i < 300; i++) pool.update(0.01, 3, -1);
    expect(pool.y[b]).toBeGreaterThan(0);
    expect(pool.vx[b]).toBeCloseTo(3, 1);
    expect(pool.vz[b]).toBeCloseTo(-1, 1);
    // rebond : ne passe pas sous le sol, finit immobile
    const c = pool.spawn();
    pool.y[c] = 2; pool.vx[c] = 3; pool.grav[c] = 1; pool.life[c] = 20; pool.floorY[c] = 0; pool.flags[c] = F_BOUNCE; pool.spin[c] = 5;
    let minY = Infinity;
    for (let i = 0; i < 600; i++) { pool.update(1 / 60, 0, 0); minY = Math.min(minY, pool.y[c]!); }
    expect(minY).toBeGreaterThanOrEqual(0);
    expect(pool.vx[c]).toBe(0);
    expect(pool.vy[c]).toBe(0);
    expect(pool.spin[c]).toBe(0);
    expect(pool.y[c]).toBeLessThan(0.1);
  });

  it('un pas nul ou négatif ne change rien (pause)', () => {
    const pool = new ParticlePool(4);
    const a = pool.spawn();
    pool.vx[a] = 5; pool.life[a] = 1;
    pool.update(0, 1, 1);
    pool.update(-1, 1, 1);
    expect(pool.x[a]).toBe(0);
    expect(pool.age[a]).toBe(0);
  });

  it('courbes d\'opacité et de taille', () => {
    expect(alphaCurve(0, 0)).toBe(1);
    expect(alphaCurve(0.5, 0)).toBeCloseTo(0.5, 6);
    expect(alphaCurve(1, 0)).toBe(0);
    expect(alphaCurve(-0.1, 0)).toBe(0);
    expect(alphaCurve(0.5, F_HOLD)).toBe(1);
    expect(alphaCurve(0.9, F_HOLD)).toBeCloseTo(0.4, 6);
    expect(alphaCurve(0.5, F_FLASH)).toBeCloseTo(0.25, 6);
    expect(alphaCurve(0, F_FADE_IN)).toBe(0);
    expect(alphaCurve(0.075, F_FADE_IN)).toBeCloseTo(0.5 * (1 - 0.075), 6);
    for (let t = 0; t <= 1; t += 0.05) for (const f of [0, F_HOLD, F_FLASH, F_FADE_IN, F_HOLD | F_FADE_IN]) {
      const a = alphaCurve(t, f);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    expect(sizeCurve(1, 5, 0, 0)).toBe(1);
    expect(sizeCurve(1, 5, 1, 0)).toBe(5);
    // croissance rapide au début
    expect(sizeCurve(1, 5, 0.5, 0)).toBeCloseTo(4, 6);
    expect(sizeCurve(1, 5, 0.5, F_SHRINK)).toBeCloseTo(3, 6);
  });
});

describe('effets — tri de transparence', () => {
  it('ordonne du plus loin au plus proche, de façon stable', () => {
    const n = 500;
    const depth = new Float32Array(n);
    let s = 7;
    for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) >>> 0; depth[i] = (s / 4294967296) * 300; }
    depth[10] = 42; depth[11] = 42; depth[12] = 42;
    const order = new Uint32Array(n);
    const counts = new Uint32Array(2049);
    expect(sortFarToNear(depth, n, 300, order, counts, 2048)).toBe(n);
    // permutation complète
    const seen = new Uint8Array(n);
    for (let i = 0; i < n; i++) seen[order[i]!] = 1;
    expect(seen.every((v) => v === 1)).toBe(true);
    // décroissant, à la finesse des seaux près (pas en racine : < 0,3 m sur 300 m)
    for (let i = 1; i < n; i++) expect(depth[order[i]!]!).toBeLessThanOrEqual(depth[order[i - 1]!]! + 0.3);
    // stable : à profondeur égale, l'ordre d'émission est conservé
    const pos = (k: number): number => order.indexOf(k);
    expect(pos(10)).toBeLessThan(pos(11));
    expect(pos(11)).toBeLessThan(pos(12));
  });

  it('accepte les profondeurs négatives, nulles et au-delà du maximum', () => {
    const depth = new Float32Array([-5, 0, 1000, 3, Number.NaN]);
    const order = new Uint32Array(5);
    const counts = new Uint32Array(17);
    sortFarToNear(depth, 5, 10, order, counts, 16);
    expect(Array.from(order).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(order[0]).toBe(2);
  });
});
