/* =====================================================================================
 * HUD — tableau de bord du véhicule : vitesse, rapport, sirène, gyrophares, phares, munitions de
 * tourelle ou eau restante, état. Zone : bas droite ; en tactile, bas centre (les pédales
 * occupent le coin droit).
 * ===================================================================================== */

import type { HudSlot } from '@/core/extensions';
import { CssVar, Flag, Shown, Txt, el, h } from '../core/dom';
import { int } from '../core/format';
import { icon } from '../core/icons';
import { gearLabel, turretReadout } from './model';
import type { HudEnv, HudPart, HudState } from './types';

export function createVehicleHud(_env: HudEnv): HudPart {
  const root = h('div', 'hud-box hud-veh');
  const nameEl = h('span', 'hud-cap');
  const stateEl = h('span', 'hud-veh__state');
  const top = el('div', 'hud-veh__top', nameEl, stateEl);
  const speedEl = h('span', 'hud-veh__speed');
  const gearEl = h('span', 'hud-veh__gear');
  const sirenEl = h('span', 'hud-lamp');
  sirenEl.append(icon('siren'));
  sirenEl.title = 'Sirène';
  const beaconEl = h('span', 'hud-lamp hud-lamp--blue');
  beaconEl.append(icon('beacons'));
  beaconEl.title = 'Gyrophares';
  const lightsEl = h('span', 'hud-lamp');
  lightsEl.append(icon('headlights'));
  lightsEl.title = 'Phares';
  const main = el('div', 'hud-veh__main', speedEl, h('span', 'hud-veh__unit', 'km/h'), gearEl,
    el('span', 'hud-veh__lamps', sirenEl, beaconEl, lightsEl));
  const ammoLabel = h('span', 'hud-cap');
  const ammoGauge = h('div', 'ui-gauge');
  ammoGauge.append(h('div', 'ui-gauge__fill'));
  const ammoValue = h('span', 'hud-status__num');
  ammoValue.style.width = 'auto';
  const ammo = el('div', 'hud-veh__ammo', ammoLabel, ammoGauge, ammoValue);
  root.append(top, main, ammo);

  const name = new Txt(nameEl);
  const state = new Txt(stateEl);
  const stateAlert = new Flag(stateEl, 'is-alert');
  const speed = new Txt(speedEl);
  const gear = new Txt(gearEl);
  const siren = new Flag(sirenEl, 'is-on');
  const beacons = new Flag(beaconEl, 'is-on');
  const lights = new Flag(lightsEl, 'is-on');
  const sirenShown = new Shown(sirenEl);
  const beaconShown = new Shown(beaconEl);
  const ammoShown = new Shown(ammo);
  const ammoName = new Txt(ammoLabel);
  const ammoText = new Txt(ammoValue);
  const ammoFill = new CssVar(ammoGauge, '--v', 0.004);
  const ammoLow = new Flag(ammoGauge, 'ui-gauge--alert');

  return {
    id: 'vehicle',
    el: root,
    order: 30,
    slot(s: HudState): HudSlot {
      return s.touch === 'none' ? 'bottom-right' : 'bottom';
    },
    visible(s: HudState): boolean {
      return s.profile.vehicle && s.vehicle !== null;
    },
    tick(s: HudState): void {
      const v = s.vehicle;
      if (!v) return;
      name.set(v.def.name);
      speed.set(String(Math.round(Math.abs(v.speed) * 3.6)));
      gear.set(gearLabel(v));
      sirenShown.set(v.def.hasSiren);
      beaconShown.set(v.def.hasBeacons);
      siren.set(v.siren !== 0);
      beacons.set(v.beacons);
      lights.set(v.headlights);
      let label = '';
      if (v.state === 'burning' || v.burning > 0.05) label = 'En feu !';
      else if (v.state === 'wrecked' || v.state === 'burnt') label = 'Hors d’usage';
      else if (v.state === 'damaged') label = 'Endommagé';
      state.set(label);
      stateAlert.set(label !== '' && label !== 'Endommagé');
      const t = turretReadout(v);
      ammoShown.set(t !== null);
      if (t) {
        ammoName.set(t.label);
        ammoText.set(t.unit ? `${int(t.value)} ${t.unit}` : `${int(t.value)}/${int(t.max)}`);
        const ratio = t.max > 0 ? t.value / t.max : 0;
        ammoFill.set(ratio < 0 ? 0 : ratio > 1 ? 1 : ratio);
        ammoLow.set(ratio < 0.2);
      }
    },
  };
}
