/* =====================================================================================
 * DÉCOR DYNAMIQUE — gabarits réalistes des objets du décor.
 *
 * Dimensions : mobilier parisien courant (corbeille de rue, bac roulant de 660 L, barrière de police
 * de 2,5 m, grille de chantier de 3,5 × 2 m, abribus de 4,2 m, « sucette » publicitaire de 2 m²…).
 * Feu : docs/research/00-bible-realisme.md, table G.4 — plastique des bacs (allumage 5 à 10 s,
 * 240 à 600 s, fumée noire), bois et mobilier de terrasse (10 à 20 s, 300 à 480 s, fumée grise),
 * deux-roues à batterie (15 à 30 s, 180 à 360 s, reprises de feu, un extincteur ne suffit pas).
 * Résistances : un coup de marteau vaut 18 points sur un objet, un pavé lancé ≈ 14, la lame d'un
 * engin 100 points par seconde ; le matériau module chaque type de coup (voir MATERIAL_FACTORS).
 * ===================================================================================== */

import type { DamageKind, PropKind } from '@/core/contracts';
import type { PropDef, PropMaterial } from './api';

const BLACK_SMOKE = 0x141414;
const GREY_SMOKE = 0x5a5a5a;
const BATTERY_SMOKE = 0x2a2a2e;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function make(
  kind: string, label: string, halfX: number, halfZ: number, height: number, hp: number, mass: number,
  material: PropMaterial, over: Partial<PropDef> = {},
): PropDef {
  const d: Mutable<PropDef> = {
    kind, label, halfX, halfZ, height, hp, mass, material,
    movable: false, blocksMove: true, blocksSight: false,
    glassHp: 0, panes: 0, glassHigh: false,
    fuel: 0, igniteSeconds: 10, flameRadius: 0.9, flameIntensity: 0.8,
    smokeRate: 0.4, smokeRadius: 1.5, smokeColor: GREY_SMOKE,
    douseNeed: 8, recovery: 0.25, battery: 0,
    burntHeight: 1, burntBlocks: true,
    pushFactor: 1, friction: 6, topple: 'none', toppleSpeed: 2.2, toppleSeconds: 1, toppledBlocks: false,
    brokenBlocks: true, carry: 'non', bulk: 0,
    yieldItem: null, yieldPer: 0, yieldStock: 0, yieldSeconds: 0,
    debris: 0, targetAppeal: 0.1,
  };
  Object.assign(d, over);
  return Object.freeze(d);
}

