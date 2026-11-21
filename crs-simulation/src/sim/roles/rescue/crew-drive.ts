/* =====================================================================================
 * SECOURS — conduite de l'engin par son équipage.
 *
 * L'engin roule par le pilote automatique des véhicules (service « vehicles.autopilot »), sirène et feux
 * en intervention. Deux précautions propres aux engins longs :
 *   - si l'itinéraire repart dans son dos, l'engin passe d'abord par un point situé devant lui (il fait
 *     le tour du pâté de maisons) au lieu de tenter un demi-tour dans une rue étroite ;
 *   - coincé contre un mur ou un obstacle dans sa manœuvre, le conducteur recule de quelques mètres
 *     (commande directe du véhicule, comme le joueur au volant), puis reprend sa route.
 * Le repli sous les projectiles se fait en marche arrière, droit, jusqu'à la distance d'arrêt.
 * ===================================================================================== */

import type { Person, RayHit } from '@/core/contracts';
import { ROLE_DRIVER, ableBody } from './crew';
import type { Crew, RescueKernel } from './crew';
import type { Origin, Spawner } from './spawn';
import { CRUISE_RETURN, CRUISE_URGENT } from './tuning';

export class CrewDriver {
  private readonly origin: Origin = { x: 0, z: 0, heading: 0, length: 0, road: false };
  private readonly hit: RayHit = { hit: false, t: 1, x: 0, z: 0, nx: 0, nz: 0, kind: 'none', id: 0, height: 0 };

  constructor(private readonly k: RescueKernel, private readonly spawner: Spawner) {}

  /**
   * Lance l'engin vers un point (sirène et feux en intervention). Si l'itinéraire repart dans son dos, il passe
   * d'abord par un point situé devant lui (tour du pâté de maisons) plutôt que de tenter un demi-tour sur place.
   * false s'il n'y a pas d'itinéraire.
   */
  drive(crew: Crew, x: number, z: number, stopBefore: number, urgent: boolean): boolean {
    const k = this.k;
    const v = crew.vehicle;
    const ap = k.autopilot();
    if (!v || !ap || crew.onFoot) return false;
    const ext = k.vehiclesExt();
    if (ext) {
      ext.setBeacons(v, true);
      ext.setSiren(v, urgent ? 1 : 0);
    } else {
      v.beacons = true;
      v.siren = urgent ? 1 : 0;
    }
    crew.destX = x;
    crew.destZ = z;
    crew.destStop = stopBefore;
    crew.destUrgent = urgent;
    crew.via = false;
    const speed = urgent ? CRUISE_URGENT : CRUISE_RETURN;
    if (this.spawner.pickVia(v, x, z, this.origin) && ap.driveTo(v, this.origin.x, this.origin.z, { speed, urgence: urgent })) {
      crew.via = true;
      crew.viaX = this.origin.x;
      crew.viaZ = this.origin.z;
      return true;
    }
    return ap.driveTo(v, x, z, { speed, urgence: urgent, stopBefore });
  }

  /** Point de passage atteint (ou impraticable) : on prend la route de la destination. Retourne true tant que le détour est en cours. */
  viaStep(crew: Crew): boolean {
    if (!crew.via) return false;
    const k = this.k;
    const v = crew.vehicle;
    const ap = k.autopilot();
    if (!v || !ap) {
      crew.via = false;
      return false;
    }
    const st = ap.status(v);
    const d = Math.hypot(v.x - crew.viaX, v.z - crew.viaZ);
    if (d > 24 && st.state !== 'arrive' && st.state !== 'echec' && !(st.state === 'bloque' && st.blockedFor > 8)) return true;
    crew.via = false;
    ap.driveTo(v, crew.destX, crew.destZ, { speed: crew.destUrgent ? CRUISE_URGENT : CRUISE_RETURN, urgence: crew.destUrgent, stopBefore: crew.destStop });
    return false;
  }

  /**
   * Engin coincé contre un mur dans sa manœuvre : le conducteur recule de quelques mètres, puis reprend sa route
   * (trois tentatives). Retourne true tant que le dégagement est en cours.
   */
  unstick(crew: Crew, blockedByWall: boolean): boolean {
    const k = this.k;
    const now = k.now;
    const v = crew.vehicle;
    const ap = k.autopilot();
    if (!v || !ap) return false;
    if (now < crew.unstickUntil) {
      if (!this.reverse(crew)) crew.unstickUntil = now; // plus de place derrière
      return true;
    }
    if (crew.unstickUntil > 0) {
      // fin du recul : on repart vers la destination
      crew.unstickUntil = 0;
      this.halt(crew);
      this.drive(crew, crew.destX, crew.destZ, crew.destStop, crew.destUrgent);
      return true;
    }
    if (!blockedByWall || crew.unstuck >= 3) return false;
    crew.unstuck++;
    ap.stop(v);
    crew.unstickUntil = now + 2.5;
    return true;
  }

