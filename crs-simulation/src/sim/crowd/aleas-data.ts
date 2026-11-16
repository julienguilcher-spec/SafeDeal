/* =====================================================================================
 * FOULE — catalogue des aléas (36). Niveau gameplay : ce qui arrive et ce que font les gens.
 * Gravité 0 : sans conséquence ou apaisant ; 1 : friction ; 2 : sérieux (rare sans propension à dégénérer).
 * ===================================================================================== */

import type { CrowdPhase, Person, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi } from '@/core/extensions';
import type { AleaDef, AleaKit, AleaRun } from './aleas';
import { A, F, S, brainOf } from './brain';
import type { CrowdBrain } from './brain';

const GATHER: readonly CrowdPhase[] = ['rassemblement'];
const MARCH: readonly CrowdPhase[] = ['cortege'];
const LIVE: readonly CrowdPhase[] = ['rassemblement', 'depart', 'cortege'];
const ANY: readonly CrowdPhase[] = ['rassemblement', 'depart', 'cortege', 'dispersion'];
const LATE: readonly CrowdPhase[] = ['cortege', 'dispersion', 'apres_manif'];

interface AutopilotLike { driveTo(v: Vehicle, x: number, z: number, options?: { speed?: number }): boolean }
interface KnockLike { knockDown(p: Person, seconds: number, sourceId: number): void }

const calm = (p: Person): boolean => p.profile === 'pacifique' || p.profile === 'militant' || p.profile === 'famille';
const agitated = (p: Person): boolean => p.profile === 'opportuniste' || p.profile === 'radical' || (p.profile === 'pacifique' && p.anger > 0.3);
const adult = (_p: Person, b: CrowdBrain): boolean => (b.flags & F.CHILD) === 0;

/** Arrêt du cortège pour un moment partagé (parole, silence, banderole). */
function pause(kit: AleaKit, run: AleaRun, id: string, min: number, max: number): number {
  const seconds = kit.range(min, max) * kit.K;
  kit.point(run, 0.15);
  kit.halt(seconds, id);
  run.until = kit.now + seconds;
  return seconds;
}

/** Fait tomber quelqu'un pour un moment (malaise, chute) : il se relève seul ensuite. */
function collapse(kit: AleaKit, p: Person, seconds: number): void {
  const ctx = kit.core.ctx;
  const health = ctx.service<KnockLike>('people.health');
  if (health && typeof health.knockDown === 'function') health.knockDown(p, seconds, 0);
  else ctx.health.setDown(p, true, 0);
}

