// Service de lecture « hazards.field », visibilité, fumée colorée, grille creuse, remise à zéro.
import { describe, expect, it } from 'vitest';
import { CELL_RECORD, HAZARD_FIELD_SERVICE, HAZARDS_SYSTEM_ID, createHazardSystems } from '@/sim/hazards';
import type { HazardFieldView } from '@/sim/hazards';
import { SystemOrder } from '@/core/contracts';
import { FieldGrid } from '@/sim/hazards/grid';
import { StaticCache } from '@/sim/hazards/statics';
import { makeTuning } from '@/sim/hazards/config';
import { createNullWorld } from '@/core/null-services';
import { createRng } from '@/core/rng';
import { STEADY, fakeWorld, fieldChecksum, fieldStats, startHazards } from '@/sim/hazards/testkit';

const DT = 1 / 30;

describe('visibilité', () => {
  it('parfaite dans l\'air pur, chute dans la fumée', async () => {
    const rig = await startHazards({ tuning: { ...STEADY, smokeDecay: 0 } });
    expect(rig.hazards.visibility(0, 0, 80, 30)).toBe(1);
    rig.hazards.emitSmoke(20, 0, 1, 6, 0x141414); // écran de fumée entre les deux points
    const through = rig.hazards.visibility(0, 0, 40, 0);
    expect(through).toBeLessThan(0.1);
    expect(rig.hazards.visibility(40, 0, 0, 0)).toBeCloseTo(through, 6); // symétrique
    expect(rig.hazards.visibility(0, 0, 10, 0)).toBe(1); // avant l'écran
    expect(rig.hazards.visibility(0, 20, 40, 20)).toBe(1); // à côté
    // plus on s'enfonce dans la fumée, moins on voit
    const v1 = rig.hazards.visibility(14, 0, 18, 0);
    const v2 = rig.hazards.visibility(14, 0, 22, 0);
    const v3 = rig.hazards.visibility(14, 0, 26, 0);
    expect(v1).toBeLessThan(1);
    expect(v2).toBeLessThan(v1);
    expect(v3).toBeLessThan(v2);
    // deux personnes côte à côte dans la fumée se voient encore
    expect(rig.hazards.visibility(20, 0, 20.5, 0)).toBeGreaterThan(0.7);
    // fumée légère : gêne partielle
    rig.hazards.clear();
    rig.hazards.emitSmoke(20, 0, 0.12, 6);
    const light = rig.hazards.visibility(0, 0, 40, 0);
    expect(light).toBeGreaterThan(0.4);
    expect(light).toBeLessThan(0.95);
    // segment dégénéré ou valeurs absurdes : pas d'erreur
    expect(rig.hazards.visibility(5, 5, 5, 5)).toBe(1);
    expect(rig.hazards.visibility(Number.NaN, 0, 1, 1)).toBe(1);
    expect(rig.hazards.visibility(-5000, 0, 5000, 0)).toBeGreaterThan(0);
  });

  it('le gaz dense gêne la vue, le gaz léger non', async () => {
    const rig = await startHazards({ tuning: { ...STEADY, gasDecay: 0 } });
    rig.hazards.emitGas(20, 0, 0.1, 10); // voile léger : sous le seuil d'opacité
    expect(rig.hazards.visibility(0, 0, 40, 0)).toBe(1);
    rig.hazards.emitGas(20, 0, 0.9, 10); // cœur de nuage
    const dense = rig.hazards.visibility(0, 0, 40, 0);
    expect(dense).toBeLessThan(0.6);
    expect(dense).toBeGreaterThan(0.1); // le lacrymogène voile, il n'occulte pas comme une fumée noire
    // à concentration égale, la fumée est bien plus opaque que le gaz
    rig.hazards.clear();
    rig.hazards.emitSmoke(20, 0, 1, 10);
    expect(rig.hazards.visibility(0, 0, 40, 0)).toBeLessThan(dense * 0.2);
  });

  it('un nuage de grenade réel masque ce qui se trouve derrière lui', async () => {
    const rig = await startHazards();
    for (let s = 0; s < 30 / DT; s++) {
      for (const [x, z] of [[8, 2], [-6, 7], [3, -10], [-11, -4], [12, -8], [-2, 13]] as const) rig.hazards.emitGas(x, z, 0.5 * DT, 2.5);
      rig.t.step(DT, DT);
    }
    const across = rig.hazards.visibility(-30, 0, 30, 0);
    expect(across).toBeLessThan(0.45);
    expect(rig.hazards.visibility(-30, 40, 30, 40)).toBe(1);
  });
});

