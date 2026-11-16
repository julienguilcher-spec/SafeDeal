/* =====================================================================================
 * COMMANDEMENT — messages radio du commandant, de son adjoint et des moyens spéciaux
 * (phraséologie : docs/research/00-bible-realisme.md §E.6 et §E.7 — « APPELÉ ICI APPELANT. Corps.
 * PARLEZ / TERMINÉ », chiffres dits un par un, compte rendu « nature, volume, attitude »).
 * Tous les indicatifs sont fictifs (§E.5).
 * ===================================================================================== */

import type { ForceLevel, OrderType } from '@/core/contracts';
import { cardinalFr } from '@/core/math';
import { frame, spell } from '../radio';
import type { HotKind } from './api';

export { frame, spell };

export const CENTRAL = 'CENTRAL';

function at(sector: string): string {
  return sector !== '' ? ', ' + sector : '';
}

/** Volume arrondi « à l'estime » pour un compte rendu : 37 → 40, 240 → 250. */
export function estimate(n: number): number {
  if (n < 10) return Math.max(0, Math.round(n));
  if (n < 100) return Math.round(n / 10) * 10;
  return Math.round(n / 50) * 50;
}

/** Désignation d'un point chaud dans une phrase : « groupe hostile en formation », « jets de projectiles »… */
export function hotLabel(kind: HotKind, againstPolice: boolean): string {
  switch (kind) {
    case 'violences': return againstPolice ? 'violences sur les unités' : 'jets de projectiles';
    case 'casse': return 'dégradations en cours';
    case 'feu': return 'départ de feu';
    case 'barricade': return 'barricade en cours de montage';
    case 'compression': return 'densité critique';
    default: return 'groupe hostile en formation';
  }
}

/** Ordre de mise en place d'un barrage latéral. */
export function orderBarrage(to: string, from: string, street: string, heading: number, cut: boolean): string {
  return frame(to, from, 'Barrage ' + (street !== '' ? street : 'sur la voie désignée') + ', face ' + cardinalFr(heading)
    + (cut ? '. Coupez la circulation' : '') + '. Riposte directe seulement', true);
}

export function orderSite(to: string, from: string, site: string): string {
  return frame(to, from, 'Protégez ' + (site !== '' ? site : 'le site désigné') + ', tenez à distance, riposte directe seulement', true);
}

export function orderReserve(to: string, from: string, sector: string): string {
  return frame(to, from, 'Vous êtes en réserve' + at(sector) + ', prêt à intervenir sur court préavis', true);
}

export function deployed(from: string, posts: number, held: number, barriers: number, reserve: string): string {
  let body = 'Dispositif en place : ' + spell(held) + (held > 1 ? ' barrages tenus' : ' barrage tenu');
  if (barriers > 0) body += ', ' + spell(barriers) + (barriers > 1 ? ' rues fermées par barrières' : ' rue fermée par barrières');
  if (posts > held + barriers) body += ', ' + spell(posts - held - barriers) + ' débouchés en attente';
  if (reserve !== '') body += ', ' + reserve + ' en réserve';
  return frame(CENTRAL, from, body, true);
}

export function roadClosed(from: string, street: string, ahead: boolean): string {
  return frame(CENTRAL, from, 'Je coupe la circulation ' + (street !== '' ? street : 'sur la voie latérale') + (ahead ? ', en avance du cortège' : ''), false);
}

export function stationClosed(from: string, station: string): string {
  return frame(CENTRAL, from, 'Renforts hostiles par le métro. Demande fermeture de la station ' + station + '. PARLEZ.', false).replace(' TERMINÉ.', '');
}

export function stationReopened(from: string, station: string): string {
  return frame(CENTRAL, from, 'Dispersion en cours : rouvrez la station ' + station + ' pour laisser partir la foule', false);
}

export function situation(from: string, kind: HotKind, againstPolice: boolean, sector: string, volume: number): string {
  let body = 'Nature : ' + hotLabel(kind, againstPolice) + at(sector);
  if (volume > 0) body += '. Volume : ' + spell(estimate(volume));
  body += '. Attitude : ' + (kind === 'violences' ? 'hostile' : kind === 'groupe_hostile' ? 'regroupement, préparatifs' : 'agitée');
  return frame(CENTRAL, from, body, true);
}

export function riposte(from: string, sector: string): string {
  return frame(CENTRAL, from, 'Violences sur l’unité' + at(sector) + '. J’emploie la force d’initiative, cadre violences et voies de fait. Avertissement fait à la foule', true);
}

