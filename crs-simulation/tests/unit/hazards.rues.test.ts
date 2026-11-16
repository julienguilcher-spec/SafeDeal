// Gaz et bâti : immeubles infranchissables, rues-canyons (abri, stagnation, canalisation), cache du bâti.
import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@/core/contracts';
import { STEADY, fakeWorld, fieldStats, startHazards } from '@/sim/hazards/testkit';
import type { HazardRig } from '@/sim/hazards/testkit';

const DT = 1 / 30;

/** Rue nord-sud de `width` m de large, bordée d'immeubles profonds de 55 m, longue de 400 m. */
const streetNS = (width: number) => (x: number, z: number): boolean =>
  Math.abs(x) > width / 2 && Math.abs(x) < width / 2 + 55 && Math.abs(z) < 200;
/** Rue à 45° (du nord-ouest vers le sud-est), large de 12 m. */
const streetDiagonal = (x: number, z: number): boolean => {
  const across = (x - z) / Math.SQRT2;
  return Math.abs(across) > 6 && Math.abs(across) < 60;
};
/** Barre d'immeuble de 20 m d'épaisseur et 80 m de long, 10 m à l'est de l'origine. */
const slab = (x: number, z: number): boolean => x > 10 && x < 30 && Math.abs(z) < 40;

/** Un palet à l'origine pendant `seconds`. */
function palet(rig: HazardRig, seconds: number, x = 0, z = 0): void {
  for (let s = 0; s < Math.round(seconds / DT); s++) {
    rig.hazards.emitGas(x, z, 0.5 * DT, 2.5);
    rig.t.step(DT, DT);
  }
}

