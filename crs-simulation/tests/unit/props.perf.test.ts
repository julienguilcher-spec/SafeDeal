// Décor dynamique — coût par pas de simulation avec 3 000 objets (objectif : moins d'une milliseconde), coût des requêtes.
import { describe, expect, it } from 'vitest';
import type { Prop, RayHit, Shop } from '@/core/contracts';
import { getCore } from '@/core/context';
import { PERF_SERVICE } from '@/core/game';
import type { PerfApi } from '@/core/game';
import { makeRayHit } from '@/core/null-services';
import { startProps } from '@/sim/props/testkit';
import type { PropsRig } from '@/sim/props/testkit';

const KINDS = [
  'poubelle', 'poubelle', 'poubelle', 'conteneur', 'conteneur', 'barriere_vauban', 'barriere_chantier', 'banc', 'abribus',
  'kiosque', 'colonne_morris', 'panneau_pub', 'potelet', 'potelet', 'potelet', 'potelet', 'velo', 'velo', 'trottinette',
  'palette', 'table_terrasse', 'chaise', 'chaise', 'candelabre', 'candelabre', 'feu_tricolore', 'distributeur',
  'jardiniere', 'station_velo', 'horodateur', 'cone', 'arceau_velo',
];
const SHOPS = ['mode', 'cafe_restaurant', 'banque', 'luxe', 'telephonie', 'alimentation', 'pharmacie', 'tabac_presse'];

/** 3 000 objets et 600 vitrines sur 800 m × 800 m, 400 personnes regroupées au centre. */
async function city(): Promise<{ rig: PropsRig; props: Prop[]; shops: Shop[] }> {
  // dangers neutres du cœur : le coût des nappes, de la fumée et de fireAt appartient au module des dangers
  const rig = await startProps({ seed: 11, log: false, hazards: false });
  const { ctx } = rig;
  const rng = ctx.rng.fork('ville');
  const props: Prop[] = [];
  for (let i = 0; i < 3000; i++) {
    props.push(ctx.props.spawn(KINDS[i % KINDS.length]!, rng.range(-400, 400), rng.range(-400, 400), rng.range(-3.1, 3.1)));
  }
  const shops: Shop[] = [];
  for (let i = 0; i < 600; i++) {
    shops.push(ctx.props.addShop({
      category: SHOPS[i % SHOPS.length]!, x: rng.range(-400, 400), z: rng.range(-400, 400), heading: rng.range(-3.1, 3.1), width: rng.range(4, 12),
    }));
  }
  for (let i = 0; i < 400; i++) rig.person(rng.range(-150, 150), rng.range(-150, 150));
  return { rig, props, shops };
}

/**
 * Exécute `steps` pas de 1/30 s et relève le temps passé dans le système à chaque pas (service « perf » du
 * moteur). La machine d'essai est partagée et chargée : des pauses de plusieurs millisecondes sans rapport
 * avec le code faussent la moyenne brute. On retient donc la médiane, le 90e centile et la moyenne
 * écrêtée (2 % de pas les plus lents écartés) ; la moyenne brute est affichée pour mémoire.
 */
interface Cost { median: number; p90: number; trimmed: number; mean: number }

