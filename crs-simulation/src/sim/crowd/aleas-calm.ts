/* =====================================================================================
 * FOULE — catalogue des aléas, première partie : les douze aléas sans gravité (ou apaisants).
 * Niveau gameplay : ce qui arrive et ce que font les gens. La suite est dans aleas-data.ts.
 * ===================================================================================== */

import type { CrowdPhase, Person } from '@/core/contracts';
import type { AleaDef, AleaKit, AleaRun } from './aleas';
import { A, S, brainOf } from './brain';

const GATHER: readonly CrowdPhase[] = ['rassemblement'];
const MARCH: readonly CrowdPhase[] = ['cortege'];
const LIVE: readonly CrowdPhase[] = ['rassemblement', 'depart', 'cortege'];

const calm = (p: Person): boolean => p.profile === 'pacifique' || p.profile === 'militant' || p.profile === 'famille';

/** Arrêt du cortège pour un moment partagé (parole, silence, banderole). */
function pause(kit: AleaKit, run: AleaRun, id: string, min: number, max: number): number {
  const seconds = kit.range(min, max) * kit.K;
  kit.point(run, 0.15);
  kit.halt(seconds, id);
  run.until = kit.now + seconds;
  return seconds;
}

export const CALM_ALEAS: readonly AleaDef[] = [
  // ───────────────────────────── gravité 0 ─────────────────────────────
  {
    id: 'fanfare', label: 'Une fanfare rejoint le cortège', gravity: 0, phases: LIVE, weight: 1,
    start(kit, run) {
      kit.point(run, 0.5);
      run.until = kit.now + kit.range(60, 100) * kit.K;
      kit.tension(-0.03, run.x, run.z, 'fanfare');
      return true;
    },
    tick(kit, run) {
      if (kit.now < run.next) return;
      run.next = kit.now + 8;
      kit.point(run, 0.5);
      kit.core.ctx.events.emit('sfx', { id: 'tambour', x: run.x, y: 1.5, z: run.z, volume: 0.9 });
      kit.mood(run.x, run.z, 40, -0.02, -0.02);
      const n = kit.near(run.x, run.z, 14, 10, calm);
      for (let i = 0; i < n; i++) kit.core.behavior.gesture(kit.out[i]!, brainOf(kit.out[i]!)!, A.CLAP, 5);
    },
  },
  {
    id: 'chant_collectif', label: 'Tout le cortège reprend le même chant', gravity: 0, phases: LIVE, weight: 1,
    start(kit, run) {
      run.until = kit.now + 30;
      run.n = 3;
      return kit.core.cause.chants.length > 0;
    },
    tick(kit, run) {
      if (kit.now < run.next || run.n <= 0) return;
      run.next = kit.now + 8;
      run.n--;
      const c = kit.core.cause.chants[0]!;
      for (let k = 0; k <= 2; k++) {
        kit.point(run, k * 0.5);
        kit.chant(c.call, c.response, run.x, run.z, 1);
        kit.mood(run.x, run.z, 45, -0.01, -0.01);
      }
    },
  },
  {
    id: 'applaudissements_riverains', label: 'Des riverains applaudissent aux fenêtres', gravity: 0, phases: MARCH, weight: 0.8,
    start(kit, run) {
      kit.point(run, 0.3);
      run.until = kit.now + 15;
      kit.mood(run.x, run.z, 35, -0.02, -0.04);
      kit.tension(-0.02, run.x, run.z, 'applaudissements_riverains');
      kit.core.ctx.events.emit('crowd:chant', { x: run.x, z: run.z, text: 'Bravo ! Tenez bon !', intensity: 0.5 });
      const n = kit.near(run.x, run.z, 20, 14, calm);
      for (let i = 0; i < n; i++) kit.core.behavior.gesture(kit.out[i]!, brainOf(kit.out[i]!)!, A.WAVE, 5);
      return true;
    },
  },
  {
    id: 'prise_de_parole', label: 'Prise de parole improvisée', gravity: 0, phases: MARCH, weight: 1,
    start(kit, run) {
      const seconds = pause(kit, run, 'prise_de_parole', 40, 60);
      kit.say('prise_de_parole', kit.core.cause.summary || 'On est là, et on restera mobilisés !', run.x, run.z);
      kit.core.voices.clapX = run.x;
      kit.core.voices.clapZ = run.z;
      kit.core.voices.clapUntil = kit.now + seconds;
      return true;
    },
  },
  {
    id: 'minute_de_silence', label: 'Minute de silence', gravity: 0, phases: LIVE, weight: 0.6,
    start(kit, run) {
      const seconds = pause(kit, run, 'minute_de_silence', 30, 45);
      kit.say('consigne', 'Nous allons observer une minute de silence.', run.x, run.z);
      kit.core.director.silentUntil = kit.now + seconds;
      kit.tension(-0.04, run.x, run.z, 'minute_de_silence');
      kit.mood(run.x, run.z, 60, -0.03, -0.03);
      return true;
    },
  },
  {
    id: 'banderole_geante', label: 'Déploiement d’une banderole géante', gravity: 0, phases: MARCH, weight: 0.8,
    start(kit, run) {
      pause(kit, run, 'banderole_geante', 22, 32);
      kit.chant('Ouais ! Ouais !', '', run.x, run.z, 0.9);
      kit.mood(run.x, run.z, 40, 0, -0.02);
      const n = kit.near(run.x, run.z, 25, 10, calm);
      for (let i = 0; i < n; i++) kit.core.behavior.gesture(kit.out[i]!, brainOf(kit.out[i]!)!, i % 2 ? A.FILM : A.CLAP, 8);
      return true;
    },
  },
  {
    id: 'distribution_eau', label: 'Des bénévoles distribuent de l’eau', gravity: 0, phases: LIVE, weight: 0.8,
    start(kit, run) {
      kit.point(run, 0.6);
      run.until = kit.now + 25;
      kit.holdBlockAt(run, 18 * kit.K);
      const n = kit.near(run.x, run.z, 30, 200);
      for (let i = 0; i < n; i++) {
        const b = brainOf(kit.out[i]!)!;
        b.fatigue = Math.max(0, b.fatigue - 0.2);
      }
      return n > 0;
    },
  },
  {
    id: 'happening', label: 'Happening au milieu du cortège', gravity: 0, phases: LIVE, weight: 0.8,
    start(kit, run) {
      kit.point(run, 0.5);
      const seconds = kit.range(35, 50) * kit.K;
      run.until = kit.now + seconds;
      kit.holdBlockAt(run, seconds);
      const n = kit.near(run.x, run.z, 14, 18, calm);
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * 6.283;
        kit.errand(kit.out[i]!, run.x + Math.sin(a) * 4, run.z + Math.cos(a) * 4, seconds, run.x, run.z);
      }
      kit.core.voices.clapX = run.x;
      kit.core.voices.clapZ = run.z;
      kit.core.voices.clapUntil = kit.now + seconds;
      kit.mood(run.x, run.z, 30, 0, -0.03);
      return n >= 3;
    },
  },
  {
    id: 'tracts', label: 'Distribution de tracts aux passants', gravity: 0, phases: LIVE, weight: 0.8,
    start(kit, run) {
      kit.point(run, 0.4);
      const core = kit.core;
      const n = kit.near(run.x, run.z, 18, 6, (p) => p.profile === 'militant');
      const seconds = kit.range(35, 55);
      for (let i = 0; i < n; i++) {
        // vers la lisière, d'un côté puis de l'autre
        core.corridor.at(core.corridor.project(kit.out[i]!.x, kit.out[i]!.z, core.formation.headS, 400), core.rp);
        const lateral = core.rp.center + (i % 2 ? 1 : -1) * (core.rp.half + 0.2);
        kit.errand(kit.out[i]!, core.rp.x - core.rp.tz * lateral, core.rp.z + core.rp.tx * lateral, seconds);
      }
      run.until = kit.now + seconds;
      return n > 0;
    },
  },
  {
    id: 'renfort_delegation', label: 'Une délégation rejoint le cortège avec sa banderole', gravity: 0, phases: LIVE, weight: 1,
    start(kit, run) {
      const core = kit.core;
      if (!kit.sideStreet(core.formation.tailS - 10, run, 45)) kit.point(run, 1, -40);
      const count = Math.min(40, Math.max(6, Math.round(core.size * 0.06)));
      const made = kit.spawnGroup(run, count, 'militant', 'syndical', true, 0.1);
      for (const p of made) {
        const b = brainOf(p)!;
        b.slot = core.formation.allocTail(core.rngAlea);
        b.state = S.ARRIVE;
        b.nextThink = 0;
      }
      run.until = kit.now + 20;
      return made.length > 0;
    },
  },
  {
    id: 'retard_depart', label: 'Le départ est retardé', gravity: 0, phases: GATHER, weight: 0.8,
    start(kit, run) {
      const seconds = kit.range(25, 50) * kit.K;
      kit.core.director.delayDeparture(seconds);
      kit.point(run, 0.1);
      kit.say('consigne', 'On attend encore un peu : des cortèges arrivent.', run.x, run.z);
      kit.mood(run.x, run.z, 60, 0, 0.02);
      run.until = kit.now + seconds;
      return true;
    },
  },
  {
    id: 'arret_prolonge', label: 'Le service d’ordre attend la queue du cortège', gravity: 0, phases: MARCH, weight: 1,
    start(kit, run) {
      pause(kit, run, 'arret_prolonge', 55, 85);
      kit.say('arret', 'On s’arrête, on attend la fin du cortège !', run.x, run.z);
      return true;
    },
  },
];
