/* =====================================================================================
 * GPS : cible suivie (repère du joueur, sinon objectif suivi, sinon incident confié) et itinéraire
 * calculé par ctx.world.findPath, recalculé au plus une fois par seconde et seulement si le joueur
 * a bougé ou si la cible a changé.
 * Passager d'un véhicule conduit par l'IA (colonne, engin de secours) : le tracé est l'itinéraire que
 * le pilote automatique suit réellement (celui de la tête de colonne), relu chaque seconde — le GPS
 * montre la route que l'on prend, pas un autre chemin calculé de son côté.
 * ===================================================================================== */

import type { GameContext, Vehicle } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, ObjectivesApi } from '@/core/extensions';
import { polylineLength, projectOnPolyline } from '@/core/math';
import type { GpsTarget } from './api';

/** Distance (m) en deçà de laquelle un repère posé par le joueur est considéré comme atteint. */
const ARRIVAL = 9;
/** Déplacement du joueur (m) qui déclenche un nouveau calcul. */
const REPLAN_MOVE = 14;
const REPLAN_SECONDS = 5;
const MIN_PERIOD = 1;

export class GpsTracker {
  waypoint: GpsTarget | null = null;
  target: GpsTarget | null = null;
  readonly route: number[] = [];
  distance = -1;
  /** Incrémenté à chaque changement d'itinéraire ou de cible. */
  revision = 0;

  private lastPlan = -1e9;
  private planX = 0;
  private planZ = 0;
  private planTx = NaN;
  private planTz = NaN;
  private planVehicle = false;
  private routeLength = 0;
  private readonly objectiveTarget: GpsTarget = { x: 0, z: 0, label: '', source: 'objectif' };
  private readonly incidentTarget: GpsTarget = { x: 0, z: 0, label: '', source: 'incident' };
  private readonly proj = { x: 0, z: 0 };
  /** Itinéraire du pilote automatique relu à la dernière seconde (passager), et son dernier point. */
  private readonly driven: number[] = [];
  private drivenAt = -1e9;
  private following = false;

  constructor(private readonly ctx: GameContext) {}

