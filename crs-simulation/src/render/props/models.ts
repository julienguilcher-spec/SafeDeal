/* =====================================================================================
 * RENDU DU DÉCOR — bibliothèque des modèles : registre type → constructeur, dérivation des états
 * (endommagé, cassé, en feu, calciné, vitrages brisés un à un) et cache des modèles prêts à instancier.
 * Logique pure (sans DOM ni Three.js) : testée sous Node.
 * ===================================================================================== */

import {
  FX_FIRE, FX_NONE, GeoBuilder, P_ASH, P_BODY, P_FRAGILE, P_LIGHT, P_MELT, P_PANE, P_SHARD, P_SOFT, P_WRECK,
} from './geo';
import type { HaloSpec, Part, Tpl } from './geo';
import { kindInfo, modelFor, MODEL_KEYS } from './mapping';
import type { KindInfo } from './mapping';
import { MeshBuf, hash01 } from './meshbuf';
import * as A from './models-a';
import * as B from './models-b';
import * as M from './models-c';
import type { ModelFn } from './models-a';
import { CENDRE, ROUILLE, SUIE } from './palette';

/** États dérivés d'un modèle (mêmes codes que stateCode() de mapping.ts). */
export const V_INTACT = 0;
export const V_DAMAGED = 1;
export const V_BROKEN = 2;
export const V_BURNING = 3;
export const V_BURNT = 4;

const REGISTRY: Readonly<Record<string, ModelFn>> = {
  poubelle: A.poubelle, conteneur: A.conteneur, barriere_vauban: A.barriere_vauban, barriere_chantier: A.barriere_chantier,
  palette: A.palette, velo: A.velo, trottinette: A.trottinette, table_terrasse: A.table_terrasse, chaise: A.chaise,
  cone: A.cone, debris: A.debris, pile_paves: A.pile_paves,
  banc: B.banc, abribus: B.abribus, panneau_pub: B.panneau_pub, kiosque: B.kiosque, colonne_morris: B.colonne_morris,
  potelet: B.potelet, candelabre: B.candelabre, feu_tricolore: B.feu_tricolore, distributeur: B.distributeur,
  fontaine_wallace: B.fontaine_wallace, jardiniere: B.jardiniere,
  echafaudage: M.echafaudage, sanisette: M.sanisette, station_velo: M.station_velo, boite_aux_lettres: M.boite_aux_lettres,
  arceau_velo: M.arceau_velo, panneau: M.panneau, statue: M.statue, mat_drapeau: M.mat_drapeau,
  bouche_incendie: M.bouche_incendie, horodateur: M.horodateur, armoire_technique: M.armoire_technique,
  colonne_verre: M.colonne_verre, horloge: M.horloge, camera: M.camera, autre: M.autre,
};

/** Le type a-t-il un modèle propre (la barricade est un assemblage, pas un modèle) ? */
export function hasModel(kind: string): boolean {
  return REGISTRY[kind] !== undefined;
}

/** Construit le modèle intact d'un type à un niveau de détail donné. */
export function buildBase(kind: string, lod: number, skin: number): Tpl {
  const key = modelFor(kind);
  const fn = REGISTRY[key] ?? REGISTRY.autre!;
  const b = new GeoBuilder(lod, skin);
  fn(b, lod, skin);
  return b.finish();
}

function keepPart(tag: number, variant: number, panesLeft: number): boolean {
  if (tag >= P_SHARD) return variant === V_BURNT || tag - P_SHARD >= panesLeft;
  if (tag >= P_PANE) return variant !== V_BURNT && tag - P_PANE < panesLeft;
  switch (tag) {
    case P_BODY: case P_MELT: return true;
    case P_SOFT: return variant !== V_BURNT;
    case P_LIGHT: return variant !== V_BROKEN && variant !== V_BURNT;
    case P_ASH: return variant === V_BURNT;
    case P_WRECK: return variant === V_BROKEN;
    case P_FRAGILE: return variant !== V_BROKEN && variant !== V_BURNT;
    default: return true;
  }
}

/** Bruit stable par position (les sommets confondus reçoivent la même valeur). */
function noiseAt(x: number, y: number, z: number, salt: number): number {
  return hash01(Math.round(x * 23) * 73856093 ^ Math.round(y * 23) * 19349663 ^ Math.round(z * 23) * 83492791 ^ salt);
}

/**
 * Dérive l'état `variant` d'un modèle intact : pièces filtrées (vitrages restants, pneus brûlés,
 * lanternes éteintes), couleurs (éraflures, suie), déformation (plastique fondu, cadre tordu, bois
 * effondré, mobilier fixe plié) et lueur d'incendie.
 */
