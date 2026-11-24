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
import { vanWords } from '@/ui/command/direct/words';

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

export type InstructionSource = 'custody' | 'incident' | 'journee' | 'regroup' | 'mission' | 'ordre' | 'tache' | 'attente';

export interface Instruction {
  source: InstructionSource;
  title: string;
  detail: string;
  target: InstructionTarget;
  /** Point visé (GPS), absent s'il n'y en a pas. */
  x?: number;
  z?: number;
  /**
   * La consigne passe en tête de la carte, avant l'ordre d'en haut (son interpellé, la moto du chef de la BRAV-M qui
   * l'attend) : c'est ce que le joueur doit faire maintenant, l'ordre de la compagnie attendra.
   */
  lead?: boolean;
}

/** Consigne « interpellé » : ce que le joueur fait de la personne qu'il tient (prime sur tout le reste). */
export interface CustodyInput {
  title: string;
  detail: string;
  target: InstructionTarget;
  x?: number;
  z?: number;
}

export interface InstructionInputs {
  /** L'interpellé du joueur (law.custody) ou celui de sa patrouille : prime sur tout. */
  custody?: CustodyInput | null;
  /** Tâche d'incident confiée au joueur (prime sur tout) ; `detail` remplace la consigne par défaut. */
  incident?: { label: string; x: number; z: number; detail?: string } | null;
  /**
   * Déplacement commandé de la journée (embarquement, route, retour) ou consigne sur place de la journée. `lead` : la
   * consigne passe devant l'ordre d'en haut (chef de la BRAV-M : « Montez sur votre moto (E) — la BRAV-M part avec vous »).
   */
  journee?: { title: string; detail: string; travelling: boolean; x?: number; z?: number; target?: InstructionTarget; lead?: boolean } | null;
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
 * Une seule consigne à l'écran : son interpellé > tâche d'incident > déplacement de la journée > « rejoignez votre
 * groupe » > consigne sur place de la journée > objectif de mission > ordre du groupe > tâche du rôle > attente
 * (« suivez votre chef »). Fonction pure.
 */
export function resolveInstruction(i: InstructionInputs): Instruction {
  const c = i.custody;
  if (c) return { source: 'custody', title: c.title, detail: c.detail, target: c.target, x: c.x, z: c.z, lead: true };
  if (i.incident) {
    return { source: 'incident', title: `Tâche : ${i.incident.label}`, detail: i.incident.detail ?? 'Le repère vous y conduit. Votre groupe vous attend ensuite.',
      target: 'incident', x: i.incident.x, z: i.incident.z };
  }
  const j = i.journee;
  const lead = j && j.lead ? { lead: true } : {};
  if (j && (j.travelling || j.lead)) return { source: 'journee', title: j.title, detail: j.detail, target: j.target ?? 'place', x: j.x, z: j.z, ...lead };
  if (i.regroup) {
    return { source: 'regroup', title: 'Rejoignez votre groupe', detail: `Vous êtes à ${Math.round(i.regroup.distance)} m de votre chef (${i.regroup.chief}) : revenez près de lui.`,
      target: 'chef', x: i.regroup.x, z: i.regroup.z };
  }
  if (j) return { source: 'journee', title: j.title, detail: j.detail, target: j.target ?? 'place', x: j.x, z: j.z, ...lead };
  if (i.mission) return { source: 'mission', title: i.mission.text, detail: 'Objectif de la mission : le repère vous y conduit.', target: 'place', x: i.mission.x, z: i.mission.z };
  if (i.order) return { source: 'ordre', title: i.order.title, detail: i.order.detail, target: i.order.target, x: i.order.x, z: i.order.z };
  if (i.task) return { source: 'tache', title: i.task.title, detail: i.task.detail, target: i.task.target, x: i.task.x, z: i.task.z };
  if (i.chief) return { source: 'attente', title: 'Restez avec votre groupe', detail: `Suivez votre chef (${i.chief.label}) et attendez les ordres.`, target: 'chef', x: i.chief.x, z: i.chief.z };
  return { source: 'attente', title: 'Attendez les ordres', detail: 'Restez près de vos collègues, la radio vous dira quoi faire.', target: 'none' };
}

// ───────────────────────────── l'interpellé du joueur (plan ordres-directs §5.3, §5.7) ─────────────────────────────

/** Ce que la carte sait de l'interpellé du joueur (law.custody, police.arrests). */
export interface CustodyFacts {
  /** Meilleure issue (law.custody.bestWay) ; null : il ne tient personne. */
  way: { kind: string; name: string; guidance: string; x: number; z: number; distance: number } | null;
  /** Fourgon appelé par « Faire venir », en route vers lui (null : aucun) ; la carte écrit sa distance. */
  coming: { name: string; x: number; z: number } | null;
  /** Lieu de dépôt le plus proche (law.custody.nearestDrop), fourgons cellulaires d'abord. */
  drop: { name: string; cellular: boolean; x: number; z: number } | null;
  /** Touche Interagir du joueur (« E »). */
  key: string;
}

/** « au fourgon de CRS », « à la voiture de police », « à l’ambulance » (véhicule ou point de remise). */
function toThe(label: string): string {
  const t = label.trim();
  const low = t.length > 1 && t[1] === t[1]!.toLocaleLowerCase('fr-FR') ? t.charAt(0).toLocaleLowerCase('fr-FR') + t.slice(1) : t;
  if (/^[aeéiouh]/i.test(low)) return `à l’${low}`;
  return /^(voiture|moto|camionnette|fourgonnette)/i.test(low) ? `à la ${low}` : `au ${low}`;
}

/** Ligne d'aide de law.custody sans son « Interpellé. » de tête : « E : le confier à MISTRAL 2 ALFA (15 m) ». */
function helpOf(guidance: string): string {
  return guidance.replace(/^Interpellé\.\s*/, '').trim();
}

/**
 * Consigne « interpellé » de la carte « Ma mission » (classée avant tout le reste) : la même issue que la 4e invite de
 * la touche Interagir, en clair, et le repère sur le fourgon où l'emmener — « Emmenez l’interpellé au fourgon
 * cellulaire 1 » (la carte écrit la distance à côté). null : il ne tient personne. Fonction pure.
 */
export function custodyInstruction(f: CustodyFacts): CustodyInput | null {
  const w = f.way;
  if (!w) return null;
  const key = f.key !== '' ? f.key : 'E';
  const help = helpOf(w.guidance);
  switch (w.kind) {
    case 'remettre_fourgon':
      return { title: `Remettez l’interpellé au ${vanWords(w.name)}`, detail: help !== '' ? `${help}.` : `${key} : « Remettre ».`, target: 'vehicle', x: w.x, z: w.z };
    case 'confier':
      return { title: `Confiez l’interpellé à ${w.name}`, detail: `${help !== '' ? help : `${key} : « Confier »`} — il l’emmène au fourgon, vous avez les mains libres.`, target: 'none' };
    case 'remettre':
      return { title: `Remettez l’interpellé ${toThe(w.name)}`, detail: help !== '' ? `${help}.` : `${key} : « Remettre ».`, target: 'vehicle', x: w.x, z: w.z };
    case 'faire_venir':
      return { title: `Faites venir le ${vanWords(w.name)}`, detail: `${help !== '' ? help : `${key} : « Faire venir »`} — il vient jusqu’à vous.`, target: 'vehicle', x: w.x, z: w.z };
    default: {
      const c = f.coming;
      if (c) {
        return { title: `Le ${vanWords(c.name)} vient vous chercher`,
          detail: `Gardez l’interpellé avec vous ; quand le fourgon est à côté, ${key} : « Remettre ».`, target: 'vehicle', x: c.x, z: c.z };
      }
      const d = f.drop;
      if (d && d.cellular) {
        return { title: `Emmenez l’interpellé au ${vanWords(d.name)}`, detail: `Le repère montre le fourgon. À côté (12 m), ${key} : « Remettre ».`, target: 'vehicle', x: d.x, z: d.z };
      }
      if (d) return { title: `Emmenez l’interpellé ${toThe(d.name)}`, detail: `Le repère montre le véhicule. À côté, ${key} : « Remettre ».`, target: 'vehicle', x: d.x, z: d.z };
      return { title: 'Emmenez l’interpellé', detail: 'Aucun véhicule de remise à proximité : demandez un fourgon cellulaire à la radio.', target: 'none' };
    }
  }
}

/** Ce que la carte sait des interpellés d'une patrouille (mode patrouille, plan §5.1 et §5.7). */
export interface PatrolCustodyFacts {
  /** Interpellés assis dans la voiture de l'équipage. */
  inCar: number;
  /** Commissariat le plus proche : « au commissariat du 3e » et sa porte (null : aucun sur la carte). */
  station: { at: string; x: number; z: number } | null;
  /** Fourgon cellulaire demandé tout seul pour l'interpellé de l'équipage (transfer.patrolRequest). */
  request: { text: string; x?: number; z?: number } | null;
}

/**
 * Consigne de la patrouille qui a des interpellés : dans la voiture, « Conduisez l’interpellé au commissariat du 3e »
 * (repère sur la porte du commissariat) ; à pied, avec un fourgon demandé, « Fourgon cellulaire demandé » et sa ligne
 * (« — 2 min ; ou ramenez-le à la voiture (150 m) »). null : rien à dire. Fonction pure.
 */
export function patrolCustodyInstruction(f: PatrolCustodyFacts): CustodyInput | null {
  if (f.inCar > 0 && f.station) {
    const who = f.inCar > 1 ? 'les interpellés' : 'l’interpellé';
    return { title: `Conduisez ${who} ${f.station.at}`, detail: 'Arrêtez la voiture devant la porte du commissariat : ils y sont remis à l’officier de police judiciaire.',
      target: 'place', x: f.station.x, z: f.station.z };
  }
  if (f.request) {
    const rest = f.request.text.replace(/^Fourgon cellulaire demandé\s*—\s*/, '').trim();
    const hasPoint = f.request.x !== undefined && f.request.z !== undefined;
    return { title: 'Fourgon cellulaire demandé', detail: rest !== '' ? `Arrivée ${rest.replace(/^(\d)/, 'dans $1')}.` : 'Il arrive : gardez l’interpellé.',
      target: hasPoint ? 'vehicle' : 'none', x: f.request.x, z: f.request.z };
  }
  return null;
}

/** Distance (m) au-delà de laquelle le joueur à pied est rappelé à son groupe, et en deçà de laquelle le rappel cesse. */
export const REGROUP_FAR = 40;
export const REGROUP_NEAR = 20;

/** Hystérésis du rappel « rejoignez votre groupe ». */
export function strayed(distance: number, wasAway: boolean): boolean {
  return wasAway ? distance > REGROUP_NEAR : distance > REGROUP_FAR;
}

// ───────────────────────────── ordre d'en haut, départ de la colonne ─────────────────────────────

/** Ordre reçu d'en haut, en deux ou trois mots (« Tenir la ligne », « Faire mouvement ») ; '' s'il ne se dit pas. */
const COMMAND_TEXTS: Readonly<Record<string, string>> = {
  tenir: 'Tenir la position', ligne: 'Tenir la ligne', tortue: 'Tortue', proteger: 'Protéger le site',
  couper_circulation: 'Barrer la rue', filtrer: 'Barrage filtrant', encercler: 'Encercler', disperser_gaz: 'Disperser (gaz)',
  colonne: 'Faire mouvement', avancer: 'Avancer', bond_offensif: 'Bond offensif', charge: 'Charger', refoulement: 'Refouler',
  repli: 'Se replier', interpeller: 'Interpeller', degager_barricade: 'Dégager la barricade', escorter: 'Escorter l’engin',
  eteindre: 'Protéger l’extinction', secourir: 'Couvrir les secours', releve: 'Relever une unité', degager_obstacle: 'Dégager la voie',
};

/** Texte d'un ordre reçu d'en haut ; '' pour les ordres sans contenu pour l'exécutant (libre, suivre, embarquer…). */
export function commandText(type: string): string {
  return COMMAND_TEXTS[type] ?? '';
}

/** « 350 m », « 1,2 km » (distances parlées de la carte). */
export function distanceWords(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(Math.round(m / 100) / 10).toFixed(1).replace('.', ',')} km`;
}

/** « moins d'une minute », « environ 3 min ». */
export function etaWords(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return 'moins d’une minute';
  return `environ ${Math.round(seconds / 60)} min`;
}

/** Ce que la carte sait du départ de la colonne du joueur. */
export interface DepartureFacts {
  /** Étape du convoi (police.command) : route, stationnement, debarquement, en_place, rembarquement, depart, parti, echec. */
  stage: string;
  /** La colonne roule (un de ses véhicules a démarré) depuis tant de secondes ; −1 : elle n'a pas encore démarré. */
  movingFor: number;
  /** Agents de la colonne à bord, et total attendu (joueur compris). */
  aboard: number;
  total: number;
  /** Le joueur est encore à pied. */
  playerAfoot: boolean;
  /** Délai connu avant le départ (s), −1 s'il n'est pas connu. */
  departIn: number;
  /** Reste du trajet (m) et allure de la colonne (m/s), −1 s'ils ne sont pas connus. */
  remaining: number;
  speed: number;
  /** La colonne est arrêtée en route depuis tant de secondes (0 si elle roule). */
  stoppedFor: number;
  /** Le joueur tient le volant d'un véhicule de la colonne et n'a pas encore démarré : elle attend son départ. */
  driverWait?: boolean;
}

/** Durée pendant laquelle « La colonne part » reste affiché (s), et arrêt en route au-delà duquel on dit pourquoi (s). */
const LEAVING_SECONDS = 8;
const STOPPED_SECONDS = 10;

/**
 * État du départ en une ligne (fonction pure) : « Embarquement : 5 / 7 à bord — départ dès que tout le monde est à
 * bord », « départ dans 12 s au plus tard », « La colonne part », « En route — 1,2 km, environ 3 min », « Débarquement »… ; '' quand
 * il n'y a rien à dire.
 */
export function departureLine(f: DepartureFacts): string {
  const boarding = (word: string): string => {
    const count = f.total > 0 ? `${word} : ${Math.min(f.aboard, f.total)} / ${f.total} à bord` : word;
    // tant que le joueur est à pied, c'est lui qu'on attend : le délai publié par la colonne est un « au plus tard »
    // (jusqu'à cinq minutes), pas un compte à rebours — l'afficher ferait croire qu'on ne part que dans cinq minutes
    if (f.playerAfoot && f.total > 0 && f.aboard >= f.total - 1) return `${count} — on n’attend plus que vous`;
    if (f.playerAfoot) return `${count} — la colonne vous attend`;
    if (f.total > 0 && f.aboard >= f.total) return `${count} — départ au signal du chef de colonne`;
    if (f.departIn > 0) return `${count} — départ dans ${Math.ceil(f.departIn)} s au plus tard`;
    return `${count} — départ dès que tout le monde est à bord`;
  };
  switch (f.stage) {
    case 'route': {
      // au volant : c'est lui qui part (la colonne ne se dit ni arrivée ni bloquée tant qu'il n'a pas démarré)
      if (f.driverWait) return 'Vous êtes au volant : on attend votre départ — démarrez, suivez le GPS';
      if (f.movingFor < 0) return boarding('Embarquement');
      if (f.movingFor < LEAVING_SECONDS) return 'La colonne part';
      if (f.stoppedFor > STOPPED_SECONDS) return 'Colonne à l’arrêt — elle repart dès que la voie est libre';
      const left = f.remaining >= 0 ? ` — ${distanceWords(f.remaining)}` : '';
      const eta = f.remaining >= 0 && f.speed > 0.5 ? `, ${etaWords(f.remaining / f.speed)}` : '';
      return `En route${left}${eta}`;
    }
    case 'stationnement': return 'Arrivée : la colonne se gare';
    case 'debarquement': return 'Débarquement : descendez et mettez-vous en ligne';
    case 'rembarquement': return boarding('Rembarquement');
    case 'depart': return f.movingFor >= 0 && f.movingFor < LEAVING_SECONDS ? 'La colonne part' : 'Retour en colonne';
    default: return '';
  }
}
