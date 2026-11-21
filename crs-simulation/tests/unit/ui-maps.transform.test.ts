import { describe, expect, it } from 'vitest';
import { MapTransform, NORTH_UP, formatDistance, niceScale } from '@/ui/maps/transform';

function view(up = NORTH_UP): MapTransform {
  const t = new MapTransform();
  t.setSize(800, 600);
  t.up = up;
  t.setMpp(2);
  t.setCenter(100, -50);
  return t;
}

describe('cartes — conversion écran ↔ monde', () => {
  it('nord en haut : le centre du monde est au centre de l\'écran, l\'est à droite, le sud en bas', () => {
    const t = view();
    const p = { x: 0, y: 0 };
    t.worldToScreen(100, -50, p);
    expect(p.x).toBeCloseTo(400, 9);
    expect(p.y).toBeCloseTo(300, 9);
    t.worldToScreen(120, -50, p); // 20 m à l'est
    expect(p.x).toBeCloseTo(410, 9);
    expect(p.y).toBeCloseTo(300, 9);
    t.worldToScreen(100, -30, p); // 20 m au sud (z croît vers le sud)
    expect(p.x).toBeCloseTo(400, 9);
    expect(p.y).toBeCloseTo(310, 9);
  });

  it('aller-retour exact pour toute orientation', () => {
    const p = { x: 0, y: 0 };
    const w = { x: 0, z: 0 };
    for (const up of [NORTH_UP, 0, 0.7, -1.9, Math.PI / 2, 2.6]) {
      const t = view(up);
      for (const [x, z] of [[100, -50], [-340.5, 77.25], [1200, 900], [99.9, -50.1]]) {
        t.worldToScreen(x!, z!, p);
        t.screenToWorld(p.x, p.y, w);
        expect(w.x).toBeCloseTo(x!, 6);
        expect(w.z).toBeCloseTo(z!, 6);
      }
    }
  });

  it('vue orientée : le cap affiché pointe vers le haut de l\'écran', () => {
    // cap est (π/2) vers le haut : un point à l'est du centre est au-dessus de lui
    const t = view(Math.PI / 2);
    const p = { x: 0, y: 0 };
    t.worldToScreen(130, -50, p);
    expect(p.x).toBeCloseTo(400, 6);
    expect(p.y).toBeCloseTo(285, 6);
    // et le sud (droite de quelqu'un qui regarde l'est) est à droite
    t.worldToScreen(100, -30, p);
    expect(p.x).toBeCloseTo(410, 6);
    expect(p.y).toBeCloseTo(300, 6);
    expect(t.headingToScreenAngle(Math.PI / 2)).toBeCloseTo(0, 9);
    expect(view().headingToScreenAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9); // nord en haut : l'est est à 90° horaire
  });

  it('zoomAt garde fixe le point du monde sous le pointeur', () => {
    const t = view();
    const before = { x: 0, z: 0 };
    const after = { x: 0, z: 0 };
    t.screenToWorld(620, 140, before);
    t.zoomAt(620, 140, 2.5);
    expect(t.mpp).toBeCloseTo(0.8, 9);
    t.screenToWorld(620, 140, after);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.z).toBeCloseTo(before.z, 6);
  });

  it('le zoom est borné', () => {
    const t = view();
    t.minMpp = 0.5;
    t.maxMpp = 4;
    t.zoomAt(400, 300, 100);
    expect(t.mpp).toBe(0.5);
    t.zoomAt(400, 300, 0.001);
    expect(t.mpp).toBe(4);
  });

  it('panByPixels : le contenu suit le glissement', () => {
    const t = view();
    const w = { x: 0, z: 0 };
    t.screenToWorld(200, 200, w);
    t.panByPixels(35, -20);
    const p = { x: 0, y: 0 };
    t.worldToScreen(w.x, w.z, p);
    expect(p.x).toBeCloseTo(235, 6);
    expect(p.y).toBeCloseTo(180, 6);
  });

  it('le centre reste dans l\'emprise autorisée', () => {
    const t = view();
    t.bounds = { minX: 0, minZ: -100, maxX: 200, maxZ: 100 };
    t.panByPixels(-5000, 0);
    expect(t.cx).toBe(200);
    t.setCenter(-999, 999);
    expect(t.cx).toBe(0);
    expect(t.cz).toBe(100);
  });

  it('fitBounds cadre un rectangle avec sa marge', () => {
    const t = view();
    t.fitBounds(0, 0, 400, 100, 50);
    expect(t.cx).toBe(200);
    expect(t.cz).toBe(50);
    // 400 m dans 700 px utiles, 100 m dans 500 px utiles : l'axe x contraint
    expect(t.mpp).toBeCloseTo(400 / 700, 9);
    const b = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
    t.visibleBounds(b);
    expect(b.minX).toBeLessThanOrEqual(0);
    expect(b.maxX).toBeGreaterThanOrEqual(400);
    expect(b.minZ).toBeLessThanOrEqual(0);
    expect(b.maxZ).toBeGreaterThanOrEqual(100);
  });

  it('contains', () => {
    const t = view();
    expect(t.contains(100, -50)).toBe(true);
    expect(t.contains(100 + 401 * 2, -50)).toBe(false);
    expect(t.contains(100 + 401 * 2, -50, 10)).toBe(true);
  });

  it('échelle graphique : longueurs rondes', () => {
    expect(niceScale(1, 90).meters).toBe(100);
    expect(niceScale(0.5, 90).meters).toBe(50);
    expect(niceScale(0.16, 90).meters).toBe(10);
    expect(niceScale(3, 90).meters).toBe(200);
    expect(niceScale(0.5, 90).px).toBeCloseTo(100, 9);
  });

  it('distances lisibles, avec espace insécable', () => {
    expect(formatDistance(42)).toBe('42 m');
    expect(formatDistance(153)).toBe('155 m');
    expect(formatDistance(1234)).toBe('1,2 km');
    expect(formatDistance(-1)).toBe('—');
  });
});
