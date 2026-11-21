/* =====================================================================================
 * Petits éléments communs aux écrans de carte : échelle graphique, rose des vents (nord + vent),
 * boutons de zoom et de recentrage. Chaque élément n'écrit dans le DOM que si sa valeur change.
 * ===================================================================================== */

import type { GameContext } from '@/core/contracts';
import { button, el, setText } from './icons';
import type { MapCanvas } from './mapCanvas';
import type { MapsRuntime } from './runtime';
import { niceScale } from './transform';

/** Échelle graphique : barre et longueur « ronde ». */
export class ScaleBar {
  readonly root: HTMLDivElement;
  private readonly bar: HTMLElement;
  private readonly text: HTMLElement;
  private lastMpp = -1;

  constructor(host: HTMLElement) {
    this.root = el('div', 'cm-scale');
    this.text = el('span');
    this.bar = el('i');
    this.root.append(this.text, this.bar);
    host.appendChild(this.root);
  }

  update(mpp: number): void {
    if (Math.abs(mpp - this.lastMpp) < this.lastMpp * 0.01) return;
    this.lastMpp = mpp;
    const s = niceScale(mpp, 90);
    this.bar.style.width = Math.round(s.px) + 'px';
    setText(this.text, s.meters >= 1000 ? `${s.meters / 1000} km` : `${s.meters} m`);
  }
}

/** Rose des vents : nord en haut (carte fixe) et flèche du vent, avec sa force. */
export class WindRose {
  readonly root: HTMLDivElement;
  private readonly needle: HTMLElement;
  private readonly text: HTMLElement;
  private lastKey = '';

  constructor(host: HTMLElement, className: string) {
    this.root = el('div', 'cm-compass ' + className);
    const rose = el('div', 'cm-rose');
    this.needle = el('i');
    rose.appendChild(this.needle);
    this.text = el('span');
    this.root.append(rose, this.text);
    host.appendChild(this.root);
  }

  update(ctx: GameContext): void {
    const env = ctx.env.state;
    const speed = Math.hypot(env.windX, env.windZ);
    const kmh = Math.round(speed * 3.6);
    // la flèche pointe là où va le vent ; le texte dit d'où il vient (usage météo)
    const to = Math.atan2(env.windX, -env.windZ);
    const deg = Math.round((to * 180) / Math.PI / 5) * 5;
    const key = kmh + '|' + deg;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.needle.style.transform = `rotate(${deg}deg)`;
    this.needle.style.opacity = kmh < 1 ? '0.25' : '1';
    if (kmh < 1) this.text.innerHTML = 'Vent <b>nul</b>';
    else this.text.innerHTML = `Vent <b>${windFrom(env.windX, env.windZ)}</b> · <b>${kmh}</b> km/h`;
  }
}

const SECTORS = ['de nord', 'de nord-est', 'd’est', 'de sud-est', 'de sud', 'de sud-ouest', 'd’ouest', 'de nord-ouest'];

/** Provenance du vent en toutes lettres (« d’ouest »), à partir du vecteur vers lequel il souffle. */
export function windFrom(windX: number, windZ: number): string {
  // provenance = opposé du vecteur ; cap boussole 0 = nord, sens horaire
  const bearing = Math.atan2(-windX, windZ);
  const idx = ((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8;
  return SECTORS[idx]!;
}

/** Colonne de boutons : zoom avant, zoom arrière, recentrage sur le joueur. */
export function mapControls(host: HTMLElement, map: MapCanvas, runtime: MapsRuntime, extra?: HTMLElement[]): HTMLDivElement {
  const box = el('div', 'cm-mapctl');
  if (extra) for (let i = 0; i < extra.length; i++) box.appendChild(extra[i]!);
  box.append(
    button('', () => map.zoomBy(1.6), { icon: 'plus', className: 'is-icon', title: 'Zoom avant', id: 'zoom-in' }),
    button('', () => map.zoomBy(1 / 1.6), { icon: 'minus', className: 'is-icon', title: 'Zoom arrière', id: 'zoom-out' }),
    button('', () => {
      const s = runtime.scene;
      if (s.hasPlayer) map.flyTo(s.px, s.pz);
    }, { icon: 'locate', className: 'is-icon', title: 'Recentrer sur ma position', id: 'recenter' }),
  );
  host.appendChild(box);
  return box;
}
