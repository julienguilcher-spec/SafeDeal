/* =====================================================================================
 * Sirènes, gyrophares, phares, clignotants, klaxon.
 *
 * Les états sont les champs du contrat (Vehicle.siren, beacons, headlights, indicator, cmd.horn) :
 * un contrôleur peut les écrire directement ou passer par le service étendu. Ce sous-système les
 * rend cohérents à chaque pas et signale les changements :
 *   - sirène et gyrophares seulement si le véhicule en est équipé et n'est pas une épave ; une
 *     sirène en marche allume les gyrophares ;
 *   - phares automatiques (nuit, éclairage public allumé, brouillard, forte pluie) tant que le
 *     moteur tourne, sauf réglage manuel ;
 *   - événement vehicle:siren à chaque changement de sirène ; événement libre 'vehicles:lights'
 *     pour gyrophares, phares et clignotants ; demande sfx 'klaxon' à chaque coup de klaxon.
 * ===================================================================================== */

import type { EnvState } from '@/core/contracts';
import { LIGHTS_EVENT } from './api';
import type { VehicleKernel, VehicleRt } from './runtime';

export class LightSystem {
  constructor(private readonly k: VehicleKernel) {}

  update(rt: VehicleRt, env: EnvState, dt: number): void {
    const v = rt.v;
    const dead = v.state === 'wrecked' || v.state === 'burnt';
    const def = v.def;
    if (v.siren !== 0 && (!def.hasSiren || dead)) v.siren = 0;
    if (v.beacons && (!def.hasBeacons || dead)) v.beacons = false;
    if (v.siren !== 0 && !v.beacons && def.hasBeacons) v.beacons = true;
    if (rt.headlightsAuto) {
      v.headlights = v.engineOn && !dead && (env.isNight || env.streetLights || env.fog > 0.5 || env.rain > 0.6);
    } else if (dead && v.headlights) {
      v.headlights = false;
    }
    if (dead && v.indicator !== 0) v.indicator = 0;

    if (v.siren !== rt.lastSiren) {
      rt.lastSiren = v.siren;
      this.k.ctx.events.emit('vehicle:siren', { id: v.id, siren: v.siren });
    }
    if (v.beacons !== rt.lastBeacons || v.headlights !== rt.lastHeadlights || v.indicator !== rt.lastIndicator) {
      rt.lastBeacons = v.beacons;
      rt.lastHeadlights = v.headlights;
      rt.lastIndicator = v.indicator;
      this.k.ctx.events.emitAny(LIGHTS_EVENT, { id: v.id, beacons: v.beacons, headlights: v.headlights, indicator: v.indicator });
    }

    // klaxon : tenu par la commande, ou le temps demandé par le service
    if (rt.hornT > 0) {
      rt.hornT -= dt;
      v.cmd.horn = rt.hornT > 0;
    }
    const horn = v.cmd.horn && !dead && !def.flying;
    if (horn && !rt.hornWas) {
      this.k.ctx.events.emit('sfx', { id: 'klaxon', x: v.x, y: v.y + 0.8, z: v.z, volume: 1 });
    }
    rt.hornWas = horn;
  }
}
