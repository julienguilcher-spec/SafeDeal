// Surfaces, hauteur du bâti et relief.
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, sampleTerrain } from '@/world/mapdata';
import { generateTestDistrict } from '@/world/testDistrict';
import { MemoryMapSource, createWorldQuery } from '@/world/query';
import type { WorldQueryImpl } from '@/world/query';
import { MINI_MAP, miniMapRaw } from '@/world/query/testkit';

let w: WorldQueryImpl;

beforeAll(async () => {
  w = createWorldQuery({ source: 'test' });
  await w.boot();
  w.setFocus(0, 0);
  await w.whenLoaded(0, 0, 800);
});

describe('monde : surfaces (quartier d\'essai)', () => {
  it('donne la nature du sol attendue', () => {
    expect(w.surfaceAt(100, -7.25)).toBe('road'); // chaussée nord de l'avenue
    expect(w.surfaceAt(100, 7.25)).toBe('road');
    expect(w.surfaceAt(100, -16)).toBe('sidewalk'); // trottoir de l'avenue
    expect(w.surfaceAt(100, 0)).toBe('sidewalk'); // terre-plein central
    expect(w.surfaceAt(10, 10)).toBe('plaza'); // îlot central de la place
    expect(w.surfaceAt(33, 0)).toBe('road'); // anneau de la place
    expect(w.surfaceAt(100, -290)).toBe('sett'); // rue du Moulin, pavée
    expect(w.surfaceAt(80, 150)).toBe('sett'); // rue du Marché, piétonne et pavée
    expect(w.surfaceAt(335.5, -384.5)).toBe('park'); // pelouse du parc de la Butte
    expect(w.surfaceAt(365.5, -300)).toBe('gravel'); // allée du parc
    expect(w.surfaceAt(-270, 80)).toBe('park'); // pelouse du square
    expect(w.surfaceAt(-234.5, 40)).toBe('gravel'); // allée du square
    expect(w.surfaceAt(-234.5, 82)).toBe('water'); // bassin du square
    expect(w.surfaceAt(100, 360)).toBe('water'); // le fleuve
    expect(w.surfaceAt(0, 360)).toBe('bridge'); // le pont
    expect(w.surfaceAt(6, 310)).toBe('bridge'); // trottoir du pont
    expect(w.surfaceAt(8, 310)).toBe('water'); // juste au-delà du garde-corps
    expect(w.surfaceAt(100, -26)).toBe('building');
    expect(w.surfaceAt(150, -40)).toBe('plaza'); // cour d'îlot
    expect(w.surfaceAt(100, 297)).toBe('sidewalk'); // promenade du quai
    expect(w.surfaceAt(100, 289.5)).toBe('road'); // chaussée du quai
    expect(w.surfaceAt(600, 0)).toBe('void'); // hors carte
    expect(w.surfaceAt(0, -600)).toBe('void');
  });

  it('donne la hauteur du bâti', () => {
    expect(w.buildingHeightAt(100, -7)).toBe(0);
    expect(w.buildingHeightAt(100, 360)).toBe(0);
    const h = w.buildingHeightAt(100, -26);
    expect(h).toBeGreaterThan(18); // immeuble de l'avenue : 6 ou 7 niveaux + toit
    expect(h).toBeLessThan(26);
    expect(w.buildingHeightAt(0, 0)).toBeCloseTo(32, 5); // le monument
    expect(w.buildingHeightAt(234.5, -180)).toBeCloseTo(21, 5); // la mairie
    expect(w.buildingHeightAt(234.5, -225.5)).toBe(0); // sa cour
    expect(w.buildingHeightAt(600, 0)).toBe(0);
  });

  it('la grille de surfaces et les obstacles pleins disent la même chose', () => {
    // Loin des bords (à 1 m près, la grille étant au mètre) : bâtiment ou eau ⇔ obstacle plein.
    let checked = 0;
    for (let z = -500; z <= 500; z += 7.3) {
      for (let x = -500; x <= 500; x += 7.1) {
        const kind = w.surfaceAt(x, z);
        const solid = w.isSolidAt(x, z);
        let uniform = true;
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) uniform = uniform && w.surfaceAt(x + dx, z + dz) === kind;
        if (!uniform) continue;
        checked++;
        expect(solid, `(${x.toFixed(1)} ; ${z.toFixed(1)}) ${kind}`).toBe(kind === 'building' || kind === 'water');
      }
    }
    expect(checked).toBeGreaterThan(15000);
  });

  it('expose les commerces et le mobilier des tuiles chargées', () => {
    const shops = w.shopsInTile(0, 0);
    expect(shops.length).toBe(63);
    expect(shops[5].index).toBe(5);
    expect(typeof shops[5].category).toBe('string');
    expect(shops[5].width).toBeGreaterThan(0);
    // Une vitrine est sur une façade : juste derrière, le bâtiment ; juste devant, la rue.
    for (const s of shops) {
      expect(w.surfaceAt(s.x - Math.sin(s.heading) * 2, s.z - Math.cos(s.heading) * 2)).toBe('building');
      expect(w.isSolidAt(s.x + Math.sin(s.heading) * 1.5, s.z + Math.cos(s.heading) * 1.5)).toBe(false);
    }
    const furniture = w.furnitureInTile(-1, 0);
    expect(furniture.length).toBe(172);
    expect(furniture.some((f) => f.kind === 'banc')).toBe(true);
    expect(furniture[0].index).toBe(0);
    expect(w.shopsInTile(5, 5)).toEqual([]);
    expect(w.furnitureInTile(5, 5)).toEqual([]);
  });
});