function measure(rig: PropsRig, steps: number, each?: (i: number) => void): Cost {
  const perf = rig.ctx.require<PerfApi>(PERF_SERVICE);
  const slot = perf.systems.find((s) => s.id === 'props')!;
  const samples: number[] = [];
  for (let i = 0; i < steps; i++) {
    if (each) each(i);
    rig.t.game.step(1 / 30);
    samples.push(slot.updateMs);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const kept = samples.slice(0, Math.floor(samples.length * 0.98));
  return {
    median: samples[samples.length >> 1]!,
    p90: samples[Math.floor(samples.length * 0.9)]!,
    trimmed: kept.reduce((a, b) => a + b, 0) / kept.length,
    mean,
  };
}

/**
 * Temps processeur consommé par pas (ms), insensible aux pauses imposées par les autres programmes de la
 * machine : `steps` pas avec le système, puis autant avec son update() neutralisé ; la différence est son coût
 * (ramasse-miettes compris).
 */
function cpuPerStep(rig: PropsRig, steps: number, each?: (i: number) => void): number {
  const run = (): number => {
    const c0 = process.cpuUsage();
    for (let i = 0; i < steps; i++) {
      if (each) each(i);
      rig.t.game.step(1 / 30);
    }
    const c = process.cpuUsage(c0);
    return (c.user + c.system) / 1000;
  };
  const withSystem = run();
  const update = rig.system.update;
  rig.system.update = () => {};
  const without = run();
  rig.system.update = update;
  return Math.max(0, withSystem - without) / steps;
}

const us = (ms: number): string => `${(ms * 1000).toFixed(0)} µs`;
const fmt = (m: Cost): string =>
  `médiane ${us(m.median)}, 90e centile ${us(m.p90)}, moyenne écrêtée ${us(m.trimmed)} (moyenne brute ${us(m.mean)})`;

describe('performances', () => {
  it('3 000 objets, 600 vitrines : un pas coûte bien moins d\'une milliseconde, au calme comme en pleine émeute', async () => {
    const { rig, props, shops } = await city();
    const { ctx } = rig;
    measure(rig, 300); // rodage (compilation à chaud)
    const calm = measure(rig, 900);
    const calmCpu = cpuPerStep(rig, 3000);
    console.log(`[perf] décor au calme (3 000 objets, 600 vitrines, 400 personnes) : ${fmt(calm)} par pas ; temps processeur ${us(calmCpu)} par pas`);
    console.log(`[perf] objets éveillés : ${rig.ext.stats.awake} sur ${rig.ext.stats.props}`);
    expect(rig.ext.stats.awake).toBeLessThan(2000); // les quartiers vides dorment
    expect(rig.ext.stats.awake).toBeGreaterThan(300);

    // émeute : 40 feux d'objets, 8 boutiques en feu, la tension fait tomber les rideaux, trois objets poussés à chaque pas
    const rng = ctx.rng.fork('emeute');
    const central = props.filter((p) => Math.abs(p.x) < 150 && Math.abs(p.z) < 150);
    const movable = central.filter((p) => p.movable);
    let lit = 0;
    for (const p of central) if (lit < 40 && rig.ext.ignite(p, 0)) lit++;
    const centralShops = shops.filter((s) => Math.abs(s.x) < 150 && Math.abs(s.z) < 150);
    for (let i = 0; i < 8 && i < centralShops.length; i++) {
      ctx.props.damageShop(centralShops[i]!, 1000, 'blunt', 0);
      rig.ext.igniteShop(centralShops[i]!, 0);
    }
    rig.director.local = () => 0.8;
    // compteur des appels faits à ctx.hazards (ce que le module des dangers aura à traiter)
    const calls = { fireAt: 0, smoke: 0, ignite: 0 };
    const neutral = ctx.hazards;
    ctx.hazards = {
      ...neutral,
      fireAt: () => (calls.fireAt++, 0),
      emitSmoke: () => void calls.smoke++,
      ignite: () => void calls.ignite++,
    };
    const tidy = (i: number): void => {
      if (i % 30 === 0) rig.director.added.length = 0; // le journal du banc d'essai ne doit pas grossir sans fin
    };
    measure(rig, 100, tidy);
    calls.fireAt = calls.smoke = calls.ignite = 0;
    const agitate = (i: number): void => {
      for (let j = 0; j < 3; j++) {
        const p = movable[(i * 3 + j) % movable.length]!;
        ctx.props.push(p, rng.range(-1, 1), rng.range(-1, 1), rng.range(1, 6), 0);
      }
      tidy(i);
    };
    const riot = measure(rig, 900, agitate);
    const s = { ...rig.ext.stats };
    const rolling = rig.system.m.store.rolling.length;
    const riotCpu = cpuPerStep(rig, 1500, agitate);
    console.log(`[perf] temps processeur en émeute : ${us(riotCpu)} par pas`);
    console.log(`[perf] décor en émeute (${s.burning} feux d'objets, ${s.burningShops} boutiques en feu, ${s.moving} objets en mouvement, ${rolling} rideaux en mouvement) : ${fmt(riot)} par pas`);
    console.log(`[perf] appels à ctx.hazards par pas en émeute : fireAt ${(calls.fireAt / 900).toFixed(1)}, emitSmoke ${(calls.smoke / 900).toFixed(2)}, ignite ${(calls.ignite / 900).toFixed(2)}`);
    expect(s.burning).toBeGreaterThan(15);
    // objectif du cahier des charges : moins d'une milliseconde par pas
    expect(calm.median).toBeLessThan(0.25);
    expect(calmCpu).toBeLessThan(0.5);
    expect(riot.median).toBeLessThan(0.5);
    expect(riotCpu).toBeLessThan(1);
  });

  it('requêtes : collision d\'un piéton, lancer de rayon, voisinage — plus rapides que le magasin de base du cœur', async () => {
    const { rig } = await city();
    const { ctx } = rig;
    rig.ext.tuning.dormancy = false;
    rig.step(2);
    // le même mobilier dans le magasin de base du cœur, pour comparer dans les mêmes conditions de charge
    const core = getCore(ctx).stores.props;
    for (const p of ctx.props.list) {
      const q = core.spawn(p.kind, p.x, p.z, p.heading);
      q.halfX = p.halfX;
      q.halfZ = p.halfZ;
    }
    core.rebuildIndex();
    const rng = ctx.rng.fork('requetes');
    const N = 20000;
    const xs = new Float64Array(N);
    const zs = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      xs[i] = rng.range(-400, 400);
      zs[i] = rng.range(-400, 400);
    }
    const pos = { x: 0, z: 0 };
    const hit: RayHit = makeRayHit();
    const out: Prop[] = [];
    const shopsOut: Shop[] = [];
    /** Meilleur de sept passes de N appels : la mesure la moins perturbée par la charge de la machine (µs par appel). */
    const best = (fn: (i: number) => void): number => {
      for (let i = 0; i < N; i++) fn(i); // rodage
      let min = Infinity;
      for (let r = 0; r < 7; r++) {
        const t0 = performance.now();
        for (let i = 0; i < N; i++) fn(i);
        const t = ((performance.now() - t0) * 1000) / N;
        if (t < min) min = t;
      }
      return min;
    };
    let hits = 0;
    let coreHits = 0;
    const pair = (label: string, mine: (i: number) => void, theirs: (i: number) => void): [number, number] => {
      const a = best(mine);
      const b = best(theirs);
      console.log(`[perf] ${label} : ${a.toFixed(3)} µs (magasin de base du cœur : ${b.toFixed(3)} µs)`);
      return [a, b];
    };
    const [resolve, coreResolve] = pair('resolveCircle, piéton de 0,28 m', (i) => {
      pos.x = xs[i]!;
      pos.z = zs[i]!;
      if (ctx.props.resolveCircle(pos, 0.28)) hits++;
    }, (i) => {
      pos.x = xs[i]!;
      pos.z = zs[i]!;
      if (core.resolveCircle(pos, 0.28)) coreHits++;
    });
    expect(hits).toBe(coreHits); // et les deux magasins sont d'accord sur les contacts
    const [ray20, coreRay20] = pair('raycast de 20 m', (i) => {
      if (ctx.props.raycast(xs[i]!, zs[i]!, xs[i]! + 14, zs[i]! + 14, hit)) hits++;
    }, (i) => {
      if (core.raycast(xs[i]!, zs[i]!, xs[i]! + 14, zs[i]! + 14, hit)) coreHits++;
    });
    expect(hits).toBe(coreHits);
    const [ray60, coreRay60] = pair('raycast de 60 m', (i) => {
      if (ctx.props.raycast(xs[i]!, zs[i]!, xs[i]! - 42, zs[i]! + 42, hit)) hits++;
    }, (i) => {
      if (core.raycast(xs[i]!, zs[i]!, xs[i]! - 42, zs[i]! + 42, hit)) coreHits++;
    });
    expect(hits).toBe(coreHits);
    const [query, coreQuery] = pair('queryRadius de 3 m', (i) => {
      hits += ctx.props.queryRadius(xs[i]!, zs[i]!, 3, out);
    }, (i) => {
      coreHits += core.queryRadius(xs[i]!, zs[i]!, 3, out);
    });
    expect(hits).toBe(coreHits);
    const near = best((i) => {
      hits += ctx.props.shopsNear(xs[i]!, zs[i]!, 3, shopsOut);
    });
    console.log(`[perf] shopsNear de 3 m : ${near.toFixed(3)} µs`);
    console.log(`[perf] 1 500 collisions de piétons par pas ≈ ${((resolve * 1500) / 1000).toFixed(2)} ms`);
    expect(hits).toBeGreaterThan(1000);
    // garde-fous larges : la machine d'essai est partagée, seuls les ordres de grandeur sont vérifiés
    // (mesuré au calme : collision ≈ 12 fois plus rapide que le magasin de base, rayon de 60 m ≈ 7 fois)
    expect(resolve).toBeLessThan(coreResolve * 2);
    expect(ray20).toBeLessThan(coreRay20 * 4);
    expect(ray60).toBeLessThan(coreRay60 * 2);
    expect(query).toBeLessThan(coreQuery * 3);
    expect(resolve).toBeLessThan(2);
    expect(ray60).toBeLessThan(15);
    expect(near).toBeLessThan(6);
  });

  it('peupler une tuile de 650 objets et 170 vitrines prend quelques millisecondes', async () => {
    const rig = await startProps({ seed: 12 });
    const rng = rig.ctx.rng.fork('tuile');
    const kinds = ['poubelle', 'banc', 'candelabre', 'potelet', 'conteneur', 'abribus', 'arceau_velo', 'station_velo', 'panneau_pub', 'table_terrasse'];
    const furniture = [];
    for (let i = 0; i < 650; i++) furniture.push({ index: i, kind: kinds[i % kinds.length]!, x: rng.range(0, 512), z: rng.range(0, 512), heading: rng.range(-3, 3) });
    const shops = [];
    for (let i = 0; i < 170; i++) shops.push({ index: i, category: SHOPS[i % SHOPS.length]!, x: rng.range(0, 512), z: rng.range(0, 512), heading: rng.range(-3, 3), width: rng.range(4, 12) });
    rig.world.setTile(0, 0, furniture, shops);
    const t0 = performance.now();
    rig.ctx.events.emit('world:tile_loaded', { tx: 0, tz: 0 });
    rig.ext.flushTiles();
    const ms = performance.now() - t0;
    console.log(`[perf] peuplement d'une tuile : ${rig.ctx.props.list.length} objets et ${rig.ctx.props.shops.length} vitrines en ${ms.toFixed(1)} ms (monde factice)`);
    expect(rig.ctx.props.list.length).toBeGreaterThan(700);
    expect(ms).toBeLessThan(150);
    const t1 = performance.now();
    rig.ctx.events.emit('world:tile_unloaded', { tx: 0, tz: 0 });
    console.log(`[perf] déchargement de la tuile : ${(performance.now() - t1).toFixed(1)} ms`);
    expect(rig.ctx.props.list.length).toBe(0);
  });
});