describe('gaz et bâti', () => {
  it('un immeuble arrête le nuage que le vent pousse contre lui', async () => {
    const open = await startHazards({ tuning: STEADY, wind: [4, 0] });
    const blocked = await startHazards({ tuning: STEADY, wind: [4, 0], built: slab });
    palet(open, 25);
    palet(blocked, 25);
    // sans immeuble, le panache passe à 40 m sous le vent
    expect(open.hazards.gasAt(40, 0)).toBeGreaterThan(0.04);
    // avec l'immeuble : rien dedans, rien derrière
    expect(blocked.hazards.gasAt(20, 0)).toBe(0);
    expect(blocked.hazards.gasAt(20, 30)).toBe(0);
    expect(blocked.hazards.gasAt(40, 0)).toBeLessThan(0.002);
    expect(blocked.hazards.gasAt(60, 0)).toBeLessThan(0.002);
    // le gaz s'accumule au pied de la façade au vent, plus dense qu'en terrain dégagé au même endroit
    expect(blocked.hazards.gasAt(8, 0)).toBeGreaterThan(open.hazards.gasAt(8, 0) * 1.2);
    // aucune cellule active dans le bâti
    let inside = 0;
    blocked.view.forEachActiveCell((x, z) => {
      if (slab(x, z)) inside++;
    }, 1e-4);
    expect(inside).toBe(0);
  });

  it('le gaz contourne l\'obstacle mais ne le traverse pas (air calme, diffusion seule)', async () => {
    const wall = (x: number, z: number): boolean => x > 4 && x < 8 && Math.abs(z) < 14; // mur de 4 m × 28 m
    const rig = await startHazards({ tuning: { ...STEADY, gasDecay: 0 }, built: wall });
    rig.hazards.emitGas(0, 0, 2, 4);
    const m0 = rig.view.totalGas();
    rig.t.step(60);
    expect(rig.hazards.gasAt(6, 0)).toBe(0); // dans le mur
    const against = rig.hazards.gasAt(3, 0); // contre le mur, côté source : le gaz s'y accumule
    const symmetric = rig.hazards.gasAt(-11, 0); // à 11 m de la source, côté dégagé
    const behind = rig.hazards.gasAt(11, 0); // à 11 m aussi, mais derrière le milieu du mur
    const around = rig.hazards.gasAt(7, 17); // au bout du mur : le gaz le contourne
    expect(against).toBeGreaterThan(symmetric * 1.3);
    expect(symmetric).toBeGreaterThan(0.03);
    expect(behind).toBeLessThan(symmetric * 0.1);
    expect(around).toBeGreaterThan(0.005);
    expect(around).toBeGreaterThan(behind);
    // les parois ne détruisent ni ne créent de masse
    expect(rig.view.totalGas() / m0).toBeGreaterThan(0.99);
    expect(rig.view.totalGas() / m0).toBeLessThan(1.0001);
  });

  it('émettre dans le bâti ne dépose rien ; au pied d\'une façade, tout va du côté libre', async () => {
    const rig = await startHazards({ built: slab });
    rig.hazards.emitGas(20, 0, 1, 3); // au cœur de l'immeuble
    expect(rig.view.totalGas()).toBe(0);
    expect(rig.view.stats.blocks).toBe(0); // aucun bloc alloué dans un immeuble
    rig.hazards.emitGas(9.5, 0, 0.5, 3); // contre la façade ouest
    expect(rig.view.totalGas()).toBeCloseTo((0.5 * Math.PI * 9) / 3, 3); // masse entière, côté rue
    expect(rig.hazards.gasAt(12, 0)).toBe(0);
    expect(rig.hazards.gasAt(9, 0)).toBeGreaterThan(0.3);
  });

  it('rue étroite battue de travers : le nuage stagne, alors qu\'il est balayé en terrain dégagé', async () => {
    const open = await startHazards({ wind: [4, 0] });
    const street = await startHazards({ wind: [4, 0], built: streetNS(10) });
    palet(open, 30);
    palet(street, 30);
    const o30 = fieldStats(open.view);
    const s30 = fieldStats(street.view);
    // terrain dégagé : panache étiré sous le vent, faible concentration
    expect(o30.cx).toBeGreaterThan(25);
    expect(o30.maxGas).toBeLessThan(0.3);
    // rue : le nuage reste autour du palet, dense
    expect(Math.hypot(s30.cx, s30.cz)).toBeLessThan(3);
    expect(s30.maxGas).toBeGreaterThan(0.5);
    expect(street.hazards.gasAt(0, 0)).toBeGreaterThan(open.hazards.gasAt(0, 0) * 2.5);

    // 30 s après la fin de l'émission
    open.t.step(30);
    street.t.step(30);
    const o60 = fieldStats(open.view);
    const s60 = fieldStats(street.view);
    expect(o60.maxGas).toBeLessThan(0.02); // dissipé et emporté
    expect(s60.maxGas).toBeGreaterThan(0.1); // toujours là
    expect(Math.hypot(s60.cx, s60.cz)).toBeLessThan(4);
    expect(street.hazards.gasAt(0, 10)).toBeGreaterThan(0.05); // la rue reste chargée à 10 m du palet
    expect(s60.gas).toBeGreaterThan(o60.gas * 2);
    console.log(
      `[rues] vent de travers 4 m/s, 30 s après l'émission : rue de 10 m max ${s60.maxGas.toFixed(3)} (barycentre à ${Math.hypot(s60.cx, s60.cz).toFixed(1)} m du palet) ; `
      + `terrain dégagé max ${o60.maxGas.toFixed(3)} (barycentre à ${o60.cx.toFixed(0)} m)`,
    );
  });

  it('rue étroite sans vent : confinement → plus concentré et plus durable qu\'à l\'air libre', async () => {
    const fade = async (built?: (x: number, z: number) => boolean): Promise<{ at30: number; t10: number }> => {
      const rig = await startHazards({ built });
      palet(rig, 30);
      let t10 = Infinity;
      let at30 = 0;
      for (let t = 1; t <= 200; t++) {
        rig.t.step(1);
        const max = fieldStats(rig.view).maxGas;
        if (t === 30) at30 = max;
        if (t10 === Infinity && max < 0.1) t10 = t;
      }
      return { at30, t10 };
    };
    const open = await fade();
    const street = await fade(streetNS(10));
    const boulevard = await fade(streetNS(30));
    console.log(
      `[rues] air calme, un palet : sous 0,1 à +${open.t10} s (dégagé), +${boulevard.t10} s (boulevard de 30 m), +${street.t10} s (rue de 10 m) ; `
      + `concentration à +30 s : ${open.at30.toFixed(3)} / ${boulevard.at30.toFixed(3)} / ${street.at30.toFixed(3)}`,
    );
    // 00 §G.1 : « rue de moins de 12 m : concentration × 2, durée × 1,5 »
    expect(street.t10 / open.t10).toBeGreaterThan(1.4);
    expect(street.t10 / open.t10).toBeLessThan(2.2);
    expect(street.at30 / open.at30).toBeGreaterThan(1.6);
    expect(street.at30 / open.at30).toBeLessThan(3);
    // un boulevard confine moins qu'une rue étroite
    expect(boulevard.t10).toBeGreaterThanOrEqual(open.t10);
    expect(boulevard.t10).toBeLessThan(street.t10);
  });

  it('vent d\'enfilade : le nuage est canalisé le long de la rue', async () => {
    const rig = await startHazards({ tuning: STEADY, wind: [0, 4], built: streetNS(10) });
    rig.hazards.emitGas(0, 0, 1.5, 4);
    rig.t.step(20);
    const s = fieldStats(rig.view);
    // dérive = vent × 0,8 × 0,75 (frottement des façades d'une rue étroite) = 2,4 m/s
    expect(s.cz).toBeGreaterThan(2.4 * 20 * 0.85);
    expect(s.cz).toBeLessThan(2.4 * 20 * 1.1);
    expect(Math.abs(s.cx)).toBeLessThan(0.5);
    const out: Vec2 = { x: 0, z: 0 };
    rig.view.driftAt(0, s.cz, out);
    expect(out.z).toBeCloseTo(2.4, 1);
    expect(Math.abs(out.x)).toBeLessThan(0.05);
  });

  it('rue en biais : le vent oblique fait filer le nuage dans l\'axe de la rue, pas dans les façades', async () => {
    // rue à 45° ; vent d'ouest (vers +x) : seule sa composante d'enfilade agit
    const rig = await startHazards({ tuning: STEADY, wind: [4, 0], built: streetDiagonal });
    rig.hazards.emitGas(0, 0, 1.5, 4);
    const m0 = rig.view.totalGas();
    rig.t.step(20);
    const s = fieldStats(rig.view);
    const along = (s.cx + s.cz) / Math.SQRT2;
    const across = (s.cx - s.cz) / Math.SQRT2;
    // composante d'enfilade : 4 × cos 45° × 0,8 × 0,75 ≈ 1,7 m/s
    expect(along).toBeGreaterThan(1.7 * 20 * 0.75);
    expect(along).toBeLessThan(1.7 * 20 * 1.15);
    expect(Math.abs(across)).toBeLessThan(1.5);
    // le nuage n'est pas englouti par les façades : l'essentiel de la masse est encore là (dilution comprise)
    expect(rig.view.totalGas() / m0).toBeGreaterThan(0.45);
    const out: Vec2 = { x: 0, z: 0 };
    rig.view.driftAt(s.cx, s.cz, out);
    expect(out.x).toBeGreaterThan(0.8);
    expect(out.z).toBeGreaterThan(0.8);
    expect(Math.abs(out.x - out.z)).toBeLessThan(0.3);
  });

  it('driftAt : pleine dérive en terrain dégagé, nulle dans le bâti, abritée contre une façade', async () => {
    const rig = await startHazards({ tuning: STEADY, wind: [4, 0], built: slab });
    palet(rig, 5); // crée les blocs et laisse l'analyse du bâti se faire
    const out: Vec2 = { x: 0, z: 0 };
    rig.view.driftAt(-300, -300, out); // aucun bloc : dérive générale
    expect(out.x).toBeCloseTo(3.2, 6);
    expect(out.z).toBeCloseTo(0, 6);
    palet(rig, 3, 20, 0);
    rig.view.driftAt(9, 0, out); // à 1 m de la façade au vent : fortement freiné
    expect(out.x).toBeLessThan(1.6);
    expect(out.x).toBeGreaterThanOrEqual(0);
    rig.view.driftAt(-10, 0, out); // à 20 m en amont : déjà ralenti, mais moins
    const far = out.x;
    rig.view.driftAt(4, 0, out);
    expect(out.x).toBeLessThan(far);
    expect(far).toBeLessThanOrEqual(3.2);
  });

  it('tuile rechargée : le bâti est relu et le gaz des cellules devenues bâties disparaît', async () => {
    let built = false;
    const world = fakeWorld((x, z) => built && Math.abs(x) < 6 && Math.abs(z) < 6);
    const rig = await startHazards({ world, tuning: { ...STEADY, gasDecay: 0 } });
    rig.hazards.emitGas(0, 0, 0.8, 12);
    rig.t.step(1);
    expect(rig.hazards.gasAt(0, 0)).toBeGreaterThan(0.3);
    // la tuile (0, 0) arrive avec son bâti : un immeuble de 12 m sur l'origine
    built = true;
    rig.ctx.events.emit('world:tile_loaded', { tx: 0, tz: 0 });
    rig.ctx.events.emit('world:tile_loaded', { tx: -1, tz: -1 });
    rig.ctx.events.emit('world:tile_loaded', { tx: -1, tz: 0 });
    rig.ctx.events.emit('world:tile_loaded', { tx: 0, tz: -1 });
    rig.t.step(1);
    expect(rig.hazards.gasAt(0, 0)).toBe(0);
    expect(rig.hazards.gasAt(3, -3)).toBe(0);
    expect(rig.hazards.gasAt(8, 0)).toBeGreaterThan(0.1); // autour, le nuage est toujours là
    let inside = 0;
    rig.view.forEachActiveCell((x, z) => {
      if (Math.abs(x) < 6 && Math.abs(z) < 6) inside++;
    }, 1e-4);
    expect(inside).toBe(0);
    // un nouveau dépôt respecte le bâti relu
    rig.hazards.emitGas(0, 0, 1, 3);
    expect(rig.hazards.gasAt(0, 0)).toBe(0);
    // changement de carte entière (événement libre du module du monde) : tout le bâti est relu
    built = false;
    rig.ctx.events.emitAny('world:source', { name: 'test', fallback: false });
    rig.t.step(0.5);
    rig.hazards.emitGas(0, 0, 1, 3);
    expect(rig.hazards.gasAt(0, 0)).toBeGreaterThan(0.5);
  });
});