export function approachContact(from: string, sector: string): string {
  return frame(CENTRAL, from, 'Je constate l’attroupement' + at(sector) + ' et je me porte au contact pour les sommations. Aucun emploi de la force avant mon ordre', false);
}

export function forceAuthorized(from: string, level: ForceLevel, limit: string): string {
  const what = level >= 4 ? 'Usage des armes autorisé : lanceurs, tir courbe' : 'Emploi de la force autorisé : refoulement, lacrymogènes à main';
  return frame('À TOUS', from, what + (limit !== '' ? '. Limite : ' + limit : ''), false);
}

export function haltForce(from: string): string {
  return frame('À TOUS', from, 'Halte à l’emploi de la force : le trouble a cessé', false);
}

/** Corps d'un ordre de force donné à une unité. */
export function orderForce(to: string, from: string, type: OrderType, sector: string, meters: number, count: number): string {
  let body: string;
  switch (type) {
    case 'bond_offensif': body = 'Bond offensif, ' + spell(Math.round(meters / 5) * 5) + ' mètres, en avant, puis halte et réalignement'; break;
    case 'disperser_gaz': body = count > 0 ? 'Salve de ' + spell(count) + ', zone ' + (sector !== '' ? sector : 'désignée') + ', tir courbe' : 'Lacrymogènes à main sur la zone' + at(sector); break;
    case 'refoulement': body = 'Refoulement' + (sector !== '' ? ', limite ' + sector : '') + ', par bonds de CINQ-ZÉRO mètres. Issue libre devant la foule'; break;
    case 'interpeller': body = 'Objectif désigné' + at(sector) + '. Interpellez sur fait constaté'; break;
    case 'degager_barricade': body = 'Vérifiez l’obstacle, puis dégagez la barricade' + at(sector); break;
    case 'eteindre': body = 'Éteignez le feu' + at(sector); break;
    case 'secourir': body = 'Blessé à terre' + at(sector) + '. Allez le chercher, deux boucliers en couverture'; break;
    case 'releve': body = 'Relevez sur place, passage de ligne'; break;
    case 'ravitailler': body = 'Ravitaillez aux véhicules'; break;
    case 'proteger': body = 'Couvrez l’élément désigné' + at(sector); break;
    case 'filtrer': body = 'Barrage filtrant, une porte : laissez sortir la foule'; break;
    case 'colonne': body = 'En colonne' + (sector !== '' ? ' vers ' + sector : ' vers le point désigné'); break;
    case 'ligne': body = 'En ligne' + at(sector); break;
    case 'repli': body = 'Rompez le contact, repli' + at(sector); break;
    case 'embarquer': body = 'Embarquez'; break;
    default: body = 'Exécutez l’ordre transmis'; break;
  }
  return frame(to, from, body, true);
}

export function dispersion(from: string): string {
  return frame('À TOUS', from, 'Les organisateurs annoncent la dispersion. Barrages filtrants, laissez sortir, aucune manœuvre de force', false);
}

export function regroup(from: string, sector: string): string {
  return frame('À TOUS', from, 'Dispersion effective, chaussée libre. Fin d’emploi de la force. Regroupement aux véhicules' + at(sector), false);
}

export function missionEnd(from: string, embarked: number, arrests: number): string {
  let body = 'Fin de mission, retour à la base';
  if (embarked > 0) body += '. ' + spell(embarked) + ' à bord';
  if (arrests > 0) body += ', ' + spell(arrests) + (arrests > 1 ? ' interpellés remis' : ' interpellé remis');
  return frame(CENTRAL, from, body, false);
}

// ───────────────────────────── adjoint ─────────────────────────────

/** Proposition de l'adjoint au joueur-commandant : « Chef, … je propose … ». */
export function propose(observation: string, proposal: string): string {
  return 'Chef, ' + observation + (proposal !== '' ? ', je propose ' + proposal : '') + '.';
}

// ───────────────────────────── moyens spéciaux ─────────────────────────────

export function received(from: string, body: string): string {
  return 'ICI ' + from.toUpperCase().replace(/\d+/g, (d) => spell(Number(d))) + '. REÇU, ' + body + '. TERMINÉ.';
}

export function refused(from: string, body: string): string {
  return 'ICI ' + from.toUpperCase().replace(/\d+/g, (d) => spell(Number(d))) + '. NÉGATIF. ' + body + '. TERMINÉ.';
}

export function report(to: string, from: string, body: string): string {
  return frame(to, from, body, true);
}
