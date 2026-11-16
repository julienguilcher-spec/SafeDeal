/* =====================================================================================
 * SECOURS — messages radio (canal « secours »).
 *
 * Deux phraséologies :
 *   - joueur policier (ou autre rôle) : celle de la bible §E.6 ; si la bibliothèque du module radio est branchée
 *     (« radio.phrases »), ses phrases sont employées, sinon des textes de repli équivalents sont dits par
 *     ctx.radio.say. Indicatifs : « SAPEUR n » pour les pompiers, « SANTÉ n » pour le SAMU (bible §E.5) ;
 *   - joueur pompier ou soignant du SAMU (rôle « secouriste ») : le réseau des secours tel qu'il l'entend, à la
 *     manière de la BSPP et du SAMU de Paris. La salle des pompiers s'appelle « PARIS », la régulation « SAMU 75 » ;
 *     chaque engin porte le nom de son centre (« FOURGON SÉVIGNÉ ») ou de son hôpital (« SMUR NECKER ») :
 *       « FOURGON SÉVIGNÉ de PARIS : départ pour feu de poubelles, 12 rue de Rivoli. Rendez compte. »
 *       « PARIS de FOURGON SÉVIGNÉ : sur les lieux, feu de poubelles. Une lance en manœuvre. »
 *       « SAMU 75 de SMUR NECKER : l’UMH est sur les lieux, une victime en urgence absolue, bilan en cours. »
 *     Ni CENTRAL, ni indicatifs de police : le joueur secouriste n'entend pas la radio de police.
 * Débit limité : un même message n'est pas répété avant son délai, et un engin ne parle pas plus d'une fois toutes
 * les quatre secondes (sauf urgence) : le message suivant attend son tour (tick, à chaque pas).
 * ===================================================================================== */

import type { GameContext, Person } from '@/core/contracts';
import { EXT } from '@/core/extensions';
import type { IncidentsApi, RescueKind } from '@/core/extensions';
import type { RadioPhrases } from '@/gameplay/radio/api';
import { ROLE_CHIEF } from './crew';
import type { CallRec, Crew } from './crew';
import { dispatcherCallsign, nearestStation, stationCallsign } from './stations';

