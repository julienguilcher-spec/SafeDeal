/* =====================================================================================
 * EXÉCUTANT — mots simples pour le joueur qui reçoit les ordres (CRS de base, stagiaire, équipier d'engin).
 *
 * Fonctions pures utilisées par la carte « Ma mission » (mission.ts) :
 *   - isExecutantRole       qui reçoit les ordres (tout policier sauf commandant, commissaire et chef de groupe) ;
 *   - plainOrder            ordre de groupe → consigne en français courant (« Tenir la ligne, rue de Turbigo » +
 *                           « restez à votre place dans la ligne, bouclier levé ») et ce que le GPS doit viser ;
 *   - resolveInstruction    UNE consigne à la fois, entre la tâche d'incident, le déplacement de la journée, le rappel
 *                           « rejoignez votre groupe », l'ordre du groupe et l'attente ;
 *   - rankLabel, surname, chainLabel, chiefLine : libellés de la carte.
 * ===================================================================================== */

import type { PlayableRole, PolicePoste, PoliceRank } from '@/core/contracts';

/** Rôles qui donnent les ordres : ils gardent toute la radio et n'ont pas de carte « Ma mission ». */
const COMMAND_ROLES: ReadonlySet<string> = new Set(['commandant', 'commissaire', 'chef_groupe']);
const POLICE_ROLES: ReadonlySet<string> = new Set(['crs', 'chef_groupe', 'commandant', 'commissaire', 'bravm', 'gendarme_centaure', 'operateur_canon_eau', 'telepilote']);

/** Le joueur reçoit-il les ordres (policier sans responsabilité de commandement) ? */
export function isExecutantRole(role: PlayableRole | string): boolean {
  return POLICE_ROLES.has(role) && !COMMAND_ROLES.has(role);
}

const RANK_LABELS: Readonly<Record<PoliceRank, string>> = {
  gardien_stagiaire: 'Gardien stagiaire', gardien: 'Gardien', brigadier: 'Brigadier', brigadier_chef: 'Brigadier-chef',
  major: 'Major', capitaine: 'Capitaine', commandant: 'Commandant', commissaire: 'Commissaire',
};

/** « Brigadier-chef » ; chaîne vide si le grade est inconnu. */
export function rankLabel(rank: PoliceRank | null | undefined): string {
  return rank ? RANK_LABELS[rank] ?? '' : '';
}

/** Nom de famille d'un nom complet « Prénom Nom » (le nom seul s'il n'y a qu'un mot). */
export function surname(name: string): string {
  const t = name.trim();
  const i = t.indexOf(' ');
  return i > 0 ? t.slice(i + 1) : t;
}

/** « Brigadier-chef Martin ». */
export function chiefLabel(rank: PoliceRank | null | undefined, name: string): string {
  const r = rankLabel(rank);
  const n = surname(name);
  return r && n ? `${r} ${n}` : r || n || 'votre chef';
}

