import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LightPool } from '@/render/base/lights';

function realLights(scene: THREE.Scene): { points: THREE.PointLight[]; spots: THREE.SpotLight[] } {
  const points: THREE.PointLight[] = [];
  const spots: THREE.SpotLight[] = [];
  scene.traverse((o) => {
    if ((o as THREE.PointLight).isPointLight) points.push(o as THREE.PointLight);
    if ((o as THREE.SpotLight).isSpotLight) spots.push(o as THREE.SpotLight);
  });
  return { points, spots };
}
const lit = (ls: THREE.Light[]): number => ls.filter((l) => l.intensity > 0).length;

describe('rendu de base — réserve de lumières dynamiques', () => {
  it('garde un nombre FIXE de vraies lumières dans la scène (pas de recompilation des matériaux)', () => {
    const scene = new THREE.Scene();
    const pool = new LightPool(scene, 4, 2);
    expect(pool.pointBudget).toBe(4);
    expect(pool.spotBudget).toBe(2);
    let r = realLights(scene);
    expect(r.points.length).toBe(4);
    expect(r.spots.length).toBe(2);
    expect(lit(r.points)).toBe(0);
    // toutes « visibles » : c'est l'intensité qui les éteint
    expect(r.points.every((l) => l.visible && !l.castShadow)).toBe(true);
    const many = Array.from({ length: 30 }, (_, i) => pool.point({ x: i * 10, y: 2, z: 0, intensity: 40, range: 15 }));
    for (let i = 0; i < 30; i++) pool.update(1 / 30, 0, 2, 0);
    r = realLights(scene);
    expect(r.points.length).toBe(4);
    expect(lit(r.points)).toBe(4);
    expect(pool.count).toBe(30);
    expect(pool.wantedCount).toBe(30);
    expect(pool.litCount).toBe(4);
    for (const m of many) m.release();
    pool.update(1 / 30, 0, 2, 0);
    expect(pool.count).toBe(0);
    expect(lit(realLights(scene).points)).toBe(0);
    expect(realLights(scene).points.length).toBe(4);
  });

  it('attribue les vraies lumières aux plus proches de la caméra', () => {
    const scene = new THREE.Scene();
    const pool = new LightPool(scene, 2, 0);
    const near = pool.point({ x: 3, y: 1, z: 0, intensity: 40, range: 15 });
    const mid = pool.point({ x: 20, y: 1, z: 0, intensity: 40, range: 15 });
    const far = pool.point({ x: 200, y: 1, z: 0, intensity: 40, range: 15 });
    for (let i = 0; i < 20; i++) pool.update(1 / 30, 0, 1.7, 0);
    expect(near.shown).toBe(1);
    expect(mid.shown).toBe(1);
    expect(far.shown).toBe(0);
    // la caméra s'éloigne : les lumières permutent avec un fondu, sans à-coup
    pool.update(1 / 30, 210, 1.7, 0);
    expect(near.shown).toBeLessThan(1);
    expect(near.shown).toBeGreaterThan(0.5);
    for (let i = 0; i < 30; i++) pool.update(1 / 30, 210, 1.7, 0);
    expect(far.shown).toBe(1);
    expect(near.shown).toBe(0);
    const pts = realLights(scene).points.filter((l) => l.intensity > 0);
    expect(pts.some((l) => l.position.x === 200)).toBe(true);
  });

  it('une lumière forte ou prioritaire passe avant une faible à distance égale', () => {
    const scene = new THREE.Scene();
    const pool = new LightPool(scene, 1, 0);
    const weak = pool.point({ x: 10, y: 1, z: 0, intensity: 10, range: 15 });
    const strong = pool.point({ x: -10, y: 1, z: 0, intensity: 150, range: 15 });
    for (let i = 0; i < 20; i++) pool.update(1 / 30, 0, 1.7, 0);
    expect(strong.shown).toBe(1);
    expect(weak.shown).toBe(0);
    strong.enabled = false;
    for (let i = 0; i < 20; i++) pool.update(1 / 30, 0, 1.7, 0);
    expect(weak.shown).toBe(1);
    // priorité : à intensité égale, la prioritaire l'emporte
    const pool2 = new LightPool(new THREE.Scene(), 1, 0);
    const a = pool2.point({ x: 10, y: 1, z: 0, intensity: 40, range: 15 });
    const b = pool2.point({ x: -10, y: 1, z: 0, intensity: 40, range: 15, priority: 1 });
    for (let i = 0; i < 20; i++) pool2.update(1 / 30, 0, 1.7, 0);
    expect(b.shown).toBe(1);
    expect(a.shown).toBe(0);
  });

  it('reporte position, couleur, intensité et portée sur la vraie lumière ; le feu vacille', () => {
    const scene = new THREE.Scene();
    const pool = new LightPool(scene, 1, 0);
    const fire = pool.point({ x: 4, y: 1.5, z: -2, color: 0xff7a22, intensity: 45, range: 18 });
    for (let i = 0; i < 20; i++) pool.update(1 / 30, 0, 1.7, 0);
    const real = realLights(scene).points[0]!;
    expect(real.position.x).toBe(4);
    expect(real.position.y).toBe(1.5);
    expect(real.position.z).toBe(-2);
    expect(real.color.getHex()).toBe(0xff7a22);
    expect(real.intensity).toBeCloseTo(45, 5);
    expect(real.distance).toBe(18);
    fire.flicker = 0.7;
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < 120; i++) {
      pool.update(1 / 30, 0, 1.7, 0);
      min = Math.min(min, real.intensity);
      max = Math.max(max, real.intensity);
    }
    expect(max).toBeLessThanOrEqual(45);
    expect(min).toBeGreaterThan(45 * 0.3);
    expect(max - min).toBeGreaterThan(5);
    // déplacée par son propriétaire : suivie à l'image suivante
    fire.x = 9;
    pool.update(1 / 30, 0, 1.7, 0);
    expect(real.position.x).toBe(9);
  });

  it('projecteurs : direction, angle et budget séparé', () => {
    const scene = new THREE.Scene();
    const pool = new LightPool(scene, 0, 1);
    const lamp = pool.spot({ x: 0, y: 1.5, z: 0, dirX: 0, dirY: -0.2, dirZ: 1, angle: 0.4, penumbra: 0.5, intensity: 150, range: 40 });
    expect(lamp.kind).toBe('spot');
    for (let i = 0; i < 20; i++) pool.update(1 / 30, 0, 1.7, 0);
    const real = realLights(scene).spots[0]!;
    expect(real.intensity).toBeCloseTo(150, 5);
    expect(real.angle).toBe(0.4);
    expect(real.target.position.z).toBeCloseTo(1, 5);
    expect(real.target.position.y).toBeCloseTo(1.3, 5);
    // une lumière ponctuelle ne prend pas la place d'un projecteur
    const p = pool.point({ intensity: 500, range: 30 });
    for (let i = 0; i < 20; i++) pool.update(1 / 30, 0, 1.7, 0);
    expect(p.shown).toBe(0);
    expect(lamp.shown).toBe(1);
  });

  it('flash : éclat immédiat qui s’éteint tout seul et se rend à la réserve', () => {
    const scene = new THREE.Scene();
    const pool = new LightPool(scene, 2, 0);
    pool.flash(5, 1, 0, 0xfff0c0, 500, 40, 0.3);
    expect(pool.count).toBe(1);
    pool.update(1 / 60, 0, 1.7, 0);
    const real = realLights(scene).points.find((l) => l.intensity > 0)!;
    expect(real.intensity).toBeGreaterThan(350);      // pas de fondu d'entrée
    let prev = real.intensity;
    for (let i = 0; i < 10; i++) {
      pool.update(1 / 60, 0, 1.7, 0);
      expect(real.intensity).toBeLessThanOrEqual(prev);
      prev = real.intensity;
    }
    for (let i = 0; i < 20; i++) pool.update(1 / 60, 0, 1.7, 0);
    expect(pool.count).toBe(0);
    expect(lit(realLights(scene).points)).toBe(0);
    // paramètres absurdes ignorés
    pool.flash(0, 0, 0, 0xffffff, 0, 10, 1);
    pool.flash(0, 0, 0, 0xffffff, 10, 10, 0);
    expect(pool.count).toBe(0);
    // changement de session : les éclats en cours s'éteignent, les lumières des modules restent à leurs propriétaires
    const kept = pool.point({ x: 1, intensity: 20, range: 10 });
    pool.flash(5, 1, 0, 0xfff0c0, 500, 40, 2);
    expect(pool.count).toBe(2);
    pool.clearFlashes();
    expect(pool.count).toBe(1);
    pool.update(1 / 60, 0, 1.7, 0);
    expect(kept.shown).toBeGreaterThan(0);
  });

  it('pulse : lumière « à l’image », à redemander à chaque image, sans fondu', () => {
    const scene = new THREE.Scene();
    const pool = new LightPool(scene, 2, 0);
    // image 1 : deux éclats demandés (gyrophare, véhicule en feu)
    pool.pulse(4, 3, 0, 0x1e5bff, 30, 26);
    pool.pulse(-6, 2.2, 1, 0xff7a1c, 50, 22);
    expect(pool.count).toBe(2);
    pool.update(1 / 60, 0, 1.7, 0);
    let on = realLights(scene).points.filter((l) => l.intensity > 0);
    expect(on.length).toBe(2);
    expect(on.map((l) => l.intensity).sort((a, b) => a - b)).toEqual([30, 50]);   // pleine intensité d'emblée
    expect(on.some((l) => l.color.getHex() === 0x1e5bff && l.position.x === 4 && l.distance === 26)).toBe(true);
    // image 2 : un seul redemandé, ailleurs ; l'autre s'éteint aussitôt
    pool.pulse(5, 3, 0, 0x1e5bff, 30, 26);
    pool.update(1 / 60, 0, 1.7, 0);
    on = realLights(scene).points.filter((l) => l.intensity > 0);
    expect(on.length).toBe(1);
    expect(on[0]!.position.x).toBe(5);
    // image 3 : rien redemandé
    pool.update(1 / 60, 0, 1.7, 0);
    expect(lit(realLights(scene).points)).toBe(0);
    expect(pool.count).toBe(0);
    expect(pool.wantedCount).toBe(0);
    // les éclats concourent pour le budget avec les lumières permanentes
    const fire = pool.point({ x: 1, y: 1, z: 0, intensity: 150, range: 20 });
    const lamp = pool.point({ x: -1, y: 1, z: 0, intensity: 80, range: 20 });
    for (let i = 0; i < 20; i++) {
      pool.pulse(300, 3, 0, 0x1e5bff, 20, 26);     // loin et faible : pas retenu
      pool.update(1 / 60, 0, 1.7, 0);
    }
    expect(fire.shown).toBe(1);
    expect(lamp.shown).toBe(1);
    expect(pool.litCount).toBe(2);
    expect(pool.wantedCount).toBe(3);
    // demandes absurdes ou trop nombreuses : ignorées sans erreur
    pool.pulse(0, 0, 0, 0xffffff, 0, 10);
    pool.pulse(0, 0, 0, 0xffffff, 10, -1);
    for (let i = 0; i < 200; i++) pool.pulse(i, 2, 0, 0xffffff, 10, 10);
    pool.update(1 / 60, 0, 1.7, 0);
    expect(pool.count).toBeLessThanOrEqual(2 + 48);
    expect(realLights(scene).points.length).toBe(2);
    pool.clear();
    pool.update(1 / 60, 0, 1.7, 0);
    expect(lit(realLights(scene).points)).toBe(0);
  });

  it('changement de budget (qualité) et remise à zéro', () => {
    const scene = new THREE.Scene();
    const pool = new LightPool(scene, 8, 3);
    const ls = Array.from({ length: 6 }, (_, i) => pool.point({ x: i, intensity: 20, range: 10 }));
    for (let i = 0; i < 20; i++) pool.update(1 / 30, 0, 1.7, 0);
    expect(pool.litCount).toBe(6);
    pool.setBudget(2, 1);
    expect(realLights(scene).points.length).toBe(2);
    expect(realLights(scene).spots.length).toBe(1);
    for (let i = 0; i < 20; i++) pool.update(1 / 30, 0, 1.7, 0);
    expect(pool.litCount).toBe(2);
    expect(ls.filter((l) => l.shown === 1).length).toBe(2);
    pool.clear();
    expect(pool.count).toBe(0);
    // double libération sans effet ; réutilisation des objets rendus
    ls[0]!.release();
    const again = pool.point({ intensity: 5 });
    expect(again.enabled).toBe(true);
    expect(again.shown).toBe(0);
    expect(pool.count).toBe(1);
    pool.dispose();
    expect(realLights(scene).points.length).toBe(0);
  });

  it('coût : 200 lumières virtuelles se trient en quelques dizaines de microsecondes', () => {
    const pool = new LightPool(new THREE.Scene(), 8, 3);
    for (let i = 0; i < 200; i++) pool.point({ x: (i % 20) * 12, y: 2, z: Math.floor(i / 20) * 12, intensity: 20 + (i % 7) * 10, range: 15, flicker: 0.5 });
    for (let i = 0; i < 50; i++) pool.update(1 / 60, 60, 2, 60);
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) pool.update(1 / 60, 60 + (i % 100), 2, 60);
    const us = ((performance.now() - t0) / 2000) * 1000;
    expect(us).toBeLessThan(400);
  });
});