const DIGITS = ['ZÉRO', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF'];
/** Un même émetteur ne parle pas plus souvent que cela (s), sauf urgence. */
const SENDER_GAP = 4;

/** Indicatif dit à la radio : « SAPEUR 1 » → « SAPEUR UN ». */
function spoken(callsign: string): string {
  return callsign.toUpperCase().replace(/\d/g, (d) => DIGITS[Number(d)]);
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** « urgence absolue (UA) » / « urgence relative (UR) » d'après la gravité dite par l'équipage. */
function triageWords(gravity: string): string {
  return gravity === 'critique' ? 'une victime en urgence absolue' : 'une victime en urgence relative';
}

export class RescueRadio {
  enabled = true;
  private readonly lastKey = new Map<string, number>();
  private readonly lastSender = new Map<string, number>();
  /** Indicatifs d'engins déjà attribués. */
  private readonly taken = new Set<string>();
  /** Messages retenus parce que l'engin venait de parler : dits dès que possible (30 s au plus). */
  private readonly pending: { key: string; from: string; text: string; priority: 0 | 1 | 2; personId: number; at: number }[] = [];

  constructor(private readonly ctx: GameContext) {}

  reset(): void {
    this.lastKey.clear();
    this.lastSender.clear();
    this.taken.clear();
    this.pending.length = 0;
  }

  /** Dit les messages retenus dont l'émetteur peut de nouveau parler (appelé à chaque pas). */
  tick(): void {
    if (this.pending.length === 0) return;
    const now = this.ctx.clock.now;
    for (let i = 0; i < this.pending.length; i++) {
      const m = this.pending[i];
      if (now - m.at > 30) {
        this.pending.splice(i--, 1);
        continue;
      }
      const lastFrom = this.lastSender.get(m.from);
      if (lastFrom !== undefined && now - lastFrom < SENDER_GAP) continue;
      this.pending.splice(i--, 1);
      this.lastSender.set(m.from, now);
      this.say(m.from, m.text, m.priority, m.personId);
    }
  }

  private phrases(): RadioPhrases | undefined {
    return this.ctx.service<RadioPhrases>('radio.phrases');
  }

  /** Le joueur est-il sur le réseau des secours (pompier ou SAMU) ? */
  net(): boolean {
    return this.ctx.player.state.role === 'secouriste';
  }

  callsign(crew: Crew | null, kind: RescueKind): string {
    if (this.net() && crew) return this.unitName(crew);
    if (crew && crew.squadId !== 0) {
      const s = this.ctx.squads.get(crew.squadId);
      if (s) return s.name;
    }
    return kind === 'pompiers' ? 'SAPEUR 1' : 'SANTÉ 1';
  }

  /**
   * Indicatif d'engin sur le réseau des secours : le centre (ou l'hôpital) le plus proche de son point de départ,
   * sans doublon avec un autre engin en service.
   */
  unitName(crew: Crew): string {
    if (crew.radioName !== '') return crew.radioName;
    const k = crew.kind;
    const x = crew.homeX !== 0 || crew.homeZ !== 0 ? crew.homeX : crew.originX !== 0 || crew.originZ !== 0 ? crew.originX : crew.posX();
    const z = crew.homeX !== 0 || crew.homeZ !== 0 ? crew.homeZ : crew.originX !== 0 || crew.originZ !== 0 ? crew.originZ : crew.posZ();
    let name = stationCallsign(k, nearestStation(k, x, z));
    let n = 2;
    const taken = (s: string): boolean => this.taken.has(s);
    while (taken(name) && n < 9) name = `${stationCallsign(k, nearestStation(k, x, z))} ${n++}`;
    this.taken.add(name);
    crew.radioName = name;
    return name;
  }

  private sector(x: number, z: number): string {
    return this.ctx.world.sectorName(x, z);
  }

  /**
   * Adresse dite à la radio : « 12 rue de Rivoli » (numéro tiré du point, pair ou impair selon le côté), ou le nom
   * de la place, du pont. Vide hors des voies nommées.
   */
  address(x: number, z: number): string {
    const s = this.sector(x, z);
    if (s === '') return '';
    if (!/^(rue|avenue|boulevard|quai|cours|allée|impasse|passage|faubourg)\b/i.test(s)) return s;
    const h = Math.abs(Math.floor(x * 0.37) * 31 + Math.floor(z * 0.29) * 17);
    return `${1 + (h % 70)} ${s}`;
  }

  /** Nature de l'intervention (« feu de poubelles », « blessé grave »). */
  nature(call: CallRec): string {
    const incidents = this.ctx.service<IncidentsApi>(EXT.incidents);
    const inc = incidents && call.incidentId !== 0 ? incidents.get(call.incidentId) : undefined;
    if (inc) {
      const i = inc.label.indexOf(',');
      return lowerFirst(i > 0 ? inc.label.slice(0, i) : inc.label);
    }
    return call.kind === 'pompiers' ? 'feu' : 'secours à victime';
  }

  private say(from: string, text: string, priority: 0 | 1 | 2, personId = 0): void {
    if (!this.enabled) return;
    this.ctx.radio.say(personId !== 0 ? { channel: 'secours', from, text, priority, personId } : { channel: 'secours', from, text, priority });
  }

  /**
   * Message du réseau des secours, au débit limité : `key` n'est pas redit avant `gap` secondes, et l'émetteur pas
   * avant SENDER_GAP (sauf priorité 2). true si le message est passé.
   */
  private netSay(key: string, gap: number, from: string, text: string, priority: 0 | 1 | 2, personId = 0): boolean {
    if (!this.enabled) return false;
    const now = this.ctx.clock.now;
    const last = this.lastKey.get(key);
    if (last !== undefined && now - last < gap) return false;
    this.lastKey.set(key, now);
    const lastFrom = this.lastSender.get(from);
    if (priority < 2 && lastFrom !== undefined && now - lastFrom < SENDER_GAP) {
      // l'engin vient de parler : le message passera juste après (pas deux messages collés)
      if (this.pending.length < 16) this.pending.push({ key, from, text, priority, personId, at: now });
      return false;
    }
    this.lastSender.set(from, now);
    if (this.lastKey.size > 200) for (const [k2, t] of this.lastKey) if (now - t > 300) this.lastKey.delete(k2);
    this.say(from, text, priority, personId);
    return true;
  }

  private leadId(crew: Crew | null): number {
    if (!crew || crew.members.length === 0) return 0;
    for (let i = 0; i < crew.members.length; i++) if (!crew.members[i].p.isPlayer && crew.members[i].role === ROLE_CHIEF) return crew.members[i].p.id;
    for (let i = 0; i < crew.members.length; i++) if (!crew.members[i].p.isPlayer) return crew.members[i].p.id;
    return crew.members[0].p.id;
  }

  private where(call: CallRec): string {
    const a = this.address(call.x, call.z);
    return a !== '' ? `, ${a}` : '';
  }

  // ───────────────────────────── trafic des équipages (PNJ et joueur) ─────────────────────────────

  /** La salle accuse réception et annonce le délai. */
  dispatched(call: CallRec): void {
    if (!this.enabled) return;
    const minutes = Math.max(1, Math.round(call.eta / 60));
    if (this.net()) {
      const engin = call.kind === 'pompiers' ? 'un fourgon' : 'une UMH';
      const words = minutes === 1 ? 'une' : minutes < DIGITS.length ? DIGITS[minutes].toLowerCase() : String(minutes);
      this.netSay(`dispatch:${call.id}`, 60, dispatcherCallsign(call.kind),
        `À tous de ${dispatcherCallsign(call.kind)} : ${this.nature(call)}${this.where(call)}. Départ d’${engin}, délai ${words} minute${minutes > 1 ? 's' : ''}.`, 1);
      return;
    }
    const p = this.phrases();
    if (p && p.has('secours_en_route') && p.say('secours_en_route', { duree: `${minutes} minute${minutes > 1 ? 's' : ''}` }, { at: call })) return;
    const where = this.sector(call.x, call.z);
    const who = call.kind === 'pompiers' ? 'Sapeurs-pompiers' : 'Équipe médicale';
    this.say('CENTRAL', `ICI CENTRAL. ${who} en route${where !== '' ? ` vers ${where}` : ''}. Délai : ${minutes === 1 ? 'UNE' : DIGITS[minutes] ?? minutes} `
      + `minute${minutes > 1 ? 's' : ''}. Préparez l’accès. TERMINÉ.`, 1);
  }

  /** Aucun moyen libre : l'appel attend. */
  queued(call: CallRec): void {
    if (this.net()) {
      const who = call.kind === 'pompiers' ? 'tous les fourgons sont engagés' : 'toutes les UMH sont engagées';
      this.netSay(`queued:${call.kind}`, 60, dispatcherCallsign(call.kind), `À tous de ${dispatcherCallsign(call.kind)} : ${this.nature(call)}${this.where(call)}, ${who}. Appel en attente.`, 1);
      return;
    }
    const who = call.kind === 'pompiers' ? 'Tous les engins de sapeurs-pompiers' : 'Toutes les équipes médicales';
    this.say('CENTRAL', `ICI CENTRAL. ${who} sont engagés. Votre demande est prise, délai allongé. TERMINÉ.`, 1);
  }

  /** L'équipage s'arrête à distance et dit pourquoi. */
  waiting(call: CallRec, crew: Crew): void {
    if (!this.enabled) return;
    const from = this.callsign(crew, call.kind);
    if (this.net()) {
      this.netSay(`wait:${call.id}`, 40, from, `${dispatcherCallsign(call.kind)} de ${from} : arrêtés à distance${this.where(call)}. ${call.waitingReason ? `${call.waitingReason.charAt(0).toUpperCase()}${call.waitingReason.slice(1)}. ` : ''}`
        + 'Nous n’engageons pas sans protection police.', 2, this.leadId(crew));
      return;
    }
    const p = this.phrases();
    if (p && p.has('secours_attente_securisation') && p.say('secours_attente_securisation', {}, { from, at: call, personId: this.leadId(crew) })) return;
    const where = this.sector(crew.posX(), crew.posZ());
    this.say(from, `CENTRAL ICI ${spoken(from)}. Nous sommes arrêtés à la limite de la zone${where !== '' ? `, ${where}` : ''}. `
      + `Motif : ${call.waitingReason}. Nous attendons un itinéraire dégagé et une protection avant d’avancer. PARLEZ.`, 2, this.leadId(crew));
  }

  onScene(call: CallRec, crew: Crew): void {
    if (!this.enabled) return;
    const from = this.callsign(crew, call.kind);
    if (this.net()) {
      const text = call.kind === 'pompiers'
        ? `PARIS de ${from} : sur les lieux${this.where(call)}, ${this.nature(call)}. Une lance en manœuvre.`
        : `SAMU 75 de ${from} : l’UMH est sur les lieux${this.where(call)}. ${this.nature(call).replace(/^./, (c) => c.toUpperCase())}, bilan en cours.`;
      this.netSay(`scene:${call.id}`, 120, from, text, 1, this.leadId(crew));
      return;
    }
    const p = this.phrases();
    if (p && p.has('secours_sur_place') && p.say('secours_sur_place', {}, { from, at: call, personId: this.leadId(crew) })) return;
    const where = this.sector(call.x, call.z);
    this.say(from, `CENTRAL ICI ${spoken(from)}. Secours sur place${where !== '' ? `, ${where}` : ''}. `
      + `${call.kind === 'pompiers' ? 'Établissement de la lance en cours.' : 'Prise en charge en cours.'} TERMINÉ.`, 1, this.leadId(crew));
  }

  fireOut(call: CallRec, crew: Crew): void {
    if (!this.enabled) return;
    const from = this.callsign(crew, call.kind);
    if (this.net()) {
      this.netSay(`out:${call.id}`, 60, from, `PARIS de ${from} : feu éteint${this.where(call)}. Nous restons en surveillance, noyage des braises.`, 1, this.leadId(crew));
      return;
    }
    const p = this.phrases();
    if (p && p.has('pompiers_feu_eteint') && p.say('pompiers_feu_eteint', {}, { from, at: call, personId: this.leadId(crew) })) return;
    const where = this.sector(call.x, call.z);
    this.say(from, `CENTRAL ICI ${spoken(from)}. Feu éteint${where !== '' ? `, ${where}` : ''}. Nous surveillons les points chauds. PARLEZ.`, 1, this.leadId(crew));
  }

  evacuation(call: CallRec, crew: Crew, gravity: string): void {
    if (!this.enabled) return;
    const from = this.callsign(crew, call.kind);
    if (this.net()) {
      const to = dispatcherCallsign(call.kind);
      this.netSay(`evac:${call.id}`, 60, from, `${to} de ${from} : ${triageWords(gravity)}, conditionnée. Évacuation en cours${this.where(call) ? ` depuis${this.where(call).slice(1)}` : ''}.`,
        1, this.leadId(crew));
      return;
    }
    const p = this.phrases();
    if (p && p.has('secours_evacuation') && p.say('secours_evacuation', { gravite: gravity }, { from, at: call, personId: this.leadId(crew) })) return;
    const where = this.sector(call.x, call.z);
    this.say(from, `CENTRAL ICI ${spoken(from)}. Victime prise en charge, évacuation en cours${where !== '' ? ` depuis ${where}` : ''}. `
      + `Gravité : ${gravity}. PARLEZ.`, 1, this.leadId(crew));
  }

  leaving(call: CallRec, crew: Crew): void {
    if (!this.enabled) return;
    const from = this.callsign(crew, call.kind);
    if (this.net()) {
      this.netSay(`leave:${call.id}`, 120, from, `${dispatcherCallsign(call.kind)} de ${from} : opération terminée${this.where(call)}. Disponible, nous rentrons.`, 1, this.leadId(crew));
      return;
    }
    const p = this.phrases();
    if (p && p.has('secours_termine') && p.say('secours_termine', {}, { from, at: call, personId: this.leadId(crew) })) return;
    const where = this.sector(call.x, call.z);
    this.say(from, `CENTRAL ICI ${spoken(from)}. Intervention terminée${where !== '' ? `, ${where}` : ''}. Nous quittons la zone. TERMINÉ.`, 1, this.leadId(crew));
  }

  retreat(call: CallRec, crew: Crew): void {
    const from = this.callsign(crew, call.kind);
    if (this.net()) {
      this.netSay(`retreat:${call.id}`, 30, from, `${dispatcherCallsign(call.kind)} de ${from} : URGENT, équipage pris à partie, nous nous replions. Demandons protection police.`, 2, this.leadId(crew));
      return;
    }
    this.say(from, `CENTRAL ICI ${spoken(from)}. URGENT. Équipage pris à partie, nous nous replions. Demande protection avant de reprendre. PARLEZ.`,
      2, this.leadId(crew));
  }

  needSamu(call: CallRec, crew: Crew, gravity: string): void {
    const from = this.callsign(crew, call.kind);
    if (this.net()) {
      this.netSay(`samu:${call.id}`, 60, from, `PARIS de ${from} : ${triageWords(gravity)} dégagée${this.where(call)}. Demandons le SAMU.`, 2, this.leadId(crew));
      return;
    }
    this.say(from, `CENTRAL ICI ${spoken(from)}. URGENT. Une victime dégagée, gravité ${gravity}. Demande SANTÉ sur place. PARLEZ.`, 2, this.leadId(crew));
  }

  // ───────────────────────────── équipage du joueur secouriste ─────────────────────────────

  /** L'appel est attribué à l'engin du joueur : la salle l'engage (« FOURGON SÉVIGNÉ de PARIS : départ pour … »). */
  engaged(call: CallRec, crew: Crew, urgent: boolean): void {
    const from = dispatcherCallsign(call.kind);
    const unit = this.unitName(crew);
    this.netSay(`engage:${call.id}`, 600, from, `${unit} de ${from} : ${urgent ? 'URGENT, ' : ''}départ pour ${this.nature(call)}${this.where(call)}. Rendez compte.`, urgent ? 2 : 1);
  }

  /** L'engin part : le chef d'agrès accuse réception. */
  rolling(call: CallRec, crew: Crew, withPlayer: boolean): void {
    const unit = this.unitName(crew);
    this.netSay(`roll:${call.id}`, 600, unit, `${dispatcherCallsign(call.kind)} de ${unit} : bien reçu, ${call.kind === 'pompiers' ? 'fourgon' : 'UMH'} parti${call.kind === 'samu' ? 'e' : ''}`
      + `${withPlayer ? '' : ', un équipier en retard nous rejoint'}, deux tons.`, 1, this.leadId(crew));
  }

  /** L'engin attend le joueur : rappel de l'équipage (voix du chef d'agrès, sur le réseau de l'engin). */
  remind(crew: Crew, me: Person, back: boolean): void {
    const unit = this.unitName(crew);
    const first = me.name.trim().split(' ')[0] || 'Toi';
    this.netSay(`remind:${crew.id}`, 20, unit, back ? `${first}, on rentre : remonte dans l’engin !` : `${first}, on n’attend plus que toi : en voiture, on part !`, 2, this.leadId(crew));
  }

  /** L'engin part sans le joueur. */
  leftWithout(call: CallRec, crew: Crew, me: Person): void {
    const unit = this.unitName(crew);
    const first = me.name.trim().split(' ')[0] || 'Toi';
    const a = this.address(call.x, call.z);
    this.netSay(`left:${call.id}`, 600, unit, `${first}, on part sans toi : rejoins-nous sur les lieux${a !== '' ? `, ${a}` : ''}.`, 2, this.leadId(crew));
  }

  /** Bilan du SAMU sur les lieux (« une victime en urgence absolue, prise en charge »). */
  bilan(call: CallRec, crew: Crew, gravity: string): void {
    const unit = this.unitName(crew);
    this.netSay(`bilan:${call.id}`, 600, unit, `SAMU 75 de ${unit} : bilan, ${triageWords(gravity)}. Prise en charge en cours, je vous rappelle pour l’orientation.`, 1, this.leadId(crew));
  }

  /** Engin disponible (« PS disponible ») : de retour au centre, ou libéré sur les lieux. */
  available(crew: Crew, home: string): void {
    const unit = this.unitName(crew);
    const to = dispatcherCallsign(crew.kind);
    this.netSay(`dispo:${crew.id}:${home}`, 60, unit, home !== '' ? `${to} de ${unit} : rentré ${home}, disponible.` : `${to} de ${unit} : disponible, nous rentrons.`, 1, this.leadId(crew));
  }
}
