/* =====================================================================================
 * Droit — perception : qui voit quoi, qui filme quoi, qui menace qui.
 *
 *   - témoins : un membre des forces de l'ordre valide, à portée réaliste (réduite la nuit et dans
 *     le brouillard), avec une ligne de vue (bâti, mobilier opaque) et une visibilité suffisante
 *     (fumée, gaz) ;
 *   - images : journaliste ou observateur qui filme, téléphone levé, caméra-piéton d'un agent
 *     proche, drone en vol, prise de vue toute récente (événement media:shot) ;
 *   - menace : comportement récent de la personne (infractions violentes), objet tenu en main ;
 *   - personnes protégées : journaliste identifiable, secouriste, observateur, passant, enfant.
 *
 * Aucune allocation : tableaux de travail et filtres créés une fois.
 * ===================================================================================== */

import type { EntityId, Person, RayHit } from '@/core/contracts';
import { makeRayHit } from '@/core/null-services';
import { CAMERA_BODYCAM, CAMERA_DRONE, CAMERA_OBSERVER, CAMERA_PHONE, CAMERA_PRESS } from './api';
import { CHILD_HEIGHT, FLEE_SPEED, SHOT_RING } from './config';
import type { Kernel } from './kernel';
import { HELD_THREAT } from './texts';

/** Infractions violentes contre les personnes : niveau de menace associé. */
const VIOLENT_LEVEL: Readonly<Record<string, number>> = {
  violence_agent: 4,
  incendie: 4,
  jet_projectile: 3,
  violence: 3,
  rebellion: 3,
};

/** Infractions sans violence contre les personnes : niveau de menace tant qu'elles sont récentes. */
const TROUBLE_LEVEL: Readonly<Record<string, number>> = {
  degradation: 2,
  pillage: 2,
  barricade: 2,
  port_arme: 2,
  attroupement_apres_sommations: 1,
  outrage: 1,
  dissimulation_visage: 1,
  tag: 1,
  intrusion: 1,
  recel: 1,
  entrave_circulation: 1,
};

/** Durée pendant laquelle l'auteur d'une violence reste identifié comme tel, sans menace actuelle (s). */
const AUTHOR_MEMORY = 120;
/** Durée pendant laquelle une infraction sans violence pèse sur l'appréciation (s). */
const TROUBLE_MEMORY = 60;
/** Demi-angle du champ d'une caméra tenue à la main, et d'une caméra-piéton (cosinus). */
const COS_CAMERA = Math.cos((45 * Math.PI) / 180);
const COS_BODYCAM = Math.cos((60 * Math.PI) / 180);
/** Hauteur minimale au-dessus du sol pour qu'un drone filme (m). */
const DRONE_MIN_HEIGHT = 8;
/** Distance à un agent à terre en deçà de laquelle son agresseur menace sa vie (m). */
const LYNCH_RADIUS = 4;
/** Une prise de vue (media:shot) couvre ce rayon pendant cette durée. */
const SHOT_RADIUS = 10;
const SHOT_MEMORY = 4;

export type ProtectedKind = '' | 'collegue' | 'enfant' | 'journaliste' | 'secouriste' | 'observateur' | 'passant';

/** Désignation d'une personne protégée, avec article (« un journaliste identifiable »). */
export const PROTECTED_LABELS: Readonly<Record<ProtectedKind, string>> = {
  '': 'une personne',
  collegue: 'un collègue',
  enfant: 'un enfant',
  journaliste: 'un journaliste identifiable',
  secouriste: 'un secouriste',
  observateur: 'un observateur indépendant',
  passant: 'un passant étranger à la manifestation',
};

export class Perception {
  /** Résultats annexes du dernier appel à threat(). */
  threatRecent = false;
  threatLabel = '';
  /** Résultats annexes du dernier appel à hostilesNear(). */
  hostileQuadrants = 0;
  /** Résultats annexes du dernier appel à areaCensus(). */
  areaParticipants = 0;
  areaProtected = 0;

  private readonly scratch: Person[] = [];
  private readonly hit: RayHit = makeRayHit();
  private excludeId: EntityId = 0;
  private readonly shots = new Float64Array(SHOT_RING * 3);
  private shotHead = 0;
  private shotCount = 0;

