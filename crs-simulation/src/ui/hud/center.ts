/* =====================================================================================
 * HUD — centre de l'écran : réticule, jauge de charge du lancer (PlayerState.charge), indicateurs
 * de direction des coups reçus, et effets d'écran (gaz, flash, douleur, visière, eau) envoyés à
 * ctx.view.setScreenEffect. Sans module de rendu (ctx.view nul), les mêmes effets sont rendus par
 * des voiles CSS, pour que le banc d'essai et les tests les montrent.
 * ===================================================================================== */

import type { EntityId, GameContext, Unsubscribe } from '@/core/contracts';
import type { HudSlot } from '@/core/extensions';
import { Flag, Opacity, Shown, Transform, h } from '../core/dom';
import { relativeBearing } from './model';
import type { HudEnv, HudPart, HudState } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CHARGE_R = 23;
const CHARGE_C = 2 * Math.PI * CHARGE_R;
const MAX_HITS = 4;
/** Durée d'affichage d'un indicateur de coup (s). */
const HIT_TIME = 1.5;

type Effect = 'gas' | 'flash' | 'wet' | 'pain' | 'visor';
const EFFECTS: readonly Effect[] = ['gas', 'flash', 'wet', 'pain', 'visor'];

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]!);
  return node;
}

interface Hit {
  angle: number;
  left: number;
}

