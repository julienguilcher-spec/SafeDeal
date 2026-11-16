/* =====================================================================================
 * Étendue du commandement selon le rôle et le grade du joueur (logique sans DOM).
 *
 *   commissaire, commandant (rôle ou grade)  → tout le dispositif des forces de l'ordre ;
 *   chef de groupe (ou gradé à la tête d'une unité) → son unité et ses subordonnées ;
 *   tous les autres                          → lecture seule.
 * Les sommations n'appartiennent qu'à l'autorité habilitée (écharpe tricolore), quel que soit le grade.
 * ===================================================================================== */

import type { GameContext, Person, PlayableRole, PoliceRank, Squad } from '@/core/contracts';
import { isAuthority } from '@/core/null-services';
import type { CommandScope } from './api';

const RANK_LEVEL: Readonly<Record<PoliceRank, number>> = {
  gardien_stagiaire: 0, gardien: 1, brigadier: 2, brigadier_chef: 3, major: 4, capitaine: 5, commandant: 6, commissaire: 7,
};

const ROLE_LABELS: Readonly<Record<PlayableRole, string>> = {
  crs: 'CRS', chef_groupe: 'Chef de groupe', commandant: 'Commandant', commissaire: 'Commissaire', bravm: 'BRAV-M',
  gendarme_centaure: 'Équipage du Centaure', operateur_canon_eau: 'Opérateur du canon à eau', telepilote: 'Télépilote',
  street_medic: 'Secouriste de rue', secouriste: 'Secours', journaliste: 'Journaliste', manifestant: 'Manifestant',
};

const POLICE_ROLES: ReadonlySet<PlayableRole> = new Set<PlayableRole>([
  'crs', 'chef_groupe', 'commandant', 'commissaire', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote',
]);

export function roleLabel(role: PlayableRole): string {
  return ROLE_LABELS[role] ?? role;
}

const EMPTY: ReadonlySet<number> = new Set<number>();

/** Ajoute l'unité et toutes ses subordonnées. */
function addWithChildren(ctx: GameContext, squad: Squad, out: Set<number>): void {
  if (out.has(squad.id)) return;
  out.add(squad.id);
  const kids = ctx.squads.childrenOf(squad.id);
  for (let i = 0; i < kids.length; i++) addWithChildren(ctx, kids[i]!, out);
}

/** Unité la plus haute que cette personne commande en remontant depuis la sienne (null si elle n'en commande aucune). */
function highestLed(ctx: GameContext, p: Person): Squad | null {
  let squad = p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
  let best: Squad | null = null;
  for (let guard = 0; squad && guard < 8; guard++) {
    if (squad.leaderId === p.id) best = squad;
    else if (best) break;
    squad = squad.parentId !== 0 ? ctx.squads.get(squad.parentId) : undefined;
  }
  if (best) return best;
  // chef d'une unité dont il n'est pas membre direct (cas d'un poste de commandement à part)
  const list = ctx.squads.list;
  for (let i = 0; i < list.length; i++) if (list[i]!.leaderId === p.id) return list[i]!;
  return null;
}

/** Calcule l'étendue du commandement du joueur à cet instant. */
export function computeScope(ctx: GameContext): CommandScope {
  const st = ctx.player.state;
  const role = st.role;
  const p = st.personId !== 0 ? ctx.people.get(st.personId) ?? null : null;
  const police = POLICE_ROLES.has(role) && (!p || p.faction === 'police');
  const rank = p && p.rank ? RANK_LEVEL[p.rank] ?? -1 : -1;
  const canSommation = p !== null && police && isAuthority(p);
  const readOnly = (label: string): CommandScope => ({
    level: 'lecture', squadIds: EMPTY, ownSquadId: p ? p.squadId : 0, canAuthorize: false, canSommation,
    canTraffic: false, canMetro: false, canDelegate: false, label,
  });
  if (!police) return readOnly(`${roleLabel(role)} — lecture seule`);

  if (role === 'commandant' || role === 'commissaire' || rank >= RANK_LEVEL.commandant) {
    const ids = new Set<number>();
    const list = ctx.squads.list;
    for (let i = 0; i < list.length; i++) if (list[i]!.faction === 'police') ids.add(list[i]!.id);
    const led = p ? highestLed(ctx, p) : null;
    return {
      level: 'tout', squadIds: ids, ownSquadId: led ? led.id : p ? p.squadId : 0, canAuthorize: true, canSommation,
      canTraffic: true, canMetro: true, canDelegate: true,
      label: `${roleLabel(role === 'commissaire' ? 'commissaire' : 'commandant')} — tout le dispositif`,
    };
  }

  if (p && (role === 'chef_groupe' || rank >= RANK_LEVEL.brigadier_chef)) {
    const led = highestLed(ctx, p);
    // un chef de groupe sans unité à sa tête commande au moins celle dont il fait partie
    const unit = led ?? (role === 'chef_groupe' && p.squadId !== 0 ? ctx.squads.get(p.squadId) ?? null : null);
    if (unit && unit.faction === 'police') {
      const ids = new Set<number>();
      addWithChildren(ctx, unit, ids);
      return {
        level: 'unite', squadIds: ids, ownSquadId: unit.id, canAuthorize: false, canSommation, canTraffic: true,
        canMetro: false, canDelegate: true, label: `${roleLabel('chef_groupe')} — ${unit.name}`,
      };
    }
  }
  return readOnly(`${roleLabel(role)} — lecture seule`);
}
