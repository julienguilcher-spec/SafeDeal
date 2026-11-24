/* =====================================================================================
 * FOULE — le camion sono : il ouvre le plus gros bloc organisé et avance au pas derrière un guide du
 * service d'ordre. Conduit par le service facultatif 'vehicles.autopilot' (follow) ; sans lui, le camion
 * reste garé au lieu de rassemblement et sert de tribune.
 * ===================================================================================== */

import type { EntityId, Vehicle } from '@/core/contracts';
import type { CrowdCore } from './core';
import type { SlotSample } from './formation';

/** Forme consommée du service 'vehicles.autopilot'. */
interface AutopilotLike {
  follow(v: Vehicle, leaderId: EntityId, distance?: number): boolean;
  stop(v: Vehicle): void;
  isActive?(v: Vehicle): boolean;
}

export class Sono {
  vehicleId: EntityId = 0;
  driver: EntityId = 0;
  private following = false;
  /** Panne (aléa) : le camion ne repart pas avant cet instant. */
  brokenUntil = -1;
  private nextCheck = 0;
  private readonly pose: SlotSample = { x: 0, z: 0, tx: 0, tz: 1, v: 0 };

  constructor(private readonly core: CrowdCore) {}

  reset(): void {
    this.vehicleId = 0;
    this.driver = 0;
    this.following = false;
    this.brokenUntil = -1;
    this.nextCheck = 0;
  }

  /** Position du camion (ou de la tête du cortège s'il n'y en a pas) : source des annonces et des slogans. */
  position(out: { x: number; z: number }): void {
    const v = this.vehicle();
    if (v) {
      out.x = v.x;
      out.z = v.z;
      return;
    }
    const core = this.core;
    core.corridor.at(core.formation.headS - 4, core.rp);
    out.x = core.rp.x;
    out.z = core.rp.z;
  }

  vehicle(): Vehicle | null {
    return this.vehicleId !== 0 ? this.core.ctx.vehicles.get(this.vehicleId) ?? null : null;
  }

  setup(): void {
    const core = this.core;
    const f = core.formation;
    if (!f.sonoPose(this.pose)) return;
    const ctx = core.ctx;
    try {
      const v = ctx.vehicles.spawn('camion_sono', this.pose.x, this.pose.z, Math.atan2(this.pose.tx, this.pose.tz), { faction: 'protest' });
      this.vehicleId = v.id;
      f.sonoVehicleId = v.id;
      v.y = ctx.world.heightAt(v.x, v.z);
    } catch (err) {
      console.error('[crowd] création du camion sono impossible', err);
    }
  }

  update(): void {
    const core = this.core;
    if (this.vehicleId === 0 || core.now < this.nextCheck) return;
    this.nextCheck = core.now + 1;
    const v = this.vehicle();
    if (!v) {
      this.vehicleId = 0;
      core.formation.sonoVehicleId = 0;
      return;
    }
    const ctx = core.ctx;
    // le conducteur monte dès qu'il est arrivé près du camion
    if (this.driver !== 0 && v.seats[0] === 0 && core.director.base !== 'dispersion' && core.director.base !== 'apres_manif' && core.director.base !== 'terminee') {
      const d = ctx.people.get(this.driver);
      if (d && d.vehicleId === 0 && Math.hypot(d.x - v.x, d.z - v.z) < 9 && d.custody === 'free' && d.posture !== 'down') ctx.vehicles.enter(d, v, 'driver');
    }
    const base = core.director.base;
    const over = base === 'dispersion' || base === 'apres_manif' || base === 'terminee';
    if (over && this.driver !== 0) {
      // fin de la manifestation : le camion reste garé, son conducteur descend et repart avec les autres
      const d = ctx.people.get(this.driver);
      const b = d ? core.api.brain(d) : null;
      if (d && d.vehicleId === v.id && (!b || core.now >= b.leaveAt || base !== 'dispersion')) {
        if (this.following) {
          const stopAp = ctx.service<AutopilotLike>('vehicles.autopilot');
          if (stopAp && typeof stopAp.stop === 'function') stopAp.stop(v);
          this.following = false;
        }
        if (Math.abs(v.speed) < 0.3) {
          ctx.vehicles.exit(d);
          if (d.vehicleId === 0) {
            if (d.posture === 'seated') d.posture = 'stand';
            this.driver = 0;
          }
        }
      }
    }
    const ap = ctx.service<AutopilotLike>('vehicles.autopilot');
    if (!ap || typeof ap.follow !== 'function') return;
    const broken = core.now < this.brokenUntil || v.state === 'wrecked' || v.state === 'burning' || v.state === 'burnt';
    const want = core.formation.marching && !broken && core.director.base !== 'dispersion' && core.director.base !== 'apres_manif';
    if (want && !this.following) {
      const guide = core.formation.guideEntry >= 0 ? core.entryPerson[core.formation.guideEntry]! : 0;
      if (guide !== 0 && ctx.people.get(guide)) this.following = ap.follow(v, guide, 6);
    } else if (!want && this.following) {
      ap.stop(v);
      this.following = false;
    } else if (want && this.following && ap.isActive && !ap.isActive(v)) {
      this.following = false; // le pilote a rendu la main (meneur perdu) : on le relance au tour suivant
    }
  }
}
