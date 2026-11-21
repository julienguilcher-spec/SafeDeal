// Lot « palais » — géométrie plane : repère canonique, simplification, découpe (passages, cours, encoches).
import { describe, expect, it } from 'vitest';
import {
  canonFrame, clipConvex, orect, passageArches, passageColliders, passageWindow, planOf, planToLocal, rectOf, segmentParts, simplifyRing,
  solidsMinus, splitByLine, subtractConvex, wallAngle,
} from '@/world/monuments/x-palais-plan';
import { isSimpleRing, pointInRing, rectRing, ringBounds, signedArea, transformRing } from '@/world/monuments/shape2d';

const area = (rs: number[][]): number => rs.reduce((a, r) => a + signedArea(r), 0);

describe('repère canonique', () => {
  it('aligne les murs sur les axes et centre l\'emprise', () => {
    const r = transformRing(rectRing(0, 0, 40, 10), 120, -30, 0.3);
    expect(Math.abs(wallAngle(r) - 0.3) % (Math.PI / 2)).toBeLessThan(1e-6);
    const f = canonFrame(r);
    const b = ringBounds(f.ring);
    expect(b.w).toBeCloseTo(40, 4); expect(b.d).toBeCloseTo(10, 4);
    expect(b.cx).toBeCloseTo(0, 6); expect(b.cz).toBeCloseTo(0, 6);
    const back = planToLocal(f, f.ring);
    for (let i = 0; i < r.length; i++) expect(back[i]).toBeCloseTo(r[i], 6);
  });

  it('planOf retrouve la référence quels que soient l\'ancrage et le cap, et la reprend si l\'emprise manque', () => {
    // emprise en L : dissymétrique, donc sans ambiguïté d'orientation
    const ref = [-30, -20, -30, 20, 30, 20, 30, 5, -10, 5, -10, -20];
    for (const [ox, oz, h] of [[0, 0, 0], [12, -7, 0.2], [-40, 3, Math.PI / 2 + 0.1], [5, 5, Math.PI - 0.05], [0, 0, -1.7]]) {
      const site = { footprint: transformRing(ref, ox, oz, h), height: 20 };
      const p = planOf(site, ref);
      expect(p.fallback).toBe(false);
      // chaque sommet de la référence, replacé par le plan, retombe sur l'emprise du site
      const placed = planToLocal(p, ref);
      for (let i = 0; i < ref.length; i++) expect(placed[i]).toBeCloseTo(site.footprint[i], 3);
      expect(Math.abs(signedArea(p.ring) - signedArea(ref))).toBeLessThan(1e-3);
    }
    const none = planOf({ footprint: [], height: 0 }, ref);
    expect(none.fallback).toBe(true);
    expect(none.ring).toEqual(ref);
    // emprise sans rapport : la référence, posée à l'endroit du site
    const other = planOf({ footprint: rectRing(100, 50, 8, 8), height: 0 }, ref);
    expect(other.fallback).toBe(true);
    expect(other.ox).toBeCloseTo(100, 3); expect(other.oz).toBeCloseTo(50, 3);
  });
});

