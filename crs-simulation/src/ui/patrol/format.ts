/* =====================================================================================
 * PATROUILLE (interface) — mise en forme des appels de CENTRAL et du compte rendu de vacation.
 * Fonctions pures (aucun DOM, aucun service) : carte d'appel du HUD, section « Appel en cours » de l'écran radio,
 * compte rendu de fin de vacation. Les appels eux-mêmes viennent du répartiteur (service 'patrol.mode',
 * src/gameplay/patrols/mode.ts).
 * ===================================================================================== */

import type { BackupKind, CallKind, CallState, DispatchCall, VacationSummary } from '@/gameplay/patrols/model';
import { NBSP, capitalize, distanceLabel, durationLabel, int } from '../core/format';

/** Titre de chaque nature d'appel, quand l'appel n'en porte pas (le feu précise d'ordinaire ce qui brûle). */
const KIND_TITLES: Readonly<Record<CallKind, string>> = {
  rassemblement: 'Rassemblement non déclaré',
  casseurs: 'Groupe de casseurs',
  blocage: 'Blocage de carrefour',
  manif_sauvage: 'Manifestation sauvage',
  feu: 'Feu sur la voie publique',
};

/** Toutes les natures d'appel (ordre d'affichage). */
export const CALL_KIND_LIST: readonly CallKind[] = ['rassemblement', 'casseurs', 'blocage', 'manif_sauvage', 'feu'];

/** Titre de la carte d'appel, en capitales : « RASSEMBLEMENT NON DÉCLARÉ », « FEU DE VÉHICULE ». */
export function callTitle(kind: CallKind, label = ''): string {
  const text = label.trim() !== '' ? label.trim() : KIND_TITLES[kind] ?? 'Appel de CENTRAL';
  return text.toLocaleUpperCase('fr-FR');
}

/**
 * Ligne de la carte d'appel : « Place de l'Opéra · ~120 pers. · 1,4 km ».
 * Distance en mètres sous 1 km, en kilomètres avec une virgule au-delà ; « ~ » devant l'effectif estimé (aucun pour un feu).
 */
export function callLine(call: Pick<DispatchCall, 'place' | 'people'>, distance: number): string {
  const parts: string[] = [];
  const place = (call.place || '').trim();
  parts.push(place !== '' ? capitalize(place) : 'Lieu à préciser');
  if (Number.isFinite(call.people) && call.people > 0) parts.push(`~${int(call.people)}${NBSP}pers.`);
  if (Number.isFinite(distance) && distance >= 0) parts.push(distanceLabel(distance));
  return parts.join(' · ');
}

/** Libellé court de l'état d'un appel (bandeau de la carte, compte rendu). */
export function stateLabel(state: CallState): string {
  switch (state) {
    case 'annonce': return 'Appel de CENTRAL';
    case 'acceptee': return 'En route';
    case 'sur_place': return 'Sur place';
    case 'confiee': return 'Confié à une autre patrouille';
    case 'declinee': return 'Décliné';
    case 'terminee': return 'Terminé';
    default: return 'Appel';
  }
}

/** Libellé d'un renfort (boutons). */
export const BACKUP_LABELS: Readonly<Record<BackupKind, string>> = {
  patrouille: 'Patrouille',
  compagnie: 'Compagnie de CRS',
  pompiers: 'Pompiers',
  samu: 'SAMU',
};

export const BACKUP_KINDS: readonly BackupKind[] = ['patrouille', 'compagnie', 'pompiers', 'samu'];

export interface BackupOption {
  kind: BackupKind;
  label: string;
  /** Demande possible maintenant. */
  available: boolean;
  /** Pourquoi elle ne l'est pas (infobulle, « demandé »…) ; '' si disponible. */
  reason: string;
}

/**
 * Renforts proposés pour un appel tenu par l'équipage (mêmes règles que PatrolModeApi.requestBackup) :
 * un renfort déjà demandé ne se redemande pas ; la compagnie de CRS ne vient que sur un rassemblement ou une
 * manifestation sauvage, et une seule à la fois pour toute la vacation.
 */
