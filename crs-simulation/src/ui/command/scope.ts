/* =====================================================================================
 * Étendue du commandement selon le rôle et le grade du joueur (logique sans DOM).
 *
 *   commissaire, commandant (rôle ou grade)  → tout le dispositif des forces de l'ordre ;
 *   chef de groupe (ou gradé à la tête d'une unité) → son unité et ses subordonnées (« Chef de section — MISTRAL 1 »,
 *                                               « Chef de la BRAV-M — FAUCON 1 ») ;
 *   chef de bord d'une patrouille            → lecture seule, mais ses deux collègues lui obéissent (`crew`) : avec
 *                                               vous, interpeller, secours, l'interpellé (spécification §1.4, §4.3) ;
 *   tous les autres                          → lecture seule.
 * Les sommations n'appartiennent qu'à l'autorité habilitée (écharpe tricolore), quel que soit le grade.
 * ===================================================================================== */

import type { GameContext, Person, PlayableRole, PoliceRank, Squad } from '@/core/contracts';
import { isAuthority } from '@/core/null-services';
import type { CommandScope } from './api';
import { commanderOffPost } from '../maps/visibility';

const RANK_LEVEL: Readonly<Record<PoliceRank, number>> = {
  gardien_stagiaire: 0, gardien: 1, brigadier: 2, brigadier_chef: 3, major: 4, capitaine: 5, commandant: 6, commissaire: 7,
};

const ROLE_LABELS: Readonly<Record<PlayableRole, string>> = {
  crs: 'CRS', chef_groupe: 'Chef de groupe', commandant: 'Commandant', commissaire: 'Commissaire', bravm: 'BRAV-M',
  gendarme_centaure: 'Équipage du Centaure', operateur_canon_eau: 'Opérateur du canon à eau', telepilote: 'Télépilote',
  patrouille: 'Équipage de patrouille', street_medic: 'Secouriste de rue', secouriste: 'Secours', journaliste: 'Journaliste', manifestant: 'Manifestant',
};

const POLICE_ROLES: ReadonlySet<PlayableRole> = new Set<PlayableRole>([
  'crs', 'chef_groupe', 'commandant', 'commissaire', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote',
  'patrouille',
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
  // équipage de patrouille (BAC, Police secours), chef de bord compris : il ne commande que les deux collègues de sa
  // voiture, assis avec lui. Ses ordres sont « Suivez-moi à pied / en véhicules » (bloc « ORDRES », roue : permis en
  // lecture seule, voir CommandCore.check) et les renforts passent par CENTRAL (carte d'appel). La carte de commandement
  // lui proposait sinon d'envoyer « en véhicules, à 800 m » barrer une rue ou disperser une foule… son propre équipage,
  // dans la voiture où il est assis : il a la carte en lecture seule, cadrée sur lui et sur l'appel.
  // Chef de bord : ses deux collègues lui obéissent pour ce qu'un équipage fait à trois (avec vous, interpeller, secours,
  // l'interpellé — CommandCore.check, CREW_ORDERS) ; pour barrer ou disperser, il demande des renforts à CENTRAL
  if (role === 'patrouille') {
    const crew = p && p.squadId !== 0 ? ctx.squads.get(p.squadId) : undefined;
    if (p && crew && crew.faction === 'police' && crew.leaderId === p.id) {
      return { ...readOnly(''), squadIds: new Set<number>([crew.id]), ownSquadId: crew.id, crew: true, label: `Chef de bord — ${crew.name} · votre équipage` };
    }
    return readOnly(`${roleLabel(role)} — lecture seule`);
  }

  if (role === 'commandant' || role === 'commissaire' || rank >= RANK_LEVEL.commandant) {
    const ids = new Set<number>();
    const list = ctx.squads.list;
    for (let i = 0; i < list.length; i++) if (list[i]!.faction === 'police') ids.add(list[i]!.id);
    const led = p ? highestLed(ctx, p) : null;
    return {
      level: 'tout', squadIds: ids, ownSquadId: led ? led.id : p ? p.squadId : 0, canAuthorize: true, canSommation,
      canTraffic: true, canMetro: true, canDelegate: true,
      label: `${roleLabel(role === 'commissaire' ? 'commissaire' : 'commandant')} — tout le dispositif` +
        (ctx.session.config?.extra?.['variante'] === 'salle' ? ' · salle de commandement'
          : commanderOffPost(ctx) ? ' · à pied (carte partielle)' : ' · au poste de commandement'),
    };
  }

  // BRAV-M : l'opérateur passager suit l'ordre de son chef (lecture seule, quel que soit son grade) ; le chef de la
  // BRAV-M (poste « chef de groupe ») la commande, quel que soit son grade
  if (role === 'bravm' && p !== null && p.poste === 'passager_moto') return readOnly(`${roleLabel(role)} — lecture seule`);
  const chefBravm = role === 'bravm' && p !== null && p.poste === 'chef_groupe';
  if (p && (role === 'chef_groupe' || chefBravm || rank >= RANK_LEVEL.brigadier_chef)) {
    const led = highestLed(ctx, p);
    // un chef de groupe sans unité à sa tête commande au moins celle dont il fait partie
    const unit = led ?? (role === 'chef_groupe' && p.squadId !== 0 ? ctx.squads.get(p.squadId) ?? null : null);
    if (unit && unit.faction === 'police') {
      const ids = new Set<number>();
      addWithChildren(ctx, unit, ids);
      // la fonction tenue : chef de la BRAV-M, chef de section (une section, ou le chef de section), chef de groupe
      const what = role === 'bravm' ? 'Chef de la BRAV-M'
        : unit.kind === 'section' || p.poste === 'chef_section' ? 'Chef de section'
          : roleLabel('chef_groupe');
      return {
        level: 'unite', squadIds: ids, ownSquadId: unit.id, canAuthorize: false, canSommation, canTraffic: true,
        canMetro: false, canDelegate: true, label: `${what} — ${unit.name}`,
      };
    }
  }
  return readOnly(`${roleLabel(role)} — lecture seule`);
}
