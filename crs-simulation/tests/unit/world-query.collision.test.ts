// Collisions avec le décor statique, sur le quartier d'essai (voir src/world/testDistrict.ts pour le plan).
import { beforeAll, describe, expect, it } from 'vitest';
import type { RayHit, Vec2 } from '@/core/contracts';
import { createWorldQuery } from '@/world/query';
import type { WorldQueryImpl } from '@/world/query';

const R = 0.3;
let w: WorldQueryImpl;

function makeHit(): RayHit {
  return { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };
}

/** Marche de `steps` pas de (dx, dz) en résolvant les collisions ; vérifie qu'on n'est jamais dans un obstacle. */
function walk(pos: Vec2, dx: number, dz: number, steps: number, radius = R): void {
  for (let i = 0; i < steps; i++) {
    pos.x += dx;
    pos.z += dz;
    w.resolveCircle(pos, radius);
    if (w.isSolidAt(pos.x, pos.z)) throw new Error(`dans un obstacle en (${pos.x.toFixed(2)} ; ${pos.z.toFixed(2)}) au pas ${i}`);
  }
}

beforeAll(async () => {
  w = createWorldQuery({ source: 'test' });
  await w.boot();
  w.setFocus(0, 0);
  await w.whenLoaded(0, 0, 800);
});

