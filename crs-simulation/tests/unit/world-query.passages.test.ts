// Cohérence entre le graphe et les obstacles (porches, brèches, ponts) et obstacles des monuments.
import { beforeAll, describe, expect, it } from 'vitest';
import type { RayHit, Vec2 } from '@/core/contracts';
import type { RawMapData } from '@/world/mapdata';
import { generateTestDistrict } from '@/world/testDistrict';
import { MemoryMapSource, createWorldQuery } from '@/world/query';
import type { ColliderSite, GetColliders, WorldQueryImpl } from '@/world/query';
import { MINI_MAP, miniMapRaw } from '@/world/query/testkit';

const R = 0.3;

function makeHit(): RayHit {
  return { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
}

function walk(w: WorldQueryImpl, pos: Vec2, dx: number, dz: number, steps: number): void {
  for (let i = 0; i < steps; i++) {
    pos.x += dx;
    pos.z += dz;
    w.resolveCircle(pos, R);
    if (w.isSolidAt(pos.x, pos.z)) throw new Error(`dans un obstacle en (${pos.x.toFixed(2)} ; ${pos.z.toFixed(2)})`);
  }
}

describe('monde : le graphe fait foi pour le passage (mini-carte)', () => {
  let w: WorldQueryImpl;
  const p = MINI_MAP;

  beforeAll(async () => {
    w = createWorldQuery({ source: 'paris', parisSource: new MemoryMapSource(miniMapRaw()) });
    await w.boot();
    w.setFocus(256, 256);
    await w.whenLoaded(256, 256, 400);
  });

  it('porche : une rue passe sous un immeuble', () => {
    const half = p.porch.roadWidth / 2;
    // Le long de l'axe de la rue, d'un côté à l'autre de l'immeuble.
    const pos = { x: p.porch.roadX, z: 180 };
    walk(w, pos, 0, 0.2, 200);
    expect(pos.z).toBeCloseTo(220, 6);
    expect(pos.x).toBeCloseTo(p.porch.roadX, 6);
    // Sous le porche, les murs latéraux tiennent ; l'immeuble reste plein de part et d'autre.
    const side = { x: p.porch.roadX, z: 206 };
    walk(w, side, 0.1, 0, 60);
    expect(side.x).toBeCloseTo(p.porch.roadX + half - R, 2);
    expect(w.isSolidAt(p.porch.roadX, 206)).toBe(false);
    expect(w.isSolidAt(p.porch.roadX + half - 0.2, 206)).toBe(false);
    expect(w.isSolidAt(p.porch.roadX + half + 0.2, 206)).toBe(true);
    expect(w.isSolidAt(110, 206)).toBe(true);
    // La façade n'est ouverte qu'à la largeur de la chaussée.
    const facade = { x: p.porch.roadX + half + 1, z: 195 };
    walk(w, facade, 0, 0.1, 100);
    expect(facade.z).toBeCloseTo(p.porch.minZ - R, 2);
    // La grille de surfaces suit : chaussée sous le porche, bâtiment autour.
    expect(w.surfaceAt(p.porch.roadX, 206)).toBe('road');
    expect(w.buildingHeightAt(p.porch.roadX, 206)).toBe(0);
    expect(w.surfaceAt(110, 206)).toBe('building');
    expect(w.buildingHeightAt(110, 206)).toBeCloseTo(15, 5);
    // On voit à travers le porche, pas à travers l'immeuble.
    expect(w.lineOfSight(p.porch.roadX, 190, p.porch.roadX, 220)).toBe(true);
    expect(w.lineOfSight(110, 190, 110, 220)).toBe(false);
    const hit = makeHit();
    expect(w.raycast(p.porch.roadX - 1, 206, p.porch.roadX + 20, 206, hit)).toBe(true);
    expect(hit.kind).toBe('building');
    expect(hit.x).toBeCloseTo(p.porch.roadX + half, 2);
    expect(hit.nx).toBeCloseTo(-1, 5);
  });

  it('un souterrain ne perce pas l\'immeuble qu\'il traverse', () => {
    expect(w.isSolidAt(p.tunnel.roadX, 206)).toBe(true);
    const pos = { x: p.tunnel.roadX, z: 190 };
    walk(w, pos, 0, 0.2, 100);
    expect(pos.z).toBeCloseTo(p.tunnel.minZ - R, 2);
    expect(w.surfaceAt(p.tunnel.roadX, 206)).toBe('building');
    expect(w.surfaceAt(p.tunnel.roadX, 180)).toBe('sidewalk'); // pas de chaussée en surface
    // Les itinéraires n'empruntent pas le souterrain : de (320 ; 150) à (320 ; 260), on fait le tour.
    const path: number[] = [];
    expect(w.findPath(320, 150, 320, 260, 'vehicle', path)).toBe(true);
    let length = 0;
    for (let i = 2; i + 1 < path.length; i += 2) length += Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
    expect(length).toBeGreaterThan(450); // 200 + 110 + 200 par les rues, contre 110 par le souterrain
  });

  it('un mur est ouvert là où une rue le traverse', () => {
    const pos = { x: p.porch.roadX, z: 220 };
    walk(w, pos, 0, 0.2, 100);
    expect(pos.z).toBeCloseTo(240, 6); // la rue passe
    const beside = { x: p.porch.roadX + 6, z: 222 };
    walk(w, beside, 0, 0.2, 100);
    expect(beside.z).toBeLessThan(p.wallZ - R); // le mur tient à côté
    const hit = makeHit();
    expect(w.raycast(80, 225, 80, 235, hit)).toBe(true);
    expect(hit.kind).toBe('barrier');
    expect(hit.height).toBeCloseTo(2.5, 5);
    expect(w.raycast(p.porch.roadX + 2, 225, p.porch.roadX + 2, 235, hit)).toBe(false);
    expect(w.lineOfSight(80, 225, 80, 235)).toBe(false); // mur plein de 2,5 m
  });

  it('une allée traverse un bassin ; le reste de l\'eau est infranchissable', () => {
    const pos = { x: p.pond.pathX, z: 290 };
    walk(w, pos, 0, 0.2, 300);
    expect(pos.z).toBeCloseTo(350, 6);
    expect(w.isSolidAt(p.pond.pathX, 320)).toBe(false);
    expect(w.isSolidAt(p.pond.pathX + 5, 320)).toBe(true);
    const side = { x: p.pond.pathX, z: 320 };
    walk(w, side, 0.05, 0, 60);
    expect(side.x).toBeLessThan(p.pond.pathX + 1.25); // demi-largeur minimale d'un passage : 1,25 m
    const blocked = { x: 210, z: 295 };
    walk(w, blocked, 0, 0.1, 100);
    expect(blocked.z).toBeLessThan(p.pond.minZ);
  });

  it('pont : le mur de quai continu est ouvert au droit du tablier, des parapets sont générés', () => {
    const r = p.river;
    // Trois files sur le pont : axe, trottoir gauche, trottoir droit.
    for (const dx of [0, -4, 4]) {
      const pos = { x: r.bridgeX + dx, z: 385 };
      walk(w, pos, 0, 0.25, 360);
      expect(pos.z).toBeCloseTo(475, 6);
      expect(pos.x).toBeCloseTo(r.bridgeX + dx, 6);
    }
    // À côté du pont : le mur de quai arrête.
    const quay = { x: r.bridgeX + 20, z: 390 };
    walk(w, quay, 0, 0.2, 100);
    expect(quay.z).toBeLessThan(r.north - R);
    // Sur le pont, on ne passe pas par-dessus bord : parapets générés (la carte n'en fournit pas).
    const rail = { x: r.bridgeX, z: 430 };
    walk(w, rail, 0.1, 0, 100);
    expect(rail.x).toBeCloseTo(r.bridgeX + r.halfDeck - R, 2);
    expect(w.isSolidAt(r.bridgeX + r.halfDeck - 0.2, 430)).toBe(false);
    expect(w.isSolidAt(r.bridgeX + r.halfDeck + 0.2, 430)).toBe(true);
    // Les parapets et les berges n'arrêtent pas le regard ; un rayon donne leur faible hauteur.
    expect(w.lineOfSight(r.bridgeX, 430, 300, 430)).toBe(true);
    const hit = makeHit();
    expect(w.raycast(r.bridgeX, 430, r.bridgeX + 20, 430, hit)).toBe(true);
    expect(hit.kind).toBe('barrier');
    expect(hit.x).toBeCloseTo(r.bridgeX + r.halfDeck, 2);
    expect(hit.height).toBeLessThanOrEqual(1);
    expect(w.sectorName(r.bridgeX, 430)).toBe('pont Neuf Fictif');
  });
});

describe('monde : obstacles des monuments', () => {
  // Quatre piliers de 2 m aux coins d'un carré de 8 m, et un linteau en hauteur sous lequel on passe.
  const pillars: GetColliders = (key: string, site: ColliderSite) => {
    if (key !== 'monument_essai') return null;
    expect(site.height).toBe(32);
    expect(site.footprint.length).toBe(16);
    const out = [];
    for (const [cx, cz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
      out.push({ ring: [cx - 1, cz - 1, cx - 1, cz + 1, cx + 1, cz + 1, cx + 1, cz - 1], height: 20, baseY: 0 });
    }
    out.push({ ring: [-5, -5, -5, 5, 5, 5, 5, -5], height: 4, baseY: 20 });
    return out;
  };

  async function load(colliders: GetColliders | null, raw?: RawMapData): Promise<WorldQueryImpl> {
    const w = createWorldQuery(raw ? { source: 'paris', parisSource: new MemoryMapSource(raw), colliders } : { source: 'test', colliders });
    await w.boot();
    w.setFocus(0, 0);
    await w.whenLoaded(0, 0, 300);
    return w;
  }

  it('sans getColliders : l\'emprise ordinaire du bâtiment fait obstacle', async () => {
    const w = await load(null);
    expect(w.isSolidAt(0, 0)).toBe(true);
    expect(w.surfaceAt(0, 0)).toBe('building');
    expect(w.buildingHeightAt(0, 0)).toBeCloseTo(32, 5);
    const pos = { x: 0, z: -12 };
    walk(w, pos, 0, 0.1, 100);
    expect(pos.z).toBeLessThan(-5);
  });

  it('avec getColliders : les piliers remplacent l\'emprise, on passe entre eux et sous le linteau', async () => {
    const w = await load(pillars);
    expect(w.isSolidAt(0, 0)).toBe(false);
    expect(w.isSolidAt(4, 4)).toBe(true);
    expect(w.isSolidAt(-4, 4)).toBe(true);
    expect(w.isSolidAt(4, 0)).toBe(false);
    const through = { x: 0, z: -12 };
    walk(w, through, 0, 0.1, 240);
    expect(through.z).toBeCloseTo(12, 6);
    const blocked = { x: 4, z: -12 };
    walk(w, blocked, 0, 0.1, 100);
    expect(blocked.z).toBeCloseTo(-5 - R, 2);
    expect(w.surfaceAt(0, 0)).toBe('plaza');
    expect(w.buildingHeightAt(0, 0)).toBe(0);
    expect(w.surfaceAt(4.2, 4.2)).toBe('building');
    expect(w.buildingHeightAt(4.2, 4.2)).toBeCloseTo(20, 5);
    const hit = makeHit();
    expect(w.raycast(4, -12, 4, 12, hit)).toBe(true);
    expect(hit.kind).toBe('building');
    expect(hit.z).toBeCloseTo(-5, 3);
    expect(hit.height).toBeCloseTo(20, 5);
    expect(w.raycast(0, -12, 0, 12, hit)).toBe(false);
    expect(w.lineOfSight(0, -12, 0, 12)).toBe(true);
    expect(w.lineOfSight(4, -12, 4, 12)).toBe(false);
    // Les obstacles des monuments sont permanents : présents même tuile déchargée.
    w.setFocus(9000, 9000);
    expect(w.stats().tilesLoaded).toBe(0);
    expect(w.isSolidAt(4, 4)).toBe(true);
    expect(w.isSolidAt(100, -25)).toBe(false);
  });

  it('les obstacles suivent le cap du monument', async () => {
    // Même quartier, monument tourné d'un quart de tour (cap 90°) : le repère local tourne avec lui.
    const raw = structuredClone(generateTestDistrict());
    raw.landmarks.a = [900];
    const single: GetColliders = (key) => (key === 'monument_essai' ? [{ ring: [3, -1, 3, 1, 5, 1, 5, -1], height: 10, baseY: 0 }] : null);
    const w = await load(single, raw);
    // Local (4 ; 0) → monde : x = 4·cos 90° = 0 ; z = -4·sin 90° = -4.
    expect(w.isSolidAt(0, -4)).toBe(true);
    expect(w.isSolidAt(4, 0)).toBe(false);
    expect(w.isSolidAt(0, 4)).toBe(false);
  });

  it('un monument sans obstacle connu garde son emprise', async () => {
    const none: GetColliders = () => [];
    const w = await load(none);
    expect(w.isSolidAt(0, 0)).toBe(true);
    const failing: GetColliders = () => {
      throw new Error('modèle absent');
    };
    const error = console.error;
    console.error = () => {};
    try {
      const w2 = await load(failing);
      expect(w2.isSolidAt(0, 0)).toBe(true);
    } finally {
      console.error = error;
    }
  });
});