  /** Le conducteur recule droit (comme le joueur au volant). false si la voie est prise derrière l'engin ou s'il n'y a personne au volant. */
  reverse(crew: Crew): boolean {
    const ctx = this.k.ctx;
    const v = crew.vehicle;
    if (!v) return false;
    const driver = this.driverOf(crew);
    if (!driver || driver.vehicleId !== v.id || !ableBody(ctx, driver)) return false;
    const sh = Math.sin(v.heading);
    const ch = Math.cos(v.heading);
    const rear = v.def.length * 0.5;
    const ax = v.x - sh * rear;
    const az = v.z - ch * rear;
    const bx = v.x - sh * (rear + 6);
    const bz = v.z - ch * (rear + 6);
    const hit = this.hit;
    if ((ctx.world.raycast(ax, az, bx, bz, hit) && hit.t < 0.95) || (ctx.props.raycast(ax, az, bx, bz, hit, 'move') && hit.t < 0.95)
      || (ctx.vehicles.raycast(ax - sh * 0.5, az - ch * 0.5, bx, bz, hit, 'move') && hit.id !== v.id && hit.t < 0.95)
      || ctx.people.countIn(v.x - sh * (rear + 2.5), v.z - ch * (rear + 2.5), 2.6) > 0) {
      return false;
    }
    const cmd = v.cmd;
    cmd.throttle = -0.7;
    cmd.steer = 0;
    cmd.brake = 0;
    cmd.handbrake = false;
    return true;
  }

  /** Arrête l'engin, frein serré. */
  halt(crew: Crew): void {
    const v = crew.vehicle;
    if (!v) return;
    const ap = this.k.autopilot();
    if (ap && ap.isActive(v)) ap.stop(v);
    const cmd = v.cmd;
    cmd.throttle = 0;
    cmd.steer = 0;
    cmd.brake = 1;
    cmd.handbrake = true;
  }

  /**
   * L'équipage quitte l'engin et poursuit à pied. `lost` : l'engin est hors d'usage (il ne servira plus) ;
   * sinon il reste garé là, et l'équipage y reviendra pour repartir (et pour y charger une victime).
   */
  dismount(crew: Crew, lost = false): void {
    const k = this.k;
    const ctx = k.ctx;
    const v = crew.vehicle;
    if (v) {
      this.halt(crew);
      const ext = k.vehiclesExt();
      if (ext) ext.setSiren(v, 0);
      else v.siren = 0;
    }
    for (let i = 0; i < crew.members.length; i++) {
      const r = crew.members[i];
      const p = r.p;
      // le conducteur reste à l'engin laissé en retrait
      if (!lost && r.role === ROLE_DRIVER && crew.members.length > 2) continue;
      if (p.vehicleId !== 0) ctx.vehicles.exit(p);
    }
    if (lost) crew.onFoot = true;
    else crew.walking = true;
    crew.bestDistance = Infinity;
    crew.bestAt = k.now;
  }

  /**
   * Met l'engin en route vers sa sortie : son stationnement s'il était pré-positionné, sinon une sortie située
   * devant lui (pas de demi-tour dans une rue étroite), à défaut le point d'où il est venu.
   */
  driveOut(crew: Crew): void {
    const v = crew.vehicle;
    if (!v) return;
    if (!crew.staged && this.spawner.pickExit(v, this.origin)) {
      crew.originX = this.origin.x;
      crew.originZ = this.origin.z;
    }
    const tx = crew.staged ? crew.homeX : crew.originX;
    const tz = crew.staged ? crew.homeZ : crew.originZ;
    if (!this.drive(crew, tx, tz, 0, crew.patientId !== 0)) crew.phaseAt = this.k.now - 400; // pas d'itinéraire : retrait immédiat
  }

  /** Le conducteur de l'équipage (pour les tests et l'interface). */
  driverOf(crew: Crew): Person | null {
    for (let i = 0; i < crew.members.length; i++) if (crew.members[i].role === ROLE_DRIVER) return crew.members[i].p;
    return null;
  }
}
