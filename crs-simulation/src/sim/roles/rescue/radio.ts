/* =====================================================================================
 * SECOURS — messages radio (canal « secours »).
 * Phraséologie de la bible §E.6 ; si la bibliothèque du module radio est branchée (« radio.phrases »),
 * ses phrases sont employées, sinon des textes de repli équivalents sont dits par ctx.radio.say.
 * Indicatifs : « SAPEUR n » pour les pompiers, « SANTÉ n » pour le SAMU (bible §E.5).
 * ===================================================================================== */

import type { GameContext } from '@/core/contracts';
import type { RescueKind } from '@/core/extensions';
import type { RadioPhrases } from '@/gameplay/radio/api';
import type { CallRec, Crew } from './crew';

const DIGITS = ['ZÉRO', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF'];

/** Indicatif dit à la radio : « SAPEUR 1 » → « SAPEUR UN ». */
function spoken(callsign: string): string {
  return callsign.toUpperCase().replace(/\d/g, (d) => DIGITS[Number(d)]);
}

export class RescueRadio {
  enabled = true;

  constructor(private readonly ctx: GameContext) {}

  private phrases(): RadioPhrases | undefined {
    return this.ctx.service<RadioPhrases>('radio.phrases');
  }

  callsign(crew: Crew | null, kind: RescueKind): string {
    if (crew && crew.squadId !== 0) {
      const s = this.ctx.squads.get(crew.squadId);
      if (s) return s.name;
    }
    return kind === 'pompiers' ? 'SAPEUR 1' : 'SANTÉ 1';
  }

  private sector(x: number, z: number): string {
    return this.ctx.world.sectorName(x, z);
  }

  private say(from: string, text: string, priority: 0 | 1 | 2, personId = 0): void {
    if (!this.enabled) return;
    this.ctx.radio.say(personId !== 0 ? { channel: 'secours', from, text, priority, personId } : { channel: 'secours', from, text, priority });
  }

  private leadId(crew: Crew | null): number {
    return crew && crew.members.length > 0 ? crew.members[crew.members.length > 1 ? 1 : 0].p.id : 0;
  }

  /** La salle accuse réception et annonce le délai. */
  dispatched(call: CallRec): void {
    if (!this.enabled) return;
    const minutes = Math.max(1, Math.round(call.eta / 60));
    const p = this.phrases();
    if (p && p.has('secours_en_route') && p.say('secours_en_route', { duree: `${minutes} minute${minutes > 1 ? 's' : ''}` }, { at: call })) return;
    const where = this.sector(call.x, call.z);
    const who = call.kind === 'pompiers' ? 'Sapeurs-pompiers' : 'Équipe médicale';
    this.say('CENTRAL', `ICI CENTRAL. ${who} en route${where !== '' ? ` vers ${where}` : ''}. Délai : ${minutes === 1 ? 'UNE' : DIGITS[minutes] ?? minutes} `
      + `minute${minutes > 1 ? 's' : ''}. Préparez l’accès. TERMINÉ.`, 1);
  }

  /** Aucun moyen libre : l'appel attend. */
  queued(call: CallRec): void {
    const who = call.kind === 'pompiers' ? 'Tous les engins de sapeurs-pompiers' : 'Toutes les équipes médicales';
    this.say('CENTRAL', `ICI CENTRAL. ${who} sont engagés. Votre demande est prise, délai allongé. TERMINÉ.`, 1);
  }

  /** L'équipage s'arrête à distance et dit pourquoi. */
  waiting(call: CallRec, crew: Crew): void {
    if (!this.enabled) return;
    const from = this.callsign(crew, call.kind);
    const p = this.phrases();
    if (p && p.has('secours_attente_securisation') && p.say('secours_attente_securisation', {}, { from, at: call, personId: this.leadId(crew) })) return;
    const where = this.sector(crew.posX(), crew.posZ());
    this.say(from, `CENTRAL ICI ${spoken(from)}. Nous sommes arrêtés à la limite de la zone${where !== '' ? `, ${where}` : ''}. `
      + `Motif : ${call.waitingReason}. Nous attendons un itinéraire dégagé et une protection avant d’avancer. PARLEZ.`, 2, this.leadId(crew));
  }

  onScene(call: CallRec, crew: Crew): void {
    if (!this.enabled) return;
    const from = this.callsign(crew, call.kind);
    const p = this.phrases();
    if (p && p.has('secours_sur_place') && p.say('secours_sur_place', {}, { from, at: call, personId: this.leadId(crew) })) return;
    const where = this.sector(call.x, call.z);
    this.say(from, `CENTRAL ICI ${spoken(from)}. Secours sur place${where !== '' ? `, ${where}` : ''}. `
      + `${call.kind === 'pompiers' ? 'Établissement de la lance en cours.' : 'Prise en charge en cours.'} TERMINÉ.`, 1, this.leadId(crew));
  }

  fireOut(call: CallRec, crew: Crew): void {
    if (!this.enabled) return;
    const from = this.callsign(crew, call.kind);
    const p = this.phrases();
    if (p && p.has('pompiers_feu_eteint') && p.say('pompiers_feu_eteint', {}, { from, at: call, personId: this.leadId(crew) })) return;
    const where = this.sector(call.x, call.z);
    this.say(from, `CENTRAL ICI ${spoken(from)}. Feu éteint${where !== '' ? `, ${where}` : ''}. Nous surveillons les points chauds. PARLEZ.`, 1, this.leadId(crew));
  }

  evacuation(call: CallRec, crew: Crew, gravity: string): void {
    if (!this.enabled) return;
    const from = this.callsign(crew, call.kind);
    const p = this.phrases();
    if (p && p.has('secours_evacuation') && p.say('secours_evacuation', { gravite: gravity }, { from, at: call, personId: this.leadId(crew) })) return;
    const where = this.sector(call.x, call.z);
    this.say(from, `CENTRAL ICI ${spoken(from)}. Victime prise en charge, évacuation en cours${where !== '' ? ` depuis ${where}` : ''}. `
      + `Gravité : ${gravity}. PARLEZ.`, 1, this.leadId(crew));
  }

  leaving(call: CallRec, crew: Crew): void {
    if (!this.enabled) return;
    const from = this.callsign(crew, call.kind);
    const p = this.phrases();
    if (p && p.has('secours_termine') && p.say('secours_termine', {}, { from, at: call, personId: this.leadId(crew) })) return;
    const where = this.sector(call.x, call.z);
    this.say(from, `CENTRAL ICI ${spoken(from)}. Intervention terminée${where !== '' ? `, ${where}` : ''}. Nous quittons la zone. TERMINÉ.`, 1, this.leadId(crew));
  }

  retreat(call: CallRec, crew: Crew): void {
    const from = this.callsign(crew, call.kind);
    this.say(from, `CENTRAL ICI ${spoken(from)}. URGENT. Équipage pris à partie, nous nous replions. Demande protection avant de reprendre. PARLEZ.`,
      2, this.leadId(crew));
  }

  needSamu(call: CallRec, crew: Crew, gravity: string): void {
    const from = this.callsign(crew, call.kind);
    this.say(from, `CENTRAL ICI ${spoken(from)}. URGENT. Une victime dégagée, gravité ${gravity}. Demande SANTÉ sur place. PARLEZ.`, 2, this.leadId(crew));
  }

  /** Appel attribué à l'équipage du joueur. */
  toPlayer(callsign: string, label: string, urgent: boolean): void {
    this.say('CENTRAL', `${spoken(callsign)} ICI CENTRAL. ${urgent ? 'URGENT. ' : ''}${label}. Vous êtes engagé, rendez compte à l’arrivée. PARLEZ.`, urgent ? 2 : 1);
  }
}