describe('service de lecture hazards.field', () => {
  it('forEachActiveCell et collectActiveCells décrivent le même champ que gasAt / totalGas', async () => {
    const rig = await startHazards({ wind: [2, 1] });
    for (let s = 0; s < 300; s++) {
      rig.hazards.emitGas(0, 0, 0.5 * DT, 2.5);
      rig.hazards.emitSmoke(30, 10, 0.3 * DT, 3, 0xd62828);
      rig.t.step(DT, DT);
    }
    const view = rig.ctx.require<HazardFieldView>(HAZARD_FIELD_SERVICE);
    expect(view).toBe(rig.view);
    expect(view.cellSize).toBe(2);
    expect(view.blockSize).toBe(32);

    let n = 0;
    let gasSum = 0;
    let smokeSum = 0;
    let mismatch = 0;
    let offGrid = 0;
    const visited = view.forEachActiveCell((x, z, gas, smoke, color) => {
      n++;
      gasSum += gas;
      smokeSum += smoke;
      // centres de cellule : coordonnées impaires
      if (Math.abs((((x - 1) % 2) + 2) % 2) > 1e-9 || Math.abs((((z - 1) % 2) + 2) % 2) > 1e-9) offGrid++;
      // au centre d'une cellule, la lecture interpolée redonne la valeur de la cellule
      if (Math.abs(Math.min(1, gas) - rig.hazards.gasAt(x, z)) > 1e-5) mismatch++;
      if (Math.abs(Math.min(1, smoke) - rig.hazards.smokeAt(x, z)) > 1e-5) mismatch++;
      if (smoke > 0.01 && color !== 0xd62828) mismatch++;
      if (smoke === 0 && color !== 0) mismatch++;
    }, 1e-4);
    expect(visited).toBe(n);
    expect(n).toBeGreaterThan(300);
    expect(offGrid).toBe(0);
    expect(mismatch).toBe(0);
    // totalGas compte aussi les cellules sous le seuil du parcours : écart infime
    expect(gasSum * 4).toBeLessThanOrEqual(view.totalGas() + 1e-6);
    expect(gasSum * 4).toBeGreaterThan(view.totalGas() * 0.999);
    expect(smokeSum * 4).toBeGreaterThan(view.totalSmoke() * 0.999);

    // variante sans rappel : mêmes cellules, mêmes valeurs
    const out = new Float32Array(CELL_RECORD * (n + 10));
    expect(view.collectActiveCells(out, 1e-4)).toBe(n);
    let g2 = 0;
    for (let i = 0; i < n; i++) g2 += out[i * CELL_RECORD + 2]!;
    expect(g2).toBeCloseTo(gasSum, 3);
    let k = 0;
    let same = true;
    view.forEachActiveCell((x, z, gas, smoke, color) => {
      const o = k++ * CELL_RECORD;
      if (out[o] !== x || out[o + 1] !== z || out[o + 2] !== Math.fround(gas) || out[o + 3] !== Math.fround(smoke) || out[o + 4] !== color) same = false;
    }, 1e-4);
    expect(same).toBe(true);
    // tableau trop petit : tronqué, sans débordement
    const small = new Float32Array(CELL_RECORD * 7 + 3);
    expect(view.collectActiveCells(small, 1e-4)).toBe(7);

    // seuil et filtre par distance
    const dense = view.forEachActiveCell(() => {}, 0.1);
    expect(dense).toBeGreaterThan(0);
    expect(dense).toBeLessThan(n);
    let nearCount = 0;
    let tooFar = 0;
    view.forEachActiveCell((x, z) => {
      nearCount++;
      if (Math.hypot(x - 30, z - 10) > 12 + 46) tooFar++; // rayon + diagonale d'un bloc
    }, 1e-4, 30, 10, 12);
    expect(nearCount).toBeGreaterThan(0);
    expect(nearCount).toBeLessThan(n);
    expect(tooFar).toBe(0);
    expect(view.forEachActiveCell(() => {}, 1e-4, 5000, 5000, 50)).toBe(0);
  });

  it('revision change à chaque modification ; dérive et compteurs à jour', async () => {
    const rig = await startHazards({ tuning: STEADY, wind: [2, 0] });
    const view = rig.view;
    let r = view.revision;
    rig.hazards.emitGas(0, 0, 0.5, 4);
    expect(view.revision).toBeGreaterThan(r);
    r = view.revision;
    rig.t.step(0.5);
    expect(view.revision).toBeGreaterThan(r);
    r = view.revision;
    rig.hazards.ignite(10, 10, 1, 1, 0);
    expect(view.revision).toBeGreaterThan(r);
    r = view.revision;
    rig.hazards.douse(10, 10, 1, 0.1);
    expect(view.revision).toBeGreaterThan(r);
    r = view.revision;
    rig.hazards.clear();
    expect(view.revision).toBeGreaterThan(r);
    // rien ne bouge → rien ne change (les vues qui se redessinent sur la révision restent au repos)
    r = view.revision;
    rig.hazards.emitGas(0, 0, -1, 4);
    expect(rig.hazards.gasAt(0, 0)).toBe(0);
    rig.t.step(3);
    expect(view.revision).toBe(r);
    // un feu qui brûle fait évoluer la révision à chaque pas
    rig.hazards.ignite(0, 0, 1, 1, 0);
    r = view.revision;
    rig.t.step(DT, DT);
    expect(view.revision).toBeGreaterThan(r);
    rig.hazards.clear();

    rig.hazards.emitGas(0, 0, 0.5, 4);
    rig.t.step(0.5);
    expect(view.driftX).toBeCloseTo(1.6, 6);
    expect(view.driftZ).toBeCloseTo(0, 6);
    const st = view.stats;
    expect(st.blocks).toBeGreaterThan(0);
    expect(st.smokeBlocks).toBe(0);
    expect(st.fieldSteps).toBeGreaterThan(0);
    expect(st.substeps).toBe(1);
    expect(st.fires).toBe(0);
    expect(st.staticBlocks).toBeGreaterThanOrEqual(st.blocks);
    expect(st.gasMass).toBeGreaterThan(0);
    expect(st.gasMass).toBeCloseTo(view.totalGas(), 1); // masse à l'issue du dernier pas de champ
    expect(st.smokeMass).toBe(0);
  });

  it('fumée colorée : la couleur se transporte avec la fumée et se mélange', async () => {
    const rig = await startHazards({ tuning: { ...STEADY, smokeDecay: 0 }, wind: [3, 0] });
    rig.hazards.emitSmoke(0, 0, 0.8, 5, 0xd62828); // fumigène rouge
    expect(rig.hazards.smokeAt(0, 0)).toBeGreaterThan(0.6);
    expect(rig.hazards.gasAt(0, 0)).toBe(0);
    rig.t.step(10);
    // le nuage a dérivé de 24 m et il est toujours rouge
    let cx = 0;
    let mass = 0;
    let wrong = 0;
    rig.view.forEachActiveCell((x, _z, _g, smoke, color) => {
      cx += x * smoke;
      mass += smoke;
      if (smoke > 0.01 && color !== 0xd62828) wrong++;
    }, 1e-4);
    expect(cx / mass).toBeCloseTo(24, 0);
    expect(wrong).toBe(0);

    // mélange : fumée noire d'incendie déposée dans le nuage rouge → teinte intermédiaire, pondérée par les densités
    const mix = await startHazards({ tuning: { ...STEADY, smokeDecay: 0 } });
    mix.hazards.emitSmoke(0, 0, 0.5, 6, 0xff0000);
    mix.hazards.emitSmoke(0, 0, 0.5, 6, 0x0000ff);
    mix.hazards.emitSmoke(40, 0, 0.5, 6); // couleur par défaut : gris sombre
    let purple = 0;
    let grey = 0;
    let other = 0;
    mix.view.forEachActiveCell((x, _z, _g, smoke, color) => {
      if (smoke < 0.01) return;
      const r = (color >> 16) & 255;
      const g = (color >> 8) & 255;
      const b = color & 255;
      // le second dépôt est un peu amoindri par la saturation douce : violet tirant légèrement sur le rouge
      if (x < 20 && g === 0 && r >= b && r - b <= 30 && r > 115 && r < 150 && r + b >= 253 && r + b <= 257) purple++;
      else if (x > 20 && color === 0x2b2b2b) grey++;
      else other++;
    }, 0.01);
    expect(purple).toBeGreaterThan(10);
    expect(grey).toBeGreaterThan(10);
    expect(other).toBe(0);
    // les deux nuages se rejoignent en diffusant : entre eux, la teinte est un mélange, jamais hors gamme
    mix.t.step(120);
    let bad = 0;
    mix.view.forEachActiveCell((_x, _z, _g, smoke, color) => {
      if (smoke > 0 && (color < 0 || color > 0xffffff || !Number.isInteger(color))) bad++;
    }, 1e-4);
    expect(bad).toBe(0);
  });
});

