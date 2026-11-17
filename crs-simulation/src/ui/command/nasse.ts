/* =====================================================================================
 * Aide au commandement « Fermer la nasse » : autour de la foule choisie, chaque issue ouverte reçoit l'unité libre
 * la plus proche (ordre « Barrer la rue », face à la foule). La proposition est montrée sur la carte ; Entrée (ou P,
 * comme une proposition de l'adjoint) la fait exécuter ; s'il manque des unités, elle dit combien d'issues restent
 * ouvertes. « Ouvrir une issue filtrée » : dans une nasse fermée, l'unité qui tient l'issue la plus large passe en
 * barrage filtrant (ordre « filtrer »).
 *
 * assignExits est pure (testée) ; le reste lit la scène de la carte et passe par CommandCore.issue.
 * ===================================================================================== */

import type { OrderType, Squad } from '@/core/contracts';
import { exitName, exitOpen, pickFilterExit } from '../maps/barrages';
import type { SceneCrowdExits, SceneExit } from '../maps/barrages';
import type { MapUnit } from '../maps/units';
import type { CommandCore } from './core';
import type { OrderGeom } from './orders';

// ───────────────────────────── affectation (pure) ─────────────────────────────

export interface ExitAssignment {
  /** Indice de l'issue (dans la liste donnée) et de l'unité retenue. */
  exit: number;
  unit: number;
  /** Distance unité → issue (m). */
  distance: number;
}

/**
 * Affecte à chaque issue l'unité libre la plus proche : on retient à chaque tour le couple (issue, unité) le plus court
 * parmi ceux qui restent, si bien qu'aucune unité n'est donnée à deux issues et que les plus proches partent d'abord.
 * Résultat trié par issue. Les issues sans unité restent ouvertes (`exits.length − résultat.length`).
 */
export function assignExits(
  exits: readonly { x: number; z: number }[], units: readonly { x: number; z: number }[],
): ExitAssignment[] {
  const pairs: ExitAssignment[] = [];
  for (let e = 0; e < exits.length; e++) {
    const ex = exits[e]!;
    for (let u = 0; u < units.length; u++) {
      const d = Math.hypot(units[u]!.x - ex.x, units[u]!.z - ex.z);
      if (Number.isFinite(d)) pairs.push({ exit: e, unit: u, distance: d });
    }
  }
  // tri stable : à distance égale, l'issue puis l'unité de plus petit indice
  pairs.sort((a, b) => a.distance - b.distance || a.exit - b.exit || a.unit - b.unit);
  const exitDone = new Set<number>();
  const unitDone = new Set<number>();
  const out: ExitAssignment[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i]!;
    if (exitDone.has(p.exit) || unitDone.has(p.unit)) continue;
    exitDone.add(p.exit);
    unitDone.add(p.unit);
    out.push(p);
  }
  out.sort((a, b) => a.exit - b.exit);
  return out;
}

/** Ordres qui occupent une unité : elle n'est pas « libre » pour tenir une issue. */
const BUSY: ReadonlySet<string> = new Set([
  'couper_circulation', 'filtrer', 'encercler', 'interpeller', 'escorter', 'proteger', 'degager_barricade', 'degager_obstacle',
  'eteindre', 'secourir', 'releve', 'ravitailler', 'charge', 'disperser_gaz', 'refoulement',
]);

/** Unité libre : agents valides, pas de drone, d'engin seul ni de voiture de patrouille, pas d'ordre qui l'occupe, ne tient pas déjà un barrage. */
export function isFreeUnit(u: Pick<MapUnit, 'squadId' | 'faction' | 'valid' | 'symbol' | 'order'>, holding: ReadonlySet<number>): boolean {
  if (u.squadId <= 0 || u.faction !== 'police' || u.valid <= 0) return false;
  // drone, engins seuls et voitures de patrouille (deux ou trois agents) ne barrent pas une rue d'une façade à l'autre
  if (u.symbol === 'drone' || u.symbol === 'canon_eau' || u.symbol === 'centaure' || u.symbol === 'vehicule' || u.symbol === 'patrouille') return false;
  if (holding.has(u.squadId)) return false;
  return !(u.order && BUSY.has(String(u.order.type)));
}

