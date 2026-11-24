import { describe, expect, it } from 'vitest';
import {
  TAU, angleDiff, approach, cardinalFr, circleVsCircle, circleVsObb, clamp, clamp01, clampLength2,
  closestPointOnSegment, compassBearing, cross2, damp, dampAngle, dampFactor, dist, dist3, distSq,
  distSqPointObb, distSqPointSegment, dot2, forwardX, forwardZ, headingOf, headingTo, invLerp, len, lerp,
  lerpAngle, localToWorldX, localToWorldZ, normalize2, pointInPolygon, pointOnPolyline, polygonArea,
  polylineLength, projectOnPolyline, remap, rightX, rightZ, segmentParam, segmentSegment, segmentVsCircle,
  segmentVsObb, smootherstep, smoothstep, turnToward, vehicleToWorldX, vehicleToWorldZ, worldToLocalX,
  worldToLocalZ, wrapAngle,
} from '@/core/math';

const PI = Math.PI;

describe('math — scalaires', () => {
  it('clamp, clamp01, lerp, invLerp, remap', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.2)).toBe(0);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(invLerp(10, 20, 12.5)).toBe(0.25);
    expect(invLerp(3, 3, 7)).toBe(0);
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
    expect(remap(50, 0, 10, 100, 200)).toBe(200);
  });

  it('smoothstep et smootherstep', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
    expect(smoothstep(2, 4, 2.5)).toBeCloseTo(0.15625, 12);
    expect(smoothstep(1, 1, 0.9)).toBe(0);
    expect(smoothstep(1, 1, 1)).toBe(1);
    expect(smootherstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
    expect(smootherstep(0, 1, 0.25)).toBeLessThan(smoothstep(0, 1, 0.25));
  });

  it('approach ne dépasse jamais la cible', () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(0, -10, 4)).toBe(-4);
    expect(approach(5, 5, 1)).toBe(5);
  });

  it('damp est indépendant du pas de temps', () => {
    const lambda = 6;
    const once = damp(0, 10, lambda, 0.1);
    let v = 0;
    for (let i = 0; i < 10; i++) v = damp(v, 10, lambda, 0.01);
    expect(v).toBeCloseTo(once, 10);
    let w = 0;
    for (let i = 0; i < 3; i++) w = damp(w, 10, lambda, 0.1 / 3);
    expect(w).toBeCloseTo(once, 10);
    expect(damp(0, 10, lambda, 0)).toBe(0);
    expect(damp(0, 10, lambda, 100)).toBeCloseTo(10, 9);
    expect(dampFactor(lambda, 0.1)).toBeCloseTo(once / 10, 12);
  });
});

