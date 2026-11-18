/* =====================================================================================
 * FOULE — service 'crowd.core' (CrowdCoreApi) : la façade offerte aux autres modules, en particulier aux
 * contrôleurs de comportement des groupes radicaux (src/sim/crowd/radical/). Voir api.ts pour le contrat.
 * ===================================================================================== */

import type { CrowdPhase, Person } from '@/core/contracts';
import type { AleaInfo, CrowdCause, CrowdCoreApi, CrowdExit, CrowdGroup, PoliceSight } from './api';
import { S, brainOf } from './brain';
import type { CrowdCore } from './core';
import * as T from './tuning';

export function createCoreApi(core: CrowdCore): CrowdCoreApi {
  return {
    get active(): boolean { return core.active; },
    get veille(): boolean { return core.veille; },
    get members(): readonly Person[] { return core.members; },
    get groups(): readonly CrowdGroup[] { return core.groups; },
    get basePhase(): CrowdPhase { return core.director.base; },
    get cause(): Readonly<CrowdCause> { return core.cause; },
    get volatility(): number { return core.volatility; },
    get timeScale(): number { return core.timeScale; },
    get formation() { return core.formation; },
    get metro() { return core.metro; },
    get exits(): readonly CrowdExit[] { return core.nav.exits; },
    get aleas(): readonly AleaInfo[] { return core.aleas.infos; },
    brain: (p) => brainOf(p),
    group: (id) => core.groups[id],
    registerController: (profile, controller) => core.register(profile, controller),
    tensionAt: (x, z) => core.director.tensionAt(x, z),
    legitimacyAt: (x, z) => core.emotions.legitAt(x, z),
    cohesionAt: (x, z) => core.emotions.cohesionAt(x, z),
    addLegitimacy: (x, z, d) => core.emotions.addLegit(x, z, d),
    addCohesion: (x, z, d) => core.emotions.addCohesion(x, z, d),
    stir: (x, z, r, fear, anger) => core.emotions.stir(x, z, r, fear, anger),
    markViolence: (x, z) => core.sense.markViolence(x, z),
    recentViolence: (x, z, r) => core.sense.recentViolence(x, z, r ?? T.JUSTIFY_RADIUS),
    nearestPolice: (x: number, z: number, r: number, out: PoliceSight) => core.sense.nearestPolice(x, z, r, out),
    coverAt: (x, z, r) => core.sense.coverAt(x, z, r),
    densityAt: (x, z) => core.density.at(x, z),
    routePoint: (s, out) => core.corridor.at(s, out),
    goTo(p, x, z, speed, run) {
      const b = brainOf(p);
      if (!b || b.index < 0) return;
      core.steering.goTo(p, b, x, z, speed ?? T.WALK_MAX, run === true);
    },
    leave(p, exit) {
      const b = brainOf(p);
      if (b && b.index >= 0) core.behavior.startLeaving(p, b, exit ?? -1);
    },
    release(p) {
      const b = brainOf(p);
      if (!b) return;
      if (b.controller && b.controller.release) b.controller.release(p, b);
      b.controller = null;
      if (b.state === S.CUSTOM) b.state = S.REGROUP;
      b.nextThink = 0;
    },
    spawn(profile, x, z, opts) {
      return core.spawnExtra(profile, x, z, opts);
    },
    setProfile: (p, to) => core.emotions.setProfile(p, to),
    createGroup: (kind, members) => core.createGroup(kind, members),
    triggerAlea: (id) => core.aleas.trigger(id),
    setLiaison: (active) => {
      const was = core.director.liaison;
      core.director.liaison = active;
      // événement libre lu par le cadre de mission (objectif « parcours négocié par la liaison »)
      if (was !== active) core.ctx.events.emitAny('crowd:liaison', { active });
    },
    announceDispersal: () => core.director.announceDispersal('organisateurs'),
  };
}