export function deriveVariant(base: Tpl, info: KindInfo, variant: number, panesLeft: number): Tpl {
  const o = new MeshBuf(Math.max(1, base.o.nv), Math.max(1, base.o.ni));
  const g = base.g ? new MeshBuf(Math.max(1, base.g.nv), Math.max(1, base.g.ni)) : null;
  const parts: Part[] = [];
  const meltFrom: number[] = [];
  for (const p of base.parts) {
    if (!keepPart(p.tag, variant, panesLeft)) continue;
    const np: Part = { tag: p.tag, v0: o.nv, v1: 0, i0: o.ni, i1: 0, gv0: g ? g.nv : 0, gv1: 0, gi0: g ? g.ni : 0, gi1: 0 };
    copyRange(o, base.o, p.v0, p.v1, p.i0, p.i1);
    if (g && base.g) copyRange(g, base.g, p.gv0, p.gv1, p.gi0, p.gi1);
    np.v1 = o.nv;
    np.i1 = o.ni;
    np.gv1 = g ? g.nv : 0;
    np.gi1 = g ? g.ni : 0;
    parts.push(np);
    if (p.tag === P_MELT) meltFrom.push(np.v0, np.v1);
  }
  const halos: HaloSpec[] = [];
  if (variant !== V_BURNT && variant !== V_BROKEN) {
    for (const h of base.halos) if (keepPart(h.tag, variant, panesLeft)) halos.push(h);
  }
  const H = info.h;
  const pos = o.pos, col = o.col, fx = o.fx, nrm = o.nrm;

  if (variant === V_DAMAGED || variant === V_BROKEN) {
    // éraflures et salissures ; un objet cassé est plus marqué
    const k = variant === V_BROKEN ? 0.3 : 0.16;
    for (let i = 0; i < o.nv; i++) {
      const n = noiseAt(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!, 11);
      const f = 1 - k * (0.35 + 0.65 * n);
      col[i * 4] = col[i * 4]! * f;
      col[i * 4 + 1] = col[i * 4 + 1]! * f;
      col[i * 4 + 2] = col[i * 4 + 2]! * f;
    }
  }
  if (variant === V_BROKEN && info.topple === 'none') {
    // mobilier fixe : plié au-dessus du pied (objet élancé), sinon simplement déversé
    const slender = info.hx < 0.2 && info.hz < 0.2;
    const pivot = slender ? Math.min(0.5, H * 0.28) : 0.05;
    const angle = slender ? (H > 3 ? 0.42 : 0.95) : 0.07;
    bend(o, pivot, angle);
    if (g) bend(g, pivot, angle);
  }
  if (variant === V_BURNING) {
    // lueur d'incendie plus forte vers le bas, couleurs qui commencent à noircir
    for (let i = 0; i < o.nv; i++) {
      const y = pos[i * 3 + 1]!;
      col[i * 4] = col[i * 4]! * 0.62;
      col[i * 4 + 1] = col[i * 4 + 1]! * 0.55;
      col[i * 4 + 2] = col[i * 4 + 2]! * 0.5;
      if (fx[i * 4] === FX_NONE) {
        const s = 1 - Math.min(1, Math.max(0, y / Math.max(0.4, H))) * 0.7;
        fx[i * 4] = FX_FIRE;
        fx[i * 4 + 1] = Math.round(255 * s);
        fx[i * 4 + 3] = 0;
      }
    }
  }
  if (variant === V_BURNT) {
    const sr = (SUIE >> 16) & 255, sg = (SUIE >> 8) & 255, sb = SUIE & 255;
    const rr = (ROUILLE >> 16) & 255, rg = (ROUILLE >> 8) & 255, rb = ROUILLE & 255;
    const ar = (CENDRE >> 16) & 255, ag = (CENDRE >> 8) & 255, ab = CENDRE & 255;
    const metal = info.burn === 'tord' || info.burn === 'aucune';
    for (const p of parts) {
      const ash = p.tag === P_ASH;
      for (let i = p.v0; i < p.v1; i++) {
        const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
        const n = noiseAt(x, y, z, 5);
        // suie, avec des plaques de rouille (métal) ou de cendre (bois, plastique)
        let tr = sr, tg = sg, tb = sb;
        if (n > 0.72) {
          if (metal) { tr = rr; tg = rg; tb = rb; } else { tr = ar; tg = ag; tb = ab; }
        }
        const keep = ash ? 0.5 : 0.1 + 0.08 * n;
        col[i * 4] = col[i * 4]! * keep + tr * (1 - keep);
        col[i * 4 + 1] = col[i * 4 + 1]! * keep + tg * (1 - keep);
        col[i * 4 + 2] = col[i * 4 + 2]! * keep + tb * (1 - keep);
        fx[i * 4] = FX_NONE;
        fx[i * 4 + 1] = 0;
        fx[i * 4 + 3] = 0;
        if (ash) continue;
        if (info.burn === 'fond' && p.tag === P_MELT) {
          // plastique fondu : affaissé et étalé
          const k = info.burntHeight * (0.7 + 0.6 * noiseAt(x, 0, z, 9));
          const spread = 1 + 0.4 * (1 - Math.min(1, y / H));
          pos[i * 3] = x * spread;
          pos[i * 3 + 1] = y * k;
          pos[i * 3 + 2] = z * spread;
          nrm[i * 3 + 1] = Math.min(127, nrm[i * 3 + 1]! + 70);
        } else if (info.burn === 'tord') {
          // cadre tordu par la chaleur : vrillé, penché, affaissé
          const t = y / Math.max(0.3, H);
          const a = 0.55 * t * t;
          const c = Math.cos(a), s = Math.sin(a);
          const sag = info.burntHeight + (1 - info.burntHeight) * (0.35 + 0.3 * noiseAt(x, 0, z, 3));
          pos[i * 3] = x * c + z * s + 0.22 * H * t * t;
          pos[i * 3 + 1] = y * sag;
          pos[i * 3 + 2] = -x * s + z * c;
          const nx = nrm[i * 3]!, nz = nrm[i * 3 + 2]!;
          nrm[i * 3] = nx * c + nz * s;
          nrm[i * 3 + 2] = -nx * s + nz * c;
        } else if (info.burn === 'charbon') {
          const k = info.burntHeight + (1 - info.burntHeight) * 0.25 * n;
          pos[i * 3] = x + (noiseAt(x, y, z, 21) - 0.5) * 0.05;
          pos[i * 3 + 1] = y * k;
          pos[i * 3 + 2] = z + (noiseAt(x, y, z, 22) - 0.5) * 0.05;
        }
      }
    }
  }
  return { o, g: g && g.nv > 0 ? g : null, parts, halos, tags: variant === V_BURNT ? [] : base.tags };
}