describe('math — angles et caps', () => {
  it('wrapAngle ramène dans ]−π, π]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(PI)).toBeCloseTo(PI, 12);
    expect(wrapAngle(-PI)).toBeCloseTo(PI, 12);
    expect(wrapAngle(3 * PI)).toBeCloseTo(PI, 12);
    expect(wrapAngle(TAU + 0.3)).toBeCloseTo(0.3, 12);
    expect(wrapAngle(-TAU - 0.3)).toBeCloseTo(-0.3, 12);
    expect(wrapAngle(1.5 * PI)).toBeCloseTo(-0.5 * PI, 12);
    for (let a = -20; a <= 20; a += 0.37) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThan(-PI - 1e-12);
      expect(w).toBeLessThanOrEqual(PI);
      expect(Math.sin(w)).toBeCloseTo(Math.sin(a), 9);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 9);
    }
  });

  it('angleDiff prend le plus court chemin', () => {
    expect(angleDiff(0, 0.5)).toBeCloseTo(0.5, 12);
    expect(angleDiff(0.5, 0)).toBeCloseTo(-0.5, 12);
    expect(angleDiff(PI - 0.1, -PI + 0.1)).toBeCloseTo(0.2, 12);
    expect(angleDiff(-PI + 0.1, PI - 0.1)).toBeCloseTo(-0.2, 12);
  });

  it('turnToward tourne d\'au plus maxStep sans dépasser', () => {
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25, 12);
    expect(turnToward(0, 0.1, 0.25)).toBeCloseTo(0.1, 12);
    expect(turnToward(PI - 0.1, -PI + 0.1, 0.05)).toBeCloseTo(PI - 0.05, 12);
    expect(turnToward(PI - 0.02, -PI + 0.1, 0.05)).toBeCloseTo(-PI + 0.03, 12);
    let h = 3;
    for (let i = 0; i < 200; i++) h = turnToward(h, -2.5, 0.05);
    expect(h).toBeCloseTo(-2.5, 12);
  });

  it('lerpAngle et dampAngle traversent ±π', () => {
    expect(lerpAngle(PI - 0.2, -PI + 0.2, 0.5)).toBeCloseTo(PI, 9);
    const once = dampAngle(PI - 0.3, -PI + 0.3, 5, 0.2);
    let a = PI - 0.3;
    for (let i = 0; i < 20; i++) a = dampAngle(a, -PI + 0.3, 5, 0.01);
    expect(Math.sin(a)).toBeCloseTo(Math.sin(once), 9);
    expect(Math.cos(a)).toBeCloseTo(Math.cos(once), 9);
  });

  it('convention de cap du BRIEF : avant = (sin h, cos h), h = 0 regarde vers +z (sud)', () => {
    expect(forwardX(0)).toBeCloseTo(0, 12);
    expect(forwardZ(0)).toBeCloseTo(1, 12);
    expect(forwardX(PI / 2)).toBeCloseTo(1, 12); // est
    expect(forwardZ(PI / 2)).toBeCloseTo(0, 12);
    expect(headingOf(0, 1)).toBeCloseTo(0, 12); // sud
    expect(headingOf(1, 0)).toBeCloseTo(PI / 2, 12); // est
    expect(headingOf(0, -1)).toBeCloseTo(PI, 12); // nord
    expect(headingOf(-1, 0)).toBeCloseTo(-PI / 2, 12); // ouest
    expect(headingOf(0, 0)).toBe(0);
    expect(headingTo(2, 3, 2, 10)).toBeCloseTo(0, 12);
    for (let h = -3; h <= 3; h += 0.5) {
      expect(headingOf(forwardX(h), forwardZ(h))).toBeCloseTo(h, 10);
    }
  });

  it('droite d\'une personne : regard au sud → droite à l\'ouest', () => {
    expect(rightX(0)).toBeCloseTo(-1, 12);
    expect(rightZ(0)).toBeCloseTo(0, 12);
    expect(rightX(PI / 2)).toBeCloseTo(0, 12); // regard à l'est → droite au sud
    expect(rightZ(PI / 2)).toBeCloseTo(1, 12);
    for (let h = -3; h <= 3; h += 0.7) {
      // droite ⟂ avant, et (avant, haut, droite) cohérents : avant × haut = droite en repère direct
      expect(dot2(forwardX(h), forwardZ(h), rightX(h), rightZ(h))).toBeCloseTo(0, 12);
      expect(cross2(forwardX(h), forwardZ(h), rightX(h), rightZ(h))).toBeCloseTo(1, 12);
    }
  });

  it('relèvement et points cardinaux', () => {
    expect(compassBearing(PI)).toBeCloseTo(0, 9); // nord
    expect(compassBearing(PI / 2)).toBeCloseTo(90, 9); // est
    expect(compassBearing(0)).toBeCloseTo(180, 9); // sud
    expect(compassBearing(-PI / 2)).toBeCloseTo(270, 9); // ouest
    expect(cardinalFr(PI)).toBe('nord');
    expect(cardinalFr(0)).toBe('sud');
    expect(cardinalFr(PI / 2)).toBe('est');
    expect(cardinalFr(-PI / 2)).toBe('ouest');
    expect(cardinalFr(PI / 4)).toBe('sud-est');
    expect(cardinalFr(-3 * PI / 4)).toBe('nord-ouest');
  });

  it('repères locaux : aller-retour et convention Three.js (rotation.y = cap)', () => {
    const h = 0.8;
    // l'axe +z local est l'avant
    expect(localToWorldX(0, 1, h)).toBeCloseTo(forwardX(h), 12);
    expect(localToWorldZ(0, 1, h)).toBeCloseTo(forwardZ(h), 12);
    // l'axe +x local est la GAUCHE (opposé de la droite)
    expect(localToWorldX(1, 0, h)).toBeCloseTo(-rightX(h), 12);
    expect(localToWorldZ(1, 0, h)).toBeCloseTo(-rightZ(h), 12);
    const wx = localToWorldX(1.5, -2, h);
    const wz = localToWorldZ(1.5, -2, h);
    expect(worldToLocalX(wx, wz, h)).toBeCloseTo(1.5, 12);
    expect(worldToLocalZ(wx, wz, h)).toBeCloseTo(-2, 12);
    // repère véhicule du contrat : x = droite, z = avant
    expect(vehicleToWorldX(1, 0, h)).toBeCloseTo(rightX(h), 12);
    expect(vehicleToWorldZ(1, 0, h)).toBeCloseTo(rightZ(h), 12);
    expect(vehicleToWorldX(0, 1, h)).toBeCloseTo(forwardX(h), 12);
    expect(vehicleToWorldZ(0, 1, h)).toBeCloseTo(forwardZ(h), 12);
  });
});

