/* =====================================================================================
 * Barrages de rue, issues et nasses — lecture du service 'police.barrages' (module de simulation) et
 * modèle d'affichage, sans DOM : couleur et tracé de chaque barrage, issues autour d'une foule, résumé
 * « Issues : 3 tenues sur 5 — ouvertes : … », bandeau « NASSE FERMÉE — … ».
 *
 * Une unité envoyée sur une rue la barre d'un trottoir à l'autre : personne ne passe, dans les deux sens — sauf option
 * « Passants : laissés passer » (étiquette « passants admis ») : les manifestants et les véhicules restent bloqués.
 * Une nasse est fermée quand toutes les issues autour d'une foule sont tenues. Le service est facultatif :
 * sans lui, aucune couche ne se dessine et aucun résumé ne s'affiche.
 *
 * Les interfaces ci-dessous sont une vue minimale du contrat du service (on n'importe rien de src/sim).
 * ===================================================================================== */

/** Clé du service publié par la simulation. */
export const BARRAGES_SERVICE = 'police.barrages';

export type BarrageState = 'en_route' | 'en_place' | 'incomplet' | 'rompu';

export interface BarrageView {
  squadId: number;
  x: number;
  z: number;
  /** Cap de la formation (vers où elle fait face). */
  heading: number;
  /** Largeur totale à barrer (m), d'une façade à l'autre. */
  width: number;
  /** Part de la largeur couverte (0..1). */
  covered: number;
  state: BarrageState | string;
  street: string;
  edgeId: number;
  mode: 'ferme' | 'filtrant' | string;
  /** Passants laissés passer (facultatif : absent d'une version du service qui ne connaît pas l'option). */
  passersby?: boolean;
}

export interface ExitView {
  x: number;
  z: number;
  heading: number;
  width: number;
  street: string;
  /** −1 : passage piéton (pas une voie du graphe). */
  edgeId: number;
  held: boolean;
  squadId: number;
  mode: 'ouvert' | 'ferme' | 'filtrant' | string;
}

export interface KettleView {
  id: number;
  x: number;
  z: number;
  radius: number;
  exits: readonly ExitView[];
  closed: boolean;
  inside: number;
  place: string;
}

export interface BarragesApi {
  readonly list: readonly BarrageView[];
  readonly kettles: readonly KettleView[];
  exitsAround(x: number, z: number, r: number): readonly ExitView[];
}

/** Service 'police.barrages' s'il est publié et a la forme attendue ; sinon undefined (la couche reste vide). */
export function barragesApi(get: (name: string) => unknown): BarragesApi | undefined {
  const s = get(BARRAGES_SERVICE) as Partial<BarragesApi> | undefined;
  if (!s || !Array.isArray(s.list) || !Array.isArray(s.kettles) || typeof s.exitsAround !== 'function') return undefined;
  return s as BarragesApi;
}

// ───────────────────────────── barrages ─────────────────────────────

/** Barrage tel que la carte le dessine (copie : le service peut réutiliser ses objets). */
export interface SceneBarrage {
  squadId: number;
  x: number;
  z: number;
  heading: number;
  width: number;
  covered: number;
  state: string;
  street: string;
  edgeId: number;
  mode: string;
  /** Passants laissés passer (« passants admis ») ; false : personne ne passe. */
  passersby: boolean;
  /** Indicatif de l'unité qui le tient (« MISTRAL 1 ALFA »), '' si inconnu. */
  callsign: string;
}

/** Étiquette d'un barrage qui laisse passer les passants (carte, légende). */
export const PASSERSBY_TAG = 'passants admis';

/** Aspect d'un barrage sur la carte. */
export interface BarrageLook {
  /** Couleur de la partie tenue. */
  color: string;
  /** Pointillés (en route vers la rue). */
  dashed: boolean;
  /** Part hachurée (non couverte), 0..1. */
  hatched: number;
  /** Porte de passage au milieu (barrage filtrant). */
  gap: boolean;
  /** Mot d'état affiché sous l'indicatif ('' : rien). */
  tag: string;
}

export const BARRAGE_COLORS = {
  ferme: '#ff3b30',
  incomplet: '#ff9500',
  filtrant: '#34c759',
  rompu: '#8e99ad',
  issue: '#ffffff',
} as const;

/** Aspect d'un barrage selon son état : en route = pointillés ; en place = rouge plein ; incomplet = orange et part
 * non couverte hachurée ; filtrant = vert avec une porte ; rompu = gris. */
export function barrageLook(b: { state: string; mode: string; covered: number; passersby?: boolean }): BarrageLook {
  const look = baseLook(b);
  // passants laissés passer : la barre reste celle d'un barrage fermé (aux manifestants), l'étiquette le dit
  if (b.passersby === true && b.state !== 'rompu') look.tag = look.tag !== '' ? `${look.tag} · ${PASSERSBY_TAG}` : PASSERSBY_TAG;
  return look;
}

function baseLook(b: { state: string; mode: string; covered: number }): BarrageLook {
  const covered = Number.isFinite(b.covered) ? Math.max(0, Math.min(1, b.covered)) : 0;
  const filtrant = b.mode === 'filtrant';
  switch (b.state) {
    case 'en_route':
      return { color: filtrant ? BARRAGE_COLORS.filtrant : BARRAGE_COLORS.ferme, dashed: true, hatched: 0, gap: filtrant, tag: 'en route' };
    case 'incomplet':
      return { color: BARRAGE_COLORS.incomplet, dashed: false, hatched: 1 - covered, gap: filtrant, tag: `incomplet ${Math.round(covered * 100)} %` };
    case 'rompu':
      return { color: BARRAGE_COLORS.rompu, dashed: true, hatched: 0, gap: false, tag: 'rompu' };
    default:
      return filtrant
        ? { color: BARRAGE_COLORS.filtrant, dashed: false, hatched: 0, gap: true, tag: 'filtrant' }
        : { color: BARRAGE_COLORS.ferme, dashed: false, hatched: 0, gap: false, tag: '' };
  }
}