describe('grille creuse', () => {
  it('les blocs sont alloués à la demande, libérés quand ils sont vides, puis réutilisés', async () => {
    const rig = await startHazards({ wind: [4, 0] });
    expect(rig.view.stats.blocks).toBe(0);
    rig.hazards.emitGas(5, 5, 0.8, 5);
    expect(rig.view.stats.blocks).toBe(1); // le dépôt tient dans un seul bloc de 32 m
    let peak = 0;
    for (let t = 0; t < 400; t++) {
      rig.t.step(0.5);
      const b = rig.view.stats.blocks;
      if (b > peak) peak = b;
      if (b === 0) break;
    }
    expect(peak).toBeGreaterThan(2); // le nuage a traversé plusieurs blocs
    expect(peak).toBeLessThan(40); // sans en garder la traînée
    expect(rig.view.stats.blocks).toBe(0);
    expect(rig.view.totalGas()).toBe(0);
    const pooled = rig.view.stats.pooledBlocks;
    expect(pooled).toBeGreaterThanOrEqual(peak);
    // nouvelle émission : les blocs sortent de la réserve
    rig.hazards.emitGas(-200, 300, 0.8, 5);
    expect(rig.view.stats.blocks).toBeGreaterThan(0);
    expect(rig.view.stats.blocks + rig.view.stats.pooledBlocks).toBe(pooled);
    expect(rig.hazards.gasAt(-200, 300)).toBeGreaterThan(0.5);
  });

  it('table des blocs : insertions et retraits en masse restent cohérents', () => {
    const world = createNullWorld();
    const grid = new FieldGrid(new StaticCache(() => world, makeTuning()));
    const rng = createRng(12);
    const live = new Map<string, { bx: number; bz: number }>();
    for (let round = 0; round < 4000; round++) {
      const bx = rng.int(-18, 18);
      const bz = rng.int(-18, 18);
      const key = `${bx},${bz}`;
      if (live.has(key) && rng.chance(0.6)) {
        grid.release(grid.find(bx, bz)!);
        live.delete(key);
      } else if (live.size < 700) {
        const b = grid.ensure(bx, bz);
        expect(b).not.toBeNull();
        expect(b!.bx).toBe(bx);
        expect(b!.bz).toBe(bz);
        live.set(key, { bx, bz });
      }
      if (round % 200 === 0) {
        expect(grid.blocks.length).toBe(live.size);
        for (let x = -18; x < 18; x++) {
          for (let z = -18; z < 18; z++) {
            const b = grid.find(x, z);
            if (live.has(`${x},${z}`)) {
              expect(b).not.toBeNull();
              expect(b!.bx === x && b!.bz === z).toBe(true);
              // liens de voisinage tenus à jour
              expect(b!.e).toBe(grid.find(x + 1, z));
              expect(b!.w).toBe(grid.find(x - 1, z));
              expect(b!.n).toBe(grid.find(x, z - 1));
              expect(b!.s).toBe(grid.find(x, z + 1));
            } else {
              expect(b).toBeNull();
            }
          }
        }
      }
    }
    // plafond : au-delà de 768 blocs, ensure refuse sans planter
    grid.clear();
    let made = 0;
    for (let x = 0; x < 40; x++) for (let z = 0; z < 25; z++) if (grid.ensure(x, z) !== null) made++;
    expect(made).toBe(768);
    expect(grid.refused).toBe(1000 - 768);
    expect(grid.ensure(20000, 0)).toBeNull(); // hors des indices admis
    grid.clear();
    expect(grid.blocks.length).toBe(0);
    expect(grid.find(3, 3)).toBeNull();
  });

  it('cache du bâti : masque par cellule, rues analysées en différé, plein vent sans tableau', () => {
    const tuning = makeTuning();
    const world = fakeWorld((x, z) => Math.abs(x) > 5 && Math.abs(x) < 60 && Math.abs(z) < 200); // rue nord-sud de 10 m
    let calls = 0;
    const counted = { ...world, buildingHeightAt: (x: number, z: number): number => (calls++, world.buildingHeightAt(x, z)) };
    const cache = new StaticCache(() => counted, tuning);
    const st = cache.acquire(0, 0)!; // bloc x 0..32, z 0..32
    expect(calls).toBe(256); // une lecture du monde par cellule
    expect(st.level).toBe(1);
    expect(st.solid).not.toBeNull();
    expect(st.solid![0]).toBe(0); // (1, 1) : chaussée
    expect(st.solid![2]).toBe(0); // (5, 1) : centre de cellule à x = 5, limite exclue
    expect(st.solid![3]).toBe(1); // (7, 1) : immeuble
    cache.peek(0, 0);
    expect(calls).toBe(256); // en cache
    const ready: number[] = [];
    expect(cache.runJobs(4, (s) => ready.push(s.key))).toBe(1);
    expect(ready).toEqual([st.key]);
    expect(st.level).toBe(2);
    expect(calls).toBe(256 * 9); // les huit voisins ont été lus pour l'analyse
    // cellule de chaussée : axe de la rue = nord-sud (axe 4 = 90°), plein abri de travers
    expect(st.axis![0]).toBe(4);
    expect(st.across![0]).toBe(0);
    expect(st.along![0]).toBe(Math.round(255 * tuning.canyonAlong));
    expect(cache.runJobs(4, () => {})).toBe(0);

    // terrain dégagé : aucun tableau
    const open = new StaticCache(() => createNullWorld(), tuning);
    const o = open.acquire(3, -7)!;
    open.runJobs(1, () => {});
    expect(o.level).toBe(2);
    expect(o.solid).toBeNull();
    expect(o.axis).toBeNull();
    expect(o.uniform).toBe(true);

    // invalidation d'une tuile : les entrées de la zone sont oubliées et marquées
    expect(cache.invalidateRect(0, 0, 512, 512)).toBeGreaterThan(0);
    expect(st.stale).toBe(true);
    const again = cache.peek(0, 0)!;
    expect(again).not.toBe(st);
    expect(again.stale).toBe(false);
  });
});