describe('math — distances, segments, polygones', () => {
  it('distances et vecteurs', () => {
    expect(dist(0, 0, 3, 4)).toBe(5);
    expect(distSq(1, 1, 4, 5)).toBe(25);
    expect(dist3(0, 0, 0, 1, 2, 2)).toBe(3);
    expect(len(-3, 4)).toBe(5);
    const v = { x: 3, z: 4 };
    expect(normalize2(v)).toBe(5);
    expect(v.x).toBeCloseTo(0.6, 12);
    expect(v.z).toBeCloseTo(0.8, 12);
    const zero = { x: 0, z: 0 };
    expect(normalize2(zero)).toBe(0);
    expect(zero).toEqual({ x: 0, z: 0 });
    const w = { x: 6, z: 8 };
    expect(clampLength2(w, 5)).toBe(5);
    expect(w.x).toBeCloseTo(3, 12);
    expect(w.z).toBeCloseTo(4, 12);
    expect(clampLength2(w, 50)).toBeCloseTo(5, 12);
  });

  it('point le plus proche sur un segment', () => {
    const out = { x: 0, z: 0 };
    expect(closestPointOnSegment(5, 3, 0, 0, 10, 0, out)).toBeCloseTo(0.5, 12);
    expect(out).toEqual({ x: 5, z: 0 });
    expect(closestPointOnSegment(-4, 3, 0, 0, 10, 0, out)).toBe(0);
    expect(out).toEqual({ x: 0, z: 0 });
    expect(closestPointOnSegment(40, 3, 0, 0, 10, 0, out)).toBe(1);
    expect(out).toEqual({ x: 10, z: 0 });
    expect(distSqPointSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(9, 12);
    expect(distSqPointSegment(-3, 4, 0, 0, 10, 0)).toBeCloseTo(25, 12);
    // segment dégénéré
    expect(segmentParam(1, 1, 2, 2, 2, 2)).toBe(0);
    expect(distSqPointSegment(5, 6, 2, 2, 2, 2)).toBeCloseTo(25, 12);
  });

  it('point dans un polygone sur tableau plat', () => {
    const square = [0, 0, 10, 0, 10, 10, 0, 10];
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(-1, 5, square)).toBe(false);
    expect(pointInPolygon(5, 11, square)).toBe(false);
    // sens de parcours inversé
    const reversed = [0, 10, 10, 10, 10, 0, 0, 0];
    expect(pointInPolygon(5, 5, reversed)).toBe(true);
    // polygone concave en « L »
    const ell = [0, 0, 10, 0, 10, 4, 4, 4, 4, 10, 0, 10];
    expect(pointInPolygon(2, 8, ell)).toBe(true);
    expect(pointInPolygon(8, 2, ell)).toBe(true);
    expect(pointInPolygon(8, 8, ell)).toBe(false);
    // sous-partie d'un tableau (count, offset) et tableau typé
    const packed = new Float32Array([99, 99, 0, 0, 10, 0, 10, 10, 0, 10, 77, 77]);
    expect(pointInPolygon(5, 5, packed, 4, 2)).toBe(true);
    expect(pointInPolygon(20, 5, packed, 4, 2)).toBe(false);
    expect(Math.abs(polygonArea(square))).toBe(100);
    expect(Math.abs(polygonArea(ell))).toBe(64);
    expect(polygonArea(square)).toBe(-polygonArea(reversed));
  });

  it('polylignes plates', () => {
    const line = [0, 0, 10, 0, 10, 10];
    expect(polylineLength(line)).toBe(20);
    const out = { x: 0, z: 0 };
    let h = pointOnPolyline(line, 5, out);
    expect(out).toEqual({ x: 5, z: 0 });
    expect(h).toBeCloseTo(Math.PI / 2, 12); // vers l'est
    h = pointOnPolyline(line, 15, out);
    expect(out).toEqual({ x: 10, z: 5 });
    expect(h).toBeCloseTo(0, 12); // vers le sud
    pointOnPolyline(line, 500, out);
    expect(out).toEqual({ x: 10, z: 10 });
    pointOnPolyline(line, -3, out);
    expect(out).toEqual({ x: 0, z: 0 });
    expect(projectOnPolyline(4, 3, line, out)).toBeCloseTo(4, 12);
    expect(out).toEqual({ x: 4, z: 0 });
    expect(projectOnPolyline(13, 6, line, out)).toBeCloseTo(16, 12);
    expect(out).toEqual({ x: 10, z: 6 });
    expect(polylineLength([])).toBe(0);
    expect(pointOnPolyline([7, 8], 3, out)).toBe(0);
    expect(out).toEqual({ x: 7, z: 8 });
  });
});

