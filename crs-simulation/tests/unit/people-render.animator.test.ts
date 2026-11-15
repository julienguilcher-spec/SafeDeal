// Tests de l'animateur : continuité des poses lors des changements d'animation et de posture, avance de
// la phase de marche avec la distance réelle, priorité des états (menottes, gaz, feu) sur l'animation.
import { describe, expect, it } from 'vitest';
import type { Person, PersonLook } from '@/core/contracts';
import { PeopleAnimator, createAnimSample, sampleFromPerson } from '@/render/people/animator';
import { BONE_COUNT, BONE_FOOT_L, BONE_HAND_R, BONE_HEAD, BONE_STRIDE } from '@/render/people/skeleton';
import { strideLength } from '@/render/people/gait';
import { HOLD_NONE, HOLD_STICK, POSTURE_NAMES, UPPER_NAMES, U_BURN, U_COUGH, U_CUFFED, U_NONE, U_STAGGER, upperId } from '@/render/people/poseparams';

const LOOK: PersonLook = {
  height: 1.75, build: 1, skin: 0xd9a47c, hair: 0x2a1c12, hairStyle: 1, top: 0x4a5a6a, bottom: 0x2b3340, shoes: 0x1a1a1c,
  outfit: 'civil', headgear: 'none', visorDown: false, gasMask: false, faceCover: false, backText: '', sash: false,
  armband: 0, vest: 0, rankBars: 0, backpack: false,
};

function person(id = 1): Person {
  return {
    id, kind: 'manifestant', faction: 'protest', name: '', x: 0, z: 0, y: 0, vx: 0, vz: 0, heading: 0, aimYaw: 0, aimPitch: 0,
    radius: 0.28, speedWalk: 1.4, speedRun: 3.5, speedSprint: 6, health: 100, injury: 'none', stamina: 100, gas: 0, stun: 0,
    burning: 0, wet: 0, posture: 'stand', upper: 'none', upperT: 0, armorHead: 0, armorBody: 0, gasProtection: 0, fear: 0,
    anger: 0, profile: null, rank: null, poste: null, rio: '', inventory: [], active: -1, alt: false, look: { ...LOOK },
    squadId: 0, vehicleId: 0, seat: -1, carrying: 0, heldBy: 0, offenses: [], custody: 'free', isPlayer: false,
    cmd: { moveX: 0, moveZ: 0, gait: 0, aimYaw: 0, aimPitch: 0, faceMove: true, crouch: false, jump: false },
    brain: null, dormant: false,
  };
}

const DT = 1 / 60;

/** Déplacement maximal d'un os entre deux poses (positions absolues : racine + os). */
function maxMove(a: Float32Array, b: Float32Array, ax: number, az: number, bx: number, bz: number): number {
  let m = 0;
  for (let i = 0; i < BONE_COUNT; i++) {
    const o = i * BONE_STRIDE;
    const d = Math.hypot(a[o + 4] + ax - b[o + 4] - bx, a[o + 5] - b[o + 5], a[o + 6] + az - b[o + 6] - bz);
    if (d > m) m = d;
  }
  return m;
}

