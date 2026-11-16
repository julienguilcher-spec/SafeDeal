// Tests ADVERSES du cœur du moteur (1/4) : bus d'événements, grille spatiale, géométrie, générateur
// aléatoire. Chaque test cherche à casser le moteur par un usage tordu mais plausible. Suites sœurs :
// core.adverse-systeme (sauvegarde, cœur sans navigateur), core.adverse-stores (magasins, services
// neutres), core.adverse-session (boucle, session, endurance).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Vec2 } from '@/core/contracts';
import { createEventBus } from '@/core/events';
import {
  circleVsObb, distSqPointObb, forwardX, forwardZ, segmentVsCircle, segmentVsObb, vehicleToWorldX, vehicleToWorldZ,
} from '@/core/math';
import type { SegmentCast } from '@/core/math';
import { createRng } from '@/core/rng';
import { SpatialHash } from '@/core/spatial';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ───────────────────────────── bus d'événements ─────────────────────────────

describe('adverse — bus d\'événements', () => {
  it('la même fonction abonnée deux fois : chaque abonnement se retire lui-même, même pendant une émission', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    const h = (): void => void calls.push('h');
    bus.onAny('x', h); // premier abonnement, appelé avant g
    let off2: () => void = () => {};
    bus.onAny('x', () => {
      calls.push('g');
      off2(); // retire le SECOND abonnement de h, pas encore appelé dans cette émission
    });
    off2 = bus.onAny('x', h);
    bus.emitAny('x', null);
    expect(calls).toEqual(['h', 'g']); // le second h, retiré à temps, ne doit pas être appelé
    expect(bus.listenerCount('x')).toBe(2);
    calls.length = 0;
    bus.emitAny('x', null);
    expect(calls).toEqual(['h', 'g']); // et c'est bien le PREMIER abonnement qui subsiste, à sa place
  });

  it('un désabonnement périmé (antérieur à clear) ne retire pas un abonnement plus récent de la même fonction', () => {
    const bus = createEventBus();
    let n = 0;
    const h = (): void => void n++;
    const stale = bus.onAny('x', h);
    bus.clear();
    bus.onAny('x', h); // nouvel abonnement, même fonction
    stale(); // ne concerne que l'ancien abonnement, déjà retiré par clear()
    bus.emitAny('x', null);
    expect(n).toBe(1);
    expect(bus.listenerCount('x')).toBe(1);
  });

  it('émission réentrante : chaque niveau voit les abonnés du moment, les retraits valent pour tous les niveaux', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    let depth = 0;
    let offB: () => void = () => {};
    bus.onAny('x', () => {
      calls.push(`a${depth}`);
      if (depth < 2) {
        depth++;
        bus.emitAny('x', null); // réémission depuis un gestionnaire
        depth--;
      } else {
        offB(); // au plus profond : retire b, qui n'a encore été appelé à aucun niveau
        bus.onAny('x', () => void calls.push('tardif')); // ajouté en cours de route
      }
    });
    offB = bus.onAny('x', () => void calls.push(`b${depth}`));
    bus.onAny('x', () => void calls.push(`c${depth}`));
    bus.emitAny('x', null);
    // a (niveau 0) → a (niveau 1) → a (niveau 2) retire b ; chaque niveau finit par c, jamais par b ;
    // « tardif », ajouté pendant l'émission la plus profonde, n'est appelé par aucune des trois émissions
    // en cours (toutes avaient commencé avant son ajout) : il attend la suivante.
    expect(calls.filter((c) => c.startsWith('b'))).toEqual([]);
    expect(calls.filter((c) => c.startsWith('a'))).toEqual(['a0', 'a1', 'a2']);
    expect(calls.filter((c) => c.startsWith('c'))).toEqual(['c2', 'c1', 'c0']);
    expect(calls.filter((c) => c === 'tardif').length).toBe(0);
    expect(bus.listenerCount('x')).toBe(3); // a, c, tardif
    calls.length = 0;
    depth = 2;
    bus.emitAny('x', null);
    expect(calls).toContain('tardif');
  });

  it('once réémis depuis son propre gestionnaire : une seule exécution', () => {
    const bus = createEventBus();
    let n = 0;
    bus.onAny('x', () => {});
    bus.once('session:paused', () => {
      n++;
      bus.emit('session:paused', { paused: true });
    });
    bus.emit('session:paused', { paused: true });
    bus.emit('session:paused', { paused: false });
    expect(n).toBe(1);
    expect(bus.listenerCount('session:paused')).toBe(0);
  });

  it('se désabonner puis se réabonner pendant l\'émission : pas de second appel dans la même émission', () => {
    const bus = createEventBus();
    let n = 0;
    let off: () => void = () => {};
    const h = (): void => {
      n++;
      off();
      off = bus.onAny('x', h);
    };
    off = bus.onAny('x', h);
    bus.emitAny('x', null);
    expect(n).toBe(1);
    bus.emitAny('x', null);
    expect(n).toBe(2);
    expect(bus.listenerCount('x')).toBe(1);
  });

  it('une réémission sans fin est coupée proprement et signalée, sans faire tomber l\'émetteur', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = createEventBus();
    let n = 0;
    let after = 0;
    bus.onAny('boucle', () => {
      n++;
      bus.emitAny('boucle', null); // bogue classique : A émet B qui réémet A…
    });
    bus.onAny('boucle', () => void after++);
    expect(() => bus.emitAny('boucle', null)).not.toThrow();
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThanOrEqual(64); // coupé à une profondeur raisonnable, bien avant le débordement de pile
    expect(after).toBe(n); // les autres abonnés ont été servis à chaque niveau atteint
    expect(error.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(error.mock.calls.length).toBeLessThanOrEqual(3); // un message clair, pas une avalanche
    expect(String(error.mock.calls[0]![0])).toMatch(/boucle/);
    expect(bus.errorCount).toBeGreaterThanOrEqual(1);
    // le bus reste utilisable
    let ok = 0;
    bus.onAny('autre', () => void ok++);
    bus.emitAny('autre', null);
    expect(ok).toBe(1);
  });

  it('en mode strict, la réémission sans fin fait échouer l\'appelant avec un message explicite', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = createEventBus({ rethrow: true });
    bus.onAny('boucle', () => bus.emitAny('boucle', null));
    expect(() => bus.emitAny('boucle', null)).toThrow(/boucle/);
  });

  it('10 000 abonnements éphémères pendant des émissions ne laissent aucun résidu', () => {
    const bus = createEventBus();
    let fired = 0;
    bus.onAny('x', () => {
      const off = bus.onAny('x', () => void fired++);
      off();
    });
    for (let i = 0; i < 10000; i++) bus.emitAny('x', i);
    expect(fired).toBe(0);
    expect(bus.listenerCount('x')).toBe(1);
  });
});

