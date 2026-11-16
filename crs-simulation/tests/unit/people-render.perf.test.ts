// Mesure du coût CPU du calcul des poses (logique pure, sans GPU) : 1 500 personnes qui marchent.
// Le seuil est volontairement large (machines d'intégration lentes) ; la valeur mesurée est affichée.
import { describe, expect, it } from 'vitest';
import type { Person, PersonLook } from '@/core/contracts';
import { PeopleAnimator, createAnimSample, sampleFromPerson } from '@/render/people/animator';
import { BONE_COUNT, BONE_STRIDE } from '@/render/people/skeleton';
import { HOLD_NONE, HOLD_POLE, HOLD_SHIELD } from '@/render/people/poseparams';

// vitest s'exécute sous Node : déclaration minimale (les types de Node ne sont pas installés dans le projet)
declare const process: { cpuUsage(previous?: { user: number; system: number }): { user: number; system: number } };

const LOOK: PersonLook = {
  height: 1.75, build: 1, skin: 0xd9a47c, hair: 0x2a1c12, hairStyle: 1, top: 0x4a5a6a, bottom: 0x2b3340, shoes: 0x1a1a1c,
  outfit: 'civil', headgear: 'none', visorDown: false, gasMask: false, faceCover: false, backText: '', sash: false,
  armband: 0, vest: 0, rankBars: 0, backpack: false,
};

function person(id: number): Person {
  return {
    id, kind: 'manifestant', faction: 'protest', name: '', x: (id % 40) * 0.8, z: Math.floor(id / 40) * 0.9, y: 0, vx: 0, vz: 1.2,
    heading: 0, aimYaw: 0, aimPitch: 0, radius: 0.28, speedWalk: 1.4, speedRun: 3.5, speedSprint: 6, health: 100, injury: 'none',
    stamina: 100, gas: 0, stun: 0, burning: 0, wet: 0, posture: 'stand', upper: 'none', upperT: 0, armorHead: 0, armorBody: 0,
    gasProtection: 0, fear: 0, anger: 0, profile: null, rank: null, poste: null, rio: '', inventory: [], active: -1, alt: false,
    look: { ...LOOK, height: 1.6 + (id % 7) * 0.05 }, squadId: 0, vehicleId: 0, seat: -1, carrying: 0, heldBy: 0, offenses: [],
    custody: 'free', isPlayer: false,
    cmd: { moveX: 0, moveZ: 0, gait: 0, aimYaw: 0, aimPitch: 0, faceMove: true, crouch: false, jump: false },
    brain: null, dormant: false,
  };
}

describe('rendu des personnages — performance du calcul des poses', () => {
  it('1 500 personnes en marche : coût par pose', () => {
    const N = 1500;
    const anim = new PeopleAnimator(N + 1);
    const people: Person[] = [];
    const uppers = ['none', 'none', 'none', 'fist', 'clap', 'carry_sign', 'film', 'shield_carry', 'megaphone', 'none'];
    for (let i = 0; i < N; i++) {
      const p = person(i + 1);
      p.upper = uppers[i % uppers.length];
      people.push(p);
      anim.assign(i + 1, p.id);
    }
    const sm = createAnimSample();
    const out = new Float32Array((N + 1) * BONE_COUNT * BONE_STRIDE);
    const dt = 1 / 60;
    let t = 0;
    const frame = (): void => {
      t += dt;
      for (let i = 0; i < N; i++) {
        const p = people[i];
        p.z += 1.2 * dt;
        p.upperT += dt;
        const hold = p.upper === 'shield_carry' ? HOLD_SHIELD : p.upper === 'carry_sign' ? HOLD_POLE : HOLD_NONE;
        sampleFromPerson(p, hold, sm);
        anim.update(i + 1, sm, t, out, (i + 1) * BONE_COUNT * BONE_STRIDE);
      }
    };
    for (let f = 0; f < 30; f++) frame();          // échauffement du compilateur
    // temps processeur consommé (insensible à la charge de la machine), meilleur de trois séries
    const frames = 40;
    let best = Infinity;
    for (let serie = 0; serie < 3; serie++) {
      const c0 = process.cpuUsage();
      for (let f = 0; f < frames; f++) frame();
      const c = process.cpuUsage(c0);
      best = Math.min(best, (c.user + c.system) / frames / 1000);
    }
    // étalon : même mesure sur une boucle de calcul flottant simple, pour situer la vitesse de la machine
    const ref = new Float64Array(4096);
    const r0 = process.cpuUsage();
    for (let k = 0; k < 400; k++) for (let i = 0; i < 4096; i++) ref[i] = Math.sqrt(ref[(i + 1) & 4095] * 0.5 + i);
    const r = process.cpuUsage(r0);
    const nsPerOp = ((r.user + r.system) * 1000) / (400 * 4096);
    const us = (best * 1000) / N;
    console.log(`[people] calcul des poses : ${best.toFixed(2)} ms CPU pour ${N} poses complètes (${us.toFixed(2)} µs par pose) ; `
      + `étalon machine : ${nsPerOp.toFixed(2)} ns par racine carrée (≈ 1 ns sur un PC de bureau)`);
    for (let k = 0; k < out.length; k += 997) expect(Number.isFinite(out[k])).toBe(true);
    // garde-fou large : une régression grossière (allocation, boucle quadratique) dépasserait ce seuil
    expect(us).toBeLessThan(60);
  });
});
