import { describe, expect, it } from 'vitest';
import { DECAL_ALPHA, DECAL_FADE_SHARE, DECAL_PUDDLE, DecalQueue } from '@/render/fx/decalQueue';

function add(q: DecalQueue, x: number, now = 0, tile = 0, life = Infinity): number {
  return q.add(tile, DECAL_ALPHA, x, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, now, life);
}

describe('effets — file des décalques', () => {
  it('plafonne le nombre de décalques : le plus ancien cède sa place', () => {
    const q = new DecalQueue(16);
    for (let i = 0; i < 100; i++) {
      add(q, i);
      expect(q.count).toBeLessThanOrEqual(16);
    }
    expect(q.count).toBe(16);
    // il reste exactement les 16 derniers posés
    const xs = Array.from(q.x).sort((a, b) => a - b);
    expect(xs).toEqual(Array.from({ length: 16 }, (_, k) => 84 + k));
  });

  it('rang d\'ancienneté : 0 pour le plus récent, capacity − 1 pour le prochain à disparaître', () => {
    const q = new DecalQueue(8);
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) ids.push(add(q, i));
    expect(q.rankOf(ids[7]!)).toBe(0);
    expect(q.rankOf(ids[0]!)).toBe(7);
    const next = add(q, 99);
    // le nouveau a pris la case du plus ancien
    expect(next).toBe(ids[0]);
    expect(q.rankOf(next)).toBe(0);
    expect(q.rankOf(ids[1]!)).toBe(7);
  });

  it('les plus anciens pâlissent avant de disparaître, sans à-coup', () => {
    const cap = 40;
    const q = new DecalQueue(cap);
    const ids: number[] = [];
    for (let i = 0; i < cap; i++) ids.push(add(q, i));
    // récents : pleine opacité
    expect(q.fade(ids[cap - 1]!, 0)).toBe(1);
    expect(q.fade(ids[cap >> 1]!, 0)).toBe(1);
    // fondu monotone sur la dernière part de l'anneau
    let prev = 0;
    for (let i = 0; i < cap; i++) {
      const f = q.fade(ids[i]!, 0);
      expect(f).toBeGreaterThanOrEqual(prev);
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThanOrEqual(1);
      prev = f;
    }
    // le prochain à disparaître est presque effacé : son remplacement ne se voit pas
    expect(q.fade(ids[0]!, 0)).toBeLessThanOrEqual(1 / (cap * DECAL_FADE_SHARE) + 1e-9);
    // un ajout fait reculer tout le monde d'un rang : variation d'au plus un pas de fondu
    const before = q.fade(ids[3]!, 0);
    add(q, 1000);
    const after = q.fade(ids[3]!, 0);
    expect(before - after).toBeGreaterThan(0);
    expect(before - after).toBeLessThanOrEqual(1 / (cap * DECAL_FADE_SHARE) + 1e-9);
  });

  it('durée de vie : une flaque sèche (fondu sur le dernier tiers puis disparition)', () => {
    const q = new DecalQueue(8);
    const i = q.add(5, DECAL_PUDDLE, 0, 0, 0, 0, 1, 0, 2, 0, 1, 1, 1, 0.8, 10, 60);
    expect(q.fade(i, 10)).toBe(1);
    expect(q.fade(i, 40)).toBe(1);
    const late = q.fade(i, 10 + 55);
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(0.5);
    expect(q.fade(i, 10 + 60)).toBe(0);
    expect(q.fade(i, 500)).toBe(0);
    // un décalque permanent ne vieillit pas
    const k = add(q, 3, 10);
    expect(q.fade(k, 1e6)).toBe(1);
  });

  it('fusion : un décalque voisin du même type est agrandi au lieu d\'être doublé', () => {
    const q = new DecalQueue(32);
    const a = q.add(5, DECAL_PUDDLE, 10, 0, 10, 0, 1, 0, 1.5, 0, 1, 1, 1, 0.5, 0, 60);
    add(q, 50, 0, 2);
    expect(q.findNear(5, 10.5, 0, 10.2, 1.5, 1)).toBe(a);
    // autre type, ou trop loin : pas de fusion
    expect(q.findNear(2, 10.5, 0, 10.2, 1.5, 1)).toBe(-1);
    expect(q.findNear(5, 14, 0, 10, 1.5, 1)).toBe(-1);
    // décalque expiré : on ne le ressuscite pas
    expect(q.findNear(5, 10.5, 0, 10.2, 1.5, 100)).toBe(-1);
    const rev = q.revision;
    const count = q.count;
    for (let k = 0; k < 50; k++) q.refresh(a, 2.5, 4, 0.8, 5 + k * 0.2);
    expect(q.count).toBe(count);
    expect(q.revision).toBeGreaterThan(rev);
    // la taille grandit mais reste plafonnée ; l'opacité monte ; la vie est relancée
    expect(q.size[a]).toBeGreaterThan(1.5);
    expect(q.size[a]).toBeLessThanOrEqual(4);
    expect(q.a[a]).toBeCloseTo(0.8, 6);
    expect(q.fade(a, 5 + 49 * 0.2 + 30)).toBe(1);
  });

  it('le plus proche gagne, parmi les plus récents seulement', () => {
    const q = new DecalQueue(64);
    const far = add(q, 1.2, 0, 3);
    const near = add(q, 0.3, 0, 3);
    expect(q.findNear(3, 0, 0, 0, 2, 0)).toBe(near);
    // au-delà de la fenêtre de recherche, l'ancien n'est plus candidat
    for (let i = 0; i < 45; i++) add(q, 100 + i, 0, 9);
    expect(q.findNear(3, 0, 0, 0, 2, 0, 40)).toBe(-1);
    expect(q.findNear(3, 0, 0, 0, 2, 0, 64)).toBe(near);
    expect(far).not.toBe(near);
  });

  it('clear vide la file et repart de zéro', () => {
    const q = new DecalQueue(4);
    for (let i = 0; i < 9; i++) add(q, i);
    q.clear();
    expect(q.count).toBe(0);
    expect(q.serialCounter).toBe(0);
    expect(add(q, 7)).toBe(0);
    expect(q.rankOf(0)).toBe(0);
    expect(q.fade(0, 0)).toBe(1);
  });
});
