/* =====================================================================================
 * HUD — habillages de caméra.
 *   drone  : cadre et réticule fin (calque plein écran) + bandeau d'instruments en haut au centre
 *            (altitude, cap, batterie, zoom, durée du vol) ;
 *   viseur : cadre du journaliste et règle des tiers (calque) + bandeau en bas au centre (focale,
 *            zoom, compteur de clichés, valeur du dernier cliché).
 * Les bandeaux sont des éléments de zone : ils s'empilent avec le reste du HUD sans rien recouvrir.
 * ===================================================================================== */

import type { Unsubscribe } from '@/core/contracts';
import { compassBearing } from '@/core/math';
import type { HudSlot } from '@/core/extensions';
import { Flag, Shown, Txt, el, h } from '../core/dom';
import { cardinal8, decimal, stopwatch } from '../core/format';
import { focalLength } from './model';
import type { HudEnv, HudPart, HudState } from './types';

function reading(label: string, extraClass = ''): { el: HTMLElement; value: Txt; low: Flag } {
  const value = h('b');
  const root = el('span', extraClass || undefined, h('span', 'hud-cap', label), value);
  return { el: root, value: new Txt(value), low: new Flag(root, 'is-low') };
}

/** Cadre de la caméra du drone : quatre coins et un réticule fin. */
export function createDroneFrame(_env: HudEnv): HudPart {
  const root = h('div', 'hud-overlay hud-drone');
  root.append(
    h('div', 'hud-corner hud-corner--tl'), h('div', 'hud-corner hud-corner--tr'),
    h('div', 'hud-corner hud-corner--bl'), h('div', 'hud-corner hud-corner--br'), h('div', 'hud-cross'),
  );
  return {
    id: 'drone-frame',
    el: root,
    order: 0,
    slot(): HudSlot | null {
      return null;
    },
    visible(s: HudState): boolean {
      return s.profile.drone;
    },
  };
}

/** Instruments du drone : altitude, cap, batterie, zoom, durée du vol. */
export function createDroneBand(env: HudEnv): HudPart {
  const ctx = env.ctx;
  const alt = reading('Alt');
  const cap = reading('Cap');
  const bat = reading('Bat');
  const zoom = reading('Zoom', 'hud-band__extra');
  const vol = reading('Vol', 'hud-band__extra');
  const root = el('div', 'hud-box hud-band', alt.el, cap.el, bat.el, zoom.el, vol.el);
  const batShown = new Shown(bat.el);
  let flight = 0;

  return {
    id: 'drone',
    el: root,
    order: 10,
    slot(): HudSlot {
      return 'top';
    },
    visible(s: HudState): boolean {
      return s.profile.drone;
    },
    tick(s: HudState): void {
      // altitude au-dessus du sol : engin volant piloté, sinon caméra
      let x = s.x;
      let y = 0;
      let z = s.z;
      let known = false;
      const v = s.vehicle;
      if (v && v.def.flying) {
        x = v.x;
        y = v.y;
        z = v.z;
        known = true;
      } else if (ctx.view) {
        x = ctx.view.camX;
        y = ctx.view.camY;
        z = ctx.view.camZ;
        known = true;
      }
      alt.value.set(known ? `${Math.max(0, Math.round(y - ctx.world.heightAt(x, z)))} m` : '—');
      const bearing = compassBearing(s.yaw);
      cap.value.set(`${Math.round(bearing) % 360}° ${cardinal8(bearing)}`);
      // batterie : état de la télécommande du télépilote (ItemStack.state), si elle est en dotation
      let battery = -1;
      const p = s.person;
      if (p) {
        for (let i = 0; i < p.inventory.length; i++) {
          if (p.inventory[i]!.id === 'telecommande_drone') {
            battery = p.inventory[i]!.state;
            break;
          }
        }
      }
      batShown.set(battery >= 0);
      if (battery >= 0) {
        bat.value.set(`${Math.round(Math.max(0, Math.min(1, battery)) * 100)} %`);
        bat.low.set(battery < 0.2);
      }
      zoom.value.set('×' + decimal(ctx.player.state.zoom || 1, 1));
      vol.value.set(stopwatch(flight));
    },
    frame(dt: number): void {
      if (ctx.session.phase === 'playing') flight += dt * ctx.clock.timeScale;
    },
    reset(): void {
      flight = 0;
    },
  };
}

/** Cadre du viseur du journaliste : bords, règle des tiers, collimateur. */
export function createViewfinderFrame(_env: HudEnv): HudPart {
  const root = h('div', 'hud-overlay hud-vf');
  const frame = h('div', 'hud-vf__frame');
  frame.append(
    h('div', 'hud-vf__third hud-vf__third--v1'), h('div', 'hud-vf__third hud-vf__third--v2'),
    h('div', 'hud-vf__third hud-vf__third--h1'), h('div', 'hud-vf__third hud-vf__third--h2'), h('div', 'hud-vf__af'),
  );
  root.append(frame);
  return {
    id: 'viewfinder-frame',
    el: root,
    order: 0,
    slot(): HudSlot | null {
      return null;
    },
    visible(s: HudState): boolean {
      return s.profile.viewfinder;
    },
  };
}

/** Données du viseur : focale, zoom, compteur de clichés (événement media:shot du joueur). */
export function createViewfinderBand(env: HudEnv): HudPart {
  const ctx = env.ctx;
  const focal = reading('Focale');
  const zoom = reading('Zoom');
  const shots = reading('Clichés');
  const gain = h('span', 'hud-vf__gain');
  gain.hidden = true;
  const root = el('div', 'hud-box hud-band hud-vfband', focal.el, zoom.el, shots.el, gain);
  const gainText = new Txt(gain);
  const gainShown = new Shown(gain);
  let count = 0;
  let gainLeft = 0;
  const offs: Unsubscribe[] = [];
  offs.push(ctx.events.on('media:shot', ({ byId, value }) => {
    if (byId === 0 || byId !== ctx.player.state.personId) return;
    count++;
    gainText.set(value > 0 ? `+${Math.round(value)}` : 'Sans intérêt');
    gainLeft = 1.8;
    gainShown.set(true);
  }));

  return {
    id: 'viewfinder',
    el: root,
    order: 15,
    slot(): HudSlot {
      return 'bottom';
    },
    visible(s: HudState): boolean {
      return s.profile.viewfinder;
    },
    tick(): void {
      const z = ctx.player.state.zoom || 1;
      focal.value.set(`${focalLength(z)} mm`);
      zoom.value.set('×' + decimal(z, 1));
      shots.value.set(String(count));
    },
    frame(dt: number): void {
      if (gainLeft > 0) {
        gainLeft -= dt;
        if (gainLeft <= 0) gainShown.set(false);
      }
    },
    reset(): void {
      count = 0;
      gainLeft = 0;
      gainShown.set(false);
    },
    dispose(): void {
      for (const off of offs) off();
    },
  };
}
