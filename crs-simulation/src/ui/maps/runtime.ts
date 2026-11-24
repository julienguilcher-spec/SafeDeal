/* =====================================================================================
 * Moteur commun des cartes, publié sous la clé 'ui.maps' : scène partagée, GPS, fond de plan
 * (service 'world.map2d' s'il existe, sinon repli interne). La mini-carte, le plan et la carte
 * tactique s'appuient tous dessus.
 * ===================================================================================== */

import type { GameContext } from '@/core/contracts';
import { MAP2D_SERVICE } from './api';
import type { GpsTarget, Map2dService, MapsApi } from './api';
import { FallbackBasemap } from './basemap';
import { GpsTracker } from './gps';
import { MapScene } from './scene';

export function realTime(): number {
  return typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000;
}

export class MapsRuntime implements MapsApi {
  readonly scene: MapScene;
  readonly gps: GpsTracker;
  readonly fallback: FallbackBasemap;
  /** Horloge réelle de la dernière image (s). */
  time = realTime();
  private lastPump = 0;
  private lastGps = 0;
  private lastUse = -1e9;
  private readonly unsub: (() => void)[] = [];

  constructor(readonly ctx: GameContext) {
    this.scene = new MapScene(ctx);
    this.gps = new GpsTracker(ctx);
    this.fallback = new FallbackBasemap(ctx);
    const ev = ctx.events;
    this.unsub.push(
      ev.on('session:started', () => {
        this.scene.invalidate();
        this.gps.reset();
      }),
      ev.on('player:possessed', () => this.scene.invalidate()),
      ev.on('world:tile_loaded', () => this.fallback.touch()),
    );
  }

  /** Fond de plan à utiliser : le service du monde s'il existe, sinon le repli interne. */
  basemap = (): Map2dService => {
    const svc = this.ctx.service<Map2dService>(MAP2D_SERVICE);
    return svc && typeof svc.draw === 'function' ? svc : this.fallback;
  };

  /** Signale qu'une carte est affichée à cette image : la scène et le GPS sont tenus à jour. */
  use(): void {
    this.lastUse = this.time;
    this.scene.ensureFresh();
  }

  /** À appeler à chaque image par le système (coût nul si aucune carte n'est affichée). */
  frame(): void {
    const t = (this.time = realTime());
    if (t - this.lastUse > 1.5) return;
    if (t - this.lastPump > 0.08) {
      this.lastPump = t;
      this.fallback.pump();
    }
    if (t - this.lastGps > 0.25) {
      this.lastGps = t;
      const s = this.scene;
      this.gps.update(t, s.hasPlayer, s.px, s.pz, s.inVehicle);
    }
  }

  dispose(): void {
    for (let i = 0; i < this.unsub.length; i++) this.unsub[i]!();
    this.unsub.length = 0;
  }

  // ── MapsApi ──
  get waypoint(): GpsTarget | null {
    return this.gps.waypoint;
  }

  setWaypoint(x: number, z: number, label?: string): void {
    this.gps.setWaypoint(x, z, label);
  }

  clearWaypoint(): void {
    this.gps.clearWaypoint();
  }

  get target(): GpsTarget | null {
    return this.gps.target;
  }

  get route(): readonly number[] {
    return this.gps.route;
  }

  get distance(): number {
    return this.gps.distance;
  }
}
