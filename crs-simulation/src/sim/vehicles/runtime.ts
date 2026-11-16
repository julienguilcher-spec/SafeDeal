/* =====================================================================================
 * État privé du module : une fiche (VehicleRt) par véhicule, créée à son apparition et retirée
 * avec lui. Rien ici n'est visible des autres modules (ils lisent Vehicle et les services de api.ts).
 * ===================================================================================== */

import type { DamageKind, EntityId, GameContext, Person, Rng, Vehicle } from '@/core/contracts';
import type { VehicleStore } from '@/core/stores';
import type {
  AutopilotStatus, FlightMode, FlightStatus, JetMode, TurretStatus, VehicleDynamics, VehicleSpec, VehicleTuning,
} from './api';
import { specFor } from './specs';

/** État d'une tourelle. */
export class TurretRt {
  // point désigné (monde)
  hasTarget = false;
  inRange = false;
  tx = 0;
  ty = 0;
  tz = 0;
  /** Recalcul de la visée du point désigné (s restantes). */
  aimT = 0;
  /** Orientation à rejoindre : calculée pour le point désigné, ou demandée par aimTurret (repère véhicule). */
  wantYaw = 0;
  wantPitch = 0;
  /** Une orientation demandée par aimTurret reste à rejoindre. */
  manual = false;
  // orientation au pas précédent (limite de vitesse de pointage)
  prevYaw = 0;
  prevPitch = 0;
  // lance-grenades
  /** Vitesse initiale retenue (m/s) : dispositif de propulsion 50 / 100 / 200 m. */
  muzzle = 0;
  salvo = 1;
  queued = 0;
  /** Coups de la salve en cours déjà partis, et taille de cette salve (éventail). */
  salvoIndex = 0;
  salvoSize = 1;
  queuedBy: EntityId = 0;
  cooldown = 0;
  reserve = 0;
  /** Temps passé vide, à l'arrêt (s) : l'équipage recharge de lui-même au bout de quelques secondes. */
  idleT = 0;
  /** Rechargement / ravitaillement : temps écoulé (s), −1 si aucun. */
  serviceT = -1;
  serviceDur = 0;
  // canon à eau
  mode: JetMode = 'droit';
  /** Détente tenue : temps restant avant que le jet ne s'arrête faute de nouvel appel (s). */
  hold = 0;
  jetOn = false;
  byId: EntityId = 0;
  effectT = 0;
  fxT = 0;
  eventT = 0;
  reportT = 0;
  /** Dernier point d'impact du jet. */
  impactX = 0;
  impactY = 0;
  impactZ = 0;
  jetLength = 0;
  // mât de caméra
  mast = 0;
  mastTarget = 0;
  readonly status: TurretStatus = {
    kind: 'camera', ammo: 0, capacity: 0, reserve: 0, service: -1, firing: false, salvo: 1, queued: 0, mode: 'droit',
    hasTarget: false, inRange: false, targetX: 0, targetZ: 0, mast: 0,
  };
}

/** État d'un engin volant. */
export class FlightRt {
  mode: FlightMode = 'pose';
  /** Secondes de vol restantes (Infinity sans batterie). */
  battery = Infinity;
  pilotId: EntityId = 0;
  homeX = 0;
  homeZ = 0;
  targetX = 0;
  targetZ = 0;
  /** Hauteur visée au-dessus du sol (m). */
  targetAlt = 0;
  orbitCx = 0;
  orbitCz = 0;
  orbitR = 0;
  orbitSpeed = 0;
  lowWarned = false;
  /** Posé à retirer du monde (drone rappelé). */
  removeOnLand = false;
  readonly status: FlightStatus = { mode: 'pose', altitude: 0, battery: 1, secondsLeft: Infinity, pilotId: 0, homeDistance: 0 };
}