const LIST: PropDef[] = [
  // ── petit mobilier mobile : la matière première des barricades ──
  make('poubelle', 'la poubelle', 0.22, 0.22, 1.0, 20, 12, 'plastique', {
    movable: true, fuel: 240, igniteSeconds: 6, flameRadius: 0.9, flameIntensity: 0.75, smokeRate: 0.5,
    smokeRadius: 1.6, smokeColor: BLACK_SMOKE, douseNeed: 5, burntHeight: 0.25, burntBlocks: false,
    friction: 4, topple: 'lie', toppleSpeed: 1.8, toppleSeconds: 0.8, toppledBlocks: true, brokenBlocks: false,
    carry: 'roule', bulk: 1, targetAppeal: 0.45,
  }),
  make('conteneur', 'le conteneur', 0.63, 0.39, 1.2, 60, 45, 'plastique', {
    movable: true, fuel: 540, igniteSeconds: 8, flameRadius: 1.4, flameIntensity: 0.95, smokeRate: 0.9,
    smokeRadius: 2.2, smokeColor: BLACK_SMOKE, douseNeed: 8, burntHeight: 0.2, burntBlocks: false,
    pushFactor: 0.75, friction: 2.6, topple: 'lie', toppleSpeed: 3.2, toppleSeconds: 2, toppledBlocks: true,
    brokenBlocks: false, carry: 'roule', bulk: 2, targetAppeal: 0.5,
  }),
  make('barriere_vauban', 'la barrière', 1.25, 0.2, 1.1, 80, 16, 'metal', {
    movable: true, topple: 'flat', toppleSpeed: 2.4, toppleSeconds: 1, carry: 'porte', bulk: 1.5,
    brokenBlocks: false, targetAppeal: 0.3,
  }),
  make('barriere_chantier', 'la barrière de chantier', 1.75, 0.25, 2.0, 60, 22, 'metal', {
    movable: true, fuel: 300, igniteSeconds: 16, flameRadius: 1.0, flameIntensity: 0.5, smokeRate: 0.3,
    smokeColor: GREY_SMOKE, douseNeed: 10, burntBlocks: false, burntHeight: 0.3,
    topple: 'flat', toppleSpeed: 2.2, toppleSeconds: 1.2, carry: 'porte', bulk: 1.5, brokenBlocks: false,
    yieldItem: 'barre', yieldPer: 1, yieldStock: 1, yieldSeconds: 4, targetAppeal: 0.35,
  }),
  make('palette', 'la palette', 0.6, 0.4, 0.15, 40, 22, 'bois', {
    movable: true, blocksMove: false, fuel: 400, igniteSeconds: 14, flameRadius: 1.0, flameIntensity: 0.8,
    smokeRate: 0.35, smokeColor: GREY_SMOKE, douseNeed: 10, burntHeight: 0.4, burntBlocks: false,
    carry: 'porte', bulk: 1, brokenBlocks: false, targetAppeal: 0.3,
  }),
  make('velo', 'le vélo', 0.28, 0.9, 1.05, 30, 26, 'metal', {
    movable: true, fuel: 240, igniteSeconds: 22, flameRadius: 0.9, flameIntensity: 0.7, smokeRate: 0.55,
    smokeColor: BLACK_SMOKE, douseNeed: 9, burntHeight: 0.5, burntBlocks: false, battery: 0.4,
    friction: 5, topple: 'flat', toppleSpeed: 1.4, toppleSeconds: 0.7, carry: 'roule', bulk: 1,
    brokenBlocks: false, targetAppeal: 0.3,
  }),
  make('trottinette', 'la trottinette', 0.22, 0.55, 1.15, 20, 18, 'metal', {
    movable: true, fuel: 200, igniteSeconds: 20, flameRadius: 0.8, flameIntensity: 0.7, smokeRate: 0.5,
    smokeColor: BATTERY_SMOKE, douseNeed: 9, burntHeight: 0.4, burntBlocks: false, battery: 1,
    friction: 5, topple: 'flat', toppleSpeed: 1.2, toppleSeconds: 0.6, carry: 'porte', bulk: 0.7,
    brokenBlocks: false, targetAppeal: 0.3,
  }),
  make('table_terrasse', 'la table', 0.35, 0.35, 0.75, 30, 9, 'bois', {
    movable: true, fuel: 200, igniteSeconds: 12, flameRadius: 0.8, flameIntensity: 0.6, smokeRate: 0.3,
    douseNeed: 6, burntHeight: 0.3, burntBlocks: false, topple: 'lie', toppleSpeed: 1.6, toppleSeconds: 0.6,
    carry: 'porte', bulk: 0.8, brokenBlocks: false, yieldItem: 'bouteille', yieldPer: 1, yieldStock: 2,
    yieldSeconds: 1, targetAppeal: 0.15,
  }),
  make('chaise', 'la chaise', 0.23, 0.25, 0.85, 15, 4, 'bois', {
    movable: true, fuel: 240, igniteSeconds: 10, flameRadius: 0.7, flameIntensity: 0.5, smokeRate: 0.25,
    douseNeed: 4, burntHeight: 0.3, burntBlocks: false, topple: 'lie', toppleSpeed: 1.2, toppleSeconds: 0.4,
    carry: 'porte', bulk: 0.4, brokenBlocks: false, targetAppeal: 0.1,
  }),
  make('cone', 'le cône', 0.18, 0.18, 0.6, 10, 2.5, 'plastique', {
    movable: true, blocksMove: false, fuel: 60, igniteSeconds: 6, flameRadius: 0.5, flameIntensity: 0.3,
    smokeRate: 0.15, smokeColor: BLACK_SMOKE, douseNeed: 2, burntHeight: 0.2, burntBlocks: false,
    topple: 'lie', toppleSpeed: 1, toppleSeconds: 0.3, carry: 'porte', bulk: 0.2, brokenBlocks: false,
  }),
  make('debris', 'les débris', 0.4, 0.4, 0.3, 50, 15, 'pierre', {
    movable: true, blocksMove: false, carry: 'porte', bulk: 0.3, brokenBlocks: false,
    yieldItem: 'pave', yieldPer: 1, yieldStock: 2, yieldSeconds: 1.2,
  }),

  // ── mobilier fixe ──
  make('banc', 'le banc', 1.0, 0.3, 0.8, 150, 90, 'bois', {
    fuel: 360, igniteSeconds: 18, flameRadius: 1.1, flameIntensity: 0.7, smokeRate: 0.35, douseNeed: 10,
    burntHeight: 0.6, debris: 1, targetAppeal: 0.15,
  }),
  make('abribus', "l'abribus", 2.1, 0.8, 2.6, 200, 600, 'metal', {
    glassHp: 220, panes: 4, debris: 1, targetAppeal: 0.8,
  }),
  make('panneau_pub', 'le panneau publicitaire', 0.65, 0.12, 2.7, 80, 180, 'metal', {
    blocksSight: true, glassHp: 60, panes: 2, brokenBlocks: false, debris: 1, targetAppeal: 0.8,
  }),
  make('kiosque', 'le kiosque', 1.5, 1.1, 3.5, 400, 1500, 'composite', {
    blocksSight: true, fuel: 900, igniteSeconds: 14, flameRadius: 2.4, flameIntensity: 1, smokeRate: 1.2,
    smokeRadius: 3, smokeColor: GREY_SMOKE, douseNeed: 40, recovery: 0.6, burntHeight: 0.8, glassHp: 40,
    panes: 2, debris: 2, targetAppeal: 0.5,
  }),
  make('colonne_morris', 'la colonne Morris', 0.7, 0.7, 4.5, 500, 1200, 'composite', {
    blocksSight: true, glassHp: 50, panes: 2, targetAppeal: 0.5,
  }),
  make('potelet', 'le potelet', 0.06, 0.06, 1.0, 200, 12, 'metal', { brokenBlocks: false }),
  make('pile_paves', 'le tas de pavés', 0.5, 0.5, 0.5, 500, 400, 'pierre', {
    yieldItem: 'pave', yieldPer: 2, yieldStock: 60, yieldSeconds: 1.5, targetAppeal: 0.6,
  }),
  make('candelabre', 'le candélabre', 0.12, 0.12, 9.0, 1000, 250, 'metal'),
  make('feu_tricolore', 'le feu tricolore', 0.1, 0.1, 3.5, 300, 90, 'metal', { glassHp: 20, panes: 1, glassHigh: true }),
  make('distributeur', 'le distributeur de billets', 0.45, 0.35, 1.8, 400, 500, 'metal', {
    blocksSight: true, glassHp: 30, panes: 1, targetAppeal: 0.9,
  }),
  make('fontaine_wallace', 'la fontaine Wallace', 0.4, 0.4, 2.7, 2000, 600, 'metal'),
  make('jardiniere', 'la jardinière', 0.75, 0.3, 0.7, 600, 350, 'pierre'),
  make('echafaudage', "l'échafaudage", 4.0, 0.6, 9.0, 800, 1500, 'metal', {
    blocksMove: false, yieldItem: 'barre', yieldPer: 1, yieldStock: 3, yieldSeconds: 5, targetAppeal: 0.4,
  }),
  make('sanisette', 'la sanisette', 1.6, 1.0, 2.6, 1500, 3000, 'composite', { blocksSight: true }),
  make('station_velo', 'la station de vélos', 3.0, 0.9, 1.2, 400, 800, 'metal', { targetAppeal: 0.4 }),

  // ── types propres à la carte (noms de FURNITURE_KINDS sans équivalent dans PropKind) ──
  make('boite_aux_lettres', 'la boîte aux lettres', 0.25, 0.22, 1.4, 250, 60, 'metal'),
  make('arceau_velo', "l'arceau à vélos", 0.45, 0.04, 0.85, 200, 15, 'metal', { brokenBlocks: false }),
  make('panneau', 'le panneau', 0.05, 0.05, 2.8, 120, 20, 'metal', { brokenBlocks: false, debris: 1 }),
  make('statue', 'la statue', 0.8, 0.8, 4.0, 5000, 4000, 'pierre', { blocksSight: true, targetAppeal: 0.2 }),
  make('mat_drapeau', 'le mât', 0.08, 0.08, 8.0, 600, 80, 'metal'),
  make('bouche_incendie', "la bouche d'incendie", 0.15, 0.15, 0.7, 800, 70, 'metal'),
  make('horodateur', "l'horodateur", 0.15, 0.15, 1.6, 180, 60, 'metal', { glassHp: 12, panes: 1, targetAppeal: 0.6 }),
  make('armoire_technique', "l'armoire technique", 0.45, 0.2, 1.4, 350, 120, 'metal', { blocksSight: false }),
  make('colonne_verre', 'la colonne à verre', 0.75, 0.75, 1.7, 400, 300, 'composite', {
    blocksSight: true, yieldItem: 'bouteille', yieldPer: 2, yieldStock: 40, yieldSeconds: 2.5, targetAppeal: 0.5,
  }),
  make('horloge', "l'horloge", 0.1, 0.1, 4.0, 500, 120, 'metal', { glassHp: 15, panes: 1, glassHigh: true }),
  make('camera', 'la caméra', 0.07, 0.07, 5.0, 400, 60, 'metal', { glassHp: 25, panes: 1, glassHigh: true, targetAppeal: 0.6 }),
  make('autre', "l'objet", 0.2, 0.2, 1.0, 120, 30, 'metal'),

  // ── composite : dimensions, résistance et combustible fixés à la formation ──
  make('barricade', 'la barricade', 1.5, 0.6, 1.3, 300, 300, 'composite', {
    blocksSight: true, fuel: 0, igniteSeconds: 10, flameRadius: 1.6, flameIntensity: 1, smokeRate: 1.2,
    smokeRadius: 2.5, smokeColor: BLACK_SMOKE, douseNeed: 12, recovery: 0.4, burntHeight: 0.5, targetAppeal: 0,
  }),
];