export function createCenter(env: HudEnv, fxHost: HTMLElement): HudPart {
  const ctx: GameContext = env.ctx;
  const root = h('div', 'hud-center');

  // ── réticule ──
  const svg = svgEl('svg', { class: 'hud-reticle', viewBox: '0 0 80 80', 'aria-hidden': 'true' });
  const dot = svgEl('circle', { class: 'r-dot', cx: '40', cy: '40', r: '1.7' });
  const ticks = svgEl('path', { class: 'r-main', d: 'M40 30v-6M40 50v6M30 40h-6M50 40h6' });
  const turret = svgEl('g', {});
  turret.append(
    svgEl('circle', { class: 'r-main', cx: '40', cy: '40', r: '15' }),
    svgEl('path', { class: 'r-main', d: 'M40 12v12M40 56v12M12 40h12M56 40h12' }),
  );
  const track = svgEl('circle', { class: 'r-track', cx: '40', cy: '40', r: String(CHARGE_R) });
  const charge = svgEl('circle', {
    class: 'r-charge', cx: '40', cy: '40', r: String(CHARGE_R), 'stroke-dasharray': CHARGE_C.toFixed(2), 'stroke-dashoffset': CHARGE_C.toFixed(2),
  });
  svg.append(track, charge, ticks, turret, dot);
  root.append(svg);

  const reticleShown = new Shown(svg as unknown as SVGElement);
  const ticksShown = new Shown(ticks);
  const turretShown = new Shown(turret);
  const chargeShown = new Shown(charge);
  const trackShown = new Shown(track);
  const target = new Flag(svg, 'is-target');
  let lastCharge = -1;

  // ── coups reçus ──
  const hits: Hit[] = [];
  const hitMove: Transform[] = [];
  const hitFade: Opacity[] = [];
  for (let i = 0; i < MAX_HITS; i++) {
    // arc de 50° centré sur le haut, que l'on fait tourner vers l'origine du coup
    const arc = svgEl('svg', { class: 'hud-dmg', viewBox: '-130 -130 260 260', 'aria-hidden': 'true' });
    arc.append(svgEl('path', { d: 'M -49.900 -106.900 A 118 118 0 0 1 49.900 -106.900' }));
    root.append(arc);
    hits.push({ angle: 0, left: 0 });
    hitMove.push(new Transform(arc));
    hitFade.push(new Opacity(arc));
  }
  let nextHit = 0;

  // ── effets d'écran ──
  const sent: Record<Effect, number> = { gas: 0, flash: 0, wet: 0, pain: 0, visor: 0 };
  const fallback: Partial<Record<Effect, Opacity>> = {};
  let pain = 0;
  if (!ctx.view) {
    for (const e of EFFECTS) {
      const layer = h('div', `hud-fx hud-fx--${e}`);
      fxHost.prepend(layer);
      fallback[e] = new Opacity(layer);
    }
  }

  function effect(name: Effect, amount: number): void {
    const v = amount < 0 ? 0 : amount > 1 ? 1 : amount;
    if (Math.abs(v - sent[name]) < 0.01 && !(v === 0 && sent[name] !== 0)) return;
    sent[name] = v;
    if (ctx.view) ctx.view.setScreenEffect(name, v);
    else fallback[name]?.set(v);
  }

  function clearEffects(): void {
    for (const e of EFFECTS) effect(e, 0);
    pain = 0;
  }

  function playerId(): EntityId {
    return ctx.player.state.personId;
  }

  const offs: Unsubscribe[] = [];
  offs.push(ctx.events.on('person:hurt', ({ id, info }) => {
    if (id === 0 || id !== playerId()) return;
    const me = ctx.people.get(id);
    if (!me) return;
    pain = Math.min(1, pain + 0.25 + info.amount / 50);
    if (info.kind === 'gas') return; // le gaz ne vient d'aucune direction
    // origine du coup : l'auteur s'il est connu, sinon l'opposé de la direction du coup, sinon le point d'impact
    let dx = 0;
    let dz = 0;
    const source = info.sourceId !== 0 ? ctx.people.get(info.sourceId) : undefined;
    if (source && source.id !== id) {
      dx = source.x - me.x;
      dz = source.z - me.z;
    } else if (info.dirX !== undefined && info.dirZ !== undefined && (info.dirX !== 0 || info.dirZ !== 0)) {
      dx = -info.dirX;
      dz = -info.dirZ;
    } else {
      dx = info.x - me.x;
      dz = info.z - me.z;
    }
    if (dx * dx + dz * dz < 0.04) return;
    const hit = hits[nextHit]!;
    hit.angle = relativeBearing(ctx.player.state.camYaw, dx, dz);
    hit.left = HIT_TIME;
    hitMove[nextHit]!.set(`rotate(${hit.angle.toFixed(1)}deg)`);
    nextHit = (nextHit + 1) % MAX_HITS;
  }));

  return {
    id: 'center',
    el: root,
    order: 0,
    slot(): HudSlot | null {
      return null;
    },
    visible(): boolean {
      return true;
    },
    frame(dt: number, s: HudState): void {
      const p = s.person;
      const mode = s.profile.reticle;
      reticleShown.set(mode !== 'none');
      if (mode !== 'none') {
        ticksShown.set(mode === 'dot');
        turretShown.set(mode === 'turret');
        const ps = ctx.player.state;
        target.set(ps.aimedPersonId !== 0);
        const c = ps.charge < 0 ? 0 : ps.charge > 1 ? 1 : ps.charge;
        const active = c > 0.01;
        chargeShown.set(active);
        trackShown.set(active);
        if (active && Math.abs(c - lastCharge) > 0.004) {
          lastCharge = c;
          charge.setAttribute('stroke-dashoffset', (CHARGE_C * (1 - c)).toFixed(1));
        }
      }
      for (let i = 0; i < MAX_HITS; i++) {
        const hit = hits[i]!;
        if (hit.left <= 0) continue;
        hit.left -= dt;
        hitFade[i]!.set(hit.left > 0 ? Math.min(1, hit.left / (HIT_TIME * 0.6)) : 0);
      }
      // effets d'écran
      if (pain > 0) pain = Math.max(0, pain - dt * 0.5);
      if (p) {
        effect('gas', p.gas * (p.look.gasMask ? 0.25 : 1));
        effect('flash', p.stun > 0 ? Math.min(1, p.stun / 2.5) : 0);
        effect('wet', p.wet * 0.7);
        effect('pain', Math.max(pain, p.health < 30 ? (30 - p.health) / 60 : 0));
        effect('visor', p.look.visorDown && s.camera === 'fps' ? 1 : 0);
      } else {
        clearEffects();
      }
    },
    hidden(): void {
      clearEffects();
      for (let i = 0; i < MAX_HITS; i++) {
        hits[i]!.left = 0;
        hitFade[i]!.set(0);
      }
    },
    reset(): void {
      clearEffects();
      for (let i = 0; i < MAX_HITS; i++) {
        hits[i]!.left = 0;
        hitFade[i]!.set(0);
      }
    },
    dispose(): void {
      for (const off of offs) off();
      clearEffects();
    },
  };
}
