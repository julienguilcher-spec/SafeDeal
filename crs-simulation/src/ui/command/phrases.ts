/* =====================================================================================
 * Phraséologie radio des messages émis par le joueur (logique pure) : gabarit « APPELÉ ICI
 * APPELANT. Corps. PARLEZ. », chiffres dits un par un sauf les milliers ronds, points cardinaux.
 * Indicatifs fictifs (docs/research/00-bible-realisme.md, E.5 à E.7).
 * ===================================================================================== */

import type { CrowdPhase, ForceLevel, OrderType } from '@/core/contracts';
import type { RescueKind } from '@/core/extensions';

const DIGITS = ['ZÉRO', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF'];

/** Nombre épelé pour la radio : 45 → « QUATRE-CINQ », 5000 → « CINQ MILLE », 300 → « TROIS-ZÉRO-ZÉRO ». */
export function spellNumber(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1000 && v % 1000 === 0) {
    const k = v / 1000;
    return (k < 10 ? DIGITS[k]! : spellNumber(k)) + ' MILLE';
  }
  const s = String(v);
  const parts: string[] = [];
  for (let i = 0; i < s.length; i++) parts.push(DIGITS[s.charCodeAt(i) - 48]!);
  return parts.join('-');
}

/** Arrondi « de compte rendu » : 0, 10, 20, 50, 100, 150, 200, 300, 500, 1 000… */
export function roundVolume(n: number): number {
  if (n < 8) return Math.round(n);
  if (n < 30) return Math.round(n / 5) * 5;
  if (n < 100) return Math.round(n / 10) * 10;
  if (n < 400) return Math.round(n / 50) * 50;
  if (n < 2000) return Math.round(n / 100) * 100;
  return Math.round(n / 500) * 500;
}

const CARDINALS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];