  constructor(private readonly k: Kernel) {}

  reset(): void {
    this.shotHead = 0;
    this.shotCount = 0;
    this.excludeId = 0;
  }

  // ───────────────────────────── filtres (créés une fois) ─────────────────────────────

  /** Agent des forces de l'ordre en état d'observer (ni à terre, ni aveuglé, ni la personne exclue). */
  private readonly ableOfficer = (p: Person): boolean =>
    p.faction === 'police' && p.id !== this.excludeId && p.posture !== 'down' && p.health > 0 &&
    p.custody === 'free' && p.stun <= 0.5 && p.gas * (1 - p.gasProtection) < 0.75;

  /** Personne susceptible de porter une caméra (le détail est vérifié ensuite). */
  private readonly maybeCamera = (p: Person): boolean =>
    p.id !== this.excludeId && p.posture !== 'down' && p.health > 0 && p.custody === 'free' &&
    (p.upper === 'film' || p.upper === 'photo' || p.faction === 'press' || p.faction === 'police' || p.kind === 'observateur');

  private readonly activeParticipant = (p: Person): boolean =>
    p.faction === 'protest' && p.custody === 'free' && p.posture !== 'down' && p.health > 0;

  private readonly downedOfficer = (p: Person): boolean =>
    p.faction === 'police' && (p.posture === 'down' || p.health <= 25);

  private readonly freeOfficer = (p: Person): boolean =>
    p.faction === 'police' && p.id !== this.excludeId && p.posture !== 'down' && p.health > 0 &&
    p.custody === 'free' && p.carrying === 0 && p.vehicleId === 0;

  // ───────────────────────────── lignes de vue ─────────────────────────────

  /** Vue dégagée entre deux points : bâti, mobilier opaque, fumée. */
  sight(ax: number, az: number, bx: number, bz: number): boolean {
    const ctx = this.k.ctx;
    if (!ctx.world.lineOfSight(ax, az, bx, bz)) return false;
    if (ctx.hazards.visibility(ax, az, bx, bz) < this.k.cfg.minVisibility) return false;
    const hit = this.hit;
    if (ctx.props.raycast(ax, az, bx, bz, hit, 'sight') && hit.hit) {
      // un objet situé au point observé lui-même (kiosque dégradé, abribus) ne masque pas la scène
      const dx = bx - hit.x;
      const dz = bz - hit.z;
      if (dx * dx + dz * dz > 4) return false;
    }
    return true;
  }

  /** Portée à laquelle un agent identifie l'auteur d'un fait, selon la lumière et le brouillard (m). */
  witnessRange(): number {
    const env = this.k.ctx.env.state;
    let light = 0.35 + 0.65 * env.daylight;
    if (env.streetLights && light < 0.6) light = 0.6;
    const fog = 1 - 0.6 * env.fog;
    const r = this.k.cfg.witnessRange * light * fog;
    return r < 10 ? 10 : r;
  }

  /** Agent des forces de l'ordre le plus proche en état d'agir (null si aucun dans le rayon). */
  officerNear(x: number, z: number, r: number, excludeId: EntityId = 0): Person | null {
    this.excludeId = excludeId;
    return this.k.ctx.people.nearest(x, z, r, this.ableOfficer);
  }

  /**
   * Un membre des forces de l'ordre a-t-il vu le fait commis en (x, z) par `offender` ?
   * La vue est testée vers le point du fait puis, à défaut, vers l'auteur lui-même (un fait déclaré
   * sur une façade est « dans » le mur pour le lancer de rayon).
   */
  seenByPolice(x: number, z: number, offender: Person): boolean {
    const ctx = this.k.ctx;
    this.excludeId = offender.id;
    const scratch = this.scratch;
    const n = ctx.people.queryRadius(x, z, this.witnessRange(), scratch, this.ableOfficer);
    const far = Math.abs(offender.x - x) + Math.abs(offender.z - z) > 0.5;
    for (let i = 0; i < n; i++) {
      const w = scratch[i]!;
      if (this.sight(w.x, w.z, x, z)) return true;
      if (far && this.sight(w.x, w.z, offender.x, offender.z)) return true;
    }
    return false;
  }