/** Libellé lisible d'un indicatif : « MISTRAL 1 ALFA » (casse d'origine conservée, espaces normalisés). */
function tidy(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Chaîne d'unités : « Groupe MISTRAL 1 ALFA — Section MISTRAL 1 — Cie MISTRAL ». */
export function chainLabel(units: { group?: string; section?: string; company?: string; unitKind?: string }): string {
  const out: string[] = [];
  const g = tidy(units.group ?? '');
  if (g) out.push(`${units.unitKind ?? 'Groupe'} ${g}`);
  const s = tidy(units.section ?? '');
  if (s) out.push(`Section ${s}`);
  const c = tidy(units.company ?? '');
  if (c) out.push(`Cie ${c}`);
  return out.join(' — ');
}

/** Ce que le GPS vise pour l'exécutant. */
export type InstructionTarget = 'post' | 'chef' | 'vehicle' | 'place' | 'incident' | 'none';

export interface PlainOrder {
  /** Consigne courte (« Tenir la ligne, rue de Turbigo »). */
  title: string;
  /** Ce que cela veut dire pour le joueur (« restez à votre place dans la ligne, bouclier levé »). */
  detail: string;
  /** Ligne radio du chef à son groupe, '' si l'ordre ne mérite pas d'être relayé. */
  radio: string;
  target: InstructionTarget;
}

export interface PlainOrderOptions {
  /** Lieu de l'ordre (« rue de Turbigo »), '' s'il est inconnu. */
  place: string;
  /** Poste du joueur dans le groupe (bouclier, lanceur…). */
  poste: PolicePoste | null;
  /** Véhicule à rejoindre (« fourgon MISTRAL 1 ALFA »), pour l'embarquement. */
  vehicle?: string;
  /** Le joueur a un emplacement réservé dans la formation de son groupe. */
  hasPost: boolean;
  /**
   * Le groupe tient un barrage de rue qui laisse passer les passants (service 'police.barrages', BarrageView.passersby) :
   * la carte le dit, quel que soit l'ordre qui a mené au barrage (barrer la rue, tenir, ligne, avancer sur une rue).
   */
  passersby?: boolean;
}

/** Ordres qui finissent en barrage de rue (option « passants »). */
const BARRAGE_ORDERS: ReadonlySet<string> = new Set(['couper_circulation', 'tenir', 'ligne', 'avancer']);

/** Ce que fait le joueur dans une ligne, selon son poste. */
function inLine(poste: PolicePoste | null): string {
  switch (poste) {
    case 'bouclier': return 'restez à votre place dans la ligne, bouclier levé';
    case 'lanceur':
    case 'lbd': return 'restez en second rideau derrière les boucliers, vous ne tirez que sur ordre';
    case 'extincteur': return 'restez derrière la ligne, extincteur prêt';
    case 'interpellation': return 'restez derrière la ligne, prêt à interpeller sur ordre';
    default: return 'restez à votre place dans la ligne';
  }
}

/** Ordres où le groupe tient une formation : le GPS vise la place du joueur. */
const HOLD: ReadonlySet<string> = new Set(['tenir', 'ligne', 'tortue', 'proteger', 'couper_circulation', 'filtrer', 'encercler', 'disperser_gaz']);

/**
 * Ordre de groupe en mots simples. `type` : SquadOrder.type (ordre de l'IA à son groupe).
 * Les ordres sans contenu pour l'exécutant (libre, suivre, cesser) deviennent « Suivez votre chef ».
 */
export function plainOrder(type: string, o: PlainOrderOptions): PlainOrder {
  const at = o.place ? `, ${o.place}` : '';
  const to = o.place ? ` vers ${o.place}` : '';
  const post: InstructionTarget = o.hasPost ? 'post' : 'chef';
  const hold = HOLD.has(type) ? post : 'chef';
  // barrage qui laisse passer les passants : manifestants et véhicules restent bloqués
  if (o.passersby && BARRAGE_ORDERS.has(type)) {
    return { title: `Barrage${o.place ? ` — ${o.place}` : ''} : les manifestants ne passent pas, les passants oui`,
      detail: `${cap(inLine(o.poste))}. Laissez passer les passants entre deux collègues, dans les deux sens ; aucun manifestant, aucun véhicule.`,
      radio: `on barre la rue${at}, les passants passent, pas les manifestants`, target: post };
  }
  switch (type) {
    case 'tenir':
      return { title: `Tenir la position${at}`, detail: `${cap(inLine(o.poste))}. On ne bouge pas sans ordre.`, radio: `on tient la position${at}, chacun à sa place`, target: hold };
    case 'ligne':
      return { title: `Tenir la ligne${at}`, detail: `${cap(inLine(o.poste))}.`, radio: `en ligne${at}, boucliers levés`, target: hold };
    case 'tortue':
      return { title: 'Tortue : à l’abri', detail: 'Serrez-vous contre vos collègues, bouclier au-dessus de la tête, attendez l’ordre.', radio: 'tortue, serrez les boucliers', target: hold };
    case 'proteger':
      return { title: `Protéger le site${at}`, detail: 'Tenez le périmètre avec le groupe : personne n’entre.', radio: `on protège le site${at}, personne n'entre`, target: hold };
    // la rue est barrée d'une façade à l'autre : piétons et véhicules, personne ne passe, dans les deux sens
    case 'couper_circulation':
      return { title: `Barrage${o.place ? ` — ${o.place}` : ''} : personne ne passe, dans les deux sens`,
        detail: `${cap(inLine(o.poste))}. La rue est barrée d’une façade à l’autre : ni piétons ni véhicules, ni dans un sens ni dans l’autre.`,
        radio: `on barre la rue${at}, personne ne passe`, target: hold };
    case 'filtrer':
      return { title: `Barrage filtrant${o.place ? ` — ${o.place}` : ''} : une porte, sortie une à une`,
        detail: 'Laissez sortir les personnes une à une par la porte, sans ouvrir la ligne.', radio: `on filtre le passage${at}`, target: hold };
    case 'encercler':
      return { title: `Encerclement${at}`, detail: 'Fermez le cercle avec le groupe : personne ne sort.', radio: `on encercle${at}, personne ne sort`, target: hold };
    case 'disperser_gaz':
      return { title: `Dispersion${at}`, detail: 'Masque à gaz en place, restez dans la ligne.', radio: 'masques, on disperse', target: hold };
    case 'colonne':
      return { title: `Colonne${to}`, detail: 'Suivez le groupe en file, sans vous laisser distancer.', radio: `en colonne${to}, on me suit`, target: 'chef' };
    case 'avancer':
    case 'bond_offensif':
      return { title: `Progression${to}`, detail: 'Avancez au pas avec la ligne, sans la dépasser.', radio: `on avance${to}, au pas, gardez la ligne`, target: 'chef' };
    case 'charge':
      return { title: `Charge${at}`, detail: 'Avancez avec la ligne au pas de charge, puis reformez la ligne au coup de sifflet.', radio: 'on charge, restez avec la ligne', target: 'chef' };
    case 'refoulement':
      return { title: `Refoulement${at}`, detail: 'Repoussez la foule au pas, bouclier en avant, sans casser la ligne.', radio: `on refoule${at}, au pas, gardez la ligne`, target: 'chef' };
    case 'repli':
      return { title: `Repli${to}`, detail: 'Reculez avec le groupe, toujours face à la foule.', radio: `on se replie${to}, face à la foule`, target: 'chef' };
    case 'interpeller':
      return { title: `Interpellation${at}`, detail: 'Couvrez les interpellateurs, restez avec le groupe.', radio: 'on couvre les interpellateurs', target: 'chef' };
    case 'degager_barricade':
      return { title: `Dégager la barricade${at}`, detail: 'Protégez ceux qui dégagent la barricade, bouclier levé.', radio: `on dégage la barricade${at}`, target: 'chef' };
    case 'escorter':
      return { title: `Escorte${at}`, detail: 'Restez à pied autour de l’engin, à sa vitesse.', radio: 'on escorte l\'engin, restez autour', target: 'chef' };
    case 'eteindre':
      return { title: `Feu${at}`, detail: 'Protégez l’extinction, tenez les curieux à distance.', radio: `feu${at}, on protège l'extinction`, target: 'chef' };
    case 'secourir':
      return { title: `Secours${at}`, detail: 'Couvrez le secours, boucliers tournés vers la foule.', radio: `on couvre le secours${at}`, target: 'chef' };
    case 'releve':
      return { title: `Relève${to}`, detail: 'Suivez le groupe et prenez la place de l’unité relevée.', radio: `on relève${to}, on me suit`, target: 'chef' };
    case 'ravitailler':
      return { title: 'Ravitaillement', detail: 'Suivez le groupe jusqu’au véhicule.', radio: '', target: 'chef' };
    case 'embarquer': {
      const v = o.vehicle ? `le ${o.vehicle}` : 'le fourgon du groupe';
      return { title: `Embarquez dans ${v}`, detail: 'Montez à bord : le groupe part avec vous.', radio: 'on embarque', target: 'vehicle' };
    }
    case 'debarquer':
      return { title: `Débarquement${at}`, detail: 'Descendez et mettez-vous en ligne à côté du fourgon.', radio: 'on débarque, en ligne à côté du fourgon', target: 'chef' };
    default:
      return { title: 'Restez avec votre groupe', detail: 'Suivez votre chef et attendez les ordres.', radio: '', target: 'chef' };
  }
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

// ───────────────────────────── une seule consigne ─────────────────────────────

export type InstructionSource = 'incident' | 'journee' | 'regroup' | 'mission' | 'ordre' | 'tache' | 'attente';

export interface Instruction {
  source: InstructionSource;
  title: string;
  detail: string;
  target: InstructionTarget;
  /** Point visé (GPS), absent s'il n'y en a pas. */
  x?: number;
  z?: number;
}

export interface InstructionInputs {
  /** Tâche d'incident confiée au joueur (prime sur tout) ; `detail` remplace la consigne par défaut. */
  incident?: { label: string; x: number; z: number; detail?: string } | null;
  /** Déplacement commandé de la journée (embarquement, route, retour) ou consigne sur place de la journée. */
  journee?: { title: string; detail: string; travelling: boolean; x?: number; z?: number; target?: InstructionTarget } | null;
  /** Le joueur s'est éloigné de son groupe (à pied). */
  regroup?: { chief: string; x: number; z: number; distance: number } | null;
  /** Objectif suivi d'une mission (catalogue), s'il y en a un. */
  mission?: { text: string; x?: number; z?: number } | null;
  /** Ordre du groupe (ou poste donné au joueur) en mots simples, et son point. */
  order?: (PlainOrder & { x?: number; z?: number }) | null;
  /** Tâche propre au rôle (secours disponible, street medic, journaliste, manifestant) quand rien d'autre ne s'impose. */
  task?: { title: string; detail: string; x?: number; z?: number; target: InstructionTarget } | null;
  /** Chef à suivre quand il n'y a pas d'ordre. */
  chief?: { label: string; x: number; z: number } | null;
}

/**
 * Une seule consigne à l'écran : tâche d'incident > déplacement de la journée > « rejoignez votre groupe » > consigne
 * sur place de la journée > objectif de mission > ordre du groupe > tâche du rôle > attente (« suivez votre chef »).
 * Fonction pure.
 */
export function resolveInstruction(i: InstructionInputs): Instruction {
  if (i.incident) {
    return { source: 'incident', title: `Tâche : ${i.incident.label}`, detail: i.incident.detail ?? 'Le repère vous y conduit. Votre groupe vous attend ensuite.',
      target: 'incident', x: i.incident.x, z: i.incident.z };
  }
  const j = i.journee;
  if (j && j.travelling) return { source: 'journee', title: j.title, detail: j.detail, target: j.target ?? 'place', x: j.x, z: j.z };
  if (i.regroup) {
    return { source: 'regroup', title: 'Rejoignez votre groupe', detail: `Vous êtes à ${Math.round(i.regroup.distance)} m de votre chef (${i.regroup.chief}) : revenez près de lui.`,
      target: 'chef', x: i.regroup.x, z: i.regroup.z };
  }
  if (j) return { source: 'journee', title: j.title, detail: j.detail, target: j.target ?? 'place', x: j.x, z: j.z };
  if (i.mission) return { source: 'mission', title: i.mission.text, detail: 'Objectif de la mission : le repère vous y conduit.', target: 'place', x: i.mission.x, z: i.mission.z };
  if (i.order) return { source: 'ordre', title: i.order.title, detail: i.order.detail, target: i.order.target, x: i.order.x, z: i.order.z };
  if (i.task) return { source: 'tache', title: i.task.title, detail: i.task.detail, target: i.task.target, x: i.task.x, z: i.task.z };
  if (i.chief) return { source: 'attente', title: 'Restez avec votre groupe', detail: `Suivez votre chef (${i.chief.label}) et attendez les ordres.`, target: 'chef', x: i.chief.x, z: i.chief.z };
  return { source: 'attente', title: 'Attendez les ordres', detail: 'Restez près de vos collègues, la radio vous dira quoi faire.', target: 'none' };
}

/** Distance (m) au-delà de laquelle le joueur à pied est rappelé à son groupe, et en deçà de laquelle le rappel cesse. */
export const REGROUP_FAR = 40;
export const REGROUP_NEAR = 20;

/** Hystérésis du rappel « rejoignez votre groupe ». */
export function strayed(distance: number, wasAway: boolean): boolean {
  return wasAway ? distance > REGROUP_NEAR : distance > REGROUP_FAR;
}