// ───────────────────────────── grille spatiale ─────────────────────────────

interface Pt extends Vec2 {
  id: number;
}

function brute(all: Pt[], x: number, z: number, r: number): number[] {
  const out: number[] = [];
  for (const p of all) {
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz <= r * r) out.push(p.id);
  }
  return out.sort((a, b) => a - b);
}

describe('adverse — grille de hachage spatiale', () => {
  it('3 000 opérations aléatoires (insert, remove, déplacement, rebuild) : toujours d\'accord avec la force brute', () => {
    const rng = createRng(2024);
    const grid = new SpatialHash<Pt>(3, 16); // petite capacité : force les agrandissements
    const live: Pt[] = [];
    const slot = new Map<number, number>();
    const out: Pt[] = [];
    let nextId = 1;
    for (let op = 0; op < 3000; op++) {
      const roll = rng.next();
      if (roll < 0.45 || live.length < 5) {
        const p: Pt = { id: nextId++, x: rng.range(-60, 60), z: rng.range(-60, 60) };
        live.push(p);
        slot.set(p.id, grid.insert(p));
      } else if (roll < 0.7) {
        const i = rng.int(0, live.length);
        const p = live[i]!;
        live[i] = live[live.length - 1]!;
        live.pop();
        if (rng.chance(0.5)) grid.remove(slot.get(p.id)!);
        else expect(grid.removeItem(p)).toBe(true);
        slot.delete(p.id);
      } else if (roll < 0.9) {
        const p = rng.pick(live);
        p.x += rng.range(-9, 9);
        p.z += rng.range(-9, 9);
        grid.update(slot.get(p.id)!);
      } else if (roll < 0.93) {
        grid.rebuild(live);
        for (let i = 0; i < live.length; i++) slot.set(live[i]!.id, i); // emplacements = ordre du tableau
      }
      if (op % 7 === 0) {
        const qx = rng.range(-70, 70);
        const qz = rng.range(-70, 70);
        const r = rng.chance(0.2) ? rng.range(40, 200) : rng.range(0, 12);
        grid.query(qx, qz, r, out);
        expect(out.map((p) => p.id).sort((a, b) => a - b)).toEqual(brute(live, qx, qz, r));
        expect(grid.count(qx, qz, r)).toBe(out.length);
        // plus proche voisin (recherche par anneaux) : même distance que la force brute, avec et sans filtre
        for (const filter of [undefined, (p: Pt) => p.id % 3 === 0]) {
          let bestD = Infinity;
          for (const p of live) {
            const d = Math.hypot(p.x - qx, p.z - qz);
            if (d <= r && d < bestD && (!filter || filter(p))) bestD = d;
          }
          const near = grid.nearest(qx, qz, r, filter);
          if (bestD === Infinity) expect(near).toBeNull();
          else expect(Math.hypot(near!.x - qx, near!.z - qz)).toBeCloseTo(bestD, 9);
        }
      }
      expect(grid.size).toBe(live.length);
    }
    expect(live.length).toBeGreaterThan(100);
  });

  it('positions et requêtes invalides (NaN, infini) : jamais de faux résultat, quel que soit le chemin de recherche', () => {
    const grid = new SpatialHash<Pt>(4, 16);
    const all: Pt[] = [];
    for (let i = 0; i < 40; i++) all.push({ id: i + 1, x: (i % 8) * 3, z: Math.floor(i / 8) * 3 });
    const bad: Pt = { id: 99, x: Number.NaN, z: 5 };
    const far: Pt = { id: 98, x: Number.POSITIVE_INFINITY, z: 0 };
    for (const p of [...all, bad, far]) grid.insert(p);
    const out: Pt[] = [];
    // petite requête (parcours des cellules) et requête immense (balayage linéaire)
    for (const r of [5, 30, 1e6, Number.POSITIVE_INFINITY]) {
      grid.query(6, 6, r, out);
      expect(out).not.toContain(bad);
      expect(out).not.toContain(far);
      expect(out.length).toBe(brute(all, 6, 6, r).length);
      expect(grid.count(6, 6, r)).toBe(out.length);
    }
    expect(grid.nearest(6, 6, 1e6, (p) => p.id >= 98)).toBeNull();
    // centre ou rayon invalide : aucun résultat
    expect(grid.query(Number.NaN, 0, 10, out)).toBe(0);
    expect(grid.query(0, Number.NaN, 1e9, out)).toBe(0);
    expect(grid.query(0, 0, Number.NaN, out)).toBe(0);
    expect(grid.query(0, 0, -1, out)).toBe(0);
    expect(grid.count(Number.NaN, Number.NaN, Number.POSITIVE_INFINITY)).toBe(0);
    expect(grid.nearest(Number.NaN, 0, 1e9)).toBeNull();
    expect(out.length).toBe(0);
    // l'élément invalide reste retirable
    expect(grid.removeItem(bad)).toBe(true);
    expect(grid.removeItem(far)).toBe(true);
    expect(grid.size).toBe(40);
  });

  it('retirer des éléments depuis le filtre d\'une requête en cours ne casse ni la requête ni l\'index', () => {
    for (const r of [2.5, 500]) {
      // r = 2,5 : parcours des cellules ; r = 500 : balayage linéaire
      const grid = new SpatialHash<Pt>(3, 16);
      const all: Pt[] = [];
      const slot = new Map<Pt, number>();
      for (let i = 0; i < 300; i++) {
        const p: Pt = { id: i + 1, x: (i % 20) * 0.25, z: Math.floor(i / 20) * 0.25 };
        all.push(p);
        slot.set(p, grid.insert(p));
      }
      const gone = new Set<Pt>();
      const seen: Pt[] = [];
      const out: Pt[] = [];
      const kill = (p: Pt): void => {
        if (gone.has(p)) return;
        gone.add(p);
        grid.remove(slot.get(p)!);
      };
      expect(() =>
        grid.query(2, 2, r, out, (p) => {
          expect(gone.has(p)).toBe(false); // un élément déjà retiré ne doit plus être présenté au filtre
          seen.push(p);
          kill(p); // l'élément examiné se retire lui-même…
          kill(all[(p.id * 7) % all.length]!); // … et en retire un autre, n'importe où
          return true;
        }),
      ).not.toThrow();
      expect(grid.size).toBe(all.length - gone.size);
      expect(new Set(seen).size).toBe(seen.length); // personne n'est présenté deux fois
      // la requête est allée au bout : tout élément du disque a été examiné (donc retiré) ou retiré par un autre
      expect(seen.length).toBeGreaterThan(20);
      for (const p of all) {
        if (!gone.has(p)) expect(Math.hypot(p.x - 2, p.z - 2)).toBeGreaterThan(r);
      }
      // après coup, l'index est sain : exactement les survivants, et les emplacements libérés se réutilisent
      grid.query(0, 0, 1e6, out);
      expect(out.length).toBe(all.length - gone.size);
      for (const p of out) expect(gone.has(p)).toBe(false);
      const extra: Pt[] = [];
      for (let i = 0; i < 50; i++) {
        const p: Pt = { id: 1000 + i, x: 100 + i, z: 100 };
        extra.push(p);
        grid.insert(p);
      }
      expect(grid.query(125, 100, 30, out)).toBe(50);
      expect(grid.size).toBe(all.length - gone.size + 50);
    }
  });

  it('insérer et reconstruire depuis un filtre : la requête en cours se termine sans erreur', () => {
    const grid = new SpatialHash<Pt>(3, 16);
    const all: Pt[] = [];
    for (let i = 0; i < 64; i++) {
      const p: Pt = { id: i + 1, x: (i % 8) * 0.3, z: Math.floor(i / 8) * 0.3 };
      all.push(p);
      grid.insert(p);
    }
    const out: Pt[] = [];
    let calls = 0;
    expect(() =>
      grid.query(1, 1, 2, out, () => {
        calls++;
        if (calls === 3) {
          for (let i = 0; i < 200; i++) {
            const p: Pt = { id: 500 + i, x: 50 + (i % 10), z: 50 + Math.floor(i / 10) };
            all.push(p);
            grid.insert(p); // dépasse la capacité : agrandissement des tableaux en pleine requête
          }
        }
        if (calls === 10) grid.rebuild(all);
        return calls < 5000; // garde-fou contre une boucle sans fin
      }),
    ).not.toThrow();
    expect(calls).toBeLessThan(5000);
    expect(grid.size).toBe(all.length);
    grid.query(0, 0, 1e6, out);
    expect(out.length).toBe(all.length);
  });

  it('removeItem reste rapide dans une grande grille : coût linéaire, pas quadratique', () => {
    /** Durée du retrait un à un de n éléments (meilleure de trois mesures : la machine de test est partagée). */
    const measure = (n: number): number => {
      let best = Infinity;
      for (let rep = 0; rep < 3; rep++) {
        const rng = createRng(5 + rep);
        const grid = new SpatialHash<Pt>(3, 1024);
        const all: Pt[] = [];
        const side = Math.sqrt(n) * 2;
        for (let i = 0; i < n; i++) {
          const p: Pt = { id: i + 1, x: rng.range(-side, side), z: rng.range(-side, side) };
          all.push(p);
          grid.insert(p);
        }
        // la moitié s'est déplacée depuis l'indexation (cas réel : retrait après un pas de locomotion)
        for (let i = 0; i < all.length; i += 2) {
          all[i]!.x += rng.range(-2, 2);
          all[i]!.z += rng.range(-2, 2);
        }
        let removed = 0;
        const t0 = performance.now();
        for (let i = 0; i < all.length; i++) if (grid.removeItem(all[i]!)) removed++;
        const ms = performance.now() - t0;
        expect(removed).toBe(n);
        expect(grid.size).toBe(0);
        expect(grid.removeItem(all[0]!)).toBe(false);
        if (ms < best) best = ms;
      }
      return best;
    };
    measure(2000); // échauffement du compilateur
    const five = measure(5000);
    const thirty = measure(30000);
    console.log(`[adverse] SpatialHash.removeItem un à un : 5 000 → ${five.toFixed(2)} ms | 30 000 → ${thirty.toFixed(2)} ms`);
    // 30 000 retraits : quelques millisecondes en temps constant, plus de deux secondes avec une recherche
    // linéaire par retrait (≈ 450 millions de comparaisons). Le seuil laisse une large marge à une machine chargée.
    expect(thirty).toBeLessThan(400);
  });
});