describe('math — collisions', () => {
  it('disque contre disque', () => {
    const out = { x: 0, z: 0 };
    expect(circleVsCircle(0, 0, 1, 3, 0, 1, out)).toBe(false);
    expect(circleVsCircle(0, 0, 1, 1.5, 0, 1, out)).toBe(true);
    expect(out.x).toBeCloseTo(-0.5, 12);
    expect(out.z).toBeCloseTo(0, 12);
    expect(circleVsCircle(2, 2, 1, 2, 2, 1, out)).toBe(true);
    expect(len(out.x, out.z)).toBeCloseTo(2, 12);
  });

  it('disque contre boîte alignée : vecteur de sortie minimal', () => {
    const out = { x: 9, z: 9 };
    // boîte 4 × 2 centrée à l'origine (halfX = 2, halfZ = 1)
    expect(circleVsObb(5, 0, 0.5, 0, 0, 2, 1, 0, out)).toBe(false);
    expect(out).toEqual({ x: 0, z: 0 });
    expect(circleVsObb(2.3, 0, 0.5, 0, 0, 2, 1, 0, out)).toBe(true);
    expect(out.x).toBeCloseTo(0.2, 12);
    expect(out.z).toBeCloseTo(0, 12);
    // coin : sortie le long de la diagonale
    expect(circleVsObb(2.3, 1.3, 0.5, 0, 0, 2, 1, 0, out)).toBe(true);
    expect(out.x).toBeCloseTo(out.z, 12);
    expect(len(2.3 + out.x - 2, 1.3 + out.z - 1)).toBeCloseTo(0.5, 12);
    // centre à l'intérieur : sortie par la face la plus proche
    expect(circleVsObb(1.5, 0.2, 0.5, 0, 0, 2, 1, 0, out)).toBe(true);
    expect(out.x).toBeCloseTo(1, 12); // 0,5 jusqu'à la face + 0,5 de rayon
    expect(out.z).toBeCloseTo(0, 12);
    expect(circleVsObb(0.1, -0.8, 0.3, 0, 0, 2, 1, 0, out)).toBe(true);
    expect(out.x).toBeCloseTo(0, 12);
    expect(out.z).toBeCloseTo(-0.5, 12);
  });

  it('disque contre boîte orientée : après la sortie, le disque est tangent', () => {
    const out = { x: 0, z: 0 };
    for (const heading of [0.3, 1.1, -2.2, Math.PI / 2, 2.9]) {
      for (let k = 0; k < 40; k++) {
        const a = k * 0.61;
        const px = 4 + Math.cos(a) * 2.2;
        const pz = -3 + Math.sin(a) * 2.2;
        const r = 0.4;
        const d2 = distSqPointObb(px, pz, 4, -3, 2.5, 0.9, heading);
        const hit = circleVsObb(px, pz, r, 4, -3, 2.5, 0.9, heading, out);
        expect(hit).toBe(d2 < r * r - 1e-12);
        if (hit) {
          const after = Math.sqrt(distSqPointObb(px + out.x, pz + out.z, 4, -3, 2.5, 0.9, heading));
          expect(after).toBeCloseTo(r, 9);
        }
      }
    }
    // boîte tournée d'un quart de tour : halfX s'étend alors le long de z
    expect(distSqPointObb(0, 3, 0, 0, 2, 1, Math.PI / 2)).toBeCloseTo(1, 12);
    expect(distSqPointObb(3, 0, 0, 0, 2, 1, Math.PI / 2)).toBeCloseTo(4, 12);
    expect(distSqPointObb(0.2, 0.3, 0, 0, 2, 1, 0.7)).toBe(0);
  });

  it('intersection segment-segment', () => {
    const out = { t: 0, u: 0, x: 0, z: 0 };
    expect(segmentSegment(0, 0, 10, 0, 5, -5, 5, 5, out)).toBe(true);
    expect(out).toEqual({ t: 0.5, u: 0.5, x: 5, z: 0 });
    expect(segmentSegment(0, 0, 10, 0, 2, -1, 2, 3, out)).toBe(true);
    expect(out.t).toBeCloseTo(0.2, 12);
    expect(out.u).toBeCloseTo(0.25, 12);
    expect(segmentSegment(0, 0, 10, 0, 5, 1, 5, 5)).toBe(false); // trop court
    expect(segmentSegment(0, 0, 10, 0, 0, 1, 10, 1)).toBe(false); // parallèles
    expect(segmentSegment(0, 0, 10, 0, 2, 0, 8, 0)).toBe(false); // colinéaires
    expect(segmentSegment(0, 0, 10, 10, 10, 0, 0, 10, out)).toBe(true);
    expect(out.x).toBeCloseTo(5, 12);
    expect(out.z).toBeCloseTo(5, 12);
    // extrémités incluses
    expect(segmentSegment(0, 0, 10, 0, 10, 0, 10, 5)).toBe(true);
  });

  it('segment contre disque', () => {
    const out = { t: 0, nx: 0, nz: 0 };
    expect(segmentVsCircle(-10, 0, 10, 0, 0, 0, 2, out)).toBe(true);
    expect(out.t).toBeCloseTo(0.4, 12);
    expect(out.nx).toBeCloseTo(-1, 12);
    expect(out.nz).toBeCloseTo(0, 12);
    expect(segmentVsCircle(-10, 3, 10, 3, 0, 0, 2, out)).toBe(false);
    expect(segmentVsCircle(-10, 0, -5, 0, 0, 0, 2, out)).toBe(false); // s'arrête avant
    expect(segmentVsCircle(5, 0, 10, 0, 0, 0, 2, out)).toBe(false); // s'éloigne
    expect(segmentVsCircle(1, 0, 10, 0, 0, 0, 2, out)).toBe(true); // départ à l'intérieur
    expect(out.t).toBe(0);
    expect(out.nx).toBeCloseTo(1, 12);
  });

  it('segment contre boîte orientée', () => {
    const out = { t: 0, nx: 0, nz: 0 };
    // boîte alignée 4 × 2
    expect(segmentVsObb(-10, 0, 10, 0, 0, 0, 2, 1, 0, out)).toBe(true);
    expect(out.t).toBeCloseTo(0.4, 12);
    expect(out.nx).toBeCloseTo(-1, 12);
    expect(out.nz).toBeCloseTo(0, 12);
    expect(segmentVsObb(0, 10, 0, -10, 0, 0, 2, 1, 0, out)).toBe(true);
    expect(out.t).toBeCloseTo(0.45, 12);
    expect(out.nx).toBeCloseTo(0, 12);
    expect(out.nz).toBeCloseTo(1, 12);
    expect(segmentVsObb(-10, 2, 10, 2, 0, 0, 2, 1, 0, out)).toBe(false); // passe à côté
    expect(segmentVsObb(-10, 0, -3, 0, 0, 0, 2, 1, 0, out)).toBe(false); // trop court
    // départ à l'intérieur
    expect(segmentVsObb(0.5, 0, 10, 0, 0, 0, 2, 1, 0, out)).toBe(true);
    expect(out.t).toBe(0);
    expect(out.nx).toBeCloseTo(-1, 12);
    // boîte tournée d'un quart de tour : elle s'étend de ±2 le long de z
    expect(segmentVsObb(0, -10, 0, 10, 0, 0, 2, 1, Math.PI / 2, out)).toBe(true);
    expect(out.t).toBeCloseTo(0.4, 12);
    expect(out.nx).toBeCloseTo(0, 9);
    expect(out.nz).toBeCloseTo(-1, 9);
    // boîte à 45° : le rayon horizontal touche le coin
    expect(segmentVsObb(-10, 0, 10, 0, 0, 0, 1, 1, Math.PI / 4, out)).toBe(true);
    expect(-10 + 20 * out.t).toBeCloseTo(-Math.SQRT2, 9);
    // cohérence avec la distance point-boîte : le point d'entrée est sur le bord
    for (const heading of [0.4, 1.3, -0.9]) {
      const hit = segmentVsObb(-8, -5, 7, 6, 1, 0.5, 2, 0.7, heading, out);
      expect(hit).toBe(true);
      const x = -8 + 15 * out.t;
      const z = -5 + 11 * out.t;
      expect(distSqPointObb(x, z, 1, 0.5, 2, 0.7, heading)).toBeLessThan(1e-18);
      expect(distSqPointObb(x + out.nx * 0.01, z + out.nz * 0.01, 1, 0.5, 2, 0.7, heading)).toBeCloseTo(1e-4, 9);
      expect(len(out.nx, out.nz)).toBeCloseTo(1, 12);
    }
  });
});