/** Texte de la proposition : « Fermer la nasse — 3 issues : MISTRAL 1 → rue X, … » et ce qui reste ouvert. */
export function nasseProposalText(
  place: string, lines: readonly { unit: string; street: string }[], openLeft: number,
): string {
  const head = `Fermer la nasse${place !== '' ? ` — ${place}` : ''}`;
  if (lines.length === 0) {
    return openLeft > 0
      ? `${head} : aucune unité libre. ${openLeft} issue${openLeft > 1 ? 's restent ouvertes' : ' reste ouverte'}.`
      : `${head} : toutes les issues sont déjà tenues.`;
  }
  const body = lines.map((l) => `${l.unit} → ${l.street}`).join(', ');
  const tail = openLeft > 0
    ? ` Unités manquantes : ${openLeft} issue${openLeft > 1 ? 's restent ouvertes' : ' reste ouverte'}.`
    : ' Toutes les issues seront tenues.';
  return `${head} : ${body}.${tail}`;
}

// ───────────────────────────── proposition ─────────────────────────────

export interface NasseLine {
  squadId: number;
  unit: string;
  /** Position de l'unité (aperçu sur la carte) et issue visée. */
  ux: number;
  uz: number;
  x: number;
  z: number;
  /** Cap du barrage : face à la foule. */
  heading: number;
  width: number;
  street: string;
}

export interface NasseProposal {
  /** Foule visée (clé de SceneCrowdExits) et son lieu. */
  key: string;
  place: string;
  cx: number;
  cz: number;
  lines: NasseLine[];
  /** Issues ouvertes qui resteront ouvertes faute d'unités. */
  openLeft: number;
  text: string;
}

/** Foule la plus proche d'un point (nasse, foyer, cortège), dans un rayon (m) ; null s'il n'y en a pas. */
export function nearestCrowd(list: readonly SceneCrowdExits[], x: number, z: number, maxDist = Infinity): SceneCrowdExits | null {
  let best: SceneCrowdExits | null = null;
  let bd = maxDist;
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    const d = Math.max(0, Math.hypot(c.x - x, c.z - z) - c.radius);
    if (d < bd || (d === bd && best === null)) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/**
 * Propose l'affectation des unités libres (`candidates`, sous les ordres du joueur) aux issues ouvertes de la foule.
 * `holding` : unités qui tiennent déjà un barrage.
 */
export function buildNasseProposal(crowd: SceneCrowdExits, candidates: readonly MapUnit[], holding: ReadonlySet<number>): NasseProposal {
  const open: SceneExit[] = crowd.exits.filter((e) => exitOpen(e));
  const free = candidates.filter((u) => isFreeUnit(u, holding));
  const pairs = assignExits(open, free);
  const lines: NasseLine[] = pairs.map((p) => {
    const e = open[p.exit]!;
    const u = free[p.unit]!;
    // face à la foule : de l'issue vers le centre
    const dx = crowd.x - e.x;
    const dz = crowd.z - e.z;
    const heading = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : e.heading;
    return { squadId: u.squadId, unit: u.name, ux: u.x, uz: u.z, x: e.x, z: e.z, heading, width: e.width, street: exitName(e) };
  });
  const openLeft = open.length - lines.length;
  return {
    key: crowd.key, place: crowd.place, cx: crowd.x, cz: crowd.z, lines, openLeft,
    text: nasseProposalText(crowd.place, lines, openLeft),
  };
}

/** Unités qui tiennent un barrage (en route ou en place). */
export function holdingSquads(barrages: readonly { squadId: number; state: string }[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < barrages.length; i++) if (barrages[i]!.state !== 'rompu' && barrages[i]!.squadId > 0) out.add(barrages[i]!.squadId);
  return out;
}

/**
 * Unités candidates : la sélection si le joueur en a fait une, sinon ses sections (le niveau que donnent les touches 1 à 9),
 * puis, s'il en manque, toutes les autres unités qu'il commande.
 */
export function nasseCandidates(core: CommandCore, selected: readonly MapUnit[], sections: readonly MapUnit[]): MapUnit[] {
  if (selected.length > 0) return selected.slice();
  const out = sections.slice();
  const seen = new Set(out.map((u) => u.key));
  const units = core.maps.scene.units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (seen.has(u.key) || u.childCount > 0 || !core.canCommand(u.squadId)) continue;
    // une unité dont un supérieur est déjà candidat en fait partie
    let parent = u.parentKey;
    let inside = false;
    for (let guard = 0; parent !== 0 && guard < 8; guard++) {
      if (seen.has(parent)) { inside = true; break; }
      parent = core.maps.scene.unitModel.get(parent)?.parentKey ?? 0;
    }
    if (!inside) out.push(u);
  }
  return out;
}

