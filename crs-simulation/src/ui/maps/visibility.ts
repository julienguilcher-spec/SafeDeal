/* =====================================================================================
 * Ce que chaque rôle peut légitimement voir sur une carte (logique pure).
 *
 * Forces de l'ordre : tout (leurs unités, la foule vue par le commandement et le drone, incidents,
 * fermetures). Secours officiels : ils travaillent sous protection de la police, ils en voient donc
 * le dispositif, mais seulement les incidents qui les concernent. Manifestant, journaliste,
 * secouriste de rue : JAMAIS les positions de police ; la foule, le gaz et les incidents seulement
 * dans leur champ de perception ; le parcours déclaré et le métro, qui sont publics.
 * ===================================================================================== */

import type { GameContext, PlayableRole, RadioChannel } from '@/core/contracts';
import type { IncidentKind } from '@/core/extensions';
import type { MapVisibility } from './api';

/** Rayon de perception d'un civil à pied (m). */
export const NEAR_RADIUS = 150;

const POLICE_RADIO: readonly RadioChannel[] = ['commandement', 'unite', 'secours'];

const POLICE_VIEW: MapVisibility = {
  police: true, rescue: true, crowd: 'full', hazards: 'full', incidents: 'all', closures: true, metro: true,
  route: true, objectives: true, nearRadius: NEAR_RADIUS, radio: POLICE_RADIO,
};

const VIEWS: Readonly<Record<PlayableRole, MapVisibility>> = {
  crs: POLICE_VIEW,
  chef_groupe: POLICE_VIEW,
  commandant: POLICE_VIEW,
  commissaire: POLICE_VIEW,
  bravm: POLICE_VIEW,
  gendarme_centaure: POLICE_VIEW,
  operateur_canon_eau: POLICE_VIEW,
  telepilote: POLICE_VIEW,
  secouriste: {
    police: true, rescue: true, crowd: 'full', hazards: 'full', incidents: 'secours', closures: true, metro: true,
    route: true, objectives: true, nearRadius: NEAR_RADIUS, radio: ['secours'],
  },
  street_medic: {
    police: false, rescue: false, crowd: 'near', hazards: 'near', incidents: 'near', closures: false, metro: true,
    route: true, objectives: true, nearRadius: NEAR_RADIUS, radio: ['public'],
  },
  journaliste: {
    police: false, rescue: false, crowd: 'near', hazards: 'near', incidents: 'near', closures: true, metro: true,
    route: true, objectives: true, nearRadius: NEAR_RADIUS, radio: ['presse', 'public'],
  },
  manifestant: {
    police: false, rescue: false, crowd: 'near', hazards: 'near', incidents: 'none', closures: false, metro: true,
    route: true, objectives: true, nearRadius: NEAR_RADIUS, radio: ['public'],
  },
};

/** Visibilité des couches de carte pour un rôle (objet partagé : ne pas le modifier). */
export function visibilityFor(role: PlayableRole): MapVisibility {
  return VIEWS[role] ?? VIEWS.manifestant;
}

/** Le rôle appartient-il aux forces de l'ordre ? */
export function isPoliceRole(role: PlayableRole): boolean {
  return VIEWS[role] === POLICE_VIEW;
}

/** Incidents qui concernent les secours officiels. */
const RESCUE_KINDS: ReadonlySet<IncidentKind> = new Set<IncidentKind>([
  'feu_poubelle', 'feu_barricade', 'feu_vehicule', 'feu_boutique', 'blesse', 'agent_a_terre', 'secours_bloques',
  'automobiliste_bloque',
]);
/** Incidents qu'un civil remarque quand ils sont près de lui. */
const WITNESS_KINDS: ReadonlySet<IncidentKind> = new Set<IncidentKind>([
  'feu_poubelle', 'feu_barricade', 'feu_vehicule', 'feu_boutique', 'blesse', 'barricade', 'pillage',
]);

/** Cet incident est-il visible pour ce rôle, le joueur étant à `distance` mètres ? */
export function incidentVisible(vis: MapVisibility, kind: IncidentKind, distance: number): boolean {
  switch (vis.incidents) {
    case 'all': return true;
    case 'secours': return RESCUE_KINDS.has(kind);
    case 'near': return WITNESS_KINDS.has(kind) && distance <= vis.nearRadius;
    default: return false;
  }
}

/**
 * Commandant à pied, loin de son véhicule de commandement : il ne voit que ce que les unités rapportent (foule et
 * dangers autour de lui et de ses unités, sans l'image du drone). Au véhicule, ou en salle de commandement : tout.
 */
const COMMANDER_FIELD_VIEW: MapVisibility = { ...POLICE_VIEW, crowd: 'near', hazards: 'near', nearRadius: 220 };

interface CommandPostLike { readonly atVehicle: boolean; readonly lost: boolean }

/** Le joueur commandant est-il privé de la carte complète (à pied, loin du véhicule, ou poste perdu) ? */
export function commanderOffPost(ctx: GameContext): boolean {
  const role = ctx.player.state.role;
  if (role !== 'commandant' && role !== 'commissaire') return false;
  const cfg = ctx.session.config;
  if (cfg && cfg.extra && cfg.extra['variante'] === 'salle') return false;
  const post = ctx.service<CommandPostLike>('command.post');
  if (!post) return false;
  return post.lost || !post.atVehicle;
}

/** Visibilité du joueur, compte tenu de son poste de commandement. */
export function visibilityForContext(ctx: GameContext): MapVisibility {
  return commanderOffPost(ctx) ? COMMANDER_FIELD_VIEW : visibilityFor(ctx.player.state.role);
}