const TABLE = new Map<string, PropDef>();
for (const d of LIST) TABLE.set(d.kind, d);

/** Gabarit générique d'un type inconnu (objet léger déplaçable, comme dans le magasin de base). */
const GENERIC: PropDef = make('generique', "l'objet", 0.25, 0.25, 1.0, 50, 15, 'metal', {
  movable: true, carry: 'porte', topple: 'lie', brokenBlocks: false,
});

export const PROP_DEFS: readonly PropDef[] = LIST;

export function propDef(kind: PropKind): PropDef {
  return TABLE.get(kind) ?? GENERIC;
}

/**
 * Effet d'un type de coup sur un matériau (multiplicateur des points de dégâts reçus).
 * Ordre des colonnes : DAMAGE_KINDS.
 */
const DAMAGE_KINDS: readonly DamageKind[] = [
  'impact', 'blunt', 'blast', 'burn', 'gas', 'water', 'bullet', 'vehicle', 'crush', 'fall',
];
const MATERIAL_FACTORS: Record<PropMaterial, readonly number[]> = {
  //            impact blunt blast burn gas water bullet vehicle crush fall
  plastique: [0.5, 0.6, 1.0, 0.6, 0, 0, 0.5, 1.0, 1.0, 0.5],
  metal: [0.2, 0.25, 0.6, 0.05, 0, 0, 0.1, 1.0, 1.0, 0.3],
  bois: [0.5, 0.8, 1.2, 0.6, 0, 0, 0.4, 1.0, 1.0, 0.5],
  verre: [2.5, 2.0, 3.0, 0.3, 0, 0, 3.0, 1.5, 1.5, 2.0],
  pierre: [0.05, 0.05, 0.3, 0, 0, 0, 0.02, 0.5, 1.0, 0.1],
  composite: [0.3, 0.4, 0.8, 0.3, 0, 0, 0.2, 1.0, 1.0, 0.4],
};
const KIND_INDEX = new Map<string, number>();
for (let i = 0; i < DAMAGE_KINDS.length; i++) KIND_INDEX.set(DAMAGE_KINDS[i]!, i);

export function materialFactor(material: PropMaterial, kind: DamageKind): number {
  const i = KIND_INDEX.get(kind);
  return i === undefined ? 1 : MATERIAL_FACTORS[material][i]!;
}

/** Effet d'un type de coup sur un vitrage de mobilier ou de boutique. */
export function glassFactor(kind: DamageKind): number {
  return materialFactor('verre', kind);
}

/**
 * Mobilier de la carte (FURNITURE_KINDS du format de carte) → type d'objet du jeu.
 * Les noms identiques à PropKind passent tels quels ; '' = rien à créer.
 */
export function mapFurnitureKind(kind: string): PropKind | '' {
  if (TABLE.has(kind) && kind !== 'barricade') return kind;
  return kind === '' ? '' : 'autre';
}