  // ───────────────────────────── images ─────────────────────────────

  /** Enregistre une prise de vue (événement media:shot). */
  noteShot(x: number, z: number, t: number): void {
    const i = this.shotHead * 3;
    this.shots[i] = t;
    this.shots[i + 1] = x;
    this.shots[i + 2] = z;
    this.shotHead = (this.shotHead + 1) % SHOT_RING;
    if (this.shotCount < SHOT_RING) this.shotCount++;
  }

  /** Un agent porte-t-il une caméra-piéton (chefs, porteur de LBD et son superviseur : bible, tableau B) ? */
  hasBodycam(p: Person): boolean {
    if (p.faction !== 'police') return false;
    const poste = p.poste;
    if (poste === 'chef_groupe' || poste === 'chef_section' || poste === 'commandant_unite' || poste === 'lbd') return true;
    const extras = p.look.extras;
    return extras !== undefined && (extras['camera_pieton'] ?? 0) > 0;
  }

  /**
   * Masque des caméras (CAMERA_*) qui couvrent le point (x, z) à cet instant.
   * `subjectId` : personne dont la propre caméra ne compte pas (l'auteur d'une infraction) ;
   * `ownBodycam` : agent dont la caméra-piéton filme forcément son propre geste.
   */
  cameras(x: number, z: number, subjectId: EntityId, ownBodycam: Person | null): number {
    const k = this.k;
    const ctx = k.ctx;
    const cfg = k.cfg;
    const now = ctx.clock.now;
    let mask = 0;

    // prises de vue toutes récentes
    for (let s = 0; s < this.shotCount; s++) {
      const i = s * 3;
      if (now - this.shots[i]! > SHOT_MEMORY) continue;
      const dx = this.shots[i + 1]! - x;
      const dz = this.shots[i + 2]! - z;
      if (dx * dx + dz * dz <= SHOT_RADIUS * SHOT_RADIUS) {
        mask |= CAMERA_PRESS;
        break;
      }
    }

    // drones en vol
    const vehicles = ctx.vehicles.list;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i]!;
      if (v.kind !== 'drone' || v.dormant || v.state === 'wrecked' || v.state === 'burnt') continue;
      const dx = v.x - x;
      const dz = v.z - z;
      if (dx * dx + dz * dz > cfg.droneRange * cfg.droneRange) continue;
      if (v.y - ctx.world.heightAt(v.x, v.z) < DRONE_MIN_HEIGHT) continue;
      if (ctx.world.surfaceAt(x, z) === 'interior') continue;
      if (ctx.hazards.smokeAt(x, z) > 0.6) continue;
      mask |= CAMERA_DRONE;
      break;
    }

    if (ownBodycam && this.hasBodycam(ownBodycam)) mask |= CAMERA_BODYCAM;

    // caméras tenues ou portées par des personnes
    this.excludeId = subjectId;
    const scratch = this.scratch;
    const n = ctx.people.queryRadius(x, z, cfg.pressRange, scratch, this.maybeCamera);
    for (let i = 0; i < n; i++) {
      const c = scratch[i]!;
      let bit = 0;
      let range = 0;
      let cos = COS_CAMERA;
      if (c.faction === 'police') {
        if ((mask & CAMERA_BODYCAM) !== 0 || !this.hasBodycam(c)) continue;
        bit = CAMERA_BODYCAM;
        range = cfg.bodycamRange;
        cos = COS_BODYCAM;
      } else if (c.faction === 'press' || c.kind === 'journaliste') {
        if (!this.isFilming(c, true)) continue;
        bit = CAMERA_PRESS;
        range = cfg.pressRange;
      } else if (c.kind === 'observateur') {
        if (!this.isFilming(c, true)) continue;
        bit = CAMERA_OBSERVER;
        range = cfg.pressRange * 0.85;
      } else {
        bit = CAMERA_PHONE;
        range = cfg.phoneRange;
      }
      if ((mask & bit) !== 0) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > range * range) continue;
      if (d2 > 2.25) {
        const d = Math.sqrt(d2);
        if ((dx * Math.sin(c.aimYaw) + dz * Math.cos(c.aimYaw)) / d < cos) continue;
        if (!this.sight(c.x, c.z, x, z)) continue;
      }
      mask |= bit;
    }
    return mask;
  }

  /** La personne est-elle en train de filmer ou de photographier ? */
  private isFilming(p: Person, professional: boolean): boolean {
    if (p.upper === 'film' || p.upper === 'photo') return true;
    if (!professional || p.active < 0) return false;
    const item = p.inventory[p.active];
    return item !== undefined && (item.id === 'camera_tv' || item.id === 'appareil_photo');
  }

  // ───────────────────────────── qui est qui ─────────────────────────────

  /** Personne contre laquelle la force est par principe illégitime ('' sinon). */
  protectedKind(p: Person): ProtectedKind {
    if (p.faction === 'police') return 'collegue';
    if (p.look.height < CHILD_HEIGHT) return 'enfant';
    if (p.kind === 'journaliste' || p.faction === 'press') {
      const look = p.look;
      if (look.backText === 'PRESSE' || look.outfit === 'presse' || look.headgear === 'casque_presse' || look.armband !== 0) {
        return 'journaliste';
      }
      // sans signe distinctif, seul le matériel en main le distingue de la foule
      return this.isFilming(p, true) ? 'journaliste' : '';
    }
    if (p.faction === 'medic' || p.faction === 'rescue' || p.kind === 'street_medic' || p.kind === 'pompier' || p.kind === 'samu') {
      return 'secouriste';
    }
    if (p.kind === 'observateur') return 'observateur';
    if (p.faction === 'civil') return 'passant';
    return '';
  }

  /**
   * Niveau de menace que présente une personne (0 aucune … 5 atteinte à la vie), d'après ses
   * infractions récentes et ce qu'elle tient en main. Renseigne threatRecent (violence actuelle
   * contre des personnes) et threatLabel (motif en français).
   */
  threat(p: Person, now: number): number {
    const window = this.k.cfg.threatWindow;
    let level = 0;
    let recent = false;
    let label = '';
    const offenses = p.offenses;
    for (let i = offenses.length - 1; i >= 0; i--) {
      const o = offenses[i]!;
      const age = now - o.t;
      if (age > AUTHOR_MEMORY || age < 0) continue;
      let violent = VIOLENT_LEVEL[o.type];
      if (violent !== undefined) {
        // une simple bousculade (gravité 2) n'est pas une violence qui appelle une arme
        if (o.severity < violent) violent = o.severity;
        if (age <= window) {
          if (violent > level || !recent) {
            label = o.type === 'violence_agent' ? "auteur de violences sur un agent à l'instant"
              : o.type === 'incendie' ? "auteur d'un incendie à l'instant"
              : o.type === 'rebellion' ? 'en rébellion'
              : o.type === 'jet_projectile' ? "auteur d'un jet de projectile à l'instant"
              : "auteur de violences à l'instant";
          }
          if (violent > level) level = violent;
          if (violent >= 3) recent = true;
        } else if (level < 2) {
          level = 2;
          if (label === '') label = 'auteur de violences quelques instants plus tôt, sans menace actuelle';
        }
      } else {
        const trouble = TROUBLE_LEVEL[o.type];
        if (trouble !== undefined && age <= TROUBLE_MEMORY && trouble > level) {
          level = trouble;
          label = trouble >= 2 ? "auteur d'une atteinte aux biens" : 'en infraction sans violence';
        }
      }
    }
    if (p.active >= 0) {
      const item = p.inventory[p.active];
      const held = item !== undefined ? HELD_THREAT[item.id] : undefined;
      if (held !== undefined) {
        let h = held;
        if (h >= 4) {
          recent = true;
        } else if (p.upper === 'throw' || p.upper === 'strike') {
          // geste d'attaque en cours : menace immédiate
          h = 3;
          recent = true;
        }
        if (h > level) {
          level = h;
          label = h >= 5 ? "porteur d'une arme à feu" : h >= 4 ? "porteur d'un engin incendiaire ou d'un mortier"
            : h >= 3 ? "en train d'attaquer, projectile ou arme en main" : "porteur d'un objet dangereux";
        }
      }
    }
    this.threatRecent = recent;
    this.threatLabel = label === '' ? 'aucun comportement menaçant' : label;
    return level;
  }

  /** La personne a-t-elle commis des violences contre des personnes pendant la session (dangerosité) ? */
  everViolent(p: Person): boolean {
    const offenses = p.offenses;
    for (let i = 0; i < offenses.length; i++) if (VIOLENT_LEVEL[offenses[i]!.type] !== undefined) return true;
    return false;
  }

  /**
   * La personne porte-t-elle une atteinte grave et actuelle à la vie (seul cas d'usage de l'arme de
   * service) ? Engin incendiaire, mortier ou arme à feu en main, ou violences en cours sur un agent
   * à terre à ses pieds.
   */
  lethal(p: Person, now: number): boolean {
    if (p.active >= 0) {
      const item = p.inventory[p.active];
      if (item !== undefined && (HELD_THREAT[item.id] ?? 0) >= 4) return true;
    }
    if (this.threat(p, now) < 4 || !this.threatRecent) return false;
    return this.k.ctx.people.nearest(p.x, p.z, LYNCH_RADIUS, this.downedOfficer) !== null;
  }

  /** La personne s'éloigne-t-elle de l'agent en courant ? */
  fleeing(by: Person, target: Person): boolean {
    const speed2 = target.vx * target.vx + target.vz * target.vz;
    if (speed2 < FLEE_SPEED * FLEE_SPEED) return false;
    const dx = target.x - by.x;
    const dz = target.z - by.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 9) return false;
    return (target.vx * dx + target.vz * dz) / Math.sqrt(speed2 * d2) >= 0.5;
  }

  /**
   * Nombre de participants valides dans un rayon, et nombre de quadrants occupés autour du point
   * (hostileQuadrants) : sert à caractériser l'encerclement ou la prise à partie.
   */
  hostilesNear(x: number, z: number, r: number): number {
    const scratch = this.scratch;
    const n = this.k.ctx.people.queryRadius(x, z, r, scratch, this.activeParticipant);
    let mask = 0;
    for (let i = 0; i < n; i++) {
      const p = scratch[i]!;
      mask |= 1 << ((p.x >= x ? 1 : 0) + (p.z >= z ? 2 : 0));
    }
    this.hostileQuadrants = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
    return n;
  }

  /**
   * Recense la zone d'effet d'un moyen collectif : participants à l'attroupement (areaParticipants)
   * et personnes protégées (areaProtected) dans le rayon.
   */
  areaCensus(x: number, z: number, r: number): void {
    const scratch = this.scratch;
    const n = this.k.ctx.people.queryRadius(x, z, r, scratch);
    let participants = 0;
    let prot = 0;
    for (let i = 0; i < n; i++) {
      const p = scratch[i]!;
      if (p.faction === 'police') continue;
      if (p.faction === 'protest') participants++;
      else if (this.protectedKind(p) !== '') prot++;
    }
    this.areaParticipants = participants;
    this.areaProtected = prot;
  }

  /** Nombre de participants valides dans un rayon. */
  participantsIn(x: number, z: number, r: number): number {
    return this.k.ctx.people.countIn(x, z, r, this.activeParticipant);
  }

  /** Collègues disponibles pour prêter main-forte autour d'un point (hors `actorId`). */
  helpersNear(x: number, z: number, r: number, actorId: EntityId): number {
    this.excludeId = actorId;
    return this.k.ctx.people.countIn(x, z, r, this.freeOfficer);
  }

  /** L'agent emploie-t-il un lanceur de grenades (à l'épaule ou en tourelle) ? */
  usesLauncher(by: Person): boolean {
    const ctx = this.k.ctx;
    if (by.vehicleId !== 0) {
      const v = ctx.vehicles.get(by.vehicleId);
      if (v) {
        const seat = v.def.seats[by.seat];
        if (seat && seat.role === 'gunner') {
          for (let i = 0; i < v.def.turrets.length; i++) if (v.def.turrets[i]!.kind === 'lance_grenades') return true;
        }
      }
      return false;
    }
    if (by.active < 0) return false;
    const item = by.inventory[by.active];
    if (!item) return false;
    if (item.id === 'lanceur_cougar') return true;
    const def = ctx.actions.def(item.id);
    return def !== undefined && def.category === 'launcher' && def.forceMeans !== 'lbd';
  }
}
