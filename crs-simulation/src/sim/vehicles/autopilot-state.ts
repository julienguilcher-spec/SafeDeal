/* =====================================================================================
 * Pilote automatique — état par véhicule et outils sur l'itinéraire (polyligne plate).
 * ===================================================================================== */

import type { EntityId } from '@/core/contracts';
import type { AutopilotMode, AutopilotReason, AutopilotStatus } from './api';

export class ApState {
  mode: AutopilotMode = 'idle';
  // ── itinéraire ──
  /** Polyligne [x0, z0, x1, z1, …] et abscisse curviligne de chaque point. */
  readonly path: number[] = [];
  readonly cum: number[] = [];
  n = 0;
  /** Tronçon courant, abscisse du véhicule, longueur totale. */
  seg = 0;
  s = 0;
  total = 0;
  stopBefore = 0;
  /**
   * Abscisse jusqu'à laquelle l'itinéraire suit l'AXE des rues (à décaler sur la voie de droite) ; au-delà,
   * c'est la trace réelle d'un meneur, déjà sur sa voie.
   */
  axisUntil = 0;
  /** La destination est sur l'axe d'une rue : on s'y arrête sur sa voie, sans revenir au milieu de la chaussée. */
  endInLane = false;
  /** L'itinéraire part de l'axe de la rue, à hauteur du véhicule (et non de sa position) : décalage plein dès le départ. */
  fromAxis = false;
  /** Vitesse de croisière demandée (0 = limite de la voie). */
  cruise = 0;
  urgence = false;
  pushThrough = false;
  /** Zones à éviter (foule) pour les itinéraires de ce trajet. */
  avoidZones: readonly { x: number; z: number; r: number; cost?: number }[] | null = null;
  /** Stationnement en rang, chacun son tour : véhicule dont on attend qu'il ait fini de se garer (0 = aucun). */
  waitFor: EntityId = 0;
  // ── suivi, convoi ──
  leaderId: EntityId = 0;
  followDist = 6;
  /** Vitesse du meneur au pas précédent et son accélération filtrée (anticipation de ses freinages). */
  leadSpeed = 0;
  leadAccel = 0;
  convoy = false;
  /** Garé, il attend que son meneur arrêté à côté ou derrière lui soit passé devant ou parti (voir Autopilot.holdBehind). */
  held = false;
  /** Trace du meneur (x, z…) relevée pendant cette attente, à rejoindre quand elle prend fin. */
  readonly trace: number[] = [];
  /** Véhicule qui me suit dans la colonne (0 si aucun). */
  behindId: EntityId = 0;
  /** Temps passé à l'arrêt à attendre le suivant qui a décroché (s). */
  lagWaitT = 0;
  // ── stationnement ──
  /** 0 approche, 1 alignement final, 2 recul de reprise. */
  parkPhase = 0;
  parkX = 0;
  parkZ = 0;
  parkH = 0;
  parkBack = 8;
  /** Premier tronçon de l'itinéraire porté par l'axe de la place (alignement final à partir de là). */
  finalFrom = 0;
  parkTries = 0;
  phaseT = 0;
  // ── capteurs ──
  scanT = 0;
  obsDist = Infinity;
  obsSpeed = 0;
  obsReason: AutopilotReason = '';
  obsStatic = false;
  /** Personne au bord du couloir devant (m ; Infinity si personne) : allure de prudence. */
  pedNear = Infinity;
  /** Personne qui s'engage vers la chaussée devant (m ; Infinity sinon). */
  pedCross = Infinity;
  /** Véhicule qui barre le passage (0 sinon), sa position latérale (m, positive à ma gauche), et s'il attend lui aussi. */
  obsId: EntityId = 0;
  obsLat = 0;
  obsWaiting = false;
  /** Objet qui barre le passage (0 sinon). */
  obsPropId: EntityId = 0;
  /** Temps passé face à un véhicule lui-même à l'arrêt (s) : règle de priorité. */
  yieldT = 0;
  // ── contournement d'un obstacle arrêté (objet, épave, véhicule garé ou à l'arrêt devant une urgence) ──
  /** Obstacle contourné : véhicule (avoidVeh) ou objet (avoidProp), 0 sinon. */
  avoidVeh: EntityId = 0;
  avoidProp: EntityId = 0;
  /** Contournement d'un mur (avoidProp = −1) : abscisse de fin du tronçon barré. */
  avoidS1 = 0;
  /** Le contournement en cours passe sur le trottoir. */
  avoidKerb = false;
  /** Décalage à gauche (m, négatif : à droite) en cours / voulu. */
  avoidShift = 0;
  avoidWant = 0;
  /** Prochain contrôle du couloir de contournement (s) ; durée du contournement en cours (s). */
  avoidCheckT = 0;
  avoidT = 0;
  /** Marche arrière à faire avant de s'engager (m restants) et instant de son début. */
  avoidBack = 0;
  avoidBackT = 0;
  /** Temps passé arrêté derrière un obstacle contournable sans couloir libre (s). */
  avoidWaitT = 0;
  /** Nouvel itinéraire après des blocages répétés (compteur). */
  replans = 0;
  /** Reculs pour prendre l'angle, nez contre un véhicule arrêté (sortie d'un stationnement en bloc ; compteur). */
  nudges = 0;
  // ── demi-tour ──
  /** 0 aucun, 1 marche avant braquée, 2 marche arrière contre-braquée. */
  uturn = 0;
  uturnDir = 1;
  uturnMoves = 0;
  // ── voie ──
  laneT = 0;
  laneOffset = 0;
  laneWant = 0;
  /** Distance tenue à la bordure de droite (m ; 0 = milieu de la voie) : cycliste. */
  kerb = 0;
  /** Demi-largeur de la chaussée (m) et sens unique, relus avec la voie. */
  roadHalf = 4;
  roadOneway = false;
  /** Sens unique pris à contresens. */
  contraflow = false;
  // ── dépassement d'un deux-roues lent ──
  /** Deux-roues dépassé (0 si aucun) et décalage à gauche en cours / voulu (m). */
  passId: EntityId = 0;
  passShift = 0;
  passWant = 0;
  passCheckT = 0;
  /** Distance au prochain virage à gauche de l'itinéraire (m ; Infinity si aucun en vue). */
  leftTurnAt = Infinity;
  roadLimit = 8.33;
  /** Abscisse du point d'arrêt devant une rue fermée (−1 si aucune). */
  closureS = -1;
  closureT = 0;
  // ── divers ──
  blockedFor = 0;
  stuckT = 0;
  /** Temps passé coincé au même endroit (reprises en marche arrière), et cet endroit. */
  stuckAcc = 0;
  stuckX = 0;
  stuckZ = 0;
  unstickT = 0;
  unstickTries = 0;
  hornT = 0;
  lastState = '';
  readonly status: AutopilotStatus = {
    mode: 'idle', state: 'repos', reason: '', remaining: 0, targetSpeed: 0, blockedFor: 0, leaderId: 0, urgence: false,
  };