export function backupOptions(call: DispatchCall, calls: readonly DispatchCall[]): BackupOption[] {
  const mine = call.state === 'acceptee' || call.state === 'sur_place';
  const companyBusy = calls.some((c) => c.id !== call.id && c.state !== 'terminee' && c.backup.indexOf('compagnie') >= 0);
  return BACKUP_KINDS.map((kind) => {
    let reason = '';
    if (!mine) reason = 'Prenez d’abord l’appel';
    else if (call.backup.indexOf(kind) >= 0) reason = 'Déjà demandé';
    else if (kind === 'compagnie' && call.kind !== 'rassemblement' && call.kind !== 'manif_sauvage') reason = 'Seulement pour un rassemblement ou une manifestation sauvage';
    else if (kind === 'compagnie' && companyBusy) reason = 'Une compagnie est déjà engagée sur un autre appel';
    return { kind, label: BACKUP_LABELS[kind], available: reason === '', reason };
  });
}

/** Message affiché quand la salle refuse une demande de renfort (aucune patrouille libre, service indisponible…). */
export function backupRefused(kind: BackupKind): string {
  switch (kind) {
    case 'patrouille': return 'Aucune patrouille libre pour l’instant.';
    case 'compagnie': return 'Aucune compagnie de CRS disponible pour cet appel.';
    case 'pompiers': return 'Les sapeurs-pompiers ne sont pas joignables.';
    case 'samu': return 'Le SAMU n’est pas joignable.';
    default: return 'Demande impossible.';
  }
}

export interface SummaryLine {
  label: string;
  value: string;
  /** Précision affichée sous la valeur ('' : aucune). */
  note: string;
}

function count(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Les sept lignes du compte rendu de vacation : durée, appels reçus, pris, réglés, confiés, interpellations, blessés.
 * Les valeurs absentes ou invalides comptent pour zéro (jamais « NaN »).
 */
export function summaryLines(s: Partial<VacationSummary> | null | undefined): SummaryLine[] {
  const v = s ?? {};
  const duration = Number.isFinite(v.duration) && (v.duration ?? 0) > 0 ? v.duration! : 0;
  const calls = count(v.calls ?? 0);
  const accepted = count(v.accepted ?? 0);
  const resolved = count(v.resolved ?? 0);
  const delegated = count(v.delegated ?? 0);
  const declined = count(v.declined ?? 0);
  const arrests = count(v.arrests ?? 0);
  const injured = count(v.injured ?? 0);
  const backups = count(v.backups ?? 0);
  return [
    { label: 'Durée de la vacation', value: durationLabel(duration), note: '' },
    { label: 'Appels reçus', value: int(calls), note: '' },
    { label: 'Appels pris', value: int(accepted), note: backups > 0 ? `${int(backups)} ${backups > 1 ? 'demandes' : 'demande'} de renfort` : '' },
    { label: 'Appels réglés', value: int(resolved), note: '' },
    { label: 'Appels confiés à d’autres patrouilles', value: int(delegated), note: declined > 0 ? `dont ${int(declined)} ${declined > 1 ? 'déclinés' : 'décliné'}` : '' },
    { label: 'Interpellations', value: int(arrests), note: '' },
    { label: 'Blessés', value: int(injured), note: '' },
  ];
}

/** Titre du compte rendu : « Fin de vacation — BAC 75N ». */
export function debriefTitle(callsign: string): string {
  const cs = (callsign || '').trim();
  return cs !== '' ? `Fin de vacation — ${cs}` : 'Fin de vacation';
}

/** Ligne d'un appel dans le compte rendu : « Rassemblement non déclaré — place de l'Opéra ». */
export function callRecap(call: Pick<DispatchCall, 'kind' | 'label' | 'place'>): string {
  const label = call.label.trim() !== '' ? call.label.trim() : KIND_TITLES[call.kind] ?? 'Appel';
  const place = (call.place || '').trim();
  return place !== '' ? `${label} — ${place}` : label;
}

/** Issue d'un appel pour le compte rendu (« Réglé par l'équipage », « Confié à TV 75-03 »…). */
export function callOutcome(call: Pick<DispatchCall, 'state' | 'assignedTo'>, callsign: string): string {
  const who = (call.assignedTo || '').trim();
  switch (call.state) {
    case 'terminee':
      if (who === '') return 'Terminé';
      return who === callsign.trim() ? `Traité par votre équipage (${who})` : `Traité par ${who}`;
    case 'confiee': return who !== '' ? `Confié à ${who}` : 'Confié à une autre patrouille';
    case 'declinee': return 'Décliné, resté sans équipage';
    case 'acceptee': return 'En cours à la fin de la vacation';
    case 'sur_place': return 'Sur place à la fin de la vacation';
    case 'annonce': return 'Sans réponse à la fin de la vacation';
    default: return stateLabel(call.state);
  }
}