/** Fiche d'un véhicule. */
export class VehicleRt {
  readonly spec: VehicleSpec;
  // ── géométrie ──
  readonly halfW: number;
  readonly halfL: number;
  /** Rayon du cercle englobant l'emprise. */
  readonly radius: number;
  /**
   * Disques d'essai contre le décor (repère véhicule : décalage vers l'avant, vers la gauche, rayon) :
   * une file de disques de la largeur du véhicule le long de son axe, plus un petit disque par coin.
   */
  readonly circleF: number[] = [];
  readonly circleL: number[] = [];
  readonly circleR: number[] = [];
  /** Carré du rayon de giration (m²). */
  readonly gyr2: number;
  readonly driverSeat: number;
  // ── conduite ──
  awake = true;
  /** Masse en ordre de marche, occupants compris (kg). */
  mass: number;
  occupants = 0;
  /** Piloté par le pilote automatique. */
  apActive = false;
  mu = 0.85;
  rolling = 0.018;
  surfaceT = 0;
  groundPitch = 0;
  groundRoll = 0;
  groundKnown = false;
  /** Accélération longitudinale filtrée (transfert de charge) et dynamique d'assiette. */
  axF = 0;
  bodyPitch = 0;
  bodyRoll = 0;
  gearT = 0;
  shiftT = 0;
  rpmF = 0;
  /** Résistance résiduelle quand un engin à lame pousse ce véhicule (N) ; −1 = freins normaux. */
  pushRelief = -1;
  /** Poussé à la lame pendant ce pas : dégâts de choc ignorés. */
  pushedAt = -1;
  /** Résistance à ajouter au prochain pas (N) : objets poussés, personnes repoussées. */
  drag = 0;
  readonly dyn: VehicleDynamics = {
    lateralSpeed: 0, slipAngle: 0, accelLong: 0, accelLat: 0, grip: 0.85, skid: 0, asleep: false,
  };
  // ── collisions ──
  lastHitAt = -10;
  lastHitSpeed = 0;
  // ── dégâts et feu ──
  heat = 0;
  /** Durée de l'embrasement et du feu pour CE véhicule (tirées à l'allumage). */
  spreadTime = 180;
  burnTime = 1200;
  burnElapsed = 0;
  maxBurning = 0;
  fireSource: EntityId = 0;
  explodeAt = 2;
  exploded = false;
  popsLeft = 0;
  nextPop = 0;
  fireTick = 0;
  heatTick = 0;
  evacT = -1;
  // ── retournement ──
  flipped = false;
  flipProgress = 0;
  flipPushers = 0;
  flipTick = -1;
  flipRoll = 0;
  flipBy: EntityId = 0;
  // ── sièges ──
  /** Portes : temps d'ouverture restant par siège (s), et durée totale de l'ouverture en cours. */
  readonly doors: number[] = [];
  readonly doorsFull: number[] = [];
  // ── feux ──
  lastSiren: 0 | 1 | 2 = 0;
  lastBeacons = false;
  lastHeadlights = false;
  lastIndicator: -1 | 0 | 1 = 0;
  hornWas = false;
  /** Klaxon demandé par le service (s restantes). */
  hornT = 0;
  headlightsAuto = true;
  // ── équipements ──
  readonly turrets: TurretRt[] = [];
  flight: FlightRt | null = null;
  /** État du pilote automatique (opaque ici : voir autopilot.ts). */
  ap: unknown = null;

  constructor(readonly v: Vehicle) {
    const def = v.def;
    this.spec = specFor(def);
    this.halfW = def.width * 0.5;
    this.halfL = def.length * 0.5;
    this.radius = Math.sqrt(this.halfW * this.halfW + this.halfL * this.halfL);
    const span = Math.max(0, this.halfL - this.halfW);
    const n = Math.max(2, Math.ceil((2 * span) / this.halfW) + 1);
    for (let i = 0; i < n; i++) {
      this.circleF.push(-span + (2 * span * i) / (n - 1));
      this.circleL.push(0);
      this.circleR.push(this.halfW);
    }
    const rc = Math.min(def.width * 0.28, 0.5);
    for (let i = 0; i < 4; i++) {
      this.circleF.push((i < 2 ? 1 : -1) * (this.halfL - rc));
      this.circleL.push((i % 2 === 0 ? 1 : -1) * (this.halfW - rc));
      this.circleR.push(rc);
    }
    this.gyr2 = (def.length * def.length + def.width * def.width) / 12;
    this.mass = def.mass;
    let driver = -1;
    for (let i = 0; i < def.seats.length; i++) {
      this.doors.push(0);
      this.doorsFull.push(0);
      if (driver < 0 && def.seats[i]!.role === 'driver') driver = i;
    }
    this.driverSeat = driver;
    for (let i = 0; i < def.turrets.length; i++) {
      const t = new TurretRt();
      t.status.kind = def.turrets[i]!.kind;
      t.status.capacity = def.turrets[i]!.capacity;
      const launcher = this.spec.launchers[i];
      if (launcher) {
        t.reserve = launcher.reserve;
        t.muzzle = Math.sqrt(9.81 * launcher.ranges[Math.min(1, launcher.ranges.length - 1)]!);
      }
      // orientation de repos : dans l'axe, site ramené dans le débattement
      const td = def.turrets[i]!;
      const rest = td.pitchMin > 0 ? td.pitchMin : td.pitchMax < 0 ? td.pitchMax : 0;
      v.turretPitch[i] = rest;
      t.prevYaw = v.turretYaw[i] ?? 0;
      t.prevPitch = rest;
      this.turrets.push(t);
    }
    if (this.spec.flight) {
      this.flight = new FlightRt();
      this.flight.battery = this.spec.flight.battery > 0 ? this.spec.flight.battery : Infinity;
      this.flight.homeX = v.x;
      this.flight.homeZ = v.z;
    }
  }

