/* =====================================================================================
 * RENDU DU DÉCOR — plan de l'atlas de textures partagé (logique pure, sans DOM).
 *
 * Une seule texture (2048 × 2048 logiques ; peinte à 1024 en qualité basse) porte :
 *   - les étalages des vitrines par catégorie de commerce, l'intérieur pillé, l'intérieur calciné ;
 *   - les affiches (publicités FICTIVES), les graffitis, les motifs (rideau de fer, contreplaqué,
 *     barreaux de barrière, grillage, filet d'échafaudage, roue de vélo, verre brisé, fissures, suie…) ;
 *   - les pictogrammes (cadran d'horloge, écrans, panneaux de signalisation, croix de pharmacie…) ;
 *   - les cellules d'ENSEIGNE, attribuées à la demande aux commerces proches (72 cellules de 512 × 64).
 * L'alpha de la texture sert de découpe (alphaTest) : 255 = plein, 0 = vide.
 * ===================================================================================== */

/** Côté logique de l'atlas (les rectangles ci-dessous sont exprimés dans cet espace). */
export const ATLAS_SIZE = 2048;

export interface Region {
  /** Rectangle en pixels logiques (origine en haut à gauche, comme le canvas). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Coordonnées de texture (v0 = bas de la région, v1 = haut ; texture retournée comme un CanvasTexture). */
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

function mk(x: number, y: number, w: number, h: number, inset = 1.5): Region {
  return {
    x, y, w, h,
    u0: (x + inset) / ATLAS_SIZE,
    u1: (x + w - inset) / ATLAS_SIZE,
    v1: 1 - (y + inset) / ATLAS_SIZE,
    v0: 1 - (y + h - inset) / ATLAS_SIZE,
  };
}

/** Catégories de commerce qui ont leur propre étalage peint (les autres prennent « autre »). */
export const DISPLAY_CATEGORIES = [
  'mode', 'luxe', 'bijouterie', 'alimentation', 'supermarche', 'cafe_restaurant', 'restauration_rapide', 'pharmacie',
  'tabac_presse', 'telephonie', 'agence', 'banque', 'hotel', 'autre',
] as const;

export const POSTER_COUNT = 8;
export const GRAFFITI_COUNT = 8;

const table: Record<string, Region> = {};

// ── étalages : 2 rangées de 8 cellules de 256 × 192 ──
for (let i = 0; i < DISPLAY_CATEGORIES.length; i++) {
  table['etal_' + DISPLAY_CATEGORIES[i]] = mk((i % 8) * 256, Math.floor(i / 8) * 192, 256, 192);
}
table['etal_pille'] = mk(6 * 256, 192, 256, 192);
table['etal_brule'] = mk(7 * 256, 192, 256, 192);

// ── affiches (128 × 192) puis grands motifs (256 × 192) ──
for (let i = 0; i < POSTER_COUNT; i++) table['affiche_' + i] = mk(i * 128, 384, 128, 192);
table['rideau'] = mk(1024, 384, 256, 192);
table['contreplaque'] = mk(1280, 384, 256, 192);
table['planches'] = mk(1536, 384, 256, 192);
table['store'] = mk(1792, 384, 256, 192);

// ── graffitis (256 × 128, découpés) ──
for (let i = 0; i < GRAFFITI_COUNT; i++) table['tag_' + i] = mk(i * 256, 576, 256, 128);

// ── motifs découpés et décalcomanies de sol ──
table['barreaux'] = mk(0, 704, 256, 128);
table['grillage'] = mk(256, 704, 256, 128);
table['filet'] = mk(512, 704, 128, 128);
table['roue'] = mk(640, 704, 128, 128);
table['verre_bords'] = mk(768, 704, 256, 128);
table['fissures'] = mk(1024, 704, 256, 128);
table['eclats_sol'] = mk(1280, 704, 256, 128);
table['suie'] = mk(1536, 704, 128, 128);
table['dechets'] = mk(1664, 704, 128, 128);
table['paves'] = mk(1792, 704, 128, 128);
table['roue_nue'] = mk(1920, 704, 128, 128);

// ── pictogrammes (64 × 64) ──
const ICONS = [
  'cadran', 'ecran_dab', 'ecran_horo', 'sens_interdit', 'obligation', 'danger', 'stationnement', 'croix_pharma',
  'carotte', 'ecran_borne', 'pieton_rouge', 'pieton_vert', 'ardoise', 'clavier', 'grille_aeration', 'lettres',
];
for (let i = 0; i < ICONS.length; i++) table[ICONS[i]!] = mk(i * 64, 832, 64, 64);
table['plaque_rue'] = mk(1024, 832, 128, 64);
table['hotel'] = mk(1152, 832, 64, 64);
table['texte_flou'] = mk(1216, 832, 256, 64);
table['feuillage'] = mk(1472, 832, 64, 64);
table['osier'] = mk(1536, 832, 64, 64);
table['bois'] = mk(1600, 832, 64, 64);
table['toilettes'] = mk(1664, 832, 128, 64);
/** Pavé blanc opaque : coordonnées de texture de toute la géométrie non texturée. */
table['blanc'] = mk(1984, 832, 64, 64, 16);

export const REGIONS: Readonly<Record<string, Region>> = table;

const WHITE = table['blanc']!;
export const WHITE_U = (WHITE.u0 + WHITE.u1) * 0.5;
export const WHITE_V = (WHITE.v0 + WHITE.v1) * 0.5;

/** Région par nom ; le pavé blanc si le nom est inconnu (jamais d'exception pendant le rendu). */
export function region(name: string): Region {
  return table[name] ?? WHITE;
}

/** Région de l'étalage d'une catégorie de commerce. */
export function displayRegion(category: string): Region {
  return table['etal_' + category] ?? table['etal_autre']!;
}

// ───────────────────────────── cellules d'enseigne ─────────────────────────────

export const SIGN_W = 512;
export const SIGN_H = 64;
export const SIGN_COLS = 4;
export const SIGN_ROWS = 18;
export const SIGN_Y0 = 896;
export const SIGN_CELLS = SIGN_COLS * SIGN_ROWS;

const signRegions: Region[] = [];
for (let i = 0; i < SIGN_CELLS; i++) {
  signRegions.push(mk((i % SIGN_COLS) * SIGN_W, SIGN_Y0 + Math.floor(i / SIGN_COLS) * SIGN_H, SIGN_W, SIGN_H, 2));
}

export function signRegion(cell: number): Region {
  return signRegions[cell] ?? WHITE;
}

/**
 * Attribution des cellules d'enseigne. Une clé (nom + style) occupe une cellule tant qu'au moins un
 * commerce affiché la référence ; libérée, elle reste en cache et n'est reprise (la plus ancienne
 * d'abord) que lorsqu'il n'y a plus de cellule vierge. Aucune allocation après la construction,
 * hormis les entrées de la table des clés.
 */
export class SignAllocator {
  private readonly cellOf = new Map<string, number>();
  private readonly keyOf: (string | null)[];
  private readonly refs: Int32Array;
  /** Date de libération (compteur) des cellules en cache ; -1 = référencée ou vierge. */
  private readonly freedAt: Float64Array;
  private clock = 0;
  private fresh = false;
  private used = 0;