describe('robustesse', () => {
  it('quartier dense, vent tournant, pluie, feux et eau pendant quatre minutes : rien ne diverge', async () => {
    // îlots de 48 m séparés par des rues de 12 m, percés de cours intérieures
    const city = (x: number, z: number): boolean => {
      const u = ((x % 60) + 60) % 60;
      const v = ((z % 60) + 60) % 60;
      if (u < 12 || v < 12) return false; // rues
      return !(u > 26 && u < 46 && v > 26 && v < 46); // cour
    };
    const rig = await startHazards({ seed: 17, built: city });
    const rng = rig.ctx.rng.fork('essai');
    let worstBlocks = 0;
    for (let s = 0; s < 240 / DT; s++) {
      const time = s * DT;
      if (s % 150 === 0) {
        // le vent tourne et forcit par à-coups, jusqu'à la tempête
        const a = rng.next() * Math.PI * 2;
        const speed = rng.chance(0.2) ? rng.range(10, 25) : rng.range(0, 6);
        rig.ctx.env.setWind(Math.cos(a) * speed, Math.sin(a) * speed);
        rig.ctx.env.setWeather(rng.pick(['clair', 'pluie', 'averse', 'couvert'] as const), true);
      }
      if (time < 200) {
        for (let k = 0; k < 12; k++) {
          const x = 6 + 60 * (k % 4) + ((s * 7 + k * 13) % 9) - 4;
          const z = 6 + 60 * Math.floor(k / 4) + ((s * 5 + k * 11) % 9) - 4;
          rig.hazards.emitGas(x, z, 0.5 * DT, 2.5);
        }
        if (s % 3 === 0) rig.hazards.emitSmoke(66, 6, 0.1, 3, rng.pick([0xd62828, 0x1a1a1a, 0x34c759]));
        if (s % 400 === 0) rig.hazards.ignite(rng.range(0, 200), 6, rng.range(0.5, 4), rng.range(0.2, 1), 0);
        if (s % 90 === 0) rig.hazards.douse(rng.range(0, 200), rng.range(0, 130), rng.range(1, 6), rng.range(0.1, 6));
        if (s % 251 === 0) rig.hazards.emitGas(rng.range(-50, 250), rng.range(-50, 200), 5, rng.range(0.1, 40)); // dépôt brutal
      }
      rig.t.step(DT, DT);
      if (s % 30 === 0) {
        const st = rig.view.stats;
        if (st.blocks > worstBlocks) worstBlocks = st.blocks;
        let bad = 0;
        let inside = 0;
        rig.view.forEachActiveCell((x, z, gas, smoke, color) => {
          if (!(gas >= 0) || !(smoke >= 0) || gas > 2.5001 || smoke > 3.0001 || !Number.isInteger(color) || color < 0 || color > 0xffffff) bad++;
          if (city(x, z)) inside++;
        }, 1e-4);
        expect(bad).toBe(0);
        expect(inside).toBe(0);
        expect(Number.isFinite(rig.view.totalGas())).toBe(true);
        expect(rig.hazards.gasAt(6, 6)).toBeGreaterThanOrEqual(0);
        expect(rig.hazards.gasAt(6, 6)).toBeLessThanOrEqual(1);
        const v = rig.hazards.visibility(6, 6, 186, 126);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        for (const f of rig.view.fires) {
          expect(f.intensity).toBeGreaterThanOrEqual(0);
          expect(f.intensity).toBeLessThanOrEqual(1);
          expect(f.radius).toBeGreaterThan(0);
        }
      }
    }
    expect(worstBlocks).toBeGreaterThan(20);
    expect(worstBlocks).toBeLessThanOrEqual(768);
    // tout s'arrête : le quartier se vide
    rig.ctx.env.setWind(1, 0);
    rig.ctx.env.setWeather('clair', true);
    rig.t.step(900);
    expect(rig.view.stats.blocks).toBe(0);
    expect(rig.view.fires.length).toBe(0);
  });
});
