// Vraies données de Paris — exécuté seulement si public/data/paris/manifest.json existe
// (ou le dossier désigné par la variable d'environnement CRS_PARIS_DIR).
import { beforeAll, describe, expect, it } from 'vitest';
import type { RayHit, RoadSample, Vec2 } from '@/core/contracts';
import { createWorldQuery } from '@/world/query';
import type { WorldQueryImpl } from '@/world/query';
import { FsMapSource, defaultParisDir } from '@/world/query/source-fs';
import { pathLength, seededRandom } from '@/world/query/testkit';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const dir = env.CRS_PARIS_DIR && env.CRS_PARIS_DIR !== '' ? env.CRS_PARIS_DIR : defaultParisDir();
const source = new FsMapSource(dir);
const available = await source.exists();

if (!available) console.log(`[monde] ${dir}/manifest.json absent : tests sur les vraies données non exécutés`);

describe.skipIf(!available)('monde : vraies données de Paris', () => {
  let w: WorldQueryImpl;
  const sample: RoadSample = { edgeId: -1, x: 0, z: 0, heading: 0, dist: 0, width: 0, name: '', roadClass: 'residential', oneway: false };
  const hit: RayHit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };

  beforeAll(async () => {
    w = createWorldQuery({ source: 'paris', parisSource: source });
    const t0 = performance.now();
    await w.boot();
    console.log(`[mesure] Paris : fichiers de base lus, décodés et indexés en ${(performance.now() - t0).toFixed(0)} ms — ${w.nodeCount} nœuds, ${w.edgeCount} arêtes, ${w.places.length} lieux, ${w.landmarks.length} monuments`);
  }, 120000);

  it('le jeu de données est celui de Paris', () => {
    const s = w.stats();
    expect(s.fallback).toBe(false);
    expect(s.source).toBe('paris');
    expect(w.nodeCount).toBeGreaterThan(3000);
    expect(w.edgeCount).toBeGreaterThan(4000);
    expect(w.places.length).toBeGreaterThan(100);
    expect(w.attribution.toLowerCase()).toContain('openstreetmap');
    // Emprise du BRIEF : x de -2656 à 3758 m, z de -1375 à 1739 m (à quelques mètres près).
    expect(w.bounds.minX).toBeLessThan(-2500);
    expect(w.bounds.maxX).toBeGreaterThan(3600);
    expect(w.bounds.minZ).toBeLessThan(-1300);
    expect(w.bounds.maxZ).toBeGreaterThan(1650);
    expect(Math.abs(w.heightAt(0, 0))).toBeLessThan(1.5); // y = 0 au sol de la Concorde
  });

  it('la place de la Concorde est praticable', async () => {
    const place = w.placeByName('concorde');
    expect(place).not.toBeNull();
    if (place === null) return;
    expect(place.name).toBe('Place de la Concorde');
    expect(Math.hypot(place.x, place.z)).toBeLessThan(120); // l'obélisque est l'origine du monde
    const t0 = performance.now();
    w.setFocus(place.x, place.z);
    await w.whenLoaded(place.x, place.z, 400);
    const s = w.stats();
    console.log(`[mesure] Concorde : ${s.tilesLoaded} tuiles en ${(performance.now() - t0).toFixed(0)} ms (décodage ${s.decodeMs.toFixed(0)} ms, obstacles ${s.collisionBuildMs.toFixed(0)} ms) — ${s.segments} segments, ${s.solids} polygones`);
    expect(w.isLoaded(place.x, place.z)).toBe(true);
    expect(w.sectorName(place.x + 40, place.z + 30)).toBe('place de la Concorde');
    // La place est un grand espace ouvert : la plupart des points y sont libres et praticables.
    let free = 0, total = 0;
    const kinds = new Map<string, number>();
    for (let dz = -90; dz <= 90; dz += 6) {
      for (let dx = -90; dx <= 90; dx += 6) {
        total++;
        const x = place.x + dx, z = place.z + dz;
        const kind = w.surfaceAt(x, z);
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
        if (w.isFree(x, z, 0.4) && kind !== 'building' && kind !== 'water' && kind !== 'void') free++;
      }
    }
    console.log(`[monde] Concorde, sol dans un carré de 180 m : ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')} ; ${free}/${total} points libres`);
    expect(free / total).toBeGreaterThan(0.85);
    expect((kinds.get('void') ?? 0)).toBe(0);
    expect((kinds.get('road') ?? 0) + (kinds.get('sett') ?? 0) + (kinds.get('plaza') ?? 0) + (kinds.get('sidewalk') ?? 0)).toBeGreaterThan(total * 0.8);
    // Des marcheurs la traversent en tous sens sans jamais entrer dans un obstacle.
    const rand = seededRandom(5);
    const pos: Vec2 = { x: 0, z: 0 };
    let moved = 0;
    for (let k = 0; k < 40; k++) {
      expect(w.randomFreePoint(place.x, place.z, 100, 'any', rand, pos)).toBe(true);
      const sx = pos.x, sz = pos.z;
      const heading = rand() * Math.PI * 2;
      for (let i = 0; i < 300; i++) {
        pos.x += Math.sin(heading) * 0.4;
        pos.z += Math.cos(heading) * 0.4;
        w.resolveCircle(pos, 0.3);
        expect(w.isSolidAt(pos.x, pos.z)).toBe(false);
      }
      if (Math.hypot(pos.x - sx, pos.z - sz) > 60) moved++;
    }
    expect(moved).toBeGreaterThan(25); // la plupart parcourent plus de 60 m sans être arrêtés
    // On y trouve des points d'apparition sur la chaussée et sur les trottoirs.
    expect(w.randomFreePoint(place.x, place.z, 120, 'road', rand, pos)).toBe(true);
    expect(w.randomFreePoint(place.x, place.z, 120, 'sidewalk', rand, pos)).toBe(true);
  }, 120000);

  it('noms de lieux et de secteurs usuels', () => {
    expect(w.placeByName('étoile')?.name).toBe('Place Charles de Gaulle');
    expect(w.placeByName('bastille')?.name).toBe('Place de la Bastille');
    expect(w.placeByName('RÉPUBLIQUE')?.name).toBe('Place de la République');
    expect(w.placeByName('tour eiffel')?.name).toBe('Tour Eiffel');
    expect(w.placeByName('tuileries')?.name).toBe('Jardin des Tuileries');
    expect(w.sectorName(0, 0)).toBe('place de la Concorde');
    expect(w.sectorName(-127, 250)).toBe('pont de la Concorde');
    // Sur les Champs-Élysées : l'avenue, pas la galerie marchande ou la contre-allée qui la longe.
    const champs = w.placeByName('avenue des Champs-Élysées');
    expect(champs).not.toBeNull();
    if (champs !== null) {
      let onAvenue = 0, named = 0;
      for (let k = 1; k < 20; k++) {
        // De l'Étoile au Rond-Point, le long de la droite qui les joint (l'avenue est rectiligne).
        const x = -1890 + (1044 * k) / 20, z = -906 + (519 * k) / 20;
        if (!w.nearestRoad(x, z, sample, 40)) continue;
        named++;
        if (w.sectorName(x, z) === 'avenue des Champs-Élysées') onAvenue++;
      }
      expect(named).toBeGreaterThan(15);
      expect(onAvenue).toBeGreaterThanOrEqual(named - 3); // hors des places traversées (Étoile, Rond-Point)
    }
  });

  it('la Seine est de l\'eau, infranchissable hors des ponts', async () => {
    // De la Concorde vers le sud, entre le pont de la Concorde (x ≈ -130) et la passerelle (x ≈ 250).
    const x = 80;
    w.setFocus(x, 350);
    await w.whenLoaded(x, 350, 450);
    let first = NaN, last = NaN, run = 0, best = 0, bestStart = NaN;
    for (let z = 100; z <= 700; z += 1) {
      if (w.surfaceAt(x, z) === 'water') {
        if (run === 0) first = z;
        run++;
        if (run > best) {
          best = run;
          bestStart = first;
        }
        last = z;
      } else {
        run = 0;
      }
    }
    console.log(`[monde] Seine en x = ${x} : eau de z = ${bestStart} à z = ${bestStart + best} (${best} m), dernier point d'eau z = ${last} ; niveau ${w.waterLevel} m`);
    expect(best).toBeGreaterThan(80); // la Seine fait 100 à 160 m de large
    expect(best).toBeLessThan(260);
    const mid = bestStart + best / 2;
    expect(w.isSolidAt(x, mid)).toBe(true);
    expect(w.isFree(x, mid, 0.4)).toBe(false);
    expect(w.buildingHeightAt(x, mid)).toBe(0);
    expect(w.lineOfSight(x, bestStart - 5, x, bestStart + best + 5)).toBe(true); // on voit l'autre rive
    // Un marcheur parti de la rive droite vers le sud est arrêté avant l'eau.
    const pos = { x, z: bestStart - 30 };
    w.resolveCircle(pos, 0.3);
    for (let i = 0; i < 400; i++) {
      pos.z += 0.3;
      w.resolveCircle(pos, 0.3);
      expect(w.surfaceAt(pos.x, pos.z)).not.toBe('water');
      expect(w.isSolidAt(pos.x, pos.z)).toBe(false);
    }
    expect(pos.z).toBeLessThan(mid);
    // Mais un itinéraire à pied relie les deux rives, par un pont.
    const path: number[] = [];
    expect(w.findPath(x, bestStart - 40, x, bestStart + best + 40, 'foot', path)).toBe(true);
    let onBridge = 0;
    for (let i = 2; i + 1 < path.length; i += 2) {
      const mx = (path[i] + path[i - 2]) / 2, mz = (path[i + 1] + path[i - 1]) / 2;
      if (w.nearestRoad(mx, mz, sample, 3) && w.edge(sample.edgeId).bridge) onBridge++;
    }
    expect(onBridge).toBeGreaterThan(0);
  }, 120000);

  it('un itinéraire à pied relie l\'Étoile à la Concorde : environ 2 km', () => {
    const etoile = w.placeByName('place Charles de Gaulle') ?? w.placeByName('étoile') ?? w.placeByName('arc de triomphe');
    const concorde = w.placeByName('place de la Concorde');
    expect(etoile).not.toBeNull();
    expect(concorde).not.toBeNull();
    if (etoile === null || concorde === null) return;
    // L'Arc de Triomphe est à 2,1 km à vol d'oiseau de l'obélisque.
    expect(Math.hypot(etoile.x + 1923, etoile.z + 908)).toBeLessThan(150);
    const path: number[] = [];
    const t0 = performance.now();
    expect(w.findPath(etoile.x, etoile.z, concorde.x, concorde.z, 'foot', path)).toBe(true);
    const ms = performance.now() - t0;
    const length = pathLength(path);
    const straight = Math.hypot(etoile.x - concorde.x, etoile.z - concorde.z);
    console.log(`[mesure] Étoile (${etoile.name}) → Concorde à pied : ${length.toFixed(0)} m en ${path.length >> 1} points (vol d'oiseau ${straight.toFixed(0)} m), ${ms.toFixed(2)} ms`);
    expect(length).toBeGreaterThanOrEqual(straight);
    expect(length).toBeGreaterThan(1900);
    expect(length).toBeLessThan(2600);
    // En voiture aussi (sens uniques respectés : le trajet peut être plus long).
    expect(w.findPath(etoile.x, etoile.z, concorde.x, concorde.z, 'vehicle', path)).toBe(true);
    expect(pathLength(path)).toBeLessThan(4500);
    // 200 itinéraires au hasard dans toute la carte.
    const rand = seededRandom(11);
    const b = w.bounds;
    let found = 0;
    const t1 = performance.now();
    for (let k = 0; k < 200; k++) {
      const ax = b.minX + rand() * (b.maxX - b.minX), az = b.minZ + rand() * (b.maxZ - b.minZ);
      const bx = b.minX + rand() * (b.maxX - b.minX), bz = b.minZ + rand() * (b.maxZ - b.minZ);
      if (w.findPath(ax, az, bx, bz, k % 2 === 0 ? 'foot' : 'vehicle', path)) found++;
    }
    console.log(`[mesure] Paris : 200 findPath à travers toute la carte en ${(performance.now() - t1).toFixed(1)} ms, ${found} trouvés`);
    expect(found).toBeGreaterThan(150);
  });

  it('des marcheurs lâchés dans dix quartiers ne finissent jamais dans un obstacle', async () => {
    const rand = seededRandom(777);
    const pos: Vec2 = { x: 0, z: 0 };
    let steps = 0, solid = 0, hops = 0, jumps = 0, spawned = 0;
    const spots: [number, number][] = [[1870, 1230], [0, 0], [-1890, -906], [900, 300], [2900, -400], [1200, -600], [3300, 1300], [-1950, 800], [-600, 900], [2300, 500]];
    for (const [cx, cz] of spots) {
      w.setFocus(cx, cz);
      await w.whenLoaded(cx, cz, 450);
      for (let k = 0; k < 80; k++) {
        if (!w.randomFreePoint(cx, cz, 350, 'any', rand, pos)) continue;
        spawned++;
        let heading = rand() * Math.PI * 2;
        for (let i = 0; i < 400; i++) {
          heading += (rand() - 0.5) * 0.08;
          const bx = pos.x, bz = pos.z;
          pos.x += Math.sin(heading) * 0.35;
          pos.z += Math.cos(heading) * 0.35;
          if (w.resolveCircle(pos, 0.3)) heading += 0.02;
          steps++;
          const moved = Math.hypot(pos.x - bx, pos.z - bz);
          if (moved > 0.77) hops++;
          if (moved > 1.3) jumps++;
          if (w.isSolidAt(pos.x, pos.z)) solid++;
        }
      }
    }
    console.log(`[monde] Paris : ${spawned} marcheurs, ${steps} pas dans dix quartiers — ${solid} dans un obstacle, ${hops} déplacements de plus de 0,77 m (deux fois le pas), dont ${jumps} de plus de 1,3 m`);
    expect(spawned).toBeGreaterThan(700);
    expect(solid).toBe(0);
    // Un recoin plus étroit que le disque (grille posée contre un mur) peut le faire ressortir de
    // l'autre côté de la grille : rare, et toujours court.
    expect(hops).toBeLessThan(steps / 5000);
    expect(jumps).toBeLessThan(4);
  }, 300000);

  it('Arc de Triomphe : obstacles du monument', async () => {
    const arc = w.landmarks.find((l) => l.key === 'arc_triomphe' || l.key === 'arc_de_triomphe');
    expect(arc).toBeDefined();
    if (arc === undefined) return;
    w.setFocus(arc.x, arc.z);
    await w.whenLoaded(arc.x, arc.z, 200);
    let solid = 0, total = 0;
    for (let dz = -24; dz <= 24; dz += 2) {
      for (let dx = -24; dx <= 24; dx += 2) {
        total++;
        if (w.isSolidAt(arc.x + dx, arc.z + dz)) solid++;
      }
    }
    // Emprise du monument (aire de son contour) : avec les obstacles du modèle (piliers), on passe sous
    // la voûte et la surface pleine est nettement plus petite que l'emprise.
    let area = 0;
    const f = arc.footprint;
    for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) area += f[j] * f[i + 1] - f[i] * f[j + 1];
    area = Math.abs(area) / 2;
    const solidArea = solid * 4;
    const pillars = solidArea < area * 0.75;
    console.log(`[monde] Arc de Triomphe : ${solidArea} m² pleins pour une emprise de ${area.toFixed(0)} m² — ${pillars ? 'obstacles du modèle (piliers : on passe sous la voûte)' : 'emprise ordinaire du bâtiment'}`);
    expect(solid).toBeGreaterThan(20); // il y a un monument…
    expect(solidArea).toBeLessThan(area * 1.25); // … pas plus gros que son emprise
    expect(w.heightAt(arc.x, arc.z)).toBeGreaterThan(15); // l'Étoile est en haut de la butte de Chaillot
    // On peut en faire le tour à pied sans jamais entrer dedans.
    const pos = { x: arc.x + 40, z: arc.z };
    for (let i = 0; i < 720; i++) {
      const a = (i / 720) * Math.PI * 2;
      pos.x = arc.x + Math.cos(a) * 40;
      pos.z = arc.z + Math.sin(a) * 40;
      expect(w.resolveCircle(pos, 0.3)).toBe(false);
    }
  }, 120000);

  it('micro-mesures sur les vraies données', async () => {
    w.setFocus(100, 100);
    await w.whenLoaded(100, 100, 500);
    const rand = seededRandom(21);
    const walkers: { pos: Vec2; heading: number }[] = [];
    const p: Vec2 = { x: 0, z: 0 };
    for (let tries = 0; walkers.length < 500 && tries < 5000; tries++) {
      if (w.randomFreePoint(100, 100, 350, 'any', rand, p)) walkers.push({ pos: { x: p.x, z: p.z }, heading: rand() * Math.PI * 2 });
    }
    expect(walkers.length).toBe(500);
    for (let i = 0; i < 20000; i++) w.resolveCircle(walkers[i % 500].pos, 0.3);
    let contacts = 0;
    let t0 = performance.now();
    for (let step = 0; step < 200; step++) {
      for (let k = 0; k < 500; k++) {
        const wk = walkers[k];
        wk.pos.x += Math.sin(wk.heading) * 0.07;
        wk.pos.z += Math.cos(wk.heading) * 0.07;
        if (w.resolveCircle(wk.pos, 0.3)) {
          contacts++;
          wk.heading += 0.35;
        }
      }
    }
    const resolveMs = performance.now() - t0;
    let inSolid = 0;
    for (const wk of walkers) if (w.isSolidAt(wk.pos.x, wk.pos.z)) inSolid++;
    expect(inSolid).toBe(0);
    const rays = new Float64Array(4000);
    for (let i = 0; i < 1000; i++) {
      const x = 100 + (rand() - 0.5) * 700, z = 100 + (rand() - 0.5) * 700;
      const a = rand() * Math.PI * 2, len = 20 + rand() * 180;
      rays.set([x, z, x + Math.cos(a) * len, z + Math.sin(a) * len], i * 4);
    }
    for (let i = 0; i < 1000; i++) w.raycast(rays[4 * i], rays[4 * i + 1], rays[4 * i + 2], rays[4 * i + 3], hit);
    let hits = 0;
    t0 = performance.now();
    for (let i = 0; i < 1000; i++) if (w.raycast(rays[4 * i], rays[4 * i + 1], rays[4 * i + 2], rays[4 * i + 3], hit)) hits++;
    const rayMs = performance.now() - t0;
    const s = w.stats();
    console.log(`[mesure] Paris (${s.tilesLoaded} tuiles, ${s.segments} segments) : 100 000 resolveCircle ${resolveMs.toFixed(1)} ms (${contacts} contacts) ; 1 000 raycast ${rayMs.toFixed(2)} ms (${hits} arrêtés) ; grilles ${s.grids} en ${s.rasterMs.toFixed(0)} ms`);
    expect(resolveMs).toBeLessThan(3000);
    expect(rayMs).toBeLessThan(1000);
  }, 120000);
});