// ───────────────────────────── géométrie ─────────────────────────────

describe('adverse — géométrie', () => {
  it('cap : une boîte de cap π/2 (est) a son grand axe le long de x', () => {
    // avant = (sin h, cos h) : h = π/2 → (1, 0)
    expect(forwardX(Math.PI / 2)).toBeCloseTo(1, 12);
    expect(forwardZ(Math.PI / 2)).toBeCloseTo(0, 12);
    // boîte halfX = 1 (largeur), halfZ = 3 (longueur, le long du cap)
    expect(distSqPointObb(2.5, 0, 0, 0, 1, 3, Math.PI / 2)).toBe(0); // dans la longueur
    expect(distSqPointObb(0, 2.5, 0, 0, 1, 3, Math.PI / 2)).toBeCloseTo(1.5 * 1.5, 9); // hors de la largeur
    // un véhicule de cap π/2 : sa droite est au sud (+z)
    expect(vehicleToWorldX(1, 0, Math.PI / 2)).toBeCloseTo(0, 12);
    expect(vehicleToWorldZ(1, 0, Math.PI / 2)).toBeCloseTo(1, 12);
    // cap π (nord) : avant = (0, −1), droite = est (+x)
    expect(forwardZ(Math.PI)).toBeCloseTo(-1, 12);
    expect(vehicleToWorldX(1, 0, Math.PI)).toBeCloseTo(1, 12);
  });

  it('disque contre boîte orientée, 20 000 cas aléatoires : sortie finie, minimale, et le disque ne touche plus', () => {
    const rng = createRng(77);
    const out: Vec2 = { x: 0, z: 0 };
    let hits = 0;
    for (let i = 0; i < 20000; i++) {
      const cx = rng.range(-5, 5);
      const cz = rng.range(-5, 5);
      const hx = rng.range(0.05, 3);
      const hz = rng.range(0.05, 6);
      const h = rng.range(-10, 10);
      const r = rng.range(0.05, 1.5);
      const px = cx + rng.range(-8, 8);
      const pz = cz + rng.range(-8, 8);
      const d2 = distSqPointObb(px, pz, cx, cz, hx, hz, h);
      const hit = circleVsObb(px, pz, r, cx, cz, hx, hz, h, out);
      expect(hit).toBe(d2 < r * r);
      expect(Number.isFinite(out.x) && Number.isFinite(out.z)).toBe(true);
      if (!hit) {
        expect(out.x).toBe(0);
        expect(out.z).toBe(0);
        continue;
      }
      hits++;
      const after = Math.sqrt(distSqPointObb(px + out.x, pz + out.z, cx, cz, hx, hz, h));
      expect(after).toBeGreaterThan(r - 1e-6); // dégagé…
      expect(after).toBeLessThan(r + 1e-6); // … et tangent : pas de téléportation
      // sortie minimale : jamais plus loin que « rayon + demi-petite dimension »
      expect(Math.hypot(out.x, out.z)).toBeLessThanOrEqual(r + Math.min(hx, hz) + 1e-9);
    }
    expect(hits).toBeGreaterThan(2000);
  });

  it('segment contre boîte orientée, 5 000 cas aléatoires comparés à un échantillonnage', () => {
    const rng = createRng(78);
    const cast: SegmentCast = { t: 0, nx: 0, nz: 0 };
    let hits = 0;
    const N = 800;
    for (let i = 0; i < 5000; i++) {
      const cx = rng.range(-3, 3);
      const cz = rng.range(-3, 3);
      const hx = rng.range(0.2, 2);
      const hz = rng.range(0.2, 4);
      const h = rng.range(-7, 7);
      const ax = rng.range(-9, 9);
      const az = rng.range(-9, 9);
      const bx = rng.range(-9, 9);
      const bz = rng.range(-9, 9);
      let first = -1;
      let nearest = Infinity;
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const d2 = distSqPointObb(ax + (bx - ax) * t, az + (bz - az) * t, cx, cz, hx, hz, h);
        if (d2 < nearest) nearest = d2;
        if (d2 === 0 && first < 0) first = t;
      }
      const hit = segmentVsObb(ax, az, bx, bz, cx, cz, hx, hz, h, cast);
      if (first >= 0) {
        expect(hit).toBe(true);
        expect(Math.abs(cast.t - first)).toBeLessThan(1 / N + 1e-9);
        expect(Math.hypot(cast.nx, cast.nz)).toBeCloseTo(1, 9);
        // la normale s'oppose à la progression du segment (ou lui est orthogonale en cas de frôlement)
        expect(cast.nx * (bx - ax) + cast.nz * (bz - az)).toBeLessThanOrEqual(1e-9);
        hits++;
      } else if (nearest > 1e-3) {
        expect(hit).toBe(false); // passe franchement à côté (les frôlements sont laissés de côté)
      }
    }
    expect(hits).toBeGreaterThan(500);
  });

  it('une boîte corrompue (NaN) ne contamine rien : ni poussée, ni obstacle, ni présence', () => {
    const out: Vec2 = { x: 7, z: 7 };
    const cast: SegmentCast = { t: 0.5, nx: 1, nz: 0 };
    const nan = Number.NaN;
    for (const [cx, cz, hx, hz, h] of [
      [nan, 0, 1, 2, 0], [0, nan, 1, 2, 0], [0, 0, nan, 2, 0], [0, 0, 1, nan, 0], [0, 0, 1, 2, nan],
      [Infinity, 0, 1, 2, 0], [0, 0, 1, 2, Infinity],
    ] as const) {
      expect(circleVsObb(0.2, 0.3, 0.3, cx, cz, hx, hz, h, out)).toBe(false);
      expect(out.x).toBe(0);
      expect(out.z).toBe(0);
      expect(segmentVsObb(-5, 0.1, 5, 0.2, cx, cz, hx, hz, h, cast)).toBe(false);
      expect(distSqPointObb(0.2, 0.3, cx, cz, hx, hz, h)).toBe(Infinity);
    }
    // et un disque ou un segment corrompu contre une boîte saine
    expect(circleVsObb(nan, 0, 0.3, 0, 0, 1, 2, 0, out)).toBe(false);
    expect(circleVsObb(0, 0, nan, 0, 0, 1, 2, 0, out)).toBe(false);
    expect(out.x === 0 && out.z === 0).toBe(true);
    expect(segmentVsObb(nan, 0, 5, 0, 0, 0, 1, 2, 0, cast)).toBe(false);
    expect(segmentVsObb(-5, 0, 5, nan, 0, 0, 1, 2, 0, cast)).toBe(false);
  });

  it('segment contre disque de rayon nul ou corrompu : pas de normale infinie', () => {
    const cast: SegmentCast = { t: 0, nx: 0, nz: 0 };
    // le segment passe exactement par le centre d'un disque de rayon 0
    const hit = segmentVsCircle(-1, 0, 1, 0, 0, 0, 0, cast);
    if (hit) {
      expect(Number.isFinite(cast.nx) && Number.isFinite(cast.nz) && Number.isFinite(cast.t)).toBe(true);
      expect(cast.t).toBeCloseTo(0.5, 9);
    }
    expect(segmentVsCircle(-1, 0, 1, 0, Number.NaN, 0, 1, cast)).toBe(false);
    expect(segmentVsCircle(-1, 0, 1, 0, 0, 0, Number.NaN, cast)).toBe(false);
    expect(segmentVsCircle(Number.NaN, 0, 1, 0, 0, 0, 1, cast)).toBe(false);
  });
});