function copyRange(dst: MeshBuf, src: MeshBuf, v0: number, v1: number, i0: number, i1: number): void {
  const nv = v1 - v0;
  if (nv <= 0) return;
  dst.ensure(nv, i1 - i0);
  const base = dst.nv;
  dst.pos.set(src.pos.subarray(v0 * 3, v1 * 3), base * 3);
  dst.nrm.set(src.nrm.subarray(v0 * 3, v1 * 3), base * 3);
  dst.col.set(src.col.subarray(v0 * 4, v1 * 4), base * 4);
  dst.uv.set(src.uv.subarray(v0 * 2, v1 * 2), base * 2);
  dst.fx.set(src.fx.subarray(v0 * 4, v1 * 4), base * 4);
  const d = base - v0;
  let q = dst.ni;
  for (let i = i0; i < i1; i++) dst.idx[q++] = src.idx[i]! + d;
  dst.nv = base + nv;
  dst.ni = q;
}

/** Plie un maillage vers +x au-dessus de la hauteur `pivot` (objet fixe heurté). */
function bend(b: MeshBuf, pivot: number, angle: number): void {
  const c = Math.cos(angle), s = Math.sin(angle);
  for (let i = 0; i < b.nv; i++) {
    const y = b.pos[i * 3 + 1]!;
    if (y <= pivot) continue;
    const x = b.pos[i * 3]!, dy = y - pivot;
    b.pos[i * 3] = x * c + dy * s;
    b.pos[i * 3 + 1] = pivot - x * s + dy * c;
    const nx = b.nrm[i * 3]!, ny = b.nrm[i * 3 + 1]!;
    b.nrm[i * 3] = nx * c + ny * s;
    b.nrm[i * 3 + 1] = -nx * s + ny * c;
  }
}

/**
 * Cache des modèles : (type, niveau de détail, état, variante de couleur, vitrages restants) → modèle.
 * Les modèles sont construits à la première demande ; le cache est partagé par tous les morceaux.
 */
export class ModelLibrary {
  private readonly bases = new Map<number, Tpl>();
  private readonly variants = new Map<number, Tpl>();
  private readonly index = new Map<string, number>();
  /** Nombre de modèles construits (états compris). */
  built = 0;

  constructor() {
    for (let i = 0; i < MODEL_KEYS.length; i++) this.index.set(MODEL_KEYS[i]!, i);
  }

  /** Modèle prêt à instancier. `kind` est un type quelconque (les inconnus prennent le modèle « autre »). */
  get(kind: string, lod: number, variant: number, skin: number, panesLeft: number): Tpl {
    const info = kindInfo(kind);
    const mi = this.index.get(info.model) ?? 0;
    const sk = info.skins > 1 ? ((skin % info.skins) + info.skins) % info.skins : 0;
    const panes = info.panes > 0 ? Math.max(0, Math.min(info.panes, panesLeft)) : 0;
    const baseKey = mi * 64 + lod * 16 + sk;
    const key = baseKey * 64 + variant * 8 + panes;
    let t = this.variants.get(key);
    if (t) return t;
    let base = this.bases.get(baseKey);
    if (!base) {
      base = buildBase(info.model, lod, sk);
      this.bases.set(baseKey, base);
    }
    t = deriveVariant(base, info, variant, panes);
    this.variants.set(key, t);
    this.built++;
    return t;
  }

  clear(): void {
    this.bases.clear();
    this.variants.clear();
    this.built = 0;
  }
}