  resetRun(): void {
    this.seg = 0;
    this.s = 0;
    this.stopBefore = 0;
    this.axisUntil = 0;
    this.endInLane = false;
    this.fromAxis = false;
    this.cruise = 0;
    this.urgence = false;
    this.pushThrough = false;
    this.avoidZones = null;
    this.waitFor = 0;
    this.leaderId = 0;
    this.leadSpeed = 0;
    this.leadAccel = 0;
    this.convoy = false;
    this.held = false;
    this.trace.length = 0;
    this.behindId = 0;
    this.lagWaitT = 0;
    this.parkPhase = 0;
    this.parkTries = 0;
    this.phaseT = 0;
    this.scanT = 0;
    this.obsDist = Infinity;
    this.obsSpeed = 0;
    this.obsReason = '';
    this.obsStatic = false;
    this.pedNear = Infinity;
    this.pedCross = Infinity;
    this.obsId = 0;
    this.obsLat = 0;
    this.obsWaiting = false;
    this.yieldT = 0;
    this.obsPropId = 0;
    this.avoidVeh = 0;
    this.avoidProp = 0;
    this.avoidShift = 0;
    this.avoidWant = 0;
    this.avoidKerb = false;
    this.avoidCheckT = 0;
    this.avoidT = 0;
    this.avoidBack = 0;
    this.avoidBackT = 0;
    this.avoidWaitT = 0;
    this.replans = 0;
    this.nudges = 0;
    this.uturn = 0;
    this.uturnMoves = 0;
    this.laneT = 0;
    this.laneOffset = 0;
    this.laneWant = 0;
    this.kerb = 0;
    this.passId = 0;
    this.passShift = 0;
    this.passWant = 0;
    this.leftTurnAt = Infinity;
    this.closureS = -1;
    this.closureT = 0;
    this.blockedFor = 0;
    this.stuckT = 0;
    this.stuckAcc = 0;
    this.unstickT = 0;
    this.unstickTries = 0;
    this.hornT = 0;
  }