/** Le barrage empêche-t-il vraiment le passage (en place, fermé ou filtrant) ? */
export function barrageHolds(b: { state: string }): boolean {
  return b.state === 'en_place' || b.state === 'incomplet';
}

// ───────────────────────────── issues, nasses ─────────────────────────────

/** Issue telle que la carte la dessine. */
export interface SceneExit {
  x: number;
  z: number;
  heading: number;
  width: number;
  street: string;
  edgeId: number;
  held: boolean;
  squadId: number;
  mode: string;
}

/** Foule (cortège, foyer, nasse) et ses issues. */
export interface SceneCrowdExits {
  /** Clé stable : 'k' + id de nasse, 'f' + id de foyer, 'm' + id de manifestation, 'c' pour le cortège principal. */
  key: string;
  /** Lieu (« place de la République »), '' s'il est inconnu. */
  place: string;
  x: number;
  z: number;
  radius: number;
  people: number;
  exits: SceneExit[];
  /** Nasse détectée par la simulation (toutes les issues tenues). */
  kettleId: number;
  closed: boolean;
}

/** Nom lisible d'une issue : la rue, ou « passage piéton » pour une trouée hors voie. */
export function exitName(e: { street: string; edgeId: number }): string {
  const s = e.street.trim();
  if (s !== '') return s;
  return e.edgeId < 0 ? 'passage piéton' : 'voie sans nom';
}

/** Issue libre : personne ne la tient (une issue filtrée est tenue, mais laisse sortir). */
export function exitOpen(e: { held: boolean; mode: string }): boolean {
  return !e.held && e.mode !== 'ferme' && e.mode !== 'filtrant';
}

/** Noms des issues ouvertes, sans doublon, dans l'ordre (« rue X (2) » pour deux trouées de la même rue). */
export function openExitNames(exits: readonly { street: string; edgeId: number; held: boolean; mode: string }[]): string[] {
  const names: string[] = [];
  const counts = new Map<string, number>();
  for (let i = 0; i < exits.length; i++) {
    const e = exits[i]!;
    if (!exitOpen(e)) continue;
    const n = exitName(e);
    const c = counts.get(n) ?? 0;
    if (c === 0) names.push(n);
    counts.set(n, c + 1);
  }
  return names.map((n) => {
    const c = counts.get(n) ?? 1;
    return c > 1 ? `${n} (${c})` : n;
  });
}

/** Résumé des issues : « Issues : 3 tenues sur 5 — ouvertes : rue X, rue Y ». */
export function exitsSummary(exits: readonly { street: string; edgeId: number; held: boolean; mode: string }[]): string {
  const n = exits.length;
  if (n === 0) return 'Issues : aucune repérée';
  let held = 0;
  let filtered = 0;
  for (let i = 0; i < n; i++) {
    if (!exitOpen(exits[i]!)) held++;
    if (exits[i]!.mode === 'filtrant') filtered++;
  }
  const head = `Issues : ${held} tenue${held > 1 ? 's' : ''} sur ${n}`;
  const filt = filtered > 0 ? ` (dont ${filtered} filtrée${filtered > 1 ? 's' : ''})` : '';
  if (held >= n) return `${head}${filt} — aucune ouverte`;
  return `${head}${filt} — ouverte${n - held > 1 ? 's' : ''} : ${openExitNames(exits).join(', ')}`;
}

/** Effectif « de compte rendu » : arrondi à 10 au-delà de 30, à 50 au-delà de 300, à 100 au-delà de 1 000. */
export function roughCount(n: number): number {
  const v = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  if (v < 30) return v;
  if (v < 300) return Math.round(v / 10) * 10;
  if (v < 1000) return Math.round(v / 50) * 50;
  return Math.round(v / 100) * 100;
}

/** Nombre avec espace insécable des milliers (« 1 200 »). */
function thousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Bandeau d'une nasse fermée : « NASSE FERMÉE — place de la République — environ 350 personnes ». */
export function kettleBanner(k: { place: string; inside: number }): string {
  const n = roughCount(k.inside);
  const place = k.place.trim() !== '' ? k.place.trim() : 'lieu non identifié';
  return `NASSE FERMÉE — ${place} — environ ${thousands(n)} personne${n > 1 ? 's' : ''}`;
}

/**
 * Issue à ouvrir en filtrage dans une nasse fermée : une issue fermée tenue par une unité que le joueur commande
 * (la plus large d'abord : la sortie s'y fait mieux). null si aucune ne convient.
 */
export function pickFilterExit<E extends { held: boolean; squadId: number; mode: string; width: number }>(
  exits: readonly E[], canCommand: (squadId: number) => boolean,
): E | null {
  let best: E | null = null;
  for (let i = 0; i < exits.length; i++) {
    const e = exits[i]!;
    if (e.mode === 'filtrant') return null; // une issue filtrée existe déjà : rien à ouvrir
  }
  for (let i = 0; i < exits.length; i++) {
    const e = exits[i]!;
    if (!e.held || e.squadId <= 0 || !canCommand(e.squadId)) continue;
    if (!best || e.width > best.width) best = e;
  }
  return best;
}
