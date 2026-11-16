/* =====================================================================================
 * Carte tactique — bulle d'une station de métro ou d'une rue fermée touchée sur la carte : état et
 * actions directes (fermer, rouvrir, faire filtrer). Elle suit son point par transformation CSS.
 * ===================================================================================== */

import type { MetroStation, RoadClosure } from '@/core/extensions';
import { button, el, setClass } from '../maps/icons';
import type { MapCanvas } from '../maps/mapCanvas';
import type { CommandCore } from './core';
import type { TrafficPanel } from './panelTraffic';
import type { TacticalMap } from './tacticalMap';

export class MapPopover {
  readonly root: HTMLDivElement;
  private station: MetroStation | null = null;
  private closure: RoadClosure | null = null;
  private transform = '';
  private signature = '';
  private readonly sp = { x: 0, y: 0 };

  constructor(
    private readonly core: CommandCore, private readonly map: MapCanvas, private readonly tmap: TacticalMap,
    private readonly traffic: TrafficPanel, host: HTMLElement,
  ) {
    this.root = el('div', 'cm-panel ct-pop');
    host.appendChild(this.root);
  }

  get active(): boolean {
    return this.station !== null || this.closure !== null;
  }

  /** Ouvre la bulle sur une station ou une fermeture (les deux à null : la ferme). */
  open(station: MetroStation | null, closure: RoadClosure | null): void {
    this.station = station;
    this.closure = station ? null : closure;
    this.signature = '';
    this.refresh();
  }

  close(): void {
    this.open(null, null);
  }

  /** Met à jour le contenu (s'il a changé) et la position. À appeler à chaque image tant que la bulle est ouverte. */
  refresh(): void {
    const s = this.station;
    const c = this.closure;
    const pop = this.root;
    if (!s && !c) {
      setClass(pop, 'is-on', false);
      return;
    }
    const sc = this.core.scope();
    const sig = s ? `s${s.id}:${s.open}:${s.filtered}:${sc.level}` : `c${c!.id}:${sc.level}`;
    if (sig !== this.signature) {
      this.signature = sig;
      pop.textContent = '';
      if (s) {
        pop.appendChild(el('b', undefined, `Station ${s.name}`));
        pop.appendChild(el('small', undefined, !s.open ? `Fermée — ${Math.round(s.arrived)} personnes sorties avant la fermeture.`
          : `${s.filtered ? 'Sortie filtrée. ' : ''}${Math.round(s.inflow)} arrivées par minute, ${Math.round(s.arrived)} personnes sorties.`));
        const row = el('div', 'ct-btnrow');
        if (sc.canMetro) {
          row.appendChild(button(s.open ? 'Fermer la station' : 'Rouvrir', () => this.traffic.setOpen(s, !s.open), {
            className: 'is-small' + (s.open ? ' is-danger' : ' is-primary'), id: 'pop-metro-open',
          }));
        }
        if (sc.level !== 'lecture' && s.open) {
          row.appendChild(button(s.filtered ? 'Lever le filtrage' : 'Filtrer la sortie', () => this.traffic.setFiltered(s, !s.filtered), {
            className: 'is-small', id: 'pop-metro-filter',
          }));
        }
        if (row.childElementCount > 0) pop.appendChild(row);
      } else if (c) {
        const squad = c.squadId !== 0 ? this.core.ctx.squads.get(c.squadId) : undefined;
        pop.appendChild(el('b', undefined, this.tmap.closureName(c)));
        pop.appendChild(el('small', undefined, squad ? `Circulation coupée, barrage tenu par ${squad.name}.` : 'Circulation coupée, barrières seules.'));
        if (sc.canTraffic) {
          pop.appendChild(button('Rouvrir à la circulation', () => {
            this.traffic.reopen(c);
            this.close();
          }, { className: 'is-small is-primary', id: 'pop-reopen' }));
        }
      }
      setClass(pop, 'is-on', true);
    }
    // une fermeture rouverte ailleurs fait disparaître sa bulle
    if (c && this.core.traffic && this.core.traffic.closures.indexOf(c) < 0) {
      this.closure = null;
      setClass(pop, 'is-on', false);
      return;
    }
    const x = s ? s.x : c!.x;
    const z = s ? s.z : c!.z;
    const view = this.map.view;
    view.worldToScreen(x, z, this.sp);
    const px = Math.min(view.width - 260, Math.max(8, this.sp.x + 16));
    const py = Math.min(view.height - 130, Math.max(8, this.sp.y + 14));
    const t = `translate3d(${Math.round(px)}px,${Math.round(py)}px,0)`;
    if (t !== this.transform) {
      this.transform = t;
      pop.style.transform = t;
    }
  }
}