  constructor(readonly cells: number = SIGN_CELLS) {
    this.keyOf = new Array<string | null>(cells).fill(null);
    this.refs = new Int32Array(cells);
    this.freedAt = new Float64Array(cells).fill(-1);
  }

  /** Nombre de cellules référencées par au moins un commerce. */
  get inUse(): number {
    return this.used;
  }

  /** La dernière acquisition a-t-elle attribué une cellule à peindre ? */
  get lastWasFresh(): boolean {
    return this.fresh;
  }

  /** Cellule de cette clé (référence +1) ; -1 s'il n'y a plus de place. */
  acquire(key: string): number {
    this.fresh = false;
    const known = this.cellOf.get(key);
    if (known !== undefined) {
      if (this.refs[known] === 0) {
        this.used++;
        this.freedAt[known] = -1;
      }
      this.refs[known]!++;
      return known;
    }
    // cellule vierge d'abord, sinon la plus anciennement libérée
    let pick = -1;
    let oldest = Infinity;
    for (let i = 0; i < this.cells; i++) {
      if (this.refs[i] !== 0) continue;
      if (this.keyOf[i] === null) {
        pick = i;
        break;
      }
      if (this.freedAt[i]! < oldest) {
        oldest = this.freedAt[i]!;
        pick = i;
      }
    }
    if (pick < 0) return -1;
    const old = this.keyOf[pick];
    if (old !== null && old !== undefined) this.cellOf.delete(old);
    this.keyOf[pick] = key;
    this.cellOf.set(key, pick);
    this.refs[pick] = 1;
    this.freedAt[pick] = -1;
    this.used++;
    this.fresh = true;
    return pick;
  }

  /** Rend une référence. La cellule reste en cache tant qu'elle n'est pas reprise. */
  release(key: string): void {
    const cell = this.cellOf.get(key);
    if (cell === undefined || this.refs[cell] === 0) return;
    this.refs[cell]!--;
    if (this.refs[cell] === 0) {
      this.used--;
      this.freedAt[cell] = this.clock++;
    }
  }

  /** Oublie tout (changement de session ou de qualité : l'atlas est repeint). */
  clear(): void {
    this.cellOf.clear();
    this.keyOf.fill(null);
    this.refs.fill(0);
    this.freedAt.fill(-1);
    this.used = 0;
    this.clock = 0;
  }
}