/** Donne les ordres « Barrer la rue » de la proposition ; retourne le nombre d'unités engagées. */
export function issueNasse(core: CommandCore, p: NasseProposal): number {
  const squads: Squad[] = [];
  const geoms: OrderGeom[] = [];
  for (let i = 0; i < p.lines.length; i++) {
    const l = p.lines[i]!;
    const s = core.ctx.squads.get(l.squadId);
    if (!s || !core.canCommand(s.id)) continue;
    squads.push(s);
    geoms.push({ x: l.x, z: l.z, heading: l.heading, width: l.width });
  }
  if (squads.length === 0) return 0;
  // un seul ordre groupé : une issue par unité (geoms[i] pour squads[i])
  const r = core.issue('couper_circulation' as OrderType, squads, geoms);
  return r.ok ? r.count : 0;
}

/**
 * « Ouvrir une issue filtrée » dans une nasse fermée : l'unité qui tient l'issue la plus large (sous les ordres du joueur)
 * reçoit l'ordre « filtrer » sur place, face à la foule. Retourne le message à afficher.
 */
export function openFilteredExit(core: CommandCore, crowd: SceneCrowdExits): { ok: boolean; text: string } {
  const filtered = crowd.exits.find((e) => e.mode === 'filtrant');
  if (filtered) return { ok: false, text: `Une issue filtrée est déjà ouverte : ${exitName(filtered)}.` };
  const e = pickFilterExit(crowd.exits, (id) => core.canCommand(id));
  if (!e) return { ok: false, text: 'Aucune issue de cette nasse n’est tenue par une unité sous vos ordres.' };
  const s = core.ctx.squads.get(e.squadId);
  if (!s) return { ok: false, text: 'L’unité qui tient cette issue n’est plus engagée.' };
  const dx = crowd.x - e.x;
  const dz = crowd.z - e.z;
  const heading = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : e.heading;
  const r = core.issue('filtrer' as OrderType, [s], [{ x: e.x, z: e.z, heading, width: e.width }]);
  if (!r.ok) return { ok: false, text: r.reason };
  return { ok: true, text: `Issue filtrée ouverte : ${exitName(e)}, tenue par ${s.name}. Annoncez-la à la foule.` };
}

// ───────────────────────────── commandes de la carte tactique ─────────────────────────────

/** Distance maximale (m) entre le point désigné (curseur, centre de la vue) et le bord d'une foule pour la retenir. */
export const CROWD_PICK = 250;

/** Foule visée : celle que le joueur a touchée (`focusKey`), sinon la plus proche du point désigné. */
export function resolveCrowd(list: readonly SceneCrowdExits[], focusKey: string, x: number, z: number): SceneCrowdExits | null {
  if (focusKey !== '') {
    const c = list.find((q) => q.key === focusKey);
    if (c) return c;
  }
  return nearestCrowd(list, x, z, CROWD_PICK);
}

/**
 * « Fermer la nasse » : prépare la proposition pour la foule visée et la met en attente (core.nasse). Retourne le
 * message à afficher ; `pending` est vrai si une proposition attend la validation.
 */
export function proposeNasse(
  core: CommandCore, crowd: SceneCrowdExits | null, selected: readonly MapUnit[], sections: readonly MapUnit[],
): { pending: boolean; text: string } {
  core.nasse = null;
  if (!crowd) return { pending: false, text: 'Aucune foule repérée près du curseur : placez-le sur un rassemblement ou un cortège.' };
  const scene = core.maps.scene;
  const p = buildNasseProposal(crowd, nasseCandidates(core, selected, sections), holdingSquads(scene.barrages));
  if (p.lines.length === 0) return { pending: false, text: p.text };
  core.nasse = p;
  return { pending: true, text: p.text };
}

/** Valide la proposition en attente : les ordres « Barrer la rue » partent. Retourne le message à afficher. */
export function acceptNasse(core: CommandCore): { ok: boolean; text: string } {
  const p = core.nasse;
  core.nasse = null;
  if (!p) return { ok: false, text: 'Aucune proposition en attente.' };
  const n = issueNasse(core, p);
  if (n === 0) return { ok: false, text: 'Aucune unité n’a pu partir : elles ne sont plus sous vos ordres.' };
  const left = p.openLeft > 0 ? ` ${p.openLeft} issue${p.openLeft > 1 ? 's restent ouvertes' : ' reste ouverte'} faute d’unités.` : '';
  return { ok: true, text: `Fermer la nasse : ${n} unité${n > 1 ? 's barrent' : ' barre'} les issues${p.place !== '' ? `, ${p.place}` : ''}.${left}` };
}