  /** Occupant du siège conducteur (0 si aucun). */
  get driverId(): EntityId {
    return this.driverSeat >= 0 ? this.v.seats[this.driverSeat] ?? 0 : 0;
  }
}

/** Statut du pilote automatique d'un véhicule qui n'en a pas. */
export const IDLE_STATUS: Readonly<AutopilotStatus> = Object.freeze({
  mode: 'idle', state: 'repos', reason: '', remaining: 0, targetSpeed: 0, blockedFor: 0, leaderId: 0, urgence: false,
});

/**
 * Noyau partagé par les sous-systèmes du module (conduite, collisions, dégâts, sièges, tourelles,
 * vol, pilote automatique) : contexte, magasin du cœur, fiches, réglages, aléa.
 */
export class VehicleKernel {
  ctx!: GameContext;
  store!: VehicleStore;
  readonly rts: VehicleRt[] = [];
  readonly byId = new Map<EntityId, VehicleRt>();
  rng!: Rng;
  readonly tuning: VehicleTuning = {
    fireTimeScale: 1, explosionChance: 1, crashDamage: 1, flipPeople: 6, flipSeconds: 8, dispersion: 1,
  };
  /** La santé est le service neutre du cœur : il n'applique ni recul ni mouillage, le module s'en charge. */
  neutralHealth = true;
  /** Véhicules à retirer en fin de pas (drone posé). */
  readonly removals: EntityId[] = [];
  /** Dégâts de choc, déjà pondérés par la robustesse (posé par le système : évite les dépendances croisées). */
  hurtVehicle: (v: Vehicle, amount: number, kind: DamageKind, sourceId: EntityId, x: number, z: number) => void = () => {};
  /** Fait descendre une personne (posé par le système). */
  exitPerson: (p: Person) => boolean = () => false;

  /** Fiche du véhicule (créée au besoin : véhicule apparu sans événement). */
  rt(v: Vehicle): VehicleRt {
    let rt = this.byId.get(v.id);
    if (!rt || rt.v !== v) {
      if (rt) this.drop(v.id);
      rt = new VehicleRt(v);
      this.byId.set(v.id, rt);
      this.rts.push(rt);
      rt.occupants = countOccupants(v);
      rt.mass = v.def.mass + rt.occupants * OCCUPANT_MASS;
    }
    return rt;
  }

  peek(id: EntityId): VehicleRt | undefined {
    return this.byId.get(id);
  }

  drop(id: EntityId): void {
    const rt = this.byId.get(id);
    if (!rt) return;
    this.byId.delete(id);
    const i = this.rts.indexOf(rt);
    if (i >= 0) {
      this.rts[i] = this.rts[this.rts.length - 1]!;
      this.rts.pop();
    }
  }

  clear(): void {
    this.rts.length = 0;
    this.byId.clear();
    this.removals.length = 0;
  }

  /** Conducteur présent (ou null). */
  driver(rt: VehicleRt): Person | null {
    const id = rt.driverId;
    return id !== 0 ? this.ctx.people.get(id) ?? null : null;
  }

  /** Réveille un véhicule endormi (choc, commande, incendie). */
  wake(rt: VehicleRt): void {
    rt.awake = true;
  }
}

/** Masse comptée par occupant (kg). */
export const OCCUPANT_MASS = 85;

export function countOccupants(v: Vehicle): number {
  let n = 0;
  for (let i = 0; i < v.seats.length; i++) if (v.seats[i] !== 0) n++;
  return n;
}