/** Point cardinal vers lequel un cap fait face (cap 0 = sud, π = nord, π/2 = est). */
export function facingCardinal(heading: number): string {
  // cap boussole : 0 = nord, sens horaire
  const bearing = Math.atan2(Math.sin(heading), -Math.cos(heading));
  const idx = ((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8;
  return CARDINALS[idx]!;
}

/** Gabarit d'un message. `expectReply` : « PARLEZ » (réponse attendue) ou « TERMINÉ ». */
export function radioFrame(to: string, from: string, body: string, expectReply = true): string {
  // on ne resserre que les espaces ordinaires : les espaces insécables de la typographie sont conservées
  const text = body.trim().replace(/[ \t\r\n]+/g, ' ');
  const dot = /[.!?]$/.test(text) ? '' : '.';
  return `${to.toUpperCase()} ICI ${from.toUpperCase()}. ${text}${dot} ${expectReply ? 'PARLEZ.' : 'TERMINÉ.'}`;
}

export interface OrderPhraseInput {
  type: OrderType;
  /** Indicatif de l'unité qui reçoit l'ordre et de celui qui le donne. */
  unit: string;
  from: string;
  /** Nom du secteur du point désigné ('' si inconnu). */
  sector: string;
  heading: number;
  width: number;
  /** Distance de l'unité au point désigné (m). */
  distance: number;
  /** Nom de la cible éventuelle (unité à protéger, à escorter…). */
  target: string;
}

function at(sector: string): string {
  return sector !== '' ? `, ${sector}` : '';
}

/** Message radio accompagnant un ordre donné depuis la carte tactique ou la roue d'ordres. */
export function orderPhrase(o: OrderPhraseInput): string {
  const d = spellNumber(roundVolume(Math.max(5, o.distance)));
  let body: string;
  switch (o.type) {
    case 'tenir': body = `Tenez la position${at(o.sector)}`; break;
    case 'ligne':
      body = `Ligne de barrage${at(o.sector)}, face ${facingCardinal(o.heading)}` +
        (o.width >= 3 ? `, front ${spellNumber(Math.round(o.width))} mètres` : '');
      break;
    case 'colonne': body = `En colonne, rejoignez le point${at(o.sector)}`; break;
    case 'tortue': body = 'Formez la tortue, boucliers hauts'; break;
    case 'avancer': body = `En avant${at(o.sector)}, ${d} mètres, puis halte`; break;
    case 'bond_offensif': body = `Bond offensif, ${d} mètres, en avant, puis halte et réalignement`; break;
    case 'charge': body = `Chargez${o.sector !== '' ? ` jusqu’à ${o.sector}` : ''}, arrêt au sifflet`; break;
    case 'refoulement': body = `Refoulement${o.sector !== '' ? `, limite ${o.sector}` : ''}, par bonds. Issue libre devant la foule`; break;
    case 'repli': body = `Rompez le contact, repli par échelons${at(o.sector)}`; break;
    case 'encercler':
      body = `Bouclage${at(o.sector)}, rayon ${spellNumber(Math.round(o.width / 2))} mètres. Sortie contrôlée laissée ouverte face ${facingCardinal(o.heading)}, annonce aux personnes retenues`;
      break;
    case 'disperser_gaz': body = `Lacrymogènes${at(o.sector)}, tir courbe, sur mon ordre`; break;
    case 'interpeller': body = `Interpellez l’objectif désigné${at(o.sector)}, sur fait constaté`; break;
    case 'proteger': body = `Protégez ${o.target !== '' ? o.target : 'le point'}${at(o.sector)}`; break;
    case 'escorter': body = `Escortez ${o.target !== '' ? o.target : 'l’élément désigné'}`; break;
    case 'suivre': body = `Suivez ${o.target !== '' ? o.target : 'mon mouvement'}`; break;
    case 'embarquer': body = 'Embarquez'; break;
    case 'debarquer': body = 'Débarquez et mettez-vous en place'; break;
    case 'degager_barricade': body = `Vérifiez l’obstacle, puis dégagez la barricade${at(o.sector)}`; break;
    case 'cesser': body = 'Halte à l’action en cours'; break;
    case 'libre': body = 'Reprenez votre mission, initiative laissée'; break;
    default: body = `Exécutez\u00a0: ${String(o.type)}`;
  }
  return radioFrame(o.unit, o.from, body, true);
}

const ATTITUDES: Readonly<Record<CrowdPhase, string>> = {
  aucune: 'rien à signaler', rassemblement: 'rassemblement en cours, calme', depart: 'cortège au départ, calme',
  cortege: 'cortège en marche', tension: 'tendue', affrontement: 'hostile, jets de projectiles', dispersion: 'dispersion en cours',
  apres_manif: 'groupes épars', terminee: 'chaussée libre',
};

export interface SituationInput {
  from: string;
  sector: string;
  phase: CrowdPhase;
  /** Personnes de la foule à vue (dans 150 m). */
  volume: number;
  /** Tension locale 0..1. */
  tension: number;
}

/** Compte rendu de situation : nature, volume, attitude. */
export function situationReport(s: SituationInput): string {
  const volume = roundVolume(s.volume);
  let attitude = ATTITUDES[s.phase] ?? 'calme';
  if (s.phase === 'cortege' || s.phase === 'rassemblement' || s.phase === 'depart') {
    attitude = s.tension > 0.66 ? 'hostile' : s.tension > 0.33 ? 'tendue' : 'calme';
  }
  const nature = volume === 0 ? 'aucun rassemblement à vue' : s.phase === 'cortege' || s.phase === 'depart' ? 'cortège' : 'attroupement';
  const body = volume === 0
    ? `Position ${s.sector || 'inconnue'}. Nature\u00a0: ${nature}. Rien à signaler`
    : `Position ${s.sector || 'inconnue'}. Nature\u00a0: ${nature}. Volume\u00a0: ${spellNumber(volume)}. Attitude\u00a0: ${attitude}`;
  return radioFrame('CENTRAL', s.from, body, true);
}

export function reinforcementRequest(from: string, sector: string): string {
  return radioFrame('CENTRAL', from, `Demande renfort sur ma position${at(sector)}`, true);
}

/** Demande au commandant (autorité unique, indicatif de la compagnie : « MISTRAL » par défaut). */
export function forceRequest(from: string, sector: string, level: ForceLevel, underAttack: boolean, commander = 'MISTRAL'): string {
  const motif = underAttack ? 'Jets de projectiles sur l’unité, refus de se disperser' : 'Attroupement, refus de se disperser';
  const ask = level >= 3 ? 'Demande sommations et emploi de la force, lacrymogènes compris' : 'Demande sommations et emploi de la force';
  return radioFrame(commander.toUpperCase(), from, `${motif}${at(sector)}. ${ask}`, true);
}

export function rescueRequest(from: string, sector: string, kind: RescueKind): string {
  const who = kind === 'pompiers' ? 'les sapeurs-pompiers' : 'SANTÉ';
  return radioFrame('CENTRAL', from, `URGENT. Demande ${who} sur place${at(sector)}. Je sécurise l’accès`, true);
}

/** Heure d'un message du journal : temps de session (s) → « 12:34 ». */
export function logTime(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m < 10 ? '0' : ''}${m}:${r < 10 ? '0' : ''}${r}`;
}