  // ───────────────────────────── itinéraire ─────────────────────────────

  /** Remplace l'itinéraire par les `count` premiers points de `points` (points confondus retirés). */
  setPath(points: ArrayLike<number>, count: number): void {
    const path = this.path;
    const cum = this.cum;
    let n = 0;
    let total = 0;
    for (let i = 0; i < count; i++) {
      const x = points[i * 2]!;
      const z = points[i * 2 + 1]!;
      if (n > 0) {
        const dx = x - path[n * 2 - 2]!;
        const dz = z - path[n * 2 - 1]!;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 0.3 && i < count - 1) continue;
        total += d;
      }
      path[n * 2] = x;
      path[n * 2 + 1] = z;
      cum[n] = total;
      n++;
    }
    while (path.length > n * 2) path.pop();
    while (cum.length > n) cum.pop();
    this.n = n;
    this.total = total;
    this.seg = 0;
    this.s = 0;
  }

  /** Ajoute un point au bout de l'itinéraire. */
  append(x: number, z: number): void {
    const n = this.n;
    if (n === 0) {
      this.path[0] = x;
      this.path[1] = z;
      this.cum[0] = 0;
      this.n = 1;
      this.total = 0;
      return;
    }
    const dx = x - this.path[n * 2 - 2]!;
    const dz = z - this.path[n * 2 - 1]!;
    this.total += Math.sqrt(dx * dx + dz * dz);
    this.path[n * 2] = x;
    this.path[n * 2 + 1] = z;
    this.cum[n] = this.total;
    this.n = n + 1;
  }

  /** Oublie les tronçons déjà parcourus (itinéraire qui s'allonge sans fin derrière un meneur). */
  trim(): void {
    const drop = this.seg - 1;
    if (drop <= 0) return;
    const n = this.n - drop;
    const base = this.cum[drop]!;
    for (let i = 0; i < n; i++) {
      this.path[i * 2] = this.path[(i + drop) * 2]!;
      this.path[i * 2 + 1] = this.path[(i + drop) * 2 + 1]!;
      this.cum[i] = this.cum[i + drop]! - base;
    }
    while (this.path.length > n * 2) this.path.pop();
    while (this.cum.length > n) this.cum.pop();
    this.n = n;
    this.seg -= drop;
    this.s -= base;
    this.total -= base;
    this.axisUntil -= base;
    if (this.closureS >= 0) this.closureS -= base;
  }

  /** Recale l'abscisse du véhicule sur l'itinéraire (recherche vers l'avant seulement). */
  project(x: number, z: number): void {
    const path = this.path;
    const last = this.n - 2;
    if (last < 0) {
      this.s = 0;
      return;
    }
    let best = Infinity;
    let bestSeg = this.seg;
    let bestS = this.s;
    const end = Math.min(last, this.seg + 4);
    for (let i = this.seg; i <= end; i++) {
      const ax = path[i * 2]!;
      const az = path[i * 2 + 1]!;
      const dx = path[i * 2 + 2]! - ax;
      const dz = path[i * 2 + 3]! - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const ex = x - (ax + dx * t);
      const ez = z - (az + dz * t);
      // léger avantage au tronçon courant : pas de saut en avant à un carrefour en épingle
      const d2 = ex * ex + ez * ez + (i - this.seg) * 0.05;
      if (d2 < best) {
        best = d2;
        bestSeg = i;
        bestS = this.cum[i]! + Math.sqrt(l2) * t;
      }
    }
    // loin de l'itinéraire (virage manqué, détour) : on cherche plus loin devant (60 m), sans revenir en arrière
    if (best > 64) {
      const far = Math.min(last, this.seg + 64);
      for (let i = end + 1; i <= far && this.cum[i]! < this.s + 60; i++) {
        const ax = path[i * 2]!;
        const az = path[i * 2 + 1]!;
        const dx = path[i * 2 + 2]! - ax;
        const dz = path[i * 2 + 3]! - az;
        const l2 = dx * dx + dz * dz;
        let t = l2 > 1e-9 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const ex = x - (ax + dx * t);
        const ez = z - (az + dz * t);
        const d2 = ex * ex + ez * ez;
        if (d2 < best * 0.5) {
          best = d2;
          bestSeg = i;
          bestS = this.cum[i]! + Math.sqrt(l2) * t;
        }
      }
    }
    this.seg = bestSeg;
    if (bestS > this.s) this.s = bestS;
    this.offPath = Math.sqrt(best);
  }

  /** Distance du véhicule à l'itinéraire au dernier recalage (m). */
  offPath = 0;

  /** Point à l'abscisse `s` (bornée) ; écrit le point et la direction unitaire du tronçon dans `out`. */
  sample(s: number, out: PathPoint): void {
    const path = this.path;
    const cum = this.cum;
    const n = this.n;
    if (n < 2) {
      out.x = n === 1 ? path[0]! : 0;
      out.z = n === 1 ? path[1]! : 0;
      out.dx = 0;
      out.dz = 1;
      return;
    }
    let i = this.seg;
    if (i > n - 2) i = n - 2;
    while (i < n - 2 && cum[i + 1]! < s) i++;
    while (i > 0 && cum[i]! > s) i--;
    const ax = path[i * 2]!;
    const az = path[i * 2 + 1]!;
    const dx = path[i * 2 + 2]! - ax;
    const dz = path[i * 2 + 3]! - az;
    const l = Math.sqrt(dx * dx + dz * dz);
    let t = l > 1e-9 ? (s - cum[i]!) / l : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    out.x = ax + dx * t;
    out.z = az + dz * t;
    out.dx = l > 1e-9 ? dx / l : 0;
    out.dz = l > 1e-9 ? dz / l : 1;
  }

  /** Angle de virage au sommet `j` (rad, positif = à gauche), en cumulant les sommets très rapprochés. */
  turnAt(j: number): number {
    const path = this.path;
    if (j <= 0 || j >= this.n - 1) return 0;
    const ax = path[j * 2]! - path[j * 2 - 2]!;
    const az = path[j * 2 + 1]! - path[j * 2 - 1]!;
    const bx = path[j * 2 + 2]! - path[j * 2]!;
    const bz = path[j * 2 + 3]! - path[j * 2 + 1]!;
    // cap = atan2(x, z) : tourner à gauche augmente le cap
    let d = Math.atan2(bx, bz) - Math.atan2(ax, az);
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
}

export interface PathPoint { x: number; z: number; dx: number; dz: number }