describe('monde : relief', () => {
  it('heightAt est le relief bilinéaire', () => {
    const terrain = decodeTerrain(generateTestDistrict().terrain);
    expect(w.heightAt(0, 0)).toBeCloseTo(0, 2);
    for (const [x, z] of [[-311.3, 120.7], [260, -300], [77.7, -77.7], [-500, 500], [140.2, 250.1]]) {
      expect(w.heightAt(x, z)).toBeCloseTo(sampleTerrain(terrain, x, z), 6);
    }
    expect(w.heightAt(260, -300)).toBeGreaterThan(5); // la butte
    expect(w.heightAt(0, 290)).toBeLessThan(-3); // la pente vers le fleuve
    expect(w.waterLevel).toBeCloseTo(-7.3, 5);
    expect(w.waterLevel).toBeLessThan(w.heightAt(0, 300));
  });

  it('heightAt est continu (aucune marche)', () => {
    const lines: [number, number, number, number][] = [
      [-510, -510, 510, 510], [-510, 300, 510, -200], [0, 250, 0, 470], [-30, 360, 30, 360], [-6, 280, 9, 440],
      [100, -400, 100, 400], [255, -510, 265, -100],
    ];
    for (const [ax, az, bx, bz] of lines) {
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
      let prev = w.heightAt(ax, az);
      for (let i = 1; i <= steps; i++) {
        const y = w.heightAt(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps);
        expect(Math.abs(y - prev)).toBeLessThan(0.02); // pente du quartier ≤ 5 % : moins de 2 cm par 10 cm
        prev = y;
      }
    }
  });

  it('le tablier du pont ne suit pas le lit de la rivière', async () => {
    const mini = createWorldQuery({ source: 'paris', parisSource: new MemoryMapSource(miniMapRaw()) });
    await mini.boot();
    mini.setFocus(256, 256);
    await mini.whenLoaded(256, 256, 400);
    const r = MINI_MAP.river;
    expect(mini.stats().source).toBe('mini');
    expect(mini.heightAt(300, 430)).toBeCloseTo(r.bed, 5); // le lit, loin du pont
    expect(mini.heightAt(r.bridgeX, 430)).toBeCloseTo(0, 5); // le tablier relie les deux rives (y = 0)
    expect(mini.heightAt(r.bridgeX + r.halfDeck - 0.1, 430)).toBeCloseTo(0, 5); // jusqu'au bord du tablier
    expect(mini.heightAt(r.bridgeX + r.halfDeck + 3, 430)).toBeCloseTo(r.bed, 5); // au-delà du raccord
    expect(mini.surfaceAt(r.bridgeX, 430)).toBe('bridge');
    expect(mini.surfaceAt(300, 430)).toBe('water');
    // Continuité le long du pont et en travers (le raccord de 1,5 m rattrape 5 m de dénivelé).
    for (const [ax, az, bx, bz, limit] of [[r.bridgeX, 360, r.bridgeX, 500, 0.01], [r.bridgeX - 15, 430, r.bridgeX + 15, 430, 0.2], [r.bridgeX - 12, 390, r.bridgeX + 12, 470, 0.2]]) {
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05);
      let prev = mini.heightAt(ax, az);
      for (let i = 1; i <= steps; i++) {
        const y = mini.heightAt(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps);
        expect(Math.abs(y - prev)).toBeLessThan(limit);
        prev = y;
      }
    }
  });
});