describe('monde : collisions (quartier d\'essai)', () => {
  it('charge les quatre tuiles et leurs obstacles', () => {
    const s = w.stats();
    expect(s.source).toBe('test-district');
    expect(s.tilesLoaded).toBe(4);
    expect(s.segments).toBeGreaterThan(4000);
    expect(s.solids).toBeGreaterThan(1200);
  });

  it("on n'entre pas dans un immeuble", () => {
    // Trottoir nord de l'avenue : la façade est en z = -20.
    const pos = { x: 100, z: -18 };
    walk(pos, 0, -0.2, 100);
    expect(pos.z).toBeGreaterThan(-20 + R - 1e-6);
    expect(pos.z).toBeLessThan(-20 + R + 0.01);
    expect(pos.x).toBeCloseTo(100, 6);
    expect(w.surfaceAt(100, -25)).toBe('building');
    expect(w.isSolidAt(100, -25)).toBe(true);
    expect(w.isFree(100, -25, R)).toBe(false);
    expect(w.isFree(100, -19.8, R)).toBe(false); // le disque mord sur la façade
    expect(w.isFree(100, -18, R)).toBe(true);
  });

  it('on glisse le long d\'un mur', () => {
    const pos = { x: 100, z: -19.5 };
    walk(pos, 0.1, -0.1, 200); // en biais vers la façade
    expect(pos.z).toBeCloseTo(-20 + R, 2);
    expect(pos.x).toBeGreaterThan(100 + 19.9); // toute la composante parallèle est conservée
    // Immobile contre le mur : aucun contact signalé, aucune dérive.
    const before = { x: pos.x, z: pos.z };
    expect(w.resolveCircle(pos, R)).toBe(false);
    expect(pos).toEqual(before);
  });

  it('on contourne un coin sans à-coup ni traversée', () => {
    // Angle de l'îlot à l'intersection de l'avenue (façade z = -20) et de la rue des Peupliers (façade x = 165).
    const pos = { x: 150, z: -19.6 };
    let prevX = pos.x, prevZ = pos.z, maxJump = 0;
    for (let i = 0; i < 400; i++) {
      pos.x += 0.08;
      pos.z -= 0.08;
      w.resolveCircle(pos, R);
      expect(w.isSolidAt(pos.x, pos.z)).toBe(false);
      maxJump = Math.max(maxJump, Math.hypot(pos.x - prevX, pos.z - prevZ));
      prevX = pos.x;
      prevZ = pos.z;
    }
    expect(maxJump).toBeLessThan(0.2); // jamais plus que le pas demandé (0,113 m) et sa marge
    expect(pos.x).toBeGreaterThan(165); // le coin est passé…
    expect(pos.z).toBeLessThan(-30); // … et l'on remonte la rue
  });

  it('coin rentrant : le disque est tenu par les deux murs', () => {
    // Cour de la mairie : angle intérieur nord-ouest de la cour (anneau horaire, murs vers la cour).
    const pos = { x: 234.5, z: -225.5 }; // centre de la cour
    walk(pos, -0.15, -0.15, 400);
    const corner = { x: pos.x, z: pos.z };
    walk(pos, -0.15, -0.15, 20);
    expect(pos.x).toBeCloseTo(corner.x, 2);
    expect(pos.z).toBeCloseTo(corner.z, 2);
    expect(w.surfaceAt(pos.x, pos.z)).toBe('plaza');
    expect(w.surfaceAt(pos.x - 1.5, pos.z)).toBe('building');
    expect(w.surfaceAt(pos.x, pos.z - 1.5)).toBe('building');
  });

  it('pas de traversée à grande vitesse', () => {
    // Un pas de 6 m dans le bâtiment (13 m de profondeur) : retour sur la façade d'entrée.
    const pos = { x: 100, z: -24 };
    expect(w.resolveCircle(pos, R)).toBe(true);
    expect(pos.z).toBeCloseTo(-20 + R, 2);
    expect(pos.x).toBeCloseTo(100, 2);
    // Déplacement balayé à travers tout l'immeuble (42 m d'un coup) : arrêté à la façade.
    const fast = { x: 100, z: -60 };
    expect(w.sweepCircle(100, -18, fast, R)).toBe(true);
    expect(fast.z).toBeCloseTo(-20 + R, 2);
    // Sprint à 9 m/s par pas de 0,05 s contre la grille du square (z = 20,5) : elle tient.
    const runner = { x: -260, z: 15 };
    walk(runner, 0, 0.45, 60);
    expect(runner.z).toBeLessThan(20.5);
  });

  it('on ne tombe pas dans le fleuve', () => {
    // Quai nord : le mur de quai est en z = 300.
    const pos = { x: 100, z: 296 };
    walk(pos, 0, 0.2, 80);
    expect(pos.z).toBeLessThan(300 - R);
    expect(pos.z).toBeGreaterThan(300 - R - 0.25);
    expect(w.isSolidAt(100, 360)).toBe(true); // l'eau est un obstacle plein
    expect(w.isFree(100, 360, R)).toBe(false);
    // Projeté dans l'eau : ramené sur la berge la plus proche.
    const wet = { x: 100, z: 308 };
    expect(w.resolveCircle(wet, R)).toBe(true);
    expect(wet.z).toBeLessThan(300 - R);
    expect(wet.x).toBeCloseTo(100, 1);
  });

  it('on traverse le fleuve par le pont, entre ses garde-corps', () => {
    expect(w.isSolidAt(0, 360)).toBe(false);
    expect(w.isSolidAt(-5, 360)).toBe(false); // trottoir ouest du pont (autre tuile que l'axe)
    expect(w.isSolidAt(5, 360)).toBe(false);
    expect(w.isFree(0, 360, R)).toBe(true);
    for (const x of [0, -5, 5]) {
      const pos = { x, z: 280 };
      walk(pos, 0, 0.25, 640);
      expect(pos.z).toBeCloseTo(440, 6);
      expect(pos.x).toBeCloseTo(x, 6);
    }
    // En travers du pont : libre d'un trottoir à l'autre (la limite de tuile x = 0 n'est pas une berge)…
    const across = { x: -5, z: 360 };
    walk(across, 0.2, 0, 50);
    expect(across.x).toBeCloseTo(5, 6);
    // … puis arrêté par le garde-corps (x = 7).
    walk(across, 0.2, 0, 50);
    expect(across.x).toBeLessThan(7 - R);
    expect(across.x).toBeGreaterThan(7 - R - 0.2);
  });

  it('on ne franchit pas la grille du square, sauf au portail', () => {
    // Grille nord du square en z = 20,5 ; portail entre x = -236,5 et x = -232,5.
    const blocked = { x: -260, z: 15 };
    walk(blocked, 0, 0.1, 150);
    expect(blocked.z).toBeLessThan(20.5 - R);
    expect(blocked.z).toBeGreaterThan(20.5 - R - 0.2);
    const through = { x: -234.5, z: 15 };
    walk(through, 0, 0.1, 150);
    expect(through.z).toBeCloseTo(30, 6);
    expect(w.isFree(-234.5, 20.5, R)).toBe(true);
    expect(w.isFree(-260, 20.5, R)).toBe(false);
    // De l'intérieur, on ne sort pas davantage par la grille ouest (x = -293,5).
    const inside = { x: -280, z: 80 };
    walk(inside, -0.1, 0, 250);
    expect(inside.x).toBeGreaterThan(-293.5 + R);
  });

  it('lancer de rayon : façade, grille, mur de quai, rien', () => {
    const hit = makeHit();
    // Vers une façade de l'avenue.
    expect(w.raycast(100, -10, 100, -40, hit)).toBe(true);
    expect(hit.hit).toBe(true);
    expect(hit.kind).toBe('building');
    expect(hit.t).toBeCloseTo(1 / 3, 4);
    expect(hit.x).toBeCloseTo(100, 4);
    expect(hit.z).toBeCloseTo(-20, 3);
    expect(hit.nx).toBeCloseTo(0, 5);
    expect(hit.nz).toBeCloseTo(1, 5); // la normale regarde l'origine du rayon
    expect(hit.height).toBeGreaterThan(15); // un immeuble de l'avenue : 6 ou 7 niveaux
    expect(hit.height).toBeLessThan(30);
    expect(hit.height).toBeCloseTo(w.buildingHeightAt(100, -22), 1);
    // Vers la grille du square.
    expect(w.raycast(-260, 15, -260, 30, hit)).toBe(true);
    expect(hit.kind).toBe('barrier');
    expect(hit.z).toBeCloseTo(20.5, 3);
    expect(hit.height).toBeCloseTo(2.2, 5);
    // Par le portail : rien.
    expect(w.raycast(-234.5, 15, -234.5, 30, hit)).toBe(false);
    expect(hit.hit).toBe(false);
    expect(hit.t).toBe(1);
    expect(hit.x).toBe(-234.5);
    expect(hit.z).toBe(30);
    expect(hit.kind).toBe('none');
    // Par-dessus le fleuve : le mur de quai, vu du quai, n'est qu'un parapet.
    expect(w.raycast(100, 290, 100, 430, hit)).toBe(true);
    expect(hit.kind).toBe('barrier');
    expect(hit.z).toBeCloseTo(300, 3);
    expect(hit.height).toBeLessThanOrEqual(1);
    // Le long de l'avenue, d'un bout à l'autre d'un îlot : rien.
    expect(w.raycast(60, -16, 160, -16, hit)).toBe(false);
    // Rayon de longueur nulle.
    expect(w.raycast(60, -16, 60, -16, hit)).toBe(false);
    // Depuis l'intérieur d'une cour vers la rue : on touche le mur de la cour.
    expect(w.raycast(150, -40, 180, -40, hit)).toBe(true);
    expect(hit.kind).toBe('building');
    expect(hit.x).toBeCloseTo(152, 1);
  });

  it('ligne de vue', () => {
    expect(w.lineOfSight(100, -10, 100, 10)).toBe(true); // d'un trottoir à l'autre de l'avenue
    expect(w.lineOfSight(-400, -3, 400, -3)).toBe(false); // le monument de la place est dans l'axe
    expect(w.lineOfSight(-400, -15, 400, -15)).toBe(true); // le long de l'avenue, à côté
    expect(w.lineOfSight(100, -10, 100, -170)).toBe(false); // à travers un îlot
    expect(w.lineOfSight(100, -10, 100, -22)).toBe(false); // jusque dans l'immeuble
    expect(w.lineOfSight(-260, 15, -260, 60)).toBe(true); // une grille n'arrête pas le regard
    expect(w.lineOfSight(-260, 80, -225, 80)).toBe(true); // une haie basse non plus (1,1 m)
    expect(w.lineOfSight(100, 295, 100, 425)).toBe(true); // par-dessus le fleuve
    expect(w.lineOfSight(0, 310, 60, 360)).toBe(true); // du pont vers l'eau : le garde-corps est bas
    // Mur du parc de stationnement (2,4 m) : il arrête le regard, pas la grille du chantier (2 m, ajourée).
    const s = w.stats();
    expect(s.segments).toBeGreaterThan(0);
    expect(w.lineOfSight(470, -480, 470, -505)).toBe(false);
  });

  it('continuité aux limites de tuiles', () => {
    const hit = makeHit();
    // Rue du Moulin (z = -290) traverse la limite x = 0 ; rue du Pont suit la limite elle-même.
    expect(w.raycast(-100, -290, 100, -290, hit)).toBe(false);
    expect(w.raycast(0, -400, 0, -70, hit)).toBe(false);
    const pos = { x: -3, z: -290 };
    walk(pos, 0.25, 0, 24);
    expect(pos).toEqual({ x: 3, z: -290 });
    // La limite z = 0 passe dans l'avenue.
    expect(w.raycast(100, -12, 100, 12, hit)).toBe(false);
    // Un rayon qui traverse trois tuiles et finit dans une façade.
    expect(w.raycast(-300, -100, 300, 160, hit)).toBe(true);
    expect(hit.kind).toBe('building');
    // Hors de la carte, le disque est ramené sur le bord.
    const out = { x: 600, z: -290 };
    expect(w.resolveCircle(out, R)).toBe(true);
    expect(out.x).toBe(512);
    expect(w.isFree(600, -290, R)).toBe(false);
  });
});