describe('simplification et découpe', () => {
  it('simplifyRing supprime les petits redents', () => {
    const ring = [0, 0, 0, 10, 4, 10, 4, 10.4, 5, 10.4, 5, 10, 20, 10, 20, 0];
    const s = simplifyRing(ring, 1);
    expect(s.length).toBe(8);
    expect(signedArea(s)).toBeCloseTo(200, 0);
  });

  it('splitByLine coupe un anneau concave en morceaux simples, sans perdre de surface', () => {
    // un U : la droite z = 5 traverse les deux jambes
    const u = [0, 0, 0, 10, 4, 10, 4, 3, 8, 3, 8, 10, 12, 10, 12, 0];
    const { neg, pos } = splitByLine(u, 0, 1, 5);
    expect(neg.length).toBe(1); expect(pos.length).toBe(2);
    for (const r of [...neg, ...pos]) { expect(isSimpleRing(r)).toBe(true); expect(signedArea(r)).toBeGreaterThan(0); }
    expect(area(neg) + area(pos)).toBeCloseTo(signedArea(u), 2);
    // droite passant exactement par des sommets : décalée, pas d'échec
    const s2 = splitByLine(u, 0, 1, 3);
    expect(area(s2.neg) + area(s2.pos)).toBeCloseTo(signedArea(u), 1);
  });

  it('une encoche reste d\'un seul tenant ; un passage traversant donne deux morceaux ; une cour coupe en deux', () => {
    const block = rectRing(0, 0, 100, 40);
    const notch = subtractConvex([block], rectOf(-10, 15, 10, 30));
    expect(notch.length).toBe(1);
    expect(isSimpleRing(notch[0])).toBe(true);
    expect(signedArea(notch[0])).toBeCloseTo(4000 - 20 * 5, 0);
    const through = subtractConvex([block], rectOf(-3, -30, 3, 30));
    expect(through.length).toBe(2);
    expect(area(through)).toBeCloseTo(4000 - 6 * 40, 0);
    const court = subtractConvex([block], rectOf(-20, -8, 20, 8));
    expect(court.length).toBe(2);
    for (const r of court) { expect(isSimpleRing(r)).toBe(true); expect(signedArea(r)).toBeGreaterThan(0); }
    expect(area(court)).toBeCloseTo(4000 - 40 * 16, 0);
    expect(court.some((r) => pointInRing(0, 0, r))).toBe(false);
    expect(court.some((r) => pointInRing(-40, 0, r))).toBe(true);
    // cour + passage qui y mène : on entre par le passage
    const both = solidsMinus(block, [rectOf(-20, -8, 20, 8), rectOf(-2.5, 7, 2.5, 30)]);
    expect(area(both)).toBeCloseTo(4000 - 640 - 5 * 12, 0);
    for (const [x, z] of [[0, 18], [0, 10], [0, 0], [15, -5]]) expect(both.some((r) => pointInRing(x, z, r))).toBe(false);
    for (const [x, z] of [[-4, 18], [4, 18], [0, -15], [45, 0]]) expect(both.some((r) => pointInRing(x, z, r))).toBe(true);
  });

  it('clipConvex garde la partie d\'un anneau située dans une fenêtre', () => {
    const l = [-30, -20, -30, 20, 30, 20, 30, 5, -10, 5, -10, -20];
    const c = clipConvex(l, rectOf(-40, 0, 40, 40));
    expect(c.length).toBe(1);
    expect(signedArea(c[0])).toBeCloseTo(20 * 5 + 60 * 15, 1);
  });

  it('segmentParts découpe un mur au droit des fenêtres', () => {
    const parts = segmentParts(0, 0, 100, 0, [rectOf(20, -5, 30, 5), rectOf(60, -5, 64, 5)]);
    expect(parts.map((p) => p.win)).toEqual([-1, 0, -1, 1, -1]);
    expect(parts[1].t0).toBeCloseTo(0.2, 6); expect(parts[1].t1).toBeCloseTo(0.3, 6);
    expect(segmentParts(0, 20, 100, 20, [rectOf(20, -5, 30, 5)])).toEqual([{ t0: 0, t1: 1, win: -1 }]);
  });

  it('un passage à trois arches laisse trois couloirs libres sous une voûte en surplomb', () => {
    const p = { x: 50, z: 10, width: 30, length: 12, rot: Math.PI / 2, height: 12, arches: 3, archWidth: 6, archHeight: 9 };
    expect(signedArea(passageWindow(p))).toBeCloseTo(30 * 12, 3);
    expect(passageArches(p).map((a) => a.x)).toEqual([-10, 0, 10]);
    const cols = passageColliders(p, 25);
    const piers = cols.filter((c) => c.baseY === 0), over = cols.filter((c) => c.baseY > 2.5);
    expect(piers.length).toBe(4); expect(over.length).toBe(1);
    // rot = π/2 : on traverse selon x ; la largeur du bloc s'étend selon z
    for (const dz of [-10, 0, 10]) expect(piers.some((c) => pointInRing(50, 10 + dz, c.ring))).toBe(false);
    for (const dz of [-14, -5, 5, 14]) expect(piers.some((c) => pointInRing(50, 10 + dz, c.ring))).toBe(true);
    expect(pointInRing(50, 10, over[0].ring)).toBe(true);
    expect(over[0].baseY).toBeGreaterThan(2.5);
    expect(orect(0, 0, 4, 2).length).toBe(8);
  });
});