describe('rendu des personnages — animateur', () => {
  it('continuité : aucun saut lors des changements d’animation du haut du corps', () => {
    const anim = new PeopleAnimator(4);
    anim.assign(1, 42);
    const p = person(42);
    const sm = createAnimSample();
    const cur = new Float32Array(BONE_COUNT * BONE_STRIDE), prev = new Float32Array(BONE_COUNT * BONE_STRIDE);
    let t = 0;
    let worst = 0;
    let worstName = '';
    sampleFromPerson(p, HOLD_NONE, sm);
    anim.update(1, sm, t, prev, 0);
    for (let u = 0; u < 37; u++) {
      // chaque animation dure 0,5 s puis on bascule brutalement sur la suivante
      p.upper = UPPER_NAMES[u];
      p.upperT = 0;
      for (let f = 0; f < 30; f++) {
        t += DT;
        p.upperT += DT;
        sampleFromPerson(p, u % 3 === 0 ? HOLD_STICK : HOLD_NONE, sm);
        anim.update(1, sm, t, cur, 0);
        for (let k = 0; k < cur.length; k++) expect(Number.isFinite(cur[k])).toBe(true);
        const m = maxMove(cur, prev, 0, 0, 0, 0);
        if (m > worst) { worst = m; worstName = UPPER_NAMES[u] + ' image ' + f; }
        prev.set(cur);
      }
    }
    // 0,22 m par image = 13 m/s : au-delà, ce serait une téléportation de membre (un lancer culmine vers 8 m/s)
    expect(worst, 'saut maximal pendant ' + worstName).toBeLessThan(0.22);
  });

  it('continuité : fondu entre postures (debout → accroupi → à genoux → assis → couché → à terre)', () => {
    const anim = new PeopleAnimator(4);
    anim.assign(2, 7);
    const p = person(7);
    const sm = createAnimSample();
    const cur = new Float32Array(BONE_COUNT * BONE_STRIDE), prev = new Float32Array(BONE_COUNT * BONE_STRIDE);
    let t = 0;
    sampleFromPerson(p, HOLD_NONE, sm);
    anim.update(2, sm, t, prev, 0);
    let worst = 0;
    for (const po of [...POSTURE_NAMES, 'stand', 'down', 'stand']) {
      p.posture = po as Person['posture'];
      for (let f = 0; f < 60; f++) {
        t += DT;
        sampleFromPerson(p, HOLD_NONE, sm);
        anim.update(2, sm, t, cur, 0);
        const m = maxMove(cur, prev, 0, 0, 0, 0);
        if (m > worst) worst = m;
        prev.set(cur);
      }
    }
    // la tête parcourt ~1,5 m en 0,38 s au plus (debout → à terre) : moins de 12 cm par image
    expect(worst).toBeLessThan(0.12);
    // sans fondu, le même changement ferait un saut de plus d'un mètre
    const a2 = new PeopleAnimator(2);
    a2.assign(1, 7);
    p.posture = 'stand';
    sampleFromPerson(p, HOLD_NONE, sm);
    a2.update(1, sm, 0, prev, 0);
    const headStand = prev[BONE_HEAD * BONE_STRIDE + 5];
    p.posture = 'down';
    sampleFromPerson(p, HOLD_NONE, sm);
    a2.markFresh(1);
    a2.update(1, sm, DT, cur, 0);
    expect(headStand - cur[BONE_HEAD * BONE_STRIDE + 5]).toBeGreaterThan(1.0);
  });

  it('la phase de marche avance avec la distance parcourue ; le pied d’appui ne glisse pas', () => {
    const anim = new PeopleAnimator(2);
    anim.assign(1, 5);
    const p = person(5);
    const sm = createAnimSample();
    const out = new Float32Array(BONE_COUNT * BONE_STRIDE);
    const speed = 1.4;
    p.vz = speed;
    let t = 0;
    sampleFromPerson(p, HOLD_NONE, sm);
    anim.update(1, sm, t, out, 0);
    const ph0 = anim.phaseOf(1);
    let cycles = 0, lastPh = ph0;
    let planted = 0, maxSlide = 0, lastFootZ = NaN;
    for (let f = 0; f < 600; f++) {
      t += DT;
      p.z += speed * DT;
      sampleFromPerson(p, HOLD_NONE, sm);
      anim.update(1, sm, t, out, 0);
      const ph = anim.phaseOf(1);
      if (ph < lastPh) cycles++;
      lastPh = ph;
      // pied gauche à plat (cheville à sa hauteur de repos) : sa position monde ne doit pas bouger
      const fy = out[BONE_FOOT_L * BONE_STRIDE + 5], fz = p.z + out[BONE_FOOT_L * BONE_STRIDE + 6];
      if (f > 60 && fy < 0.092 && ph > 0.13 && ph < 0.30) {
        if (!Number.isNaN(lastFootZ)) { planted++; maxSlide = Math.max(maxSlide, Math.abs(fz - lastFootZ)); }
        lastFootZ = fz;
      } else lastFootZ = NaN;
    }
    const expected = (speed * 10) / strideLength(speed, 1, 0);
    expect(cycles + lastPh - ph0).toBeGreaterThan(expected - 0.3);
    expect(cycles + lastPh - ph0).toBeLessThan(expected + 0.3);
    expect(planted).toBeGreaterThan(50);
    // moins de 1,5 mm de glissement par image (contre 23 mm d'avance du corps)
    expect(maxSlide).toBeLessThan(0.0015);
    expect(anim.speedOf(1)).toBeCloseTo(speed, 1);
  });

  it('une téléportation ne fait ni courir sur place ni sauter la phase', () => {
    const anim = new PeopleAnimator(2);
    anim.assign(1, 9);
    const p = person(9);
    const sm = createAnimSample();
    const out = new Float32Array(BONE_COUNT * BONE_STRIDE);
    let t = 0;
    for (let f = 0; f < 30; f++) { t += DT; sampleFromPerson(p, HOLD_NONE, sm); anim.update(1, sm, t, out, 0); }
    const ph = anim.phaseOf(1);
    p.x += 80;
    t += DT;
    sampleFromPerson(p, HOLD_NONE, sm);
    anim.update(1, sm, t, out, 0);
    expect(anim.phaseOf(1)).toBeCloseTo(ph, 6);
    expect(anim.speedOf(1)).toBeLessThan(0.1);
  });

  it('les états priment sur l’animation demandée', () => {
    const p = person(3);
    const sm = createAnimSample();
    p.upper = 'fist';
    sampleFromPerson(p, HOLD_NONE, sm);
    expect(sm.upper).toBe(upperId('fist'));
    p.gas = 0.8;
    sampleFromPerson(p, HOLD_NONE, sm);
    expect(sm.upper).toBe(U_COUGH);
    p.gasProtection = 1;            // masque à gaz : pas de toux
    sampleFromPerson(p, HOLD_NONE, sm);
    expect(sm.upper).toBe(upperId('fist'));
    p.gasProtection = 0; p.stun = 1;
    sampleFromPerson(p, HOLD_NONE, sm);
    expect(sm.upper).toBe(U_STAGGER);
    p.burning = 0.6;
    sampleFromPerson(p, HOLD_NONE, sm);
    expect(sm.upper).toBe(U_BURN);
    p.custody = 'cuffed';
    sampleFromPerson(p, HOLD_NONE, sm);
    expect(sm.upper).toBe(U_CUFFED);
    p.posture = 'down';             // à terre : la posture décide
    sampleFromPerson(p, HOLD_NONE, sm);
    expect(sm.upper).not.toBe(U_CUFFED);
    expect(upperId('animation_inconnue')).toBe(U_NONE);
  });

  it('menotté : les deux mains sont dans le dos', () => {
    const anim = new PeopleAnimator(2);
    anim.assign(1, 11);
    const p = person(11);
    p.custody = 'cuffed';
    const sm = createAnimSample();
    const out = new Float32Array(BONE_COUNT * BONE_STRIDE);
    sampleFromPerson(p, HOLD_NONE, sm);
    anim.update(1, sm, 0, out, 0);
    // cap 0 : l'avant est +Z ; les poignets doivent être derrière le bassin (z < 0)
    expect(out[BONE_HAND_R * BONE_STRIDE + 6]).toBeLessThan(-0.08);
  });
});