describe('remise à zéro', () => {
  it('clear() retire gaz, fumée et feux ; le champ reste utilisable', async () => {
    const rig = await startHazards({ wind: [1, 0] });
    rig.hazards.emitGas(0, 0, 0.8, 6);
    rig.hazards.emitSmoke(10, 0, 0.8, 6);
    rig.hazards.ignite(20, 0, 2, 1, 0);
    rig.t.step(3);
    expect(rig.view.stats.blocks).toBeGreaterThan(0);
    rig.hazards.clear();
    expect(rig.hazards.gasAt(0, 0)).toBe(0);
    expect(rig.hazards.smokeAt(10, 0)).toBe(0);
    expect(rig.hazards.fireAt(20, 0)).toBe(0);
    expect(rig.hazards.visibility(-20, 0, 40, 0)).toBe(1);
    expect(rig.view.fires.length).toBe(0);
    expect(rig.view.stats.blocks).toBe(0);
    expect(rig.view.totalGas()).toBe(0);
    expect(rig.view.forEachActiveCell(() => {})).toBe(0);
    rig.t.step(2); // rien ne revient
    expect(rig.view.totalGas() + rig.view.totalSmoke()).toBe(0);
    rig.hazards.emitGas(0, 0, 0.8, 6);
    expect(rig.hazards.gasAt(0, 0)).toBeGreaterThan(0.6);
  });

  it('une nouvelle session repart d\'un champ vide et rejoue à l\'identique', async () => {
    const rig = await startHazards({ seed: 6, wind: [2, 1] });
    const play = (): number => {
      rig.ctx.env.setWind(2, 1);
      for (let s = 0; s < 300; s++) {
        rig.hazards.emitGas(0, 0, 0.5 * DT, 2.5);
        if (s === 30) rig.hazards.ignite(10, 0, 1.5, 1, 0);
        rig.t.step(DT, DT);
      }
      return fieldChecksum(rig.view);
    };
    const first = play();
    expect(rig.view.fires.length).toBe(1);
    await rig.t.start({ seed: 6 });
    expect(rig.view.stats.blocks).toBe(0);
    expect(rig.view.fires.length).toBe(0);
    expect(rig.view.stats.fieldSteps).toBe(0);
    expect(rig.hazards.gasAt(0, 0)).toBe(0);
    expect(play()).toBe(first); // même graine, même session
    await rig.t.start({ seed: 7 });
    expect(play()).not.toBe(first); // autre graine : autre turbulence
  });

  it('identité du système', () => {
    const systems = createHazardSystems();
    expect(systems.length).toBe(1);
    expect(systems[0]!.id).toBe(HAZARDS_SYSTEM_ID);
    expect(systems[0]!.order).toBe(SystemOrder.HAZARDS);
  });

  it('mesures globales cohérentes', async () => {
    const rig = await startHazards({ tuning: STEADY });
    rig.hazards.emitGas(4, 4, 0.5, 6);
    const s = fieldStats(rig.view);
    expect(s.gas).toBeCloseTo(rig.view.totalGas(), 3);
    expect(s.cx).toBeCloseTo(4, 1);
    expect(s.cz).toBeCloseTo(4, 1);
  });
});