export const CATALOGUE: readonly AleaDef[] = [
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
  // ───────────────────────────── gravité 1 ─────────────────────────────
  {
    id: 'averse', label: 'Averse soudaine', gravity: 1, phases: ANY, weight: 1,
    start(kit, run) {
      const core = kit.core;
      const env = core.ctx.env;
      if (env.state.weather === 'averse' || env.state.weather === 'orage') return false;
      run.v = ['clair', 'nuageux', 'couvert', 'pluie', 'averse', 'brouillard', 'orage'].indexOf(env.state.weather);
      env.setWeather('averse');
      run.until = kit.now + kit.range(110, 220) * kit.K;
      core.director.rush = 1.12;
      // une part des familles et des promeneurs renonce
      for (let i = 0; i < core.brains.length; i++) {
        const b = core.brains[i]!;
        const profile = b.person.profile;
        if ((profile === 'famille' && b.docility < 0.45) || (profile === 'pacifique' && b.docility < 0.12)) b.leaveAt = Math.min(b.leaveAt, kit.now + 5 + 40 * kit.rand());
      }
      return true;
    },
    end(kit, run) {
      const names = ['clair', 'nuageux', 'couvert', 'pluie', 'averse', 'brouillard', 'orage'] as const;
      kit.core.ctx.env.setWeather(names[run.v] ?? 'couvert');
      kit.core.director.rush = 1;
    },
  },
  {
    id: 'panne_sono', label: 'Panne du camion sono', gravity: 1, phases: MARCH, weight: 1,
    start(kit, run) {
      const core = kit.core;
      const v = core.sono.vehicle();
      if (!v) return false;
      const seconds = kit.range(70, 120) * kit.K;
      core.sono.brokenUntil = kit.now + seconds;
      run.x = v.x;
      run.z = v.z;
      run.until = kit.now + seconds;
      kit.holdBlockAt(run, seconds);
      kit.mood(run.x, run.z, 30, 0, 0.03);
      kit.say('arret', 'Le camion est en panne, on patiente !', v.x, v.z);
      return true;
    },
    end(kit, run) {
      kit.say('reprise', 'C’est reparti, on avance !', run.x, run.z);
    },
  },
  {
    id: 'sit_in', label: 'Sit-in sur la chaussée', gravity: 1, phases: MARCH, weight: 1.1,
    start(kit, run) {
      kit.point(run, 0.08);
      const seconds = kit.range(60, 140) * kit.K;
      const n = kit.near(run.x, run.z, 22, 40, (p, b) => adult(p, b) && p.profile !== 'service_ordre' && p.profile !== 'famille' && (b.flags & F.BANNER) === 0);
      if (n < 5) return false;
      for (let i = 0; i < n; i++) {
        kit.pin(kit.out[i]!, true);
        run.ids.push(kit.out[i]!.id);
      }
      kit.halt(seconds, 'sit_in');
      kit.chant('On ne bouge pas !', 'On ne bouge pas !', run.x, run.z, 0.8);
      kit.tension(0.03, run.x, run.z, 'sit_in');
      run.until = kit.now + seconds;
      return true;
    },
    end(kit, run) {
      for (const id of run.ids) {
        const p = kit.person(id);
        if (p) kit.pin(p, false);
      }
    },
  },
  {
    id: 'malaise', label: 'Malaise dans la foule', gravity: 1, phases: ANY, weight: 1.1,
    start(kit, run) {
      kit.point(run, 0.3 + 0.5 * kit.rand());
      const n = kit.near(run.x, run.z, 25, 30, adult);
      if (n === 0) return false;
      const p = kit.out[Math.floor(kit.rand() * n)]!;
      const seconds = kit.range(40, 70);
      collapse(kit, p, seconds);
      run.ids.push(p.id);
      run.x = p.x;
      run.z = p.z;
      run.until = kit.now + seconds;
      kit.holdBlockAt(run, Math.min(40, seconds));
      return p.posture === 'down';
    },
    end(kit, run) {
      const p = kit.person(run.ids[0] ?? 0);
      if (p && p.posture === 'down' && p.injury !== 'serious' && p.injury !== 'critical') kit.core.ctx.health.setDown(p, false, 0);
    },
  },
  {
    id: 'enfant_perdu', label: 'Un enfant a perdu ses parents', gravity: 1, phases: ANY, weight: 0.9,
    start(kit, run) {
      const core = kit.core;
      kit.point(run, 0.9);
      let child: Person | null = null;
      for (let i = 0; i < core.brains.length && !child; i++) if (core.brains[i]!.flags & F.CHILD) child = core.members[i]!;
      if (!child) return false;
      const b = brainOf(child)!;
      const seconds = kit.range(60, 110);
      // l'enfant s'est écarté vers la lisière ; ses proches le cherchent en remontant le cortège
      core.corridor.at(core.corridor.project(child.x, child.z, core.formation.tailS, 600) - 25, core.rp);
      const lateral = core.rp.center + (core.rp.half + 0.3) * (kit.rand() < 0.5 ? 1 : -1);
      run.x = core.rp.x - core.rp.tz * lateral;
      run.z = core.rp.z + core.rp.tx * lateral;
      kit.errand(child, run.x, run.z, seconds);
      child.fear = Math.min(1, child.fear + 0.2);
      run.ids.push(child.id);
      const g = b.group >= 0 ? core.groups[b.group] : undefined;
      if (g) {
        for (const id of g.members) {
          const q = kit.person(id);
          if (!q || q === child) continue;
          q.fear = Math.min(1, q.fear + 0.1);
          kit.errand(q, q.x + (kit.rand() - 0.5) * 30, q.z + (kit.rand() - 0.5) * 30, seconds * 0.5);
        }
      }
      kit.say('consigne', 'On recherche les parents d’un enfant, près de la queue du cortège.', run.x, run.z);
      core.ctx.radio.say({ channel: 'public', from: 'Service d’ordre', priority: 1, text: 'Un enfant a perdu ses parents, ' + core.ctx.world.sectorName(run.x, run.z) + '.' });
      run.until = kit.now + seconds;
      return true;
    },
    end(kit, run) {
      // retrouvé : chacun reprend sa place
      const child = kit.person(run.ids[0] ?? 0);
      const b = child ? brainOf(child) : null;
      if (b) b.watchUntil = 0;
    },
  },
  {
    id: 'commercant_excede', label: 'Un commerçant excédé s’en prend aux manifestants', gravity: 1, phases: LIVE, weight: 1,
    start(kit, run) {
      const core = kit.core;
      const ctx = core.ctx;
      core.corridor.at(core.formation.headS - 10 - 30 * kit.rand(), core.rp);
      const side = kit.rand() < 0.5 ? 1 : -1;
      const lateral = core.rp.center + side * (core.rp.half + 0.4);
      run.x = core.rp.x - core.rp.tz * lateral;
      run.z = core.rp.z + core.rp.tx * lateral;
      if (!ctx.world.isFree(run.x, run.z, 0.4)) return false;
      const seconds = kit.range(40, 60);
      const shopkeeper = ctx.archetypes.spawn('commercant', run.x, run.z, { heading: Math.atan2(core.rp.x - run.x, core.rp.z - run.z) });
      if (shopkeeper.brain === null) {
        const sb = core.addMember(shopkeeper, F.BYSTANDER | F.UNCOUNTED);
        sb.state = S.BYSTAND;
        sb.leaveAt = kit.now + seconds;
      }
      shopkeeper.anger = 0.7;
      run.ids.push(shopkeeper.id);
      const n = kit.near(run.x, run.z, 12, 7, adult);
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * 3.14 - 1.57 + Math.atan2(core.rp.x - run.x, core.rp.z - run.z);
        kit.errand(kit.out[i]!, run.x + Math.sin(a) * 2.6, run.z + Math.cos(a) * 2.6, seconds, run.x, run.z);
      }
      ctx.events.emit('crowd:chant', { x: run.x, z: run.z, text: 'Vous faites fuir mes clients ! Circulez !', intensity: 0.6 });
      kit.mood(run.x, run.z, 15, 0, 0.05);
      kit.tension(0.03, run.x, run.z, 'commercant_excede');
      run.until = kit.now + seconds;
      return true;
    },
  },
  {
    id: 'journaliste_bouscule', label: 'Un journaliste est bousculé', gravity: 1, phases: LATE, weight: 1,
    start(kit, run) {
      const core = kit.core;
      const ctx = core.ctx;
      kit.point(run, 0.05);
      let reporter: Person | null = ctx.people.nearest(run.x, run.z, 60, (p) => p.kind === 'journaliste' && p.posture !== 'down');
      if (!reporter) {
        core.corridor.at(core.formation.headS + 6, core.rp);
        const x = core.rp.x - core.rp.tz * (core.rp.center + core.rp.half * 0.6);
        const z = core.rp.z + core.rp.tx * (core.rp.center + core.rp.half * 0.6);
        if (!ctx.world.isFree(x, z, 0.4)) return false;
        reporter = ctx.archetypes.spawn('journaliste', x, z, {});
        if (reporter.brain === null) {
          const rb = core.addMember(reporter, F.BYSTANDER | F.UNCOUNTED);
          rb.state = S.BYSTAND;
        }
      }
      const n = kit.near(reporter.x, reporter.z, 30, 3, agitated);
      if (n === 0) return false;
      run.ids.push(reporter.id);
      for (let i = 0; i < n; i++) {
        run.ids.push(kit.out[i]!.id);
        kit.errand(kit.out[i]!, reporter.x + (i - 1) * 0.8, reporter.z + 0.9, 25, reporter.x, reporter.z);
      }
      run.x = reporter.x;
      run.z = reporter.z;
      run.until = kit.now + 25;
      run.next = kit.now + 6;
      kit.tension(0.05, run.x, run.z, 'journaliste_bouscule');
      return true;
    },
    tick(kit, run) {
      if (kit.now < run.next || run.n > 0) return;
      const reporter = kit.person(run.ids[0] ?? 0);
      const actor = kit.person(run.ids[1] ?? 0);
      if (!reporter || !actor || Math.hypot(actor.x - reporter.x, actor.z - reporter.z) > 2.2) return;
      run.n = 1;
      // vraie bousculade si le verbe « pousser » est disponible ; la peur du journaliste dans tous les cas
      kit.core.ctx.interactions.startVerb(actor, 'pousser', reporter.id);
      reporter.fear = Math.min(1, reporter.fear + 0.3);
      kit.core.ctx.events.emit('crowd:chant', { x: reporter.x, z: reporter.z, text: 'Range ta caméra !', intensity: 0.6 });
    },
  },
  {
    id: 'station_saturee', label: 'Affluence exceptionnelle à une station', gravity: 1, phases: LIVE, weight: 0.9,
    start(kit, run) {
      for (const s of kit.core.metro.stations) {
        if (!s.open || s.queue.length < 2) continue;
        s.waveTarget = Math.min(120, s.waveTarget * 2);
        s.nextWaveAt = kit.now;
        run.x = s.x;
        run.z = s.z;
        run.until = kit.now + 30;
        kit.radio('Affluence exceptionnelle à la station ' + s.name + ', les quais sont saturés.');
        return true;
      }
      return false;
    },
  },
  {
    id: 'coupure_metro', label: 'Incident technique : une station ferme', gravity: 1, phases: ANY, weight: 0.9,
    start(kit, run) {
      const core = kit.core;
      const s = core.metro.stations.find((st) => st.open && st.serving);
      if (!s) return false;
      run.n = s.id;
      run.x = s.x;
      run.z = s.z;
      run.until = kit.now + kit.range(120, 220) * kit.K;
      core.metro.setOpen(s.id, false, 0);
      return true;
    },
    end(kit, run) {
      kit.core.metro.setOpen(run.n, true, 0);
    },
  },
  {
    id: 'coup_de_chaud', label: 'Coup de chaleur dans le cortège', gravity: 1, phases: MARCH, weight: 0.8,
    start(kit, run) {
      const core = kit.core;
      kit.point(run, 0.7);
      for (let i = 0; i < core.brains.length; i++) core.brains[i]!.fatigue = Math.min(1, core.brains[i]!.fatigue + 0.15);
      const n = kit.near(run.x, run.z, 30, 20, (p, b) => adult(p, b) && (p.profile === 'famille' || p.profile === 'pacifique'));
      if (n > 0) {
        const p = kit.out[0]!;
        collapse(kit, p, 35);
        run.ids.push(p.id);
      }
      run.until = kit.now + 40;
      return true;
    },
    end(kit, run) {
      const p = kit.person(run.ids[0] ?? 0);
      if (p && p.posture === 'down' && p.injury !== 'serious' && p.injury !== 'critical') kit.core.ctx.health.setDown(p, false, 0);
    },
  },
  {
    id: 'chute', label: 'Une personne âgée chute', gravity: 1, phases: ANY, weight: 0.9,
    start(kit, run) {
      kit.point(run, 0.8);
      const n = kit.near(run.x, run.z, 30, 12, (p, b) => adult(p, b) && (p.profile === 'famille' || p.speedWalk < 1.3));
      if (n === 0) return false;
      const p = kit.out[0]!;
      kit.core.ctx.health.hurt(p, { amount: 8, kind: 'fall', sourceId: 0, x: p.x, z: p.z, zone: 0.3 });
      collapse(kit, p, 18);
      run.ids.push(p.id);
      run.x = p.x;
      run.z = p.z;
      run.until = kit.now + 22;
      return true;
    },
    end(kit, run) {
      const p = kit.person(run.ids[0] ?? 0);
      if (p && p.posture === 'down' && p.injury !== 'serious' && p.injury !== 'critical') kit.core.ctx.health.setDown(p, false, 0);
    },
  },
  {
    id: 'bousculade', label: 'Bousculade entre le service d’ordre et le cortège de tête', gravity: 1, phases: MARCH, weight: 1,
    start(kit, run) {
      const core = kit.core;
      const f = core.formation;
      if (f.bufferBlock < 0) return false;
      core.corridor.at(f.blockS(f.bufferBlock + 1) + 2, core.rp);
      run.x = core.rp.x;
      run.z = core.rp.z;
      core.corridor.at(f.blockS(f.bufferBlock), core.rp);
      const n = kit.near(core.rp.x, core.rp.z, 20, 8, agitated);
      if (n < 2) return false;
      for (let i = 0; i < n; i++) kit.errand(kit.out[i]!, run.x + (i - n / 2) * 0.9, run.z, 35, run.x, run.z);
      kit.mood(run.x, run.z, 20, 0.03, 0.08);
      kit.tension(0.05, run.x, run.z, 'bousculade');
      core.ctx.events.emit('crowd:chant', { x: run.x, z: run.z, text: 'On serre les rangs, on ne répond pas aux provocations.', intensity: 0.6 });
      run.until = kit.now + 35;
      return true;
    },
  },
  {
    id: 'petards', label: 'Pétards dans le cortège', gravity: 1, phases: LATE, weight: 1,
    start(kit, run) {
      kit.point(run, 0.1);
      run.n = 3;
      run.until = kit.now + 8;
      kit.tension(0.03, run.x, run.z, 'petards');
      return true;
    },
    tick(kit, run) {
      if (run.n <= 0) return;
      run.n--;
      kit.core.ctx.events.emit('sfx', { id: 'petard', x: run.x + (kit.rand() - 0.5) * 6, y: 0.3, z: run.z + (kit.rand() - 0.5) * 6, volume: 1 });
      kit.mood(run.x, run.z, 15, 0.1, 0);
    },
  },
  {
    id: 'fumigenes', label: 'Fumigènes de couleur dans le cortège', gravity: 1, phases: LIVE, weight: 1,
    start(kit, run) {
      kit.point(run, 0.2 + 0.5 * kit.rand());
      run.until = kit.now + kit.range(30, 45);
      kit.tension(0.02, run.x, run.z, 'fumigenes');
      kit.chant('Ouais ! Ouais !', '', run.x, run.z, 0.7);
      return true;
    },
    tick(kit, run) {
      kit.core.ctx.hazards.emitSmoke(run.x, run.z, 0.35, 3, kit.core.cause.color);
      kit.core.ctx.events.emit('fx', { id: 'fumee', x: run.x, y: 1.2, z: run.z, size: 2, color: kit.core.cause.color, seconds: 1.2 });
    },
  },
  {
    id: 'slogans_hostiles', label: 'Slogans hostiles aux forces de l’ordre', gravity: 1, phases: LATE, weight: 1,
    start(kit, run) {
      kit.point(run, 0.05);
      if (kit.core.sense.policeNear(run.x, run.z, 7) > 80) return false;
      kit.chant('Laissez-nous passer !', 'Laissez-nous passer !', run.x, run.z, 0.9);
      kit.mood(run.x, run.z, 40, 0, 0.06);
      kit.tension(0.04, run.x, run.z, 'slogans_hostiles');
      run.until = kit.now + 20;
      return true;
    },
  },
  {
    id: 'drone_repere', label: 'La foule repère un drone', gravity: 1, phases: ANY, weight: 0.7,
    start(kit, run) {
      const core = kit.core;
      kit.point(run, 0.3);
      for (const v of core.ctx.vehicles.list) {
        if (!v.def.flying || Math.hypot(v.x - run.x, v.z - run.z) > 100) continue;
        core.voices.boo(run.x, run.z, 0.5);
        core.emotions.addLegit(run.x, run.z, -0.03);
        kit.tension(0.02, run.x, run.z, 'drone_repere');
        const n = kit.near(run.x, run.z, 25, 8);
        for (let i = 0; i < n; i++) kit.core.behavior.gesture(kit.out[i]!, brainOf(kit.out[i]!)!, A.FILM, 6);
        run.until = kit.now + 10;
        return true;
      }
      return false;
    },
  },
  {
    id: 'vent_tournant', label: 'Le vent tourne', gravity: 1, phases: LATE, weight: 0.9,
    start(kit, run) {
      const core = kit.core;
      // n'a de sens que si du gaz a été employé (bible G.1)
      if (core.sense.gas.items.length === 0) return false;
      const env = core.ctx.env;
      const a = (kit.rand() < 0.5 ? 1 : -1) * kit.range(1.5, 3.1);
      const speed = Math.max(1.5, Math.hypot(env.state.windX, env.state.windZ));
      const h = Math.atan2(env.state.windX, env.state.windZ) + a;
      env.setWind(Math.sin(h) * speed, Math.cos(h) * speed);
      kit.radio('Attention, le vent tourne : risque de retour de gaz.', 2);
      run.until = kit.now + 5;
      return true;
    },
  },
  {
    id: 'parcours_raccourci', label: 'Les organisateurs raccourcissent le parcours', gravity: 1, phases: MARCH, weight: 0.7,
    start(kit, run) {
      const f = kit.core.formation;
      if (f.endS - f.headS < 160) return false;
      f.endS = f.headS + kit.range(90, 150);
      kit.point(run, 0);
      kit.say('consigne', 'Le parcours est raccourci : dispersion au prochain carrefour.', run.x, run.z);
      run.until = kit.now + 5;
      return true;
    },
  },
  {
    id: 'vehicule_bloque', label: 'Un automobiliste est bloqué dans le cortège', gravity: 1, phases: MARCH, weight: 0.8,
    start(kit, run) {
      const core = kit.core;
      const ctx = core.ctx;
      const ap = ctx.service<AutopilotLike>('vehicles.autopilot');
      if (!ap || typeof ap.driveTo !== 'function') return false;
      core.corridor.at(core.formation.headS + 45, core.rp);
      const x = core.rp.x - core.rp.tz * core.rp.center;
      const z = core.rp.z + core.rp.tx * core.rp.center;
      if (!ctx.world.isFree(x, z, 2.2) || ctx.people.countIn(x, z, 6) > 0) return false;
      const v = ctx.vehicles.spawn('voiture', x, z, Math.atan2(-core.rp.tx, -core.rp.tz));
      run.n = v.id;
      run.x = x;
      run.z = z;
      run.until = kit.now + kit.range(60, 100) * kit.K;
      kit.mood(x, z, 30, 0, 0.04);
      kit.tension(0.03, x, z, 'automobiliste_bloque');
      const incidents = ctx.service<IncidentsApi>(EXT.incidents);
      if (incidents && typeof incidents.open === 'function') incidents.open('automobiliste_bloque', x, z, 'vehicle', v.id, 1);
      return true;
    },
    end(kit, run) {
      // le service d'ordre le fait repartir par une rue latérale
      const ctx = kit.core.ctx;
      const v = ctx.vehicles.get(run.n);
      const ap = ctx.service<AutopilotLike>('vehicles.autopilot');
      if (!v) return;
      const exit = { until: 0, x: 0, z: 0, ids: [], n: 0, v: 0, next: 0 };
      if (!ap || !kit.sideStreet(kit.core.corridor.project(v.x, v.z, kit.core.formation.headS, 300), exit, 60) || !ap.driveTo(v, exit.x, exit.z, { speed: 3 })) ctx.vehicles.remove(v.id);
    },
  },
  // ───────────────────────────── gravité 2 ─────────────────────────────
  {
    id: 'groupe_hostile', label: 'Arrivée d’un groupe hostile', gravity: 2, phases: LATE, weight: 1.2,
    start(kit, run) {
      const core = kit.core;
      if (!kit.sideStreet(core.formation.headS + 25, run, 42)) kit.point(run, 0, 40);
      const count = Math.round(Math.min(24, Math.max(8, core.size * 0.03)) * (0.6 + 0.8 * core.volatility));
      const radicals = Math.max(1, Math.round(count * 0.3));
      const made = kit.spawnGroup(run, radicals, 'radical', 'black_bloc', true, 0.75);
      const followers = kit.spawnGroup(run, count - radicals, 'opportuniste', 'divers', true, 0.65);
      kit.tension(0.1, run.x, run.z, 'groupe_hostile');
      kit.radio('Un groupe d’une vingtaine d’individus hostiles rejoint la tête de cortège, ' + core.ctx.world.sectorName(run.x, run.z) + '.', 2);
      run.until = kit.now + 20;
      return made.length + followers.length > 0;
    },
  },
  {
    id: 'rumeur', label: 'Rumeur d’un blessé grave', gravity: 2, phases: LATE, weight: 1.1,
    start(kit, run) {
      run.until = kit.now + 60 * kit.K;
      run.n = 0;
      kit.core.director.addGlobal(0.05 + 0.03 * kit.core.volatility, 'video_virale');
      return true;
    },
    tick(kit, run) {
      // la nouvelle remonte le cortège, de proche en proche
      const where = (run.n++ % 12) / 11;
      kit.point(run, where);
      kit.mood(run.x, run.z, 45, 0.03, 0.07);
      kit.core.emotions.addLegit(run.x, run.z, -0.02);
      kit.core.emotions.addCohesion(run.x, run.z, 0.02);
    },
  },
  {
    id: 'contre_cortege', label: 'Un contre-cortège barre la route', gravity: 2, phases: MARCH, weight: 1,
    start(kit, run) {
      const core = kit.core;
      const f = core.formation;
      if (f.endS - f.headS < 80) return false;
      kit.point(run, 0, 55);
      if (!core.ctx.world.isFree(run.x, run.z, 1)) return false;
      const seconds = kit.range(90, 150) * kit.K;
      const made = kit.spawnGroup(run, Math.min(40, Math.max(15, Math.round(core.size * 0.05))), 'militant', 'divers', false, 0.5);
      core.corridor.at(f.headS, core.rp);
      for (const p of made) kit.errand(p, p.x, p.z, seconds, core.rp.x, core.rp.z);
      kit.halt(seconds, 'contre_cortege');
      kit.chant('On ne passe pas ! On ne passe pas !', '', run.x, run.z, 0.9);
      kit.mood(core.rp.x, core.rp.z, 30, 0.03, 0.1);
      kit.tension(0.08, run.x, run.z, 'contre_cortege');
      kit.radio('Un contre-rassemblement barre le parcours, ' + core.ctx.world.sectorName(run.x, run.z) + '.', 2);
      run.until = kit.now + seconds;
      return made.length > 0;
    },
    tick(kit, run) {
      // des forces qui s'interposent : le contre-cortège se retire plus tôt
      if (kit.core.sense.policeNear(run.x, run.z, 2) < 14) run.until = Math.min(run.until, kit.now + 8);
    },
    end(kit, run) {
      kit.dismiss(run);
    },
  },
  {
    id: 'provocation', label: 'Un petit groupe provoque les forces de l’ordre', gravity: 2, phases: LATE, weight: 1,
    start(kit, run) {
      const core = kit.core;
      kit.point(run, 0.03);
      const d = core.sense.policeNear(run.x, run.z, 6);
      if (d > 70) return false;
      const px = core.sense.nearX;
      const pz = core.sense.nearZ;
      const n = kit.near(run.x, run.z, 30, 9, agitated);
      if (n < 3) return false;
      const ux = (run.x - px) / Math.max(1, d);
      const uz = (run.z - pz) / Math.max(1, d);
      for (let i = 0; i < n; i++) {
        const p = kit.out[i]!;
        p.anger = Math.max(p.anger, 0.65);
        kit.errand(p, px + ux * 10 - uz * (i - n / 2) * 1.2, pz + uz * 10 + ux * (i - n / 2) * 1.2, 40, px, pz);
      }
      core.voices.boo(px + ux * 10, pz + uz * 10, 0.9);
      kit.mood(run.x, run.z, 25, 0, 0.05);
      kit.tension(0.06, px + ux * 10, pz + uz * 10, 'provocation');
      run.until = kit.now + 40;
      return true;
    },
  },
  {
    id: 'scission', label: 'Une partie du cortège de tête part en cortège sauvage', gravity: 2, phases: LATE, weight: 1,
    start(kit, run) {
      const core = kit.core;
      const f = core.formation;
      kit.point(run, 0.05);
      const hx = run.x;
      const hz = run.z;
      if (!kit.sideStreet(f.headS + 10, run, 70)) return false;
      const n = kit.near(hx, hz, 30, 30, agitated);
      if (n < 6) return false;
      const seconds = kit.range(90, 150) * kit.K;
      for (let i = 0; i < n; i++) kit.errand(kit.out[i]!, run.x + (kit.rand() - 0.5) * 8, run.z + (kit.rand() - 0.5) * 8, seconds);
      kit.tension(0.06, run.x, run.z, 'cortege_sauvage');
      kit.radio('Un groupe quitte le parcours déclaré, ' + core.ctx.world.sectorName(run.x, run.z) + '.', 2);
      run.until = kit.now + seconds;
      return true;
    },
  },
];
