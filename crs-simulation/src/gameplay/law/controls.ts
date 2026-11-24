/* =====================================================================================
 * Droit — contrôle d'identité (art. 78-2 du code de procédure pénale), en situation calme.
 *
 * Le contrôle n'est légal que s'il a un motif : fait déjà constaté, visage dissimulé, objet
 * dangereux en main, réquisition du procureur aux abords de la manifestation (configuration de
 * session `extra['law.requisition'] = true`) ; la qualité d'un journaliste peut être vérifiée
 * (passage d'un cordon). Un contrôle sans motif est relevé au dossier.
 * ===================================================================================== */

import type { EntityId, Person } from '@/core/contracts';
import type { Kernel } from './kernel';
import { HELD_THREAT, offenseLabel } from './texts';

/** Délai avant de pouvoir contrôler de nouveau la même personne (s). */
const CONTROL_REPEAT = 120;

export class Controls {
  /** Personnes en cours de contrôle : invitées à rester sur place. */
  readonly ongoing: Person[] = [];
  private readonly last = new Map<EntityId, number>();

  constructor(private readonly k: Kernel) {}

  reset(): void {
    this.ongoing.length = 0;
    this.last.clear();
  }

  /** Un contrôle récent a-t-il déjà été fait sur cette personne ? */
  recent(targetId: EntityId): boolean {
    const t = this.last.get(targetId);
    return t !== undefined && this.k.ctx.clock.now - t < CONTROL_REPEAT;
  }

  begin(target: Person): void {
    if (this.ongoing.indexOf(target) < 0) this.ongoing.push(target);
  }

  end(target: Person): void {
    const i = this.ongoing.indexOf(target);
    if (i < 0) return;
    this.ongoing[i] = this.ongoing[this.ongoing.length - 1]!;
    this.ongoing.pop();
  }

  /** Contrôle terminé : résultat, motif légal, inscription au dossier. */
  complete(actor: Person, target: Person): void {
    const k = this.k;
    const ctx = k.ctx;
    const now = ctx.clock.now;
    this.end(target);
    this.last.set(target.id, now);
    const prot = k.eyes.protectedKind(target);
    const known = k.offenses.evidenced(target);
    const item = target.active >= 0 ? target.inventory[target.active] : undefined;
    const armed = item !== undefined && HELD_THREAT[item.id] !== undefined;
    const config = ctx.session.config;
    const requisition = config !== null && config.extra !== undefined && config.extra['law.requisition'] === true;
    const troubled = k.roe.dispersionOrdered || k.attack.any() || ctx.director.tension >= 0.3;
    const masked = target.look.faceCover;
    const justified = known !== null || masked || armed || requisition || prot === 'journaliste';
    let result: string;
    if (prot === 'journaliste' && !known) {
      result = 'Carte de presse vérifiée : ' + target.name + ' peut circuler dans le dispositif.';
    } else if (known) {
      result = 'Identité relevée : ' + target.name + '. Fait déjà constaté : ' + offenseLabel(known.type) + (known.severity >= 2 ? ". L'interpellation est fondée." : '.');
    } else {
      result = 'Identité relevée : ' + target.name + '. Aucune infraction connue.';
    }
    if (masked && troubled && prot === '') {
      k.offenses.record(target, 'dissimulation_visage', target.x, target.z, undefined, true);
      result += ' Visage dissimulé sans motif légitime aux abords de troubles : infraction relevée.';
    }
    if (!justified) {
      result += ' Contrôle sans motif légal (art. 78-2 du code de procédure pénale).';
      target.anger = target.anger + 0.05 > 1 ? 1 : target.anger + 0.05;
      if (prot !== '' && prot !== 'collegue') {
        k.records.addComplaint(now, 'controle', target, actor.id, "contrôle d'identité sans motif", 1, false);
      }
    }
    k.records.controles.push({
      t: now, byId: actor.id, targetId: target.id, targetName: target.name, x: target.x, z: target.z,
      justified, known: known ? known.type : null, result,
    });
    ctx.events.emitAny('law:control', { id: target.id, byId: actor.id, justified, known: known ? known.type : null });
    k.notify(actor, result, justified ? 'info' : 'warn', 6);
  }

  /** Une personne a quitté le jeu. */
  onRemoved(id: EntityId): void {
    for (let i = this.ongoing.length - 1; i >= 0; i--) {
      if (this.ongoing[i]!.id === id) this.end(this.ongoing[i]!);
    }
    this.last.delete(id);
  }
}
