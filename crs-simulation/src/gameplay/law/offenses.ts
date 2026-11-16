/* =====================================================================================
 * Droit — infractions et preuves.
 *
 *   - record() : gravité par défaut selon le type, « vu » si un membre des forces de l'ordre valide
 *     a une ligne de vue à portée réaliste, « filmé » si une caméra couvre la scène (drone,
 *     caméra-piéton proche, journaliste ou téléphone qui filme) ;
 *   - deux déclarations du même fait (même personne, même type, à moins de 2 s) n'en font qu'une :
 *     plusieurs modules peuvent signaler le même geste sans le compter deux fois ;
 *   - canArrest() : flagrant délit établi = un délit (gravité ≥ 2) vu par un agent ou filmé. Sans
 *     fait rattaché à la personne par un témoin ou une image, l'interpellation est infondée ;
 *   - les violences contre les forces (violences sur agent, rébellion, jets et incendies près des
 *     agents) ouvrent le cadre de la riposte directe.
 * ===================================================================================== */

import type { Offense, OffenseType, Person } from '@/core/contracts';
import { OFFENSES_MAX, OFFENSE_MERGE_WINDOW, TROUBLE_RADIUS, TROUBLE_RING, TROUBLE_WINDOW } from './config';
import type { Kernel } from './kernel';
import { offenseSeverity } from './texts';

/** Distance aux forces en deçà de laquelle un jet ou un incendie est une violence contre elles (m). */
const NEAR_FORCES = 30;

export class Offenses {
  /** Nombre d'infractions enregistrées depuis le début de la session. */
  total = 0;

  /** Anneau [t, x, z] des infractions établies (vues ou filmées) : sert au constat de l'attroupement. */
  private readonly troubles = new Float64Array(TROUBLE_RING * 3);
  private troubleHead = 0;
  private troubleCountAll = 0;

  constructor(private readonly k: Kernel) {}

  reset(): void {
    this.total = 0;
    this.troubleHead = 0;
    this.troubleCountAll = 0;
  }

  /**
   * Enregistre une infraction commise par `p` en (x, z).
   * `seen` = true : constat direct par un agent (palpation, rébellion pendant une interpellation).
   */
  record(p: Person, type: OffenseType, x: number, z: number, severity?: number, seen = false): Offense {
    const k = this.k;
    const ctx = k.ctx;
    const now = ctx.clock.now;
    let sev = severity !== undefined && Number.isFinite(severity) ? Math.round(severity) : offenseSeverity(type);
    if (sev < 1) sev = 1;
    else if (sev > 5) sev = 5;

    // même fait déjà déclaré : on complète au lieu de doubler
    const list = p.offenses;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i]!;
      if (now - o.t > OFFENSE_MERGE_WINDOW) break;
      if (o.type !== type) continue;
      if (sev > o.severity) o.severity = sev;
      if (!o.witnessed && (seen || k.eyes.seenByPolice(x, z, p))) o.witnessed = true;
      if (!o.filmed && k.eyes.cameras(x, z, p.id, null) !== 0) o.filmed = true;
      return o;
    }

    const witnessed = seen || k.eyes.seenByPolice(x, z, p);
    const filmed = k.eyes.cameras(x, z, p.id, null) !== 0;
    const offense: Offense = { type, t: now, x, z, severity: sev, witnessed, filmed };
    if (list.length >= OFFENSES_MAX) this.forget(list);
    list.push(offense);
    this.total++;

    if (witnessed || filmed) {
      const i = this.troubleHead * 3;
      this.troubles[i] = now;
      this.troubles[i + 1] = x;
      this.troubles[i + 2] = z;
      this.troubleHead = (this.troubleHead + 1) % TROUBLE_RING;
      if (this.troubleCountAll < TROUBLE_RING) this.troubleCountAll++;
    }

    // violences contre les forces : cadre de la riposte directe (un coup, un jet ; pas une bousculade)
    if (p.faction !== 'police' && sev >= 3) {
      if (type === 'violence_agent' || type === 'rebellion') {
        k.attack.note(x, z);
      } else if ((type === 'jet_projectile' || type === 'incendie') && k.eyes.officerNear(x, z, NEAR_FORCES, p.id) !== null) {
        k.attack.note(x, z);
      }
    }

    ctx.events.emit('law:offense', { personId: p.id, offense });
    return offense;
  }

  /** Retire l'infraction la moins grave (la plus ancienne à gravité égale) pour borner la liste. */
  private forget(list: Offense[]): void {
    let at = 0;
    for (let i = 1; i < list.length; i++) if (list[i]!.severity < list[at]!.severity) at = i;
    list.splice(at, 1);
  }

  /** Infraction la plus grave retenue contre la personne ; à gravité égale, la mieux établie puis la plus récente. */
  worst(p: Person): Offense | null {
    let best: Offense | null = null;
    let bestProof = -1;
    const list = p.offenses;
    for (let i = 0; i < list.length; i++) {
      const o = list[i]!;
      const proof = (o.witnessed ? 1 : 0) + (o.filmed ? 2 : 0);
      if (!best || o.severity > best.severity || (o.severity === best.severity && proof >= bestProof)) {
        best = o;
        bestProof = proof;
      }
    }
    return best;
  }

  /** Infraction la plus grave parmi celles qui sont établies (vues ou filmées), de gravité ≥ `minSeverity`. */
  evidenced(p: Person, minSeverity = 1): Offense | null {
    let best: Offense | null = null;
    let bestProof = -1;
    const list = p.offenses;
    for (let i = 0; i < list.length; i++) {
      const o = list[i]!;
      if (o.severity < minSeverity || !(o.witnessed || o.filmed)) continue;
      const proof = (o.witnessed ? 1 : 0) + (o.filmed ? 2 : 0);
      if (!best || o.severity > best.severity || (o.severity === best.severity && proof >= bestProof)) {
        best = o;
        bestProof = proof;
      }
    }
    return best;
  }

  /** L'interpellation serait-elle fondée ? (flagrant délit : un délit vu par un agent ou filmé) */
  canArrest(p: Person): boolean {
    if (p.faction === 'police') return false;
    const list = p.offenses;
    for (let i = 0; i < list.length; i++) {
      const o = list[i]!;
      if (o.severity >= 2 && (o.witnessed || o.filmed)) return true;
    }
    return false;
  }

  /** Nombre d'infractions établies depuis moins d'une minute dans un rayon de 100 m. */
  troubleCount(x: number, z: number): number {
    const now = this.k.ctx.clock.now;
    const ring = this.troubles;
    let n = 0;
    for (let s = 0; s < this.troubleCountAll; s++) {
      const i = s * 3;
      if (now - ring[i]! > TROUBLE_WINDOW) continue;
      const dx = ring[i + 1]! - x;
      const dz = ring[i + 2]! - z;
      if (dx * dx + dz * dz <= TROUBLE_RADIUS * TROUBLE_RADIUS) n++;
    }
    return n;
  }
}