// ───────────────────────────── générateur aléatoire ─────────────────────────────

describe('adverse — générateur aléatoire', () => {
  it('graines tordues : toujours un flux valide et reproductible', () => {
    const seeds: unknown[] = [Number.NaN, Infinity, -Infinity, 2 ** 53, -0, 1e-9, undefined, null, 'texte', 0xffffffff + 1];
    for (const s of seeds) {
      const a = createRng(s as number);
      const b = createRng(s as number);
      for (let i = 0; i < 50; i++) {
        const v = a.next();
        expect(v).toBe(b.next());
        expect(v >= 0 && v < 1).toBe(true);
      }
      expect(Number.isInteger(a.seed) && a.seed >= 0 && a.seed <= 0xffffffff).toBe(true);
    }
  });

  it('bornes tordues : int, range, pick et chance ne renvoient jamais de valeur hors domaine', () => {
    const rng = createRng(3);
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(-3, 4);
      expect(Number.isInteger(v) && v >= -3 && v < 4).toBe(true);
      const big = rng.int(0, 0xffffffff);
      expect(big >= 0 && big < 0xffffffff).toBe(true);
    }
    expect(rng.int(5, 5)).toBe(5);
    expect(rng.int(5, 2)).toBe(5);
    expect(rng.int(2, Number.NaN)).toBe(2);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(-1)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    expect(rng.chance(Number.NaN)).toBe(false);
    expect(() => rng.pick([])).toThrow(RangeError);
    // forks : nombre et chaîne sont des labels distincts ; un fork de fork est reproductible
    expect(rng.fork(5).next()).not.toBe(rng.fork('5').next());
    expect(rng.fork('a').fork('b').next()).toBe(createRng(3).fork('a').fork('b').next());
    expect(rng.fork(Number.NaN).next()).toBe(rng.fork(Number.NaN).next());
  });
});