  setWaypoint(x: number, z: number, label?: string): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.waypoint = { x, z, label: label && label !== '' ? label : this.ctx.world.sectorName(x, z) || 'Repère', source: 'repere' };
    this.lastPlan = -1e9;
    this.revision++;
  }

  clearWaypoint(): void {
    if (!this.waypoint) return;
    this.waypoint = null;
    this.lastPlan = -1e9;
    this.revision++;
  }

  reset(): void {
    this.waypoint = null;
    this.target = null;
    this.route.length = 0;
    this.distance = -1;
    this.lastPlan = -1e9;
    this.following = false;
    this.drivenAt = -1e9;
    this.revision++;
  }

  /** Choisit la cible : repère du joueur, sinon objectif suivi, sinon incident confié. */
  private pickTarget(): GpsTarget | null {
    if (this.waypoint) return this.waypoint;
    const ctx = this.ctx;
    const objectives = ctx.service<ObjectivesApi>(EXT.objectives);
    if (objectives && objectives.tracked !== '') {
      for (let i = 0; i < objectives.list.length; i++) {
        const o = objectives.list[i]!;
        if (o.id === objectives.tracked && o.state === 'actif' && o.x !== undefined && o.z !== undefined) {
          const t = this.objectiveTarget;
          t.x = o.x;
          t.z = o.z;
          t.label = o.text;
          return t;
        }
      }
    }
    const incidents = ctx.service<IncidentsApi>(EXT.incidents);
    if (incidents && incidents.playerIncidentId !== 0) {
      const inc = incidents.get(incidents.playerIncidentId);
      if (inc && inc.state !== 'resolu' && inc.state !== 'echoue') {
        const t = this.incidentTarget;
        t.x = inc.x;
        t.z = inc.z;
        t.label = inc.label;
        return t;
      }
    }
    return null;
  }

  /**
   * Met à jour cible, itinéraire et distance. `time` : horloge réelle (s) ; (px, pz) : joueur ;
   * `vehicle` : itinéraire carrossable.
   */
  update(time: number, hasPlayer: boolean, px: number, pz: number, vehicle: boolean): void {
    const target = this.pickTarget();
    if (target !== this.target) {
      this.target = target;
      this.lastPlan = -1e9;
      this.revision++;
    }
    if (!target || !hasPlayer) {
      if (this.route.length > 0) {
        this.route.length = 0;
        this.revision++;
      }
      this.distance = target && hasPlayer ? Math.hypot(target.x - px, target.z - pz) : -1;
      return;
    }
    const direct = Math.hypot(target.x - px, target.z - pz);
    if (target.source === 'repere' && direct < ARRIVAL) {
      this.ctx.ui.notify('Vous êtes arrivé au repère.', 'ok', 3);
      this.clearWaypoint();
      this.target = null;
      this.route.length = 0;
      this.distance = -1;
      return;
    }
    // passager d'un véhicule conduit par l'IA : l'itinéraire réellement suivi par la colonne (sauf vers un repère que
    // le joueur a posé lui-même)
    if (target.source !== 'repere' && this.followDriven(time)) {
      this.measure(px, pz, target, direct);
      return;
    }
    this.stopFollowing();
    const moved = Math.hypot(px - this.planX, pz - this.planZ);
    const targetMoved = target.x !== this.planTx || target.z !== this.planTz;
    const due = time - this.lastPlan;
    if (due >= MIN_PERIOD && (targetMoved || moved > REPLAN_MOVE || due > REPLAN_SECONDS || vehicle !== this.planVehicle)) {
      this.lastPlan = time;
      this.planX = px;
      this.planZ = pz;
      this.planTx = target.x;
      this.planTz = target.z;
      this.planVehicle = vehicle;
      let ok = false;
      try {
        ok = this.ctx.world.findPath(px, pz, target.x, target.z, vehicle ? 'vehicle' : 'foot', this.route);
      } catch (err) {
        console.error('[cartes] échec du calcul d’itinéraire', err);
      }
      if (!ok || this.route.length < 4) this.route.length = 0;
      this.routeLength = this.route.length >= 4 ? polylineLength(this.route) : 0;
      this.revision++;
    }
    this.measure(px, pz, target, direct);
  }

  private measure(px: number, pz: number, target: GpsTarget, direct: number): void {
    if (this.route.length >= 4) {
      const s = projectOnPolyline(px, pz, this.route, this.proj);
      const off = Math.hypot(px - this.proj.x, pz - this.proj.z);
      const end = Math.hypot(target.x - this.route[this.route.length - 2]!, target.z - this.route[this.route.length - 1]!);
      this.distance = Math.max(0, this.routeLength - s) + off + end;
    } else this.distance = direct;
  }

  /**
   * Le joueur est passager d'un véhicule que le pilote automatique conduit (ou qui suit une colonne) : le tracé est
   * l'itinéraire de la tête de colonne (relu au plus une fois par seconde, nouveau tracé quand elle change de route).
   * false sinon (le GPS calcule alors son propre itinéraire).
   */
  private followDriven(time: number): boolean {
    const ctx = this.ctx;
    const me = ctx.player.person();
    const v: Vehicle | undefined = me && me.vehicleId !== 0 ? ctx.vehicles.get(me.vehicleId) : undefined;
    const ap = v && v.seats[0] !== me!.id ? ctx.service<{ plannedPath?(v: Vehicle, out: number[]): boolean }>('vehicles.autopilot') : undefined;
    if (!v || !ap || typeof ap.plannedPath !== 'function') return this.stopFollowing();
    if (time - this.drivenAt < MIN_PERIOD && this.following) return true;
    this.drivenAt = time;
    const path = this.driven;
    if (!ap.plannedPath(v, path) || path.length < 4) return this.stopFollowing();
    const route = this.route;
    // même itinéraire (la tête a seulement avancé) : on garde le tracé, raccourci par la projection du joueur
    const changed = !this.following || route.length < 4
      || route[route.length - 2] !== path[path.length - 2] || route[route.length - 1] !== path[path.length - 1]
      || Math.abs(polylineLength(path) - this.routeLength) > 5;
    this.following = true;
    route.length = 0;
    for (let i = 0; i < path.length; i++) route.push(path[i]!);
    this.routeLength = polylineLength(route);
    if (changed) this.revision++;
    return true;
  }

  private stopFollowing(): boolean {
    if (this.following) {
      // retour au calcul ordinaire, tout de suite
      this.following = false;
      this.lastPlan = -1e9;
    }
    return false;
  }
}
